import pytest
from app.models.user import User
from app.models.station import Station, ChargingPoint, Connector
from app.core.security import create_access_token, get_password_hash


@pytest.fixture
def test_users(db_session):
    """Fixture tạo các user mẫu: Admin, Operator A, Operator B, Customer."""
    admin = User(
        username="admin_user",
        email="admin@test.com",
        password_hash=get_password_hash("AdminPass123"),
        role="ADMIN",
        is_active=True,
    )
    op_a = User(
        username="operator_a",
        email="opa@test.com",
        password_hash=get_password_hash("OpPass123"),
        role="OPERATOR",
        is_active=True,
    )
    op_b = User(
        username="operator_b",
        email="opb@test.com",
        password_hash=get_password_hash("OpPass123"),
        role="OPERATOR",
        is_active=True,
    )
    customer = User(
        username="customer_user",
        email="cus@test.com",
        password_hash=get_password_hash("CusPass123"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([admin, op_a, op_b, customer])
    db_session.commit()

    return {
        "admin": admin,
        "op_a": op_a,
        "op_b": op_b,
        "customer": customer,
        "token_admin": create_access_token({"sub": str(admin.id), "role": admin.role}),
        "token_op_a": create_access_token({"sub": str(op_a.id), "role": op_a.role}),
        "token_op_b": create_access_token({"sub": str(op_b.id), "role": op_b.role}),
        "token_customer": create_access_token({"sub": str(customer.id), "role": customer.role}),
    }


def test_public_list_stations_and_pagination(client, db_session, test_users):
    """1. Khách vãng lai xem danh sách trạm công khai có phân trang (skip, limit)."""
    op = test_users["op_a"]
    for i in range(5):
        st = Station(
            operator_id=op.id,
            name=f"Trạm Sạc Số {i+1}",
            address=f"Số {i+1} Đường ABC",
            latitude=21.0 + i * 0.01,
            longitude=105.8 + i * 0.01,
            total_grid_capacity_kw=100.0,
            status="ACTIVE",
            is_active=True,
        )
        db_session.add(st)
    db_session.commit()

    # Query limit 2
    res = client.get("/api/v1/stations?skip=0&limit=2")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2

    # Query skip 2 limit 2
    res_page2 = client.get("/api/v1/stations?skip=2&limit=2")
    assert res_page2.status_code == 200
    data_page2 = res_page2.json()
    assert len(data_page2) == 2
    assert data_page2[0]["id"] != data[0]["id"]


def test_haversine_distance_search(client, db_session, test_users):
    """2. Tìm kiếm trạm gần nhất theo khoảng cách Haversine và bán kính radius_km."""
    op = test_users["op_a"]
    # Trạm 1: Hà Nội Hoàn Kiếm (21.0285, 105.8542)
    st_hanoi = Station(
        operator_id=op.id,
        name="Trạm Hà Nội Hoàn Kiếm",
        address="Hoàn Kiếm, Hà Nội",
        latitude=21.0285,
        longitude=105.8542,
        total_grid_capacity_kw=150.0,
        status="ACTIVE",
        is_active=True,
    )
    # Trạm 2: TP. Hồ Chí Minh Quận 1 (10.7769, 106.7009)
    st_hcm = Station(
        operator_id=op.id,
        name="Trạm TP.HCM Quận 1",
        address="Quận 1, TP.HCM",
        latitude=10.7769,
        longitude=106.7009,
        total_grid_capacity_kw=150.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add_all([st_hanoi, st_hcm])
    db_session.commit()

    # Người dùng ở Cầu Giấy Hà Nội (21.0362, 105.7905), tìm bán kính 20km
    res = client.get("/api/v1/stations?user_lat=21.0362&user_lon=105.7905&radius_km=20")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["name"] == "Trạm Hà Nội Hoàn Kiếm"
    assert data[0]["distance_km"] is not None
    assert data[0]["distance_km"] < 10.0


def test_customer_forbidden_from_creating_station(client, test_users):
    """3. Tài xế (CUSTOMER) bị chặn HTTP 403 khi cố tạo trạm."""
    payload = {
        "name": "Trạm Hack",
        "address": "Địa chỉ ảo",
        "latitude": 21.0,
        "longitude": 105.8,
        "total_grid_capacity_kw": 100.0,
    }
    res = client.post(
        "/api/v1/stations",
        json=payload,
        headers={"Authorization": f"Bearer {test_users['token_customer']}"},
    )
    assert res.status_code == 403


def test_operator_create_station_sets_operator_id(client, test_users):
    """4. Operator tạo trạm thành công -> tự động gắn operator_id."""
    payload = {
        "name": "Trạm Sạc Xanh Eco",
        "address": "123 Đường Láng, Hà Nội",
        "latitude": 21.0123,
        "longitude": 105.8123,
        "total_grid_capacity_kw": 200.0,
        "status": "ACTIVE",
    }
    res = client.post(
        "/api/v1/stations",
        json=payload,
        headers={"Authorization": f"Bearer {test_users['token_op_a']}"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Trạm Sạc Xanh Eco"
    assert data["operator_id"] == test_users["op_a"].id
    assert data["is_active"] is True
    assert data["status"] == "ACTIVE"


def test_idor_station_level_forbidden(client, db_session, test_users):
    """5. Chống IDOR cấp Station: Operator B cố sửa hoặc xóa trạm của Operator A -> HTTP 403."""
    st = Station(
        operator_id=test_users["op_a"].id,
        name="Trạm của Operator A",
        address="100 Phố Huế",
        latitude=21.01,
        longitude=105.85,
        total_grid_capacity_kw=100.0,
    )
    db_session.add(st)
    db_session.commit()

    # Operator B cố sửa trạm của Operator A
    res_update = client.put(
        f"/api/v1/stations/{st.id}",
        json={"name": "Hacked Name"},
        headers={"Authorization": f"Bearer {test_users['token_op_b']}"},
    )
    assert res_update.status_code == 403

    # Operator B cố xóa trạm của Operator A
    res_delete = client.delete(
        f"/api/v1/stations/{st.id}",
        headers={"Authorization": f"Bearer {test_users['token_op_b']}"},
    )
    assert res_delete.status_code == 403


def test_admin_full_access_to_any_station(client, db_session, test_users):
    """6. Admin có toàn quyền sửa và xóa trạm của bất kỳ ai."""
    st = Station(
        operator_id=test_users["op_a"].id,
        name="Trạm Operator A",
        address="100 Phố Huế",
        latitude=21.01,
        longitude=105.85,
        total_grid_capacity_kw=100.0,
    )
    db_session.add(st)
    db_session.commit()

    res_admin = client.put(
        f"/api/v1/stations/{st.id}",
        json={"name": "Admin Updated Name"},
        headers={"Authorization": f"Bearer {test_users['token_admin']}"},
    )
    assert res_admin.status_code == 200
    assert res_admin.json()["name"] == "Admin Updated Name"


def test_add_charger_and_connectors_to_station(client, db_session, test_users):
    """7. Thêm Trụ sạc và Cổng sạc vào trạm thành công."""
    st = Station(
        operator_id=test_users["op_a"].id,
        name="Trạm Sạc Mỹ Đình",
        address="Mỹ Đình, Hà Nội",
        latitude=21.02,
        longitude=105.77,
        total_grid_capacity_kw=120.0,
    )
    db_session.add(st)
    db_session.commit()

    charger_payload = {
        "code": "MD-CP01",
        "vendor": "ABB",
        "model": "Terra 54",
        "max_power_kw": 60.0,
        "power_sharing_enabled": True,
        "connectors": [
            {"connector_number": 1, "connector_type": "CCS2", "max_power_kw": 60.0},
            {"connector_number": 2, "connector_type": "TYPE_2", "max_power_kw": 22.0},
        ],
    }
    res = client.post(
        f"/api/v1/stations/{st.id}/chargers",
        json=charger_payload,
        headers={"Authorization": f"Bearer {test_users['token_op_a']}"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["code"] == "MD-CP01"
    assert len(data["connectors"]) == 2
    assert data["total_connector_power_kw"] == 82.0
    assert data["is_power_sharing"] is True  # 82kW > 60kW và bật power_sharing


def test_oversubscription_calculation(client, db_session, test_users):
    """8. Tính toán chỉ số Oversubscription tại cấp Trạm: Tổng công suất trụ > nguồn trạm."""
    st = Station(
        operator_id=test_users["op_a"].id,
        name="Trạm Giới Hạn 100kW",
        address="Cầu Giấy",
        latitude=21.03,
        longitude=105.79,
        total_grid_capacity_kw=100.0,
    )
    db_session.add(st)
    db_session.commit()

    # Thêm 2 trụ 60kW -> Tổng 120kW
    cp1 = ChargingPoint(station_id=st.id, code="CG-CP01", max_power_kw=60.0, vendor="ABB")
    cp2 = ChargingPoint(station_id=st.id, code="CG-CP02", max_power_kw=60.0, vendor="ABB")
    db_session.add_all([cp1, cp2])
    db_session.commit()

    res = client.get(f"/api/v1/stations/{st.id}")
    assert res.status_code == 200
    data = res.json()
    assert data["total_installed_power_kw"] == 120.0
    assert data["oversubscription_ratio"] == 1.2
    assert data["is_oversubscribed"] is True


def test_unique_constraint_charger_code_and_connector_number(client, db_session, test_users):
    """9. Ràng buộc duy nhất: Trùng mã code trụ sạc hoặc trùng số súng -> HTTP 400."""
    st = Station(
        operator_id=test_users["op_a"].id,
        name="Trạm Test Ràng Buộc",
        address="Hà Nội",
        latitude=21.0,
        longitude=105.8,
        total_grid_capacity_kw=100.0,
    )
    db_session.add(st)
    db_session.commit()

    # Thêm trụ đầu tiên
    client.post(
        f"/api/v1/stations/{st.id}/chargers",
        json={"code": "UNIQUE-01", "max_power_kw": 50.0},
        headers={"Authorization": f"Bearer {test_users['token_op_a']}"},
    )

    # Cố tình thêm trụ thứ 2 cùng mã code UNIQUE-01 -> 400
    res_dup = client.post(
        f"/api/v1/stations/{st.id}/chargers",
        json={"code": "UNIQUE-01", "max_power_kw": 50.0},
        headers={"Authorization": f"Bearer {test_users['token_op_a']}"},
    )
    assert res_dup.status_code == 400
    assert "đã tồn tại" in res_dup.json()["detail"]


def test_idor_charger_level_create_update_delete(client, db_session, test_users):
    """10. Chống IDOR cấp Charger: Operator B không thể thêm/sửa/xóa trụ của Operator A."""
    st = Station(
        operator_id=test_users["op_a"].id,
        name="Trạm của A",
        address="Hà Nội",
        latitude=21.0,
        longitude=105.8,
        total_grid_capacity_kw=100.0,
    )
    db_session.add(st)
    db_session.commit()

    cp = ChargingPoint(station_id=st.id, code="OPA-CP01", max_power_kw=60.0)
    db_session.add(cp)
    db_session.commit()

    # Operator B cố thêm trụ vào trạm của A
    res_create = client.post(
        f"/api/v1/stations/{st.id}/chargers",
        json={"code": "HACK-CP01", "max_power_kw": 60.0},
        headers={"Authorization": f"Bearer {test_users['token_op_b']}"},
    )
    assert res_create.status_code == 403

    # Operator B cố sửa trụ của A
    res_update = client.put(
        f"/api/v1/chargers/{cp.id}",
        json={"max_power_kw": 120.0},
        headers={"Authorization": f"Bearer {test_users['token_op_b']}"},
    )
    assert res_update.status_code == 403

    # Operator B cố xóa trụ của A
    res_delete = client.delete(
        f"/api/v1/chargers/{cp.id}",
        headers={"Authorization": f"Bearer {test_users['token_op_b']}"},
    )
    assert res_delete.status_code == 403


def test_idor_patch_charger_status(client, db_session, test_users):
    """11. Chống IDOR trên PATCH /chargers/{id}/status: Operator B không thể đổi trạng thái trụ của Operator A."""
    st = Station(
        operator_id=test_users["op_a"].id,
        name="Trạm A Status Test",
        address="Hà Nội",
        latitude=21.0,
        longitude=105.8,
        total_grid_capacity_kw=100.0,
    )
    db_session.add(st)
    db_session.commit()

    cp = ChargingPoint(station_id=st.id, code="STATUS-CP01", max_power_kw=60.0, status="AVAILABLE")
    db_session.add(cp)
    db_session.commit()

    # Operator B cố PATCH trạng thái trụ của A -> 403
    res_b = client.patch(
        f"/api/v1/chargers/{cp.id}/status",
        json={"status": "FAULTED"},
        headers={"Authorization": f"Bearer {test_users['token_op_b']}"},
    )
    assert res_b.status_code == 403

    # Operator A PATCH trạng thái trụ của mình -> 200
    res_a = client.patch(
        f"/api/v1/chargers/{cp.id}/status",
        json={"status": "FAULTED"},
        headers={"Authorization": f"Bearer {test_users['token_op_a']}"},
    )
    assert res_a.status_code == 200
    assert res_a.json()["status"] == "FAULTED"


def test_atomic_soft_delete_and_reactivate_station(client, db_session, test_users):
    """12. Soft-delete và Reactivate trạm sạc nguyên tử: Biến mất khỏi tìm kiếm công khai, sau đó phục hồi."""
    st = Station(
        operator_id=test_users["op_a"].id,
        name="Trạm Vòng Đời",
        address="123 Kim Mã",
        latitude=21.03,
        longitude=105.82,
        total_grid_capacity_kw=100.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(st)
    db_session.commit()

    cp = ChargingPoint(station_id=st.id, code="VD-CP01", max_power_kw=60.0, is_active=True)
    db_session.add(cp)
    db_session.commit()

    conn = Connector(charging_point_id=cp.id, connector_number=1, connector_type="CCS2", max_power_kw=60.0, is_active=True)
    db_session.add(conn)
    db_session.commit()

    # 1. Ban đầu trạm có trong tìm kiếm công khai
    res_init = client.get("/api/v1/stations")
    assert any(s["id"] == st.id for s in res_init.json())

    # 2. Xóa mềm trạm
    res_del = client.delete(
        f"/api/v1/stations/{st.id}",
        headers={"Authorization": f"Bearer {test_users['token_op_a']}"},
    )
    assert res_del.status_code == 200

    # 3. Trạm biến mất khỏi tìm kiếm công khai
    res_after_del = client.get("/api/v1/stations")
    assert not any(s["id"] == st.id for s in res_after_del.json())

    # Kiểm tra trực tiếp trong DB: is_active = False cascade
    db_session.refresh(st)
    db_session.refresh(cp)
    db_session.refresh(conn)
    assert st.is_active is False
    assert cp.is_active is False
    assert conn.is_active is False

    # 4. Phục hồi trạm sạc (Reactivate)
    res_reactivate = client.post(
        f"/api/v1/stations/{st.id}/reactivate",
        headers={"Authorization": f"Bearer {test_users['token_op_a']}"},
    )
    assert res_reactivate.status_code == 200
    assert res_reactivate.json()["is_active"] is True

    # 5. Trạm xuất hiện trở lại trong tìm kiếm công khai
    res_restored = client.get("/api/v1/stations")
    assert any(s["id"] == st.id for s in res_restored.json())


def test_get_live_dashboard_metrics(client, db_session, test_users):
    """13. Kiểm tra API Live Dashboard Metrics trả về giá trị thực tế khi chạy."""
    op = test_users["op_a"]
    st = Station(
        operator_id=op.id,
        name="Trạm Live Metrics Test",
        address="100 Phố Huế, Hà Nội",
        latitude=21.01,
        longitude=105.85,
        total_grid_capacity_kw=180.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(st)
    db_session.commit()

    cp = ChargingPoint(
        station_id=st.id,
        code="LIVE-CP01",
        vendor="ABB",
        model="Terra-60",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(cp)
    db_session.commit()

    res = client.get("/api/v1/stations/metrics/live")
    assert res.status_code == 200
    data = res.json()
    assert "total_stations" in data
    assert "total_chargers" in data
    assert "charging_chargers_count" in data
    assert "active_power_kw" in data
    assert "chargers" in data
    assert data["charging_chargers_count"] == 0
    assert data["active_power_kw"] == 0.0


def test_get_grid_load_profile(client, db_session):
    """14. Kiểm tra API Load Profile 24h trả về 12 khung giờ TOU thực tế."""
    res = client.get("/api/v1/stations/metrics/load-profile")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == 12
    # Kiểm tra cấu trúc từng slot
    first_slot = data[0]
    assert "time" in first_slot
    assert "loadKw" in first_slot
    assert "priceSlot" in first_slot
    assert first_slot["priceSlot"] in ("PEAK", "NORMAL", "OFFPEAK")


def test_get_grid_load_profile_timeline(client, db_session):
    """15. Kiểm tra API Load Profile Timeline chi tiết 1440 phút (Equalizer 24h)."""
    res = client.get("/api/v1/stations/metrics/load-profile-timeline")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    # 1. Đúng 1440 điểm (24 giờ x 60 phút)
    assert len(data) == 1440

    # 2. Điểm đầu tiên là 00:00, điểm cuối cùng là 23:59
    assert data[0]["time"] == "00:00"
    assert data[-1]["time"] == "23:59"

    # 3. Điểm cuối ngày chắc chắn là tương lai (isPlaceholder = True, noData = False)
    last_point = data[-1]
    assert last_point["isPlaceholder"] is True
    assert last_point["noData"] is False
    assert last_point["powerKw"] == 0.0

    # 4. Kiểm tra cấu trúc từng điểm
    for point in data[:10]:
        assert "time" in point
        assert "powerKw" in point
        assert "isPlaceholder" in point
        assert "noData" in point
        assert isinstance(point["isPlaceholder"], bool)


@pytest.mark.anyio
async def test_cumulative_energy_captures_short_session_under_60s(client, db_session, test_users):
    """16. Kiểm tra cơ chế lũy kế năng lượng bảo toàn 100% điện năng, bắt trọn các phiên sạc ngắn < 60s."""
    from app.services.scheduler_service import (
        record_station_power_metrics_minute_job,
        reset_cumulative_energy_cache,
    )
    from app.models.station import StationPowerMetric
    from app.models.session import ChargingSession
    from app.models.tariff import Tariff
    from datetime import datetime, timezone

    # 1. Chuẩn bị dữ liệu: Tạo trạm và trụ sạc 60 kW
    op = test_users["op_a"]
    st = Station(
        operator_id=op.id,
        name="Trạm Test Lũy Kế Năng Lượng",
        address="123 Đường Điện Năng",
        latitude=21.03,
        longitude=105.85,
        total_grid_capacity_kw=180.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(st)
    db_session.commit()

    cp = ChargingPoint(
        station_id=st.id,
        code="CP-CUMULATIVE-TEST",
        vendor="ABB",
        model="Terra-60",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(cp)
    db_session.commit()

    conn = Connector(
        charging_point_id=cp.id,
        connector_number=1,
        connector_type="CCS2",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(conn)
    db_session.commit()

    tariff = Tariff(
        station_id=st.id,
        name="Biểu giá Test",
        price_normal=3000,
        price_peak=4000,
        price_offpeak=2000,
        is_active=True,
    )
    db_session.add(tariff)
    db_session.commit()

    # 2. Reset cache và kích hoạt lần tick đầu tiên để thiết lập mốc cơ sở (baseline)
    reset_cumulative_energy_cache()
    await record_station_power_metrics_minute_job(db=db_session)

    metric_base = (
        db_session.query(StationPowerMetric)
        .filter(StationPowerMetric.station_id == st.id)
        .order_by(StationPowerMetric.timestamp.desc())
        .first()
    )
    assert metric_base is not None
    assert metric_base.power_kw == 0.0  # Lần đầu chạy ghi nhận 0.0 kW làm mốc baseline

    # 3. Giả lập 1 phiên sạc siêu ngắn (chỉ kéo dài 20 giây ở công suất 60 kW, tiêu thụ 0.3333 kWh)
    # Phiên sạc bắt đầu VÀ kết thúc hoàn toàn trước lần tick kế tiếp (không còn tồn tại trong RAM)
    short_session = ChargingSession(
        user_id=test_users["customer"].id,
        connector_id=conn.id,
        tariff_id=tariff.id,
        applied_price_per_kwh=3000,
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc),
        meter_start_kwh=100.0,
        meter_stop_kwh=100.5,
        total_kwh=0.5,
        total_amount=1500.0,
        current_soc=45.0,
        status="COMPLETED",
        stop_reason="USER_STOPPED",
    )
    db_session.add(short_session)
    db_session.commit()

    # 4. Kích hoạt lần tick thứ hai của Scheduler
    await record_station_power_metrics_minute_job(db=db_session)

    # 5. Xác nhận dữ liệu trong bảng station_power_metrics:
    # ΔkWh = 0.5 kWh -> Công suất trung bình: P_avg = 0.5 * 60 = 30.0 kW
    metric_after = (
        db_session.query(StationPowerMetric)
        .filter(StationPowerMetric.station_id == st.id)
        .order_by(StationPowerMetric.id.desc())
        .first()
    )
    assert metric_after is not None
    assert metric_after.power_kw == 30.0  # Khớp chính xác 30.0 kW, KHÔNG bị lọt/ghi 0.0 sai!

    # 6. Gọi endpoint load-profile-timeline để xác nhận API trả về đúng số kW thật
    res = client.get(f"/api/v1/stations/metrics/load-profile-timeline?station_id={st.id}")
    assert res.status_code == 200
    timeline = res.json()
    non_zero_points = [p for p in timeline if p["powerKw"] > 0]
    assert len(non_zero_points) >= 1
    assert non_zero_points[0]["powerKw"] == 30.0



