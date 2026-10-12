import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_or_driver_guest
from app.core.config import settings
from app.core.database import get_db
from app.models.payment import TopupOrder
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.schemas.wallet import (
    TopupOrderResponse,
    TopupOrderStatusResponse,
    TopupRequest,
    WalletResponse,
    WalletTransactionResponse,
)
from app.services.payment_service import build_payment_url
from app.services.wallet_service import topup_wallet

router = APIRouter(prefix="/wallet", tags=["V├¡ ─æiß╗çn tß╗¡ & Giao dß╗ïch (Wallet)"])


@router.get(
    "/me",
    response_model=WalletResponse,
    summary="Xem sß╗æ d╞░ v├¡ ─æiß╗çn tß╗¡ v├á lß╗ïch sß╗¡ biß║┐n ─æß╗Öng sß╗æ d╞░ cß╗ºa t├┤i (T├ái xß║┐ kh├┤ng cß║ºn ─æ─âng nhß║¡p)",
)
def get_my_wallet(
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    wallet = db.query(Wallet).filter(Wallet.user_id == current_user.id).first()
    if not wallet:
        # Tß╗▒ ─æß╗Öng khß╗ƒi tß║ío v├¡ ─æiß╗çn tß╗¡ 0 VND nß║┐u ng╞░ß╗¥i d├╣ng ch╞░a c├│ (Self-healing)
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
    summary="Xem danh s├ích lß╗ïch sß╗¡ biß║┐n ─æß╗Öng sß╗æ d╞░ v├¡ cß╗ºa t├┤i",
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
    summary="Nß║íp tiß╗ün v├áo v├¡ ─æiß╗çn tß╗¡ (Giao dß╗ïch ACID, hß╗ù trß╗ú t├ái xß║┐ kh├┤ng cß║ºn ─æ─âng nhß║¡p)",
)
def topup_my_wallet(
    topup_in: TopupRequest,
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    """
    Nß║íp tiß╗ün v├áo v├¡:
    - Nß║┐u c├│ ghi t├¬n ng╞░ß╗¥i nß║íp (full_name), cß║¡p nhß║¡t v├áo hß╗ô s╞í ng╞░ß╗¥i d├╣ng.
    - Bß║»t ─æß║ºu Transaction, kh├│a bi quan.
    - T─âng sß╗æ d╞░, mß╗ƒ kh├│a nß╗ú nß║┐u sß╗æ d╞░ >= 0.
    - L╞░u bß║ún ghi WalletTransaction loß║íi TOPUP.
    """
    if topup_in.full_name and topup_in.full_name.strip():
        current_user.full_name = topup_in.full_name.strip()
        db.add(current_user)
        db.commit()
        db.refresh(current_user)

    note_text = (
        topup_in.note
        or f"Nß║íp tiß╗ün v├¡ chuyß╗ân khoß║ún QR ({current_user.full_name or 'T├ái xß║┐'})"
    )

    wallet = topup_wallet(
        db=db,
        user_id=current_user.id,
        amount=topup_in.amount,
        note=note_text,
    )
    return wallet



@router.post(
    "/topup-requests",
    response_model=TopupOrderResponse,
    summary="Tß║ío giao dß╗ïch nß║íp tiß╗ün trß║íng th├íi chß╗¥ v├á chuyß╗ân h╞░ß╗¢ng sang cß╗òng sandbox",
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



@router.get(
    "/topup-requests/{order_code}",
    response_model=TopupOrderStatusResponse,
    summary="Polling kiß╗âm tra trß║íng th├íi giao dß╗ïch nß║íp tiß╗ün",
)
def get_topup_request_status(
    order_code: str,
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    order = db.query(TopupOrder).filter(TopupOrder.order_code == order_code).first()
    
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topup order not found")
        
    # Ph├ón quyß╗ün: Chß╗ë user tß║ío giao dß╗ïch mß╗¢i ─æ╞░ß╗úc xem
    if order.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this order"
        )
        
    return order
