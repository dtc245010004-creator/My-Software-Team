"""Nghiệp vụ xử lý CALL StartTransaction của OCPP 1.6J (Task T-37)."""

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.id_tag import IdTag
from app.models.remote_start_request import RemoteStartRequest
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector
from app.models.tariff import Tariff

logger = logging.getLogger(__name__)


def parse_timestamp_safe(ts_val: Any) -> datetime:
    """Chuyển đổi an toàn chuỗi timestamp sang datetime có timezone UTC."""
    if not ts_val:
        return datetime.now(timezone.utc)
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
        return datetime.now(timezone.utc)


def handle_start_transaction(
    db: Session, charging_point: ChargingPoint, payload: dict[str, Any]
) -> dict[str, Any]:
    """Xử lý StartTransaction CALL từ trạm sạc:

    1. Xác thực thẻ idTag (Accepted / Blocked / Expired / Invalid).
    2. Xác định cổng sạc (Connector).
    3. Đóng phiên cũ bất thường nếu đang có phiên CHARGING tại cổng này.
    4. Cấp transactionId và khởi tạo ChargingSession mới.
    5. Cập nhật trạng thái cổng sạc sang CHARGING.
    6. Trả về transactionId và idTagInfo.
    """
    connector_id_param = payload.get("connectorId", 1)
    id_tag_code = payload.get("idTag")
    meter_start = payload.get("meterStart", 0)
    raw_timestamp = payload.get("timestamp")
    start_time = parse_timestamp_safe(raw_timestamp)

    # 1. Xác thực idTag
    id_tag = None
    if isinstance(id_tag_code, str) and id_tag_code:
        id_tag = db.query(IdTag).filter(IdTag.code == id_tag_code).first()

    if id_tag is None:
        logger.warning(
            "StartTransaction bị từ chối do không tìm thấy thẻ idTag: %s",
            id_tag_code,
        )
        return {
            "transactionId": 0,
            "idTagInfo": {"status": "Invalid"},
        }

    if id_tag.status == "blocked":
        logger.warning("StartTransaction bị từ chối do thẻ bị khóa: %s", id_tag_code)
        return {
            "transactionId": 0,
            "idTagInfo": {"status": "Blocked"},
        }

    expiry_date = id_tag.expiry_date
    if expiry_date is not None and expiry_date.tzinfo is None:
        expiry_date = expiry_date.replace(tzinfo=timezone.utc)
    if expiry_date is not None and expiry_date <= datetime.now(timezone.utc):
        logger.warning("StartTransaction bị từ chối do thẻ hết hạn: %s", id_tag_code)
        return {
            "transactionId": 0,
            "idTagInfo": {"status": "Expired"},
        }

    if charging_point.station and not charging_point.station.is_active:
        logger.warning(
            "StartTransaction bị từ chối do trạm sạc đang ngưng hoạt động: %s",
            charging_point.station.name,
        )
        return {
            "transactionId": 0,
            "idTagInfo": {"status": "Blocked"},
        }

    # 2. Tìm cổng sạc (Connector)
    connector = (
        db.query(Connector)
        .filter(
            Connector.charge_point_id == charging_point.id,
            (Connector.connector_id == connector_id_param)
            | (Connector.connector_number == connector_id_param)
            | (Connector.id == connector_id_param),
        )
        .first()
    )

    if connector is None:
        # Fallback lấy cổng đầu tiên nếu trụ chỉ có 1 cổng
        connector = (
            db.query(Connector)
            .filter(Connector.charge_point_id == charging_point.id)
            .first()
        )

    if connector is None:
        logger.error(
            "Không tìm thấy connectorId=%s trên trụ %s",
            connector_id_param,
            charging_point.code,
        )
        return {
            "transactionId": 0,
            "idTagInfo": {"status": "Invalid"},
        }

    # Idempotency check: Kiểm tra nếu bản tin lặp lại cùng thông số đang CHARGING
    existing_session = (
        db.query(ChargingSession)
        .filter(
            ChargingSession.connector_id == connector.id,
            ChargingSession.id_tag == id_tag_code,
            ChargingSession.status == "CHARGING",
            ChargingSession.start_time == start_time,
        )
        .first()
    )
    if existing_session:
        id_tag_info: dict[str, Any] = {"status": "Accepted"}
        if expiry_date:
            id_tag_info["expiryDate"] = expiry_date.isoformat()
        return {
            "transactionId": existing_session.transaction_id,
            "idTagInfo": id_tag_info,
        }

    # 3. Bảo vệ chống cắm trùng: Đóng phiên cũ bất thường nếu đang có phiên CHARGING
    active_session = (
        db.query(ChargingSession)
        .filter(
            ChargingSession.connector_id == connector.id,
            ChargingSession.status == "CHARGING",
        )
        .first()
    )
    if active_session:
        try:
            repeated_meter_start = int(meter_start) if meter_start is not None else 0
        except (TypeError, ValueError):
            repeated_meter_start = None

        if (
            active_session.id_tag == id_tag_code
            and active_session.meter_start == repeated_meter_start
        ):
            logger.info(
                "Tiếp tục phiên sạc đang lưu transactionId=%s connector=%s",
                active_session.transaction_id,
                connector.id,
            )
            id_tag_info = {"status": "Accepted"}
            if expiry_date:
                id_tag_info["expiryDate"] = expiry_date.isoformat()
            return {
                "transactionId": active_session.transaction_id,
                "idTagInfo": id_tag_info,
            }

        logger.warning(
            "Phát hiện phiên đang sạc chưa đóng (id=%s) trên cổng %s, thực hiện đóng bất thường ABNORMAL",
            active_session.transaction_id,
            connector.id,
        )
        active_session.status = "ABNORMAL"
        active_session.stop_reason = "EmergencyStop"
        active_session.stop_time = datetime.now(timezone.utc)
        active_session.end_time = active_session.stop_time
        db.flush()

    # 4. Tìm biểu giá điện (Tariff)
    tariff = None
    if charging_point.station_id:
        tariff = (
            db.query(Tariff)
            .filter(
                Tariff.station_id == charging_point.station_id,
                Tariff.is_active == True,  # noqa: E712
            )
            .first()
        )
    if not tariff:
        tariff = db.query(Tariff).filter(Tariff.is_active == True).first()  # noqa: E712

    tariff_id = tariff.id if tariff else None
    price = tariff.price_normal if tariff else 0.00

    # 5. Khởi tạo ChargingSession mới
    meter_start_val = int(meter_start) if meter_start is not None else 0
    connector.idle_started_at = None
    connector.idle_ended_at = None
    new_session = ChargingSession(
        connector_id=connector.id,
        id_tag=id_tag_code,
        driver_id=id_tag.user_id if id_tag else None,
        tariff_id=tariff_id,
        applied_price_per_kwh=price,
        start_time=start_time,
        meter_start=meter_start_val,
        meter_start_kwh=meter_start_val / 1000.0,
        status="CHARGING",
        total_kwh=0.0,
        total_amount=0.0,
        current_soc=0.0,
    )
    db.add(new_session)

    connector.status = "CHARGING"
    connector.ocpp_status = "Charging"

    # Nếu phiên được mở từ RemoteStartTransaction, chuyển yêu cầu chờ sang STARTED.
    pending = (
        db.query(RemoteStartRequest)
        .filter(
            RemoteStartRequest.connector_id == connector.id,
            RemoteStartRequest.id_tag == id_tag_code,
            RemoteStartRequest.status == "PENDING",
        )
        .order_by(RemoteStartRequest.id.desc())
        .first()
    )
    if pending is not None:
        expires_at = pending.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
    if pending is not None and expires_at >= datetime.now(timezone.utc):
        pending.status = "STARTED"
        pending.transaction_id = new_session.transaction_id

    db.commit()
    db.refresh(new_session)

    id_tag_info = {"status": "Accepted"}
    if expiry_date:
        id_tag_info["expiryDate"] = expiry_date.isoformat()

    logger.info(
        "StartTransaction thành công: transactionId=%s connector=%s idTag=%s",
        new_session.transaction_id,
        connector.id,
        id_tag_code,
    )
    return {
        "transactionId": new_session.transaction_id,
        "idTagInfo": id_tag_info,
    }
