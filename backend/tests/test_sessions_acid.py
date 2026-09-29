import concurrent.futures
from datetime import datetime, time, timezone
from decimal import Decimal
from unittest.mock import patch
import pytest

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction


@pytest.fixture
def setup_data(db_session):
    """Tạo dữ liệu nền tảng: CPO, 2 Drivers có ví, 1 Station, 1 Charger, 1 Connector."""
    # 1. Users
    cpo = User(
        username="cpo_operator",
        email="cpo@test.com",
        password_hash=get_password_hash("Secret123"),
        role="OPERATOR",
        is_active=True,
    )
    driver_a = User(
        username="driver_a",
        email="driver_a@test.com",
        password_hash=get_password_hash("Secret123"),
        role="CUSTOMER",
        is_active=True,
    )
    driver_b = User(
        username="driver_b",
        email="driver_b@test.com",
        password_hash=get_password_hash("Secret123"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([cpo, driver_a, driver_b])
    db_session.commit()

    # 2. Wallets cho Drivers (Mặc định 0 VND)
    wallet_a = Wallet(user_id=driver_a.id, balance=Decimal("0.00"), is_debt_locked=False)
    wallet_b = Wallet(user_id=driver_b.id, balance=Decimal("0.00"), is_debt_locked=False)
    db_session.add_all([wallet_a, wallet_b])

    # 3. Trạm sạc, trụ sạc, cổng sạc
    station = Station(
        operator_id=cpo.id,
        name="Trạm Sạc Siêu Nhanh E-Fast",
        address="123 Đường Điện Biên Phủ, TP.HCM",
        latitude=10.7769,
        longitude=106.7009,
        total_grid_capacity_kw=300.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(station)
    db_session.commit()

    cp = ChargingPoint(
        station_id=station.id,
        code="CP-TEST-01",
        model="ABB Terra 124",
        max_power_kw=120.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(cp)
    db_session.commit()

    connector = Connector(
        charging_point_id=cp.id,
        connector_number=1,
        connector_type="CCS2",
        max_power_kw=120.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(connector)

    # 4. Biểu giá mặc định cho trạm
    tariff = Tariff(
        station_id=station.id,
        name="Biểu giá tiêu chuẩn Trạm E-Fast",
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


    # Tokens
    token_a = create_access_token({"sub": str(driver_a.id), "role": driver_a.role})
    token_b = create_access_token({"sub": str(driver_b.id), "role": driver_b.role})
    token_cpo = create_access_token({"sub": str(cpo.id), "role": cpo.role})

    return {
        "cpo": cpo,
        "driver_a": driver_a,
        "driver_b": driver_b,
        "wallet_a": wallet_a,
        "wallet_b": wallet_b,
        "station": station,
        "connector": connector,
        "station_id": station.id,
        "connector_id": connector.id,
        "token_a": token_a,
        "token_b": token_b,
        "token_cpo": token_cpo,
    }



def test_topup_wallet_success(client, db_session, setup_data):
    """1. Nạp tiền vào ví điện tử thành công, số dư tăng và ghi nhật ký giao dịch TOPUP."""
    token = setup_data["token_a"]
    headers = {"Authorization": f"Bearer {token}"}

    topup_payload = {"amount": 100000.0, "note": "Nạp tiền trải nghiệm dịch vụ"}
    res = client.post("/api/v1/wallet/topup", json=topup_payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert Decimal(str(data["balance"])) == Decimal("100000.00")
    assert data["is_debt_locked"] is False

    # Lấy thông tin ví và lịch sử giao dịch
    res_me = client.get("/api/v1/wallet/me", headers=headers)
    assert res_me.status_code == 200
    me_data = res_me.json()
    assert Decimal(str(me_data["balance"])) == Decimal("100000.00")
    assert len(me_data["transactions"]) == 1
    tx = me_data["transactions"][0]
    assert tx["transaction_type"] == "TOPUP"
    assert Decimal(str(tx["amount"])) == Decimal("100000.00")


def test_start_session_requires_minimum_balance(client, db_session, setup_data):
    """2. Tài xế có số dư >= 0 nhưng < 50,000 VND (MIN_START_BALANCE) -> Bị chặn với HTTP 400."""
    token = setup_data["token_a"]
    headers = {"Authorization": f"Bearer {token}"}
    connector = setup_data["connector"]

    # Nạp 30,000 VND (dưới mức tối thiểu 50,000 VND)
    client.post("/api/v1/wallet/topup", json={"amount": 30000.0, "note": "Nạp ít"}, headers=headers)

    res = client.post(
        "/api/v1/sessions/start",
        json={"connector_id": connector.id},
        headers=headers,
    )
    assert res.status_code == 400
    assert "không đủ hạn mức tối thiểu" in res.json()["detail"]


def test_start_session_blocked_when_in_debt(client, db_session, setup_data):
    """3. Tài xế có số dư âm (balance < 0) -> Bị chặn với HTTP 402 Payment Required (KHÁC 400)."""
    driver_a = setup_data["driver_a"]
    token = setup_data["token_a"]
    headers = {"Authorization": f"Bearer {token}"}
    connector = setup_data["connector"]

    # Đặt số dư ví âm (-20,000 VND)
    wallet = db_session.query(Wallet).filter(Wallet.user_id == driver_a.id).first()
    wallet.balance = Decimal("-20000.00")
    db_session.commit()

    res = client.post(
        "/api/v1/sessions/start",
        json={"connector_id": connector.id},
        headers=headers,
    )
    assert res.status_code == 402
    assert "số dư âm" in res.json()["detail"]
    assert "Vui lòng nạp tiền" in res.json()["detail"]


def test_start_session_locks_connector_exclusively(client, db_session, setup_data):
    """
    4. Concurrency THẬT bằng ThreadPoolExecutor:
    2 drivers đồng thời cố gắng bắt đầu phiên sạc trên CÙNG 1 cổng sạc.
    Đảm bảo 1 driver thành công (HTTP 201) và 1 driver nhận HTTP 409 Conflict.
    """
    token_a = setup_data["token_a"]
    token_b = setup_data["token_b"]
    connector_id = setup_data["connector_id"]
    station_id = setup_data["station_id"]

    # Nạp 100k cho cả 2 tài xế
    client.post("/api/v1/wallet/topup", json={"amount": 100000.0}, headers={"Authorization": f"Bearer {token_a}"})
    client.post("/api/v1/wallet/topup", json={"amount": 100000.0}, headers={"Authorization": f"Bearer {token_b}"})

    def attempt_start(token):
        return client.post(
            "/api/v1/sessions/start",
            json={"connector_id": connector_id},
            headers={"Authorization": f"Bearer {token}"},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(attempt_start, token_a)
        f2 = executor.submit(attempt_start, token_b)
        res1 = f1.result()
        res2 = f2.result()

    statuses = [res1.status_code, res2.status_code]
    assert 201 in statuses, "Phải có đúng 1 yêu cầu bắt đầu phiên thành công (201)"
    assert 409 in statuses, "Yêu cầu cạnh tranh đồng thời phải bị từ chối 409 Conflict"

    # Đóng session fixture trước khi gọi API để tránh out-of-sync identity map
    db_session.close()

    # Kiểm tra trạng thái cổng sạc qua API đã chuyển sang CHARGING
    res_st = client.get(f"/api/v1/stations/{station_id}")
    assert res_st.status_code == 200
    st_data = res_st.json()
    conn_status = st_data["charging_points"][0]["connectors"][0]["status"]
    assert conn_status == "CHARGING"






def test_calculate_bill_with_tou_tariff_at_connect_time(client, db_session, setup_data):
    """
    5. Biểu giá TOU chốt 1 lần tại thời điểm BẮT ĐẦU phiên:
    Bắt đầu phiên tại giờ cao điểm (Peak rate: 4,500 VND/kWh).
    Kết thúc phiên dù rơi vào giờ thấp điểm (Off-peak: 2,500 VND/kWh) thì tổng tiền
    vẫn tính theo giá lúc cắm sạc (4,500 VND/kWh).
    """
    token = setup_data["token_a"]
    headers = {"Authorization": f"Bearer {token}"}
    connector = setup_data["connector"]

    # Nạp 200k vào ví
    client.post("/api/v1/wallet/topup", json={"amount": 200000.0}, headers=headers)

    # Tạo biểu giá TOU đặc thù cho trạm
    tariff = Tariff(
        station_id=setup_data["station"].id,
        name="TOU Đặc Thù Kiểm Thử",
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

    # Giả lập thời gian bắt đầu lúc 10:00 UTC (Giờ cao điểm peak: 09:30 - 11:30)
    fake_start_time = datetime(2026, 9, 25, 10, 0, 0, tzinfo=timezone.utc)
    with patch("app.services.session_service.datetime") as mock_dt:
        mock_dt.now.return_value = fake_start_time
        res_start = client.post(
            "/api/v1/sessions/start",
            json={"connector_id": connector.id},
            headers=headers,
        )

    assert res_start.status_code == 201
    session_data = res_start.json()
    session_id = session_data["id"]
    assert Decimal(str(session_data["applied_price_per_kwh"])) == Decimal("4500.00")

    # Giả lập kết thúc phiên lúc 23:00 UTC (Giờ thấp điểm offpeak: 22:00 - 04:00)
    fake_stop_time = datetime(2026, 9, 25, 23, 0, 0, tzinfo=timezone.utc)
    with patch("app.services.session_service.datetime") as mock_dt:
        mock_dt.now.return_value = fake_stop_time
        res_stop = client.post(
            f"/api/v1/sessions/{session_id}/stop",
            json={"meter_stop_kwh": 20.0},
            headers=headers,
        )

    assert res_stop.status_code == 200
    stop_data = res_stop.json()
    assert Decimal(str(stop_data["total_kwh"])) == Decimal("20.00")
    # Tổng tiền = 20 kWh * 4,500 VND/kWh = 90,000 VND (KHÔNG PHẢI 20 * 2000 = 40,000 VND)
    assert Decimal(str(stop_data["total_amount"])) == Decimal("90000.00")


def test_stop_session_deducts_wallet_atomically(client, db_session, setup_data):
    """
    6. Dừng phiên sạc quyết toán ví nguyên tử (ACID):
    - Trừ đúng số tiền cước.
    - Tạo WalletTransaction loại CHARGE_FEE.
    - Cổng sạc mở khóa về AVAILABLE.
    - Idempotency: Gọi stop lần thứ 2 không bị trừ tiền thêm.
    """
    token = setup_data["token_a"]
    headers = {"Authorization": f"Bearer {token}"}
    connector = setup_data["connector"]

    # Nạp 200,000 VND
    client.post("/api/v1/wallet/topup", json={"amount": 200000.0}, headers=headers)

    # Bắt đầu phiên sạc
    res_start = client.post(
        "/api/v1/sessions/start",
        json={"connector_id": connector.id},
        headers=headers,
    )
    assert res_start.status_code == 201
    s_id = res_start.json()["id"]
    applied_price = Decimal(str(res_start.json()["applied_price_per_kwh"]))

    # Dừng phiên với 15 kWh
    res_stop = client.post(
        f"/api/v1/sessions/{s_id}/stop",
        json={"meter_stop_kwh": 15.0},
        headers=headers,
    )
    assert res_stop.status_code == 200
    expected_amount = round(Decimal("15.0") * applied_price, 2)
    expected_balance = Decimal("200000.00") - expected_amount

    # Kiểm tra số dư ví
    res_wallet = client.get("/api/v1/wallet/me", headers=headers)
    w_data = res_wallet.json()
    assert Decimal(str(w_data["balance"])) == expected_balance
    tx_fee = [t for t in w_data["transactions"] if t["transaction_type"] == "CHARGE_FEE"][0]
    assert Decimal(str(tx_fee["amount"])) == -expected_amount

    # Kiểm tra connector về AVAILABLE
    db_session.expire_all()
    c_updated = db_session.query(Connector).filter(Connector.id == connector.id).first()
    assert c_updated.status == "AVAILABLE"

    # Idempotency: Gọi dừng lần 2
    res_stop2 = client.post(
        f"/api/v1/sessions/{s_id}/stop",
        json={"meter_stop_kwh": 15.0},
        headers=headers,
    )
    assert res_stop2.status_code == 200
    # Số dư ví vẫn phải giữ nguyên, không trừ 2 lần
    res_wallet2 = client.get("/api/v1/wallet/me", headers=headers)
    assert Decimal(str(res_wallet2.json()["balance"])) == expected_balance


def test_stop_session_allows_negative_balance_within_limit(client, db_session, setup_data):
    """
    7. Trừ cước làm số dư ví bị âm nhưng còn trong hạn mức NEGATIVE_BALANCE_LIMIT (-300,000 VND):
    - Cho phép hoàn tất bình thường.
    - Tài khoản chưa bị debt-locked.
    - Cổng sạc được giải phóng về AVAILABLE.
    """
    token = setup_data["token_a"]
    headers = {"Authorization": f"Bearer {token}"}
    connector = setup_data["connector"]

    # Nạp đúng 50,000 VND (đủ điều kiện bắt đầu phiên)
    client.post("/api/v1/wallet/topup", json={"amount": 50000.0}, headers=headers)

    res_start = client.post(
        "/api/v1/sessions/start",
        json={"connector_id": connector.id},
        headers=headers,
    )
    assert res_start.status_code == 201
    s_id = res_start.json()["id"]
    applied_price = Decimal(str(res_start.json()["applied_price_per_kwh"]))

    # Sạc lượng điện có tổng cước khoảng 150,000 VND
    # Số kWh = 150000 / applied_price
    kwh = round(Decimal("150000.00") / applied_price, 2)
    total_fee = round(kwh * applied_price, 2)

    res_stop = client.post(
        f"/api/v1/sessions/{s_id}/stop",
        json={"meter_stop_kwh": float(kwh)},
        headers=headers,
    )
    assert res_stop.status_code == 200

    # Số dư âm: 50,000 - total_fee ≈ -100,000 VND (nằm trong hạn mức nợ -300k)
    expected_balance = Decimal("50000.00") - total_fee
    assert expected_balance > Decimal(str(settings.NEGATIVE_BALANCE_LIMIT))

    res_wallet = client.get("/api/v1/wallet/me", headers=headers)
    w_data = res_wallet.json()
    assert Decimal(str(w_data["balance"])) == expected_balance
    assert w_data["is_debt_locked"] is False

    # Cổng sạc vẫn được trả về AVAILABLE
    db_session.expire_all()
    c_updated = db_session.query(Connector).filter(Connector.id == connector.id).first()
    assert c_updated.status == "AVAILABLE"


def test_stop_session_rejects_beyond_debt_limit(client, db_session, setup_data):
    """
    8. Trừ cước vượt quá hạn mức nợ cho phép NEGATIVE_BALANCE_LIMIT (-300,000 VND):
    - Policy đã chốt: Vẫn cho phép trừ hết (vì điện đã xả vào xe), nhưng tài khoản
      bị đánh dấu debt-locked (is_debt_locked = True) ngay lập tức.
    - Mọi nỗ lực bắt đầu phiên sạc tiếp theo sẽ bị CHẶN với HTTP 402.
    """
    token = setup_data["token_a"]
    headers = {"Authorization": f"Bearer {token}"}
    connector = setup_data["connector"]

    # Nạp 50,000 VND
    client.post("/api/v1/wallet/topup", json={"amount": 50000.0}, headers=headers)

    res_start = client.post(
        "/api/v1/sessions/start",
        json={"connector_id": connector.id},
        headers=headers,
    )
    assert res_start.status_code == 201
    s_id = res_start.json()["id"]
    applied_price = Decimal(str(res_start.json()["applied_price_per_kwh"]))

    # Sạc lượng điện lớn có tổng cước 450,000 VND
    kwh = round(Decimal("450000.00") / applied_price, 2)
    total_fee = round(kwh * applied_price, 2)

    res_stop = client.post(
        f"/api/v1/sessions/{s_id}/stop",
        json={"meter_stop_kwh": float(kwh)},
        headers=headers,
    )
    assert res_stop.status_code == 200

    # Số dư âm: 50,000 - 450,000 = -400,000 VND (< -300,000 VND)
    expected_balance = Decimal("50000.00") - total_fee
    assert expected_balance < Decimal(str(settings.NEGATIVE_BALANCE_LIMIT))

    res_wallet = client.get("/api/v1/wallet/me", headers=headers)
    w_data = res_wallet.json()
    assert Decimal(str(w_data["balance"])) == expected_balance
    assert w_data["is_debt_locked"] is True

    # Thử bắt đầu phiên sạc mới -> Bị chặn với HTTP 402 Payment Required
    res_new_session = client.post(
        "/api/v1/sessions/start",
        json={"connector_id": connector.id},
        headers=headers,
    )
    assert res_new_session.status_code == 402
    assert "số dư âm" in res_new_session.json()["detail"]


def test_driver_cannot_stop_another_drivers_session(client, db_session, setup_data):
    """9. Chống IDOR: Tài xế B cố tình dừng phiên sạc của tài xế A -> Bị từ chối HTTP 403 Forbidden."""
    token_a = setup_data["token_a"]
    token_b = setup_data["token_b"]
    connector = setup_data["connector"]

    # Tài xế A nạp tiền và bắt đầu sạc
    client.post("/api/v1/wallet/topup", json={"amount": 100000.0}, headers={"Authorization": f"Bearer {token_a}"})
    res_start = client.post(
        "/api/v1/sessions/start",
        json={"connector_id": connector.id},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert res_start.status_code == 201
    session_id = res_start.json()["id"]

    # Tài xế B gửi request dừng phiên của tài xế A
    res_hack = client.post(
        f"/api/v1/sessions/{session_id}/stop",
        json={"meter_stop_kwh": 10.0},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res_hack.status_code == 403
    assert "Bạn không có quyền can thiệp vào phiên sạc của tài xế khác" in res_hack.json()["detail"]

    # Phiên sạc vẫn tiếp tục ACTIVE
    db_session.expire_all()
    s = db_session.query(ChargingSession).filter(ChargingSession.id == session_id).first()
    assert s.status == "ACTIVE"
