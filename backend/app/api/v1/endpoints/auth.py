import logging
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.core.config import settings
from app.core.security import (
    create_access_token,
    get_password_hash,
    password_needs_rehash,
    verify_password,
)
from app.models.auth import LoginThrottle
from app.models.user import User
from app.models.wallet import Wallet
from app.schemas.user import TokenResponse, UserLogin, UserRegister, UserResponse
from app.services.rbac_service import assign_user_role

logger = logging.getLogger("ev_csms.auth")

router = APIRouter(prefix="/auth", tags=["Authentication & RBAC"])
LOGIN_FAILURE_LIMIT = 5
LOGIN_LOCK_MINUTES = 15
LOGIN_FAILURE_WINDOW = timedelta(minutes=15)
SESSION_COOKIE_NAME = "ev_csms_session"
DUMMY_PASSWORD_HASH = get_password_hash("not-a-real-account-password-4937")


def _digest(value: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).hexdigest()


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _throttle_state(db: Session, subject_type: str, subject_hash: str) -> LoginThrottle:
    state = (
        db.query(LoginThrottle)
        .filter(
            LoginThrottle.subject_type == subject_type,
            LoginThrottle.subject_hash == subject_hash,
        )
        .with_for_update()
        .first()
    )
    if state is None:
        state = LoginThrottle(subject_type=subject_type, subject_hash=subject_hash)
        db.add(state)
        db.flush()
    return state


def _is_locked(state: LoginThrottle, now: datetime) -> bool:
    return bool(state.locked_until and _utc(state.locked_until) > now)


def _record_login_failure(db: Session, states: list[LoginThrottle], now: datetime) -> None:
    for state in states:
        window_started = _utc(state.window_started_at) if state.window_started_at else None
        if window_started is None or now - window_started >= LOGIN_FAILURE_WINDOW:
            state.failed_attempts = 0
            state.window_started_at = now
            state.locked_until = None
        state.failed_attempts += 1
        if state.failed_attempts >= LOGIN_FAILURE_LIMIT:
            state.locked_until = now + timedelta(minutes=LOGIN_LOCK_MINUTES)
    db.commit()


def _clear_login_failures(states: list[LoginThrottle], db: Session) -> None:
    for state in states:
        state.failed_attempts = 0
        state.window_started_at = None
        state.locked_until = None
    db.commit()


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Đăng ký tài khoản khách hàng mới kèm tạo ví điện tử tự động",
)
def register(
    user_in: UserRegister,
    db: Session = Depends(get_db),
):
    """
    Đăng ký người dùng mới:
    - Bắt buộc gán role='CUSTOMER' (chống tấn công privilege escalation / mass assignment).
    - Thực hiện bọc trong 1 Transaction nguyên tử (Atomic): Tạo User + Tạo Wallet (balance=0).
    - Tự động rollback nếu có bất kỳ lỗi nào xảy ra.
    """
    # 1. Kiểm tra sớm trùng lặp username hoặc email
    existing_user = (
        db.query(User)
        .filter((User.username == user_in.username) | (User.email == user_in.email))
        .first()
    )
    if existing_user:
        if existing_user.username == user_in.username:
            detail = "Tên đăng nhập đã tồn tại trong hệ thống."
        else:
            detail = "Email đã tồn tại trong hệ thống."
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        )

    # 2. Bọc transaction nguyên tử tạo User và Wallet
    try:
        new_user = User(
            username=user_in.username,
            email=user_in.email,
            password_hash=get_password_hash(user_in.password),
            full_name=user_in.full_name,
            role="CUSTOMER",  # Luôn mặc định gán cứng CUSTOMER cho người dùng tự đăng ký
            is_active=True,
        )
        db.add(new_user)
        db.flush()  # Sinh new_user.id
        assign_user_role(db, new_user, new_user.role)

        new_wallet = Wallet(
            user_id=new_user.id,
            balance=0.00,
            currency="VND",
        )
        db.add(new_wallet)
        db.commit()
        db.refresh(new_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Xung đột dữ liệu: Tên đăng nhập hoặc email đã tồn tại.",
        )
    except Exception:
        db.rollback()
        logger.error("Lỗi hệ thống khi tạo tài khoản và ví điện tử.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Lỗi hệ thống khi khởi tạo tài khoản và ví điện tử.",
        )

    wallet_balance = float(new_user.wallet.balance) if new_user.wallet else 0.0
    return UserResponse(
        id=new_user.id,
        username=new_user.username,
        email=new_user.email,
        full_name=new_user.full_name,
        role=new_user.role,
        is_active=new_user.is_active,
        created_at=new_user.created_at,
        wallet_balance=wallet_balance,
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Đăng nhập tài khoản và nhận JWT access token",
)
def login(
    login_in: UserLogin,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Xác thực người dùng bằng username/email và mật khẩu.
    Trả về JWT Bearer token kèm thông tin cơ bản của người dùng.
    """
    identifier = login_in.identifier.strip()
    user = db.query(User).filter(User.email.ilike(identifier)).first()
    if user is None and login_in.username:
        user = db.query(User).filter(User.username == identifier).first()

    account_key = f"user:{user.id}" if user else f"identifier:{identifier.casefold()}"
    client_ip = request.client.host if request.client else "unknown"
    now = datetime.now(timezone.utc)
    states = []
    if user:
        states.append(_throttle_state(db, "account", _digest(account_key)))
    states.append(_throttle_state(db, "ip", _digest(f"ip:{client_ip}")))
    db.commit()

    if any(_is_locked(state, now) for state in states):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Đăng nhập tạm bị khóa. Vui lòng thử lại sau 15 phút.",
        )

    valid_password = verify_password(login_in.password, user.password_hash if user else DUMMY_PASSWORD_HASH)
    if not user or not valid_password:
        _record_login_failure(db, states, now)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không đúng.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản người dùng đã bị vô hiệu hóa.",
        )

    _clear_login_failures(states, db)
    if password_needs_rehash(user.password_hash):
        user.password_hash = get_password_hash(login_in.password)
        db.commit()

    # Cấp access token nhúng sub (user.id) và role
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role}
    )
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        path="/",
    )

    wallet_balance = float(user.wallet.balance) if user.wallet else 0.0
    user_response = UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        wallet_balance=wallet_balance,
    )

    return TokenResponse(
        token_type="cookie",
        user=user_response,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Đăng xuất tài khoản")
def logout(response: Response):
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Lấy thông tin tài khoản đang đăng nhập kèm số dư ví",
)
def get_me(
    current_user: User = Depends(get_current_user),
):
    """Trả về thông tin hồ sơ và số dư ví điện tử của tài khoản hiện tại."""
    wallet_balance = float(current_user.wallet.balance) if current_user.wallet else 0.0
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
        wallet_balance=wallet_balance,
    )


@router.get(
    "/test-admin-access",
    summary="Endpoint kiểm tra quyền dành riêng cho ADMIN",
    dependencies=[Depends(require_roles(["ADMIN"]))],
)
def test_admin_access(current_user: User = Depends(get_current_user)):
    """Endpoint bảo vệ kiểm thử phân quyền RBAC cho ADMIN."""
    return {"message": f"Xin chào Quản trị viên {current_user.username}. Truy cập hợp lệ!"}
