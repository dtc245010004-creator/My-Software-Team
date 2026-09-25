from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.models.wallet import Wallet
from app.schemas.wallet import TopupRequest, WalletResponse
from app.services.wallet_service import topup_wallet

router = APIRouter(prefix="/wallet", tags=["Ví điện tử & Giao dịch (Wallet)"])


@router.get(
    "/me",
    response_model=WalletResponse,
    summary="Xem số dư ví điện tử và lịch sử biến động số dư của tôi",
)
def get_my_wallet(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    wallet = (
        db.query(Wallet)
        .filter(Wallet.user_id == current_user.id)
        .first()
    )
    if not wallet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy ví tiền của người dùng.",
        )
    return wallet


@router.post(
    "/topup",
    response_model=WalletResponse,
    summary="Nạp tiền vào ví điện tử (Giao dịch ACID)",
)
def topup_my_wallet(
    topup_in: TopupRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Nạp tiền vào ví:
    - Bắt đầu Transaction, khóa bi quan.
    - Tăng số dư, mở khóa nợ nếu số dư >= 0.
    - Lưu bản ghi WalletTransaction loại TOPUP.
    """
    wallet = topup_wallet(
        db=db,
        user_id=current_user.id,
        amount=topup_in.amount,
        note=topup_in.note,
    )
    return wallet
