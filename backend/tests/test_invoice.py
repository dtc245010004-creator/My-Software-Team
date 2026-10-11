from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from app.core.security import create_access_token
from app.models.session import ChargingSession
from app.models.session_billing_segment import SessionBillingSegment
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.tariff_period import TariffPeriod
from app.models.user import User
from app.services.billing_segment_service import persist_session_billing_segments
from app.services.session_service import get_session_invoice_breakdown


def make_invoice_session(
    db_session,
    *,
    status="COMPLETED",
    idle_amount=Decimal("0.00"),
    needs_review=False,
    persist_segments=True,
):
    suffix = uuid4().hex[:8]
    driver = User(
        username=f"invoice_driver_{suffix}",
        email=f"invoice_driver_{suffix}@example.com",
        password_hash="test-hash",
        role="CUSTOMER",
        is_active=True,
    )
    other_driver = User(
        username=f"invoice_other_driver_{suffix}",
        email=f"invoice_other_driver_{suffix}@example.com",
        password_hash="test-hash",
        role="CUSTOMER",
        is_active=True,
    )
    operator = User(
        username=f"invoice_operator_{suffix}",
        email=f"invoice_operator_{suffix}@example.com",
        password_hash="test-hash",
        role="OPERATOR",
        is_active=True,
    )
    station = Station(
        operator_id=operator.id,
        name="Invoice Test Station",
        address="Invoice Test Address",
        latitude=21.0,
        longitude=105.8,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add_all([driver, other_driver, operator])
    db_session.flush()
    station.operator_id = operator.id
    point = ChargingPoint(
        station=station,
        code=f"INVOICE-TEST-CP-{suffix}",
        status="AVAILABLE",
        is_active=True,
    )
    connector = Connector(
        charging_point=point,
        connector_number=1,
        connector_type="CCS2",
        status="AVAILABLE",
        is_active=True,
    )
    tariff = Tariff(
        station=station,
        name="Invoice Test Tariff",
        price_normal=Decimal("3500.00"),
        price_peak=Decimal("4000.00"),
        price_offpeak=Decimal("3000.00"),
        idle_fee_per_minute=Decimal("1000.00"),
        idle_grace_minutes=5,
        is_active=True,
        periods=[
            TariffPeriod(
                start_time="00:00",
                end_time="01:00",
                price_per_kwh=Decimal("3000.00"),
                sort_order=0,
            ),
            TariffPeriod(
                start_time="01:00",
                end_time="02:00",
                price_per_kwh=Decimal("4000.00"),
                sort_order=1,
            ),
            TariffPeriod(
                start_time="02:00",
                end_time="24:00",
                price_per_kwh=Decimal("3500.00"),
                sort_order=2,
            ),
        ],
    )
    db_session.add_all([point, connector, tariff])
    db_session.flush()

    session = ChargingSession(
        user_id=driver.id,
        connector_id=connector.id,
        tariff_id=tariff.id,
        applied_price_per_kwh=Decimal("3200.00"),
        start_time=datetime(2026, 1, 9, 17, 30, tzinfo=timezone.utc),
        end_time=(
            datetime(2026, 1, 9, 19, 30, tzinfo=timezone.utc)
            if status not in ("ACTIVE", "CHARGING")
            else None
        ),
        meter_start_kwh=Decimal("0.0000"),
        meter_stop_kwh=(
            Decimal("3.0000")
            if status not in ("ACTIVE", "CHARGING")
            else None
        ),
        total_kwh=Decimal("3.0000"),
        total_amount=Decimal("11600.00"),
        idle_amount=idle_amount,
        idle_chargeable_minutes=(int(idle_amount / Decimal("1000")) if idle_amount > 0 else 0),
        idle_fee_per_minute_applied=Decimal("1000.00") if idle_amount > 0 else None,
        idle_grace_minutes_applied=5 if idle_amount > 0 else None,
        status=status,
        needs_review=needs_review,
        is_abnormal=needs_review,
    )
    db_session.add(session)
    db_session.flush()
    if persist_segments and status not in ("ACTIVE", "CHARGING") and not needs_review:
        persist_session_billing_segments(db_session, session)
    db_session.commit()
    return {
        "driver": driver,
        "other_driver": other_driver,
        "operator": operator,
        "station": station,
        "connector": connector,
        "tariff": tariff,
        "session": session,
    }


def test_invoice_returns_three_saved_segments_and_their_sum(db_session):
    env = make_invoice_session(db_session)

    invoice = get_session_invoice_breakdown(
        db_session, env["session"].id, env["driver"]
    )

    assert len(invoice["segments"]) == 3
    segment_sum = sum(
        (segment["amount"] for segment in invoice["segments"]), Decimal("0.00")
    )
    assert invoice["energy_amount"] == segment_sum
    assert invoice["total_amount"] == segment_sum
    assert invoice["rounding_rule"] == "ROUND_EACH_SEGMENT"
    assert invoice["is_legacy"] is False


def test_invoice_endpoint_uses_dedicated_schema_and_saved_segments(client, db_session):
    env = make_invoice_session(db_session)
    token = create_access_token(
        {"sub": str(env["driver"].id), "role": "CUSTOMER"}
    )

    response = client.get(
        f"/api/v1/sessions/{env['session'].id}/invoice",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["invoice_status"] == "finalized"
    assert len(payload["segments"]) == 3
    assert payload["rounding_rule"] == "ROUND_EACH_SEGMENT"
    assert payload["total_amount"] == payload["energy_amount"]


def test_invoice_includes_idle_fee_line_only_when_amount_is_positive(db_session):
    env = make_invoice_session(db_session, idle_amount=Decimal("2000.00"))

    invoice = get_session_invoice_breakdown(
        db_session, env["session"].id, env["driver"]
    )

    assert invoice["idle_fee_line"] == {
        "amount": Decimal("2000.00"),
        "chargeable_minutes": 2,
        "fee_per_minute": Decimal("1000.00"),
        "grace_minutes_applied": 5,
    }
    assert invoice["total_amount"] == (
        invoice["energy_amount"] + invoice["idle_fee_line"]["amount"]
    )

    no_fee_env = make_invoice_session(db_session, idle_amount=Decimal("0.00"))
    no_fee_invoice = get_session_invoice_breakdown(
        db_session, no_fee_env["session"].id, no_fee_env["driver"]
    )
    assert no_fee_invoice["idle_fee_line"] is None

    legacy_env = make_invoice_session(db_session, idle_amount=Decimal("2000.00"))
    legacy_env["session"].idle_chargeable_minutes = 0
    legacy_env["session"].idle_fee_per_minute_applied = None
    legacy_env["session"].idle_grace_minutes_applied = None
    legacy_env["tariff"].idle_fee_per_minute = Decimal("9000.00")
    db_session.commit()
    legacy_invoice = get_session_invoice_breakdown(
        db_session, legacy_env["session"].id, legacy_env["driver"]
    )
    assert legacy_invoice["idle_fee_line"] == {
        "amount": Decimal("2000.00"),
        "chargeable_minutes": None,
        "fee_per_minute": None,
        "grace_minutes_applied": None,
    }


def test_invoice_segment_price_does_not_change_when_tariff_changes(db_session):
    env = make_invoice_session(db_session, idle_amount=Decimal("2000.00"))
    before = get_session_invoice_breakdown(
        db_session, env["session"].id, env["driver"]
    )
    before_rows = db_session.query(SessionBillingSegment).filter_by(
        session_id=env["session"].id
    ).all()
    original_snapshot = [
        (row.price_per_kwh, row.amount) for row in before_rows
    ]

    for period in env["tariff"].periods:
        period.price_per_kwh = Decimal("9999.00")
    env["tariff"].idle_fee_per_minute = Decimal("3000.00")
    db_session.commit()
    after = get_session_invoice_breakdown(
        db_session, env["session"].id, env["driver"]
    )

    assert [
        (segment["price_per_kwh"], segment["amount"])
        for segment in after["segments"]
    ] == original_snapshot
    assert after["total_amount"] == before["total_amount"]
    assert after["idle_fee_line"] == before["idle_fee_line"]


def test_needs_review_invoice_has_no_provisional_money_or_segments(db_session):
    env = make_invoice_session(
        db_session,
        status="NEEDS_REVIEW",
        needs_review=True,
        persist_segments=False,
    )

    invoice = get_session_invoice_breakdown(
        db_session, env["session"].id, env["driver"]
    )

    assert invoice["invoice_status"] == "pending_review"
    assert invoice["segments"] == []
    assert invoice["energy_amount"] is None
    assert invoice["idle_fee_line"] is None
    assert invoice["total_amount"] is None
    assert invoice["charging_amount"] is None
    assert invoice["idle_fee"] is None


def test_needs_review_invoice_endpoint_serializes_null_money(client, db_session):
    env = make_invoice_session(
        db_session,
        status="NEEDS_REVIEW",
        needs_review=True,
        persist_segments=False,
    )
    token = create_access_token(
        {"sub": str(env["driver"].id), "role": "CUSTOMER"}
    )

    response = client.get(
        f"/api/v1/sessions/{env['session'].id}/invoice",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["invoice_status"] == "pending_review"
    assert payload["segments"] == []
    assert payload["energy_amount"] is None
    assert payload["idle_fee_line"] is None
    assert payload["total_amount"] is None


def test_driver_cannot_read_another_drivers_invoice(client, db_session):
    env = make_invoice_session(db_session)
    unauthenticated_response = client.get(
        f"/api/v1/sessions/{env['session'].id}/invoice"
    )
    assert unauthenticated_response.status_code == 401

    token = create_access_token(
        {"sub": str(env["other_driver"].id), "role": "CUSTOMER"}
    )

    response = client.get(
        f"/api/v1/sessions/{env['session'].id}/invoice",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403


def test_active_session_does_not_return_an_unfinalized_invoice(client, db_session):
    env = make_invoice_session(
        db_session,
        status="CHARGING",
        persist_segments=False,
    )
    token = create_access_token(
        {"sub": str(env["driver"].id), "role": "CUSTOMER"}
    )

    response = client.get(
        f"/api/v1/sessions/{env['session'].id}/invoice",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 409
    assert "chưa kết thúc" in response.json()["detail"]
