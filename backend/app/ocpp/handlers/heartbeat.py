"""Nghiệp vụ xử lý CALL Heartbeat của OCPP 1.6J."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.station import ChargingPoint


def handle_heartbeat(
    db: Session, charging_point: ChargingPoint, payload: dict[str, Any]
) -> dict[str, str]:
    """Trả về thời gian hiện tại của máy chủ cho Heartbeat."""
    return {"currentTime": datetime.now(timezone.utc).isoformat()}