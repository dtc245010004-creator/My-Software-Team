"""T-46: kịch bản OCPP nhiều trụ mất kết nối rồi khôi phục phiên."""

import json
import os
import random
import time
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone

from app.models.id_tag import IdTag
from app.models.meter_value import MeterValue
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.user import User

RECONNECT_COUNT = int(os.getenv("OCPP_RECONNECT_CHARGE_POINTS", "5"))
RECONNECT_DELAY_SECONDS = float(os.getenv("OCPP_RECONNECT_DELAY_SECONDS", "2"))


def _call(websocket, action: str, payload: dict, message_id: str) -> dict:
    websocket.send_text(json.dumps([2, message_id, action, payload]))
    response = json.loads(websocket.receive_text())
    assert response[0] == 3, response
    assert response[1] == message_id
    return response[2]


def _boot(websocket, prefix: str) -> None:
    response = _call(
        websocket,
        "BootNotification",
        {"chargePointVendor": "Virtual", "chargePointModel": "Reconnect-Test"},
        f"{prefix}-boot",
    )
    assert response["status"] == "Accepted"


def test_reconnect_scenario_keeps_one_session_and_expected_energy(client, db_session):
    """Chạy ba vòng 5/20 trụ, ngắt ngẫu nhiên và xác minh phiên cùng kWh."""
    count = RECONNECT_COUNT
    assert 1 <= count <= 20

    user = User(
        username="reconnect_tester",
        email="reconnect_tester@example.com",
        password_hash="argon2id$fakehash",
        role="CUSTOMER",
    )
    db_session.add(user)
    db_session.flush()
    station = Station(
        name="Trạm kiểm thử khôi phục",
        address="Địa chỉ kiểm thử",
        total_grid_capacity_kw=500.0,
        is_active=True,
    )
    db_session.add(station)
    db_session.flush()
    tariff = Tariff(
        station_id=station.id,
        name="Giá kiểm thử",
        price_normal=3500.0,
        price_peak=4500.0,
        price_offpeak=2500.0,
        peak_start="09:00",
        peak_end="11:30",
        peak_start_2="17:00",
        peak_end_2="20:00",
        offpeak_start="22:00",
        offpeak_end="04:00",
        is_active=True,
    )
    db_session.add(tariff)
    db_session.flush()
    tag = IdTag(
        code="TAG-RECONNECT-VALID",
        user_id=user.id,
        status="active",
        expiry_date=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db_session.add(tag)

    points = []
    for index in range(count):
        point = ChargingPoint(
            station_id=station.id,
            code=f"CP-RECONNECT-{index:02d}",
            max_power_kw=60.0,
        )
        db_session.add(point)
        db_session.flush()
        connector = Connector(
            charge_point_id=point.id,
            connector_id=1,
            connector_number=1,
            status="AVAILABLE",
            ocpp_status="Available",
        )
        db_session.add(connector)
        points.append((point, connector))
    db_session.commit()

    for run in range(3):
        rng = random.Random(2100 + run)
        drop_count = max(1, count // 5)
        dropped = set(rng.sample(range(count), drop_count))
        meter_starts = [100_000 + run * 100_000 + index * 10_000 for index in range(count)]
        transaction_ids = {}

        with ExitStack() as stack:
            sockets = {}
            for index, (point, _) in enumerate(points):
                code = f"CP-RECONNECT-{index:02d}"
                socket = stack.enter_context(
                    client.websocket_connect(f"/ocpp/{code}", subprotocols=["ocpp1.6"])
                )
                sockets[index] = socket
                prefix = f"r{run}-p{index}"
                _boot(socket, prefix)
                start = {
                    "connectorId": 1,
                    "idTag": tag.code,
                    "meterStart": meter_starts[index],
                    "timestamp": f"2026-10-05T10:{run:02d}:00Z",
                }
                transaction_ids[index] = _call(
                    socket, "StartTransaction", start, f"{prefix}-start"
                )["transactionId"]
                _call(
                    socket,
                    "MeterValues",
                    {
                        "connectorId": 1,
                        "transactionId": transaction_ids[index],
                        "meterValue": [
                            {
                                "timestamp": f"2026-10-05T10:{run:02d}:10Z",
                                "sampledValue": [
                                    {
                                        "value": str(meter_starts[index] + 1000),
                                        "measurand": "Energy.Active.Import.Register",
                                        "unit": "Wh",
                                    }
                                ],
                            }
                        ],
                    },
                    f"{prefix}-meter-before",
                )

            for index in dropped:
                sockets[index].close()
            time.sleep(RECONNECT_DELAY_SECONDS)

            for index in dropped:
                code = f"CP-RECONNECT-{index:02d}"
                prefix = f"r{run}-p{index}-reconnect"
                socket = stack.enter_context(
                    client.websocket_connect(f"/ocpp/{code}", subprotocols=["ocpp1.6"])
                )
                sockets[index] = socket
                _boot(socket, prefix)
                _call(
                    socket,
                    "StatusNotification",
                    {
                        "connectorId": 1,
                        "status": "Charging",
                        "errorCode": "NoError",
                        "timestamp": f"2026-10-05T10:{run:02d}:20Z",
                    },
                    f"{prefix}-status",
                )
                # Trụ có thể gửi lại StartTransaction sau reconnect; phải nhận transaction cũ.
                repeated = _call(
                    socket,
                    "StartTransaction",
                    {
                        "connectorId": 1,
                        "idTag": tag.code,
                        "meterStart": meter_starts[index],
                        "timestamp": f"2026-10-05T10:{run:02d}:21Z",
                    },
                    f"{prefix}-start-retry",
                )
                assert repeated["transactionId"] == transaction_ids[index]

            for index in range(count):
                prefix = f"r{run}-p{index}-finish"
                final_meter = meter_starts[index] + 5000
                _call(
                    sockets[index],
                    "MeterValues",
                    {
                        "connectorId": 1,
                        "transactionId": transaction_ids[index],
                        "meterValue": [
                            {
                                "timestamp": f"2026-10-05T10:{run:02d}:30Z",
                                "sampledValue": [
                                    {
                                        "value": str(final_meter - 1000),
                                        "measurand": "Energy.Active.Import.Register",
                                        "unit": "Wh",
                                    }
                                ],
                            }
                        ],
                    },
                    f"{prefix}-meter-after",
                )

                # Mô phỏng lần mất kết nối đã được hệ thống ghi nhận là offline.
                point = points[index][0]
                point.status = "Offline"
                point.last_seen_at = datetime.now(timezone.utc) - timedelta(minutes=2)
                db_session.commit()
                stop_timestamp = f"2026-10-05T10:{run:02d}:40Z"
                _call(
                    sockets[index],
                    "StopTransaction",
                    {
                        "transactionId": transaction_ids[index],
                        "meterStop": final_meter,
                        "timestamp": stop_timestamp,
                        "reason": "Local",
                        "idTag": tag.code,
                    },
                    f"{prefix}-stop",
                )

        db_session.expire_all()
        for index, (_, connector) in enumerate(points):
            sessions = (
                db_session.query(ChargingSession)
                .filter(ChargingSession.connector_id == connector.id)
                .all()
            )
            assert len(sessions) == run + 1
            current = max(sessions, key=lambda item: item.transaction_id)
            assert current.transaction_id == transaction_ids[index]
            assert current.status == "COMPLETED"
            assert float(current.total_kwh) == 5.0
            expected_stop = datetime.fromisoformat(
                f"2026-10-05T10:{run:02d}:40+00:00"
            )
            actual_stop = current.stop_time
            if actual_stop.tzinfo is None:
                actual_stop = actual_stop.replace(tzinfo=timezone.utc)
            assert actual_stop == expected_stop
            stored_values = (
                db_session.query(MeterValue)
                .filter(MeterValue.session_id == current.transaction_id)
                .all()
            )
            assert [float(value.value) for value in stored_values] == [
                meter_starts[index] + 1000,
                meter_starts[index] + 4000,
            ]
