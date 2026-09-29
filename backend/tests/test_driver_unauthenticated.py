from decimal import Decimal
import pytest
from app.core.security import create_access_token, get_password_hash
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.user import User
from app.models.wallet import Wallet


@pytest.fixture
def station_for_unauth(db_session):
    """Tạo trạm sạc và cổng sạc cho test tài xế vãng lai."""
    cpo = User(
        username="op_test_unauth",
        email="op_unauth@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="OPERATOR",
        is_active=True,
    )
    db_session.add(cpo)
    db_session.commit()

    st = Station(
        operator_id=cpo.id,
        name="Trạm Sạc Vãng Lai Test",
        address="123 Phố Sạc, Hà Nội",
        latitude=21.0,
        longitude=105.8,
        total_grid_capacity_kw=200.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(st)
    db_session.commit()

    cp = ChargingPoint(
        station_id=st.id,
        code="CP-UNAUTH-01",
        model="FastCharger",
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

    tariff = Tariff(
        station_id=st.id,
        name="Biểu giá Test",
        price_normal=Decimal("3000.00"),
        price_peak=Decimal("4500.00"),
        price_offpeak=Decimal("2000.00"),
        peak_start="09:30",
        peak_end="11:30",
        peak_start_2="17:00",
        peak_end_2="20:00",
        offpeak_start="22:00",
        offpeak_end="04:00",
        is_active=True,
    )
    db_session.add(tariff)
    db_session.commit()

    return {"station": st, "connector": conn}


def test_driver_wallet_me_without_login(client, db_session):
    """1. Tài xế không cần đăng nhập có thể xem số dư ví /wallet/me thành công."""
    # Không truyền header Authorization
    res = client.get("/api/v1/wallet/me")
    assert res.status_code == 200
    data = res.json()
    assert "balance" in data
    assert "currency" in data
    assert data["currency"] == "VND"


def test_driver_topup_with_name_without_login(client, db_session):
    """2. Tài xế không cần đăng nhập nạp tiền, ghi tên và cộng tiền vào số dư khả dụng."""
    # Nạp 200,000 VND kèm ghi tên "Nguyễn Văn Hùng"
    res = client.post(
        "/api/v1/wallet/topup",
        json={
            "amount": 200000.0,
            "full_name": "Nguyễn Văn Hùng",
            "note": "Nạp tiền qua mã QR VietQR",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert Decimal(str(data["balance"])) >= Decimal("200000.00")

    # Kiểm tra tên người dùng trong CSDL được cập nhật
    user = db_session.query(User).filter(User.username == "customer_user").first()
    assert user is not None
    assert user.full_name == "Nguyễn Văn Hùng"

    # Kiểm tra lịch sử giao dịch cũng có thể xem mà không cần đăng nhập
    tx_res = client.get("/api/v1/wallet/transactions")
    assert tx_res.status_code == 200
    tx_list = tx_res.json()
    assert len(tx_list) > 0
    assert tx_list[0]["transaction_type"] == "TOPUP"


def test_driver_start_and_stop_session_without_login(client, db_session, station_for_unauth):
    """3. Tài xế không cần đăng nhập có thể bắt đầu phiên sạc và dừng phiên sạc."""
    conn = station_for_unauth["connector"]

    # Đảm bảo ví có tiền trước
    client.post(
        "/api/v1/wallet/topup",
        json={"amount": 100000.0, "full_name": "Tài xế Test Sạc"},
    )

    # Bắt đầu sạc không cần đăng nhập
    start_res = client.post(
        "/api/v1/sessions/start",
        json={"connector_id": conn.id},
    )
    assert start_res.status_code == 201
    sess_data = start_res.json()
    assert sess_data["status"] == "ACTIVE"
    session_id = sess_data["id"]

    # Xem danh sách phiên sạc của tôi không cần đăng nhập
    my_sessions = client.get("/api/v1/sessions/me")
    assert my_sessions.status_code == 200
    assert any(s["id"] == session_id for s in my_sessions.json())

    # Dừng phiên sạc không cần đăng nhập
    stop_res = client.post(
        f"/api/v1/sessions/{session_id}/stop",
        json={"meter_stop_kwh": 5.0, "stop_reason": "USER_STOPPED"},
    )
    assert stop_res.status_code == 200
    stopped_data = stop_res.json()
    assert stopped_data["status"] == "COMPLETED"
    assert Decimal(str(stopped_data["total_kwh"])) == Decimal("5.00")


def test_driver_start_session_with_custom_battery_and_initial_soc(client, db_session, station_for_unauth):
    """4. Kiểm thử thiết lập dung lượng pin xe và mức pin ban đầu (SoC %) khi bắt đầu sạc."""
    conn = station_for_unauth["connector"]

    # Đảm bảo nạp ví đủ tiền
    client.post(
        "/api/v1/wallet/topup",
        json={"amount": 200000.0, "full_name": "Tài xế VF8"},
    )

    # Bắt đầu phiên sạc với pin 87.7 kWh (VF 8) và mức pin hiện có 35%
    start_res = client.post(
        "/api/v1/sessions/start",
        json={
            "connector_id": conn.id,
            "battery_capacity_kwh": 87.7,
            "initial_soc": 35.0,
        },
    )
    assert start_res.status_code == 201
    sess_data = start_res.json()
    assert sess_data["status"] == "ACTIVE"
    assert sess_data["current_soc"] == 35.0
    session_id = sess_data["id"]

    # Kiểm tra bộ giả lập trong RAM nhận đúng cấu hình pin
    from app.simulator.charging_simulator import simulator_manager
    sim = simulator_manager.get_simulator(session_id)
    assert sim is not None
    assert sim.battery_capacity_kwh == 87.7
    assert sim.soc == 35.0

    # Dọn dẹp phiên sạc
    client.post(
        f"/api/v1/sessions/{session_id}/stop",
        json={"meter_stop_kwh": 2.0},
    )

