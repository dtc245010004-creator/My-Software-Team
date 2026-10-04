"""Nghiệp vụ xử lý CALL BootNotification của OCPP 1.6J."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.station import ChargingPoint


def handle_boot_notification(
    db: Session, charging_point: ChargingPoint, payload: dict[str, Any]
) -> dict[str, Any]:
    """Cập nhật thông tin trụ và tạo payload CALLRESULT BootNotification.

    Convention cho handler OCPP: nhận session CSDL, thực thể đã được gateway tra
    theo mã trụ và payload đã parse; chỉ xử lý nghiệp vụ của action rồi trả về
    dictionary để gateway đóng gói thành CALLRESULT. Handler không tự commit;
    gateway lưu phản hồi chống lặp và commit cả hai thay đổi trong cùng
    transaction. Handler mới nên theo cùng quy ước và không phụ thuộc vào
    WebSocket hay FastAPI.
    """

    charging_point.charge_point_vendor = payload.get("chargePointVendor")
    charging_point.charge_point_model_name = payload.get("chargePointModel")
    charging_point.firmware_version = payload.get("firmwareVersion")

    status = "Rejected" if not charging_point.station.is_active else "Accepted"
    if status == "Accepted":
        charging_point.status = "online"

    return {
        "currentTime": datetime.now(timezone.utc).isoformat(),
        "interval": settings.HEARTBEAT_INTERVAL_SECONDS,
        "status": status,
    }
