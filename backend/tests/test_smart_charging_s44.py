"""Kiểm thử Backend S-44: chia lại công suất khi xe vào, rời hoặc tạm dừng."""

import asyncio
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient
from starlette.websockets import WebSocket

from app.core.config import settings
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.ocpp.frames import build_call
from app.services import scheduler_service, smart_charging
from app.services.smart_charging import (
    applied_session_limits,
    rebalance_station_power,
    trigger_rebalance_background,
)
from tests.conftest import TestingSessionLocal


@pytest.fixture(autouse=True)
def reset_smart_charging_runtime_state():
    applied_session_limits.clear()
    smart_charging._pending_rebalances.clear()
    smart_charging._rebalance_tasks.clear()
    smart_charging._last_rebalance_finished_at.clear()
    yield
    applied_session_limits.clear()
    smart_charging._pending_rebalances.clear()
    smart_charging._rebalance_tasks.clear()
    smart_charging._last_rebalance_finished_at.clear()


def _create_station_with_sessions(
    db: Session,
    *,
    station_code: str,
    capacity_kw: float,
    count: int,
) -> tuple[Station, ChargingPoint, list[Connector], list[ChargingSession]]:
    station = Station(
        name=f"Trạm S-44 {station_code}",
        address="Kiểm thử",
        total_grid_capacity_kw=capacity_kw,
        is_active=True,
    )
    db.add(station)
    db.flush()

    point = ChargingPoint(
        station_id=station.id,
        code=f"CP-S44-{station_code}",
        max_power_kw=60.0,
        is_active=True,
    )
    db.add(point)
    db.flush()

    connectors = [
        Connector(
            charging_point_id=point.id,
            connector_number=number,
            max_power_kw=22.0,
            status="CHARGING",
            ocpp_status="Charging",
            is_active=True,
        )
        for number in range(1, count + 1)
    ]
    db.add_all(connectors)
    db.flush()

    sessions = [
        ChargingSession(
            connector_id=connector.id,
            status="CHARGING",
            meter_start=0,
        )
        for connector in connectors
    ]
    db.add_all(sessions)
    db.commit()
    return station, point, connectors, sessions


def test_departure_redistributes_100kw_across_seven_remaining_sessions(
    db_session: Session,
):
    station, _, _, sessions = _create_station_with_sessions(
        db_session, station_code="8-TO-7", capacity_kw=100.0, count=8
    )
    leaving_transaction_id = sessions[0].transaction_id
    remaining_transaction_ids = {session.transaction_id for session in sessions[1:]}
    applied_session_limits.update(
        {session.transaction_id: 12500 for session in sessions}
    )

    sessions[0].status = "COMPLETED"
    db_session.commit()
    sent_profiles = []

    async def mock_dispatch(charge_point_code, connector_number, transaction_id, limit_w):
        sent_profiles.append((transaction_id, limit_w))
        return {
            "status": "Accepted",
            "transaction_id": transaction_id,
            "charge_point_code": charge_point_code,
            "limit_W": limit_w,
        }

    with patch(
        "app.services.smart_charging._dispatch_single_profile",
        side_effect=mock_dispatch,
    ):
        asyncio.run(
            rebalance_station_power(
                station.id, session_factory=TestingSessionLocal
            )
        )

    assert {transaction_id for transaction_id, _ in sent_profiles} == (
        remaining_transaction_ids
    )
    assert sent_profiles == [
        (transaction_id, 100000 // 7)
        for transaction_id in sorted(remaining_transaction_ids)
    ]
    assert leaving_transaction_id not in applied_session_limits


def test_suspended_ev_is_excluded_and_rejoining_charging_gets_a_new_limit(
    db_session: Session,
):
    station, _, connectors, sessions = _create_station_with_sessions(
        db_session, station_code="SUSPEND", capacity_kw=50.0, count=3
    )
    suspended_connector = connectors[0]
    suspended_connector.ocpp_status = "SuspendedEV"
    db_session.commit()
    applied_session_limits.update(
        {session.transaction_id: 10000 for session in sessions}
    )
    sent_profiles = []

    async def mock_dispatch(charge_point_code, connector_number, transaction_id, limit_w):
        sent_profiles.append((transaction_id, limit_w))
        return {
            "status": "Accepted",
            "transaction_id": transaction_id,
            "charge_point_code": charge_point_code,
            "limit_W": limit_w,
        }

    async def exercise_suspend_and_resume():
        with patch(
            "app.services.smart_charging._dispatch_single_profile",
            side_effect=mock_dispatch,
        ):
            await rebalance_station_power(
                station.id, session_factory=TestingSessionLocal
            )
            assert set(sent_profiles) == {
                (sessions[1].transaction_id, 22000),
                (sessions[2].transaction_id, 22000),
            }
            assert suspended_connector and sessions[0].transaction_id in applied_session_limits

            sent_profiles.clear()
            suspended_connector.ocpp_status = "Charging"
            db_session.commit()
            await rebalance_station_power(
                station.id, session_factory=TestingSessionLocal
            )

    asyncio.run(exercise_suspend_and_resume())

    assert set(sent_profiles) == {
        (session.transaction_id, 50000 // 3) for session in sessions
    }


def test_rated_limits_and_unchanged_fair_share_do_not_send_profiles(
    db_session: Session,
):
    station, _, _, sessions = _create_station_with_sessions(
        db_session, station_code="NO-SPAM", capacity_kw=50.0, count=2
    )
    applied_session_limits.update(
        {session.transaction_id: 22000 for session in sessions}
    )
    sent_profiles = []

    async def mock_dispatch(*args, **kwargs):
        sent_profiles.append((args, kwargs))
        return {"status": "Accepted"}

    with patch(
        "app.services.smart_charging._dispatch_single_profile",
        side_effect=mock_dispatch,
    ):
        asyncio.run(
            rebalance_station_power(
                station.id, session_factory=TestingSessionLocal
            )
        )
        sessions[0].status = "COMPLETED"
        db_session.commit()
        asyncio.run(
            rebalance_station_power(
                station.id, session_factory=TestingSessionLocal
            )
        )

        overbooked_station, _, _, overbooked_sessions = _create_station_with_sessions(
            db_session, station_code="UNCHANGED", capacity_kw=50.0, count=3
        )
        applied_session_limits.update(
            {session.transaction_id: 50000 // 3 for session in overbooked_sessions}
        )
        asyncio.run(
            rebalance_station_power(
                overbooked_station.id, session_factory=TestingSessionLocal
            )
        )

    assert sent_profiles == []
    assert sessions[0].transaction_id not in applied_session_limits


def test_status_notification_triggers_only_on_suspended_ev_transition(
    client: TestClient, db_session: Session
):
    station, point, connectors, _ = _create_station_with_sessions(
        db_session, station_code="STATUS-HOOK", capacity_kw=50.0, count=1
    )
    connector = connectors[0]
    events = []
    original_send_text = WebSocket.send_text

    async def spy_send_text(self, text):
        frame = json.loads(text)
        if (
            isinstance(frame, list)
            and len(frame) >= 3
            and frame[0] == 3
            and frame[1] != "boot-s44-status"
        ):
            events.append(("CALLRESULT", frame[1]))
        return await original_send_text(self, text)

    def spy_trigger(station_id, session_factory=None):
        events.append(("REBALANCE", station_id))
        return asyncio.create_task(asyncio.sleep(0))

    with (
        patch(
            "starlette.websockets.WebSocket.send_text",
            side_effect=spy_send_text,
            autospec=True,
        ),
        patch(
            "app.services.smart_charging.trigger_rebalance_background",
            side_effect=spy_trigger,
        ),
    ):
        with client.websocket_connect(
            f"/ocpp/{point.code}", subprotocols=["ocpp1.6"]
        ) as websocket:
            websocket.send_text(
                build_call(
                    "boot-s44-status",
                    "BootNotification",
                    {"chargePointVendor": "Test", "chargePointModel": "S44"},
                )
            )
            websocket.receive_text()

            for message_id, status in (
                ("suspended-first", "SuspendedEV"),
                ("suspended-repeat", "SuspendedEV"),
                ("charging-resume", "Charging"),
            ):
                websocket.send_text(
                    build_call(
                        message_id,
                        "StatusNotification",
                        {
                            "connectorId": connector.connector_number,
                            "status": status,
                            "errorCode": "NoError",
                            "timestamp": "2026-10-12T10:00:00Z",
                        },
                    )
                )
                websocket.receive_text()

    assert events == [
        ("CALLRESULT", "suspended-first"),
        ("REBALANCE", station.id),
        ("CALLRESULT", "suspended-repeat"),
        ("CALLRESULT", "charging-resume"),
        ("REBALANCE", station.id),
    ]


def test_abnormal_scheduler_commits_then_rebalances_remaining_vehicles(
    db_session: Session, monkeypatch
):
    monkeypatch.setattr(settings, "ABNORMAL_SESSION_THRESHOLD_SECONDS", 1)
    station = Station(
        name="Trạm S-44 scheduler",
        address="Kiểm thử",
        total_grid_capacity_kw=30.0,
        is_active=True,
    )
    db_session.add(station)
    db_session.flush()

    stale_point = ChargingPoint(
        station_id=station.id,
        code="CP-S44-STALE",
        max_power_kw=22.0,
        last_seen_at=datetime.now(timezone.utc) - timedelta(seconds=10),
    )
    active_point = ChargingPoint(
        station_id=station.id,
        code="CP-S44-ACTIVE",
        max_power_kw=22.0,
        last_seen_at=datetime.now(timezone.utc),
    )
    db_session.add_all([stale_point, active_point])
    db_session.flush()
    stale_connector = Connector(
        charging_point_id=stale_point.id,
        connector_number=1,
        max_power_kw=22.0,
        status="CHARGING",
        ocpp_status="Charging",
    )
    active_connector = Connector(
        charging_point_id=active_point.id,
        connector_number=1,
        max_power_kw=22.0,
        status="CHARGING",
        ocpp_status="Charging",
    )
    db_session.add_all([stale_connector, active_connector])
    db_session.flush()
    stale_session = ChargingSession(
        connector_id=stale_connector.id, status="CHARGING", meter_start=0
    )
    active_session = ChargingSession(
        connector_id=active_connector.id, status="CHARGING", meter_start=0
    )
    db_session.add_all([stale_session, active_session])
    db_session.commit()
    applied_session_limits[stale_session.transaction_id] = 15000
    applied_session_limits[active_session.transaction_id] = 15000
    sent_profiles = []

    async def mock_dispatch(charge_point_code, connector_number, transaction_id, limit_w):
        sent_profiles.append((transaction_id, limit_w))
        return {
            "status": "Accepted",
            "transaction_id": transaction_id,
            "charge_point_code": charge_point_code,
            "limit_W": limit_w,
        }

    async def run_job_and_rebalance():
        with patch(
            "app.services.smart_charging._dispatch_single_profile",
            side_effect=mock_dispatch,
        ):
            flagged_count = await scheduler_service.flag_abnormal_charging_sessions_job(
                db_session
            )
            pending_tasks = list(smart_charging._rebalance_tasks.values())
            if pending_tasks:
                await asyncio.gather(*pending_tasks)
        return flagged_count

    assert asyncio.run(run_job_and_rebalance()) == 1
    db_session.refresh(stale_session)
    assert stale_session.is_abnormal is True
    assert stale_session.status == "CHARGING"
    assert sent_profiles == [(active_session.transaction_id, 22000)]


def test_bursts_coalesce_per_station_and_trailing_run_uses_latest_state(
    monkeypatch,
):
    clock = {"now": 0.0}
    latest_state = {101: 0, 202: 0}
    run_snapshots = {101: [], 202: []}
    wait_durations = []
    monkeypatch.setattr(smart_charging, "_rebalance_clock", lambda: clock["now"])

    async def advance_mock_clock(seconds: float):
        wait_durations.append(seconds)
        clock["now"] += seconds

    monkeypatch.setattr(
        smart_charging, "_wait_for_rebalance_interval", advance_mock_clock
    )

    async def mock_rebalance(station_id, session_factory=None):
        run_snapshots[station_id].append(latest_state[station_id])
        if station_id == 101 and len(run_snapshots[station_id]) == 1:
            for event_number in range(1, 11):
                latest_state[station_id] = event_number
                trigger_rebalance_background(station_id)

    monkeypatch.setattr(smart_charging, "rebalance_station_power", mock_rebalance)

    async def run_burst():
        station_one_task = trigger_rebalance_background(101)
        station_two_task = trigger_rebalance_background(202)
        await asyncio.gather(station_one_task, station_two_task)

    asyncio.run(run_burst())

    assert run_snapshots == {101: [0, 10], 202: [0]}
    assert wait_durations == [settings.REBALANCE_MIN_INTERVAL_SECONDS]
