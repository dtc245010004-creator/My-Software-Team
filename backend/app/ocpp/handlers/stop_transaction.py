"""Nghiệp vụ xử lý CALL StopTransaction của OCPP 1.6J (Task T-38)."""

import json
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.models.orphan_message import OrphanMessage
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector
from app.services.billing import calculate_session_total
from app.services.billing_segment_service import persist_session_billing_segments
from app.services.metering import calculate_kwh

logger = logging.getLogger(__name__)


def parse_timestamp_safe(ts_val: Any) -> datetime | None:
    """Đọc timestamp OCPP; không thay timestamp thiếu/sai bằng giờ nhận tin."""
    if not ts_val:
        return None
    if isinstance(ts_val, datetime):
        if ts_val.tzinfo is None:
            return ts_val.replace(tzinfo=timezone.utc)
        return ts_val
    try:
        clean_ts = str(ts_val).replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def handle_stop_transaction(
    db: Session, charging_point: ChargingPoint, payload: dict[str, Any]
) -> dict[str, Any]:
    """Xử lý StopTransaction CALL từ trạm sạc:

    1. Tìm ChargingSession theo transactionId.
    2. Nếu không tìm thấy: Ghi warning, lưu vào orphan_messages và trả phản hồi hợp lệ để tránh treo trụ.
    3. Nếu phiên đã COMPLETED trước đó: Trả về kết quả ngay (Idempotent).
    4. Tính kWh tiêu thụ qua module metering.
       - Nếu số đo lùi: Đánh dấu NEEDS_REVIEW, total_kwh = None, ghi lý do CounterRollback.
       - Nếu bình thường: Đánh dấu COMPLETED, ghi nhận total_kwh và total_amount.
    5. Đưa cổng sạc về trạng thái AVAILABLE.
    6. Trả về idTagInfo.
    """
    transaction_id = payload.get("transactionId")
    meter_stop = payload.get("meterStop")
    raw_timestamp = payload.get("timestamp")
    reason = payload.get("reason")
    id_tag_stop = payload.get("idTag")
    stop_time = parse_timestamp_safe(raw_timestamp)

    # 1. Tra cứu phiên sạc
    session: ChargingSession | None = None
    if transaction_id is not None:
        session = (
            db.query(ChargingSession)
            .join(Connector, ChargingSession.connector_id == Connector.id)
            .filter(
                ChargingSession.transaction_id == transaction_id,
                Connector.charge_point_id == charging_point.id,
            )
            .first()
        )

    # 2. Xử lý bản tin mồ côi (Orphan Message)
    if session is None:
        logger.warning(
            "StopTransaction mồ côi: không tìm thấy transactionId=%s trên trụ %s",
            transaction_id,
            charging_point.code,
        )
        orphan = OrphanMessage(
            charge_point_code=charging_point.code or "",
            message_id=None,
            action="StopTransaction",
            payload=json.dumps(payload),
            created_at=datetime.now(timezone.utc),
        )
        db.add(orphan)
        db.commit()
        return {"idTagInfo": {"status": "Accepted"}}

    # 3. Idempotency: Nếu phiên đã COMPLETED trước đó thì trả kết quả ngay
    if session.status == "COMPLETED":
        logger.info(
            "StopTransaction lặp lại trên phiên đã hoàn tất: transactionId=%s",
            transaction_id,
        )
        return {"idTagInfo": {"status": "Accepted"}}

    # 4. Tính toán điện năng tiêu thụ (Task T-39)
    meter_stop_val = int(meter_stop) if meter_stop is not None else session.meter_start
    kwh = calculate_kwh(session.meter_start, meter_stop_val)

    if kwh is None:
        # Số đo lùi bất thường
        logger.warning(
            "Số đo điện lùi bất thường trên transactionId=%s: meter_start=%s Wh > meter_stop=%s Wh",
            session.transaction_id,
            session.meter_start,
            meter_stop_val,
        )
        session.status = "NEEDS_REVIEW"
        session.total_kwh = None
        session.meter_stop = meter_stop_val
        session.meter_stop_kwh = None
        session.stop_reason = reason or "CounterRollback"
        session.stop_time = stop_time
        session.end_time = stop_time
        if id_tag_stop:
            session.stop_id_tag = str(id_tag_stop)
    else:
        # Số đo hợp lệ
        session.status = "COMPLETED"
        decimal_kwh = Decimal(str(kwh))
        session.total_kwh = decimal_kwh
        session.meter_stop = meter_stop_val
        session.meter_stop_kwh = Decimal(str(round(meter_stop_val / 1000.0, 3)))
        session.stop_reason = reason or "Local"
        session.stop_time = stop_time
        session.end_time = stop_time
        if id_tag_stop:
            session.stop_id_tag = str(id_tag_stop)

        billing_total = calculate_session_total(session, session.tariff)
        session.idle_amount = billing_total.idle_amount
        session.idle_chargeable_minutes = billing_total.idle_chargeable_minutes
        session.idle_fee_per_minute_applied = billing_total.idle_fee_per_minute
        session.idle_grace_minutes_applied = billing_total.idle_grace_minutes
        session.total_amount = billing_total.total_amount
        persist_session_billing_segments(db, session)

    # 5. Giải phóng cổng sạc
    if session.connector:
        session.connector.status = "AVAILABLE"

    db.commit()
    logger.info(
        "StopTransaction xử lý thành công: transactionId=%s status=%s total_kwh=%s",
        session.transaction_id,
        session.status,
        session.total_kwh,
    )
    return {"idTagInfo": {"status": "Accepted"}}
