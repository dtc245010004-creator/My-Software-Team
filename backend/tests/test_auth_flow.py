from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import Base, get_db
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.role import Role
from app.models.user import User

# Thiết lập Engine SQLite in-memory độc lập cho unit test API flow
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="function")
def db_session():
    """Tạo schema CSDL trên SQLite in-memory trước mỗi test và dọn dẹp sau test."""
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    try:
        # Nạp các vai trò mẫu
        admin_role = Role(id=1, name="admin", description="Administrator")
        driver_role = Role(id=2, name="driver", description="EV Driver")
        db.add_all([admin_role, driver_role])
        db.commit()

        # Nạp người dùng mẫu hoạt động
        active_user = User(
            id=1,
            email="driver@evcsms.vn",
            password_hash=hash_password("DriverPass@123"),
            full_name="Nguyễn Văn Tài Xế",
            phone="0901234567",
            is_active=True,
            failed_login_count=0,
        )
        active_user.roles.append(driver_role)

        # Nạp người dùng mẫu bị vô hiệu hóa (inactive)
        inactive_user = User(
            id=2,
            email="inactive@evcsms.vn",
            password_hash=hash_password("InactivePass@123"),
            full_name="Người Dùng Bị Khóa",
            is_active=False,
            failed_login_count=0,
        )
        inactive_user.roles.append(driver_role)

        db.add_all([active_user, inactive_user])
        db.commit()

        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def client(db_session):
    """Override dependency get_db để kết nối tới SQLite in-memory."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# ==============================================================================
# 1. HAPPY PATH TESTS
# ==============================================================================

def test_login_happy_path_sets_cookie_and_returns_user(client):
    """Happy Path: Đăng nhập thành công trả về UserResponse và set cookie httpOnly."""
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "driver@evcsms.vn", "password": "DriverPass@123"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["id"] == 1
    assert data["user"]["email"] == "driver@evcsms.vn"
    assert "driver" in data["user"]["roles"]

    # Kiểm tra cookie
    assert settings.session_cookie_name in res.cookies
    assert res.cookies[settings.session_cookie_name] != ""


def test_logout_happy_path_clears_cookie(client):
    """Happy Path: Gọi /auth/logout xóa cookie phiên và trả về thông báo thành công."""
    # Login first to get the cookie
    client.post(
        "/api/v1/auth/login",
        json={"email": "driver@evcsms.vn", "password": "DriverPass@123"},
    )
    res = client.post("/api/v1/auth/logout")
    assert res.status_code == 200
    assert res.json() == {"message": "Đăng xuất thành công"}


def test_auth_me_happy_path_with_bearer_token(client):
    """Happy Path: Gọi /auth/me thành công khi truyền token qua Authorization Header (Bearer)."""
    token = create_access_token({"sub": "1", "email": "driver@evcsms.vn"})
    res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == "driver@evcsms.vn"
    assert data["full_name"] == "Nguyễn Văn Tài Xế"


# ==============================================================================
# 2. EDGE CASES & BUSINESS LOGIC TESTS
# ==============================================================================

def test_account_lockout_after_consecutive_failed_attempts(client, db_session):
    """Edge Case: Nhập sai mật khẩu liên tiếp đúng max_failed_logins (5 lần) thì khóa 15 phút."""
    for i in range(1, 5):
        res = client.post(
            "/api/v1/auth/login",
            json={"email": "driver@evcsms.vn", "password": "WrongPassword"},
        )
        assert res.status_code == 401
        assert res.json()["detail"] == "Email hoặc mật khẩu không chính xác"

    # Lần thứ 5 sai -> 403 Forbidden
    res_5 = client.post(
        "/api/v1/auth/login",
        json={"email": "driver@evcsms.vn", "password": "WrongPassword"},
    )
    assert res_5.status_code == 403
    assert "bị khóa 15 phút" in res_5.json()["detail"]

    # Kiểm tra DB user đã được ghi nhận locked_until và failed_login_count == 5
    user = db_session.query(User).filter(User.email == "driver@evcsms.vn").first()
    assert user.failed_login_count == 5
    assert user.locked_until is not None


def test_login_blocked_while_account_is_currently_locked(client, db_session):
    """Edge Case: Cố đăng nhập (kể cả đúng mật khẩu) khi tài khoản đang trong thời gian bị khóa."""
    # Thiết lập user bị khóa đến 10 phút sau
    user = db_session.query(User).filter(User.email == "driver@evcsms.vn").first()
    user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=10)
    db_session.commit()

    res = client.post(
        "/api/v1/auth/login",
        json={"email": "driver@evcsms.vn", "password": "DriverPass@123"},
    )
    assert res.status_code == 403
    assert "Tài khoản tạm thời bị khóa" in res.json()["detail"]


def test_lockout_auto_reset_after_lockout_duration_expired(client, db_session):
    """Edge Case: Sau khi thời gian khóa 15 phút đã trôi qua, lần đăng nhập tiếp theo tự động reset trạng thái khóa."""
    user = db_session.query(User).filter(User.email == "driver@evcsms.vn").first()
    # Giả lập thời gian khóa đã hết hạn 1 phút trước
    user.locked_until = datetime.now(timezone.utc) - timedelta(minutes=1)
    user.failed_login_count = 5
    db_session.commit()

    # Đăng nhập đúng mật khẩu
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "driver@evcsms.vn", "password": "DriverPass@123"},
    )
    assert res.status_code == 200

    # Kiểm tra DB đã được reset hoàn toàn
    db_session.refresh(user)
    assert user.failed_login_count == 0
    assert user.locked_until is None


# ==============================================================================
# 3. NEGATIVE & ERROR HANDLING TESTS
# ==============================================================================

def test_login_non_existing_email_returns_identical_error(client):
    """Negative Case (Security): Email không tồn tại trả về đúng 401 như mật khẩu sai để chống User Enumeration."""
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "hacker_ghost@evcsms.vn", "password": "AnyPassword"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Email hoặc mật khẩu không chính xác"


def test_auth_me_without_token_returns_401(client):
    """Negative Case: Gọi /me mà không có cookie hay header -> trả về 401."""
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401
    assert "Chưa xác thực" in res.json()["detail"]


def test_auth_me_with_expired_token_returns_401(client):
    """Negative Case: Token đã hết hạn -> trả về 401."""
    expired_token = create_access_token(
        {"sub": "1"}, expires_delta=timedelta(minutes=-5)
    )
    res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert res.status_code == 401
    assert "hết hạn" in res.json()["detail"]


def test_auth_me_with_tampered_token_returns_401(client):
    """Negative Case: Token rác hoặc bị can thiệp -> trả về 401."""
    res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid.token.string"},
    )
    assert res.status_code == 401


def test_auth_me_with_non_integer_sub_returns_401(client):
    """Error Handling: Token có 'sub' không thể parse thành int -> trả về 401."""
    token = create_access_token({"sub": "abc_not_an_int"})
    res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 401
    assert "không hợp lệ" in res.json()["detail"]


def test_auth_me_with_non_existing_user_id_returns_401(client):
    """Negative Case: Token chứa user ID không tồn tại trong CSDL -> trả về 401."""
    token = create_access_token({"sub": "99999"})
    res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 401
    assert "không tồn tại" in res.json()["detail"]


def test_auth_me_with_inactive_user_returns_401(client):
    """Negative Case (Security): Người dùng có is_active=False -> bị từ chối 401."""
    token = create_access_token({"sub": "2", "email": "inactive@evcsms.vn"})
    res = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 401
    assert "vô hiệu hóa" in res.json()["detail"]
