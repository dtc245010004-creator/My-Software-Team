"""
Kiểm thử tự động cho Story S-33 / Task SCRUM-224:
Hóa đơn chi tiết hiển thị danh sách từng đoạn giá, phí chiếm trụ và cảnh báo phiên chờ xử lý.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.core.security import get_password_hash
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.user import User
from app.services.session_service import (
    calculate_session_price_segments,
    get_session_invoice,
)


@pytest.fixture
def invoice_env(db_session):
    """Tạo môi trường test: Tài xế, Trạm, Trụ, Cổng, Biểu giá TOU."""
    driver = User(
        username="driver_invoice_user",
        email="driver_inv@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="CUSTOMER",
        is_active=True,
    )
    driver_other = User(
        username="driver_other_user",
        email="driver_other@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="CUSTOMER",
        is_active=True,
    )
    cpo = User(
        username="cpo_invoice_user",
        email="cpo_inv@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="OPERATOR",
        is_active=True,
    )
    db_session.add_all([driver, driver_other, cpo])
    db_session.commit()

    st = Station(
        operator_id=cpo.id,
        name="Trạm Test Hóa Đơn S-33",
        address="100 Phố Điện",
        latitude=21.0,
        longitude=105.8,
        total_grid_capacity_kw=150.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(st)
    db_session.commit()

    cp = ChargingPoint(
        station_id=st.id,
        code="EVSE-INV-01",
        vendor="ABB Terra",
        max_power_kw=120.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(cp)
    db_session.commit()

    conn = Connector(
        charging_point_id=cp.id,
        connector_number=1,
        connector_type="CCS2",
        max_power_kw=120.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(conn)

    # Biểu giá TOU 3 khung giờ
    tariff = Tariff(
        station_id=st.id,
        name="Biểu giá TOU 3 Khung Giờ Chuẩn",
        price_normal=Decimal("3200.00"),
        price_peak=Decimal("4500.00"),
        price_offpeak=Decimal("2500.00"),
        peak_start="09:30",
        peak_end="11:30",
        peak_start_2="17:00",
        peak_end_2="20:00",
        offpeak_start="22:00",
        offpeak_end="04:00",
        is_active=True,
    )
    db_session.add(tariff)
    db_session.commit()

    return {
        "driver": driver,
        "driver_other": driver_other,
        "cpo": cpo,
        "station": st,
        "cp": cp,
        "conn": conn,
        "tariff": tariff,
    }


def test_calculate_session_price_segments_single_interval(invoice_env):
    """1. Phiên sạc hoàn toàn nằm trong khung giờ bình thường (10:00 - 11:00 UTC = 17:00 - 18:00 VN -> Giờ cao điểm)."""
    tariff = invoice_env["tariff"]
    # 17:15 VN đến 18:45 VN (hoàn toàn trong Peak 2: 17:00 - 20:00)
    # 17:15 VN = 10:15 UTC
    start = datetime(2026, 10, 7, 10, 15, tzinfo=timezone.utc)
    end = datetime(2026, 10, 7, 11, 45, tzinfo=timezone.utc)
    total_kwh = Decimal("30.00")

    segments = calculate_session_price_segments(
        start_time=start, end_time=end, total_kwh=total_kwh, tariff=tariff
    )

    assert len(segments) == 1
    seg = segments[0]
    assert seg["rate_type"] == "PEAK"
    assert seg["unit_price"] == Decimal("4500.00")
    assert seg["kwh"] == Decimal("30.000")
    assert seg["amount"] == Decimal("135000.00")
    assert "17:15" in seg["time_range"]


def test_calculate_session_price_segments_crossing_boundary(invoice_env):
    """2. Phiên sạc cắt qua ranh giới từ Giờ bình thường sang Giờ cao điểm:
    Ví dụ: 09:00 VN đến 10:30 VN (Ranh giới 09:30):
    - Đoạn 1: 09:00 - 09:30 (Normal, 3,200 đ/kWh, 30 phút = 1/3 thời gian)
    - Đoạn 2: 09:30 - 10:30 (Peak, 4,500 đ/kWh, 60 phút = 2/3 thời gian)
    """
    tariff = invoice_env["tariff"]
    # 09:00 VN = 02:00 UTC; 10:30 VN = 03:30 UTC
    start = datetime(2026, 10, 7, 2, 0, tzinfo=timezone.utc)
    end = datetime(2026, 10, 7, 3, 30, tzinfo=timezone.utc)
    total_kwh = Decimal("30.000")

    segments = calculate_session_price_segments(
        start_time=start, end_time=end, total_kwh=total_kwh, tariff=tariff
    )

    assert len(segments) == 2
    # Đoạn 1: Giờ bình thường
    assert segments[0]["rate_type"] == "NORMAL"
    assert segments[0]["unit_price"] == Decimal("3200.00")
    assert segments[0]["duration_minutes"] == 30
    assert segments[0]["kwh"] == Decimal("10.000")
    assert segments[0]["amount"] == Decimal("32000.00")
    assert segments[0]["time_range"] == "09:00 - 09:30"

    # Đoạn 2: Giờ cao điểm
    assert segments[1]["rate_type"] == "PEAK"
    assert segments[1]["unit_price"] == Decimal("4500.00")
    assert segments[1]["duration_minutes"] == 60
    assert segments[1]["kwh"] == Decimal("20.000")
    assert segments[1]["amount"] == Decimal("90000.00")
    assert segments[1]["time_range"] == "09:30 - 10:30"

    # Tổng sản lượng phải khớp tuyệt đối 30 kWh
    assert sum(s["kwh"] for s in segments) == Decimal("30.000")


def test_get_session_invoice_with_idle_fee(db_session, invoice_env):
    """3. Kiểm thử hóa đơn có phí chiếm trụ (Idle fee) khi sạc đầy (BATTERY_FULL)."""
    driver = invoice_env["driver"]
    conn = invoice_env["conn"]
    tariff = invoice_env["tariff"]

    start = datetime(2026, 10, 7, 2, 0, tzinfo=timezone.utc)
    end = datetime(2026, 10, 7, 3, 0, tzinfo=timezone.utc)

    session = ChargingSession(
        user_id=driver.id,
        connector_id=conn.id,
        tariff_id=tariff.id,
        applied_price_per_kwh=tariff.price_normal,
        start_time=start,
        end_time=end,
        meter_start_kwh=Decimal("0.00"),
        meter_stop_kwh=Decimal("20.00"),
        total_kwh=Decimal("20.00"),
        total_amount=Decimal("64000.00"),
        status="COMPLETED",
        stop_reason="BATTERY_FULL",  # Sạc đầy pin và chiếm chỗ
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)

    invoice = get_session_invoice(db=db_session, session_id=session.id, user=driver)

    assert invoice["session_id"] == session.id
    assert invoice["idle_minutes"] == 15
    assert invoice["idle_rate_per_min"] == Decimal("1000.00")
    assert invoice["idle_fee"] == Decimal("15000.00")
    assert invoice["total_amount"] == invoice["charging_amount"] + invoice["idle_fee"]
    assert len(invoice["price_segments"]) > 0


def test_get_session_invoice_needs_review_alert(db_session, invoice_env):
    """4. Kiểm thử tiêu chí AC của S-33: Phiên đang cần xem xét (NEEDS_REVIEW) thì hiển thị thông báo chờ xử lý."""
    driver = invoice_env["driver"]
    conn = invoice_env["conn"]
    tariff = invoice_env["tariff"]

    session = ChargingSession(
        user_id=driver.id,
        connector_id=conn.id,
        tariff_id=tariff.id,
        applied_price_per_kwh=tariff.price_normal,
        start_time=datetime.now(timezone.utc) - timedelta(minutes=45),
        end_time=datetime.now(timezone.utc),
        meter_start_kwh=Decimal("10.00"),
        meter_stop_kwh=Decimal("15.00"),
        total_kwh=Decimal("5.00"),
        total_amount=Decimal("16000.00"),
        status="NEEDS_REVIEW",
        needs_review=True,
        is_abnormal=True,
        abnormal_reason="Số đo công tơ bất thường cần đối soát kỹ thuật",
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)

    invoice = get_session_invoice(db=db_session, session_id=session.id, user=driver)

    assert invoice["is_reviewing"] is True
    assert "Số đo công tơ bất thường" in invoice["review_message"]
    assert invoice["payment_status"] == "PENDING_REVIEW"


def test_get_session_invoice_idor_forbidden(db_session, invoice_env):
    """5. Bảo vệ chống IDOR: Tài xế khác không được xem hóa đơn của nhau (HTTP 403 Forbidden)."""
    driver = invoice_env["driver"]
    driver_other = invoice_env["driver_other"]
    conn = invoice_env["conn"]
    tariff = invoice_env["tariff"]

    session = ChargingSession(
        user_id=driver.id,
        connector_id=conn.id,
        tariff_id=tariff.id,
        applied_price_per_kwh=tariff.price_normal,
        start_time=datetime.now(timezone.utc) - timedelta(minutes=30),
        end_time=datetime.now(timezone.utc),
        total_kwh=Decimal("10.00"),
        total_amount=Decimal("32000.00"),
        status="COMPLETED",
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)

    with pytest.raises(HTTPException) as exc:
        get_session_invoice(db=db_session, session_id=session.id, user=driver_other)

    assert exc.value.status_code == 403
    assert "không có quyền" in exc.value.detail.lower()
