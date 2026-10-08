from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.core.config import Settings, settings
from app.core.security import create_access_token
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.ocpp.handlers.status_notification import handle_status_notification
from app.services.billing import calculate_idle_fee, calculate_session_total


@pytest.fixture
def admin_headers(db_session):
    admin = User(
        username="billing_admin",
        email="billing_admin@evcsms.vn",
        password_hash="test-hash",
        role="ADMIN",
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    token = create_access_token({"sub": str(admin.id), "role": admin.role})
    return {"Authorization": f"Bearer {token}"}


def test_calculate_idle_fee_within_grace_period():
    idle_start = datetime(2026, 10, 8, 10, 0, tzinfo=timezone.utc)

    fee = calculate_idle_fee(
        idle_start,
        idle_start + timedelta(minutes=4, seconds=59),
        5,
        Decimal("1000.00"),
    )

    assert fee == Decimal("0.00")


def test_calculate_idle_fee_rounds_billable_minutes_up_after_grace():
    idle_start = datetime(2026, 10, 8, 10, 0, tzinfo=timezone.utc)

    fee = calculate_idle_fee(
        idle_start,
        idle_start + timedelta(minutes=7),
        5,
        Decimal("1000.00"),
    )

    assert fee == Decimal("2000.00")


def test_calculate_idle_fee_caps_chargeable_minutes():
    idle_start = datetime(2026, 10, 8, 10, 0, tzinfo=timezone.utc)

    fee = calculate_idle_fee(
        idle_start,
        idle_start + timedelta(minutes=300),
        5,
        Decimal("1000.00"),
    )

    assert fee == Decimal("240000.00")


def test_settings_default_idle_fee_cap_is_240_minutes():
    assert Settings.model_fields["IDLE_FEE_MAX_MINUTES"].default == 240


def test_calculate_session_total_uses_configured_idle_fee_cap(monkeypatch):
    idle_start = datetime(2026, 10, 8, 10, 0, tzinfo=timezone.utc)
    session = SimpleNamespace(
        total_kwh=Decimal("0"),
        applied_price_per_kwh=Decimal("0"),
        connector=SimpleNamespace(
            idle_started_at=idle_start,
            idle_ended_at=idle_start + timedelta(minutes=15),
        ),
    )
    tariff = SimpleNamespace(
        idle_fee_per_minute=Decimal("1000.00"), idle_grace_minutes=5
    )
    monkeypatch.setattr(settings, "IDLE_FEE_MAX_MINUTES", 7)

    total = calculate_session_total(session, tariff)

    assert total.idle_amount == Decimal("7000.00")


def test_calculate_session_total_without_idle_status_charges_energy_only():
    session = SimpleNamespace(
        total_kwh=Decimal("2.000"),
        applied_price_per_kwh=Decimal("3500.00"),
        connector=None,
    )
    tariff = SimpleNamespace(
        idle_fee_per_minute=Decimal("1000.00"), idle_grace_minutes=5
    )

    total = calculate_session_total(session, tariff)

    assert total.energy_amount == Decimal("7000.00")
    assert total.idle_amount == Decimal("0.00")
    assert total.total_amount == Decimal("7000.00")


def test_status_notifications_capture_idle_start_and_available_time(db_session):
    station = Station(
        name="Trạm kiểm thử phí chiếm trụ",
        address="Địa chỉ kiểm thử",
        total_grid_capacity_kw=100,
    )
    charging_point = ChargingPoint(
        station=station, code="CP-BILLING-IDLE", max_power_kw=60
    )
    connector = Connector(
        charging_point=charging_point,
        connector_number=1,
        connector_type="CCS2",
        max_power_kw=60,
    )
    db_session.add(charging_point)
    db_session.commit()

    handle_status_notification(
        db_session,
        charging_point,
        {
            "connectorId": 1,
            "status": "Finishing",
            "timestamp": "2026-10-08T10:00:00Z",
        },
    )
    handle_status_notification(
        db_session,
        charging_point,
        {
            "connectorId": 1,
            "status": "Available",
            "timestamp": "2026-10-08T10:07:00Z",
        },
    )
    session = SimpleNamespace(
        total_kwh=Decimal("2.000"),
        applied_price_per_kwh=Decimal("3500.00"),
        connector=connector,
    )
    tariff = SimpleNamespace(
        idle_fee_per_minute=Decimal("1000.00"), idle_grace_minutes=5
    )

    total = calculate_session_total(session, tariff)

    assert connector.idle_started_at == datetime(2026, 10, 8, 10, 0, tzinfo=timezone.utc)
    assert connector.idle_ended_at == datetime(2026, 10, 8, 10, 7, tzinfo=timezone.utc)
    assert total.idle_amount == Decimal("2000.00")
    assert total.total_amount == Decimal("9000.00")


def test_late_available_only_records_marker_after_session_billing(db_session):
    station = Station(
        name="Trạm kiểm thử Available muộn",
        address="Địa chỉ kiểm thử",
        total_grid_capacity_kw=100,
    )
    charging_point = ChargingPoint(
        station=station, code="CP-BILLING-LATE", max_power_kw=60
    )
    connector = Connector(
        charging_point=charging_point,
        connector_number=1,
        connector_type="CCS2",
        max_power_kw=60,
    )
    user = User(
        username="late_idle_driver",
        email="late_idle_driver@evcsms.vn",
        password_hash="test-hash",
        role="CUSTOMER",
        is_active=True,
    )
    wallet = Wallet(user=user, balance=Decimal("100000.00"))
    session = ChargingSession(
        user=user,
        connector=connector,
        total_kwh=Decimal("2.000"),
        applied_price_per_kwh=Decimal("3500.00"),
        total_amount=Decimal("7000.00"),
        idle_amount=Decimal("0.00"),
        status="COMPLETED",
    )
    db_session.add_all([charging_point, wallet, session])
    db_session.commit()

    handle_status_notification(
        db_session,
        charging_point,
        {
            "connectorId": 1,
            "status": "Finishing",
            "timestamp": "2026-10-08T10:00:00Z",
        },
    )
    billed_before_available = calculate_session_total(
        session,
        SimpleNamespace(
            idle_fee_per_minute=Decimal("1000.00"), idle_grace_minutes=5
        ),
    )
    assert billed_before_available.idle_amount == Decimal("0.00")
    assert billed_before_available.total_amount == Decimal("7000.00")

    handle_status_notification(
        db_session,
        charging_point,
        {
            "connectorId": 1,
            "status": "Available",
            "timestamp": "2026-10-08T10:07:00Z",
        },
    )

    assert connector.idle_ended_at == datetime(2026, 10, 8, 10, 7, tzinfo=timezone.utc)
    assert session.total_amount == Decimal("7000.00")
    assert session.idle_amount == Decimal("0.00")
    assert wallet.balance == Decimal("100000.00")
    assert db_session.query(WalletTransaction).filter_by(wallet_id=wallet.id).count() == 0


def _valid_tariff_payload():
    return {
        "name": "Biểu giá kiểm thử",
        "price_normal": 3000,
        "price_peak": 4000,
        "price_offpeak": 2000,
    }


def test_create_tariff_defaults_idle_fields_to_zero(client, admin_headers):
    response = client.post(
        "/api/v1/tariffs",
        json=_valid_tariff_payload(),
        headers=admin_headers,
    )

    assert response.status_code == 201
    assert Decimal(response.json()["idle_fee_per_minute"]) == Decimal("0.00")
    assert response.json()["idle_grace_minutes"] == 0


def test_update_tariff_accepts_idle_fields(client, db_session, admin_headers):
    tariff = Tariff(
        name="Biểu giá kiểm thử",
        price_normal=3000,
        price_peak=4000,
        price_offpeak=2000,
    )
    db_session.add(tariff)
    db_session.commit()

    response = client.put(
        f"/api/v1/tariffs/{tariff.id}",
        json={"idle_fee_per_minute": 1000, "idle_grace_minutes": 5},
        headers=admin_headers,
    )

    assert response.status_code == 200
    assert Decimal(response.json()["idle_fee_per_minute"]) == Decimal("1000.00")
    assert response.json()["idle_grace_minutes"] == 5


@pytest.mark.parametrize(
    "field",
    [
        "price_normal",
        "price_peak",
        "price_offpeak",
        "idle_fee_per_minute",
        "idle_grace_minutes",
    ],
)
def test_create_tariff_rejects_negative_values(client, admin_headers, field):
    payload = _valid_tariff_payload()
    payload[field] = -1

    response = client.post("/api/v1/tariffs", json=payload, headers=admin_headers)

    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any(
        error["loc"][-1] == field and "không được âm" in error["msg"]
        for error in errors
    )


@pytest.mark.parametrize(
    "field",
    [
        "price_normal",
        "price_peak",
        "price_offpeak",
        "idle_fee_per_minute",
        "idle_grace_minutes",
    ],
)
def test_update_tariff_rejects_negative_values(
    client, db_session, admin_headers, field
):
    tariff = Tariff(
        name="Biểu giá kiểm thử",
        price_normal=3000,
        price_peak=4000,
        price_offpeak=2000,
    )
    db_session.add(tariff)
    db_session.commit()
    payload = {field: -1}

    response = client.put(
        f"/api/v1/tariffs/{tariff.id}", json=payload, headers=admin_headers
    )

    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any(
        error["loc"][-1] == field and "không được âm" in error["msg"]
        for error in errors
    )
