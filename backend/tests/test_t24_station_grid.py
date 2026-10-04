import time

import pytest

from app.core.security import create_access_token
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User


@pytest.fixture
def t24_seed_data(db_session):
    """Seed dữ liệu cho Task T-24: 50 trụ + 200 đầu nối phân bổ đa trạng thái."""
    # 1. Tạo 3 người dùng: Admin, Operator A, Operator B
    admin = User(
        username="admin_grid",
        email="admin_grid@evcsms.vn",
        password_hash="hash",
        role="ADMIN",
        is_active=True,
    )
    op_a = User(
        username="op_a_grid",
        email="opa_grid@evcsms.vn",
        password_hash="hash",
        role="OPERATOR",
        is_active=True,
    )
    op_b = User(
        username="op_b_grid",
        email="opb_grid@evcsms.vn",
        password_hash="hash",
        role="OPERATOR",
        is_active=True,
    )
    db_session.add_all([admin, op_a, op_b])
    db_session.commit()

    # 2. Tạo 3 trạm cho Operator A
    stations_a = []
    for i in range(3):
        st = Station(
            operator_id=op_a.id,
            name=f"Trạm Grid A{i + 1}",
            address=f"Địa chỉ Grid A{i + 1}, Hà Nội",
            latitude=21.02 + i * 0.01,
            longitude=105.83 + i * 0.01,
            total_grid_capacity_kw=120.0 + i * 10,
            status="ACTIVE",
            is_active=True,
        )
        db_session.add(st)
        stations_a.append(st)
    db_session.commit()

    # 3. Tạo 2 trạm cho Operator B
    stations_b = []
    for i in range(2):
        st = Station(
            operator_id=op_b.id,
            name=f"Trạm Grid B{i + 1}",
            address=f"Địa chỉ Grid B{i + 1}, TP.HCM",
            latitude=10.78 + i * 0.01,
            longitude=106.69 + i * 0.01,
            total_grid_capacity_kw=90.0 + i * 5,
            status="ACTIVE",
            is_active=True,
        )
        db_session.add(st)
        stations_b.append(st)
    db_session.commit()

    # 4. Tạo 50 trụ cho 3 trạm của Operator A (20, 15, 15)
    chargers_a = []
    counts_a = [20, 15, 15]
    charger_idx = 1
    for st_idx, count in enumerate(counts_a):
        st = stations_a[st_idx]
        for _ in range(count):
            cp = ChargingPoint(
                station_id=st.id,
                code=f"GRID-A{st_idx + 1}-{charger_idx:03d}",
                vendor="ABB",
                model="Terra 54",
                status="AVAILABLE",
                max_power_kw=60.0,
                power_sharing_enabled=True,
                is_active=True,
            )
            chargers_a.append(cp)
            charger_idx += 1

    # Tạo 4 trụ cho 2 trạm của Operator B (mỗi trạm 2 trụ)
    chargers_b = []
    for st_idx, st in enumerate(stations_b):
        for c_idx in range(2):
            cp = ChargingPoint(
                station_id=st.id,
                code=f"GRID-B{st_idx + 1}-{c_idx + 1:03d}",
                vendor="Schneider",
                model="EVlink",
                status="AVAILABLE",
                max_power_kw=50.0,
                power_sharing_enabled=True,
                is_active=True,
            )
            chargers_b.append(cp)

    db_session.add_all(chargers_a + chargers_b)
    db_session.commit()

    # 5. Tạo 200 đầu nối cho 50 trụ của Operator A:
    # Mỗi trụ có 4 cổng với 4 trạng thái phân bổ đều:
    # Cổng 1: AVAILABLE, Cổng 2: CHARGING, Cổng 3: FAULTED, Cổng 4: UNAVAILABLE
    connectors = []
    statuses_a = ["AVAILABLE", "CHARGING", "FAULTED", "UNAVAILABLE"]
    for cp in chargers_a:
        for k, st_name in enumerate(statuses_a):
            conn = Connector(
                charge_point_id=cp.id,
                connector_number=k + 1,
                connector_type="CCS2",
                status=st_name,
                max_power_kw=30.0,
                is_active=True,
            )
            connectors.append(conn)

    # Tạo 8 đầu nối cho 4 trụ của Operator B (mỗi trụ 2 cổng: 1 AVAILABLE, 1 CHARGING)
    for cp in chargers_b:
        for k, st_name in enumerate(["AVAILABLE", "CHARGING"]):
            conn = Connector(
                charge_point_id=cp.id,
                connector_number=k + 1,
                connector_type="Type 2",
                status=st_name,
                max_power_kw=22.0,
                is_active=True,
            )
            connectors.append(conn)

    db_session.add_all(connectors)
    db_session.commit()

    h_admin = {
        "Authorization": f"Bearer {create_access_token({'sub': str(admin.id), 'role': admin.role})}"
    }
    h_op_a = {
        "Authorization": f"Bearer {create_access_token({'sub': str(op_a.id), 'role': op_a.role})}"
    }
    h_op_b = {
        "Authorization": f"Bearer {create_access_token({'sub': str(op_b.id), 'role': op_b.role})}"
    }

    return {
        "admin": admin,
        "op_a": op_a,
        "op_b": op_b,
        "stations_a": stations_a,
        "stations_b": stations_b,
        "h_admin": h_admin,
        "h_op_a": h_op_a,
        "h_op_b": h_op_b,
    }


def test_t24_grid_structure(client, db_session, t24_seed_data):
    """Test 1: Kiểm tra tính toàn vẹn DTO Grid View và số liệu thống kê trạng thái đầu nối."""
    res = client.get(
        "/api/v1/stations/grid",
        headers=t24_seed_data["h_admin"],
    )
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 5, "Admin phải thấy đủ ít nhất 5 trạm"

    for station in data:
        # Kiểm tra các trường cấp Trạm (Station Card)
        assert "id" in station
        assert "name" in station
        assert "address" in station
        assert "total_grid_capacity_kw" in station
        assert "status" in station
        assert "is_active" in station
        assert "total_chargers" in station
        assert "available_connectors" in station
        assert "charging_connectors" in station
        assert "faulted_connectors" in station
        assert "unavailable_connectors" in station
        assert "total_connectors" in station
        assert "connector_counts" in station
        assert "chargers" in station

        # Kiểm tra tính toàn vẹn số học cấp trạm
        st_sum = (
            station["available_connectors"]
            + station["charging_connectors"]
            + station["faulted_connectors"]
            + station["unavailable_connectors"]
        )
        assert st_sum == station["total_connectors"]
        assert station["total_chargers"] == len(station["chargers"])

        # Kiểm tra nested connector_counts
        counts = station["connector_counts"]
        assert counts["available"] == station["available_connectors"]
        assert counts["charging"] == station["charging_connectors"]
        assert counts["faulted"] == station["faulted_connectors"]
        assert counts["unavailable"] == station["unavailable_connectors"]
        assert counts["total"] == station["total_connectors"]

        # Kiểm tra các trường cấp Trụ (Charger Card)
        for charger in station["chargers"]:
            assert "id" in charger
            assert "station_id" in charger
            assert "code" in charger
            assert "vendor" in charger
            assert "status" in charger
            assert "max_power_kw" in charger
            assert "power_sharing_enabled" in charger
            assert "is_active" in charger
            assert "available_connectors" in charger
            assert "charging_connectors" in charger
            assert "faulted_connectors" in charger
            assert "unavailable_connectors" in charger
            assert "total_connectors" in charger
            assert "connector_counts" in charger

            cp_sum = (
                charger["available_connectors"]
                + charger["charging_connectors"]
                + charger["faulted_connectors"]
                + charger["unavailable_connectors"]
            )
            assert cp_sum == charger["total_connectors"]


def test_t24_grid_rbac_filtering(client, db_session, t24_seed_data):
    """Test 2: Kiểm tra cách ly quyền sở hữu (RBAC / Multi-tenancy)."""
    # 1. Admin thấy toàn bộ mạng lưới (cả trạm của A và B)
    res_admin = client.get(
        "/api/v1/stations/grid",
        headers=t24_seed_data["h_admin"],
    )
    assert res_admin.status_code == 200
    admin_data = res_admin.json()
    assert len(admin_data) >= 5

    # 2. Operator A chỉ thấy 3 trạm của chính mình
    res_op_a = client.get(
        "/api/v1/stations/grid",
        headers=t24_seed_data["h_op_a"],
    )
    assert res_op_a.status_code == 200
    op_a_data = res_op_a.json()
    assert len(op_a_data) == 3
    op_a_ids = [s["id"] for s in op_a_data]
    expected_a_ids = [s.id for s in t24_seed_data["stations_a"]]
    for st_id in op_a_ids:
        assert st_id in expected_a_ids

    # Đảm bảo không chứa trạm của Operator B
    b_ids = [s.id for s in t24_seed_data["stations_b"]]
    for st_id in op_a_ids:
        assert st_id not in b_ids

    # 3. Operator B chỉ thấy 2 trạm của chính mình
    res_op_b = client.get(
        "/api/v1/stations/grid",
        headers=t24_seed_data["h_op_b"],
    )
    assert res_op_b.status_code == 200
    op_b_data = res_op_b.json()
    assert len(op_b_data) == 2
    op_b_ids = [s["id"] for s in op_b_data]
    expected_b_ids = [s.id for s in t24_seed_data["stations_b"]]
    for st_id in op_b_ids:
        assert st_id in expected_b_ids


def test_t24_grid_performance(client, db_session, t24_seed_data):
    """Test 3: Benchmark hiệu năng - 50 trụ + 200 đầu nối phản hồi < 200ms."""
    start_time = time.perf_counter()
    res = client.get(
        "/api/v1/stations/grid",
        headers=t24_seed_data["h_op_a"],
    )
    elapsed = time.perf_counter() - start_time
    assert res.status_code == 200
    assert elapsed < 0.2, f"Thời gian truy vấn {elapsed * 1000:.1f}ms vượt ngưỡng 200ms"

    data = res.json()
    assert len(data) == 3

    # Kiểm tra số liệu thực tế tổng hợp chính xác trên 50 trụ và 200 đầu nối
    total_chargers = sum(s["total_chargers"] for s in data)
    total_connectors = sum(s["total_connectors"] for s in data)
    total_avail = sum(s["available_connectors"] for s in data)
    total_charg = sum(s["charging_connectors"] for s in data)
    total_fault = sum(s["faulted_connectors"] for s in data)
    total_unavail = sum(s["unavailable_connectors"] for s in data)

    assert total_chargers == 50, "Operator A phải có đúng 50 trụ sạc"
    assert total_connectors == 200, "Operator A phải có đúng 200 đầu nối"
    assert total_avail == 50, "Số lượng đầu nối Available phải đúng 50"
    assert total_charg == 50, "Số lượng đầu nối Charging phải đúng 50"
    assert total_fault == 50, "Số lượng đầu nối Faulted phải đúng 50"
    assert total_unavail == 50, "Số lượng đầu nối Unavailable phải đúng 50"
