"""Nghiệp vụ xử lý CALL MeterValues của OCPP 1.6J (T-41)."""

import json
import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy.orm import Session

from app.models.meter_value import MeterValue
from app.models.orphan_message import OrphanMessage
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector

logger = logging.getLogger(__name__)

ENERGY_REGISTER = "Energy.Active.Import.Register"


def _parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def handle_meter_values(
    db: Session, charging_point: ChargingPoint, payload: dict[str, Any]
) -> dict[str, Any]:
    """Lưu mẫu Energy.Active.Import.Register cho phiên CHARGING đang mở.

    Giống các handler OCPP khác, hàm chỉ thêm dữ liệu vào session; gateway gửi
    CALLRESULT trước rồi mới commit. Đại lượng và đơn vị được lưu nguyên văn.
    """

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

            unit = sampled_value.get("unit")
            db.add(
                MeterValue(
                    session_id=session.id,
                    measurand=ENERGY_REGISTER,
                    value=numeric_value,
                    unit=unit if isinstance(unit, str) else None,
                    recorded_at=recorded_at,
                )
            )

    return {}
