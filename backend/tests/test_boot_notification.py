import json

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.config import settings
from app.models.station import ChargingPoint, Station
from app.ocpp.frames import build_call
from app.ocpp.gateway import active_ocpp_connections


def _create_charging_point(
    db_session: Session, code: str, *, station_is_active: bool = True
) -> ChargingPoint:
    station = Station(
        name="Trạm kiểm thử",
        address="Địa chỉ kiểm thử",
        total_grid_capacity_kw=100.0,
        is_active=station_is_active,
    )
    charging_point = ChargingPoint(
        station=station,
        code=code,
        max_power_kw=60.0,
    )
    db_session.add(charging_point)
    db_session.commit()
    db_session.refresh(charging_point)
    return charging_point


def _read_frame(websocket) -> list:
    return json.loads(websocket.receive_text())


def test_boot_notification_persists_metadata_and_accepts(
    client: TestClient, db_session: Session
) -> None:
    charging_point = _create_charging_point(db_session, "CP-BOOT-ACCEPT")

    with client.websocket_connect(
        "/ocpp/CP-BOOT-ACCEPT", subprotocols=["ocpp1.6"]
    ) as websocket:
        websocket.send_text(
            build_call(
                "boot-1",
                "BootNotification",
                # Payload khớp log thật tại spike/K-01-ket-qua.md.
                {
                    "chargePointVendor": "SpikeVendor",
                    "chargePointModel": "SpikeModel1",
                    "firmwareVersion": "1.0.0",
                },
            )
        )
        response = _read_frame(websocket)

    db_session.refresh(charging_point)
    assert response[0:2] == [3, "boot-1"]
    assert response[2]["status"] == "Accepted"
    assert response[2]["interval"] == settings.HEARTBEAT_INTERVAL_SECONDS
    assert response[2]["currentTime"].endswith("+00:00")
    assert charging_point.charge_point_vendor == "SpikeVendor"
    assert charging_point.charge_point_model_name == "SpikeModel1"
    assert charging_point.firmware_version == "1.0.0"
    assert charging_point.status == "online"
    assert "CP-BOOT-ACCEPT" not in active_ocpp_connections


def test_inactive_station_rejects_boot_without_marking_charging_point_online(
    client: TestClient, db_session: Session
) -> None:
    charging_point = _create_charging_point(
        db_session, "CP-BOOT-REJECT", station_is_active=False
    )

    with client.websocket_connect(
        "/ocpp/CP-BOOT-REJECT", subprotocols=["ocpp1.6"]
    ) as websocket:
        websocket.send_text(
            build_call("boot-2", "BootNotification", {"chargePointVendor": "V"})
        )
        response = _read_frame(websocket)
        websocket.send_text(build_call("heartbeat-before-accept", "Heartbeat", {}))
        pre_boot_error = _read_frame(websocket)

    db_session.refresh(charging_point)
    assert response[2]["status"] == "Rejected"
    assert charging_point.status == "AVAILABLE"
    assert charging_point.charge_point_vendor == "V"
    assert pre_boot_error[0:3] == [4, "heartbeat-before-accept", "SecurityError"]


def test_second_boot_notification_updates_same_charging_point(
    client: TestClient, db_session: Session
) -> None:
    charging_point = _create_charging_point(db_session, "CP-BOOT-REPEAT")
    original_id = charging_point.id

    with client.websocket_connect(
        "/ocpp/CP-BOOT-REPEAT", subprotocols=["ocpp1.6"]
    ) as websocket:
        for message_id, vendor, model in (
            ("boot-first", "Vendor A", "Model A"),
            ("boot-second", "Vendor B", "Model B"),
        ):
            websocket.send_text(
                build_call(
                    message_id,
                    "BootNotification",
                    {
                        "chargePointVendor": vendor,
                        "chargePointModel": model,
                        "firmwareVersion": "2.0.0",
                    },
                )
            )
            assert _read_frame(websocket)[2]["status"] == "Accepted"

    db_session.refresh(charging_point)
    assert charging_point.id == original_id
    assert (
        db_session.query(ChargingPoint).filter_by(code="CP-BOOT-REPEAT").count()
        == 1
    )
    assert charging_point.charge_point_vendor == "Vendor B"
    assert charging_point.charge_point_model_name == "Model B"
    assert charging_point.firmware_version == "2.0.0"


def test_other_action_before_boot_acceptance_returns_security_error(
    client: TestClient, db_session: Session
) -> None:
    _create_charging_point(db_session, "CP-BOOT-SECURITY")

    with client.websocket_connect(
        "/ocpp/CP-BOOT-SECURITY", subprotocols=["ocpp1.6"]
    ) as websocket:
        websocket.send_text(build_call("heartbeat-1", "Heartbeat", {}))
        response = _read_frame(websocket)

    assert response[0:3] == [4, "heartbeat-1", "SecurityError"]


def test_boot_notification_uses_configured_heartbeat_interval(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _create_charging_point(db_session, "CP-BOOT-CONFIG")
    monkeypatch.setattr(settings, "HEARTBEAT_INTERVAL_SECONDS", 73)

    with client.websocket_connect(
        "/ocpp/CP-BOOT-CONFIG", subprotocols=["ocpp1.6"]
    ) as websocket:
        websocket.send_text(build_call("boot-config", "BootNotification", {}))
        response = _read_frame(websocket)

    assert response[2]["interval"] == 73


def test_unknown_charge_point_closes_before_accepting(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with pytest.raises(WebSocketDisconnect) as disconnect:
        with client.websocket_connect(
            "/ocpp/CP-UNKNOWN", subprotocols=["ocpp1.6"]
        ):
            pass

    assert disconnect.value.code == 4001
    assert "CP-UNKNOWN" in caplog.text
    assert "testclient" in caplog.text


@pytest.mark.parametrize(
    "payload",
    [{}, {"chargePointVendor": "Vendor only"}],
)
def test_missing_boot_metadata_is_saved_as_none(
    client: TestClient,
    db_session: Session,
    payload: dict[str, str],
) -> None:
    charging_point = _create_charging_point(db_session, "CP-BOOT-OPTIONAL")

    with client.websocket_connect(
        "/ocpp/CP-BOOT-OPTIONAL", subprotocols=["ocpp1.6"]
    ) as websocket:
        websocket.send_text(build_call("boot-optional", "BootNotification", payload))
        response = _read_frame(websocket)

    db_session.refresh(charging_point)
    assert response[2]["status"] == "Accepted"
    assert charging_point.charge_point_vendor == payload.get("chargePointVendor")
    assert charging_point.charge_point_model_name == payload.get("chargePointModel")
    assert charging_point.firmware_version == payload.get("firmwareVersion")
