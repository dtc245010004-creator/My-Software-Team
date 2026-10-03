import json
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.models.station import ChargingPoint, Station
from app.ocpp.frames import build_call


def _create_charging_point(db_session: Session, code: str) -> ChargingPoint:
    charging_point = ChargingPoint(
        station=Station(
            name="Trạm kiểm thử S-09",
            address="Địa chỉ kiểm thử",
            total_grid_capacity_kw=100.0,
            is_active=True,
        ),
        code=code,
        max_power_kw=60.0,
    )
    db_session.add(charging_point)
    db_session.commit()
    db_session.refresh(charging_point)
    return charging_point


def _read_frame(websocket) -> list:
    return json.loads(websocket.receive_text())


def _boot(websocket, message_id: str) -> None:
    websocket.send_text(
        build_call(
            message_id,
            "BootNotification",
            {
                "chargePointVendor": "S09Vendor",
                "chargePointModel": "S09Model",
            },
        )
    )
    assert _read_frame(websocket)[2]["status"] == "Accepted"


def test_heartbeat_updates_last_seen_and_returns_server_time(
    client: TestClient,
    db_session: Session,
) -> None:
    charging_point = _create_charging_point(db_session, "CP-S09-HEARTBEAT")

    with client.websocket_connect(
        "/ocpp/CP-S09-HEARTBEAT", subprotocols=["ocpp1.6"]
    ) as websocket:
        _boot(websocket, "boot-s09-heartbeat")

        old_seen = datetime(2020, 1, 1, tzinfo=timezone.utc)
        charging_point.last_seen_at = old_seen
        db_session.commit()

        websocket.send_text(build_call("heartbeat-s09", "Heartbeat", {}))
        response = _read_frame(websocket)

    db_session.refresh(charging_point)

    assert response[0:2] == [3, "heartbeat-s09"]
    assert response[2]["currentTime"].endswith("+00:00")
    assert charging_point.last_seen_at is not None

    observed = charging_point.last_seen_at
    if observed.tzinfo is None:
        observed = observed.replace(tzinfo=timezone.utc)

    assert observed > old_seen


def test_non_heartbeat_message_also_updates_last_seen(
    client: TestClient,
    db_session: Session,
) -> None:
    charging_point = _create_charging_point(db_session, "CP-S09-OTHER")

    with client.websocket_connect(
        "/ocpp/CP-S09-OTHER", subprotocols=["ocpp1.6"]
    ) as websocket:
        old_seen = datetime(2020, 1, 1, tzinfo=timezone.utc)
        charging_point.last_seen_at = old_seen
        db_session.commit()

        _boot(websocket, "boot-s09-other")

    db_session.refresh(charging_point)

    assert charging_point.last_seen_at is not None
    observed = charging_point.last_seen_at
    if observed.tzinfo is None:
        observed = observed.replace(tzinfo=timezone.utc)

    assert observed > old_seen


def test_last_seen_uses_database_current_time(
    client: TestClient,
    db_session: Session,
) -> None:
    charging_point = _create_charging_point(db_session, "CP-S09-DB-TIME")

    with client.websocket_connect(
        "/ocpp/CP-S09-DB-TIME", subprotocols=["ocpp1.6"]
    ) as websocket:
        websocket.send_text(build_call("heartbeat-db", "Heartbeat", {}))
        _read_frame(websocket)

    db_session.refresh(charging_point)

    current_db_time = db_session.execute(
        text("SELECT CURRENT_TIMESTAMP")
    ).scalar_one()
    db_now = datetime.fromisoformat(str(current_db_time)).replace(
        tzinfo=timezone.utc
    )

    observed = charging_point.last_seen_at
    assert observed is not None

    if observed.tzinfo is None:
        observed = observed.replace(tzinfo=timezone.utc)

    assert abs((observed - db_now).total_seconds()) < 2
