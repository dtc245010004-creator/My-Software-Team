import pytest
from unittest.mock import patch
from app.models.user import User
from app.models.wallet import Wallet
from app.core.security import get_password_hash


def test_register_success_creates_wallet_atomically(client, db_session):
    """1. Đăng ký thành công -> User và Wallet (balance=0) được tạo đồng thời."""
    payload = {
        "username": "driver_vn01",
        "email": "driver01@example.com",
        "password": "Password123",
        "full_name": "Tài Xế Điện 01",
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "driver_vn01"
    assert data["email"] == "driver01@example.com"
    assert data["role"] == "CUSTOMER"
    assert data["wallet_balance"] == 0.0
    assert "id" in data

    # Kiểm tra trực tiếp trong DB
    user = db_session.query(User).filter(User.username == "driver_vn01").first()
    assert user is not None
    assert user.wallet is not None
    assert float(user.wallet.balance) == 0.0


def test_register_atomicity_rollback_on_wallet_failure(client, db_session):
    """2. Kiểm tra tính toàn vẹn Atomic: Nếu lỗi khi tạo Wallet, User phải được rollback sạch sẽ."""
    payload = {
        "username": "crash_test_user",
        "email": "crashtest@example.com",
        "password": "Password123",
    }

    # Giả lập lỗi ném ra khi khởi tạo Wallet
    with patch("app.api.v1.endpoints.auth.Wallet", side_effect=RuntimeError("Mô phỏng lỗi CSDL khi tạo Ví")):
        response = client.post("/api/v1/auth/register", json=payload)
        assert response.status_code == 500
        assert "Lỗi hệ thống khi khởi tạo tài khoản và ví điện tử" in response.json()["detail"]

    # Khẳng định không có User rác nào tồn tại trong DB
    user = db_session.query(User).filter(User.username == "crash_test_user").first()
    assert user is None
    assert db_session.query(User).count() == 0


def test_register_duplicate_username(client):
    """3. Đăng ký trùng username -> Trả về HTTP 400 Bad Request."""
    payload1 = {
        "username": "ev_user_same",
        "email": "user1@example.com",
        "password": "Password123",
    }
    payload2 = {
        "username": "ev_user_same",
        "email": "user2@example.com",
        "password": "Password123",
    }
    res1 = client.post("/api/v1/auth/register", json=payload1)
    assert res1.status_code == 201

    res2 = client.post("/api/v1/auth/register", json=payload2)
    assert res2.status_code == 400
    assert "Tên đăng nhập đã tồn tại" in res2.json()["detail"]


def test_register_duplicate_email(client):
    """4. Đăng ký trùng email -> Trả về HTTP 400 Bad Request."""
    payload1 = {
        "username": "ev_user_alpha",
        "email": "common@example.com",
        "password": "Password123",
    }
    payload2 = {
        "username": "ev_user_beta",
        "email": "common@example.com",
        "password": "Password123",
    }
    res1 = client.post("/api/v1/auth/register", json=payload1)
    assert res1.status_code == 201

    res2 = client.post("/api/v1/auth/register", json=payload2)
    assert res2.status_code == 400
    assert "Email đã tồn tại" in res2.json()["detail"]


def test_register_password_too_short(client):
    """5. Mật khẩu ngắn hơn 8 ký tự -> HTTP 422 Unprocessable Entity."""
    payload = {
        "username": "short_pass_user",
        "email": "short@example.com",
        "password": "Pass1",  # Chỉ 5 ký tự
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422
    assert "độ dài tối thiểu 8 ký tự" in response.text


def test_register_password_exceeds_72_bytes(client):
    """6. Mật khẩu vượt quá 72 bytes (giới hạn cứng của bcrypt) -> HTTP 422."""
    long_password = "A" * 70 + "1" + "B" * 10  # 81 bytes
    payload = {
        "username": "long_pass_user",
        "email": "long@example.com",
        "password": long_password,
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422
    assert "giới hạn tối đa 72 bytes" in response.text


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
    token = res_login.json()["access_token"]
    res_me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
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
    """10. Đăng nhập sai thông tin: email có/không tồn tại trả CÙNG mã 401 và CÙNG nội dung."""
    # Đăng ký tài khoản mẫu
    client.post(
        "/api/v1/auth/register",
        json={"username": "login_victim", "email": "victim@test.com", "password": "Password123"},
    )

    # Thử sai mật khẩu trên tài khoản có thật
    res_wrong_pw = client.post(
        "/api/v1/auth/login",
        json={"username": "victim@test.com", "password": "WrongPassword999"},
    )
    assert res_wrong_pw.status_code == 401
    assert res_wrong_pw.json()["detail"] == "Email hoặc mật khẩu không đúng"
    assert "Còn lại" not in res_wrong_pw.json()["detail"]

    # Thử tài khoản không tồn tại
    res_wrong_user = client.post(
        "/api/v1/auth/login",
        json={"username": "non_existent@test.com", "password": "Password123"},
    )
    assert res_wrong_user.status_code == 401
    assert res_wrong_user.json()["detail"] == "Email hoặc mật khẩu không đúng"
    # Hai phản hồi giống hệt nhau
    assert res_wrong_pw.json() == res_wrong_user.json()


def test_login_success_and_get_me(client):
    """11. Đăng nhập đúng nhận Token -> Dùng token gọi /me lấy thông tin và số dư ví."""
    client.post(
        "/api/v1/auth/register",
        json={"username": "valid_user", "email": "valid@test.com", "password": "Password123"},
    )

    # Đăng nhập bằng email hoặc username
    res_login = client.post(
        "/api/v1/auth/login",
        json={"username": "valid_user", "password": "Password123"},
    )
    assert res_login.status_code == 200
    token_data = res_login.json()
    assert "access_token" in token_data
    assert token_data["token_type"] == "bearer"
    token = token_data["access_token"]

    # Gọi /me
    res_me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res_me.status_code == 200
    me_data = res_me.json()
    assert me_data["username"] == "valid_user"
    assert me_data["wallet_balance"] == 0.0

    # Gọi /me với token giả mạo -> 401
    res_invalid = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer fake.token.here"})
    assert res_invalid.status_code == 401


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
    token = res_login.json()["access_token"]

    # 2. CUSTOMER cố truy cập endpoint ADMIN -> 403 Forbidden
    res_admin = client.get(
        "/api/v1/auth/test-admin-access",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_admin.status_code == 403
    assert "Thao tác bị từ chối" in res_admin.json()["detail"]

    # 3. Nâng quyền user trong CSDL thành ADMIN
    user = db_session.query(User).filter(User.username == "standard_driver").first()
    user.role = "ADMIN"
    db_session.commit()

    # 4. Gọi lại ngay bằng token cũ -> 200 OK (Chứng minh Backend kiểm tra DB tức thì, không bị trễ quyền!)
    res_admin_updated = client.get(
        "/api/v1/auth/test-admin-access",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_admin_updated.status_code == 200
    assert "Xin chào Quản trị viên standard_driver" in res_admin_updated.json()["message"]


def test_login_debt_locked_shows_error(client, db_session):
    """13. Tài khoản bị khóa nợ (is_debt_locked = True) -> Chặn đăng nhập với thông báo rõ ràng."""
    from decimal import Decimal
    # Tạo user và ví bị khóa nợ do âm quá 300k
    u = User(
        username="debt_locked_user",
        email="debt_locked@test.com",
        password_hash=get_password_hash("Password123"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add(u)
    db_session.flush()

    w = Wallet(
        user_id=u.id,
        balance=Decimal("-350000.00"),
        is_debt_locked=True,
    )
    db_session.add(w)
    db_session.commit()

    # Thử đăng nhập
    res = client.post(
        "/api/v1/auth/login",
        json={"username": "debt_locked_user", "password": "Password123"},
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "tài khoản bị khóa vì - quá 300k"


def test_login_wrong_password_increments_attempts_without_leaking(client, db_session):
    """14. Đăng nhập sai mật khẩu -> Tăng failed_count trong login_attempts nhưng không tiết lộ số lần thử."""
    from app.models.user import LoginAttempt
    client.post(
        "/api/v1/auth/register",
        json={"username": "lockout_user_1", "email": "lockout1@test.com", "password": "Password123"},
    )

    res = client.post(
        "/api/v1/auth/login",
        json={"username": "lockout1@test.com", "password": "WrongPassword1"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Email hoặc mật khẩu không đúng"

    attempt = db_session.query(LoginAttempt).filter(LoginAttempt.email == "lockout1@test.com").first()
    assert attempt is not None
    assert attempt.failed_count == 1
    assert attempt.locked_until is None


def test_login_lockout_at_6th_attempt_for_existent_and_non_existent_emails(client, db_session):
    """15. Nhập sai 5 lần, lần thứ 6 bị khóa 15 phút (HTTP 429) cho cả email có và không tồn tại."""
    client.post(
        "/api/v1/auth/register",
        json={"username": "lockout_user_2", "email": "lockout2@test.com", "password": "Password123"},
    )

    # 1. Với email có tồn tại: sai 5 lần đầu nhận 401
    for i in range(1, 6):
        res = client.post(
            "/api/v1/auth/login",
            json={"username": "lockout2@test.com", "password": f"WrongPassword{i}"},
        )
        assert res.status_code == 401
        assert res.json()["detail"] == "Email hoặc mật khẩu không đúng"

    # Lần thứ 6 -> Bị khóa 15 phút, trả 429
    res_6th = client.post(
        "/api/v1/auth/login",
        json={"username": "lockout2@test.com", "password": "WrongPassword6"},
    )
    assert res_6th.status_code == 429
    assert "Retry-After" in res_6th.headers
    assert res_6th.json()["retry_after_seconds"] > 0
    assert "Tài khoản bị tạm khóa 15 phút do nhập sai quá 5 lần" in res_6th.json()["detail"]

    # 2. Với email KHÔNG tồn tại: sai 5 lần đầu nhận 401
    for i in range(1, 6):
        res = client.post(
            "/api/v1/auth/login",
            json={"username": "ghost_user@test.com", "password": f"WrongPassword{i}"},
        )
        assert res.status_code == 401
        assert res.json()["detail"] == "Email hoặc mật khẩu không đúng"

    # Lần thứ 6 với email không tồn tại -> CŨNG bị khóa 429 cùng nội dung và headers
    res_ghost_6th = client.post(
        "/api/v1/auth/login",
        json={"username": "ghost_user@test.com", "password": "WrongPassword6"},
    )
    assert res_ghost_6th.status_code == 429
    assert "Retry-After" in res_ghost_6th.headers
    assert res_ghost_6th.json()["retry_after_seconds"] > 0
    assert "Tài khoản bị tạm khóa 15 phút do nhập sai quá 5 lần" in res_ghost_6th.json()["detail"]


def test_login_blocked_during_lockout_even_with_correct_password(client, db_session):
    """16. Trong thời gian bị khóa, kể cả nhập đúng mật khẩu vẫn bị chặn với HTTP 429."""
    client.post(
        "/api/v1/auth/register",
        json={"username": "lockout_user_3", "email": "lockout3@test.com", "password": "Password123"},
    )

    # Nhập sai 5 lần đầu
    for _ in range(5):
        client.post(
            "/api/v1/auth/login",
            json={"username": "lockout3@test.com", "password": "WrongPassword"},
        )

    # Lần 6 thử đăng nhập lại với mật khẩu ĐÚNG -> Vẫn bị khóa 429!
    res_correct_6th = client.post(
        "/api/v1/auth/login",
        json={"username": "lockout3@test.com", "password": "Password123"},
    )
    assert res_correct_6th.status_code == 429
    assert "Retry-After" in res_correct_6th.headers
    assert "Tài khoản bị tạm khóa 15 phút" in res_correct_6th.json()["detail"]


def test_login_auto_unlock_after_lockout_duration(client, db_session):
    """17. Sau khi hết thời gian khóa tạm -> Tự động mở khóa khi đăng nhập đúng."""
    from datetime import timedelta
    from app.core.datetime_utils import get_utc_now
    from app.models.user import LoginAttempt

    client.post(
        "/api/v1/auth/register",
        json={"username": "lockout_user_4", "email": "lockout4@test.com", "password": "Password123"},
    )

    # Giả lập bản ghi login_attempts bị khóa trong quá khứ (đã hết hạn khóa 2 phút trước)
    attempt = LoginAttempt(
        email="lockout4@test.com",
        failed_count=5,
        locked_until=get_utc_now() - timedelta(minutes=2),
    )
    db_session.add(attempt)
    db_session.commit()

    # Đăng nhập với mật khẩu đúng
    res = client.post(
        "/api/v1/auth/login",
        json={"username": "lockout4@test.com", "password": "Password123"},
    )
    assert res.status_code == 200
    assert "access_token" in res.json()

    # Kiểm tra DB: Đã reset về 0 và xóa locked_until
    db_session.refresh(attempt)
    assert attempt.failed_count == 0
    assert attempt.locked_until is None


def test_login_parallel_requests_does_not_overshoot(client):
    """18. Kiểm tra gửi yêu cầu đăng nhập song song: không bị race condition."""
    from concurrent.futures import ThreadPoolExecutor

    def send_failed_login(i):
        return client.post(
            "/api/v1/auth/login",
            json={"username": "parallel_user@test.com", "password": f"WrongPass{i}"},
        ).status_code

    with ThreadPoolExecutor(max_workers=8) as executor:
        status_codes = list(executor.map(send_failed_login, range(10)))

    # Chỉ có mã 401 hoặc 429, không có 500 lỗi hệ thống
    for code in status_codes:
        assert code in (401, 429)
    # Phải có ít nhất một yêu cầu nhận 429 vì đã vượt ngưỡng 5 lần
    assert 429 in status_codes


