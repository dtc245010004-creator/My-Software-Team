from decimal import Decimal
from unittest.mock import AsyncMock
import pytest

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.core.websocket import ws_manager
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.user import User
from app.models.wallet import Wallet
from app.services.session_service import (
    reconcile_interrupted_sessions,
    start_charging_session,
    stop_charging_session,
)
from app.simulator.charging_simulator import ChargingSimulator, simulator_manager


@pytest.fixture
def sim_setup(db_session):
    """Fixture tạo dữ liệu mẫu cho bài test Simulator."""
    # Reset simulators trong RAM
    simulator_manager.active_simulators.clear()

    # Tạo User
    admin = User(
        username="admin_sim",
        email="admin_sim@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="ADMIN",
        is_active=True,
    )
    op_a = User(
        username="op_a_sim",
        email="opa_sim@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="OPERATOR",
        is_active=True,
    )
    op_b = User(
        username="op_b_sim",
        email="opb_sim@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="OPERATOR",
        is_active=True,
    )
    driver = User(
        username="driver_sim",
        email="driver_sim@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([admin, op_a, op_b, driver])
    db_session.commit()

    # Tạo Wallet
    wallet = Wallet(user_id=driver.id, balance=Decimal("100000.00"), is_debt_locked=False)
    db_session.add(wallet)

    # Tạo Station & Charger thuộc Operator A
    station_a = Station(
        operator_id=op_a.id,
        name="Trạm Sạc Test Sim A",
        address="Khu Công Nghệ Cao, TP.HCM",
        latitude=10.85,
        longitude=106.78,
        total_grid_capacity_kw=250.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(station_a)
    db_session.commit()

    cp_a = ChargingPoint(
        station_id=station_a.id,
        code="CP-SIM-A1",
        max_power_kw=120.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(cp_a)
    db_session.commit()

    connector_a = Connector(
        charging_point_id=cp_a.id,
        connector_number=1,
        connector_type="CCS2",
        max_power_kw=120.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(connector_a)

    # Biểu giá
    tariff = Tariff(
        station_id=station_a.id,
        name="Biểu giá Sim Test",
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

    tokens = {
        "admin": create_access_token({"sub": str(admin.id), "role": admin.role}),
        "op_a": create_access_token({"sub": str(op_a.id), "role": op_a.role}),
        "op_b": create_access_token({"sub": str(op_b.id), "role": op_b.role}),
        "driver": create_access_token({"sub": str(driver.id), "role": driver.role}),
    }

    return {
        "admin": admin,
        "op_a": op_a,
        "op_b": op_b,
        "driver": driver,
        "wallet": wallet,
        "station_a": station_a,
        "connector_a": connector_a,
        "tokens": tokens,
    }


def test_simulator_initialization_and_random_soc():
    """1. Kiểm tra khởi tạo Simulator: SoC ban đầu tự sinh ngẫu nhiên an toàn (20% - 40%), không tin client."""
    sim = ChargingSimulator(
        session_id=1,
        connector_id=1,
        user_id=1,
        applied_price_per_kwh=Decimal("3000.00"),
        max_power_kw=120.0,
    )
    assert 20.0 <= sim.soc <= 40.0, f"SoC tự sinh {sim.soc} phải nằm trong khoảng 20-40%"
    assert sim.current_energy_kwh == Decimal("0.00")
    assert sim.power_kw == 0.0


def test_charging_curve_cc_cv_phases():
    """2. Kiểm tra đường cong sạc CC-CV: SoC < 80% công suất đỉnh, SoC >= 80% giảm dần tuyến tính."""
    sim = ChargingSimulator(
        session_id=1,
        connector_id=1,
        user_id=1,
        applied_price_per_kwh=Decimal("3000.00"),
        max_power_kw=100.0,
        initial_soc=70.0,
    )
    # Giai đoạn CC (70% < 80%): Công suất = 100 kW
    sim.compute_physics(dt_seconds=1.0)
    assert sim.power_kw == 100.0

    # Giai đoạn CV (SoC = 90%): Công suất giảm một nửa chênh lệch
    sim.soc = 90.0
    sim.compute_physics(dt_seconds=1.0)
    # P = 100 - (100 - 10) * (90-80)/20 = 100 - 45 = 55 kW
    assert sim.power_kw == 55.0

    # Pin đầy (SoC = 100%): Công suất về 0 kW
    sim.soc = 100.0
    sim.compute_physics(dt_seconds=1.0)
    assert sim.power_kw == 0.0


@pytest.mark.anyio
async def test_auto_cutoff_on_battery_full(db_session, sim_setup):
    """3. Tự động ngắt sạc an toàn khi Pin đầy 100% (BATTERY_FULL), giải phóng cổng và chốt cước."""
    driver = sim_setup["driver"]
    connector = sim_setup["connector_a"]

    # Bắt đầu phiên sạc
    session = start_charging_session(db_session, driver, connector.id)
    sim = simulator_manager.get_simulator(session.id)
    assert sim is not None

    # Giả lập pin sắp đầy 99.9%
    sim.soc = 99.9
    # Bước nhảy giả lập nạp điện đẩy SoC lên >= 100%
    await sim.step(dt_seconds=60.0, db=db_session)


    db_session.expire_all()
    updated_session = db_session.query(ChargingSession).filter(ChargingSession.id == session.id).first()
    assert updated_session.status == "COMPLETED"
    assert updated_session.stop_reason == "BATTERY_FULL"
    assert updated_session.current_soc == 100.0

    # Cổng sạc được trả về AVAILABLE
    c = db_session.query(Connector).filter(Connector.id == connector.id).first()
    assert c.status == "AVAILABLE"


@pytest.mark.anyio
async def test_auto_cutoff_on_overheat_emergency(db_session, sim_setup):
    """4. Rơ-le ảo ngắt sạc khẩn cấp khi phát hiện quá nhiệt cổng sạc (> 75°C) với OVERHEAT_EMERGENCY."""
    driver = sim_setup["driver"]
    connector = sim_setup["connector_a"]

    session = start_charging_session(db_session, driver, connector.id)
    sim = simulator_manager.get_simulator(session.id)
    assert sim is not None

    # Kích hoạt sự cố quá nhiệt
    sim.overheat_triggered = True
    await sim.step(dt_seconds=2.0, db=db_session)

    db_session.expire_all()
    updated_session = db_session.query(ChargingSession).filter(ChargingSession.id == session.id).first()
    assert updated_session.status == "COMPLETED"
    assert updated_session.stop_reason == "OVERHEAT_EMERGENCY"

    c = db_session.query(Connector).filter(Connector.id == connector.id).first()
    assert c.status == "AVAILABLE"


@pytest.mark.anyio
async def test_auto_cutoff_on_debt_limit_exceeded(db_session, sim_setup):
    """5. Tự động ngắt sạc khi chi phí tạm tính chạm hạn mức nợ NEGATIVE_BALANCE_LIMIT (-300,000 VND)."""
    driver = sim_setup["driver"]
    connector = sim_setup["connector_a"]

    # Đặt số dư ví ban đầu là 50,000 VND
    wallet = sim_setup["wallet"]
    wallet.balance = Decimal("50000.00")
    db_session.commit()

    session = start_charging_session(db_session, driver, connector.id)
    sim = simulator_manager.get_simulator(session.id)

    # Giả lập sạc tiêu thụ 120 kWh * 3000 VND/kWh = 360,000 VND
    # Dự kiến số dư = 50,000 - 360,000 = -310,000 VND (< -300,000 VND limit)
    sim.current_energy_kwh = Decimal("120.00")

    await sim.step(dt_seconds=1.0, db=db_session)

    db_session.expire_all()
    updated_session = db_session.query(ChargingSession).filter(ChargingSession.id == session.id).first()
    assert updated_session.status == "COMPLETED"
    assert updated_session.stop_reason == "DEBT_LIMIT_REACHED"

    # Kiểm tra tài khoản đã bị khóa nợ
    updated_wallet = db_session.query(Wallet).filter(Wallet.user_id == driver.id).first()
    assert updated_wallet.is_debt_locked is True


@pytest.mark.anyio
async def test_checkpoint_saves_snapshot_to_db(db_session, sim_setup):
    """6. Checkpoint định kỳ ghi snapshot total_kwh, current_soc và last_checkpoint_at vào CSDL."""
    driver = sim_setup["driver"]
    connector = sim_setup["connector_a"]

    session = start_charging_session(db_session, driver, connector.id)
    sim = simulator_manager.get_simulator(session.id)

    # Đặt chu kỳ checkpoint 5s và chạy bước 6s
    sim.checkpoint_interval = 5.0
    await sim.step(dt_seconds=6.0, db=db_session)

    db_session.expire_all()
    updated_session = db_session.query(ChargingSession).filter(ChargingSession.id == session.id).first()
    assert updated_session.total_kwh > Decimal("0.00")
    assert updated_session.current_soc > 0.0
    assert updated_session.last_checkpoint_at is not None


def test_server_crash_reconciliation(db_session, sim_setup):
    """
    7. Cơ chế phục hồi (Reconciliation) khi server crash / restart:
    Quét session ACTIVE bị mồ côi -> chuyển INTERRUPTED, trừ tiền theo checkpoint gần nhất, giải phóng cổng sạc.
    """
    driver = sim_setup["driver"]
    connector = sim_setup["connector_a"]

    # Giả lập một session ACTIVE còn sót lại sau khi server sập
    crash_session = ChargingSession(
        user_id=driver.id,
        connector_id=connector.id,
        tariff_id=1,
        applied_price_per_kwh=Decimal("3000.00"),
        meter_start_kwh=Decimal("0.00"),
        total_kwh=Decimal("20.00"),  # Số liệu đã lưu từ checkpoint trước khi crash
        total_amount=Decimal("0.00"),
        status="ACTIVE",
        current_soc=45.0,
    )
    connector.status = "CHARGING"
    db_session.add(crash_session)
    db_session.commit()

    # Simulator trong RAM đã mất hoàn toàn
    simulator_manager.active_simulators.clear()

    # Khởi động cơ chế Reconciliation lúc startup
    reconciled_count = reconcile_interrupted_sessions(db_session)
    assert reconciled_count == 1

    # Kiểm tra session đã được chốt an toàn
    db_session.expire_all()
    repaired_session = db_session.query(ChargingSession).filter(ChargingSession.id == crash_session.id).first()
    assert repaired_session.status == "INTERRUPTED"
    assert repaired_session.stop_reason == "SERVER_CRASH_RECONCILED"
    assert repaired_session.total_amount == Decimal("60000.00")  # 20 kWh * 3000 VND

    # Cổng sạc được giải phóng về AVAILABLE
    c = db_session.query(Connector).filter(Connector.id == connector.id).first()
    assert c.status == "AVAILABLE"


def test_simulator_rbac_and_idor_protection(client, db_session, sim_setup):
    """
    8. Phân quyền RBAC & Chống IDOR trên endpoint điều khiển Simulator:
    - Driver (CUSTOMER) bị từ chối 403 Forbidden.
    - Operator B can thiệp trạm của Operator A bị từ chối 403 Forbidden.
    - Operator A (sở hữu trạm) hoặc Admin được phép thao tác.
    """
    driver = sim_setup["driver"]
    connector = sim_setup["connector_a"]
    tokens = sim_setup["tokens"]

    session = start_charging_session(db_session, driver, connector.id)
    session_id = session.id

    # 1. Driver cố tình trigger sự cố -> 403 Forbidden
    res_driver = client.post(
        f"/api/v1/simulator/sessions/{session_id}/trigger-event",
        json={"event_type": "OVERHEAT"},
        headers={"Authorization": f"Bearer {tokens['driver']}"},
    )
    assert res_driver.status_code == 403

    # 2. Driver cố tình set-power-limit -> 403 Forbidden
    res_driver_pwr = client.put(
        f"/api/v1/simulator/sessions/{session_id}/set-power-limit",
        json={"power_limit_kw": 50.0},
        headers={"Authorization": f"Bearer {tokens['driver']}"},
    )
    assert res_driver_pwr.status_code == 403

    # 3. Operator B (không sở hữu trạm) cố tình can thiệp -> 403 Forbidden (IDOR)
    res_op_b = client.post(
        f"/api/v1/simulator/sessions/{session_id}/trigger-event",
        json={"event_type": "OVERHEAT"},
        headers={"Authorization": f"Bearer {tokens['op_b']}"},
    )
    assert res_op_b.status_code == 403

    # 4. Operator A (sở hữu trạm) can thiệp -> 200 OK
    res_op_a = client.put(
        f"/api/v1/simulator/sessions/{session_id}/set-power-limit",
        json={"power_limit_kw": 60.0},
        headers={"Authorization": f"Bearer {tokens['op_a']}"},
    )
    assert res_op_a.status_code == 200
    assert res_op_a.json()["new_power_limit_kw"] == 60.0

    # 5. Admin có toàn quyền -> 200 OK
    res_admin = client.post(
        f"/api/v1/simulator/sessions/{session_id}/trigger-event",
        json={"event_type": "OVERHEAT"},
        headers={"Authorization": f"Bearer {tokens['admin']}"},
    )
    assert res_admin.status_code == 200


def test_session_stop_automatically_takes_simulator_kwh(client, db_session, sim_setup):
    """
    9. Giải quyết Nợ kỹ thuật 1:
    Khi tài xế bấm dừng sạc qua API mà không truyền meter_stop_kwh,
    hệ thống tự động lấy chỉ số tích phân chuẩn xác từ Simulator trong RAM.
    """
    driver = sim_setup["driver"]
    connector = sim_setup["connector_a"]
    token = sim_setup["tokens"]["driver"]

    session = start_charging_session(db_session, driver, connector.id)
    sim = simulator_manager.get_simulator(session.id)
    assert sim is not None

    # Giả lập simulator đã sạc được 18.5 kWh
    sim.current_energy_kwh = Decimal("18.50")

    # Client gọi dừng sạc mà bỏ trống meter_stop_kwh (None)
    res_stop = client.post(
        f"/api/v1/sessions/{session.id}/stop",
        json={},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_stop.status_code == 200
    data = res_stop.json()
    assert Decimal(str(data["total_kwh"])) == Decimal("18.50")
    # Cước = 18.5 * 3000 = 55,500 VND
    assert Decimal(str(data["total_amount"])) == Decimal("55500.00")
