"""Kiểm thử tính năng tự động xác nhận lượt đặt chỗ khi tài xế đến cắm sạc (User Story S-48, S-50 / SCRUM-378)."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import pytest
from fastapi import HTTPException

from app.core.security import get_password_hash
from app.models.id_tag import IdTag
from app.models.reservation import Reservation, ReservationStatus
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.user import User
from app.models.wallet import Wallet
from app.services.reservation_service import (
    confirm_reservation_usage,
    get_my_reservations,
)
from app.services.session_service import start_charging_session, stop_charging_session


@pytest.fixture
def env_auto_confirm(db_session):
    """Chuẩn bị dữ liệu tài xế, trạm sạc, trụ sạc và đầu nối."""
    cpo = User(
        username="cpo_auto",
        email="cpo_auto@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="OPERATOR",
        is_active=True,
    )
    driver1 = User(
        username="driver_auto_1",
        email="driver1_auto@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="CUSTOMER",
        is_active=True,
    )
    driver2 = User(
        username="driver_auto_2",
        email="driver2_auto@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([cpo, driver1, driver2])
    db_session.commit()

    # Ví điện tử
    wallet1 = Wallet(
        user_id=driver1.id,
        balance=Decimal("200000.00"),
        is_debt_locked=False,
    )
    wallet2 = Wallet(
        user_id=driver2.id,
        balance=Decimal("200000.00"),
        is_debt_locked=False,
    )
    db_session.add_all([wallet1, wallet2])

    # Trạm sạc
    station = Station(
        operator_id=cpo.id,
        name="Trạm Sạc Tự Động Xác Nhận",
        address="Khu CNC Thái Nguyên",
        latitude=21.5335,
        longitude=105.8755,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(station)
    db_session.commit()

    tariff = Tariff(
        station_id=station.id,
        name="Biểu giá chuẩn",
        price_normal=Decimal("3500.00"),
        price_peak=Decimal("4500.00"),
        price_offpeak=Decimal("2500.00"),
        is_active=True,
    )
    db_session.add(tariff)

    # Trụ sạc và đầu nối
    cp = ChargingPoint(
        station_id=station.id,
        code="CP-AUTO-01",
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(cp)
    db_session.commit()

    conn1 = Connector(
        charge_point_id=cp.id,
        connector_id=1,
        connector_number=1,
        type="CCS2",
        status="AVAILABLE",
        is_active=True,
        max_power_kw=60.0,
    )
    conn2 = Connector(
        charge_point_id=cp.id,
        connector_id=2,
        connector_number=2,
        type="Type 2",
        status="AVAILABLE",
        is_active=True,
        max_power_kw=22.0,
    )
    db_session.add_all([conn1, conn2])
    db_session.commit()

    return {
        "driver1": driver1,
        "driver2": driver2,
        "station": station,
        "cp": cp,
        "conn1": conn1,
        "conn2": conn2,
    }


def test_start_session_on_reserved_connector_by_owner_auto_confirms(db_session, env_auto_confirm):
    """Tài xế đặt chỗ trước, khi tới cắm sạc trên đúng cổng RESERVED thì sạc thành công và đặt chỗ tự động COMPLETED."""
    driver1 = env_auto_confirm["driver1"]
    driver2 = env_auto_confirm["driver2"]
    conn1 = env_auto_confirm["conn1"]
    cp = env_auto_confirm["cp"]

    # 1. Tạo đặt chỗ cho driver1 trên conn1
    now = datetime.now(timezone.utc)
    res = Reservation(
        user_id=driver1.id,
        charge_point_id=cp.id,
        connector_id=conn1.id,
        id_tag="TAG-001",
        start_time=now,
        expiry_date=now + timedelta(minutes=15),
        status=ReservationStatus.ACTIVE.value,
    )
    conn1.status = "RESERVED"
    db_session.add(res)
    db_session.commit()

    # 2. Driver khác (driver2) cố tình cắm sạc cổng này -> Phải bị chặn 409
    with pytest.raises(HTTPException) as exc_info:
        start_charging_session(
            db=db_session,
            user=driver2,
            connector_id=conn1.id,
        )
    assert exc_info.value.status_code == 409
    assert "đang được giữ chỗ" in exc_info.value.detail

    # 3. Chính driver1 đến cắm sạc -> Phải thành công và tự động chuyển reservation sang COMPLETED
    session = start_charging_session(
        db=db_session,
        user=driver1,
        connector_id=conn1.id,
    )
    assert session is not None
    assert session.status == "ACTIVE"
    assert conn1.status == "CHARGING"

    # Kiểm tra reservation đã được tự động xác nhận thành COMPLETED
    db_session.refresh(res)
    assert res.status == ReservationStatus.COMPLETED.value


def test_reservation_stays_active_until_driver_charges(db_session, env_auto_confirm):
    """Đặt chỗ phải giữ nguyên ACTIVE để chờ tài xế di chuyển tới, không được tự ý hoàn thành bởi các phiên sạc cũ."""
    driver1 = env_auto_confirm["driver1"]
    conn1 = env_auto_confirm["conn1"]
    cp = env_auto_confirm["cp"]

    # 1. Giả sử tài xế đã từng có một phiên sạc trong quá khứ 10 phút trước
    past_session = start_charging_session(
        db=db_session,
        user=driver1,
        connector_id=conn1.id,
    )
    stop_charging_session(
        db=db_session,
        user=driver1,
        session_id=past_session.id,
    )
    # Giả lập thời gian của past_session là 10 phút trước
    ten_mins_ago = datetime.now(timezone.utc) - timedelta(minutes=10)
    past_session.start_time = ten_mins_ago - timedelta(minutes=15)
    past_session.end_time = ten_mins_ago
    db_session.commit()

    # 2. Bây giờ tài xế tạo một lượt đặt chỗ MỚI
    now = datetime.now(timezone.utc)
    res = Reservation(
        user_id=driver1.id,
        charge_point_id=cp.id,
        connector_id=conn1.id,
        id_tag="TAG-001",
        start_time=now,
        expiry_date=now + timedelta(minutes=15),
        status=ReservationStatus.ACTIVE.value,
    )
    conn1.status = "RESERVED"
    db_session.add(res)
    db_session.commit()

    # 3. Khi tài xế xem danh sách đặt chỗ, lượt đặt chỗ MỚI PHẢI LÀ ACTIVE (không bị phiên sạc cũ hoàn thành nhầm)
    my_res = get_my_reservations(db=db_session, user=driver1)
    matched = next((r for r in my_res if r.id == res.id), None)
    assert matched is not None
    assert matched.status == ReservationStatus.ACTIVE.value
    assert matched.station_latitude == 21.5335
    assert matched.station_longitude == 105.8755

    # 4. Khi tài xế di chuyển tới và bắt đầu sạc
    new_session = start_charging_session(
        db=db_session,
        user=driver1,
        connector_id=conn1.id,
    )

    # Lúc này lượt đặt chỗ mới được tự động hoàn thành
    my_res_after = get_my_reservations(db=db_session, user=driver1)
    matched_after = next((r for r in my_res_after if r.id == res.id), None)
    assert matched_after is not None
    assert matched_after.status == ReservationStatus.COMPLETED.value
    assert matched_after.session_id == new_session.id
    assert matched_after.no_show_fee == 0.0
