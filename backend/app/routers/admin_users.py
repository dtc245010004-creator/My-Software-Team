from datetime import datetime, timedelta, timezone
import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.rbac import roles
from app.core.security import get_password_hash
from app.models.user import User

router = APIRouter(
    prefix="/admin/users",
    tags=["Admin - Users"],
)


class RoleUpdate(BaseModel):
    role: str


class PasswordResetPayload(BaseModel):
    new_password: str = Field(..., min_length=8, description="Mật khẩu mới")

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Mật khẩu phải có độ dài tối thiểu 8 ký tự.")
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Mật khẩu quá dài (tối đa 72 bytes).")
        if not re.search(r"[A-Za-z]", v):
            raise ValueError("Mật khẩu phải chứa ít nhất một chữ cái.")
        if not re.search(r"\d", v):
            raise ValueError("Mật khẩu phải chứa ít nhất một chữ số.")
        return v


class BatchPasswordResetPayload(BaseModel):
    new_password: str = Field(..., min_length=8, description="Mật khẩu mới áp dụng chung")
    role: str = Field(default="ALL", description="Vai trò áp dụng (ALL, CUSTOMER, OPERATOR, ...)")
    exclude_self: bool = Field(default=True, description="Không đổi mật khẩu của chính tài khoản Admin đang thực hiện")

    @field_validator("new_password")
    @classmethod
    def validate_batch_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Mật khẩu phải có độ dài tối thiểu 8 ký tự.")
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Mật khẩu quá dài (tối đa 72 bytes).")
        if not re.search(r"[A-Za-z]", v):
            raise ValueError("Mật khẩu phải chứa ít nhất một chữ cái.")
        if not re.search(r"\d", v):
            raise ValueError("Mật khẩu phải chứa ít nhất một chữ số.")
        return v


# Các tài khoản mặc định được bảo vệ
PROTECTED_DEFAULT_USERS = {
    "admin",
}


def is_protected_default_user(user: User) -> bool:
    username = (user.username or "").strip().lower()
    return username in PROTECTED_DEFAULT_USERS


@router.get("")
@roles("ADMIN")
def list_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    users = db.query(User).order_by(User.id).all()

    now = datetime.now(timezone.utc)

    result = []

    for user in users:
        locked_until = user.locked_until

        if locked_until is not None and locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)

        is_locked = locked_until is not None and locked_until > now

        result.append(
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role,
                "is_active": user.is_active,
                "is_locked": is_locked,
                "locked_until": locked_until,
            }
        )

    return result


@router.patch("/{user_id}/role")
@roles("ADMIN")
def update_user_role(
    user_id: int,
    payload: RoleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_roles = {
        "ADMIN",
        "OPERATOR",
        "OWNER",
        "DRIVER",
        "CUSTOMER",
        "ACCOUNTANT",
    }

    next_role = payload.role.upper()

    if next_role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vai trò không hợp lệ.",
        )

    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy tài khoản.",
        )

    # Không cho thay đổi vai trò tài khoản mặc định
    if is_protected_default_user(user):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể thay đổi vai trò của tài khoản mặc định.",
        )

    # Không cho ADMIN tự thay đổi vai trò của chính mình
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể thay đổi vai trò của chính tài khoản đang đăng nhập.",
        )

    user.role = next_role

    db.commit()
    db.refresh(user)

    return {
        "message": "Cập nhật vai trò thành công.",
        "user_id": user.id,
        "role": user.role,
    }


@router.patch("/{user_id}/disable")
@roles("ADMIN")
def disable_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy tài khoản.",
        )

    # Không cho khóa tài khoản mặc định
    if is_protected_default_user(user):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể khóa tài khoản mặc định.",
        )

    # Không cho tự khóa chính mình
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể tự khóa tài khoản đang đăng nhập.",
        )

    user.is_active = False

    db.commit()

    return {
        "message": "Đã khóa tài khoản.",
        "user_id": user.id,
    }


@router.patch("/{user_id}/enable")
@roles("ADMIN")
def enable_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy tài khoản.",
        )

    user.is_active = True

    db.commit()

    return {
        "message": "Đã mở khóa tài khoản.",
        "user_id": user.id,
    }


@router.patch("/{user_id}/lock-login")
@roles("ADMIN")
def lock_login(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy tài khoản.",
        )

    # Không cho khóa đăng nhập tài khoản mặc định
    if is_protected_default_user(user):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể khóa đăng nhập của tài khoản mặc định.",
        )

    # Không cho tự khóa đăng nhập của chính mình
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể tự khóa đăng nhập của chính mình.",
        )

    now = datetime.now(timezone.utc)

    user.locked_until = now + timedelta(minutes=15)

    db.commit()

    return {
        "message": "Đã khóa đăng nhập 15 phút.",
        "user_id": user.id,
        "locked_until": user.locked_until,
    }


@router.patch("/{user_id}/unlock-login")
@roles("ADMIN")
def unlock_login(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy tài khoản.",
        )

    user.locked_until = None
    user.failed_login_attempts = 0

    db.commit()

    return {
        "message": "Đã mở khóa đăng nhập.",
        "user_id": user.id,
    }


@router.patch("/{user_id}/password")
@roles("ADMIN")
def update_user_password(
    user_id: int,
    payload: PasswordResetPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin đặt lại mật khẩu cho một tài khoản cụ thể."""
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy tài khoản.",
        )

    user.password_hash = get_password_hash(payload.new_password)
    user.failed_login_attempts = 0
    user.locked_until = None

    db.commit()

    return {
        "message": f"Đã đổi mật khẩu thành công cho tài khoản {user.username}.",
        "user_id": user.id,
        "username": user.username,
    }


@router.post("/batch-reset-password")
@roles("ADMIN")
def batch_reset_passwords(
    payload: BatchPasswordResetPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin đổi mật khẩu hàng loạt / toàn bộ người dùng trong hệ thống."""
    query = db.query(User)

    target_role = (payload.role or "ALL").strip().upper()
    if target_role != "ALL":
        query = query.filter(User.role == target_role)

    if payload.exclude_self:
        query = query.filter(User.id != current_user.id)

    target_users = query.all()

    if not target_users:
        return {
            "message": "Không tìm thấy người dùng nào phù hợp với bộ lọc.",
            "count": 0,
        }

    new_hash = get_password_hash(payload.new_password)
    for u in target_users:
        u.password_hash = new_hash
        u.failed_login_attempts = 0
        u.locked_until = None

    db.commit()

    return {
        "message": f"Đã đổi mật khẩu thành công cho {len(target_users)} người dùng.",
        "count": len(target_users),
    }
