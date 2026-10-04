"""Nghiệp vụ xử lý CALL StatusNotification của OCPP 1.6J."""

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models.station import ChargingPoint, Connector, ConnectorError

logger = logging.getLogger(__name__)


# Trạng thái lưu cho bảng connectors hiện tại của project.
# Model Connector của bạn cho phép:
# AVAILABLE, OCCUPIED, CHARGING, FAULTED, UNAVAILABLE
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
# ChargingPoint hiện cho phép:
# AVAILABLE, PREPARING, CHARGING, FAULTED, UNAVAILABLE, online
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

# Độ dài tối đa của các cột chuỗi trong bảng connector_errors.
_MAX_TEXT_LENGTH = 50


def _clip(value: Any) -> str | None:
    """Chuyển về chuỗi và cắt theo độ dài cột để DB không báo lỗi."""

    if value is None:
        return None
    return str(value)[:_MAX_TEXT_LENGTH]


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

    if status not in OCPP_TO_CONNECTOR_STATUS:
        logger.warning(
            "Trạng thái OCPP chưa được hỗ trợ "
            "code=%s connector_id=%s status=%s",
            charging_point.code,
            connector_id,
            status,
        )
        return {}

    # connectorId = 0:
    # StatusNotification áp dụng cho toàn bộ trụ.
    if connector_id == 0:
        charging_point.status = OCPP_TO_CHARGING_POINT_STATUS[status]

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
                "Bỏ qua StatusNotification của đầu nối chưa khai báo "
                "code=%s connector_id=%s",
                charging_point.code,
                connector_id,
            )
            return {}

        connector.status = OCPP_TO_CONNECTOR_STATUS[status]

        # T-21: mỗi lần errorCode != NoError thì thêm một bản ghi mới.
        # Chỉ thêm, không xóa hay ghi đè, nên lỗi cũ vẫn còn khi đầu nối
        # quay lại Available.
        if error_code != "NoError":
            db.add(
                ConnectorError(
                    connector_id=connector.id,
                    error_code=_clip(error_code),
                    vendor_error_code=_clip(vendor_error_code),
                    info=_clip(info),
                )
            )

    # Giữ log lỗi như cũ cho cả lỗi mức trụ (connectorId = 0), vì bảng
    # connector_errors chỉ lưu lỗi gắn với từng đầu nối.
    if error_code != "NoError":
        logger.warning(
            "StatusNotification báo lỗi "
            "code=%s connector_id=%s error_code=%s vendor_error_code=%s",
            charging_point.code,
            connector_id,
            error_code,
            vendor_error_code,
        )

    # OCPP 1.6 StatusNotification không cần payload phản hồi.
    return {}