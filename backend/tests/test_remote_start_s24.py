"""Kiểm thử tự động cho Story S-24 / Task T-51: Bốn ca của RemoteStartTransaction."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.core.config import settings
from app.core.security import create_access_token
from app.models.remote_start_request import RemoteStartRequest
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User
from app.models.wallet import Wallet
from app.services.scheduler_service import expire_pending_remote_start_requests_job


@pytest.fixture
def test_data(db_session, client):
    # Đảm bảo có user tài xế
    driver = db_session.query(User).filter(User.username == "driver_test_s24").first()
    if not driver:
        driver = User(
            username="driver_test_s24",
            email="driver_s24@evcsms.vn",
            password_hash="hashed_pwd",
            role="CUSTOMER",
            is_active=True,
        )
        db_session.add(driver)
        db_session.flush()

        wallet = Wallet(
            user_id=driver.id,
            balance=Decimal("500000.00"),
            currency="VND",
            is_debt_locked=False,
        )
        db_session.add(wallet)
        db_session.flush()

    token = create_access_token(data={"sub": str(driver.id)})
    headers = {"Authorization": f"Bearer {token}"}

    # Đảm bảo có station, charger và connector AVAILABLE
    station = db_session.query(Station).filter(Station.id == 999).first()
    if not station:
        station = Station(
            id=999,
            name="Trạm Test S24",
            address="123 Test Street",
            total_grid_capacity_kw=100.0,
            is_active=True,
        )
        db_session.add(station)
        db_session.flush()

    charger = db_session.query(ChargingPoint).filter(ChargingPoint.id == 999).first()
    if not charger:
        charger = ChargingPoint(
            id=999,
            station_id=station.id,
            code="CP-TEST-S24",
            vendor="ABB",
            max_power_kw=60.0,
            status="AVAILABLE",
            is_active=True,
        )
        db_session.add(charger)
        db_session.flush()

    connector = db_session.query(Connector).filter(Connector.id == 999).first()
    if not connector:
        connector = Connector(
            id=999,
            charging_point_id=charger.id,
            connector_number=1,
            connector_type="CCS2",
            max_power_kw=60.0,
            status="AVAILABLE",
            is_active=True,
        )
        db_session.add(connector)
        db_session.flush()
    else:
        connector.status = "AVAILABLE"

    db_session.commit()

    return client, headers, driver, connector


def test_s24_case_1_success(test_data):
    """Ca 1 của S-24: Bắt đầu sạc thành công trên trụ ảo."""
    client, headers, _, connector = test_data

    res = client.post(
        "/api/v1/sessions/remote-start",
        json={"connector_id": connector.id, "simulate_condition": "SUCCESS"},
        headers=headers,
    )
    assert res.status_code == 202
    data = res.json()
    assert "request_id" in data
    assert data["connector_id"] == connector.id

    # Kiểm tra trạng thái yêu cầu
    req_id = data["request_id"]
    status_res = client.get(
        f"/api/v1/sessions/remote-start/{req_id}",
        headers=headers,
    )
    assert status_res.status_code == 200
    st_data = status_res.json()
    assert st_data["status"] == "STARTED"
    assert st_data["session_id"] is not None


def test_s24_case_2_rejected(test_data):
    """Ca 2 của S-24: Trụ từ chối lệnh bắt đầu (Rejected)."""
    client, headers, _, connector = test_data

    res = client.post(
        "/api/v1/sessions/remote-start",
        json={"connector_id": connector.id, "simulate_condition": "REJECTED"},
        headers=headers,
    )
    assert res.status_code == 409
    assert "từ chối" in res.json()["detail"] or "Rejected" in res.json()["detail"]


def test_s24_case_3_busy(test_data):
    """Ca 3 của S-24: Đầu nối đang bận hoặc không khả dụng."""
    client, headers, _, connector = test_data

    res = client.post(
        "/api/v1/sessions/remote-start",
        json={"connector_id": connector.id, "simulate_condition": "BUSY"},
        headers=headers,
    )
    assert res.status_code == 409
    assert "bận hoặc không khả dụng" in res.json()["detail"]


def test_s24_case_4_timeout(test_data):
    """Ca 4 của S-24: Hết thời gian chờ phản hồi từ trụ sạc (Timeout)."""
    client, headers, _, connector = test_data

    res = client.post(
        "/api/v1/sessions/remote-start",
        json={"connector_id": connector.id, "simulate_condition": "TIMEOUT"},
        headers=headers,
    )
    assert res.status_code == 504
    assert "thời gian chờ" in res.json()["detail"]


def test_s24_case_4_expired_request(test_data):
    """Ca 4 của S-24: Yêu cầu hết hạn 60 giây."""
    client, headers, _, connector = test_data

    res = client.post(
        "/api/v1/sessions/remote-start",
        json={"connector_id": connector.id, "simulate_condition": "EXPIRED"},
        headers=headers,
    )
    assert res.status_code == 202
    req_id = res.json()["request_id"]

    status_res = client.get(
        f"/api/v1/sessions/remote-start/{req_id}",
        headers=headers,
    )
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "EXPIRED"


def test_remote_start_simulation_requires_admin_outside_pytest(
    test_data, monkeypatch
):
    """Cờ TESTING đơn lẻ không cho tài khoản tài xế mô phỏng ngoài pytest."""
    client, headers, _, connector = test_data
    monkeypatch.setattr(settings, "ALLOW_REMOTE_START_SIMULATION", True)
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)

    response = client.post(
        "/api/v1/sessions/remote-start",
        json={"connector_id": connector.id, "simulate_condition": "SUCCESS"},
        headers=headers,
    )

    assert response.status_code == 403
    assert "Chỉ quản trị viên" in response.json()["detail"]


def test_scheduler_expires_only_elapsed_pending_remote_starts(
    test_data, db_session
):
    """Job chỉ chuyển request PENDING đã quá hạn sang EXPIRED."""
    _, _, driver, connector = test_data
    expired = RemoteStartRequest(
        user_id=driver.id,
        connector_id=connector.id,
        id_tag=f"REMOTE-{driver.id}",
        status="PENDING",
        expires_at=datetime.now(timezone.utc) - timedelta(seconds=5),
    )
    pending = RemoteStartRequest(
        user_id=driver.id,
        connector_id=connector.id,
        id_tag=f"REMOTE-{driver.id}",
        status="PENDING",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
    )
    db_session.add_all([expired, pending])
    db_session.commit()

    assert expire_pending_remote_start_requests_job(db_session) == 1
    db_session.refresh(expired)
    db_session.refresh(pending)
    assert expired.status == "EXPIRED"
    assert pending.status == "PENDING"
