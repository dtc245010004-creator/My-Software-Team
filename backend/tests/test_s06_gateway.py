import logging
import time

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.models.station import ChargingPoint, Station


def _create_charging_point(
    db_session: Session,
    code: str,
) -> ChargingPoint:
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
    )

    db_session.add(charging_point)
    db_session.commit()
    db_session.refresh(charging_point)

    return charging_point


def test_unknown_charge_point_is_rejected_once_and_within_one_second(
    client: TestClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    code = "CP-S06-UNKNOWN"

    start = time.perf_counter()

    with caplog.at_level(
        logging.WARNING,
        logger="app.ocpp.gateway",
    ):
        with pytest.raises(WebSocketDisconnect) as disconnect:
            with client.websocket_connect(
                f"/ocpp/{code}",
                subprotocols=["ocpp1.6"],
            ):
                pass

    elapsed = time.perf_counter() - start

    matching_logs = [
        record
        for record in caplog.records
        if (
            record.levelno == logging.WARNING
            and "Từ chối kết nối OCPP với mã trụ lạ" in record.getMessage()
        )
    ]

    assert disconnect.value.code == 4001
    assert len(matching_logs) == 1

    message = matching_logs[0].getMessage()

    assert code in message
    assert "ip=" in message
    assert "headers" not in message.lower()
    assert elapsed < 1.0


def test_registered_charge_point_rejects_wrong_subprotocol(
    client: TestClient,
    db_session: Session,
) -> None:
    _create_charging_point(
        db_session,
        "CP-S06-PROTOCOL",
    )

    with pytest.raises(WebSocketDisconnect) as disconnect:
        with client.websocket_connect(
            "/ocpp/CP-S06-PROTOCOL",
            subprotocols=["ocpp2.0.1"],
        ):
            pass

    assert disconnect.value.code == 1002
