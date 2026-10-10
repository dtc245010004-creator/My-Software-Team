from decimal import Decimal

from fastapi import APIRouter, Depends
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
    wallet = db.query(Wallet).filter(Wallet.user_id == current_user.id).first()
    if not wallet:
        # Tự động khởi tạo ví điện tử 0 VND nếu người dùng chưa có (Self-healing)
        wallet = Wallet(
            user_id=current_user.id, balance=Decimal("0.00"), is_debt_locked=False
        )
        db.add(wallet)
        db.commit()
        db.refresh(wallet)
    return wallet


@router.get(
    "/transactions",
    response_model=list[WalletTransactionResponse],
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

    note_text = (
        topup_in.note
        or f"Nạp tiền ví chuyển khoản QR ({current_user.full_name or 'Tài xế'})"
    )

    wallet = topup_wallet(
        db=db,
        user_id=current_user.id,
        amount=topup_in.amount,
        note=note_text,
    )
    return wallet

from fastapi import HTTPException, status
from app.core.config import settings
from app.models.payment import TopupOrder
from app.services.payment_service import build_payment_url
from app.schemas.wallet import TopupOrderResponse
import uuid

@router.post(
    "/topup-requests",
    response_model=TopupOrderResponse,
    summary="Tạo giao dịch nạp tiền trạng thái chờ và chuyển hướng sang cổng sandbox",
)
def create_topup_request(
    topup_in: TopupRequest,
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    amount_int = int(topup_in.amount)
    if amount_int < settings.TOPUP_MIN_AMOUNT or amount_int > settings.TOPUP_MAX_AMOUNT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Amount must be between {settings.TOPUP_MIN_AMOUNT} and {settings.TOPUP_MAX_AMOUNT}"
        )
        
    order_code = f"ORDER_{uuid.uuid4().hex[:8].upper()}"
    
    order = TopupOrder(
        user_id=current_user.id,
        order_code=order_code,
        amount=topup_in.amount,
        status="PENDING"
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    
    redirect_url = build_payment_url(order_code=order_code, amount=amount_int)
    
    return TopupOrderResponse(order_id=order_code, redirect_url=redirect_url)
