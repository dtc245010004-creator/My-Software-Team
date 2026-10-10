import pytest

from app.core.security import create_access_token
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User
from app.services.event_broadcaster import sse_broadcaster


@pytest.fixture
def t25_seed_data(db_session):
    """Seed dữ liệu cho Task T-25: Admin, Operator A, Operator B và các trạm sạc."""
    admin = User(
        username="admin_stream",
        email="admin_stream@evcsms.vn",
        password_hash="hash",
        role="ADMIN",
        is_active=True,
    )
    op_a = User(
        username="op_a_stream",
        email="opa_stream@evcsms.vn",
        password_hash="hash",
        role="OPERATOR",
        is_active=True,
    )
    op_b = User(
        username="op_b_stream",
        email="opb_stream@evcsms.vn",
        password_hash="hash",
        role="OPERATOR",
        is_active=True,
    )
    db_session.add_all([admin, op_a, op_b])
    db_session.commit()

    # Trạm của Operator A
    st_a = Station(
        operator_id=op_a.id,
        name="Trạm SSE A",
        address="123 Phố A, Hà Nội",
        latitude=21.01,
        longitude=105.81,
        total_grid_capacity_kw=120.0,
        status="ACTIVE",
        is_active=True,
    )
    # Trạm của Operator B
    st_b = Station(
        operator_id=op_b.id,
        name="Trạm SSE B",
        address="456 Đường B, TP.HCM",
        latitude=10.79,
        longitude=106.68,
        total_grid_capacity_kw=90.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add_all([st_a, st_b])
    db_session.commit()

    # Trụ và đầu nối cho Trạm A
    cp_a = ChargingPoint(
        station_id=st_a.id,
        code="CP-STREAM-A1",
        vendor="ABB",
        status="AVAILABLE",
        max_power_kw=60.0,
        is_active=True,
    )
    # Trụ và đầu nối cho Trạm B
    cp_b = ChargingPoint(
        station_id=st_b.id,
        code="CP-STREAM-B1",
        vendor="Schneider",
        status="AVAILABLE",
        max_power_kw=50.0,
        is_active=True,
    )
    db_session.add_all([cp_a, cp_b])
    db_session.commit()

    conn_a = Connector(
        charge_point_id=cp_a.id,
        connector_number=1,
        connector_type="CCS2",
        status="AVAILABLE",
        max_power_kw=60.0,
        is_active=True,
    )
    conn_b = Connector(
        charge_point_id=cp_b.id,
        connector_number=1,
        connector_type="Type 2",
        status="AVAILABLE",
        max_power_kw=22.0,
        is_active=True,
    )
    db_session.add_all([conn_a, conn_b])
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
        "st_a": st_a,
        "st_b": st_b,
        "cp_a": cp_a,
        "cp_b": cp_b,
        "conn_a": conn_a,
        "conn_b": conn_b,
        "h_admin": h_admin,
        "h_op_a": h_op_a,
        "h_op_b": h_op_b,
    }


def test_t25_stream_connection(client, t25_seed_data):
    """Test 1: Kết nối thành công tới kênh SSE, nhận header chuẩn Content-Type: text/event-stream."""
    # 1. Kiểm tra endpoint chính /api/v1/stations/events
    res_events = client.get(
        "/api/v1/stations/events?limit=1",
        headers=t25_seed_data["h_admin"],
    )
    assert res_events.status_code == 200
    assert "text/event-stream" in res_events.headers.get("content-type", "")
    assert "data:" in res_events.text
    assert "connected" in res_events.text

    # 2. Kiểm tra endpoint alias /api/v1/stations/stream
    res_stream = client.get(
        "/api/v1/stations/stream?limit=1",
        headers=t25_seed_data["h_op_a"],
    )
    assert res_stream.status_code == 200
    assert "text/event-stream" in res_stream.headers.get("content-type", "")
    assert "data:" in res_stream.text
    assert "connected" in res_stream.text

    # 3. Kiểm tra từ chối truy cập không có token xác thực
    res_unauth = client.get("/api/v1/stations/events?limit=1")
    assert res_unauth.status_code == 401


@pytest.mark.asyncio
async def test_t25_stream_rbac_isolation(t25_seed_data):
    """Test 2: Kiểm tra cách ly quyền sở hữu (RBAC / Tenancy) của luồng SSE.

    - Sự kiện từ trạm của Operator A: Admin và Operator A nhận được, Operator B KHÔNG nhận được.
    - Sự kiện từ trạm của Operator B: Admin và Operator B nhận được, Operator A KHÔNG nhận được.
    """
    admin = t25_seed_data["admin"]
    op_a = t25_seed_data["op_a"]
    op_b = t25_seed_data["op_b"]
    st_a = t25_seed_data["st_a"]
    st_b = t25_seed_data["st_b"]
    cp_a = t25_seed_data["cp_a"]
    cp_b = t25_seed_data["cp_b"]
    conn_a = t25_seed_data["conn_a"]
    conn_b = t25_seed_data["conn_b"]

    # Đăng ký 3 subscriber
    q_admin = await sse_broadcaster.subscribe(admin)
    q_a = await sse_broadcaster.subscribe(op_a)
    q_b = await sse_broadcaster.subscribe(op_b)

    try:
        # Kịch bản 1: Phát sự kiện từ Trạm A (thuộc Operator A)
        delivered_a = await sse_broadcaster.broadcast_connector_status_change(
            station_id=st_a.id,
            charge_point_id=cp_a.id,
            connector_id=conn_a.id,
            status="Charging",
            operator_id=op_a.id,
        )
        assert delivered_a == 2, "Chỉ Admin và Operator A nhận được sự kiện trạm A"

        # Admin nhận được sự kiện
        assert not q_admin.empty()
        event_admin = q_admin.get_nowait()
        assert event_admin["event"] == "connector_status_changed"
        assert event_admin["station_id"] == st_a.id
        assert event_admin["status"] == "Charging"

        # Operator A nhận được sự kiện
        assert not q_a.empty()
        event_a = q_a.get_nowait()
        assert event_a["event"] == "connector_status_changed"
        assert event_a["station_id"] == st_a.id
        assert event_a["status"] == "Charging"

        # Operator B KHÔNG nhận được bất kỳ sự kiện nào từ Trạm A
        assert q_b.empty(), (
            "Operator B không được nhận sự kiện thuộc trạm của Operator A"
        )

        # Kịch bản 2: Phát sự kiện từ Trạm B (thuộc Operator B)
        delivered_b = await sse_broadcaster.broadcast_connector_status_change(
            station_id=st_b.id,
            charge_point_id=cp_b.id,
            connector_id=conn_b.id,
            status="Faulted",
            operator_id=op_b.id,
        )
        assert delivered_b == 2, "Chỉ Admin và Operator B nhận được sự kiện trạm B"

        # Admin nhận được sự kiện trạm B
        assert not q_admin.empty()
        event_admin_b = q_admin.get_nowait()
        assert event_admin_b["station_id"] == st_b.id
        assert event_admin_b["status"] == "Faulted"

        # Operator B nhận được sự kiện trạm B
        assert not q_b.empty()
        event_b = q_b.get_nowait()
        assert event_b["station_id"] == st_b.id
        assert event_b["status"] == "Faulted"

        # Operator A KHÔNG nhận được bất kỳ sự kiện nào từ Trạm B
        assert q_a.empty(), (
            "Operator A không được nhận sự kiện thuộc trạm của Operator B"
        )

    finally:
        await sse_broadcaster.unsubscribe(q_admin)
        await sse_broadcaster.unsubscribe(q_a)
        await sse_broadcaster.unsubscribe(q_b)


@pytest.mark.asyncio
async def test_t25_stream_disconnect_cleanup(client, t25_seed_data):
    """Test 3: Đảm bảo khi client ngắt kết nối, queue subscriber được giải phóng sạch sẽ khỏi bộ nhớ."""
    initial_count = sse_broadcaster.get_subscriber_count()

    # 1. Kiểm tra dọn dẹp qua API endpoint khi kết thúc stream
    res = client.get(
        "/api/v1/stations/events?limit=1",
        headers=t25_seed_data["h_admin"],
    )
    assert res.status_code == 200
    # Sau khi endpoint hoàn tất stream, finally block đã dọn dẹp subscriber
    assert sse_broadcaster.get_subscriber_count() == initial_count

    # 2. Kiểm tra trực tiếp subscribe và unsubscribe để chống rò rỉ bộ nhớ
    q_test = await sse_broadcaster.subscribe(t25_seed_data["op_a"])
    assert sse_broadcaster.get_subscriber_count() == initial_count + 1

    await sse_broadcaster.unsubscribe(q_test)
    assert sse_broadcaster.get_subscriber_count() == initial_count
