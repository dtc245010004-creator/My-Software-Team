"""Kiểm thử job chỉ đánh dấu phiên sạc mất liên lạc (T-53)."""

from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.services import scheduler_service


def _create_charging_session(db_session, code: str, last_seen_at: datetime):
    station = Station(name=f"Trạm {code}", address="Test", is_active=True)
    db_session.add(station)
    db_session.flush()

    charge_point = ChargingPoint(
        station_id=station.id,
        code=code,
        status="online",
        last_seen_at=last_seen_at,
    )
    db_session.add(charge_point)
    db_session.flush()

    connector = Connector(
        charge_point_id=charge_point.id,
        connector_id=1,
        connector_number=1,
        status="CHARGING",
        ocpp_status="Charging",
    )
    db_session.add(connector)
    db_session.flush()

    session = ChargingSession(
        connector_id=connector.id,
        meter_start=1000,
        status="CHARGING",
        total_kwh=0,
        total_amount=0,
    )
    db_session.add(session)
    db_session.commit()
    return charge_point, session


def test_abnormal_session_job_flags_stale_point_without_closing_session(
    db_session, monkeypatch
):
    monkeypatch.setattr(settings, "ABNORMAL_SESSION_THRESHOLD_SECONDS", 1)
    charge_point, session = _create_charging_session(
        db_session,
        "CP-ABNORMAL-STALE",
        datetime.now(timezone.utc) - timedelta(seconds=10),
    )

    flagged = scheduler_service.flag_abnormal_charging_sessions_job(db_session)
    db_session.refresh(session)

    assert flagged == 1
    assert session.is_abnormal is True
    assert session.abnormal_reason == "Mất liên lạc với trụ quá 1 giây"
    assert session.status == "CHARGING"
    assert charge_point.status == "online"


def test_abnormal_session_job_ignores_recently_seen_point(db_session, monkeypatch):
    monkeypatch.setattr(settings, "ABNORMAL_SESSION_THRESHOLD_SECONDS", 1)
    _, session = _create_charging_session(
        db_session,
        "CP-ABNORMAL-ONLINE",
        datetime.now(timezone.utc),
    )

    flagged = scheduler_service.flag_abnormal_charging_sessions_job(db_session)
    db_session.refresh(session)

    assert flagged == 0
    assert session.is_abnormal is False
    assert session.abnormal_reason is None
    assert session.status == "CHARGING"


def test_abnormal_session_job_is_registered_once_per_minute(monkeypatch):
    class SchedulerStub:
        running = False

        def __init__(self):
            self.jobs = []

        def add_job(self, func, trigger, **options):
            self.jobs.append((func, trigger, options))

        def start(self):
            self.running = True

    stub = SchedulerStub()
    monkeypatch.setattr(scheduler_service, "scheduler", stub)

    scheduler_service.start_scheduler()

    abnormal_job = next(
        job for job in stub.jobs if job[2].get("id") == "flag_abnormal_charging_sessions"
    )
    assert abnormal_job[0] is scheduler_service.flag_abnormal_charging_sessions_job
    assert abnormal_job[1] == "interval"
    assert abnormal_job[2]["minutes"] == 1
