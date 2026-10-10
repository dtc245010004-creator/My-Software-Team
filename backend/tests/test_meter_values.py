"""Kiểm thử T-40/T-41: lưu mẫu điện năng OCPP MeterValues."""

import json
import time
from datetime import datetime, timezone
from decimal import Decimal
from threading import Event

from sqlalchemy.orm import Session
from starlette.websockets import WebSocket

from app.models.meter_value import MeterValue
from app.models.orphan_message import OrphanMessage
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.ocpp import gateway
from app.ocpp.frames import build_call
from app.ocpp.handlers.meter_values import handle_meter_values


def _create_charging_fixture(db_session: Session, code: str):
    station = Station(
        name=f"Trạm {code}",
        address="Địa chỉ kiểm thử",
        is_active=True,
    )
    db_session.add(station)
    db_session.flush()

    charging_point = ChargingPoint(station_id=station.id, code=code)
    db_session.add(charging_point)
    db_session.flush()

    connector = Connector(
        charge_point_id=charging_point.id,
        connector_id=1,
        connector_number=1,
        status="CHARGING",
        ocpp_status="Charging",
    )
    db_session.add(connector)
    db_session.flush()

    session = ChargingSession(
        connector_id=connector.id,
        meter_start=0,
        status="CHARGING",
        total_kwh=0,
        total_amount=0,
    )
    db_session.add(session)
    db_session.commit()
    return charging_point, connector, session


def _meter_payload(connector_id: int = 1) -> dict:
    return {
        "connectorId": connector_id,
        "meterValue": [
            {
                "timestamp": "2026-10-05T10:15:30Z",
                "sampledValue": [
                    {
                        "value": "12345.125",
                        "measurand": "Energy.Active.Import.Register",
                        "unit": "Wh",
                    }
                ],
            }
        ],
    }


def test_meter_values_saves_energy_register_and_timestamp(db_session: Session):
    charging_point, _, session = _create_charging_fixture(db_session, "CP-METER-01")
    payload = _meter_payload()

    assert handle_meter_values(db_session, charging_point, payload) == {}
    db_session.commit()

    saved = db_session.query(MeterValue).one()
    assert saved.session_id == session.id
    assert saved.measurand == "Energy.Active.Import.Register"
    assert saved.value == Decimal("12345.125")
    assert saved.unit == "Wh"
    assert saved.recorded_at.replace(tzinfo=timezone.utc) == datetime(
        2026, 10, 5, 10, 15, 30, tzinfo=timezone.utc
    )


def test_meter_values_ignores_other_measurands_and_preserves_units(
    db_session: Session,
):
    charging_point, _, _ = _create_charging_fixture(db_session, "CP-METER-02")
    payload = {
        "connectorId": 1,
        "meterValue": [
            {
                "timestamp": "2026-10-05T10:15:30Z",
                "sampledValue": [
                    {"value": "230", "measurand": "Voltage", "unit": "V"},
                    {
                        "value": "7.5",
                        "measurand": "Power.Active.Import",
                        "unit": "kW",
                    },
                    {
                        "value": "15000",
                        "measurand": "Energy.Active.Import.Register",
                        "unit": "Wh",
                    },
                    {
                        "value": "15",
                        "measurand": "Energy.Active.Import.Register",
                        "unit": "kWh",
                    },
                ],
            }
        ],
    }

    handle_meter_values(db_session, charging_point, payload)
    db_session.commit()

    saved = db_session.query(MeterValue).order_by(MeterValue.id).all()
    assert len(saved) == 2
    assert [value.unit for value in saved] == ["Wh", "kWh"]
    assert [value.value for value in saved] == [Decimal("15000"), Decimal("15")]


def test_meter_values_without_active_session_are_saved_as_orphans(
    db_session: Session,
):
    charging_point, _, session = _create_charging_fixture(
        db_session, "CP-METER-03"
    )
    session.status = "COMPLETED"
    db_session.commit()
    payload = _meter_payload()

    handle_meter_values(db_session, charging_point, payload)
    db_session.commit()

    orphan = db_session.query(OrphanMessage).one()
    assert orphan.charge_point_code == charging_point.code
    assert orphan.action == "MeterValues"
    assert json.loads(orphan.payload) == payload
    assert db_session.query(MeterValue).count() == 0


def test_meter_values_callresult_precedes_database_writes(
    client, db_session: Session, monkeypatch
):
    charging_point, _, _ = _create_charging_fixture(db_session, "CP-METER-04")
    events: list[str] = []
    handler_finished = Event()
    original_send = WebSocket.send_text
    original_handler = gateway.handle_meter_values
    original_touch = gateway.touch_last_seen

    async def record_send(websocket, data: str) -> None:
        if json.loads(data)[:2] == [3, "meter-order"]:
            events.append("CALLRESULT")
        await original_send(websocket, data)

    def record_touch(db, charging_point_id: int) -> None:
        events.append("database write")
        original_touch(db, charging_point_id)

    def record_handler(db, point, payload):
        result = original_handler(db, point, payload)
        events.append("handler")
        handler_finished.set()
        return result

    monkeypatch.setattr(WebSocket, "send_text", record_send)
    monkeypatch.setattr(gateway, "touch_last_seen", record_touch)
    monkeypatch.setitem(gateway.call_handlers, "MeterValues", record_handler)

    with client.websocket_connect(
        f"/ocpp/{charging_point.code}", subprotocols=["ocpp1.6"]
    ) as websocket:
        websocket.send_text(
            build_call("meter-boot", "BootNotification", {"chargePointVendor": "T"})
        )
        assert json.loads(websocket.receive_text())[2]["status"] == "Accepted"

        events.clear()
        websocket.send_text(build_call("meter-order", "MeterValues", _meter_payload()))
        response = json.loads(websocket.receive_text())
        assert handler_finished.wait(timeout=1), events

    assert response == [3, "meter-order", {}]
    assert events.index("CALLRESULT") < events.index("database write")
    assert events.index("database write") < events.index("handler")


def test_meter_values_twenty_consecutive_messages_under_200ms_each(
    client, db_session: Session
):
    charging_point, _, _ = _create_charging_fixture(db_session, "CP-METER-05")
    elapsed_seconds = []

    with client.websocket_connect(
        f"/ocpp/{charging_point.code}", subprotocols=["ocpp1.6"]
    ) as websocket:
        websocket.send_text(
            build_call("meter-perf-boot", "BootNotification", {"chargePointVendor": "T"})
        )
        assert json.loads(websocket.receive_text())[2]["status"] == "Accepted"

        for index in range(20):
            started_at = time.perf_counter()
            websocket.send_text(
                build_call(
                    f"meter-perf-{index}",
                    "MeterValues",
                    _meter_payload(),
                )
            )
            response = json.loads(websocket.receive_text())
            elapsed_seconds.append(time.perf_counter() - started_at)
            assert response[0] == 3
            assert response[1] == f"meter-perf-{index}"

    assert len(elapsed_seconds) == 20
    assert max(elapsed_seconds) < 0.2
