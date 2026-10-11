import logging
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.services.audit_service import ghi_nhat_ky

logger = logging.getLogger(__name__)


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
    note: str | None = None,
) -> Wallet:
    """
    Nạp tiền vào ví điện tử:
    - Bắt đầu Transaction, khóa bi quan (with_for_update).
    - Tăng số dư, nếu số dư >= 0 thì giải phóng khóa nợ (is_debt_locked = False).
    - Tạo bản ghi WalletTransaction loại TOPUP.
    """
    wallet = (
        db.query(Wallet).filter(Wallet.user_id == user_id).with_for_update().first()
    )
    if not wallet:
        # Tự động khởi tạo ví 0 VND nếu tài khoản chưa có ví (chống tài khoản mồ côi ví)
        wallet = Wallet(user_id=user_id, balance=Decimal("0.00"), is_debt_locked=False)
        db.add(wallet)
        db.flush()

    wallet.balance += amount
    if wallet.balance >= 0:
        wallet.is_debt_locked = False

    tx = WalletTransaction(
        wallet_id=wallet.id,
        amount=amount,
        transaction_type="TOPUP",
        balance_before=wallet.balance - amount,
        balance_after=wallet.balance,
        reference_type="TOPUP",
        note=note or "Nạp tiền vào ví điện tử",
    )
    db.add(tx)
    db.commit()
    db.refresh(wallet)
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
        db.query(Wallet).filter(Wallet.user_id == user_id).with_for_update().first()
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
