from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.rbac import roles
from app.models.user import User

router = APIRouter(
    prefix="/admin/users",
    tags=["Admin - Users"],
)


class RoleUpdate(BaseModel):
    role: str


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
