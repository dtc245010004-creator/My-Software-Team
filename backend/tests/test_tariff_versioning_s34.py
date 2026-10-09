"""Bộ ca kiểm thử S-34: Đổi biểu giá không ảnh hưởng phiên cũ (SCRUM-226, 227, 228, 229, 230, 231).

Các kịch bản kiểm thử:
1. Tạo biểu giá mới hiệu lực từ ngày mai -> phiên hôm nay vẫn theo giá cũ.
2. Phiên ngày mai bắt đầu -> áp dụng theo biểu giá mới.
3. Chặn ngày hiệu lực trong quá khứ hoặc hôm nay -> HTTP 400 Bad Request rõ ràng.
4. Nhiều phiên bản liên tiếp vẫn chọn đúng phiên bản hiệu lực gần nhất <= thời điểm sạc.
5. Tiền của phiên đã chốt (COMPLETED) tuyệt đối không đổi sau khi tạo biểu giá mới.
6. Phiên đang mở khi biểu giá mới được tạo: giữ nguyên giá chốt ban đầu, không bị tăng/giảm tiền.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.core.datetime_utils import VIETNAM_TZ, get_vn_now
from app.core.security import create_access_token, get_password_hash
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.user import User
from app.models.wallet import Wallet
from app.services.session_service import (
    get_or_create_default_tariff,
    start_charging_session,
    stop_charging_session,
)


@pytest.fixture
def tariff_env(db_session):
    """Môi trường test gồm Admin, Driver và hạ tầng trạm sạc."""
    admin = User(
        username="admin_tariff",
        email="admin_tariff@test.com",
        password_hash=get_password_hash("AdminPass123"),
        role="ADMIN",
        is_active=True,
    )
    driver = User(
        username="driver_tariff",
        email="driver_tariff@test.com",
        password_hash=get_password_hash("DriverPass123"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([admin, driver])
    db_session.commit()

    wallet = Wallet(
        user_id=driver.id,
        balance=Decimal("500000.00"),
        is_debt_locked=False,
    )
    db_session.add(wallet)

    station = Station(
        name="Trạm Test Biểu Giá S34",
        address="123 Phố Điện",
        latitude=21.0,
        longitude=105.8,
        total_grid_capacity_kw=100.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(station)
    db_session.commit()

    charger = ChargingPoint(
        station_id=station.id,
        code="CP-TARIFF-01",
        vendor="ABB",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(charger)
    db_session.commit()

    conn1 = Connector(
        charging_point_id=charger.id,
        connector_number=1,
        connector_type="CCS2",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    conn2 = Connector(
        charging_point_id=charger.id,
        connector_number=2,
        connector_type="CCS2",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add_all([conn1, conn2])

    # Biểu giá cũ hệ thống: hiệu lực từ năm 2000
    base_tariff = Tariff(
        station_id=None,
        name="Biểu giá gốc 2026",
        price_normal=Decimal("3000.00"),
        price_peak=Decimal("4500.00"),
        price_offpeak=Decimal("2000.00"),
        peak_start="09:30",
        peak_end="11:30",
        peak_start_2="17:00",
        peak_end_2="20:00",
        offpeak_start="22:00",
        offpeak_end="04:00",
        effective_from=datetime(2000, 1, 1, 0, 0, tzinfo=timezone.utc),
        is_active=True,
    )
    db_session.add(base_tariff)
    db_session.commit()

    admin_token = create_access_token({"sub": str(admin.id), "role": admin.role})
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    return {
        "admin": admin,
        "driver": driver,
        "station": station,
        "charger": charger,
        "conn1": conn1,
        "conn2": conn2,
        "base_tariff": base_tariff,
        "admin_headers": admin_headers,
    }


def test_block_past_and_today_effective_date(client, tariff_env):
    """SCRUM-229: Chặn đặt ngày hiệu lực trong quá khứ hoặc hôm nay."""
    headers = tariff_env["admin_headers"]
    now_vn = get_vn_now()

    # Ca 1: Ngày trong quá khứ (hôm qua)
    past_date = (now_vn - timedelta(days=1)).isoformat()
    res_past = client.post(
        "/api/v1/tariffs",
        json={
            "name": "Biểu giá quá khứ",
            "price_normal": 3200,
            "price_peak": 4600,
            "price_offpeak": 2100,
            "effective_from": past_date,
        },
        headers=headers,
    )
    assert res_past.status_code == 400
    assert "từ ngày mai trở đi" in res_past.json()["detail"]

    # Ca 2: Ngay trong hôm nay
    today_date = now_vn.isoformat()
    res_today = client.post(
        "/api/v1/tariffs",
        json={
            "name": "Biểu giá hôm nay",
            "price_normal": 3200,
            "price_peak": 4600,
            "price_offpeak": 2100,
            "effective_from": today_date,
        },
        headers=headers,
    )
    assert res_today.status_code == 400
    assert "từ ngày mai trở đi" in res_today.json()["detail"]


def test_create_new_tariff_version_does_not_affect_today_session(client, tariff_env, db_session):
    """SCRUM-227 / 228: Tạo biểu giá mới từ ngày mai -> phiên hôm nay vẫn theo giá cũ."""
    headers = tariff_env["admin_headers"]
    driver = tariff_env["driver"]
    conn = tariff_env["conn1"]
    now_vn = get_vn_now()

    # 1. Bắt đầu phiên sạc hôm nay
    session = start_charging_session(
        db=db_session,
        user=driver,
        connector_id=conn.id,
    )
    # Giá áp dụng lúc bắt đầu
    initial_applied_price = session.applied_price_per_kwh

    # 2. Admin tạo biểu giá mới có hiệu lực từ ngày mai với đơn giá tăng cao
    tomorrow_vn = (
        datetime(now_vn.year, now_vn.month, now_vn.day, tzinfo=VIETNAM_TZ)
        + timedelta(days=1)
    )
    res_new = client.post(
        "/api/v1/tariffs",
        json={
            "name": "Biểu giá mới ngày mai",
            "price_normal": 5000,
            "price_peak": 7000,
            "price_offpeak": 4000,
            "effective_from": tomorrow_vn.isoformat(),
        },
        headers=headers,
    )
    assert res_new.status_code == 201
    new_tariff_id = res_new.json()["id"]

    # 3. Kết thúc phiên sạc hôm nay
    db_session.refresh(session)
    completed_session = stop_charging_session(
        db=db_session,
        user=driver,
        session_id=session.id,
        meter_stop_kwh=Decimal("10.00"),
    )

    # Khẳng định: Phiên hôm nay vẫn giữ nguyên đơn giá cũ, không bị đổi sang biểu giá mới
    assert completed_session.tariff_id == tariff_env["base_tariff"].id
    assert completed_session.tariff_id != new_tariff_id
    assert completed_session.applied_price_per_kwh == initial_applied_price
    assert completed_session.total_amount == Decimal("10.00") * initial_applied_price


def test_future_session_applies_new_tariff_version(tariff_env, db_session):
    """SCRUM-226: Phiên sạc bắt đầu vào ngày mai áp dụng biểu giá phiên bản mới."""
    now_vn = get_vn_now()
    tomorrow_start = (
        datetime(now_vn.year, now_vn.month, now_vn.day, tzinfo=VIETNAM_TZ)
        + timedelta(days=1)
    )

    # Tạo biểu giá mới hiệu lực từ ngày mai
    v2_tariff = Tariff(
        station_id=None,
        name="Biểu giá v2 ngày mai",
        price_normal=Decimal("4000.00"),
        price_peak=Decimal("6000.00"),
        price_offpeak=Decimal("3000.00"),
        effective_from=tomorrow_start.astimezone(timezone.utc),
        is_active=True,
    )
    db_session.add(v2_tariff)
    db_session.commit()

    # Tra cứu biểu giá tại mốc ngày mai
    tariff_at_tomorrow = get_or_create_default_tariff(
        db=db_session,
        station_id=None,
        at_time=tomorrow_start.astimezone(timezone.utc) + timedelta(hours=2),
    )
    assert tariff_at_tomorrow.id == v2_tariff.id
    assert tariff_at_tomorrow.price_normal == Decimal("4000.00")

    # Tra cứu biểu giá tại mốc hôm nay vẫn ra biểu giá cũ
    tariff_at_today = get_or_create_default_tariff(
        db=db_session,
        station_id=None,
        at_time=datetime.now(timezone.utc),
    )
    assert tariff_at_today.id == tariff_env["base_tariff"].id
    assert tariff_at_today.price_normal == Decimal("3000.00")


def test_multiple_sequential_tariff_versions(db_session):
    """Nhiều phiên bản biểu giá liên tiếp theo thời gian vẫn chọn đúng bản gần nhất."""
    t_v1 = Tariff(
        name="V1 Tháng 10",
        price_normal=Decimal("3000"),
        price_peak=Decimal("4000"),
        price_offpeak=Decimal("2000"),
        effective_from=datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc),
        is_active=True,
    )
    t_v2 = Tariff(
        name="V2 Tháng 11",
        price_normal=Decimal("3500"),
        price_peak=Decimal("4500"),
        price_offpeak=Decimal("2500"),
        effective_from=datetime(2026, 11, 1, 0, 0, tzinfo=timezone.utc),
        is_active=True,
    )
    t_v3 = Tariff(
        name="V3 Tháng 12",
        price_normal=Decimal("4000"),
        price_peak=Decimal("5000"),
        price_offpeak=Decimal("3000"),
        effective_from=datetime(2026, 12, 1, 0, 0, tzinfo=timezone.utc),
        is_active=True,
    )
    db_session.add_all([t_v1, t_v2, t_v3])
    db_session.commit()

    # Ngày 15/10: chọn V1
    res_oct = get_or_create_default_tariff(
        db_session, at_time=datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)
    )
    assert res_oct.name == "V1 Tháng 10"

    # Ngày 15/11: chọn V2
    res_nov = get_or_create_default_tariff(
        db_session, at_time=datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)
    )
    assert res_nov.name == "V2 Tháng 11"

    # Ngày 15/12: chọn V3
    res_dec = get_or_create_default_tariff(
        db_session, at_time=datetime(2026, 12, 15, 12, 0, tzinfo=timezone.utc)
    )
    assert res_dec.name == "V3 Tháng 12"


def test_completed_session_immutable_after_tariff_update(tariff_env, db_session):
    """Tiền của phiên đã kết thúc (COMPLETED) không bị đổi khi tạo biểu giá mới."""
    driver = tariff_env["driver"]
    conn = tariff_env["conn1"]

    # Tạo phiên và chốt luôn trong quá khứ
    completed_session = ChargingSession(
        user_id=driver.id,
        connector_id=conn.id,
        tariff_id=tariff_env["base_tariff"].id,
        applied_price_per_kwh=Decimal("3000.00"),
        meter_start_kwh=Decimal("0.00"),
        meter_stop_kwh=Decimal("20.00"),
        total_kwh=Decimal("20.00"),
        total_amount=Decimal("60000.00"),
        status="COMPLETED",
        start_time=datetime(2026, 10, 1, 10, 0, tzinfo=timezone.utc),
        end_time=datetime(2026, 10, 1, 11, 0, tzinfo=timezone.utc),
    )
    db_session.add(completed_session)
    db_session.commit()

    # Thêm biểu giá mới gấp đôi
    new_tariff = Tariff(
        name="Biểu giá tăng gấp đôi",
        price_normal=Decimal("6000.00"),
        price_peak=Decimal("9000.00"),
        price_offpeak=Decimal("4000.00"),
        effective_from=datetime(2026, 10, 15, 0, 0, tzinfo=timezone.utc),
        is_active=True,
    )
    db_session.add(new_tariff)
    db_session.commit()

    # Đọc lại phiên cũ từ DB
    db_session.refresh(completed_session)
    assert completed_session.total_amount == Decimal("60000.00")
    assert completed_session.applied_price_per_kwh == Decimal("3000.00")
    assert completed_session.tariff_id == tariff_env["base_tariff"].id


def test_update_tariff_endpoint_creates_new_version(client, tariff_env, db_session):
    """SCRUM-228: Gọi PUT /tariffs/{id} sẽ tạo phiên bản mới kế tiếp, không đè bản đang dùng."""
    headers = tariff_env["admin_headers"]
    base_t = tariff_env["base_tariff"]
    now_vn = get_vn_now()
    tomorrow_vn = (
        datetime(now_vn.year, now_vn.month, now_vn.day, tzinfo=VIETNAM_TZ)
        + timedelta(days=1)
    )

    res = client.put(
        f"/api/v1/tariffs/{base_t.id}",
        json={
            "price_normal": 3800,
            "effective_from": tomorrow_vn.isoformat(),
        },
        headers=headers,
    )
    assert res.status_code == 200
    new_version_id = res.json()["id"]

    # Bản mới có ID khác bản cũ
    assert new_version_id != base_t.id
    # Bản cũ trong DB vẫn giữ nguyên giá cũ
    db_session.refresh(base_t)
    assert base_t.price_normal == Decimal("3000.00")

    # Bản mới trong DB lưu giá mới
    new_t = db_session.query(Tariff).filter(Tariff.id == new_version_id).first()
    assert new_t.price_normal == Decimal("3800.00")
    assert new_t.name == base_t.name
