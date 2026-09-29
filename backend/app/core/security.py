from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
<<<<<<< Updated upstream
from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import settings

# Khởi tạo PasswordHasher với thuật toán argon2id
ph = PasswordHasher(type=Type.ID)


def hash_password(password: str) -> str:
    """Băm mật khẩu sử dụng thuật toán argon2id."""
    return ph.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    """Kiểm tra mật khẩu khớp với chuỗi băm argon2id."""
    try:
        return ph.verify(hashed_password, password)
    except (VerifyMismatchError, InvalidHashError, VerificationError):
=======
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from app.core.config import settings

password_hasher = PasswordHasher()


def get_password_hash(password: str) -> str:
    """Băm mật khẩu bằng Argon2id; bcrypt chỉ được dùng để xác minh dữ liệu cũ."""
    return password_hasher.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Xác thực hash Argon2id hoặc bcrypt cũ trong giai đoạn chuyển đổi."""
    try:
        if hashed_password.startswith("$argon2"):
            return password_hasher.verify(hashed_password, plain_password)
        if hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except (InvalidHashError, VerificationError, VerifyMismatchError, ValueError):
>>>>>>> Stashed changes
        return False
    return False


def password_needs_rehash(hashed_password: str) -> bool:
    """Báo hash bcrypt cũ cần được nâng cấp sau lần đăng nhập thành công."""
    if not hashed_password.startswith("$argon2"):
        return True
    try:
        return password_hasher.check_needs_rehash(hashed_password)
    except (InvalidHashError, ValueError):
        return True


def create_access_token(
    data: dict[str, Any], expires_delta: timedelta | None = None
) -> str:
    """Tạo JWT access token chứa payload data."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.access_token_expire_minutes)

    to_encode.update({"iat": now, "exp": expire})
    return jwt.encode(
        to_encode, settings.secret_key, algorithm=settings.jwt_algorithm
    )


def decode_access_token(
    token: str, *, raise_on_expired: bool = False
) -> dict[str, Any] | None:
    """Giải mã và kiểm tra tính hợp lệ của JWT token."""
    try:
        return jwt.decode(
            token, settings.secret_key, algorithms=[settings.jwt_algorithm]
        )
    except jwt.ExpiredSignatureError:
        if raise_on_expired:
            raise
        return None
    except jwt.PyJWTError:
        return None
