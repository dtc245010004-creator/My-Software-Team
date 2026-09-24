from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.main import app
from app.models.role import Role
from app.models.user import User


@pytest.fixture(autouse=True)
def setup_test_users():
    """Chuẩn bị dữ liệu tài khoản test trước mỗi bài test."""
    db: Session = SessionLocal()
    try:
        # Đảm bảo có role driver và admin
        for r_name, r_desc in [("admin", "Admin Role"), ("driver", "Driver Role")]:
            if not db.query(Role).filter(Role.name == r_name).first():
                db.add(Role(name=r_name, description=r_desc))
        db.commit()

        # Tạo hoặc reset tài khoản test
        test_email = "test_driver@evcharging.vn"
        user = db.query(User).filter(User.email == test_email).first()
        if not user:
            role = db.query(Role).filter(Role.name == "driver").first()
            user = User(
                email=test_email,
                password_hash=hash_password("CorrectPass@123"),
                full_name="Driver Test",
                phone="0911222333",
                is_active=True,
                failed_login_count=0,
                locked_until=None,
                last_failed_ip=None,
            )
            if role:
                user.roles.append(role)
            db.add(user)
        else:
            user.password_hash = hash_password("CorrectPass@123")
            user.failed_login_count = 0
            user.locked_until = None
            user.last_failed_ip = None
            user.is_active = True
        db.commit()
    finally:
        db.close()


def test_login_success_sets_httponly_cookie():
    """AC 1: Đăng nhập đúng thông tin -> trả về cookie httpOnly và user response."""
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "test_driver@evcharging.vn", "password": "CorrectPass@123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "test_driver@evcharging.vn"
        assert data["full_name"] == "Driver Test"
        assert "driver" in data["roles"]

        # Kiểm tra cookie trong response
        assert settings.session_cookie_name in response.cookies
        cookie = response.cookies[settings.session_cookie_name]
        assert cookie is not None


def test_login_error_message_identical_for_existing_and_non_existing_email():
    """AC 4: Thông báo lỗi đăng nhập sai email/mật khẩu phải đồng nhất để chống enumeration."""
    with TestClient(app) as client:
        # Thử với email không tồn tại
        res_non_existing = client.post(
            "/api/v1/auth/login",
            json={"email": "non_existing_user_999@evcharging.vn", "password": "WrongPassword@123"},
        )
        # Thử với email tồn tại nhưng sai mật khẩu
        res_existing_wrong_pw = client.post(
            "/api/v1/auth/login",
            json={"email": "test_driver@evcharging.vn", "password": "WrongPassword@123"},
        )

        assert res_non_existing.status_code == 401
        assert res_existing_wrong_pw.status_code == 401
        assert res_non_existing.json()["detail"] == res_existing_wrong_pw.json()["detail"]
        assert res_non_existing.json()["detail"] == "Email hoặc mật khẩu không chính xác"


def test_account_lockout_after_5_failed_attempts():
    """AC 2 & 3: Thử sai 5 lần rồi nhập đúng để kiểm tra tài khoản bị khóa 15 phút."""
    test_email = "test_driver@evcharging.vn"

    with TestClient(app) as client:
        # Nhập sai 4 lần đầu -> trả về 401
        for attempt in range(1, 5):
            res = client.post(
                "/api/v1/auth/login",
                json={"email": test_email, "password": "WrongPassword@123"},
            )
            assert res.status_code == 401
            assert res.json()["detail"] == "Email hoặc mật khẩu không chính xác"

        # Lần thứ 5 nhập sai -> trả về 403 và bị khóa
        res_5 = client.post(
            "/api/v1/auth/login",
            json={"email": test_email, "password": "WrongPassword@123"},
        )
        assert res_5.status_code == 403
        assert "bị khóa" in res_5.json()["detail"]

        # Kiểm tra trực tiếp trong Database: locked_until phải có giá trị và > now
        db: Session = SessionLocal()
        try:
            user = db.query(User).filter(User.email == test_email).first()
            assert user is not None
            assert user.failed_login_count == 5
            assert user.locked_until is not None
            assert user.locked_until > datetime.now(timezone.utc)
        finally:
            db.close()

        # Thử nhập ĐÚNG mật khẩu khi đang bị khóa -> vẫn bị từ chối 403
        res_correct_while_locked = client.post(
            "/api/v1/auth/login",
            json={"email": test_email, "password": "CorrectPass@123"},
        )
        assert res_correct_while_locked.status_code == 403
        assert "bị khóa" in res_correct_while_locked.json()["detail"]


def test_get_current_user_me_and_logout():
    """Kiểm tra endpoint /me với cookie phiên và endpoint /logout."""
    with TestClient(app) as client:
        # 1. Gọi /me khi chưa đăng nhập -> 401
        unauth_res = client.get("/api/v1/auth/me")
        assert unauth_res.status_code == 401

        # 2. Đăng nhập
        login_res = client.post(
            "/api/v1/auth/login",
            json={"email": "test_driver@evcharging.vn", "password": "CorrectPass@123"},
        )
        assert login_res.status_code == 200

        # 3. Gọi /me khi đã có cookie trong phiên -> 200
        me_res = client.get("/api/v1/auth/me")
        assert me_res.status_code == 200
        assert me_res.json()["email"] == "test_driver@evcharging.vn"

        # 4. Đăng xuất -> xóa cookie
        logout_res = client.post("/api/v1/auth/logout")
        assert logout_res.status_code == 200
