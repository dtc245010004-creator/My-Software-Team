"""Nghiệp vụ xử lý CALL MeterValues của OCPP 1.6J (T-41)."""

import json
import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.meter_value import MeterValue
from app.models.orphan_message import OrphanMessage
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector

logger = logging.getLogger(__name__)

ENERGY_REGISTER = "Energy.Active.Import.Register"
UTC = timezone.utc


def begin_meter_values_transaction(db: Session) -> None:
    """Mở transaction có khóa ghi trước khi đọc meter gần nhất.

    SQLite không hỗ trợ SELECT FOR UPDATE, vì vậy BEGIN IMMEDIATE tuần tự hóa
    các MeterValues writer trước lần đọc đầu tiên. DB khác khóa dòng phiên ở
    truy vấn bên dưới.
    """

    dialect = db.get_bind().dialect.name
    current_transaction = db.get_transaction()
    if current_transaction is not None:
        if (
            dialect == "sqlite"
            and db.info.get("meter_values_write_transaction") is not current_transaction
        ):
            raise RuntimeError(
                "MeterValues cần bắt đầu transaction SQLite trước truy vấn khác."
            )
        return
    if dialect == "sqlite":
        db.execute(text("BEGIN IMMEDIATE"))
        db.info["meter_values_write_transaction"] = db.get_transaction()
    else:
        db.begin()


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)
    except ValueError:
        return None


def handle_meter_values(
    db: Session, charging_point: ChargingPoint, payload: dict[str, Any]
) -> dict[str, Any]:
    """Lưu mẫu Energy.Active.Import.Register cho phiên CHARGING đang mở.

    Giống các handler OCPP khác, hàm chỉ thêm dữ liệu vào session; gateway gửi
    CALLRESULT trước rồi mới commit. Đại lượng và đơn vị được lưu nguyên văn.
    """

    begin_meter_values_transaction(db)

    connector_number = payload.get("connectorId")
    connector = None
    if type(connector_number) is int:
        connector = (
            db.query(Connector)
            .filter(
                Connector.charge_point_id == charging_point.id,
                (Connector.connector_id == connector_number)
                | (Connector.connector_number == connector_number),
            )
            .first()
        )

    session = None
    if connector is not None:
        session = (
            db.query(ChargingSession)
            .filter(
                ChargingSession.connector_id == connector.id,
                ChargingSession.status == "CHARGING",
            )
            .with_for_update()
            .first()
        )

    if session is None:
        logger.warning(
            "MeterValues không có phiên CHARGING code=%s connectorId=%s",
            charging_point.code,
            connector_number,
        )
        db.add(
            OrphanMessage(
                charge_point_code=charging_point.code or "",
                message_id=None,
                action="MeterValues",
                payload=json.dumps(payload, ensure_ascii=False),
            )
        )
        return {}

    meter_values = payload.get("meterValue")
    if not isinstance(meter_values, list):
        return {}

    for meter_value in meter_values:
        if not isinstance(meter_value, dict):
            continue
        recorded_at = _parse_timestamp(meter_value.get("timestamp"))
        sampled_values = meter_value.get("sampledValue")
        if recorded_at is None or not isinstance(sampled_values, list):
            continue

        for sampled_value in sampled_values:
            if not isinstance(sampled_value, dict):
                continue
            if sampled_value.get("measurand") != ENERGY_REGISTER:
                continue

            try:
                numeric_value = Decimal(str(sampled_value["value"]))
            except (KeyError, InvalidOperation, TypeError, ValueError):
                continue
            if not numeric_value.is_finite():
                continue

            latest = (
                db.query(MeterValue)
                .filter(
                    MeterValue.session_id == session.id,
                    MeterValue.measurand == ENERGY_REGISTER,
                )
                .order_by(MeterValue.recorded_at.desc(), MeterValue.id.desc())
                .first()
            )
            if latest is not None:
                latest_time = _utc(latest.recorded_at)
                new_time = _utc(recorded_at)
                if new_time < latest_time:
                    logger.warning(
                        "Bỏ qua số đo MeterValues lùi thời gian "
                        "session_id=%s recorded_at mới=%s đã lưu=%s",
                        session.id,
                        recorded_at.isoformat(),
                        latest.recorded_at.isoformat(),
                    )
                    continue
                if new_time == latest_time and numeric_value == latest.value:
                    continue
                if new_time > latest_time and numeric_value < latest.value:
                    session.needs_review = True

            unit = sampled_value.get("unit")
            latest = MeterValue(
                session_id=session.id,
                measurand=ENERGY_REGISTER,
                value=numeric_value,
                unit=unit if isinstance(unit, str) else None,
                recorded_at=recorded_at,
            )
            db.add(latest)
            # Khi payload có nhiều mẫu, mẫu vừa thêm cũng là ứng viên mới nhất.
            db.flush()

    return {}
