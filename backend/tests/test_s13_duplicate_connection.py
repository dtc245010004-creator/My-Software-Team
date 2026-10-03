import json

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.models.station import ChargingPoint, Station
from app.ocpp.frames import build_call


def _create_charging_point(
    db_session: Session,
    code: str,
) -> ChargingPoint:
    charging_point = ChargingPoint(
        station=Station(
            name="Trạm kiểm thử S-13",
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


def _boot(websocket, message_id: str) -> None:
    websocket.send_text(
        build_call(
            message_id,
            "BootNotification",
            {
                "chargePointVendor": "S13Vendor",
                "chargePointModel": "S13Model",
            },
        )
    )

    response = json.loads(websocket.receive_text())

    assert response[0] == 3
    assert response[1] == message_id
    assert response[2]["status"] == "Accepted"


def test_second_connection_replaces_first(
    client: TestClient,
    db_session: Session,
) -> None:
    _create_charging_point(db_session, "CP-S13-DUPLICATE")

    with client.websocket_connect(
        "/ocpp/CP-S13-DUPLICATE",
        subprotocols=["ocpp1.6"],
    ) as first_websocket:
        _boot(first_websocket, "boot-first")

        with client.websocket_connect(
            "/ocpp/CP-S13-DUPLICATE",
            subprotocols=["ocpp1.6"],
        ) as second_websocket:
            with pytest.raises(WebSocketDisconnect) as exc_info:
                first_websocket.receive_text()

            assert exc_info.value.code == 1000

            _boot(second_websocket, "boot-second")
