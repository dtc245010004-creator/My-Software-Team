"""Khởi tạo an toàn các tài khoản demo trong Compose phát triển."""

from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.security import get_password_hash, verify_password
from app.models.id_tag import IdTag
from app.models.user import User
from app.models.wallet import Wallet

DEMO_ACCOUNTS = (
    {
        "username": "admin",
        "email": "admin@evcsms.vn",
        "full_name": "Quản Trị Viên Hệ Thống",
        "password": "12345678a",
        "role": "ADMIN",
        "balance": Decimal("5000000.00"),
    },
    {
        "username": "admin2",
        "email": "admin2@evcsms.vn",
        "full_name": "Quản Trị Viên Dự Phòng",
        "password": "AdminPass123",
        "role": "ADMIN",
        "balance": Decimal("5000000.00"),
    },
    {
        "username": "operator",
        "email": "operator@evcsms.vn",
        "full_name": "Chủ Trạm Sạc Trung Tâm",
        "password": "OpPass123",
        "role": "OPERATOR",
        "balance": Decimal("2000000.00"),
    },
    {
        "username": "operator_a",
        "email": "cpo_vinfast@evcsms.vn",
        "full_name": "Chủ Trạm Sạc VinFast",
        "password": "OpPass123",
        "role": "OPERATOR",
        "balance": Decimal("2000000.00"),
    },
    {
        "username": "accountant",
        "email": "accountant@evcsms.vn",
        "full_name": "Kế Toán Viên Hệ Thống",
        "password": "AccPass123",
        "role": "ACCOUNTANT",
        "balance": Decimal("1000000.00"),
    },
    {
        "username": "customer_user",
        "email": "driver1@gmail.com",
        "full_name": "Nguyễn Văn Tài",
        "password": "CusPass123",
        "role": "CUSTOMER",
        "balance": Decimal("250000.00"),
    },
    {
        "username": "driver_vip",
        "email": "driver_vip@gmail.com",
        "full_name": "Trần Thị Bích Ngọc",
        "password": "DriverPass123",
        "role": "CUSTOMER",
        "balance": Decimal("1500000.00"),
    },
    {
        "username": "driver_debt",
        "email": "driver_debt@gmail.com",
        "full_name": "Lê Hoàng Nam",
        "password": "DriverPass123",
        "role": "CUSTOMER",
        "balance": Decimal("-120000.00"),
    },
)


def ensure_demo_accounts(db: Session) -> int:
    """Tạo/cập nhật các tài khoản demo và ví mà không xóa dữ liệu khác."""
    created_count = 0

    for account in DEMO_ACCOUNTS:
        user = db.query(User).filter(User.username == account["username"]).first()
        if user is None:
            user = User(
                username=account["username"],
                email=account["email"],
                full_name=account["full_name"],
                password_hash=get_password_hash(account["password"]),
                role=account["role"],
                is_active=True,
            )
            db.add(user)
            db.flush()
            created_count += 1
        else:
            user.email = account["email"]
            user.full_name = account["full_name"]
            user.role = account["role"]
            user.is_active = True
            user.failed_login_attempts = 0
            user.locked_until = None
            if not verify_password(account["password"], user.password_hash):
                user.password_hash = get_password_hash(account["password"])

        wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()
        if wallet is None:
            is_debt_locked = account["username"] == "driver_debt"
            wallet = Wallet(
                user_id=user.id,
                balance=account["balance"],
                currency="VND",
                is_debt_locked=is_debt_locked,
            )
            db.add(wallet)

        if account["role"] == "CUSTOMER":
            id_tag_code = f"DEMO-{account['username'].upper()}"
            existing_tag = (
                db.query(IdTag).filter(IdTag.code == id_tag_code).first()
            )
            if existing_tag is None:
                db.add(IdTag(code=id_tag_code, user_id=user.id, status="active"))

    db.commit()
    return created_count
