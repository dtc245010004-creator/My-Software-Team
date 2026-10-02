import logging

logger = logging.getLogger(__name__)
from datetime import datetime, timezone
from typing import Any, Dict

from sqlalchemy.orm import Session

from app.models.station import ChargingPoint, Connector, ConnectorError
from app.ocpp.status_mapping import map_ocpp_to_internal


def parse_timestamp_safe(ts_val):
    if not ts_val:
        return None
    if isinstance(ts_val, datetime):
        return ts_val
    try:
        # Hỗ trợ ISO 8601 (kể cả kết thúc bằng Z)
        clean_ts = str(ts_val).replace("Z", "+00:00")
        return datetime.fromisoformat(clean_ts)
    except (ValueError, TypeError):
        return None

async def handle(db: Session, payload: Dict[str, Any], charge_point: ChargingPoint, charge_point_id: Any) -> Dict[str, Any]:
    connector_id = payload.get("connectorId", 0)
    raw_status = payload.get("status", "Available")
    error_code = payload.get("errorCode", "NoError")
    vendor_error_code = payload.get("vendorErrorCode")
    timestamp = payload.get("timestamp")

    now = datetime.now(timezone.utc)
    charge_point.last_seen_at = now

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
