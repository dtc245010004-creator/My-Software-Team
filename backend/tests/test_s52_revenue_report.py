"""Kiểm thử tối thiểu cho Story S-52 (SCRUM-390, SCRUM-391)."""

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token, get_password_hash
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User


@pytest.fixture
def s52_setup(db_session):
    # Tạo Chủ trạm A, Chủ trạm B, và Admin
    admin = User(
        username="admin_s52",
        email="admin_s52@evcsms.vn",
        password_hash=get_password_hash("Pass123!"),
        role="ADMIN",
        is_active=True,
    )
    owner_a = User(
        username="owner_a_s52",
        email="owner_a_s52@evcsms.vn",
        password_hash=get_password_hash("Pass123!"),
        role="OPERATOR",
        is_active=True,
    )
    owner_b = User(
        username="owner_b_s52",
        email="owner_b_s52@evcsms.vn",
        password_hash=get_password_hash("Pass123!"),
        role="OPERATOR",
        is_active=True,
    )
    db_session.add_all([admin, owner_a, owner_b])
    db_session.commit()

    # Trạm A thuộc owner_a
    st_a = Station(
        name="Trạm Sạc A",
        address="123 Hà Nội",
        operator_id=owner_a.id,
        is_active=True,
    )
    # Trạm B thuộc owner_b
    st_b = Station(
        name="Trạm Sạc B",
        address="456 Đà Nẵng",
        operator_id=owner_b.id,
        is_active=True,
    )
    db_session.add_all([st_a, st_b])
    db_session.commit()

    # Trạm A có 2 trụ: CP-A1 và CP-A2
    cp_a1 = ChargingPoint(
        station_id=st_a.id,
        code="CP-A1",
        is_active=True,
    )
    cp_a2 = ChargingPoint(
        station_id=st_a.id,
        code="CP-A2",
        is_active=True,
    )
    db_session.add_all([cp_a1, cp_a2])
    db_session.commit()

    # Mỗi trụ 1 đầu nối
    conn_a1 = Connector(charge_point_id=cp_a1.id, is_active=True, status="AVAILABLE")
    conn_a2 = Connector(charge_point_id=cp_a2.id, is_active=True, status="AVAILABLE")
    db_session.add_all([conn_a1, conn_a2])
    db_session.commit()

    # Tạo 2 phiên sạc đã COMPLETED cho CP-A1 và 1 phiên cho CP-A2 trong tháng hiện tại
    now = datetime.now(timezone.utc)
    sess1 = ChargingSession(
        connector_id=conn_a1.id,
        status="COMPLETED",
        start_time=now,
        stop_time=now,
        total_kwh=Decimal("15.500"),
        total_amount=Decimal("45000.00"),
        idle_amount=Decimal("5000.00"),
    )
    sess2 = ChargingSession(
        connector_id=conn_a1.id,
        status="COMPLETED",
        start_time=now,
        stop_time=now,
        total_kwh=Decimal("10.000"),
        total_amount=Decimal("30000.00"),
        idle_amount=Decimal("0.00"),
    )
    sess3 = ChargingSession(
        connector_id=conn_a2.id,
        status="COMPLETED",
        start_time=now,
        stop_time=now,
        total_kwh=Decimal("20.000"),
        total_amount=Decimal("60000.00"),
        idle_amount=Decimal("10000.00"),
    )
    # Phiên CHARGING (chưa chốt) -> không được tính
    sess_active = ChargingSession(
        connector_id=conn_a1.id,
        status="CHARGING",
        start_time=now,
        total_kwh=Decimal("5.000"),
        total_amount=Decimal("15000.00"),
    )
    db_session.add_all([sess1, sess2, sess3, sess_active])
    db_session.commit()

    token_a = create_access_token(data={"sub": str(owner_a.id)})
    token_b = create_access_token(data={"sub": str(owner_b.id)})
    token_admin = create_access_token(data={"sub": str(admin.id)})

    return {
        "st_a": st_a,
        "st_b": st_b,
        "token_a": token_a,
        "token_b": token_b,
        "token_admin": token_admin,
    }


def test_s52_happy_path_and_station_total_matches_sum_of_chargers(client: TestClient, s52_setup):
    """SCRUM-390: Báo cáo đúng từng trụ, tổng các trụ = tổng toàn trạm."""
    headers = {"Authorization": f"Bearer {s52_setup['token_a']}"}
    response = client.get(
        f"/api/v1/reports/stations/{s52_setup['st_a'].id}/revenue?period_type=month",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["station_name"] == "Trạm Sạc A"
    assert data["total_sessions"] == 3
    assert float(data["total_kwh"]) == 45.5
    assert float(data["total_amount"]) == 135000.0
    assert float(data["total_idle_amount"]) == 15000.0
    assert float(data["total_energy_amount"]) == 120000.0

    # Khẳng định: Tổng các dòng trụ = tổng của trạm
    sum_chargers_kwh = sum(float(c["total_kwh"]) for c in data["chargers"])
    sum_chargers_amount = sum(float(c["total_amount"]) for c in data["chargers"])
    assert sum_chargers_kwh == float(data["total_kwh"])
    assert sum_chargers_amount == float(data["total_amount"])


def test_s52_rbac_owner_a_cannot_view_station_b_returns_403(client: TestClient, s52_setup):
    """SCRUM-391: Chủ trạm A gọi báo cáo trạm B -> 403 Forbidden."""
    headers = {"Authorization": f"Bearer {s52_setup['token_a']}"}
    response = client.get(
        f"/api/v1/reports/stations/{s52_setup['st_b'].id}/revenue?period_type=month",
        headers=headers,
    )
    assert response.status_code == 403


def test_s52_admin_can_view_any_station(client: TestClient, s52_setup):
    """Admin có quyền xem bất kỳ trạm nào."""
    headers = {"Authorization": f"Bearer {s52_setup['token_admin']}"}
    res_a = client.get(
        f"/api/v1/reports/stations/{s52_setup['st_a'].id}/revenue?period_type=month",
        headers=headers,
    )
    assert res_a.status_code == 200
    res_b = client.get(
        f"/api/v1/reports/stations/{s52_setup['st_b'].id}/revenue?period_type=month",
        headers=headers,
    )
    assert res_b.status_code == 200
