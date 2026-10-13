import logging
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.session import ChargingSession
from app.models.user import User
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
    reference_type: str | None = None,
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
    if transaction_type == "SESSION_PAYMENT":
        transaction_type = "CHARGE_FEE"
        if signed_amount > 0:
            signed_amount = -signed_amount
    elif transaction_type not in {"TOPUP", "CHARGE_FEE", "REFUND"}:
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
        balance_before=Decimal(str(wallet.balance)) - signed_amount,
        balance_after=new_balance,
        reference_type=reference_type or transaction_type,
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
    reference_id: str | None = None,
    reference_type: str = "TOPUP",
    auto_commit: bool = True,
) -> Wallet:
    """Nạp tiền qua sổ cái append-only rồi commit dòng sổ và số dư cùng nhau."""
    if db.get_bind().dialect.name == "sqlite":
        db.execute(
            update(Wallet)
            .where(Wallet.user_id == user_id)
            .values(updated_at=func.now())
        )

    wallet = (
        db.query(Wallet)
        .filter(Wallet.user_id == user_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
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
        reference_type=reference_type,
        reference_id=reference_id,
        note=note or "Nạp tiền vào ví điện tử",
    )
    if auto_commit:
        db.commit()
        db.refresh(wallet)
    else:
        db.flush()
    return wallet


def admin_manual_topup(
    db: Session,
    *,
    admin_id: int,
    amount: Decimal,
    receipt_code: str,
    driver_id: int | None = None,
    wallet_id: int | None = None,
    note: str | None = None,
    client_ip: str | None = None,
) -> tuple[Wallet, WalletTransaction]:
    """
    S-36: Admin nạp tay vào ví tài xế (SCRUM-246, 247, 248, 249, 250).
    - Validate ví tồn tại, tài xế tồn tại và hợp lệ.
    - Chuẩn hoá receipt_code (strip, upper).
    - Khóa hàng bi quan (with_for_update) chống race condition.
    - Kiểm tra và bắt lỗi trùng receipt_code (IntegrityError -> 409 Conflict).
    - Cập nhật số dư, ghi sổ cái WalletTransaction, ghi AuditLog.
    - Nếu thất bại, ghi AuditLog bằng session riêng biệt để không bị rollback.
    """
    normalized_receipt = receipt_code.strip().upper() if receipt_code else ""
    if not normalized_receipt:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Mã phiếu thu không được để trống.",
        )

    if amount <= Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Số tiền nạp phải lớn hơn 0.",
        )

    def log_failure_audit(error_reason: str):
        try:
            audit_db = SessionLocal()
            try:
                ghi_nhat_ky(
                    audit_db,
                    user_id=admin_id,
                    action="ADMIN_MANUAL_TOPUP_FAILED",
                    object_type="wallet",
                    object_id=str(wallet_id or driver_id or "unknown"),
                    data={
                        "admin_id": admin_id,
                        "driver_id": driver_id,
                        "wallet_id": wallet_id,
                        "amount": str(amount),
                        "receipt_code": normalized_receipt,
                        "status": "FAILED",
                        "reason": error_reason,
                        "ip": client_ip,
                    },
                )
                audit_db.commit()
            finally:
                audit_db.close()
        except SQLAlchemyError as audit_exc:
            logger.warning("Không thể ghi audit log thất bại: %s", audit_exc)

    # 1. Tìm ví theo wallet_id hoặc driver_id
    query = db.query(Wallet).with_for_update()
    if wallet_id is not None:
        wallet = query.filter(Wallet.id == wallet_id).first()
    elif driver_id is not None:
        user = db.query(User).filter(User.id == driver_id).first()
        if not user:
            log_failure_audit(f"Không tìm thấy tài xế với ID {driver_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy tài xế với ID {driver_id}.",
            )
        wallet = query.filter(Wallet.user_id == driver_id).first()
        if not wallet:
            # Tự động tạo ví nếu chưa có
            wallet = Wallet(user_id=driver_id, balance=Decimal("0.00"), is_debt_locked=False)
            db.add(wallet)
            db.flush()
    else:
        log_failure_audit("Cần cung cấp driver_id hoặc wallet_id")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cần cung cấp driver_id hoặc wallet_id.",
        )

    if not wallet:
        log_failure_audit(f"Không tìm thấy ví điện tử với ID {wallet_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy ví điện tử với ID {wallet_id}.",
        )

    # 2. Kiểm tra trước xem receipt_code đã tồn tại chưa
    existing_tx = (
        db.query(WalletTransaction)
        .filter(WalletTransaction.receipt_code == normalized_receipt)
        .first()
    )
    if existing_tx:
        log_failure_audit(f"Mã phiếu thu '{normalized_receipt}' đã tồn tại trên hệ thống")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Mã phiếu thu '{normalized_receipt}' đã được sử dụng.",
        )

    try:
        # 3. Thực hiện nạp tiền và ghi sổ cái
        balance_before = wallet.balance
        new_balance = balance_before + amount
        wallet.balance = new_balance
        if new_balance >= 0:
            wallet.is_debt_locked = False

        tx = WalletTransaction(
            wallet_id=wallet.id,
            amount=amount,
            transaction_type="TOPUP",
            balance_before=balance_before,
            balance_after=new_balance,
            reference_type="MANUAL_TOPUP",
            reference_id=normalized_receipt,
            receipt_code=normalized_receipt,
            created_by_id=admin_id,
            note=note or f"Admin nạp tay theo phiếu thu {normalized_receipt}",
        )
        db.add(tx)

        # 4. Ghi AuditLog thành công trong cùng transaction
        ghi_nhat_ky(
            db,
            user_id=admin_id,
            action="ADMIN_MANUAL_TOPUP",
            object_type="wallet",
            object_id=str(wallet.id),
            data={
                "admin_id": admin_id,
                "driver_id": wallet.user_id,
                "wallet_id": wallet.id,
                "amount": f"{amount:.2f}",
                "balance_before": f"{balance_before:.2f}",
                "balance_after": f"{new_balance:.2f}",
                "receipt_code": normalized_receipt,
                "status": "SUCCESS",
                "ip": client_ip,
            },
        )

        db.commit()
    except IntegrityError as exc:
        db.rollback()
        log_failure_audit(f"Xung đột dữ liệu hoặc trùng mã phiếu thu: {exc}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Mã phiếu thu '{normalized_receipt}' đã tồn tại (Integrity Conflict).",
        )
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        log_failure_audit(f"Lỗi hệ thống khi nạp tiền: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Đã xảy ra lỗi khi xử lý nạp tiền ví.",
        )

    db.refresh(wallet)
    db.refresh(tx)
    return wallet, tx


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


def auto_deduct_session_payment(
    db: Session,
    session: ChargingSession,
    invoice_amount: Decimal | None = None,
) -> tuple[Wallet, WalletTransaction, bool]:
    """Tự động trừ ví và ghi sổ cái append-only khi phiên sạc kết thúc (S-37).

    - Đồng bộ hoá đơn và trừ tiền ví trong cùng một transaction CSDL.
    - Khóa ví bi quan với with_for_update() trên ví ngăn chặn race condition khi nhiều phiên của tài xế chốt cùng lúc.
    - Ghi bản ghi sổ cái (WalletTransaction/LedgerEntry) với session_id, amount âm, balance_after.
    - Cho phép số dư âm và gắn cờ nợ (is_debt=True, debt_status='IN_DEBT').
    - Đảm bảo tính Idempotency: không trừ tiền 2 lần khi gọi lặp trên cùng 1 phiên sạc.
    - Trả về tuple: (Wallet, WalletTransaction, debt_locked: bool).
    """
    user_id = getattr(session, "user_id", None) or getattr(session, "driver_id", None)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiên sạc không có thông tin tài xế để trừ tiền ví.",
        )

    session_id = getattr(session, "id", None) or getattr(session, "transaction_id", None)
    if session_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiên sạc không có mã định danh hợp lệ.",
        )

    if invoice_amount is None:
        if getattr(session, "total_amount", None) is not None:
            invoice_amount = Decimal(str(session.total_amount))
        else:
            from app.services.session_service import calculate_session_total

            billing_total = calculate_session_total(session, getattr(session, "tariff", None))
            invoice_amount = billing_total.total_amount
            session.total_amount = invoice_amount

    return deduct_charging_fee(
        db=db,
        user_id=user_id,
        session_id=session_id,
        amount=Decimal(str(invoice_amount)),
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


class WalletInsufficientBalanceException(HTTPException):
    """Ngoại lệ khi số dư ví dưới ngưỡng tối thiểu để bắt đầu phiên sạc (S-38 / SCRUM-264)."""

    def __init__(
        self,
        current_balance: Decimal | int | float,
        required_balance: Decimal | int | float,
        detail: str | None = None,
    ):
        cur_int = (
            int(current_balance)
            if float(current_balance).is_integer()
            else float(current_balance)
        )
        req_int = (
            int(required_balance)
            if float(required_balance).is_integer()
            else float(required_balance)
        )
        msg = (
            detail
            or f"Số dư ví ({Decimal(str(current_balance)):,.0f} VNĐ) không đủ hạn mức tối thiểu {Decimal(str(required_balance)):,.0f} VNĐ để bắt đầu sạc."
        )
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg,
        )
        self.error_code = "WALLET_INSUFFICIENT_BALANCE"
        self.current_balance = cur_int
        self.required_balance = req_int
        self.suggest_topup = True


class WalletNegativeBalanceException(HTTPException):
    """Ngoại lệ khi ví có số dư âm (S-38 / HTTP 402 Payment Required)."""

    def __init__(
        self,
        current_balance: Decimal | int | float,
        required_balance: Decimal | int | float,
        detail: str | None = None,
    ):
        cur_int = (
            int(current_balance)
            if float(current_balance).is_integer()
            else float(current_balance)
        )
        req_int = (
            int(required_balance)
            if float(required_balance).is_integer()
            else float(required_balance)
        )
        msg = (
            detail
            or f"Tài khoản đang có số dư âm ({Decimal(str(current_balance)):,.0f} VNĐ). Vui lòng nạp tiền để tiếp tục sạc."
        )
        super().__init__(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=msg,
        )
        self.error_code = "WALLET_INSUFFICIENT_BALANCE"
        self.current_balance = cur_int
        self.required_balance = req_int
        self.suggest_topup = True


def validate_wallet_balance_for_session(
    db: Session, user_id: int
) -> tuple[bool, str, Decimal, Decimal]:
    """Thẩm định số dư ví cho phiên sạc (Quy tắc chung SCRUM-265 cho cả OCPP và REST API).

    Trả về: (is_valid: bool, error_code: str, current_balance: Decimal, required_threshold: Decimal)
    Logic so sánh:
        current_balance >= settings.MIN_START_BALANCE -> Cho phép: (True, "", current_balance, threshold)
        current_balance < settings.MIN_START_BALANCE  -> Từ chối: (False, "WALLET_INSUFFICIENT_BALANCE", current_balance, threshold)
    """
    threshold = Decimal(str(settings.MIN_START_BALANCE))
    wallet = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    if wallet is None:
        current_balance = Decimal("0.00")
    else:
        current_balance = Decimal(str(wallet.balance))

    if wallet and wallet.is_reconcile_locked:
        return False, "WALLET_RECONCILE_LOCKED", current_balance, threshold

    if current_balance < threshold:
        return False, "WALLET_INSUFFICIENT_BALANCE", current_balance, threshold

    return True, "", current_balance, threshold
