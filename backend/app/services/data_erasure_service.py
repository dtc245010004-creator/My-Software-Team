"""Xử lý yêu cầu và ẩn danh hóa dữ liệu tài xế theo S-57."""

import hashlib
import hmac
import logging
import re
import secrets
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.security import get_password_hash
from app.models.data_erasure_request import DataErasureRequest
from app.models.id_tag import IdTag
from app.models.ocpp_message import OcppMessage
from app.models.orphan_message import OrphanMessage
from app.models.payment import TopupOrder
from app.models.remote_start_request import RemoteStartRequest
from app.models.session import ChargingSession
from app.models.user import User
from app.models.wallet import Wallet
from app.services.audit_service import ghi_nhat_ky
from app.services.identity_guard_service import lock_user_for_sensitive_operation

logger = logging.getLogger("ev_csms.data_erasure")

# Các trường nhận diện được thay đổi khi hoàn tất yêu cầu. Tập trung danh sách
# này để có thể phối hợp whitelist trường định danh với S-55 trong tương lai.
IDENTITY_FIELDS_TO_ANONYMIZE = (
    "users.username",
    "users.email",
    "users.full_name",
    "users.password_hash",
    "users.is_active",
    "users.data_erased_at",
    "users.failed_login_attempts",
    "users.locked_until",
    "charging_sessions.user_id",
    "charging_sessions.id_tag",
    "charging_sessions.abnormal_reason/stop_reason (sanitize)",
    "id_tags.* (delete)",
    "remote_start_requests.* (delete)",
    "topup_orders.failure_reason (sanitize)",
    "ocpp_messages.response_payload (sanitize)",
    "orphan_messages.payload (sanitize)",
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _audit(
    db: Session,
    *,
    actor_id: int | None,
    driver_id: int,
    request_id: int,
    action: str,
    status_value: str,
    reason: str | None = None,
) -> None:
    default_reasons = {
        "DATA_ERASURE_REQUESTED": "Tài xế gửi yêu cầu ẩn danh hóa.",
        "DATA_ERASURE_REQUEST_DUPLICATE": "Đã có yêu cầu đang chờ duyệt.",
        "DATA_ERASURE_APPROVED": "Quản trị viên duyệt yêu cầu ẩn danh hóa.",
        "DATA_ERASURE_COMPLETED": "Đã hoàn tất ẩn danh hóa dữ liệu.",
    }
    data = {
        "actor_id": actor_id,
        "driver_id": driver_id,
        "request_id": request_id,
        "status": status_value,
        "reason": reason or default_reasons.get(action, action),
    }
    if action in {
        "DATA_ERASURE_APPROVAL_BLOCKED",
        "DATA_ERASURE_APPROVED",
        "DATA_ERASURE_REJECTED",
        "DATA_ERASURE_COMPLETED",
        "DATA_ERASURE_FAILED",
    }:
        data["admin_id"] = actor_id
    ghi_nhat_ky(
        db,
        user_id=actor_id,
        action=action,
        object_type="data_erasure_request",
        object_id=request_id,
        data=data,
    )


def _record_failure_audit(
    bind, *, actor_id: int | None, driver_id: int, request_id: int, reason: str
) -> None:
    audit_session = sessionmaker(bind=bind, expire_on_commit=False)()
    try:
        _audit(
            audit_session,
            actor_id=actor_id,
            driver_id=driver_id,
            request_id=request_id,
            action="DATA_ERASURE_FAILED",
            status_value="FAILED",
            reason=reason,
        )
        audit_session.commit()
    except Exception:
        audit_session.rollback()
        logger.exception("Không thể ghi audit thất bại cho yêu cầu #%s", request_id)
    finally:
        audit_session.close()


def create_data_erasure_request(db: Session, user_id: int) -> DataErasureRequest:
    user = lock_user_for_sensitive_operation(db, user_id)
    if user.role != "CUSTOMER":
        raise HTTPException(status_code=403, detail="Chỉ tài xế mới được gửi yêu cầu.")
    existing = (
        db.query(DataErasureRequest)
        .filter(
            DataErasureRequest.user_id == user_id,
            DataErasureRequest.status == "PENDING",
        )
        .first()
    )
    if existing:
        _audit(
            db,
            actor_id=user_id,
            driver_id=user_id,
            request_id=existing.id,
            action="DATA_ERASURE_REQUEST_DUPLICATE",
            status_value="FAILED",
            reason="Đã có yêu cầu đang chờ duyệt.",
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bạn đã có yêu cầu ẩn danh hóa đang chờ duyệt.",
        )
    request = DataErasureRequest(user_id=user_id, status="PENDING")
    db.add(request)
    try:
        db.flush()
        _audit(
            db,
            actor_id=user_id,
            driver_id=user_id,
            request_id=request.id,
            action="DATA_ERASURE_REQUESTED",
            status_value="SUCCESS",
        )
        db.commit()
        db.refresh(request)
        return request
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bạn đã có yêu cầu ẩn danh hóa đang chờ duyệt.",
        ) from exc
    except Exception:
        db.rollback()
        raise


def list_own_data_erasure_requests(db: Session, user_id: int):
    return (
        db.query(DataErasureRequest)
        .filter(DataErasureRequest.user_id == user_id)
        .order_by(DataErasureRequest.requested_at.desc(), DataErasureRequest.id.desc())
        .all()
    )


def list_data_erasure_requests(db: Session, status_filter: str | None = None):
    query = db.query(DataErasureRequest)
    if status_filter:
        query = query.filter(DataErasureRequest.status == status_filter.upper())
    return query.order_by(
        DataErasureRequest.requested_at.desc(), DataErasureRequest.id.desc()
    ).all()


def reject_data_erasure_request(
    db: Session, request_id: int, admin_id: int, reason: str
) -> DataErasureRequest:
    clean_reason = (reason or "").strip()
    if not clean_reason:
        raise HTTPException(status_code=422, detail="Lý do từ chối không được để trống.")
    request = db.query(DataErasureRequest).filter(DataErasureRequest.id == request_id).first()
    if request is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu.")
    if request.status != "PENDING":
        raise HTTPException(status_code=409, detail="Yêu cầu không còn ở trạng thái chờ duyệt.")
    user = lock_user_for_sensitive_operation(
        db, request.user_id, require_active=False
    )
    clean_reason = _sanitize_text(clean_reason, _identity_values(db, user))
    request.status = "REJECTED"
    request.reviewed_by_id = admin_id
    request.reviewed_at = _now()
    request.reject_reason = clean_reason
    request.block_reason = None
    _audit(
        db,
        actor_id=admin_id,
        driver_id=request.user_id,
        request_id=request.id,
        action="DATA_ERASURE_REJECTED",
        status_value="SUCCESS",
        reason=clean_reason,
    )
    db.commit()
    db.refresh(request)
    return request


def _identity_values(db: Session, user: User) -> list[str]:
    values = [user.username, user.email, user.full_name]
    values.extend(
        row[0]
        for row in db.query(IdTag.code).filter(IdTag.user_id == user.id).all()
        if row[0]
    )
    values.extend(
        row[0]
        for row in db.query(ChargingSession.id_tag)
        .filter(ChargingSession.driver_id == user.id)
        .all()
        if row[0]
    )
    values.extend(
        row[0]
        for row in db.query(RemoteStartRequest.id_tag)
        .filter(RemoteStartRequest.user_id == user.id)
        .all()
        if row[0]
    )
    return sorted({value for value in values if value and len(value.strip()) >= 3}, key=len, reverse=True)


def _sanitize_text(value: str | None, identifiers: list[str]) -> str | None:
    if not value:
        return value
    sanitized = value
    for identifier in identifiers:
        sanitized = re.sub(re.escape(identifier), "[đã ẩn danh]", sanitized, flags=re.IGNORECASE)
    return sanitized


def _anonymous_tag(user_id: int, tag: str) -> str:
    digest = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        f"{user_id}:{tag}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:32]
    return f"{settings.DATA_ERASURE_IDENTIFIER_PREFIX}-tag-{digest}"


def _anonymous_account_identifiers(db: Session, user: User) -> tuple[str, str]:
    prefix = settings.DATA_ERASURE_IDENTIFIER_PREFIX
    suffix = 0
    while True:
        suffix_part = f"-{suffix}" if suffix else ""
        username = f"{prefix}_{user.id}{suffix_part}"
        email = f"{prefix}-{user.id}{suffix_part}@anonymized.invalid"
        collision = (
            db.query(User.id)
            .filter(
                User.id != user.id,
                (User.username == username) | (User.email == email),
            )
            .first()
        )
        if collision is None:
            return username, email
        suffix += 1


def _find_block_reason(db: Session, user_id: int, wallet: Wallet | None) -> str | None:
    if wallet is not None:
        balance = wallet.balance or 0
        if balance > 0:
            return "Ví còn số dư dương; cần xử lý hoàn tiền trước khi duyệt."
        if balance < 0:
            return "Ví còn số dư âm; cần xử lý khoản nợ trước khi duyệt."
        if wallet.is_reconcile_locked:
            return "Ví đang bị khóa đối soát; cần xử lý trước khi duyệt."

    active_session = (
        db.query(ChargingSession.id)
        .filter(
            ChargingSession.driver_id == user_id,
            ChargingSession.status.in_(["CHARGING", "ACTIVE"]),
        )
        .first()
    )
    if active_session:
        return "Tài xế còn phiên đang sạc; hãy kết thúc phiên trước khi duyệt."

    unresolved = (
        db.query(ChargingSession.id)
        .filter(
            ChargingSession.driver_id == user_id,
            (
                ChargingSession.status.in_(["ABNORMAL", "NEEDS_REVIEW"])
                | ChargingSession.is_abnormal.is_(True)
                | ChargingSession.needs_review.is_(True)
            ),
        )
        .first()
    )
    if unresolved:
        return "Tài xế còn phiên bất thường hoặc cần xem xét chưa xử lý."

    pending_topup = (
        db.query(TopupOrder.id)
        .filter(TopupOrder.user_id == user_id, TopupOrder.status == "PENDING")
        .first()
    )
    if pending_topup:
        return "Tài xế còn giao dịch nạp tiền đang chờ xử lý."
    return None


def _anonymize_user_data(db: Session, user: User) -> None:
    identifiers = _identity_values(db, user)
    sessions = (
        db.query(ChargingSession)
        .filter(ChargingSession.driver_id == user.id)
        .with_for_update()
        .all()
    )
    for charging_session in sessions:
        if charging_session.id_tag:
            charging_session.id_tag = _anonymous_tag(user.id, charging_session.id_tag)
        charging_session.driver_id = None
        charging_session.abnormal_reason = _sanitize_text(
            charging_session.abnormal_reason, identifiers
        )
        charging_session.stop_reason = _sanitize_text(charging_session.stop_reason, identifiers)

    # IdTag và yêu cầu RemoteStart chứa liên kết định danh/đầu nối/thời gian;
    # xóa các dữ liệu tác nghiệp đã hết nhu cầu, giữ lại phiên và số liệu tài chính.
    db.query(RemoteStartRequest).filter(RemoteStartRequest.user_id == user.id).delete(
        synchronize_session=False
    )
    db.query(IdTag).filter(IdTag.user_id == user.id).delete(synchronize_session=False)

    orders = db.query(TopupOrder).filter(TopupOrder.user_id == user.id).all()
    for order in orders:
        order.failure_reason = _sanitize_text(order.failure_reason, identifiers)

    for message in db.query(OcppMessage).all():
        message.response_payload = _sanitize_text(message.response_payload, identifiers)
    for orphan in db.query(OrphanMessage).all():
        orphan.payload = _sanitize_text(orphan.payload, identifiers)

    # Sổ cái và audit log là append-only: tuyệt đối không cập nhật/xóa lịch sử.

    user.username, user.email = _anonymous_account_identifiers(db, user)
    user.full_name = "Người dùng đã xoá"
    user.password_hash = get_password_hash(secrets.token_urlsafe(48))
    user.is_active = False
    user.data_erased_at = _now()
    user.failed_login_attempts = 0
    user.locked_until = None


def approve_data_erasure_request(
    db: Session, request_id: int, admin_id: int
) -> DataErasureRequest:
    preview = db.query(DataErasureRequest).filter(DataErasureRequest.id == request_id).first()
    if preview is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu.")
    if preview.status == "COMPLETED":
        return preview
    if preview.status != "PENDING":
        raise HTTPException(status_code=409, detail="Yêu cầu không còn ở trạng thái chờ duyệt.")
    driver_id = preview.user_id
    bind = db.get_bind()

    try:
        user = lock_user_for_sensitive_operation(
            db, driver_id, require_active=False
        )
        wallet = (
            db.query(Wallet)
            .filter(Wallet.user_id == driver_id)
            .with_for_update()
            .populate_existing()
            .first()
        )
        request = (
            db.query(DataErasureRequest)
            .filter(DataErasureRequest.id == request_id)
            .with_for_update()
            .populate_existing()
            .first()
        )
        if request is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu.")  # noqa: TRY301
        if request.status == "COMPLETED":
            db.rollback()
            return request
        if request.status != "PENDING":
            raise HTTPException(status_code=409, detail="Yêu cầu không còn ở trạng thái chờ duyệt.")  # noqa: TRY301

        block_reason = _find_block_reason(db, driver_id, wallet)
        if block_reason:
            request.block_reason = block_reason
            _audit(
                db,
                actor_id=admin_id,
                driver_id=driver_id,
                request_id=request.id,
                action="DATA_ERASURE_APPROVAL_BLOCKED",
                status_value="FAILED",
                reason=block_reason,
            )
            db.commit()
            raise HTTPException(status_code=409, detail=block_reason)  # noqa: TRY301

        request.status = "APPROVED"
        request.reviewed_by_id = admin_id
        request.reviewed_at = _now()
        request.block_reason = None
        _audit(
            db,
            actor_id=admin_id,
            driver_id=driver_id,
            request_id=request.id,
            action="DATA_ERASURE_APPROVED",
            status_value="SUCCESS",
        )
        _anonymize_user_data(db, user)
        request.status = "COMPLETED"
        request.completed_at = _now()
        _audit(
            db,
            actor_id=admin_id,
            driver_id=driver_id,
            request_id=request.id,
            action="DATA_ERASURE_COMPLETED",
            status_value="SUCCESS",
        )
        db.commit()
        db.refresh(request)
        return request
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception(
            "Ẩn danh hóa thất bại: request_id=%s error_type=%s",
            request_id,
            type(exc).__name__,
            exc_info=False,
        )
        _record_failure_audit(
            bind,
            actor_id=admin_id,
            driver_id=driver_id,
            request_id=request_id,
            reason=f"Lỗi xử lý {type(exc).__name__}.",
        )
        raise HTTPException(
            status_code=500,
            detail="Không thể hoàn tất yêu cầu ẩn danh hóa; dữ liệu đã được khôi phục.",
        ) from exc
