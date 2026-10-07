"""Kiểm thử loại bỏ số đo lùi/trùng của OCPP MeterValues (T-42/T-43)."""

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Barrier

from sqlalchemy.orm import Session, sessionmaker

from app.models.meter_value import MeterValue
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.ocpp.handlers.meter_values import handle_meter_values

LOGGER_NAME = "app.ocpp.handlers.meter_values"
MEASURAND = "Energy.Active.Import.Register"


def _create_session(db: Session, code: str):
    station = Station(name=f"Trạm {code}", address="Test", is_active=True)
    db.add(station)
    db.flush()

    point = ChargingPoint(station_id=station.id, code=code)
    db.add(point)
    db.flush()

    connector = Connector(
        charge_point_id=point.id,
        connector_id=1,
        connector_number=1,
        status="CHARGING",
        ocpp_status="Charging",
    )
    db.add(connector)
    db.flush()

    session = ChargingSession(
        connector_id=connector.id,
        meter_start=0,
        status="CHARGING",
        total_kwh=0,
        total_amount=0,
    )
    db.add(session)
    db.commit()
    return point, session


def _payload(timestamp: str, value: str) -> dict:
    return {
        "connectorId": 1,
        "meterValue": [
            {
                "timestamp": timestamp,
                "sampledValue": [
                    {"value": value, "measurand": MEASURAND, "unit": "Wh"}
                ],
            }
        ],
    }


def _seed_reading(db: Session, session_id: int, timestamp: datetime, value: str):
    db.add(
        MeterValue(
            session_id=session_id,
            measurand=MEASURAND,
            value=value,
            unit="Wh",
            recorded_at=timestamp,
        )
    )
    db.commit()


def test_meter_values_ignores_older_timestamp_and_logs_once(db_session, caplog):
    point, session = _create_session(db_session, "CP-DEDUP-01")
    stored_at = datetime(2026, 10, 5, 10, 15, 30, tzinfo=timezone.utc)
    _seed_reading(db_session, session.id, stored_at, "12000")
    caplog.set_level(logging.WARNING, logger=LOGGER_NAME)

    handle_meter_values(
        db_session, point, _payload("2026-10-05T10:15:29Z", "11900")
    )
    db_session.commit()

    assert db_session.query(MeterValue).count() == 1
    warnings = [record for record in caplog.records if record.name == LOGGER_NAME]
    assert len(warnings) == 1
    assert "session_id=%s" % session.id in warnings[0].getMessage()
    assert "2026-10-05T10:15:29+00:00" in warnings[0].getMessage()
    assert "2026-10-05T10:15:30" in warnings[0].getMessage()


def test_meter_values_ignores_exact_duplicate_without_warning(db_session, caplog):
    point, session = _create_session(db_session, "CP-DEDUP-02")
    _seed_reading(
        db_session,
        session.id,
        datetime(2026, 10, 5, 10, 15, 30, tzinfo=timezone.utc),
        "12000",
    )
    caplog.set_level(logging.WARNING, logger=LOGGER_NAME)

    handle_meter_values(
        db_session, point, _payload("2026-10-05T10:15:30Z", "12000")
    )
    db_session.commit()

    assert db_session.query(MeterValue).count() == 1
    assert not [record for record in caplog.records if record.name == LOGGER_NAME]


def test_meter_values_records_lower_value_at_newer_timestamp_and_marks_session(
    db_session,
):
    point, session = _create_session(db_session, "CP-DEDUP-03")
    _seed_reading(
        db_session,
        session.id,
        datetime(2026, 10, 5, 10, 15, 30, tzinfo=timezone.utc),
        "12000",
    )

    handle_meter_values(
        db_session, point, _payload("2026-10-05T10:15:31Z", "500")
    )
    db_session.commit()

    readings = (
        db_session.query(MeterValue)
        .filter(MeterValue.session_id == session.id)
        .order_by(MeterValue.recorded_at)
        .all()
    )
    db_session.refresh(session)
    assert len(readings) == 2
    assert str(readings[-1].value) == "500.000000000"
    assert session.needs_review is True


def test_meter_values_keeps_same_timestamp_value_correction(db_session):
    point, session = _create_session(db_session, "CP-DEDUP-04")
    timestamp = datetime(2026, 10, 5, 10, 15, 30, tzinfo=timezone.utc)
    _seed_reading(db_session, session.id, timestamp, "12000")

    handle_meter_values(
        db_session, point, _payload("2026-10-05T10:15:30Z", "11950")
    )
    db_session.commit()

    readings = (
        db_session.query(MeterValue)
        .filter(MeterValue.session_id == session.id)
        .order_by(MeterValue.id)
        .all()
    )
    assert len(readings) == 2
    assert session.needs_review is False


def test_concurrent_exact_meter_values_are_serialized_and_saved_once(db_session):
    point, session = _create_session(db_session, "CP-DEDUP-05")
    bind = db_session.get_bind()
    sessions = sessionmaker(bind=bind, autoflush=False)
    start = Barrier(2)
    payload = _payload("2026-10-05T10:15:30Z", "12000")

    def process_one():
        with sessions() as worker_session:
            start.wait(timeout=5)
            handle_meter_values(worker_session, point, payload)
            worker_session.commit()

    with ThreadPoolExecutor(max_workers=2) as workers:
        list(workers.map(lambda _: process_one(), range(2)))

    db_session.expire_all()
    assert (
        db_session.query(MeterValue)
        .filter(MeterValue.session_id == session.id)
        .count()
        == 1
    )
