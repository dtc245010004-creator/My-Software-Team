"""Nghiệp vụ xử lý CALL BootNotification của OCPP 1.6J."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.station import ChargingPoint


def handle_boot_notification(
    db: Session,
    charging_point: ChargingPoint,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Cập nhật thông tin trụ và tạo payload CALLRESULT BootNotification."""

    charging_point.charge_point_vendor = payload.get("chargePointVendor")
    charging_point.charge_point_model_name = payload.get("chargePointModel")
    charging_point.firmware_version = payload.get("firmwareVersion")

    status = (
        "Accepted"
        if charging_point.is_active and charging_point.station.is_active
        else "Rejected"
    )

    if status == "Accepted":
        charging_point.status = "online"

    return {
        "currentTime": datetime.now(timezone.utc).isoformat(),
        "interval": settings.HEARTBEAT_INTERVAL_SECONDS,
        "status": status,
    }