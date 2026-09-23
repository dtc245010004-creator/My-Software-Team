from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

# ==============================================================================
# 1. KIỂM THỬ HÀM BĂM MẬT KHẨU (hash_password)
# ==============================================================================

def test_hash_password_returns_valid_argon2id_hash():
    """Happy Path: Mật khẩu thông thường được băm theo đúng chuẩn Argon2id."""
    raw_pass = "SecureP@ssword2026"
    hashed = hash_password(raw_pass)

    assert isinstance(hashed, str)
    assert hashed.startswith("$argon2id$")
    assert raw_pass not in hashed


def test_hash_password_generates_unique_salt():
    """Edge Case: Cùng một mật khẩu khi băm 2 lần phải sinh ra 2 chuỗi hash khác nhau do salt ngẫu nhiên."""
    raw_pass = "IdenticalPass#999"
    hash1 = hash_password(raw_pass)
    hash2 = hash_password(raw_pass)

    assert hash1 != hash2
    assert hash1.startswith("$argon2id$")
    assert hash2.startswith("$argon2id$")


def test_hash_password_handles_empty_string():
    """Edge Case: Cho phép băm chuỗi rỗng và sinh ra chuỗi hash Argon2id hợp lệ."""
    empty_pass = ""
    hashed = hash_password(empty_pass)

    assert isinstance(hashed, str)
    assert hashed.startswith("$argon2id$")
    assert verify_password(empty_pass, hashed) is True


def test_hash_password_handles_unicode_characters():
    """Edge Case: Xử lý chính xác mật khẩu chứa ký tự tiếng Việt có dấu và emoji."""
    unicode_pass = "TrạmSạcXeĐiện_HàNội_🔋⚡2026"
    hashed = hash_password(unicode_pass)

    assert hashed.startswith("$argon2id$")
    assert verify_password(unicode_pass, hashed) is True


def test_hash_password_handles_long_string():
    """Edge Case: Xử lý mật khẩu độ dài cực lớn (1000 ký tự) không bị crash."""
    long_pass = "A" * 1000
    hashed = hash_password(long_pass)

    assert hashed.startswith("$argon2id$")
    assert verify_password(long_pass, hashed) is True


# ==============================================================================
# 2. KIỂM THỬ XÁC THỰC MẬT KHẨU (verify_password)
# ==============================================================================

def test_verify_password_returns_true_for_correct_password():
    """Happy Path: Khớp đúng mật khẩu và chuỗi hash -> trả về True."""
    password = "CorrectPass@123"
    hashed = hash_password(password)

    assert verify_password(password, hashed) is True


def test_verify_password_returns_false_for_wrong_password():
    """Negative Case: Mật khẩu sai so với hash -> trả về False."""
    password = "CorrectPass@123"
    wrong_password = "WrongPass@123"
    hashed = hash_password(password)

    assert verify_password(wrong_password, hashed) is False


def test_verify_password_is_case_sensitive():
    """Edge Case: Phân biệt chính xác chữ hoa và chữ thường."""
    password = "CaseSensitivePassword"
    hashed = hash_password(password)

    assert verify_password("casesensitivepassword", hashed) is False
    assert verify_password("CASESENSITIVEPASSWORD", hashed) is False


def test_verify_password_returns_false_for_corrupted_hash():
    """Error Handling: Chuỗi hash bị sai định dạng hoặc không phải Argon2id -> trả về False (không văng lỗi)."""
    password = "SamplePassword"
    corrupted_hashes = [
        "not_a_valid_hash",
        "$pbkdf2-sha256$29000$randomsalt$randomhash",
        "$argon2id$v=19$m=corrupted_parameters",
        "123456789",
    ]
    for bad_hash in corrupted_hashes:
        assert verify_password(password, bad_hash) is False


def test_verify_password_returns_false_for_empty_hash():
    """Edge Case: Hash rỗng -> trả về False mà không văng Exception."""
    assert verify_password("MyPassword", "") is False


# ==============================================================================
# 3. KIỂM THỬ TẠO JWT ACCESS TOKEN (create_access_token)
# ==============================================================================

def test_create_access_token_with_default_expiration():
    """Happy Path: Sinh token với thời gian hết hạn mặc định từ cấu hình."""
    payload = {"sub": "101", "email": "user@evcsms.vn", "role": "cpo"}
    token = create_access_token(data=payload)

    assert isinstance(token, str)
    decoded = jwt.decode(
        token, settings.secret_key, algorithms=[settings.jwt_algorithm]
    )
    assert decoded["sub"] == "101"
    assert decoded["email"] == "user@evcsms.vn"
    assert decoded["role"] == "cpo"
    assert "iat" in decoded
    assert "exp" in decoded

    # Kiểm tra delta thời gian xấp xỉ settings.access_token_expire_minutes
    exp_time = datetime.fromtimestamp(decoded["exp"], tz=timezone.utc)
    iat_time = datetime.fromtimestamp(decoded["iat"], tz=timezone.utc)
    diff_minutes = (exp_time - iat_time).total_seconds() / 60
    assert abs(diff_minutes - settings.access_token_expire_minutes) < 1


def test_create_access_token_with_custom_expiration():
    """Edge Case: Sinh token với thời gian hết hạn tùy biến (expires_delta)."""
    custom_delta = timedelta(minutes=15)
    payload = {"sub": "202"}
    token = create_access_token(data=payload, expires_delta=custom_delta)

    decoded = jwt.decode(
        token, settings.secret_key, algorithms=[settings.jwt_algorithm]
    )
    exp_time = datetime.fromtimestamp(decoded["exp"], tz=timezone.utc)
    iat_time = datetime.fromtimestamp(decoded["iat"], tz=timezone.utc)
    diff_minutes = (exp_time - iat_time).total_seconds() / 60
    assert abs(diff_minutes - 15) < 1


def test_create_access_token_preserves_nested_data():
    """Edge Case: Bảo toàn các trường dữ liệu tùy chỉnh trong payload."""
    payload = {
        "sub": "user_303",
        "permissions": ["station:read", "station:write"],
        "metadata": {"tenant_id": "cpo_hn_01"},
    }
    token = create_access_token(data=payload)
    decoded = jwt.decode(
        token, settings.secret_key, algorithms=[settings.jwt_algorithm]
    )

    assert decoded["permissions"] == ["station:read", "station:write"]
    assert decoded["metadata"]["tenant_id"] == "cpo_hn_01"


# ==============================================================================
# 4. KIỂM THỬ GIẢI MÃ JWT ACCESS TOKEN (decode_access_token)
# ==============================================================================

def test_decode_access_token_success_for_valid_token():
    """Happy Path: Giải mã thành công token hợp lệ và trả về dict payload."""
    payload = {"sub": "555", "email": "admin@evcsms.vn"}
    token = create_access_token(payload)

    decoded = decode_access_token(token)
    assert decoded is not None
    assert decoded["sub"] == "555"
    assert decoded["email"] == "admin@evcsms.vn"


def test_decode_access_token_returns_none_for_expired_token():
    """Edge Case / Negative Case: Token đã quá hạn -> trả về None (không crash)."""
    # Tạo token hết hạn 10 phút trước
    past_delta = timedelta(minutes=-10)
    payload = {"sub": "999"}
    expired_token = create_access_token(payload, expires_delta=past_delta)

    decoded = decode_access_token(expired_token)
    assert decoded is None


def test_decode_access_token_returns_none_for_tampered_payload():
    """Negative Case: Token bị can thiệp sửa đổi nội dung payload -> trả về None."""
    payload = {"sub": "1", "email": "normal_user@ev.vn"}
    token = create_access_token(payload)

    parts = token.split(".")
    # Thay đổi 1 ký tự trong payload
    tampered_payload = parts[1][:-1] + ("A" if parts[1][-1] != "A" else "B")
    tampered_token = f"{parts[0]}.{tampered_payload}.{parts[2]}"

    assert decode_access_token(tampered_token) is None


def test_decode_access_token_returns_none_for_tampered_signature():
    """Negative Case: Token bị can thiệp vào chữ ký -> trả về None."""
    payload = {"sub": "1"}
    token = create_access_token(payload)

    parts = token.split(".")
    # Thay đổi ký tự đầu tiên của chữ ký để làm hỏng chữ ký mật mã (tránh rơi vào padding bit ở cuối base64)
    tampered_sig_char = "X" if parts[2][0] != "X" else "Y"
    tampered_signature = tampered_sig_char + parts[2][1:]
    tampered_token = f"{parts[0]}.{parts[1]}.{tampered_signature}"

    assert decode_access_token(tampered_token) is None


def test_decode_access_token_returns_none_for_malformed_string():
    """Error Handling: Chuỗi token hoàn toàn không phải JWT -> trả về None."""
    malformed_tokens = [
        "",
        "not.a.token",
        "random-string-without-dots",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",  # Chỉ có 1 phần
    ]
    for bad_token in malformed_tokens:
        assert decode_access_token(bad_token) is None


def test_decode_access_token_returns_none_for_wrong_secret_key():
    """Negative Case: Token được ký bằng secret key khác -> trả về None."""
    other_secret = "another-secret-key-different-from-config-123456"
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {"sub": "1", "exp": now + timedelta(minutes=60), "iat": now},
        other_secret,
        algorithm="HS256",
    )

    assert decode_access_token(token) is None
