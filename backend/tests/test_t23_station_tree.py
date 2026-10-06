import time

import pytest

from app.core.security import create_access_token
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User


@pytest.fixture
def t23_seed_data(db_session):
    """Seed dữ liệu 50 trụ và 200 đầu nối cho benchmark performance test."""
    # Tạo 3 user: Admin, Operator A, Operator B
    admin = User(
        username="admin_tree",
        email="admin_tree@evcsms.vn",
        password_hash="hash",
        role="ADMIN",
        is_active=True,
    )
    op_a = User(
        username="op_a_tree",
        email="opa_tree@evcsms.vn",
        password_hash="hash",
        role="OPERATOR",
        is_active=True,
    )
    op_b = User(
        username="op_b_tree",
        email="opb_tree@evcsms.vn",
        password_hash="hash",
        role="OPERATOR",
        is_active=True,
    )
    db_session.add_all([admin, op_a, op_b])
    db_session.commit()

    # Tạo 3 trạm cho op_a
    stations_a = []
    for i in range(3):
        st = Station(
            operator_id=op_a.id,
            name=f"Trạm A{i + 1}",
            address=f"Địa chỉ A{i + 1}, Hà Nội",
            latitude=21.0 + i * 0.01,
            longitude=105.8 + i * 0.01,
            total_grid_capacity_kw=100.0 + i * 10,
            status="ACTIVE",
            is_active=True,
        )
        db_session.add(st)
        stations_a.append(st)
    db_session.commit()

    # Tạo 2 trạm cho op_b
    stations_b = []
    for i in range(2):
        st = Station(
            operator_id=op_b.id,
            name=f"Trạm B{i + 1}",
            address=f"Địa chỉ B{i + 1}, TP.HCM",
            latitude=10.7 + i * 0.01,
            longitude=106.7 + i * 0.01,
            total_grid_capacity_kw=80.0 + i * 5,
            status="ACTIVE",
            is_active=True,
        )
        db_session.add(st)
        stations_b.append(st)
    db_session.commit()

    # Tạo 50 trụ và 200 đầu nối cho 3 trạm của op_a (20, 15, 15)
    chargers = []
    charger_counts = [20, 15, 15]
    charger_idx = 1
    for st_idx, count in enumerate(charger_counts):
        st = stations_a[st_idx]
        for _ in range(count):
            cp = ChargingPoint(
                station_id=st.id,
                code=f"CP-A{st_idx + 1}-{charger_idx:03d}",
                vendor="ABB",
                model="Terra 54",
                status="AVAILABLE",
                max_power_kw=60.0,
                power_sharing_enabled=True,
                is_active=True,
            )
            chargers.append(cp)
            charger_idx += 1

    # Tạo thêm trụ cho 2 trạm của op_b (mỗi trạm 2 trụ)
    for st_idx, st in enumerate(stations_b):
        for c_idx in range(2):
            cp = ChargingPoint(
                station_id=st.id,
                code=f"CP-B{st_idx + 1}-{c_idx + 1:03d}",
                vendor="Schneider",
                model="EVlink",
                status="AVAILABLE",
                max_power_kw=50.0,
                power_sharing_enabled=True,
                is_active=True,
            )
            chargers.append(cp)

    db_session.add_all(chargers)
    db_session.commit()

    # Tạo connectors: mỗi trụ thuộc stations_a có 4 connectors (50 * 4 = 200 connectors)
    # Các trụ thuộc stations_b có 2 connectors (4 * 2 = 8 connectors)
    connectors = []
    for cp in chargers:
        num_conn = 4 if "CP-A" in (cp.code or "") else 2
        for k in range(num_conn):
            conn = Connector(
                charge_point_id=cp.id,
                connector_number=k + 1,
                connector_type="CCS2",
                status="AVAILABLE",
                max_power_kw=30.0,
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


def test_t23_tree_structure_3_tiers(client, db_session, t23_seed_data):
    """Test 1: Trả về đủ 3 tầng trạm -> trụ -> đầu nối."""
    res = client.get(
        "/api/v1/stations/tree",
        headers=t23_seed_data["h_admin"],
    )
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 3, "Dữ liệu trả về phải có ít nhất 3 trạm sạc"

    # Kiểm tra phần tử đầu tiên trước khi duyệt
    assert "chargers" in data[0]

    for station_item in data[:3]:
        assert "id" in station_item
        assert "name" in station_item
        assert "address" in station_item
        assert "total_grid_capacity_kw" in station_item
        assert "is_active" in station_item
        assert "chargers" in station_item

        chargers = station_item.get("chargers", [])
        assert isinstance(chargers, list)
        assert len(chargers) > 0, "Trạm phải chứa ít nhất 1 trụ sạc"

        for charger_item in chargers[:2]:
            assert "id" in charger_item
            assert "code" in charger_item
            assert "vendor" in charger_item
            assert "status" in charger_item
            assert "max_power_kw" in charger_item
            assert "power_sharing_enabled" in charger_item
            assert "is_active" in charger_item
            assert "connectors" in charger_item

            connectors = charger_item.get("connectors", [])
            assert isinstance(connectors, list)
            assert len(connectors) > 0, "Trụ sạc phải chứa ít nhất 1 đầu nối"

            for connector_item in connectors[:2]:
                assert "id" in connector_item
                assert "connector_number" in connector_item
                assert "connector_type" in connector_item
                assert "status" in connector_item
                assert "max_power_kw" in connector_item
                assert "is_active" in connector_item


def test_t23_tree_rbac_filtering(client, db_session, t23_seed_data):
    """Test 2: Cách ly quyền sở hữu - op_a chỉ thấy trạm của op_a, admin thấy hết."""
    res_admin = client.get(
        "/api/v1/stations/tree",
        headers=t23_seed_data["h_admin"],
    )
    assert res_admin.status_code == 200
    admin_data = res_admin.json()
    assert isinstance(admin_data, list)
    assert len(admin_data) >= 5, "Admin phải thấy ít nhất 5 trạm sạc"

    res_op_a = client.get(
        "/api/v1/stations/tree",
        headers=t23_seed_data["h_op_a"],
    )
    assert res_op_a.status_code == 200
    op_a_data = res_op_a.json()
    assert isinstance(op_a_data, list)
    assert len(op_a_data) == 3, "Operator A phải thấy chính xác 3 trạm sạc"
    op_a_station_ids = [s["id"] for s in op_a_data]
    for st_id in op_a_station_ids:
        assert st_id in [t.id for t in t23_seed_data["stations_a"]]

    res_op_b = client.get(
        "/api/v1/stations/tree",
        headers=t23_seed_data["h_op_b"],
    )
    assert res_op_b.status_code == 200
    op_b_data = res_op_b.json()
    assert isinstance(op_b_data, list)
    assert len(op_b_data) == 2, "Operator B phải thấy chính xác 2 trạm sạc"
    op_b_station_ids = [s["id"] for s in op_b_data]
    for st_id in op_b_station_ids:
        assert st_id in [t.id for t in t23_seed_data["stations_b"]]


def test_t23_tree_performance(client, db_session, t23_seed_data):
    """Test 3: Performance Benchmark - 50 trụ + 200 đầu nối, thời gian < 200ms."""
    start_time = time.perf_counter()
    res = client.get(
        "/api/v1/stations/tree",
        headers=t23_seed_data["h_op_a"],
    )
    elapsed = time.perf_counter() - start_time
    assert res.status_code == 200
    assert elapsed < 0.2, (
        f"Thời gian truy vấn {elapsed * 1000:.1f}ms vượt quá ngưỡng 200ms"
    )
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == 3, "Dữ liệu trả về cho Operator A phải có đúng 3 trạm"

    for station in data:
        assert "chargers" in station
        assert isinstance(station["chargers"], list)
        for charger in station["chargers"]:
            assert "connectors" in charger
            assert isinstance(charger["connectors"], list)
            for connector in charger["connectors"]:
                assert connector["is_active"] is True
