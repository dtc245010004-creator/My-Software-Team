from decimal import Decimal
from typing import Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.wallet import Wallet, WalletTransaction


def get_or_create_wallet(db: Session, user_id: int) -> Wallet:
    """Lấy ví điện tử của user hoặc tự động khởi tạo nếu chưa tồn tại."""
    wallet = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    if not wallet:
        wallet = Wallet(user_id=user_id, balance=Decimal("0.00"), is_debt_locked=False)
        db.add(wallet)
        db.commit()
        db.refresh(wallet)
    return wallet


def topup_wallet(
    db: Session,
    user_id: int,
    amount: Decimal,
    note: Optional[str] = None,
) -> Wallet:
    """
    Nạp tiền vào ví điện tử:
    - Bắt đầu Transaction, khóa bi quan (with_for_update).
    - Tăng số dư, nếu số dư >= 0 thì giải phóng khóa nợ (is_debt_locked = False).
    - Tạo bản ghi WalletTransaction loại TOPUP.
    """
    wallet = (
        db.query(Wallet)
        .filter(Wallet.user_id == user_id)
        .with_for_update()
        .first()
    )
    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy ví điện tử của người dùng.",
        )

    wallet.balance += amount
    if wallet.balance >= 0:
        wallet.is_debt_locked = False

    tx = WalletTransaction(
        wallet_id=wallet.id,
        amount=amount,
        transaction_type="TOPUP",
        balance_after=wallet.balance,
        note=note or "Nạp tiền vào ví điện tử",
    )
    db.add(tx)
    db.commit()
    db.refresh(wallet)
    return wallet


def deduct_charging_fee(
    db: Session,
    user_id: int,
    session_id: int,
    amount: Decimal,
) -> Tuple[Wallet, WalletTransaction, bool]:
    """
    Quyết toán trừ tiền phiên sạc (ACID Transaction):
    - Khóa dòng bi quan (with_for_update).
    - Trừ tiền phiên sạc (chấp nhận số dư âm).
    - Chính sách nợ (Debt Policy):
      + Nếu số dư âm sâu hơn NEGATIVE_BALANCE_LIMIT (-300,000 VND), kích hoạt is_debt_locked = True
        (Điện đã xả không thể hoàn tác, cho trừ hết nhưng khóa tài khoản ngay lập tức).
      + Nếu âm trong hạn mức, vẫn trừ bình thường, giao dịch thành công.
    - Lưu bản ghi WalletTransaction loại CHARGE_FEE.
    """
    wallet = (
        db.query(Wallet)
        .filter(Wallet.user_id == user_id)
        .with_for_update()
        .first()
    )
    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy ví điện tử của người dùng.",
        )

    new_balance = wallet.balance - amount
    wallet.balance = new_balance

    debt_locked = False
    limit_decimal = Decimal(str(settings.NEGATIVE_BALANCE_LIMIT))
    if new_balance < limit_decimal:
        wallet.is_debt_locked = True
        debt_locked = True

    tx = WalletTransaction(
        wallet_id=wallet.id,
        amount=-amount,
        transaction_type="CHARGE_FEE",
        balance_after=new_balance,
        reference_id=f"session_{session_id}",
        note=f"Thanh toán cước phiên sạc #{session_id}"
        + (" (Đã kích hoạt khóa nợ do vượt hạn mức)" if debt_locked else ""),
    )
    db.add(tx)
    return wallet, tx, debt_locked
