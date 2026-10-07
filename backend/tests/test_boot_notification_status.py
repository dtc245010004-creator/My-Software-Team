import json

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.models.station import ChargingPoint, Station
from app.ocpp.frames import build_call


def _create_charging_point(
    db_session: Session,
    code: str,
    station_is_active: bool,
    charging_point_is_active: bool,
) -> ChargingPoint:
    station = Station(
        name=f"Trạm {code}",
        address="Địa chỉ kiểm thử",
        total_grid_capacity_kw=100.0,
        is_active=station_is_active,
    )

    charging_point = ChargingPoint(
        station=station,
        code=code,
        max_power_kw=60.0,
        is_active=charging_point_is_active,
    )

    db_session.add(charging_point)
    db_session.commit()
    db_session.refresh(charging_point)

    return charging_point


def _read_frame(websocket) -> list:
    return json.loads(websocket.receive_text())


@pytest.mark.parametrize(
    ("station_is_active", "charging_point_is_active", "expected_status"),
    [
        (True, True, "Accepted"),
        (True, False, "Rejected"),
        (False, True, "Rejected"),
        (False, False, "Rejected"),
    ],
    ids=[
        "tram_bat_tru_bat",
        "tram_bat_tru_tat",
        "tram_tat_tru_bat",
        "tram_tat_tru_tat",
    ],
)
def test_boot_notification_four_active_combinations_matrix(
    client: TestClient,
    db_session: Session,
    station_is_active: bool,
    charging_point_is_active: bool,
    expected_status: str,
) -> None:
    code = (
        f"CP-BOOT-MATRIX-"
        f"S{int(station_is_active)}-"
        f"C{int(charging_point_is_active)}"
    )

    charging_point = _create_charging_point(
        db_session,
        code,
        station_is_active,
        charging_point_is_active,
    )

    message_id = (
        f"boot-matrix-"
        f"{int(station_is_active)}-"
        f"{int(charging_point_is_active)}"
    )

    with client.websocket_connect(
        f"/ocpp/{code}",
        subprotocols=["ocpp1.6"],
    ) as websocket:
        websocket.send_text(
            build_call(
                message_id,
                "BootNotification",
                {
                    "chargePointVendor": "BOOT-TEST-VENDOR",
                    "chargePointModel": "BOOT-TEST-MODEL",
                    "firmwareVersion": "1.0.0",
                },
            )
        )

        response = _read_frame(websocket)

    assert response[0:2] == [3, message_id]
    assert response[2]["status"] == expected_status
    assert "currentTime" in response[2]
    assert "interval" in response[2]

    db_session.refresh(charging_point)

    if expected_status == "Accepted":
        assert charging_point.status == "online"
    else:
        assert charging_point.status != "online"


def test_boot_notification_accepted_updates_device_information(
    client: TestClient,
    db_session: Session,
) -> None:
    charging_point = _create_charging_point(
        db_session,
        "CP-BOOT-INFO",
        station_is_active=True,
        charging_point_is_active=True,
    )

    with client.websocket_connect(
        "/ocpp/CP-BOOT-INFO",
        subprotocols=["ocpp1.6"],
    ) as websocket:
        websocket.send_text(
            build_call(
                "boot-info-1",
                "BootNotification",
                {
                    "chargePointVendor": "TestVendor",
                    "chargePointModel": "TestModel",
                    "firmwareVersion": "2.3.4",
                },
            )
        )

        response = _read_frame(websocket)

    assert response[2]["status"] == "Accepted"

    db_session.refresh(charging_point)

    assert charging_point.charge_point_vendor == "TestVendor"
    assert charging_point.charge_point_model_name == "TestModel"
    assert charging_point.firmware_version == "2.3.4"
    assert charging_point.status == "online"


def test_boot_notification_rejected_does_not_mark_disabled_charge_point_online(
    client: TestClient,
    db_session: Session,
) -> None:
    charging_point = _create_charging_point(
        db_session,
        "CP-BOOT-DISABLED",
        station_is_active=True,
        charging_point_is_active=False,
    )

    with client.websocket_connect(
        "/ocpp/CP-BOOT-DISABLED",
        subprotocols=["ocpp1.6"],
    ) as websocket:
        websocket.send_text(
            build_call(
                "boot-disabled-1",
                "BootNotification",
                {
                    "chargePointVendor": "DisabledVendor",
                    "chargePointModel": "DisabledModel",
                    "firmwareVersion": "1.0.0",
                },
            )
        )

        response = _read_frame(websocket)

    assert response[2]["status"] == "Rejected"

    db_session.refresh(charging_point)

    assert charging_point.is_active is False
    assert charging_point.status != "online"