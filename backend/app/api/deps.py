<<<<<<< Updated upstream
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload

=======
from typing import Callable, List, Optional
import logging
from decimal import Decimal
from fastapi import Depends, HTTPException, status
from fastapi import Request
from fastapi.security import OAuth2PasswordBearer
import jwt
from sqlalchemy.orm import Session
>>>>>>> Stashed changes
from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User
<<<<<<< Updated upstream
=======
from app.models.wallet import Wallet

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login",
    auto_error=False,
)

oauth2_scheme_optional = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login",
    auto_error=False,
)
audit_logger = logging.getLogger("ev_csms.audit")


def get_current_user_or_driver_guest(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme_optional),
    db: Session = Depends(get_db),
) -> User:
    """
    Dependency lấy người dùng hiện tại:
    - Nếu có Token hợp lệ: trả về User tương ứng (Admin, Operator, Customer).
    - Nếu không có Token (Role Tài xế không cần đăng nhập): tự động kết nối tài khoản
      tài xế vãng lai / khách (customer_user), đảm bảo luôn có Ví điện tử sẵn sàng giao dịch.
    """
    token = token or request.cookies.get("ev_csms_session")
    if token:
        try:
            payload = decode_access_token(token)
            user_id_str = payload.get("sub")
            if user_id_str is not None:
                user = db.query(User).filter(User.id == int(user_id_str)).first()
                if user and user.is_active:
                    return user
        except Exception:
            pass

    # Role Tài xế không cần đăng nhập: tìm hoặc tự tạo tài khoản tài xế mặc định
    guest_user = db.query(User).filter(User.username == "customer_user").first()
    if not guest_user:
        guest_user = db.query(User).filter(User.role == "CUSTOMER", User.is_active == True).first()
    if not guest_user:
        guest_user = User(
            username="customer_user",
            email="driver@evcsms.vn",
            full_name="Tài Xế Khách Vãng Lai",
            password_hash="guest_unauthenticated",
            role="CUSTOMER",
            is_active=True,
        )
        db.add(guest_user)
        db.commit()
        db.refresh(guest_user)

    # Đảm bảo tài khoản tài xế khách luôn có ví điện tử
    wallet = db.query(Wallet).filter(Wallet.user_id == guest_user.id).first()
    if not wallet:
        wallet = Wallet(user_id=guest_user.id, balance=Decimal("0.00"), is_debt_locked=False)
        db.add(wallet)
        db.commit()
        db.refresh(guest_user)

    return guest_user
>>>>>>> Stashed changes


def get_current_user(
    request: Request,
<<<<<<< Updated upstream
    db: Annotated[Session, Depends(get_db)],
    session_cookie: Annotated[str | None, Cookie(alias=settings.session_cookie_name)] = None,
) -> User:
    """Đọc cookie phiên (hoặc Bearer token), giải mã token, lấy thông tin người dùng từ DB."""
    token = session_cookie
    if not token:
        # Hỗ trợ lấy từ Header Authorization (Bearer token) nếu có
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]
=======
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Dependency xác thực JWT token và nạp bản ghi User tươi mới từ CSDL."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Thông tin xác thực không hợp lệ hoặc token đã hết hạn.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = token or request.cookies.get("ev_csms_session")
    if not token:
        raise credentials_exception
    try:
        payload = decode_access_token(token)
        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        user_id = int(user_id_str)
    except (jwt.PyJWTError, ValueError):
        raise credentials_exception
>>>>>>> Stashed changes

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Chưa xác thực hoặc phiên đăng nhập không tồn tại",
            headers={"WWW-Authenticate": "Bearer"},
        )

    import jwt
    try:
        payload = decode_access_token(token, raise_on_expired=True)
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Phiên đăng nhập không hợp lệ",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token không chứa thông tin định danh người dùng",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id_int = int(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Định danh người dùng không hợp lệ",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = (
        db.query(User)
        .options(joinedload(User.roles))
        .filter(User.id == user_id_int)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Người dùng không tồn tại",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản người dùng đã bị vô hiệu hóa",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user
<<<<<<< Updated upstream
=======


def get_optional_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Trả tài khoản hiện tại nếu request có token; cho phép truy cập công khai nếu không có."""
    token = token or request.cookies.get("ev_csms_session")
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub"))
    except (jwt.PyJWTError, TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phiên đăng nhập không hợp lệ.")
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phiên đăng nhập không hợp lệ.")
    return user


def require_roles(allowed_roles: List[str]) -> Callable[[User], User]:
    """Dependency kiểm tra phân quyền RBAC dựa trên vai trò thực tế của người dùng trong CSDL."""

    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            audit_logger.warning(
                "authorization_denied actor_id=%s role=%s required_roles=%s",
                current_user.id,
                current_user.role,
                ",".join(allowed_roles),
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Thao tác bị từ chối. Yêu cầu một trong các vai trò: {', '.join(allowed_roles)}.",
            )
        return current_user

    return role_checker
>>>>>>> Stashed changes
