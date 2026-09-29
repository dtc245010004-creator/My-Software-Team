<<<<<<< Updated upstream
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
=======
from unittest.mock import patch
from app.models.user import User
from app.models.auth import Role, UserRole
>>>>>>> Stashed changes


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

<<<<<<< Updated upstream
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
=======
    # Kiểm tra trực tiếp trong DB
    user = db_session.query(User).filter(User.username == "driver_vn01").first()
    assert user is not None
    assert user.wallet is not None
    assert float(user.wallet.balance) == 0.0
    assert db_session.query(Role).count() == 5
    assert db_session.query(UserRole).filter_by(user_id=user.id).count() == 1
>>>>>>> Stashed changes


def test_login_success_sets_httponly_cookie():
    """AC 1: Đăng nhập đúng thông tin -> trả về cookie httpOnly và user response."""
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "test_driver@evcharging.vn", "password": "CorrectPass@123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["email"] == "test_driver@evcharging.vn"
        assert data["user"]["full_name"] == "Driver Test"
        assert "driver" in data["user"]["roles"]

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

<<<<<<< Updated upstream
        # 3. Gọi /me khi đã có cookie trong phiên -> 200
        me_res = client.get("/api/v1/auth/me")
        assert me_res.status_code == 200
        assert me_res.json()["email"] == "test_driver@evcharging.vn"

        # 4. Đăng xuất -> xóa cookie
        logout_res = client.post("/api/v1/auth/logout")
        assert logout_res.status_code == 200
=======
def test_register_accepts_password_longer_than_72_bytes(client, db_session):
    """6. Argon2id chấp nhận mật khẩu dài hơn giới hạn 72 bytes của bcrypt."""
    long_password = "A" * 70 + "1" + "B" * 10  # 81 bytes
    payload = {
        "username": "long_pass_user",
        "email": "long@example.com",
        "password": long_password,
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    user = db_session.query(User).filter(User.username == "long_pass_user").first()
    assert user.password_hash.startswith("$argon2id$")


def test_register_password_lacks_digits_or_letters(client):
    """7. Mật khẩu không thỏa mãn độ phức tạp (thiếu số hoặc thiếu chữ) -> HTTP 422."""
    # Thiếu số
    res1 = client.post(
        "/api/v1/auth/register",
        json={"username": "no_digit_user", "email": "d1@test.com", "password": "OnlyLettersPass"},
    )
    assert res1.status_code == 422
    assert "phải chứa ít nhất một chữ số" in res1.text

    # Thiếu chữ cái
    res2 = client.post(
        "/api/v1/auth/register",
        json={"username": "no_letter_user", "email": "l1@test.com", "password": "1234567890"},
    )
    assert res2.status_code == 422
    assert "phải chứa ít nhất một chữ cái" in res2.text


def test_register_response_excludes_password_hash(client):
    """8. Khẳng định response /register và /me tuyệt đối không rò rỉ password_hash."""
    payload = {
        "username": "security_test_user",
        "email": "sec@example.com",
        "password": "Password123",
    }
    # Test endpoint register
    res_reg = client.post("/api/v1/auth/register", json=payload)
    assert res_reg.status_code == 201
    data_reg = res_reg.json()
    assert "password_hash" not in data_reg
    assert "password" not in data_reg

    # Test login và endpoint /me
    res_login = client.post(
        "/api/v1/auth/login",
        json={"username": "security_test_user", "password": "Password123"},
    )
    assert "access_token" not in res_login.json()
    assert "httponly" in res_login.headers["set-cookie"].lower()
    res_me = client.get("/api/v1/auth/me")
    assert res_me.status_code == 200
    data_me = res_me.json()
    assert "password_hash" not in data_me
    assert "password" not in data_me


def test_register_rejects_client_supplied_role(client, db_session):
    """9. Chặn Privilege Escalation: Client gửi kèm role 'ADMIN' thì user vẫn chỉ mang role 'CUSTOMER'."""
    payload = {
        "username": "hacker_wannabe",
        "email": "hacker@example.com",
        "password": "Password123",
        "role": "ADMIN",  # Cố tình nạp quyền ADMIN
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["role"] == "CUSTOMER"

    # Kiểm tra trực tiếp bản ghi trong DB
    user = db_session.query(User).filter(User.username == "hacker_wannabe").first()
    assert user.role == "CUSTOMER"


def test_login_wrong_credentials(client):
    """10. Đăng nhập sai tài khoản hoặc sai mật khẩu -> HTTP 401 Unauthorized."""
    # Đăng ký tài khoản mẫu
    client.post(
        "/api/v1/auth/register",
        json={"username": "login_victim", "email": "victim@test.com", "password": "Password123"},
    )

    # Thử sai mật khẩu
    res_wrong_pw = client.post(
        "/api/v1/auth/login",
        json={"username": "login_victim", "password": "WrongPassword999"},
    )
    assert res_wrong_pw.status_code == 401
    assert res_wrong_pw.json()["detail"] == "Email hoặc mật khẩu không đúng."

    # Thử tài khoản không tồn tại
    res_wrong_user = client.post(
        "/api/v1/auth/login",
        json={"username": "non_existent_user", "password": "Password123"},
    )
    assert res_wrong_user.status_code == 401
    assert res_wrong_user.json()["detail"] == res_wrong_pw.json()["detail"]


def test_login_success_and_get_me(client):
    """11. Đăng nhập đúng nhận Token -> Dùng token gọi /me lấy thông tin và số dư ví."""
    client.post(
        "/api/v1/auth/register",
        json={"username": "valid_user", "email": "valid@test.com", "password": "Password123"},
    )

    # Đăng nhập bằng email hoặc tên đăng nhập cũ trong thời gian chuyển đổi.
    res_login = client.post(
        "/api/v1/auth/login",
        json={"email": "valid@test.com", "password": "Password123"},
    )
    assert res_login.status_code == 200
    token_data = res_login.json()
    assert "access_token" not in token_data
    assert token_data["token_type"] == "cookie"
    assert "httponly" in res_login.headers["set-cookie"].lower()

    # Gọi /me
    res_me = client.get("/api/v1/auth/me")
    assert res_me.status_code == 200
    me_data = res_me.json()
    assert me_data["username"] == "valid_user"
    assert me_data["wallet_balance"] == 0.0

    # Gọi /me với token giả mạo -> 401
    res_invalid = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer fake.token.here"})
    assert res_invalid.status_code == 401


def test_login_locks_account_after_five_failed_attempts(client):
    client.post(
        "/api/v1/auth/register",
        json={"username": "locked_user", "email": "locked@example.com", "password": "Password123"},
    )
    for _ in range(5):
        failed = client.post(
            "/api/v1/auth/login",
            json={"email": "locked@example.com", "password": "WrongPassword123"},
        )
        assert failed.status_code == 401

    blocked = client.post(
        "/api/v1/auth/login",
        json={"email": "locked@example.com", "password": "Password123"},
    )
    assert blocked.status_code == 429


def test_api_route_without_access_policy_is_denied(client):
    from fastapi.routing import APIRoute
    from app.main import app

    app.add_api_route("/api/v1/_sprint1_unclassified", lambda: {"ok": True}, methods=["GET"])
    route = next(route for route in reversed(app.router.routes) if isinstance(route, APIRoute) and route.path == "/api/v1/_sprint1_unclassified")
    try:
        response = client.get("/api/v1/_sprint1_unclassified")
        assert response.status_code == 403
        assert response.json()["detail"] == "Route chưa khai báo quyền truy cập."
    finally:
        app.router.routes.remove(route)


def test_rbac_forbidden_for_insufficient_role(client, db_session):
    """12. Phân quyền RBAC: Customer truy cập route ADMIN -> HTTP 403 Forbidden. Cập nhật role trong DB -> Truy cập ngay lập tức."""
    # 1. Đăng ký tài khoản thường (CUSTOMER)
    client.post(
        "/api/v1/auth/register",
        json={"username": "standard_driver", "email": "driver_rbac@test.com", "password": "Password123"},
    )
    res_login = client.post(
        "/api/v1/auth/login",
        json={"username": "standard_driver", "password": "Password123"},
    )
    assert res_login.status_code == 200

    # 2. CUSTOMER cố truy cập endpoint ADMIN -> 403 Forbidden
    res_admin = client.get(
        "/api/v1/auth/test-admin-access",
    )
    assert res_admin.status_code == 403
    assert "Thao tác bị từ chối" in res_admin.json()["detail"]

    # 3. Nâng quyền user trong CSDL thành ADMIN
    user = db_session.query(User).filter(User.username == "standard_driver").first()
    user.role = "ADMIN"
    db_session.commit()

    # 4. Gọi lại ngay bằng cookie hiện tại -> 200 OK (quyền được đọc lại từ DB).
    res_admin_updated = client.get(
        "/api/v1/auth/test-admin-access",
    )
    assert res_admin_updated.status_code == 200
    assert "Xin chào Quản trị viên standard_driver" in res_admin_updated.json()["message"]
>>>>>>> Stashed changes
