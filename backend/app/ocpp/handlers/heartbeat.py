"""Nghiệp vụ xử lý CALL Heartbeat của OCPP 1.6J."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.station import ChargingPoint


def handle_heartbeat(
    db: Session, charging_point: ChargingPoint, payload: dict[str, Any]
) -> dict[str, Any]:
    """Cập nhật last_seen_at và tự động phục hồi trạng thái Online nếu đang Offline (T-27)."""
    now = datetime.now(timezone.utc)
    charging_point.last_seen_at = now
    charging_point.status = "Online"

    return {
        "currentTime": now.isoformat(),
    }
