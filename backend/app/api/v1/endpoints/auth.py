import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.user import User
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
    Trả về JWT Bearer token kèm thông tin cơ bản của người dùng.
    """
    user = (
        db.query(User)
        .filter((User.username == login_in.username) | (User.email == login_in.username))
        .first()
    )

    if not user or not verify_password(login_in.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tên đăng nhập hoặc mật khẩu không chính xác.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản người dùng đã bị vô hiệu hóa.",
        )

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
    summary="Endpoint kiểm tra quyền dành riêng cho ADMIN",
    dependencies=[Depends(require_roles(["ADMIN"]))],
)
def test_admin_access(current_user: User = Depends(get_current_user)):
    """Endpoint bảo vệ kiểm thử phân quyền RBAC cho ADMIN."""
    return {"message": f"Xin chào Quản trị viên {current_user.username}. Truy cập hợp lệ!"}
