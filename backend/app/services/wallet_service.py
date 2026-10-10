import logging
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.wallet import Wallet, WalletTransaction
from app.services.audit_service import ghi_nhat_ky

logger = logging.getLogger("ev_csms.wallet")


def get_or_create_wallet(db: Session, user_id: int) -> Wallet:
    """Lấy ví của user hoặc khởi tạo ví 0 VND chưa có biến động."""
    wallet = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    if not wallet:
        wallet = Wallet(user_id=user_id, balance=Decimal("0.00"), is_debt_locked=False)
        db.add(wallet)
        db.commit()
        db.refresh(wallet)
    return wallet


def post_ledger_entry(
    db: Session,
    wallet_id: int,
    amount: Decimal,
    transaction_type: str,
    reference_id: str | None = None,
    note: str | None = None,
) -> tuple[Wallet, WalletTransaction, bool]:
    """Ghi một dòng sổ cái và cập nhật số dư trong cùng transaction.

    `amount` có dấu: TOPUP/REFUND thường dương; CHARGE_FEE âm. Vì thế
    `SUM(wallet_transactions.amount)` phải bằng `Wallet.balance`. Khóa bi quan
    bảo vệ cập nhật trên PostgreSQL; SQLite dùng một UPDATE metadata trước khi
    đọc để lấy quyền ghi của transaction (SQLite không hỗ trợ SELECT FOR UPDATE).

    Trả về cờ cho biết giao dịch này vừa kích hoạt khóa nợ nghiệp vụ.
    Hàm không commit để caller có thể gộp sổ cái với phiên sạc/audit trong một
    transaction ACID.
    """
    signed_amount = Decimal(str(amount))
    if transaction_type not in {"TOPUP", "CHARGE_FEE", "REFUND"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Loại giao dịch ví không hợp lệ.",
        )
    if transaction_type in {"TOPUP", "REFUND"} and signed_amount < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Giao dịch nạp hoặc hoàn tiền phải có số tiền dương.",
        )
    if transaction_type == "CHARGE_FEE" and signed_amount > 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Giao dịch trừ phí phải có số tiền âm trong sổ cái.",
        )

    if db.get_bind().dialect.name == "sqlite":
        db.execute(
            update(Wallet)
            .where(Wallet.id == wallet_id)
            .values(updated_at=func.now())
        )

    wallet = (
        db.query(Wallet)
        .filter(Wallet.id == wallet_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if wallet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy ví điện tử.",
        )

    if wallet.is_reconcile_locked:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Ví đang bị khóa giao dịch do số dư không khớp sổ cái. Vui lòng liên hệ quản trị viên.",
        )

    if reference_id is not None:
        existing = (
            db.query(WalletTransaction)
            .filter(
                WalletTransaction.wallet_id == wallet_id,
                WalletTransaction.reference_id == reference_id,
                WalletTransaction.transaction_type == transaction_type,
            )
            .first()
        )
        if existing is not None:
            if Decimal(str(existing.amount)) != signed_amount:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Mã tham chiếu giao dịch đã được dùng với số tiền khác.",
                )
            return wallet, existing, False

    new_balance = Decimal(str(wallet.balance)) + signed_amount
    debt_lock_activated = False
    if transaction_type == "CHARGE_FEE":
        limit_decimal = Decimal(str(settings.NEGATIVE_BALANCE_LIMIT))
        if new_balance < limit_decimal and not wallet.is_debt_locked:
            debt_lock_activated = True
        if new_balance < limit_decimal:
            wallet.is_debt_locked = True
    elif transaction_type in ("TOPUP", "REFUND") and new_balance >= 0:
        wallet.is_debt_locked = False

    wallet.balance = new_balance
    transaction_note = note
    if debt_lock_activated:
        transaction_note = (note or "Thanh toán cước") + (
            " (Đã kích hoạt khóa nợ do vượt hạn mức)"
        )

    transaction = WalletTransaction(
        wallet_id=wallet.id,
        amount=signed_amount,
        transaction_type=transaction_type,
        balance_after=new_balance,
        reference_id=reference_id,
        note=transaction_note,
    )
    db.add(transaction)
    db.flush()
    return wallet, transaction, debt_lock_activated


def topup_wallet(
    db: Session,
    user_id: int,
    amount: Decimal,
    note: str | None = None,
) -> Wallet:
    """Nạp tiền qua sổ cái append-only rồi commit dòng sổ và số dư cùng nhau."""
    wallet = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    if wallet is None:
        wallet = Wallet(
            user_id=user_id,
            balance=Decimal("0.00"),
            is_debt_locked=False,
            is_reconcile_locked=False,
        )
        db.add(wallet)
        db.flush()

    wallet, _, _ = post_ledger_entry(
        db=db,
        wallet_id=wallet.id,
        amount=amount,
        transaction_type="TOPUP",
        note=note or "Nạp tiền vào ví điện tử",
    )
    db.commit()
    db.refresh(wallet)
    return wallet


def deduct_charging_fee(
    db: Session,
    user_id: int,
    session_id: int,
    amount: Decimal,
) -> tuple[Wallet, WalletTransaction, bool]:
    """Ghi CHARGE_FEE âm và cập nhật số dư trong transaction của phiên.

    Chấp nhận số dư âm trong giới hạn hiện hành. Nếu số dư mới thấp hơn
    `NEGATIVE_BALANCE_LIMIT`, bật `is_debt_locked`; không commit vì caller phải
    chốt phiên và dòng sổ cái nguyên tử.
    """
    wallet_id = db.query(Wallet.id).filter(Wallet.user_id == user_id).scalar()
    if wallet_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy ví điện tử của người dùng.",
        )

    return post_ledger_entry(
        db=db,
        wallet_id=wallet_id,
        amount=-Decimal(str(amount)),
        transaction_type="CHARGE_FEE",
        reference_id=f"session_{session_id}",
        note=f"Thanh toán cước phiên sạc #{session_id}",
    )


def reconcile_wallet_ledger(db: Session | None = None) -> dict[str, int]:
    """So sánh balance với SUM(amount) bằng một truy vấn nhóm và khóa ví lệch.

    Mỗi lần kiểm tra phát hiện lệch sẽ ghi một dòng logging và audit log. Ví đã
    khóa không tự mở lại khi số liệu tình cờ khớp; cần thao tác Admin có lý do.
    """
    should_close = db is None
    if db is None:
        from app.core.database import SessionLocal

        db = SessionLocal()

    try:
        rows = (
            db.query(
                Wallet.id,
                Wallet.balance,
                Wallet.is_reconcile_locked,
                func.coalesce(func.sum(WalletTransaction.amount), 0).label(
                    "ledger_balance"
                ),
            )
            .outerjoin(WalletTransaction, WalletTransaction.wallet_id == Wallet.id)
            .group_by(Wallet.id, Wallet.balance, Wallet.is_reconcile_locked)
            .all()
        )

        mismatches: list[tuple[int, Decimal, Decimal, bool]] = []
        for wallet_id, balance, is_locked, ledger_balance in rows:
            balance_decimal = Decimal(str(balance))
            ledger_decimal = Decimal(str(ledger_balance))
            if balance_decimal != ledger_decimal:
                mismatches.append(
                    (wallet_id, balance_decimal, ledger_decimal, is_locked)
                )

        mismatch_ids = [wallet_id for wallet_id, *_ in mismatches]
        if mismatch_ids:
            db.query(Wallet).filter(Wallet.id.in_(mismatch_ids)).update(
                {Wallet.is_reconcile_locked: True}, synchronize_session=False
            )

            for wallet_id, balance, ledger_balance, was_locked in mismatches:
                logger.error(
                    "Wallet ledger mismatch detected: wallet_id=%s balance=%s ledger_sum=%s already_locked=%s",
                    wallet_id,
                    balance,
                    ledger_balance,
                    was_locked,
                )
                ghi_nhat_ky(
                    db,
                    user_id=None,
                    action="WalletLedgerMismatchDetected",
                    object_type="wallet",
                    object_id=wallet_id,
                    data={
                        "balance": str(balance),
                        "ledger_sum": str(ledger_balance),
                        "already_locked": was_locked,
                    },
                )

        db.commit()
        return {"checked": len(rows), "mismatched": len(mismatches)}
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Lỗi khi đối soát số dư ví với sổ cái")
        raise
    finally:
        if should_close:
            db.close()


def unlock_wallet_reconciliation(
    db: Session,
    wallet_id: int,
    *,
    admin_user_id: int,
    reason: str,
) -> Wallet:
    """Mở khóa giao dịch sau khi Admin xử lý lệch và xác nhận tổng đã khớp."""
    if db.get_bind().dialect.name == "sqlite":
        db.execute(
            update(Wallet)
            .where(Wallet.id == wallet_id)
            .values(updated_at=func.now())
        )

    wallet = (
        db.query(Wallet)
        .filter(Wallet.id == wallet_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if wallet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy ví điện tử.",
        )
    if not wallet.is_reconcile_locked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ví hiện không bị khóa đối soát.",
        )

    ledger_balance = (
        db.query(func.coalesce(func.sum(WalletTransaction.amount), 0))
        .filter(WalletTransaction.wallet_id == wallet.id)
        .scalar()
    )
    if Decimal(str(wallet.balance)) != Decimal(str(ledger_balance)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Chưa thể mở khóa: số dư ví vẫn chưa khớp tổng sổ cái. Hãy xử lý sai lệch trước.",
        )

    wallet.is_reconcile_locked = False
    ghi_nhat_ky(
        db,
        user_id=admin_user_id,
        action="WalletReconciliationUnlocked",
        object_type="wallet",
        object_id=wallet.id,
        data={"reason": reason.strip(), "balance": str(wallet.balance)},
    )
    logger.warning(
        "Wallet reconciliation lock cleared: wallet_id=%s admin_user_id=%s reason=%s",
        wallet.id,
        admin_user_id,
        reason.strip(),
    )
    db.commit()
    db.refresh(wallet)
    return wallet
