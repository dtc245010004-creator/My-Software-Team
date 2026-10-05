"""T-46/T-56: chạy reconnect qua WebSocket với backend và Postgres thật trong Compose."""
# ruff: noqa: E402

import asyncio
import json
import os
import random
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import websockets
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.models.id_tag import IdTag
from app.models.meter_value import MeterValue
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not os.environ.get("OCPP_LIVE_TEST"),
    reason="Chỉ chạy khi OCPP_LIVE_TEST bật cho stack Docker thật.",
)


async def call(socket, action: str, payload: dict) -> dict:
    message_id = uuid.uuid4().hex
    await socket.send(json.dumps([2, message_id, action, payload], separators=(",", ":")))
    while True:
        response = json.loads(await socket.recv())
        if response[0] == 3 and response[1] == message_id:
            return response[2]
        if response[0] == 4 and response[1] == message_id:
            raise AssertionError(f"{action} CALLERROR: {response[2]} {response[3]}")


def prepare_live_points(engine, count: int):
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    simulator_count = int(os.getenv("SIMULATOR_CHARGE_POINT_COUNT", "20"))
    with factory() as db:
        deadline = time.monotonic() + 60
        points = []
        while time.monotonic() < deadline:
            points = (
                db.query(ChargingPoint)
                .filter(ChargingPoint.code.like("SIM-%"))
                .order_by(ChargingPoint.code)
                .all()
            )
            if len(points) == simulator_count and all(point.last_seen_at for point in points):
                break
            time.sleep(1)
            db.expire_all()
        assert len(points) == simulator_count, (
            f"Cần {simulator_count} trụ SIM- trong DB, thấy {len(points)}."
        )
        assert all(point.status.lower() == "online" for point in points), (
            "Một hoặc nhiều trụ SIM- chưa trực tuyến: "
            + ", ".join(f"{point.code}={point.status}" for point in points if point.status.lower() != "online")
        )
        latest_seen = [point.last_seen_at for point in points]
        assert all(
            (datetime.now(timezone.utc) - (seen.replace(tzinfo=timezone.utc) if seen.tzinfo is None else seen)).total_seconds() < 60
            for seen in latest_seen
        ), "Có trụ SIM- chưa gửi nhịp trong 60 giây gần nhất."

        station_id = points[0].station_id
        tag = db.query(IdTag).filter(IdTag.code == "SIM-DEMO-TAG").one()
        test_points = []
        for index in range(count):
            code = f"TEST-RECONNECT-{index + 1:03d}"
            point = db.query(ChargingPoint).filter(ChargingPoint.code == code).first()
            if point is None:
                point = ChargingPoint(
                    station_id=station_id,
                    code=code,
                    charge_point_id=code,
                    vendor="T-46 Live Test",
                    model="Virtual OCPP 1.6J",
                    max_power_kw=22,
                    is_active=True,
                    status="Offline",
                )
                db.add(point)
                db.flush()
                db.add(
                    Connector(
                        charge_point_id=point.id,
                        connector_id=1,
                        connector_number=1,
                        connector_type="Type 2",
                        max_power_kw=22,
                        status="Available",
                        ocpp_status="Available",
                        is_active=True,
                    )
                )
                db.flush()
            connector = (
                db.query(Connector)
                .filter(Connector.charge_point_id == point.id, Connector.connector_id == 1)
                .one()
            )
            test_points.append((code, connector.id))
        db.commit()
        return factory, test_points, tag.code


async def run_round(factory, points, tag_code: str, base_url: str, run: int, count: int):
    sockets = {}
    try:
        for index, (code, _) in enumerate(points):
            socket = await websockets.connect(
                f"{base_url.rstrip('/')}/{code}",
                subprotocols=["ocpp1.6"],
                open_timeout=10,
                ping_interval=20,
            )
            sockets[index] = socket
            boot = await call(socket, "BootNotification", {
                "chargePointVendor": "T-46 Live Test",
                "chargePointModel": "Virtual OCPP 1.6J",
            })
            assert boot.get("status") == "Accepted", f"{code}: BootNotification={boot}"

        meter_starts = [100_000 + run * 100_000 + index * 10_000 for index in range(count)]
        transaction_ids = {}
        start_time = datetime.now(timezone.utc).replace(microsecond=0)
        for index, (code, _) in enumerate(points):
            await call(sockets[index], "StatusNotification", {
                "connectorId": 1,
                "errorCode": "NoError",
                "status": "Available",
            })
            result = await call(sockets[index], "StartTransaction", {
                "connectorId": 1,
                "idTag": tag_code,
                "meterStart": meter_starts[index],
                "timestamp": (start_time + timedelta(seconds=index)).isoformat(),
            })
            assert result.get("idTagInfo", {}).get("status") == "Accepted", f"{code}: StartTransaction={result}"
            transaction_ids[index] = result["transactionId"]
            await call(sockets[index], "MeterValues", {
                "connectorId": 1,
                "transactionId": transaction_ids[index],
                "meterValue": [{
                    "timestamp": (start_time + timedelta(seconds=10)).isoformat(),
                    "sampledValue": [{
                        "value": str(meter_starts[index] + 1000),
                        "measurand": "Energy.Active.Import.Register",
                        "unit": "Wh",
                    }],
                }],
            })

        rng = random.Random(2100 + run)
        dropped = set(rng.sample(range(count), max(1, count // 5)))
        for index in dropped:
            await sockets[index].close()
        await asyncio.sleep(1)
        for index in dropped:
            code, _ = points[index]
            socket = await websockets.connect(
                f"{base_url.rstrip('/')}/{code}", subprotocols=["ocpp1.6"], open_timeout=10
            )
            sockets[index] = socket
            boot = await call(socket, "BootNotification", {
                "chargePointVendor": "T-46 Live Test",
                "chargePointModel": "Virtual OCPP 1.6J",
            })
            assert boot.get("status") == "Accepted", f"{code}: reconnect BootNotification={boot}"
            await call(socket, "StatusNotification", {
                "connectorId": 1,
                "status": "Charging",
                "errorCode": "NoError",
                "timestamp": (start_time + timedelta(seconds=20)).isoformat(),
            })
            repeated = await call(socket, "StartTransaction", {
                "connectorId": 1,
                "idTag": tag_code,
                "meterStart": meter_starts[index],
                "timestamp": (start_time + timedelta(seconds=index)).isoformat(),
            })
            assert repeated.get("transactionId") == transaction_ids[index], (
                f"{code}: reconnect tạo phiên khác; transaction cũ={transaction_ids[index]}, "
                f"transaction mới={repeated.get('transactionId')}"
            )

        stopped_at = datetime.now(timezone.utc).replace(microsecond=0)
        for index, (code, _) in enumerate(points):
            final_meter = meter_starts[index] + 5000
            await call(sockets[index], "MeterValues", {
                "connectorId": 1,
                "transactionId": transaction_ids[index],
                "meterValue": [{
                    "timestamp": (start_time + timedelta(seconds=30)).isoformat(),
                    "sampledValue": [{
                        "value": str(meter_starts[index] + 4000),
                        "measurand": "Energy.Active.Import.Register",
                        "unit": "Wh",
                    }],
                }],
            })
            _, connector_id = points[index]
            with factory() as db:
                point = db.query(ChargingPoint).filter(ChargingPoint.code == code).one()
                point.status = "Offline"
                point.last_seen_at = datetime.now(timezone.utc) - timedelta(minutes=2)
                db.commit()
            result = await call(sockets[index], "StopTransaction", {
                "transactionId": transaction_ids[index],
                "meterStop": final_meter,
                "timestamp": (stopped_at + timedelta(seconds=index)).isoformat(),
                "reason": "Local",
                "idTag": tag_code,
            })
            assert result.get("idTagInfo", {}).get("status") == "Accepted", f"{code}: StopTransaction={result}"

            with factory() as db:
                session = (
                    db.query(ChargingSession)
                    .filter(ChargingSession.transaction_id == transaction_ids[index])
                    .one_or_none()
                )
                actual = float(session.total_kwh) if session and session.total_kwh is not None else None
                assert session is not None and session.status == "COMPLETED" and actual == 5.0, (
                    f"Phiên sai: trụ={code}, session_id={transaction_ids[index]}, "
                    f"kWh mong đợi=5.0, thực tế={actual}, "
                    f"status={session.status if session else 'MISSING'}"
                )
                values = (
                    db.query(MeterValue)
                    .filter(MeterValue.session_id == transaction_ids[index])
                    .order_by(MeterValue.recorded_at)
                    .all()
                )
                assert [float(value.value) for value in values] == [
                    meter_starts[index] + 1000,
                    meter_starts[index] + 4000,
                ], f"Phiên sai số đo: trụ={code}, session_id={transaction_ids[index]}"
                assert session.stop_time is not None
                assert abs((session.stop_time.replace(tzinfo=timezone.utc) - (stopped_at + timedelta(seconds=index))).total_seconds()) < 2
    finally:
        for socket in sockets.values():
            await socket.close()


def test_live_reconnect_scenario_three_consecutive_runs():
    count = int(os.getenv("OCPP_RECONNECT_CHARGE_POINTS", "5"))
    base_url = os.getenv("OCPP_LIVE_WS_URL", "ws://127.0.0.1:8000/ocpp")
    engine = create_engine(DATABASE_URL)
    factory, points, tag_code = prepare_live_points(engine, count)
    try:
        for run in range(3):
            asyncio.run(run_round(factory, points, tag_code, base_url, run, count))
            with factory() as db:
                for code, connector_id in points:
                    sessions = (
                        db.query(ChargingSession)
                        .filter(ChargingSession.connector_id == connector_id)
                        .all()
                    )
                    assert len(sessions) == run + 1, (
                        f"Số phiên sai: trụ={code}, mong đợi={run + 1}, thực tế={len(sessions)}"
                    )
                    latest = max(sessions, key=lambda row: row.transaction_id)
                    assert latest.status == "COMPLETED" and float(latest.total_kwh) == 5.0, (
                        f"Phiên sai: trụ={code}, session_id={latest.transaction_id}, "
                        f"kWh mong đợi=5.0, thực tế={latest.total_kwh}, status={latest.status}"
                    )
    finally:
        engine.dispose()
