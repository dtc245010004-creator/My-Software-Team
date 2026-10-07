import pytest

from app.core.security import create_access_token, get_password_hash
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User


@pytest.fixture
def grid_test_data(db_session):
    admin = User(
        username="grid_admin",
        email="grid_admin@test.com",
        password_hash=get_password_hash("Pass123!"),
        role="ADMIN",
        is_active=True,
    )
    op1 = User(
        username="grid_op1",
        email="grid_op1@test.com",
        password_hash=get_password_hash("Pass123!"),
        role="OPERATOR",
        is_active=True,
    )
    op2 = User(
        username="grid_op2",
        email="grid_op2@test.com",
        password_hash=get_password_hash("Pass123!"),
        role="OPERATOR",
        is_active=True,
    )
    db_session.add_all([admin, op1, op2])
    db_session.commit()

    st1 = Station(
        operator_id=op1.id,
        name="Trạm Lưới Hà Nội",
        address="100 Hoàng Hoa Thám",
        total_grid_capacity_kw=300.0,
        status="ACTIVE",
        is_active=True,
    )
    st2 = Station(
        operator_id=op2.id,
        name="Trạm Lưới Sài Gòn",
        address="200 Nguyễn Huệ",
        total_grid_capacity_kw=400.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add_all([st1, st2])
    db_session.commit()

    # Tạo 4 trụ cho st1 và 2 trụ cho st2
    for i in range(1, 5):
        cp = ChargingPoint(
            station_id=st1.id,
            code=f"GRID-HN-0{i}",
            vendor="VinFast",
            model="VF-Fast",
            max_power_kw=60.0,
            status="AVAILABLE" if i != 2 else "CHARGING",
            is_active=True,
        )
        db_session.add(cp)
        db_session.flush()
        conn = Connector(
            charging_point_id=cp.id,
            connector_number=1,
            connector_type="CCS2",
            max_power_kw=60.0,
            status=cp.status,
            is_active=True,
        )
        db_session.add(conn)

    for i in range(1, 3):
        cp = ChargingPoint(
            station_id=st2.id,
            code=f"GRID-SG-0{i}",
            vendor="ABB",
            model="Terra",
            max_power_kw=150.0,
            status="FAULTED" if i == 1 else "AVAILABLE",
            is_active=True,
        )
        db_session.add(cp)
        db_session.flush()
        conn = Connector(
            charging_point_id=cp.id,
            connector_number=1,
            connector_type="CCS2",
            max_power_kw=150.0,
            status=cp.status,
            is_active=True,
        )
        db_session.add(conn)

    db_session.commit()

    return {
        "admin": admin,
        "op1": op1,
        "op2": op2,
        "st1": st1,
        "st2": st2,
        "token_admin": create_access_token({"sub": str(admin.id), "role": admin.role}),
        "token_op1": create_access_token({"sub": str(op1.id), "role": op1.role}),
        "token_op2": create_access_token({"sub": str(op2.id), "role": op2.role}),
    }


def test_list_chargers_all_and_fields(client, grid_test_data):
    """Kiểm tra danh sách toàn bộ trụ sạc và các trường dữ liệu enrich."""
    res = client.get(
        "/api/v1/chargers",
        headers={"Authorization": f"Bearer {grid_test_data['token_admin']}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 6
    for item in data:
        assert "code" in item
        assert "station_name" in item
        assert item["station_name"] in ["Trạm Lưới Hà Nội", "Trạm Lưới Sài Gòn"]
        assert "connectors" in item
        assert len(item["connectors"]) >= 1
        assert "status" in item
        assert "current_power_kw" in item


def test_list_chargers_filters(client, grid_test_data):
    """Kiểm tra bộ lọc theo station_id, status, search."""
    st1_id = grid_test_data["st1"].id
    # Lọc theo station_id
    res = client.get(f"/api/v1/chargers?station_id={st1_id}")
    assert res.status_code == 200
    assert len(res.json()) == 4
    for c in res.json():
        assert c["station_id"] == st1_id

    # Lọc theo status=CHARGING
    res = client.get("/api/v1/chargers?status=CHARGING")
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["code"] == "GRID-HN-02"

    # Lọc theo search
    res = client.get("/api/v1/chargers?search=Terra")
    assert res.status_code == 200
    assert len(res.json()) == 2
    assert all("ABB" in c["vendor"] for c in res.json())


def test_list_chargers_operator_rbac(client, grid_test_data):
    """Kiểm tra phân quyền: Operator chỉ xem trụ sạc trạm của mình."""
    res = client.get(
        "/api/v1/chargers",
        headers={"Authorization": f"Bearer {grid_test_data['token_op1']}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 4
    assert all(c["station_name"] == "Trạm Lưới Hà Nội" for c in data)

    res2 = client.get(
        "/api/v1/chargers",
        headers={"Authorization": f"Bearer {grid_test_data['token_op2']}"},
    )
    assert res2.status_code == 200
    data2 = res2.json()
    assert len(data2) == 2
    assert all(c["station_name"] == "Trạm Lưới Sài Gòn" for c in data2)


def test_audit_logs_are_scoped_to_operator_stations(client, grid_test_data, db_session):
    from app.models.audit_log import AuditLog

    owned_point = (
        db_session.query(ChargingPoint)
        .filter(ChargingPoint.station_id == grid_test_data["st1"].id)
        .first()
    )
    foreign_point = (
        db_session.query(ChargingPoint)
        .filter(ChargingPoint.station_id == grid_test_data["st2"].id)
        .first()
    )
    db_session.add_all(
        [
            AuditLog(
                user_id=grid_test_data["op1"].id,
                action="Reset",
                object_type="charging_point",
                object_id=owned_point.code,
                data={"result": "Accepted"},
            ),
            AuditLog(
                user_id=grid_test_data["op2"].id,
                action="RemoteStartTransaction",
                object_type="connector",
                object_id=str(foreign_point.connectors[0].id),
                data={"result": "Accepted"},
            ),
        ]
    )
    db_session.commit()

    response = client.get(
        "/api/v1/audit-logs",
        headers={"Authorization": f"Bearer {grid_test_data['token_op1']}"},
    )
    assert response.status_code == 200
    assert [item["object_id"] for item in response.json()["items"]] == [
        owned_point.code
    ]

    filtered = client.get(
        f"/api/v1/audit-logs?charge_point_id={owned_point.id}",
        headers={"Authorization": f"Bearer {grid_test_data['token_op1']}"},
    )
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 1

    admin_response = client.get(
        "/api/v1/audit-logs",
        headers={"Authorization": f"Bearer {grid_test_data['token_admin']}"},
    )
    assert admin_response.status_code == 200
    assert admin_response.json()["total"] == 2


def test_operator_cannot_reset_another_operators_charger(client, grid_test_data):
    response = client.post(
        "/api/v1/chargers/GRID-SG-01/reset",
        headers={"Authorization": f"Bearer {grid_test_data['token_op1']}"},
        json={"type": "Soft"},
    )
    assert response.status_code == 403




def test_patch_charger_status_cascades_to_connectors(client, grid_test_data, db_session):
    admin_token = grid_test_data["token_admin"]
    charger = (
        db_session.query(ChargingPoint)
        .filter(
            ChargingPoint.station_id == grid_test_data["st1"].id,
            ChargingPoint.status == "AVAILABLE",
        )
        .first()
    )
    assert charger is not None

    response = client.patch(
        f"/api/v1/chargers/{charger.id}/status",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"status": "UNAVAILABLE"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "UNAVAILABLE"

    db_session.refresh(charger)
    assert charger.status == "UNAVAILABLE"
    for connector in charger.connectors:
        db_session.refresh(connector)
        assert connector.status == "UNAVAILABLE"

    response = client.patch(
        f"/api/v1/chargers/{charger.id}/status",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"status": "AVAILABLE"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "AVAILABLE"

    db_session.refresh(charger)
    assert charger.status == "AVAILABLE"
    for connector in charger.connectors:
        db_session.refresh(connector)
        assert connector.status == "AVAILABLE"
