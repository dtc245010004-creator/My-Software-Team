from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=UserResponse)
def login(
    login_data: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> Any:
    """Xử lý đăng nhập, khóa tài khoản khi sai 5 lần, tạo cookie phiên httpOnly."""
    client_ip = (
        request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )
    now = datetime.now(timezone.utc)

    # Tìm người dùng theo email
    user = (
        db.query(User)
        .options(joinedload(User.roles))
        .filter(User.email == login_data.email)
        .first()
    )

    # Lỗi chung chung khi không tìm thấy email để tránh tiết lộ thông tin
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không chính xác",
        )

    # Kiểm tra tài khoản có đang bị khóa tạm thời không
    if user.locked_until and user.locked_until > now:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản tạm thời bị khóa do nhập sai nhiều lần. Vui lòng thử lại sau.",
        )

    # Nếu đã hết thời gian khóa tạm thời, reset số lần sai
    if user.locked_until and user.locked_until <= now:
        user.failed_login_count = 0
        user.locked_until = None

    # Kiểm tra mật khẩu
    if not verify_password(login_data.password, user.password_hash):
        user.failed_login_count += 1
        user.last_failed_ip = client_ip

        if user.failed_login_count >= settings.max_failed_logins:
            user.locked_until = now + timedelta(
                minutes=settings.lockout_duration_minutes
            )
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tài khoản tạm thời bị khóa 15 phút do nhập sai 5 lần liên tiếp.",
            )

        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không chính xác",
        )

    # Đăng nhập thành công: reset số lần sai và thời gian khóa
    user.failed_login_count = 0
    user.locked_until = None
    user.last_failed_ip = None
    db.commit()
    db.refresh(user)

    # Tạo JWT token và set cookie httpOnly
    token = create_access_token(
        data={"sub": str(user.id), "email": user.email}
    )
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        max_age=settings.access_token_expire_minutes * 60,
        samesite="lax",
        secure=False,
    )

    return user


@router.post("/logout")
def logout(response: Response) -> Any:
    """Đăng xuất, xóa cookie phiên."""
    response.delete_cookie(key=settings.session_cookie_name)
    return {"message": "Đăng xuất thành công"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)) -> Any:
    """Lấy thông tin tài khoản người dùng hiện tại đang đăng nhập."""
    return current_user
