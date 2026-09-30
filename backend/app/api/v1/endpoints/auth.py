import logging
import os
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy import case, func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_roles
from app.core.config import settings
from app.core.database import get_db
from app.core.datetime_utils import ensure_utc, get_utc_now
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    get_password_hash,
    verify_password,
)
from app.models.user import LoginAttempt, User
from app.models.wallet import Wallet
from app.schemas.user import TokenResponse, UserLogin, UserRegister, UserResponse

logger = logging.getLogger("ev_csms.auth")

router = APIRouter(prefix="/auth", tags=["Authentication & RBAC"])


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
    except Exception as e:
        db.rollback()
        logger.error(f"Lỗi hệ thống khi tạo tài khoản & ví: {e}")
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
    db: Session = Depends(get_db),
):
    """
    Xác thực người dùng bằng username/email và mật khẩu.
    - Chống User Enumeration: email có/không tồn tại đều trả cùng mã và thông báo.
    - Dùng bảng login_attempts quản lý số lần thử và khóa tạm 15 phút sau 5 lần sai.
    - Cân bằng timing attack bằng dummy password hash khi không tìm thấy user.
    """
    email_norm = login_in.username.strip().lower()
    now = get_utc_now()

    # 1. Tra cứu hoặc khởi tạo bản ghi đếm đăng nhập cho email_norm (nguyên tử)
    attempt = db.query(LoginAttempt).filter(LoginAttempt.email == email_norm).first()
    if not attempt:
        try:
            attempt = LoginAttempt(email=email_norm, failed_count=0, locked_until=None)
            db.add(attempt)
            db.commit()
            db.refresh(attempt)
        except IntegrityError:
            db.rollback()
            attempt = db.query(LoginAttempt).filter(LoginAttempt.email == email_norm).first()

    # 2. Kiểm tra nếu email đang trong thời gian bị khóa
    if attempt and attempt.locked_until:
        locked_until_utc = ensure_utc(attempt.locked_until)
        if locked_until_utc and now < locked_until_utc:
            remaining_seconds = max(1, int((locked_until_utc - now).total_seconds()))
            remaining_minutes = max(1, int(remaining_seconds // 60) + (1 if remaining_seconds % 60 > 0 else 0))
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "detail": f"Tài khoản bị tạm khóa {settings.LOCKOUT_DURATION_MINUTES} phút do nhập sai quá {settings.MAX_FAILED_LOGIN_ATTEMPTS} lần. Vui lòng thử lại sau {remaining_minutes} phút.",
                    "retry_after_seconds": remaining_seconds,
                },
                headers={"Retry-After": str(remaining_seconds)},
            )
        else:
            # Đã hết thời hạn khóa -> tự động mở khóa
            attempt.failed_count = 0
            attempt.locked_until = None
            db.commit()

    # 3. Nếu số lần sai trước đó đã đạt ngưỡng (>= 5 lần), lần thử này (lần thứ 6) bị khóa ngay lập tức!
    # Kể cả nhập đúng hay sai mật khẩu đều bị từ chối 429
    if attempt and attempt.failed_count >= settings.MAX_FAILED_LOGIN_ATTEMPTS:
        lock_until = now + timedelta(minutes=settings.LOCKOUT_DURATION_MINUTES)
        attempt.locked_until = lock_until
        attempt.failed_count = attempt.failed_count + 1
        db.commit()
        remaining_seconds = int(settings.LOCKOUT_DURATION_MINUTES * 60)
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "detail": f"Tài khoản bị tạm khóa {settings.LOCKOUT_DURATION_MINUTES} phút do nhập sai quá {settings.MAX_FAILED_LOGIN_ATTEMPTS} lần. Vui lòng thử lại sau {settings.LOCKOUT_DURATION_MINUTES} phút.",
                "retry_after_seconds": remaining_seconds,
            },
            headers={"Retry-After": str(remaining_seconds)},
        )

    # 4. Xác thực thông tin người dùng
    user = (
        db.query(User)
        .filter((func.lower(User.username) == email_norm) | (func.lower(User.email) == email_norm))
        .first()
    )

    if user:
        is_password_valid = verify_password(login_in.password, user.password_hash)
    else:
        # Dummy verification để cân bằng timing attack (Bcrypt cost factor 12)
        verify_password(login_in.password, DUMMY_PASSWORD_HASH)
        is_password_valid = False

    if not user or not is_password_valid:
        # Tăng số lần thử thất bại một cách nguyên tử và tự động khóa nếu vượt ngưỡng 5 lần
        lock_until_time = now + timedelta(minutes=settings.LOCKOUT_DURATION_MINUTES)
        db.execute(
            update(LoginAttempt)
            .where(LoginAttempt.email == email_norm)
            .values(
                failed_count=LoginAttempt.failed_count + 1,
                locked_until=case(
                    (LoginAttempt.failed_count + 1 > settings.MAX_FAILED_LOGIN_ATTEMPTS, lock_until_time),
                    else_=LoginAttempt.locked_until,
                ),
                updated_at=now,
            )
        )
        db.commit()

        # Kiểm tra nếu lần sai này khiến tài khoản bị khóa (lần thứ 6 trở đi)
        attempt_after = db.query(LoginAttempt).filter(LoginAttempt.email == email_norm).first()
        if attempt_after and attempt_after.locked_until:
            locked_until_utc = ensure_utc(attempt_after.locked_until)
            if locked_until_utc and now < locked_until_utc:
                remaining_seconds = max(1, int((locked_until_utc - now).total_seconds()))
                remaining_minutes = max(1, int(remaining_seconds // 60) + (1 if remaining_seconds % 60 > 0 else 0))
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={
                        "detail": f"Tài khoản bị tạm khóa {settings.LOCKOUT_DURATION_MINUTES} phút do nhập sai quá {settings.MAX_FAILED_LOGIN_ATTEMPTS} lần. Vui lòng thử lại sau {remaining_minutes} phút.",
                        "retry_after_seconds": remaining_seconds,
                    },
                    headers={"Retry-After": str(remaining_seconds)},
                )

        # Chưa bị khóa -> Cùng mã 401, cùng nội dung cho mọi trường hợp sai thông tin
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không đúng",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 5. Kiểm tra trạng thái hoạt động và nợ ví
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản người dùng đã bị vô hiệu hóa.",
        )

    if user.wallet and user.wallet.is_debt_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="tài khoản bị khóa vì - quá 300k",
        )

    # 6. Đăng nhập thành công -> Reset số lần đếm sai và gỡ cờ khóa
    if attempt.failed_count > 0 or attempt.locked_until is not None:
        attempt.failed_count = 0
        attempt.locked_until = None
    if user.failed_login_attempts > 0 or user.locked_until is not None:
        user.failed_login_attempts = 0
        user.locked_until = None
    db.commit()

    # Cấp access token nhúng sub (user.id) và role
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role}
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
        access_token=access_token,
        token_type="bearer",
        user=user_response,
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
    summary="Endpoint kiểm tra quyền dành riêng cho ADMIN (Chỉ bật ở dev/test)",
    dependencies=[Depends(require_roles(["ADMIN"]))],
)
def test_admin_access(current_user: User = Depends(get_current_user)):
    """Endpoint bảo vệ kiểm thử phân quyền RBAC cho ADMIN (Chỉ bật ở dev/test)."""
    env = os.environ.get("ENVIRONMENT", "development").lower()
    if env not in ("development", "test", "testing"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint không khả dụng trên môi trường này.",
        )
    return {"message": f"Xin chào Quản trị viên {current_user.username}. Truy cập hợp lệ!"}
