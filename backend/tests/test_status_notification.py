import json

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.models.station import ChargingPoint, Connector, Station
from app.ocpp.frames import build_call


def _create_charging_point_with_connector(
    db_session: Session,
    code: str,
) -> tuple[ChargingPoint, Connector]:
    station = Station(
        name=f"Trạm {code}",
        address="Địa chỉ kiểm thử",
        total_grid_capacity_kw=100.0,
        is_active=True,
    )

    charging_point = ChargingPoint(
        station=station,
        code=code,
        max_power_kw=60.0,
        is_active=True,
    )

    connector = Connector(
        charging_point=charging_point,
        connector_number=1,
        connector_type="CCS2",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )

    db_session.add(charging_point)
    db_session.commit()
    db_session.refresh(charging_point)
    db_session.refresh(connector)

    return charging_point, connector


def _read_frame(websocket) -> list:
    return json.loads(websocket.receive_text())


def _boot(websocket, message_id: str) -> None:
    websocket.send_text(
        build_call(
            message_id,
            "BootNotification",
            {
                "chargePointVendor": "STATUS-TEST-VENDOR",
                "chargePointModel": "STATUS-TEST-MODEL",
                "firmwareVersion": "1.0.0",
            },
        )
    )

    response = _read_frame(websocket)

    assert response[0:2] == [3, message_id]
    assert response[2]["status"] == "Accepted"


@pytest.mark.parametrize(
    ("ocpp_status", "expected_connector_status"),
    [
        ("Available", "AVAILABLE"),
        ("Preparing", "OCCUPIED"),
        ("Charging", "CHARGING"),
        ("SuspendedEV", "OCCUPIED"),
        ("SuspendedEVSE", "OCCUPIED"),
        ("Finishing", "OCCUPIED"),
        ("Reserved", "OCCUPIED"),
        ("Unavailable", "UNAVAILABLE"),
        ("Faulted", "FAULTED"),
    ],
    ids=[
        "available",
        "preparing",
        "charging",
        "suspended_ev",
        "suspended_evse",
        "finishing",
        "reserved",
        "unavailable",
        "faulted",
    ],
)
def test_status_notification_updates_connector_status(
    client: TestClient,
    db_session: Session,
    ocpp_status: str,
    expected_connector_status: str,
) -> None:
    charging_point, connector = _create_charging_point_with_connector(
        db_session,
        f"CP-S10-{ocpp_status.upper()}",
    )

    with client.websocket_connect(
        f"/ocpp/{charging_point.code}",
        subprotocols=["ocpp1.6"],
    ) as websocket:
        _boot(websocket, f"boot-{ocpp_status}")

        message_id = f"status-{ocpp_status}"
        websocket.send_text(
            build_call(
                message_id,
                "StatusNotification",
                {
                    "connectorId": 1,
                    "status": ocpp_status,
                    "errorCode": "NoError",
                },
            )
        )

        response = _read_frame(websocket)

    assert response == [3, message_id, {}]

    db_session.refresh(connector)
    assert connector.status == expected_connector_status


def test_status_notification_connector_id_zero_updates_charge_point_status(
    client: TestClient,
    db_session: Session,
) -> None:
    charging_point, connector = _create_charging_point_with_connector(
        db_session,
        "CP-S10-CP-LEVEL",
    )

    with client.websocket_connect(
        "/ocpp/CP-S10-CP-LEVEL",
        subprotocols=["ocpp1.6"],
    ) as websocket:
        _boot(websocket, "boot-cp-level")

        websocket.send_text(
            build_call(
                "status-cp-level",
                "StatusNotification",
                {
                    "connectorId": 0,
                    "status": "Faulted",
                    "errorCode": "NoError",
                },
            )
        )

        response = _read_frame(websocket)

    assert response == [3, "status-cp-level", {}]

    db_session.refresh(charging_point)
    db_session.refresh(connector)

    assert charging_point.status == "FAULTED"
    assert connector.status == "AVAILABLE"


def test_status_notification_unknown_connector_is_ignored_with_warning(
    client: TestClient,
    db_session: Session,
    caplog,
) -> None:
    charging_point, connector = _create_charging_point_with_connector(
        db_session,
        "CP-S10-UNKNOWN-CONNECTOR",
    )

    with client.websocket_connect(
        "/ocpp/CP-S10-UNKNOWN-CONNECTOR",
        subprotocols=["ocpp1.6"],
    ) as websocket:
        _boot(websocket, "boot-unknown-connector")

        websocket.send_text(
            build_call(
                "status-unknown-connector",
                "StatusNotification",
                {
                    "connectorId": 99,
                    "status": "Charging",
                    "errorCode": "NoError",
                },
            )
        )

        response = _read_frame(websocket)

    assert response == [3, "status-unknown-connector", {}]

    db_session.refresh(connector)
    assert connector.status == "AVAILABLE"

    assert "CP-S10-UNKNOWN-CONNECTOR" in caplog.text
    assert "99" in caplog.text


def test_status_notification_unknown_status_does_not_crash_connection(
    client: TestClient,
    db_session: Session,
) -> None:
    charging_point, connector = _create_charging_point_with_connector(
        db_session,
        "CP-S10-UNKNOWN-STATUS",
    )

    with client.websocket_connect(
        "/ocpp/CP-S10-UNKNOWN-STATUS",
        subprotocols=["ocpp1.6"],
    ) as websocket:
        _boot(websocket, "boot-unknown-status")

        websocket.send_text(
            build_call(
                "status-unknown-status",
                "StatusNotification",
                {
                    "connectorId": 1,
                    "status": "VendorSpecificNewStatus",
                    "errorCode": "NoError",
                },
            )
        )

        response = _read_frame(websocket)

    assert response == [3, "status-unknown-status", {}]

    db_session.refresh(connector)
    assert connector.status == "AVAILABLE"
