from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.rbac import roles
from app.core.security import create_access_token, hash_password, verify_password
from app.models.role import Role
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])

DEFAULT_REGISTER_ROLE = "driver"


def _get_or_create_role(db: Session, role_name: str) -> Role:
    """Tìm role theo tên, tạo mới nếu chưa tồn tại (chỉ dùng cho role 'driver')."""
    role = db.query(Role).filter(Role.name == role_name).first()
    if role:
        return role
    role = Role(name=role_name, description="Tài xế sạc xe điện")
    db.add(role)
    db.flush()
    return role


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@roles("public")
def register(
    payload: RegisterRequest,
    db: Annotated[Session, Depends(get_db)],
) -> Any:
    """Đăng ký tài khoản customer (mặc định role=driver). Không cấp admin/operator."""
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email đã được sử dụng. Vui lòng chọn email khác.",
        )

    role = _get_or_create_role(db, DEFAULT_REGISTER_ROLE)
    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        is_active=True,
        failed_login_count=0,
    )
    user.roles.append(role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=LoginResponse)
@roles("public")
def login(
    login_data: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> Any:
    """Xử lý đăng nhập, khóa tài khoản khi sai 5 lần, tạo cookie phiên httpOnly."""
    client_ip = (
        request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )
    now = datetime.now(timezone.utc)

    user = (
        db.query(User)
        .options(joinedload(User.roles))
        .filter(User.email == login_data.email)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không chính xác",
        )

    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    locked_until = (
        _as_utc(user.locked_until) if user.locked_until is not None else None
    )

    if locked_until and locked_until > now:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản tạm thời bị khóa do nhập sai nhiều lần. Vui lòng thử lại sau.",
        )

    if locked_until and locked_until <= now:
        user.failed_login_count = 0
        user.locked_until = None

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

    user.failed_login_count = 0
    user.locked_until = None
    user.last_failed_ip = None
    db.commit()
    db.refresh(user)

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

    return LoginResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.post("/logout")
@roles("authenticated")
def logout(response: Response) -> Any:
    """Đăng xuất, xóa cookie phiên."""
    response.delete_cookie(key=settings.session_cookie_name)
    return {"message": "Đăng xuất thành công"}


@router.get("/me", response_model=UserResponse)
@roles("authenticated")
def get_me(current_user: Annotated[User, Depends(get_current_user)]) -> Any:
    """Lấy thông tin tài khoản người dùng hiện tại đang đăng nhập."""
    return current_user