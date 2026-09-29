from decimal import Decimal
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api.deps import get_current_user_or_driver_guest
from app.core.database import get_db
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.schemas.wallet import TopupRequest, WalletResponse, WalletTransactionResponse
from app.services.wallet_service import topup_wallet

router = APIRouter(prefix="/wallet", tags=["Ví điện tử & Giao dịch (Wallet)"])


@router.get(
    "/me",
    response_model=WalletResponse,
    summary="Xem số dư ví điện tử và lịch sử biến động số dư của tôi (Tài xế không cần đăng nhập)",
)
def get_my_wallet(
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    wallet = (
        db.query(Wallet)
        .filter(Wallet.user_id == current_user.id)
        .first()
    )
    if not wallet:
        # Tự động khởi tạo ví điện tử 0 VND nếu người dùng chưa có (Self-healing)
        wallet = Wallet(user_id=current_user.id, balance=Decimal("0.00"), is_debt_locked=False)
        db.add(wallet)
        db.commit()
        db.refresh(wallet)
    return wallet


@router.get(
    "/transactions",
    response_model=List[WalletTransactionResponse],
    summary="Xem danh sách lịch sử biến động số dư ví của tôi",
)
def get_my_wallet_transactions(
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    wallet = db.query(Wallet).filter(Wallet.user_id == current_user.id).first()
    if not wallet:
        return []
    transactions = (
        db.query(WalletTransaction)
        .filter(WalletTransaction.wallet_id == wallet.id)
        .order_by(WalletTransaction.id.desc())
        .limit(50)
        .all()
    )
    return transactions


@router.post(
    "/topup",
    response_model=WalletResponse,
    summary="Nạp tiền vào ví điện tử (Giao dịch ACID, hỗ trợ tài xế không cần đăng nhập)",
)
def topup_my_wallet(
    topup_in: TopupRequest,
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    """
    Nạp tiền vào ví:
    - Nếu có ghi tên người nạp (full_name), cập nhật vào hồ sơ người dùng.
    - Bắt đầu Transaction, khóa bi quan.
    - Tăng số dư, mở khóa nợ nếu số dư >= 0.
    - Lưu bản ghi WalletTransaction loại TOPUP.
    """
    if topup_in.full_name and topup_in.full_name.strip():
        current_user.full_name = topup_in.full_name.strip()
        db.add(current_user)
        db.commit()
        db.refresh(current_user)

    note_text = topup_in.note or f"Nạp tiền ví chuyển khoản QR ({current_user.full_name or 'Tài xế'})"

    wallet = topup_wallet(
        db=db,
        user_id=current_user.id,
        amount=topup_in.amount,
        note=note_text,
    )
    return wallet
