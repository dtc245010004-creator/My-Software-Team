from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt
from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerifyMismatchError

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
    except (VerifyMismatchError, InvalidHashError):
        return False


def create_access_token(
    data: Dict[str, Any], expires_delta: Optional[timedelta] = None
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


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Giải mã và kiểm tra tính hợp lệ của JWT token."""
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.jwt_algorithm]
        )
        return payload
    except jwt.PyJWTError:
        return None
