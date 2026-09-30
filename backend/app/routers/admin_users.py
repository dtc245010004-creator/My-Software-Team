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


@router.get("")
@roles("ADMIN")
def list_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    users = (
        db.query(User)
        .order_by(User.id)
        .all()
    )

    return [
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
            "is_locked": (
                user.locked_until is not None
                and user.locked_until > datetime.now(timezone.utc)
            ),
            "failed_login_attempts": user.failed_login_attempts,
            "locked_until": user.locked_until,
        }
        for user in users
    ]

class RoleUpdateRequest(BaseModel):
    role: str


@router.patch("/{user_id}/role")
@roles("ADMIN")
def update_user_role(
    user_id: int,
    data: RoleUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed_roles = {
        "ADMIN",
        "OPERATOR",
        "OWNER",
        "DRIVER",
        "CUSTOMER",
    }

    new_role = data.role.upper()

    if new_role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vai trò không hợp lệ",
        )

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy tài khoản",
        )

    if current_user.id == user_id and new_role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể tự đổi role ADMIN của chính mình",
        )

    user.role = new_role
    db.commit()
    db.refresh(user)

    return {
        "message": "Đã cập nhật vai trò",
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
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể tự khóa tài khoản admin đang đăng nhập",
        )

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy tài khoản",
        )

    user.is_active = False
    db.commit()

    return {
        "message": "Đã khóa tài khoản",
        "user_id": user.id,
    }


@router.patch("/{user_id}/enable")
@roles("ADMIN")
def enable_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy tài khoản",
        )

    user.is_active = True
    db.commit()

    return {
        "message": "Đã mở khóa tài khoản",
        "user_id": user.id,
    }


@router.patch("/{user_id}/lock-login")
@roles("ADMIN")
def lock_login(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể tự khóa đăng nhập của chính mình",
        )

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy tài khoản",
        )

    now = datetime.now(timezone.utc)
    user.locked_until = now + timedelta(minutes=15)

    db.commit()

    return {
        "message": "Đã khóa đăng nhập 15 phút",
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
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy tài khoản",
        )

    user.locked_until = None
    user.failed_login_attempts = 0

    db.commit()

    return {
        "message": "Đã mở khóa đăng nhập",
        "user_id": user.id,
    }
