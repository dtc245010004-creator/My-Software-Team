from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.models.session import ChargingSession
from app.models.session_billing_segment import SessionBillingSegment
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.tariff_period import TariffPeriod
from app.models.user import User
from app.models.wallet import Wallet
from app.services.billing_segment_service import persist_session_billing_segments
from app.services.session_service import (
    get_session_invoice_breakdown,
    stop_charging_session,
)


def make_billing_env(
    db_session,
    *,
    status="COMPLETED",
    start_time=None,
    end_time=None,
    needs_review=False,
):
    driver = User(
        username="segment_driver",
        email="segment_driver@example.com",
        password_hash="test-hash",
        role="CUSTOMER",
        is_active=True,
    )
    station = Station(name="Segment station", address="Test address")
    point = ChargingPoint(station=station, code="SEG-CP-1", status="CHARGING")
    connector = Connector(
        charging_point=point,
        connector_id=1,
        status="CHARGING",
        is_active=True,
    )
    tariff = Tariff(
        name="Segment tariff",
        price_normal=Decimal("3500.00"),
        price_peak=Decimal("4000.00"),
        price_offpeak=Decimal("3000.00"),
        is_active=True,
        periods=[
            TariffPeriod(
                start_time="00:00", end_time="01:00", price_per_kwh=Decimal("3000.00"), sort_order=0
            ),
            TariffPeriod(
                start_time="01:00", end_time="02:00", price_per_kwh=Decimal("4000.00"), sort_order=1
            ),
            TariffPeriod(
                start_time="02:00", end_time="24:00", price_per_kwh=Decimal("3500.00"), sort_order=2
            ),
        ],
    )
    db_session.add_all([driver, station, point, connector, tariff])
    db_session.flush()

    if start_time is None:
        start_time = datetime(2026, 1, 9, 17, 30, tzinfo=timezone.utc)
    if end_time is None:
        end_time = datetime(2026, 1, 9, 19, 30, tzinfo=timezone.utc)

    session = ChargingSession(
        user_id=driver.id,
        connector_id=connector.id,
        tariff_id=tariff.id,
        applied_price_per_kwh=Decimal("3200.00"),
        start_time=start_time,
        end_time=end_time,
        meter_start=0,
        meter_stop=3000,
        meter_start_kwh=Decimal("0.0000"),
        meter_stop_kwh=Decimal("3.0000"),
        total_kwh=Decimal("3.0000"),
        total_amount=Decimal("9600.00"),
        idle_amount=Decimal("0.00"),
        status=status,
        needs_review=needs_review,
    )
    db_session.add(session)
    db_session.flush()
    return {
        "driver": driver,
        "connector": connector,
        "session": session,
        "tariff": tariff,
    }


def test_closing_session_persists_segments_once_in_the_close_transaction(db_session):
    end_time = datetime.now(timezone.utc)
    env = make_billing_env(
        db_session,
        status="ACTIVE",
        start_time=end_time - timedelta(minutes=30),
        end_time=end_time,
    )
    db_session.add(
        Wallet(
            user_id=env["driver"].id,
            balance=Decimal("100000.00"),
            is_debt_locked=False,
        )
    )
    db_session.commit()

    stop_charging_session(
        db=db_session,
        user=env["driver"],
        session_id=env["session"].id,
        meter_stop_kwh=Decimal("3.0000"),
    )
    first_rows = (
        db_session.query(SessionBillingSegment)
        .filter_by(session_id=env["session"].id)
        .order_by(SessionBillingSegment.segment_index)
        .all()
    )
    first_ids = [row.id for row in first_rows]
    assert first_rows

    stop_charging_session(
        db=db_session,
        user=env["driver"],
        session_id=env["session"].id,
        meter_stop_kwh=Decimal("3.0000"),
    )
    second_rows = (
        db_session.query(SessionBillingSegment)
        .filter_by(session_id=env["session"].id)
        .order_by(SessionBillingSegment.segment_index)
        .all()
    )
    assert [row.id for row in second_rows] == first_ids


def test_three_segments_are_saved_with_frozen_price_and_rounding(db_session):
    env = make_billing_env(db_session)

    rows = persist_session_billing_segments(db_session, env["session"])
    db_session.commit()

    assert len(rows) == 3
    assert [row.segment_index for row in rows] == [1, 2, 3]
    assert [row.segment_date.isoformat() for row in rows] == ["2026-01-10"] * 3
    assert [row.kwh for row in rows] == [
        Decimal("0.7500"),
        Decimal("1.5000"),
        Decimal("0.7500"),
    ]
    assert [row.price_per_kwh for row in rows] == [
        Decimal("3000.00"),
        Decimal("4000.00"),
        Decimal("3500.00"),
    ]
    assert [row.amount for row in rows] == [
        Decimal("2250.00"),
        Decimal("6000.00"),
        Decimal("2625.00"),
    ]


def test_invoice_uses_saved_segments_after_tariff_changes(db_session):
    env = make_billing_env(db_session)
    persist_session_billing_segments(db_session, env["session"])
    db_session.commit()

    expected = [
        (Decimal("3000.00"), Decimal("2250.00")),
        (Decimal("4000.00"), Decimal("6000.00")),
        (Decimal("3500.00"), Decimal("2625.00")),
    ]
    for period in env["tariff"].periods:
        period.price_per_kwh = Decimal("9999.00")
    db_session.commit()

    invoice = get_session_invoice_breakdown(
        db=db_session,
        session_id=env["session"].id,
        user=env["driver"],
    )

    actual = [
        (segment["unit_price"], segment["amount"])
        for segment in invoice["price_segments"]
    ]
    assert actual == expected
    assert invoice["is_legacy"] is False


def test_segments_keep_local_date_when_session_crosses_midnight(db_session):
    start_time = datetime(2026, 1, 10, 16, 30, tzinfo=timezone.utc)
    end_time = datetime(2026, 1, 10, 17, 30, tzinfo=timezone.utc)
    env = make_billing_env(
        db_session,
        start_time=start_time,
        end_time=end_time,
    )

    rows = persist_session_billing_segments(db_session, env["session"])

    assert [row.segment_date.isoformat() for row in rows] == [
        "2026-01-10",
        "2026-01-11",
    ]


def test_review_session_does_not_persist_or_return_price_segments(db_session):
    env = make_billing_env(
        db_session,
        status="NEEDS_REVIEW",
        needs_review=True,
    )

    assert persist_session_billing_segments(db_session, env["session"]) == []
    db_session.commit()
    invoice = get_session_invoice_breakdown(
        db=db_session,
        session_id=env["session"].id,
        user=env["driver"],
    )

    assert (
        db_session.query(SessionBillingSegment)
        .filter_by(session_id=env["session"].id)
        .count()
        == 0
    )
    assert invoice["is_reviewing"] is True
    assert invoice["price_segments"] == []
    assert invoice["total_amount"] is None


def test_legacy_invoice_uses_stored_total_without_backfill(db_session):
    env = make_billing_env(db_session)
    env["session"].total_amount = Decimal("9876.54")
    db_session.commit()

    invoice = get_session_invoice_breakdown(
        db=db_session,
        session_id=env["session"].id,
        user=env["driver"],
    )

    assert invoice["total_amount"] == Decimal("9876.54")
    assert invoice["is_legacy"] is True
    assert invoice["price_segments"] == []
    assert (
        db_session.query(SessionBillingSegment)
        .filter_by(session_id=env["session"].id)
        .count()
        == 0
    )
