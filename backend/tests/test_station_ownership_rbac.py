import pytest
from app.models.user import User
from app.models.station import Station, ChargingPoint, Connector
from app.models.tariff import Tariff
from app.models.session import ChargingSession
from app.core.security import create_access_token, get_password_hash


@pytest.fixture
def rbac_setup(db_session):
    """Thiết lập môi trường kiểm thử RBAC: Admin, Chủ trạm A, Chủ trạm B, Tài xế."""
    admin = User(
        username="admin_test",
        email="admin@evcsms.vn",
        password_hash=get_password_hash("AdminPass123"),
        role="ADMIN",
        is_active=True,
    )
    op_a = User(
        username="owner_a",
        email="owner_a@evcsms.vn",
        password_hash=get_password_hash("OpPass123"),
        role="OPERATOR",
        is_active=True,
    )
    op_b = User(
        username="owner_b",
        email="owner_b@evcsms.vn",
        password_hash=get_password_hash("OpPass123"),
        role="OPERATOR",
        is_active=True,
    )
    driver = User(
        username="driver_test",
        email="driver@evcsms.vn",
        password_hash=get_password_hash("DriverPass123"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([admin, op_a, op_b, driver])
    db_session.commit()

    # Trạm của Chủ A
    st_a1 = Station(
        operator_id=op_a.id,
        name="Trạm VinFast A1",
        address="123 Lê Duẩn, Đà Nẵng",
        latitude=16.0678,
        longitude=108.2208,
        total_grid_capacity_kw=200.0,
        status="ACTIVE",
        is_active=True,
    )
    st_a2 = Station(
        operator_id=op_a.id,
        name="Trạm VinFast A2",
        address="456 Nguyễn Văn Linh, Đà Nẵng",
        latitude=16.0612,
        longitude=108.2145,
        total_grid_capacity_kw=100.0,
        status="ACTIVE",
        is_active=True,
    )
    # Trạm của Chủ B
    st_b1 = Station(
        operator_id=op_b.id,
        name="Trạm Trung Tâm B1",
        address="789 Trần Phú, Đà Nẵng",
        latitude=16.0722,
        longitude=108.2255,
        total_grid_capacity_kw=150.0,
        status="ACTIVE",
        is_active=True,
    )
    # Trạm chưa có chủ (operator_id is None)
    st_unowned = Station(
        operator_id=None,
        name="Trạm Tự Do Chưa Gán Chủ",
        address="999 Hoàng Sa, Đà Nẵng",
        latitude=16.1000,
        longitude=108.2500,
        total_grid_capacity_kw=80.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add_all([st_a1, st_a2, st_b1, st_unowned])
    db_session.commit()

    # Trụ sạc và cổng sạc cho từng trạm
    ch_a1 = ChargingPoint(
        station_id=st_a1.id,
        code="EVSE-A1-01",
        vendor="ABB",
        model="Terra 54",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    ch_b1 = ChargingPoint(
        station_id=st_b1.id,
        code="EVSE-B1-01",
        vendor="Schneider",
        model="EVlink",
        max_power_kw=50.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add_all([ch_a1, ch_b1])
    db_session.commit()

    conn_a1 = Connector(
        charging_point_id=ch_a1.id,
        connector_number=1,
        connector_type="CCS2",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    conn_b1 = Connector(
        charging_point_id=ch_b1.id,
        connector_number=1,
        connector_type="CCS2",
        max_power_kw=50.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add_all([conn_a1, conn_b1])
    db_session.commit()

    # Biểu giá chung (toàn quốc)
    tariff_global = Tariff(
        station_id=None,
        name="Biểu giá Tiêu Chuẩn Quốc Gia",
        price_peak=4500.0,
        price_normal=3200.0,
        price_offpeak=2100.0,
        is_active=True,
    )
    # Biểu giá riêng trạm ST-A1
    tariff_a1 = Tariff(
        station_id=st_a1.id,
        name="Biểu giá Trạm A1",
        price_peak=5000.0,
        price_normal=3500.0,
        price_offpeak=2500.0,
        is_active=True,
    )
    db_session.add_all([tariff_global, tariff_a1])
    db_session.commit()

    return {
        "admin": admin,
        "op_a": op_a,
        "op_b": op_b,
        "driver": driver,
        "st_a1": st_a1,
        "st_a2": st_a2,
        "st_b1": st_b1,
        "st_unowned": st_unowned,
        "ch_a1": ch_a1,
        "ch_b1": ch_b1,
        "conn_a1": conn_a1,
        "conn_b1": conn_b1,
        "tariff_global": tariff_global,
        "tariff_a1": tariff_a1,
        "h_admin": {"Authorization": f"Bearer {create_access_token({'sub': str(admin.id), 'role': admin.role})}"},
        "h_op_a": {"Authorization": f"Bearer {create_access_token({'sub': str(op_a.id), 'role': op_a.role})}"},
        "h_op_b": {"Authorization": f"Bearer {create_access_token({'sub': str(op_b.id), 'role': op_b.role})}"},
        "h_driver": {"Authorization": f"Bearer {create_access_token({'sub': str(driver.id), 'role': driver.role})}"},
    }


def test_station_list_isolation(client, rbac_setup):
    """1. Kiểm tra cách ly danh sách trạm: Chủ trạm A chỉ thấy ST_A1, ST_A2; Chủ B chỉ thấy ST_B1; Admin thấy tất cả."""
    # Chủ trạm A
    res_a = client.get("/api/v1/stations", headers=rbac_setup["h_op_a"])
    assert res_a.status_code == 200
    st_ids_a = [s["id"] for s in res_a.json()]
    assert st_ids_a == [rbac_setup["st_a1"].id, rbac_setup["st_a2"].id]
    assert rbac_setup["st_b1"].id not in st_ids_a
    assert rbac_setup["st_unowned"].id not in st_ids_a

    # Chủ trạm B
    res_b = client.get("/api/v1/stations", headers=rbac_setup["h_op_b"])
    assert res_b.status_code == 200
    st_ids_b = [s["id"] for s in res_b.json()]
    assert st_ids_b == [rbac_setup["st_b1"].id]

    # Admin thấy toàn bộ 4 trạm
    res_admin = client.get("/api/v1/stations", headers=rbac_setup["h_admin"])
    assert res_admin.status_code == 200
    st_ids_admin = [s["id"] for s in res_admin.json()]
    assert len(st_ids_admin) == 4
    assert rbac_setup["st_unowned"].id in st_ids_admin

    # Tài xế / Khách thấy các trạm active công khai
    res_driver = client.get("/api/v1/stations", headers=rbac_setup["h_driver"])
    assert res_driver.status_code == 200
    assert len(res_driver.json()) == 4


def test_station_detail_cross_access_403(client, rbac_setup):
    """2. Chủ trạm không thể xem chi tiết trạm của chủ khác hoặc trạm unowned (403 Forbidden)."""
    # Chủ A xem trạm của Chủ A -> 200
    res_ok = client.get(f"/api/v1/stations/{rbac_setup['st_a1'].id}", headers=rbac_setup["h_op_a"])
    assert res_ok.status_code == 200
    assert res_ok.json()["name"] == "Trạm VinFast A1"

    # Chủ A xem trạm của Chủ B -> 403
    res_forbidden = client.get(f"/api/v1/stations/{rbac_setup['st_b1'].id}", headers=rbac_setup["h_op_a"])
    assert res_forbidden.status_code == 403
    assert "Bạn không có quyền truy cập" in res_forbidden.json()["detail"]

    # Chủ A xem trạm chưa có chủ -> 403
    res_unowned = client.get(f"/api/v1/stations/{rbac_setup['st_unowned'].id}", headers=rbac_setup["h_op_a"])
    assert res_unowned.status_code == 403

    # Admin xem trạm bất kỳ -> 200
    res_admin = client.get(f"/api/v1/stations/{rbac_setup['st_b1'].id}", headers=rbac_setup["h_admin"])
    assert res_admin.status_code == 200
    res_admin_unowned = client.get(f"/api/v1/stations/{rbac_setup['st_unowned'].id}", headers=rbac_setup["h_admin"])
    assert res_admin_unowned.status_code == 200


def test_station_create_auto_assignment(client, rbac_setup):
    """3. Chủ trạm tạo trạm sạc tự động gán operator_id = current_user.id; Admin có thể chỉ định hoặc để None."""
    # Chủ A tạo trạm (kể cả có truyền operator_id khác)
    payload_a = {
        "name": "Trạm Mới Của Chủ A",
        "address": "111 Hải Phòng, Đà Nẵng",
        "latitude": 16.07,
        "longitude": 108.22,
        "total_grid_capacity_kw": 120.0,
        "operating_hours": "24/7",
        "status": "ACTIVE",
        "operator_id": rbac_setup["op_b"].id,  # Cố tình truyền ID của Chủ B
    }
    res_a = client.post("/api/v1/stations", json=payload_a, headers=rbac_setup["h_op_a"])
    assert res_a.status_code == 201
    assert res_a.json()["operator_id"] == rbac_setup["op_a"].id  # Bị ép về Chủ A

    # Admin tạo trạm chỉ định cho Chủ B
    payload_admin_b = {
        "name": "Trạm Admin Gán Cho Chủ B",
        "address": "222 Điện Biên Phủ, Đà Nẵng",
        "total_grid_capacity_kw": 90.0,
        "operator_id": rbac_setup["op_b"].id,
    }
    res_admin_b = client.post("/api/v1/stations", json=payload_admin_b, headers=rbac_setup["h_admin"])
    assert res_admin_b.status_code == 201
    assert res_admin_b.json()["operator_id"] == rbac_setup["op_b"].id

    # Admin tạo trạm không gán chủ (operator_id is None)
    payload_admin_none = {
        "name": "Trạm Admin Chưa Gán Chủ",
        "address": "333 Trường Chinh, Đà Nẵng",
        "total_grid_capacity_kw": 70.0,
        "operator_id": None,
    }
    res_admin_none = client.post("/api/v1/stations", json=payload_admin_none, headers=rbac_setup["h_admin"])
    assert res_admin_none.status_code == 201
    assert res_admin_none.json()["operator_id"] is None


def test_station_update_restrictions(client, rbac_setup):
    """4. Chỉ Admin được phép thay đổi operator_id; Chủ trạm đổi operator_id bị 403."""
    # Chủ A cố tình đổi operator_id trạm của mình sang Chủ B -> 403
    payload_hack = {"operator_id": rbac_setup["op_b"].id}
    res_hack = client.put(f"/api/v1/stations/{rbac_setup['st_a1'].id}", json=payload_hack, headers=rbac_setup["h_op_a"])
    assert res_hack.status_code == 403
    assert "Chỉ Quản trị viên (Admin)" in res_hack.json()["detail"]

    # Chủ A sửa tên trạm mình -> 200
    payload_ok = {"name": "Trạm VinFast A1 Đã Đổi Tên"}
    res_ok = client.put(f"/api/v1/stations/{rbac_setup['st_a1'].id}", json=payload_ok, headers=rbac_setup["h_op_a"])
    assert res_ok.status_code == 200
    assert res_ok.json()["name"] == "Trạm VinFast A1 Đã Đổi Tên"

    # Chủ A sửa trạm của Chủ B -> 403
    res_cross = client.put(f"/api/v1/stations/{rbac_setup['st_b1'].id}", json=payload_ok, headers=rbac_setup["h_op_a"])
    assert res_cross.status_code == 403

    # Admin gán chủ cho trạm st_unowned -> 200
    payload_assign = {"operator_id": rbac_setup["op_a"].id}
    res_assign = client.put(f"/api/v1/stations/{rbac_setup['st_unowned'].id}", json=payload_assign, headers=rbac_setup["h_admin"])
    assert res_assign.status_code == 200
    assert res_assign.json()["operator_id"] == rbac_setup["op_a"].id


def test_charger_management_rbac(client, rbac_setup):
    """5. Phân quyền trụ sạc: Chủ A không thể thêm/xem trụ sạc tại trạm của Chủ B."""
    # Chủ A thêm trụ vào trạm của Chủ B -> 403
    payload_charger = {
        "code": "EVSE-HACK-01",
        "vendor": "ABB",
        "model": "Terra 54",
        "max_power_kw": 50.0,
    }
    res_add_hack = client.post(f"/api/v1/stations/{rbac_setup['st_b1'].id}/chargers", json=payload_charger, headers=rbac_setup["h_op_a"])
    assert res_add_hack.status_code == 403

    # Chủ A thêm trụ vào trạm của mình -> 201
    payload_charger_ok = {
        "code": "EVSE-A1-NEW",
        "vendor": "ABB",
        "model": "Terra 54",
        "max_power_kw": 60.0,
    }
    res_add_ok = client.post(f"/api/v1/stations/{rbac_setup['st_a1'].id}/chargers", json=payload_charger_ok, headers=rbac_setup["h_op_a"])
    assert res_add_ok.status_code == 201

    # Chủ A xem trụ sạc của Chủ B -> 403
    res_view_hack = client.get(f"/api/v1/chargers/{rbac_setup['ch_b1'].id}", headers=rbac_setup["h_op_a"])
    assert res_view_hack.status_code == 403

    # Chủ A xem trụ sạc của mình -> 200
    res_view_ok = client.get(f"/api/v1/chargers/{rbac_setup['ch_a1'].id}", headers=rbac_setup["h_op_a"])
    assert res_view_ok.status_code == 200


def test_tariffs_rbac_vulnerability_fix(client, rbac_setup):
    """6. Lỗ hổng Biểu giá điện đã vá: Chủ trạm không sửa được biểu giá chung hoặc biểu giá của trạm khác."""
    # Chủ A tạo biểu giá chung (station_id is None) -> 403
    payload_global = {
        "name": "Hack Biểu Giá Chung",
        "price_peak": 9999.0,
        "price_normal": 8888.0,
        "price_offpeak": 7777.0,
        "station_id": None,
    }
    res_global = client.post("/api/v1/tariffs", json=payload_global, headers=rbac_setup["h_op_a"])
    assert res_global.status_code == 403
    assert "Chỉ Quản trị viên" in res_global.json()["detail"]

    # Chủ A tạo biểu giá cho trạm của Chủ B -> 403
    payload_b = {
        "name": "Hack Biểu Giá Trạm B",
        "price_peak": 6000.0,
        "price_normal": 4000.0,
        "price_offpeak": 3000.0,
        "station_id": rbac_setup["st_b1"].id,
    }
    res_b = client.post("/api/v1/tariffs", json=payload_b, headers=rbac_setup["h_op_a"])
    assert res_b.status_code == 403

    # Chủ A sửa biểu giá chung -> 403
    payload_update = {"price_peak": 9999.0}
    res_up_global = client.put(f"/api/v1/tariffs/{rbac_setup['tariff_global'].id}", json=payload_update, headers=rbac_setup["h_op_a"])
    assert res_up_global.status_code == 403

    # Chủ A sửa biểu giá của mình -> 200
    res_up_a1 = client.put(f"/api/v1/tariffs/{rbac_setup['tariff_a1'].id}", json={"price_peak": 5500.0}, headers=rbac_setup["h_op_a"])
    assert res_up_a1.status_code == 200
    assert float(res_up_a1.json()["price_peak"]) == 5500.0


def test_metrics_live_safe_limit_and_scope(client, rbac_setup):
    """7. Live Metrics: Hạn mức an toàn 95% tính riêng cho trạm của chủ; truy cập trạm khác bị 403."""
    # Chủ A: sở hữu st_a1 (200kW) và st_a2 (100kW) -> Tổng grid: 300kW, Hạn mức an toàn 95%: 285kW
    res_a = client.get("/api/v1/stations/metrics/live", headers=rbac_setup["h_op_a"])
    assert res_a.status_code == 200
    data_a = res_a.json()
    assert data_a["total_stations"] == 2
    assert data_a["total_grid_capacity_kw"] == 300.0
    assert data_a["safe_limit_kw"] == 285.0
    assert len(data_a["stations_detail"]) == 2

    # Chủ A lọc theo trạm của mình (st_a1) -> grid: 200kW, safe_limit: 190kW
    res_a1 = client.get(f"/api/v1/stations/metrics/live?station_id={rbac_setup['st_a1'].id}", headers=rbac_setup["h_op_a"])
    assert res_a1.status_code == 200
    assert res_a1.json()["safe_limit_kw"] == 190.0

    # Chủ A lọc theo trạm của Chủ B -> 403 Forbidden
    res_a_b = client.get(f"/api/v1/stations/metrics/live?station_id={rbac_setup['st_b1'].id}", headers=rbac_setup["h_op_a"])
    assert res_a_b.status_code == 403
    assert "Bạn không có quyền truy cập số liệu" in res_a_b.json()["detail"]

    # Load profile cross access -> 403 Forbidden
    res_lp = client.get(f"/api/v1/stations/metrics/load-profile?station_id={rbac_setup['st_b1'].id}", headers=rbac_setup["h_op_a"])
    assert res_lp.status_code == 403

    # Load profile timeline cross access -> 403 Forbidden
    res_lpt = client.get(f"/api/v1/stations/metrics/load-profile-timeline?station_id={rbac_setup['st_b1'].id}", headers=rbac_setup["h_op_a"])
    assert res_lpt.status_code == 403


def test_sessions_list_and_detail_isolation(client, db_session, rbac_setup):
    """8. Nhật ký phiên sạc: Chủ A chỉ thấy phiên tại trạm của mình; không thấy và không xem được chi tiết phiên trạm B."""
    # Tạo phiên sạc tại trạm A1 (cổng conn_a1)
    sess_a = ChargingSession(
        user_id=rbac_setup["driver"].id,
        connector_id=rbac_setup["conn_a1"].id,
        tariff_id=rbac_setup["tariff_a1"].id,
        current_soc=80.0,
        applied_price_per_kwh=3500.0,
        total_kwh=30.0,
        total_amount=105000.0,
        status="COMPLETED",
    )
    # Tạo phiên sạc tại trạm B1 (cổng conn_b1)
    sess_b = ChargingSession(
        user_id=rbac_setup["driver"].id,
        connector_id=rbac_setup["conn_b1"].id,
        tariff_id=rbac_setup["tariff_global"].id,
        current_soc=90.0,
        applied_price_per_kwh=4000.0,
        total_kwh=40.0,
        total_amount=160000.0,
        status="COMPLETED",
    )
    db_session.add_all([sess_a, sess_b])
    db_session.commit()

    # Chủ A gọi GET /api/v1/sessions -> chỉ thấy sess_a
    res_sess_a = client.get("/api/v1/sessions", headers=rbac_setup["h_op_a"])
    assert res_sess_a.status_code == 200
    ids_a = [s["id"] for s in res_sess_a.json()]
    assert sess_a.id in ids_a
    assert sess_b.id not in ids_a

    # Chủ A cố lọc trạm của Chủ B -> 403
    res_sess_cross = client.get(f"/api/v1/sessions?station_id={rbac_setup['st_b1'].id}", headers=rbac_setup["h_op_a"])
    assert res_sess_cross.status_code == 403

    # Chủ A xem chi tiết sess_a -> 200
    res_det_a = client.get(f"/api/v1/sessions/{sess_a.id}", headers=rbac_setup["h_op_a"])
    assert res_det_a.status_code == 200

    # Chủ A xem chi tiết sess_b -> 403
    res_det_b = client.get(f"/api/v1/sessions/{sess_b.id}", headers=rbac_setup["h_op_a"])
    assert res_det_b.status_code == 403
    assert "Bạn không có quyền xem thông tin" in res_det_b.json()["detail"]

    # Admin xem cả hai phiên
    res_admin_sess = client.get("/api/v1/sessions", headers=rbac_setup["h_admin"])
    assert res_admin_sess.status_code == 200
    admin_ids = [s["id"] for s in res_admin_sess.json()]
    assert sess_a.id in admin_ids
    assert sess_b.id in admin_ids
