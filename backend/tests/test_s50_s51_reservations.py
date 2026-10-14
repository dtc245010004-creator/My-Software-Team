"""Kiểm thử tối thiểu cho Story S-50 và S-51 (SCRUM-374..377, SCRUM-380..381)."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token, get_password_hash
from app.models.reservation import Reservation, ReservationStatus
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.services.reservation_service import (
    expire_reservation_atomic,
)


@pytest.fixture
def s50_s51_setup(db_session):
    driver_1 = User(
        username="driver_s50_1",
        email="driver_s50_1@evcsms.vn",
        password_hash=get_password_hash("Pass123!"),
        role="CUSTOMER",
        is_active=True,
    )
    driver_2 = User(
        username="driver_s50_2",
        email="driver_s50_2@evcsms.vn",
        password_hash=get_password_hash("Pass123!"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([driver_1, driver_2])
    db_session.commit()

    wallet_1 = Wallet(user_id=driver_1.id, balance=Decimal("100000.00"))
    wallet_2 = Wallet(user_id=driver_2.id, balance=Decimal("100000.00"))
    db_session.add_all([wallet_1, wallet_2])
    db_session.commit()

    station = Station(
        name="Trạm S50",
        address="123 Kim Mã, Hà Nội",
        is_active=True,
        no_show_fee=Decimal("25000.00"),  # Cấu hình phí riêng 25k (SCRUM-374)
    )
    db_session.add(station)
    db_session.commit()

    cp = ChargingPoint(station_id=station.id, code="CP-S50", is_active=True)
    db_session.add(cp)
    db_session.commit()

    conn1 = Connector(charge_point_id=cp.id, is_active=True, status="RESERVED", ocpp_status="Reserved")
    conn2 = Connector(charge_point_id=cp.id, is_active=True, status="RESERVED", ocpp_status="Reserved")
    db_session.add_all([conn1, conn2])
    db_session.commit()

    now = datetime.now(timezone.utc)
    # res1: Quá hạn (đã hết hạn 10 phút trước)
    res_expired = Reservation(
        user_id=driver_1.id,
        charge_point_id=cp.id,
        connector_id=conn1.id,
        id_tag="TAG-S50-1",
        start_time=now - timedelta(minutes=40),
        expiry_date=now - timedelta(minutes=10),
        status=ReservationStatus.ACTIVE.value,
    )
    # res2: Còn hạn (hết hạn sau 30 phút)
    res_valid = Reservation(
        user_id=driver_1.id,
        charge_point_id=cp.id,
        connector_id=conn2.id,
        id_tag="TAG-S50-2",
        start_time=now,
        expiry_date=now + timedelta(minutes=30),
        status=ReservationStatus.ACTIVE.value,
    )
    db_session.add_all([res_expired, res_valid])
    db_session.commit()

    token_1 = create_access_token(data={"sub": str(driver_1.id)})
    token_2 = create_access_token(data={"sub": str(driver_2.id)})

    return {
        "driver_1": driver_1,
        "driver_2": driver_2,
        "wallet_1": wallet_1,
        "station": station,
        "conn1": conn1,
        "conn2": conn2,
        "res_expired": res_expired,
        "res_valid": res_valid,
        "token_1": token_1,
        "token_2": token_2,
    }


@pytest.mark.asyncio
async def test_s50_expired_reservation_charges_fee_and_releases_connector(db_session, s50_s51_setup):
    """SCRUM-374..377: Quá hạn -> EXPIRED, mở Available, trừ phí qua sổ cái."""
    res = s50_s51_setup["res_expired"]
    conn = s50_s51_setup["conn1"]
    wallet = s50_s51_setup["wallet_1"]

    # Chạy xử lý quá hạn
    success = await expire_reservation_atomic(db_session, res.id)
    assert success is True

    # Kiểm tra trạng thái
    db_session.refresh(res)
    db_session.refresh(conn)
    db_session.refresh(wallet)

    assert res.status == ReservationStatus.EXPIRED.value
    assert conn.status == "AVAILABLE"
    # Ví bị trừ 25,000 VND theo cấu hình của trạm
    assert wallet.balance == Decimal("75000.00")

    # Kiểm tra dòng sổ cái
    tx = (
        db_session.query(WalletTransaction)
        .filter(WalletTransaction.reference_id == f"reservation_{res.id}")
        .first()
    )
    assert tx is not None
    assert tx.amount == Decimal("-25000.00")
    assert tx.reference_type == "RESERVATION_NO_SHOW"


@pytest.mark.asyncio
async def test_s50_idempotency_run_twice_charges_once(db_session, s50_s51_setup):
    """SCRUM-377: Chạy lặp lại nhiều lần chỉ trừ tiền 1 lần (Idempotency)."""
    res = s50_s51_setup["res_expired"]
    wallet = s50_s51_setup["wallet_1"]

    await expire_reservation_atomic(db_session, res.id)
    balance_after_first = wallet.balance

    # Chạy lần 2
    success2 = await expire_reservation_atomic(db_session, res.id)
    assert success2 is False  # Rowcount = 0 vì không còn ACTIVE

    db_session.refresh(wallet)
    assert wallet.balance == balance_after_first

    # Kiểm tra chỉ có duy nhất 1 dòng sổ cái
    count = (
        db_session.query(WalletTransaction)
        .filter(WalletTransaction.reference_id == f"reservation_{res.id}")
        .count()
    )
    assert count == 1


@pytest.mark.asyncio
async def test_s51_cancel_before_expiry_happy_path(client: TestClient, db_session, s50_s51_setup):
    """SCRUM-380, SCRUM-381: Hủy trước hạn -> CANCELLED, connector AVAILABLE, không tính phí."""
    res = s50_s51_setup["res_valid"]
    conn = s50_s51_setup["conn2"]
    wallet = s50_s51_setup["wallet_1"]
    initial_balance = wallet.balance

    headers = {"Authorization": f"Bearer {s50_s51_setup['token_1']}"}
    response = client.post(f"/api/v1/reservations/{res.id}/cancel", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "CANCELLED"

    db_session.refresh(conn)
    db_session.refresh(wallet)
    assert conn.status == "AVAILABLE"
    assert wallet.balance == initial_balance  # Không bị trừ phí


def test_s51_cancel_after_expiry_rejected(client: TestClient, s50_s51_setup):
    """SCRUM-380: Đặt chỗ đã quá hạn thì không được hủy -> 400 Bad Request."""
    res = s50_s51_setup["res_expired"]
    headers = {"Authorization": f"Bearer {s50_s51_setup['token_1']}"}
    response = client.post(f"/api/v1/reservations/{res.id}/cancel", headers=headers)
    assert response.status_code == 400
    assert "quá hạn" in response.text


def test_s51_cancel_other_user_reservation_returns_403(client: TestClient, s50_s51_setup):
    """SCRUM-380: Đặt chỗ của người khác thì bị chặn -> 403 Forbidden."""
    res = s50_s51_setup["res_valid"]
    # driver_2 gọi hủy đặt chỗ của driver_1
    headers = {"Authorization": f"Bearer {s50_s51_setup['token_2']}"}
    response = client.post(f"/api/v1/reservations/{res.id}/cancel", headers=headers)
    assert response.status_code == 403
