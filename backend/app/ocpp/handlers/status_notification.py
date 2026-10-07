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
        return ts_val
    try:
        clean_ts = str(ts_val).replace("Z", "+00:00")
        return datetime.fromisoformat(clean_ts)
    except (ValueError, TypeError):
        return None


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

        connector.status = OCPP_TO_CONNECTOR_STATUS[status]
        connector.ocpp_status = status

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
        connector.status = internal_status
        connector.ocpp_status = raw_status

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
