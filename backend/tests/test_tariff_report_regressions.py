from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from app.core.datetime_utils import VIETNAM_TZ, get_vn_now
from app.core.security import create_access_token
from app.models.station import Station
from app.models.tariff import Tariff
from app.models.user import User


def _user(db_session, username: str, role: str) -> User:
    user = User(
        username=username,
        email=f"{username}@tariff-report.test",
        password_hash="test-password-hash",
        full_name=username,
        role=role,
        is_active=True,
    )
    db_session.add(user)
    db_session.flush()
    return user


def _headers(user: User) -> dict[str, str]:
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {"Authorization": f"Bearer {token}"}


def _valid_tariff_payload() -> dict:
    return {
        "name": "Biểu giá kiểm thử báo cáo",
        "price_normal": "3000.00",
        "price_peak": "4000.00",
        "price_offpeak": "2000.00",
    }


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("price_normal", "100000000"),
        ("price_peak", "3500.555"),
        ("price_offpeak", "3500.555"),
        ("idle_fee_per_minute", "1000.555"),
    ],
)
def test_create_tariff_rejects_numeric_values_outside_column_precision(
    client, db_session, field, value
):
    admin = _user(db_session, f"tariff_create_precision_{field}", "ADMIN")
    db_session.commit()
    payload = _valid_tariff_payload()
    payload[field] = value

    response = client.post(
        "/api/v1/tariffs", json=payload, headers=_headers(admin)
    )

    assert response.status_code == 422
    assert any(error["loc"][-1] == field for error in response.json()["detail"])


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("price_normal", "100000000"),
        ("price_peak", "3500.555"),
        ("price_offpeak", "3500.555"),
        ("idle_fee_per_minute", "1000.555"),
    ],
)
def test_update_tariff_rejects_numeric_values_outside_column_precision(
    client, db_session, field, value
):
    admin = _user(db_session, f"tariff_update_precision_{field}", "ADMIN")
    tariff = Tariff(
        name="Biểu giá gốc",
        price_normal=Decimal("3000.00"),
        price_peak=Decimal("4000.00"),
        price_offpeak=Decimal("2000.00"),
    )
    db_session.add(tariff)
    db_session.commit()

    response = client.put(
        f"/api/v1/tariffs/{tariff.id}",
        json={field: value},
        headers=_headers(admin),
    )

    assert response.status_code == 422
    assert any(error["loc"][-1] == field for error in response.json()["detail"])


def test_updating_price_preserves_idle_fee_settings(client, db_session):
    admin = _user(db_session, "tariff_preserve_idle_admin", "ADMIN")
    tariff = Tariff(
        name="Biểu giá có phí chiếm trụ",
        price_normal=Decimal("3000.00"),
        price_peak=Decimal("4000.00"),
        price_offpeak=Decimal("2000.00"),
        idle_fee_per_minute=Decimal("1000.50"),
        idle_grace_minutes=7,
    )
    db_session.add(tariff)
    db_session.commit()

    response = client.put(
        f"/api/v1/tariffs/{tariff.id}",
        json={"price_normal": "3500.00"},
        headers=_headers(admin),
    )

    assert response.status_code == 200, response.text
    assert response.json()["price_normal"] == "3500.00"
    assert response.json()["idle_fee_per_minute"] == "1000.50"
    assert response.json()["idle_grace_minutes"] == 7


def _station_tariff(db_session, station_id: int, name: str) -> Tariff:
    tariff = Tariff(
        station_id=station_id,
        name=name,
        price_normal=Decimal("3000.00"),
        price_peak=Decimal("4000.00"),
        price_offpeak=Decimal("2000.00"),
        effective_from=datetime(2000, 1, 1, tzinfo=VIETNAM_TZ),
    )
    db_session.add(tariff)
    db_session.flush()
    return tariff


def _tomorrow_start() -> datetime:
    now = get_vn_now()
    return datetime(now.year, now.month, now.day, tzinfo=VIETNAM_TZ) + timedelta(days=1)


def test_repeated_station_tariff_effective_time_returns_conflict(
    client, db_session
):
    admin = _user(db_session, "tariff_unique_admin", "ADMIN")
    station = Station(name="Trạm biểu giá unique", address="Địa chỉ test")
    db_session.add(station)
    db_session.flush()
    tariff = _station_tariff(db_session, station.id, "Biểu giá hiện tại")
    db_session.commit()
    effective_from = _tomorrow_start().isoformat()
    headers = _headers(admin)

    first = client.put(
        f"/api/v1/tariffs/{tariff.id}",
        json={"price_normal": "3100.00", "effective_from": effective_from},
        headers=headers,
    )
    duplicate = client.put(
        f"/api/v1/tariffs/{tariff.id}",
        json={"price_normal": "3200.00", "effective_from": effective_from},
        headers=headers,
    )

    assert first.status_code == 200, first.text
    assert duplicate.status_code == 409
    assert "thời điểm hiệu lực" in duplicate.json()["detail"]


def test_create_rejects_duplicate_station_effective_time(client, db_session):
    admin = _user(db_session, "tariff_create_unique_admin", "ADMIN")
    station = Station(name="Trạm tạo tariff unique", address="Địa chỉ test")
    db_session.add(station)
    db_session.commit()
    payload = {
        **_valid_tariff_payload(),
        "station_id": station.id,
        "effective_from": _tomorrow_start().isoformat(),
    }
    headers = _headers(admin)

    first = client.post("/api/v1/tariffs", json=payload, headers=headers)
    duplicate = client.post("/api/v1/tariffs", json=payload, headers=headers)

    assert first.status_code == 201, first.text
    assert duplicate.status_code == 409


def test_operator_cannot_create_tariff_for_another_operators_station(
    client, db_session
):
    owner = _user(db_session, "tariff_station_owner", "OPERATOR")
    other_operator = _user(db_session, "tariff_other_operator", "OPERATOR")
    station = Station(
        name="Trạm thuộc chủ khác",
        address="Địa chỉ test",
        operator_id=owner.id,
    )
    db_session.add(station)
    db_session.commit()

    response = client.post(
        "/api/v1/tariffs",
        json={**_valid_tariff_payload(), "station_id": station.id},
        headers=_headers(other_operator),
    )

    assert response.status_code == 403


def test_operator_cannot_update_tariff_for_another_operators_station(
    client, db_session
):
    owner = _user(db_session, "tariff_update_station_owner", "OPERATOR")
    other_operator = _user(db_session, "tariff_update_other_operator", "OPERATOR")
    station = Station(
        name="Trạm cập nhật thuộc chủ khác",
        address="Địa chỉ test",
        operator_id=owner.id,
    )
    db_session.add(station)
    db_session.flush()
    tariff = _station_tariff(db_session, station.id, "Biểu giá riêng")
    db_session.commit()

    response = client.put(
        f"/api/v1/tariffs/{tariff.id}",
        json={"price_normal": "3500.00"},
        headers=_headers(other_operator),
    )

    assert response.status_code == 403
