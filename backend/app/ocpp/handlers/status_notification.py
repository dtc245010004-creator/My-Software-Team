"""
Handler xử lý tin nhắn OCPP StatusNotification.
"""
from datetime import datetime, timezone
import logging
from sqlalchemy.orm import Session

from app.models.station import ChargingPoint, Connector, ConnectorError
from app.ocpp.status_mapping import map_ocpp_to_internal

logger = logging.getLogger("ev_csms.ocpp.status_notification")


async def handle(
    db: Session,
    payload: dict,
    charge_point: ChargingPoint,
    charge_point_id: int,
) -> dict:
    """
    Hàm thực thi xử lý thông điệp StatusNotification từ trạm sạc theo chuẩn T-20.
    """
    connector_id: int = payload.get("connectorId", 0)
    status_str: str = payload.get("status", "Unknown")
    error_code: str = payload.get("errorCode", "NoError")
    vendor_error_code: str | None = payload.get("vendorErrorCode")

    logger.info(
        "Nhận StatusNotification từ charge_point_id=%s, connectorId=%s, status=%s, errorCode=%s",
        charge_point_id,
        connector_id,
        status_str,
        error_code,
    )

    connector: Connector | None = None

    # 1. Kiểm tra nếu connectorId > 0 nhưng không tồn tại trong khai báo -> Bỏ qua (T-22)
    if connector_id > 0:
        connector = (
            db.query(Connector)
            .filter_by(charging_point_id=charge_point_id, connector_number=connector_id)
            .first()
        )
        if not connector:
            logger.warning(
                "Cảnh báo: Trụ %s gửi connectorId=%s không tồn tại trong khai báo. Bỏ qua.",
                charge_point_id,
                connector_id,
            )
            return {}

    # Chuyển đổi trạng thái OCPP sang trạng thái nội bộ
    internal_status = map_ocpp_to_internal(status_str)

    # 2 & 3. Cập nhật trạng thái cấp trụ (connectorId = 0) hoặc cấp đầu nối (connectorId > 0)
    if connector_id == 0:
        charge_point.status = internal_status
    elif connector is not None:
        connector.status = internal_status
        if hasattr(connector, "ocpp_status"):
            connector.ocpp_status = status_str

    # 5. Cập nhật cột last_seen_at trên ChargingPoint
    charge_point.last_seen_at = datetime.now(timezone.utc)

    # 4. Lưu errorCode vào bảng connector_errors nếu khác NoError (Task T-21)
    if error_code != "NoError" and connector_id > 0 and connector is not None:
        error_entry = ConnectorError(
            connector_id=connector.id,
            error_code=error_code,
            vendor_error_code=vendor_error_code,
        )
        db.add(error_entry)
        logger.info(
            "Đã ghi nhận lỗi đầu nối: connector_id=%s, errorCode=%s, vendorErrorCode=%s",
            connector.id,
            error_code,
            vendor_error_code,
        )

    db.commit()

    return {}


class StatusNotificationHandler:
    """Lớp bọc tương thích ngược với __init__.py"""
    @staticmethod
    async def handle(db, payload, charge_point, charge_point_id):
        return await handle(db, payload, charge_point, charge_point_id)
