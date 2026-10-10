"""Nghiệp vụ xử lý CALL StatusNotification của OCPP 1.6J."""

import logging
from datetime import datetime, timezone
from typing import Any, Dict

from sqlalchemy.orm import Session

from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, ConnectorError
from app.ocpp.status_mapping import map_ocpp_to_internal

logger = logging.getLogger(__name__)

# Trạng thái lưu cho bảng connectors hiện tại của project.
OCPP_TO_CONNECTOR_STATUS = {
    "Available": "AVAILABLE",
    "Preparing": "OCCUPIED",
    "Charging": "CHARGING",
    "SuspendedEV": "OCCUPIED",
    "SuspendedEVSE": "OCCUPIED",
    "Finishing": "OCCUPIED",
    "Reserved": "OCCUPIED",
    "Unavailable": "UNAVAILABLE",
    "Faulted": "FAULTED",
}

# connectorId = 0 biểu thị trạng thái của toàn trụ.
OCPP_TO_CHARGING_POINT_STATUS = {
    "Available": "AVAILABLE",
    "Preparing": "PREPARING",
    "Charging": "CHARGING",
    "SuspendedEV": "CHARGING",
    "SuspendedEVSE": "CHARGING",
    "Finishing": "CHARGING",
    "Reserved": "UNAVAILABLE",
    "Unavailable": "UNAVAILABLE",
    "Faulted": "FAULTED",
}

_MAX_TEXT_LENGTH = 50


def _clip(value: Any) -> str | None:
    """Chuyển về chuỗi và cắt theo độ dài cột để DB không báo lỗi."""
    if value is None:
        return None
    return str(value)[:_MAX_TEXT_LENGTH]


def parse_timestamp_safe(ts_val: Any) -> datetime | None:
    if not ts_val:
        return None
    if isinstance(ts_val, datetime):
        return (
            ts_val.replace(tzinfo=timezone.utc)
            if ts_val.tzinfo is None
            else ts_val
        )
    try:
        clean_ts = str(ts_val).replace("Z", "+00:00")
        parsed = datetime.fromisoformat(clean_ts)
        return (
            parsed.replace(tzinfo=timezone.utc)
            if parsed.tzinfo is None
            else parsed
        )
    except (ValueError, TypeError):
        return None


def _apply_connector_status(
    connector: Connector,
    raw_status: str,
    internal_status: str,
    timestamp: Any,
) -> None:
    previous_status = getattr(connector, "ocpp_status", None)
    if previous_status != raw_status:
        status_time = parse_timestamp_safe(timestamp) or datetime.now(timezone.utc)
        connector.status_changed_at = status_time
        if raw_status in ("Finishing", "SuspendedEV") and getattr(
            connector, "idle_started_at", None
        ) is None:
            connector.idle_started_at = status_time
            connector.idle_ended_at = None
        elif raw_status == "Available" and getattr(
            connector, "idle_started_at", None
        ) is not None:
            connector.idle_ended_at = status_time
            # TODO(S-28): Nếu Available đến sau khi phiên đã quyết toán, bổ sung
            # luồng tính phí sau tại đây sau khi mentor chốt cách ghi sổ/trừ ví.
            # Không cập nhật hóa đơn đã chốt hoặc tự động trừ ví lần hai ở đây.

    connector.status = internal_status
    connector.ocpp_status = raw_status


def handle_status_notification(
    db: Session,
    charging_point: ChargingPoint,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Xử lý trạng thái connector và trả CALLRESULT rỗng."""

    connector_id = payload.get("connectorId", 0)
    status = payload.get("status")
    error_code = payload.get("errorCode", "NoError")
    vendor_error_code = payload.get("vendorErrorCode")
    info = payload.get("info")
    timestamp = payload.get("timestamp")

    if status not in OCPP_TO_CONNECTOR_STATUS:
        logger.warning(
            "Trạng thái OCPP chưa được hỗ trợ code=%s connector_id=%s status=%s",
            charging_point.code,
            connector_id,
            status,
        )
        return {}

    # connectorId = 0: StatusNotification áp dụng cho toàn bộ trụ.
    if connector_id == 0:
        charging_point.status = OCPP_TO_CHARGING_POINT_STATUS.get(status, "AVAILABLE")
    else:
        connector = (
            db.query(Connector)
            .filter(
                Connector.charging_point_id == charging_point.id,
                Connector.connector_number == connector_id,
            )
            .first()
        )

        if connector is None:
            logger.warning(
                "Bỏ qua StatusNotification của đầu nối chưa khai báo code=%s connector_id=%s",
                charging_point.code,
                connector_id,
            )
            return {}

        _apply_connector_status(
            connector,
            status,
            OCPP_TO_CONNECTOR_STATUS[status],
            timestamp,
        )

        if status == "Charging":
            active_session = (
                db.query(ChargingSession)
                .filter(
                    ChargingSession.connector_id == connector.id,
                    ChargingSession.status == "CHARGING",
                )
                .with_for_update(read=True)
                .first()
            )
            if active_session is not None:
                logger.info(
                    "Khôi phục trạng thái Charging từ phiên lưu trong DB "
                    "code=%s connector_id=%s transactionId=%s",
                    charging_point.code,
                    connector_id,
                    active_session.transaction_id,
                )
        elif status == "Available":
            active_session = (
                db.query(ChargingSession)
                .filter(
                    ChargingSession.connector_id == connector.id,
                    ChargingSession.status == "CHARGING",
                )
                .with_for_update()
                .first()
            )
            if active_session is not None:
                active_session.needs_review = True
                active_session.is_abnormal = True
                active_session.abnormal_reason = (
                    "StatusNotificationAvailableWithoutStopTransaction"
                )
                logger.warning(
                    "Đầu nối Available nhưng phiên chưa nhận StopTransaction "
                    "code=%s connector_id=%s transactionId=%s; đánh dấu cần đối soát",
                    charging_point.code,
                    connector_id,
                    active_session.transaction_id,
                )

        if error_code and error_code != "NoError":
            db.add(
                ConnectorError(
                    connector_id=connector.id,
                    error_code=_clip(error_code),
                    vendor_error_code=_clip(vendor_error_code),
                    info=_clip(info),
                    created_at=parse_timestamp_safe(timestamp),
                )
            )

    if error_code and error_code != "NoError":
        logger.warning(
            "StatusNotification báo lỗi code=%s connector_id=%s error_code=%s vendor_error_code=%s",
            charging_point.code,
            connector_id,
            error_code,
            vendor_error_code,
        )

    return {}


async def handle(
    db: Session,
    payload: Dict[str, Any],
    charge_point: ChargingPoint,
    charge_point_id: Any,
) -> Dict[str, Any]:
    """Async wrapper tương thích ngược với unit tests T-20/T-21."""
    connector_id = payload.get("connectorId", 0)
    raw_status = payload.get("status", "Available")
    error_code = payload.get("errorCode", "NoError")
    vendor_error_code = payload.get("vendorErrorCode")
    timestamp = payload.get("timestamp")

    now = datetime.now(timezone.utc)
    charge_point.last_seen_at = now
    charge_point.status = "Online"

    internal_status = map_ocpp_to_internal(raw_status)

    if connector_id == 0:
        charge_point.status = internal_status
        db.commit()
        return {}

    connector = (
        db.query(Connector)
        .filter_by(charge_point_id=charge_point.id, connector_number=connector_id)
        .first()
    )

    if connector:
        _apply_connector_status(
            connector,
            raw_status,
            internal_status,
            timestamp,
        )

        if error_code and error_code != "NoError":
            conn_error = ConnectorError(
                connector_id=connector.id,
                error_code=error_code,
                vendor_error_code=vendor_error_code,
                created_at=parse_timestamp_safe(timestamp),
            )
            db.add(conn_error)

        db.commit()
    else:
        logger.warning(
            f"Bỏ qua đầu nối chưa khai báo: connectorId={connector_id} không tồn tại trên trụ {charge_point_id}."
        )

    return {}
