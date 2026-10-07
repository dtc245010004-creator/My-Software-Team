import json

from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.models.station import ChargingPoint, Connector, ConnectorError, Station
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
                "chargePointVendor": "ERROR-TEST-VENDOR",
                "chargePointModel": "ERROR-TEST-MODEL",
                "firmwareVersion": "1.0.0",
            },
        )
    )

    response = _read_frame(websocket)

    assert response[0:2] == [3, message_id]
    assert response[2]["status"] == "Accepted"


def _send_status(
    websocket,
    message_id: str,
    connector_id: int,
    status: str,
    error_code: str = "NoError",
    **extra: str,
) -> list:
    payload = {
        "connectorId": connector_id,
        "status": status,
        "errorCode": error_code,
        **extra,
    }
    websocket.send_text(build_call(message_id, "StatusNotification", payload))
    return _read_frame(websocket)


def _list_errors(db_session: Session, connector: Connector) -> list[ConnectorError]:
    return (
        db_session.query(ConnectorError)
        .filter(ConnectorError.connector_id == connector.id)
        .order_by(ConnectorError.id)
        .all()
    )


def test_no_error_does_not_create_connector_error(
    client: TestClient,
    db_session: Session,
) -> None:
    charging_point, connector = _create_charging_point_with_connector(
        db_session, "CP-T21-NOERROR"
    )

    with client.websocket_connect(
        f"/ocpp/{charging_point.code}",
        subprotocols=["ocpp1.6"],
    ) as websocket:
        _boot(websocket, "boot-noerror")
        response = _send_status(websocket, "status-noerror", 1, "Charging")

    assert response == [3, "status-noerror", {}]
    assert _list_errors(db_session, connector) == []


def test_error_code_creates_connector_error_with_data(
    client: TestClient,
    db_session: Session,
) -> None:
    charging_point, connector = _create_charging_point_with_connector(
        db_session, "CP-T21-ERROR"
    )

    with client.websocket_connect(
        f"/ocpp/{charging_point.code}",
        subprotocols=["ocpp1.6"],
    ) as websocket:
        _boot(websocket, "boot-error")
        response = _send_status(
            websocket,
            "status-error",
            1,
            "Faulted",
            "GroundFailure",
            vendorErrorCode="E42",
            info="ground fault detected",
        )

    assert response == [3, "status-error", {}]

    db_session.refresh(connector)
    assert connector.status == "FAULTED"

    errors = _list_errors(db_session, connector)
    assert len(errors) == 1
    assert errors[0].error_code == "GroundFailure"
    assert errors[0].vendor_error_code == "E42"
    assert errors[0].info == "ground fault detected"
    assert errors[0].created_at is not None


def test_old_error_is_kept_after_available(
    client: TestClient,
    db_session: Session,
) -> None:
    charging_point, connector = _create_charging_point_with_connector(
        db_session, "CP-T21-KEEP"
    )

    with client.websocket_connect(
        f"/ocpp/{charging_point.code}",
        subprotocols=["ocpp1.6"],
    ) as websocket:
        _boot(websocket, "boot-keep")
        _send_status(websocket, "status-fault", 1, "Faulted", "OverCurrentFailure")
        response = _send_status(websocket, "status-available", 1, "Available")

    assert response == [3, "status-available", {}]

    db_session.refresh(connector)
    assert connector.status == "AVAILABLE"

    errors = _list_errors(db_session, connector)
    assert len(errors) == 1
    assert errors[0].error_code == "OverCurrentFailure"


def test_multiple_errors_create_multiple_records(
    client: TestClient,
    db_session: Session,
) -> None:
    charging_point, connector = _create_charging_point_with_connector(
        db_session, "CP-T21-MULTI"
    )

    with client.websocket_connect(
        f"/ocpp/{charging_point.code}",
        subprotocols=["ocpp1.6"],
    ) as websocket:
        _boot(websocket, "boot-multi")
        _send_status(websocket, "status-1", 1, "Faulted", "GroundFailure")
        _send_status(websocket, "status-2", 1, "Available")
        _send_status(websocket, "status-3", 1, "Faulted", "OverVoltage")

    errors = _list_errors(db_session, connector)
    assert [error.error_code for error in errors] == ["GroundFailure", "OverVoltage"]


def test_connector_id_zero_with_error_does_not_crash(
    client: TestClient,
    db_session: Session,
) -> None:
    charging_point, connector = _create_charging_point_with_connector(
        db_session, "CP-T21-CP-LEVEL"
    )

    with client.websocket_connect(
        f"/ocpp/{charging_point.code}",
        subprotocols=["ocpp1.6"],
    ) as websocket:
        _boot(websocket, "boot-cp-level")
        response = _send_status(
            websocket, "status-cp-level", 0, "Faulted", "PowerMeterFailure"
        )

    assert response == [3, "status-cp-level", {}]

    db_session.refresh(charging_point)
    assert charging_point.status == "FAULTED"
    assert _list_errors(db_session, connector) == []


def test_unknown_connector_with_error_does_not_crash(
    client: TestClient,
    db_session: Session,
) -> None:
    charging_point, connector = _create_charging_point_with_connector(
        db_session, "CP-T21-UNKNOWN"
    )

    with client.websocket_connect(
        f"/ocpp/{charging_point.code}",
        subprotocols=["ocpp1.6"],
    ) as websocket:
        _boot(websocket, "boot-unknown")
        response = _send_status(
            websocket, "status-unknown", 99, "Faulted", "GroundFailure"
        )

    assert response == [3, "status-unknown", {}]
    assert db_session.query(ConnectorError).count() == 0