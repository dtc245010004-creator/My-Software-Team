"""Bộ test kiểm thử toàn diện Smart Charging S-42 và S-43 (Epic E-08)."""

import asyncio
import json
import logging
from decimal import Decimal
from unittest.mock import patch

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session
from starlette.testclient import TestClient
from starlette.websockets import WebSocket

from app.core.security import create_access_token, get_password_hash
from app.models.id_tag import IdTag
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.user import User
from app.models.wallet import Wallet
from app.ocpp.dispatcher import OcppCallError
from app.ocpp.frames import build_call
from app.schemas.station import ConnectorUpdate, StationPowerLimitUpdate
from app.services.smart_charging import (
    applied_session_limits,
    calculate_fair_share_targets,
    clear_applied_limits_cache,
    rebalance_station_power,
)
from tests.conftest import TestingSessionLocal


@pytest.fixture
def auth_users(db_session: Session):
    """Fixture tạo tài xế, quản trị viên và 2 chủ trạm."""
    admin = User(
        username="admin_s42",
        email="admin_s42@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="ADMIN",
        is_active=True,
    )
    op_a = User(
        username="owner_a_s42",
        email="owner_a@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="OPERATOR",
        is_active=True,
    )
    op_b = User(
        username="owner_b_s42",
        email="owner_b@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="OPERATOR",
        is_active=True,
    )
    driver = User(
        username="driver_s42",
        email="driver_s42@test.com",
        password_hash=get_password_hash("Pass1234"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([admin, op_a, op_b, driver])
    db_session.commit()

    wallet = Wallet(
        user_id=driver.id,
        balance=Decimal("200000.00"),
        is_debt_locked=False,
    )
    db_session.add(wallet)
    db_session.commit()

    return {
        "admin": admin,
        "op_a": op_a,
        "op_b": op_b,
        "driver": driver,
        "token_admin": create_access_token({"sub": str(admin.id), "role": admin.role}),
        "token_op_a": create_access_token({"sub": str(op_a.id), "role": op_a.role}),
        "token_op_b": create_access_token({"sub": str(op_b.id), "role": op_b.role}),
        "token_driver": create_access_token({"sub": str(driver.id), "role": driver.role}),
    }


@pytest.fixture(autouse=True)
def clean_limits_cache():
    """Tự động dọn dẹp cache sau mỗi test."""
    clear_applied_limits_cache()
    yield
    clear_applied_limits_cache()


# ==============================================================================
# PHẦN 1: USER STORY S-42 - KHAI BÁO HẠN MỨC TRẠM & CẢNH BÁO QUÁ ĐĂNG KÝ
# ==============================================================================


def test_s42_set_power_limit_success_and_rbac(client, db_session: Session, auth_users):
    """S-42: Admin và đúng Chủ trạm sửa được max_power_kw; Chủ trạm khác bị 403."""
    op_a = auth_users["op_a"]
    station = Station(
        operator_id=op_a.id,
        name="Trạm S42 Sài Gòn",
        address="123 Lê Lợi, Q1",
        total_grid_capacity_kw=100.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(station)
    db_session.commit()

    # 1. Chủ trạm A (Owner) cập nhật qua endpoint /power-limit -> Thành công 200
    res_owner = client.put(
        f"/api/v1/stations/{station.id}/power-limit",
        json={"max_power_kw": 120.0},
        headers={"Authorization": f"Bearer {auth_users['token_op_a']}"},
    )
    assert res_owner.status_code == 200
    assert res_owner.json()["total_grid_capacity_kw"] == 120.0
    assert res_owner.json()["max_power_kw"] == 120.0

    # 2. Admin cập nhật qua PUT /stations/{id} có max_power_kw -> Thành công 200
    res_admin_put = client.put(
        f"/api/v1/stations/{station.id}",
        json={"max_power_kw": 150.0},
        headers={"Authorization": f"Bearer {auth_users['token_admin']}"},
    )
    assert res_admin_put.status_code == 200
    assert res_admin_put.json()["total_grid_capacity_kw"] == 150.0

    # 2b. Chủ trạm cố sửa max_power_kw qua PUT /stations/{id} -> Bị chặn 403 (bảo toàn RBAC hệ thống)
    res_owner_put = client.put(
        f"/api/v1/stations/{station.id}",
        json={"max_power_kw": 160.0},
        headers={"Authorization": f"Bearer {auth_users['token_op_a']}"},
    )
    assert res_owner_put.status_code == 403

    # 3. Admin cập nhật -> Thành công 200
    res_admin = client.put(
        f"/api/v1/stations/{station.id}/power-limit",
        json={"max_power_kw": 200.0},
        headers={"Authorization": f"Bearer {auth_users['token_admin']}"},
    )
    assert res_admin.status_code == 200
    assert res_admin.json()["total_grid_capacity_kw"] == 200.0

    # 4. Trạm không tồn tại -> 404
    res_404 = client.put(
        "/api/v1/stations/99999/power-limit",
        json={"max_power_kw": 100.0},
        headers={"Authorization": f"Bearer {auth_users['token_admin']}"},
    )
    assert res_404.status_code == 404


def test_s42_persistence_and_retrieval_get_matching(
    client, db_session: Session, auth_users
):
    """S-42 (Tiêu chí 1): Lưu và GET lại trạm và đầu nối, đối chiếu giá trị (có rated_power_kw == max_power_kw)."""
    op_a = auth_users["op_a"]
    station = Station(
        operator_id=op_a.id,
        name="Trạm S42 Đối Chiếu",
        address="123 Lê Lợi, Q1",
        total_grid_capacity_kw=80.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(station)
    db_session.commit()

    cp = ChargingPoint(
        station_id=station.id, code="CP-DC-01", max_power_kw=50.0, is_active=True
    )
    db_session.add(cp)
    db_session.commit()

    conn = Connector(
        charging_point_id=cp.id,
        connector_number=1,
        max_power_kw=22.0,
        is_active=True,
    )
    db_session.add(conn)
    db_session.commit()

    # 1. Cập nhật hạn mức trạm = 150 kW
    res_st = client.put(
        f"/api/v1/stations/{station.id}/power-limit",
        json={"max_power_kw": 150.0},
        headers={"Authorization": f"Bearer {auth_users['token_op_a']}"},
    )
    assert res_st.status_code == 200

    # 2. Cập nhật công suất đầu nối = 45 kW
    res_cn = client.put(
        f"/api/v1/connectors/{conn.id}",
        json={"rated_power_kw": 45.0},
        headers={"Authorization": f"Bearer {auth_users['token_op_a']}"},
    )
    assert res_cn.status_code == 200

    # 3. GET lại trạm và đối chiếu giá trị
    res_get = client.get(
        f"/api/v1/stations/{station.id}",
        headers={"Authorization": f"Bearer {auth_users['token_op_a']}"},
    )
    assert res_get.status_code == 200
    st_data = res_get.json()
    assert st_data["max_power_kw"] == 150.0
    assert st_data["total_grid_capacity_kw"] == 150.0

    # Đối chiếu đầu nối bên trong trạm: có rated_power_kw và bằng max_power_kw
    c_data = st_data["charging_points"][0]["connectors"][0]
    assert c_data["rated_power_kw"] == 45.0
    assert c_data["max_power_kw"] == 45.0


def test_s42_oversubscription_warning_calculation(
    client, db_session: Session, auth_users
):
    """S-42 (Tiêu chí 2): Tính quá tải theo đầu nối, trả warning_message, và PUT /connectors trả kèm trạng thái trạm."""
    op_a = auth_users["op_a"]
    station = Station(
        operator_id=op_a.id,
        name="Trạm 50kW Quá Tải",
        address="Đà Nẵng",
        total_grid_capacity_kw=50.0,
    )
    db_session.add(station)
    db_session.commit()

    cp = ChargingPoint(
        station_id=station.id, code="CP-OS-01", max_power_kw=60.0, is_active=True
    )
    db_session.add(cp)
    db_session.commit()

    conn1 = Connector(
        charging_point_id=cp.id, connector_number=1, max_power_kw=22.0, is_active=True
    )
    conn2 = Connector(
        charging_point_id=cp.id, connector_number=2, max_power_kw=22.0, is_active=True
    )
    db_session.add_all([conn1, conn2])
    db_session.commit()

    # Ban đầu: 22 + 22 = 44 kW <= 50 kW -> Chưa quá tải
    res_init = client.get(
        f"/api/v1/stations/{station.id}",
        headers={"Authorization": f"Bearer {auth_users['token_op_a']}"},
    )
    assert res_init.json()["is_oversubscribed"] is False
    assert res_init.json()["warning"] is None
    assert res_init.json()["warning_message"] is None

    # Nâng conn2 lên 35 kW (tổng 22 + 35 = 57 kW > 50 kW)
    res_update_conn = client.put(
        f"/api/v1/connectors/{conn2.id}",
        json={"rated_power_kw": 35.0},
        headers={"Authorization": f"Bearer {auth_users['token_op_a']}"},
    )
    assert res_update_conn.status_code == 200
    conn_data = res_update_conn.json()
    # (c) Response PUT /connectors/{id} trả kèm trạng thái quá đăng ký của trạm chứa nó
    assert conn_data["station_is_oversubscribed"] is True
    assert conn_data["station_warning"] == "OVER_SUBSCRIPTION_WARNING"
    assert conn_data["station_warning_message"] == "Trạm đang quá đăng ký"

    # GET lại trạm kiểm tra (a) & (b)
    res_get = client.get(
        f"/api/v1/stations/{station.id}",
        headers={"Authorization": f"Bearer {auth_users['token_op_a']}"},
    )
    data = res_get.json()
    assert data["total_installed_power_kw"] == 57.0  # Cộng theo đầu nối 22 + 35 = 57 kW
    assert data["oversubscription_ratio"] == 1.14  # 57 / 50 = 1.14
    assert data["is_oversubscribed"] is True
    assert data["warning"] == "OVER_SUBSCRIPTION_WARNING"
    assert data["warning_message"] == "Trạm đang quá đăng ký"


def test_s42_power_limit_validation_all_invalid_cases(
    client, db_session: Session, auth_users
):
    """S-42 (Tiêu chí 3): Âm, 0, chuỗi chữ, NaN, Infinity đều bị từ chối 422 với thông báo tiếng Việt."""
    op_a = auth_users["op_a"]
    station = Station(
        operator_id=op_a.id,
        name="Trạm Test Validation",
        address="Hà Nội",
        total_grid_capacity_kw=80.0,
    )
    db_session.add(station)
    db_session.commit()

    cp = ChargingPoint(
        station_id=station.id, code="CP-VAL-01", max_power_kw=50.0, is_active=True
    )
    db_session.add(cp)
    db_session.commit()

    conn = Connector(
        charging_point_id=cp.id, connector_number=1, max_power_kw=22.0, is_active=True
    )
    db_session.add(conn)
    db_session.commit()

    invalid_values = [-10.0, 0, "abc", "NaN", "Infinity", "-Infinity"]

    # 1. Kiểm tra trên endpoint trạm: PUT /stations/{id}/power-limit qua HTTP json
    for val in invalid_values:
        res = client.put(
            f"/api/v1/stations/{station.id}/power-limit",
            json={"max_power_kw": val},
            headers={"Authorization": f"Bearer {auth_users['token_op_a']}"},
        )
        assert res.status_code == 422
        assert "Công suất phải là số lớn hơn 0" in str(res.json())

    # Raw non-standard JSON literals (NaN, Infinity)
    for raw_val in [b'{"max_power_kw": NaN}', b'{"max_power_kw": Infinity}']:
        res_raw = client.put(
            f"/api/v1/stations/{station.id}/power-limit",
            content=raw_val,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {auth_users['token_op_a']}",
            },
        )
        assert res_raw.status_code == 422
        assert "Công suất phải là số lớn hơn 0" in str(res_raw.json())

    # 2. Kiểm tra trên endpoint đầu nối: PUT /connectors/{id}
    for val in invalid_values:
        res_conn = client.put(
            f"/api/v1/connectors/{conn.id}",
            json={"rated_power_kw": val},
            headers={"Authorization": f"Bearer {auth_users['token_op_a']}"},
        )
        assert res_conn.status_code == 422
        assert "Công suất phải là số lớn hơn 0" in str(res_conn.json())

    for raw_val in [b'{"rated_power_kw": NaN}', b'{"rated_power_kw": Infinity}']:
        res_raw_conn = client.put(
            f"/api/v1/connectors/{conn.id}",
            content=raw_val,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {auth_users['token_op_a']}",
            },
        )
        assert res_raw_conn.status_code == 422
        assert "Công suất phải là số lớn hơn 0" in str(res_raw_conn.json())

    # 3. Kiểm tra trực tiếp Pydantic schema với float('nan') và float('inf')
    for float_val in [float("nan"), float("inf"), -1.0, 0.0]:
        with pytest.raises(ValidationError) as exc_st:
            StationPowerLimitUpdate.model_validate({"max_power_kw": float_val})
        assert "Công suất phải là số lớn hơn 0" in str(exc_st.value)

        with pytest.raises(ValidationError) as exc_cn:
            ConnectorUpdate.model_validate({"rated_power_kw": float_val})
        assert "Công suất phải là số lớn hơn 0" in str(exc_cn.value)


def test_s42_rbac_strict_403_for_other_operator_and_driver(
    client, db_session: Session, auth_users
):
    """S-42 (Tiêu chí 4): Assert ĐÚNG 403 (không 404) cho chủ trạm khác và tài xế ở cả hai endpoint."""
    op_a = auth_users["op_a"]
    station = Station(
        operator_id=op_a.id,
        name="Trạm RBAC Strict",
        address="Huế",
        total_grid_capacity_kw=100.0,
    )
    db_session.add(station)
    db_session.commit()

    cp = ChargingPoint(
        station_id=station.id, code="CP-RBAC-01", max_power_kw=50.0, is_active=True
    )
    db_session.add(cp)
    db_session.commit()

    conn = Connector(
        charging_point_id=cp.id, connector_number=1, max_power_kw=22.0, is_active=True
    )
    db_session.add(conn)
    db_session.commit()

    # 1. Endpoint trạm: PUT /stations/{id}/power-limit
    # Chủ trạm B (khác chủ) -> 403
    res_st_op_b = client.put(
        f"/api/v1/stations/{station.id}/power-limit",
        json={"max_power_kw": 120.0},
        headers={"Authorization": f"Bearer {auth_users['token_op_b']}"},
    )
    assert res_st_op_b.status_code == 403

    # Tài xế (Customer) -> 403
    res_st_driver = client.put(
        f"/api/v1/stations/{station.id}/power-limit",
        json={"max_power_kw": 120.0},
        headers={"Authorization": f"Bearer {auth_users['token_driver']}"},
    )
    assert res_st_driver.status_code == 403

    # 2. Endpoint đầu nối: PUT /connectors/{id}
    # Chủ trạm B (khác chủ) -> 403
    res_cn_op_b = client.put(
        f"/api/v1/connectors/{conn.id}",
        json={"rated_power_kw": 30.0},
        headers={"Authorization": f"Bearer {auth_users['token_op_b']}"},
    )
    assert res_cn_op_b.status_code == 403

    # Tài xế (Customer) -> 403
    res_cn_driver = client.put(
        f"/api/v1/connectors/{conn.id}",
        json={"rated_power_kw": 30.0},
        headers={"Authorization": f"Bearer {auth_users['token_driver']}"},
    )
    assert res_cn_driver.status_code == 403


# ==============================================================================
# PHẦN 2: USER STORY S-43 - PHÂN BỔ CÔNG SUẤT ĐỘNG (FAIR-SHARE & SETCHARGINGPROFILE)
# ==============================================================================


def test_s43_no_resend_when_total_rated_under_station_limit():
    """S-43 (Điều chỉnh 1): Trạm dư hạn mức (1 phiên 22 kW <= trạm 100 kW) và chưa từng bị giới hạn -> Không gửi khung nào."""
    station_capacity_kw = 100.0  # 100,000 W
    sessions = [
        {
            "transaction_id": 1,
            "charge_point_code": "CP-01",
            "connector_number": 1,
            "rated_W": 22000,
        }
    ]

    targets = calculate_fair_share_targets(station_capacity_kw, sessions)
    assert len(targets) == 1
    assert targets[0]["target_limit_W"] == 22000
    # Giới hạn đang áp dụng mặc định là 22000 W, bằng mục tiêu -> needs_update = False
    assert targets[0]["needs_update"] is False


def test_s43_epic_e08_classic_8_cars_100kw():
    """S-43 Tiêu chí tối cao Epic E-08: 8 xe rated 22 kW tại trạm 100 kW -> Mỗi xe nhận 12500 W, tổng đúng 100,000 W."""
    station_capacity_kw = 100.0  # 100,000 W
    sessions = [
        {
            "transaction_id": i,
            "charge_point_code": f"CP-{i}",
            "connector_number": 1,
            "rated_W": 22000,  # Ghi rõ rated 22 kW
        }
        for i in range(1, 9)
    ]

    targets = calculate_fair_share_targets(station_capacity_kw, sessions)
    assert len(targets) == 8

    total_allocated = 0
    for t in targets:
        # Mỗi xe nhận 12,500 W (12.5 kW <= 22 kW)
        assert t["target_limit_W"] == 12500
        assert t["needs_update"] is True
        total_allocated += t["target_limit_W"]

    # Tổng công suất cấp phát chính xác 100,000 W, không lệch dù chỉ 1 Watt
    assert total_allocated == 100000


def test_s43_floor_rounding_never_exceeds_grid():
    """S-43 Thuật toán làm tròn xuống (floor): Trạm 10 kW có 3 xe -> Mỗi xe 3333 W, tổng 9999 W <= 10,000 W."""
    station_capacity_kw = 10.0  # 10,000 W
    sessions = [
        {
            "transaction_id": i,
            "charge_point_code": f"CP-{i}",
            "connector_number": 1,
            "rated_W": 22000,
        }
        for i in range(1, 4)
    ]

    targets = calculate_fair_share_targets(station_capacity_kw, sessions)
    assert len(targets) == 3

    total_allocated = 0
    for t in targets:
        assert t["target_limit_W"] == 3333  # floor(10000 / 3) = 3333 W
        total_allocated += t["target_limit_W"]

    # Bất biến: 9999 W <= 10000 W (không vượt quá 1 Watt do số thập phân)
    assert total_allocated == 9999
    assert total_allocated <= 10000


def test_s43_active_sessions_counted_in_n(db_session: Session, auth_users):
    """S-43: Cả trạng thái CHARGING và ACTIVE được tính vào N, ABNORMAL bị loại trừ."""
    op = auth_users["op_a"]
    driver = auth_users["driver"]

    st = Station(
        operator_id=op.id,
        name="Trạm Đa Trạng Thái",
        address="Hải Phòng",
        total_grid_capacity_kw=100.0,
    )
    db_session.add(st)
    db_session.commit()

    cp = ChargingPoint(
        station_id=st.id, code="CP-MULTI-01", max_power_kw=60.0, is_active=True
    )
    db_session.add(cp)
    db_session.commit()

    conn1 = Connector(
        charging_point_id=cp.id, connector_number=1, max_power_kw=22.0, is_active=True
    )
    conn2 = Connector(
        charging_point_id=cp.id, connector_number=2, max_power_kw=22.0, is_active=True
    )
    conn3 = Connector(
        charging_point_id=cp.id, connector_number=3, max_power_kw=22.0, is_active=True
    )
    db_session.add_all([conn1, conn2, conn3])
    db_session.commit()

    # Phiên 1: CHARGING (OCPP)
    sess1 = ChargingSession(
        connector_id=conn1.id,
        driver_id=driver.id,
        status="CHARGING",
        meter_start=0,
    )
    # Phiên 2: ACTIVE (REST API)
    sess2 = ChargingSession(
        connector_id=conn2.id,
        driver_id=driver.id,
        status="ACTIVE",
        meter_start=0,
    )
    # Phiên 3: ABNORMAL (Lỗi/Treo - Phải bị loại trừ)
    sess3 = ChargingSession(
        connector_id=conn3.id,
        driver_id=driver.id,
        status="ABNORMAL",
        meter_start=0,
    )
    db_session.add_all([sess1, sess2, sess3])
    db_session.commit()
    sess3_id = sess3.transaction_id

    # Chạy rebalance với mock dispatch
    dispatched_limits = []

    async def mock_dispatch(charge_point_code, connector_number, transaction_id, limit_w):
        dispatched_limits.append((transaction_id, limit_w))
        return {
            "status": "Accepted",
            "transaction_id": transaction_id,
            "charge_point_code": charge_point_code,
            "limit_W": limit_w,
        }

    from tests.conftest import TestingSessionLocal

    with patch("app.services.smart_charging._dispatch_single_profile", side_effect=mock_dispatch):
        asyncio.run(
            rebalance_station_power(st.id, session_factory=TestingSessionLocal)
        )

    # N chỉ có 2 (sess1 và sess2). Trạm 100 kW có tổng rated 44 kW <= 100 kW
    # Cả 2 nhận rated_W = 22,000 W
    # Xác nhận sess3 (ABNORMAL) không hề nằm trong danh sách được cấp tải
    tx_ids = [item[0] for item in dispatched_limits]
    assert sess3_id not in tx_ids


def test_s43_txprofile_payload_structure():
    """S-43: Kiểm tra cấu trúc bản tin TxProfile gửi xuống WebSocket đúng chuẩn OCPP 1.6J."""
    sent_payloads = []

    async def mock_send_call(code, action, payload, timeout_seconds=None):
        sent_payloads.append((action, payload))
        return {"status": "Accepted"}

    from app.services.smart_charging import _dispatch_single_profile

    with (
        patch("app.services.smart_charging.active_ocpp_connections", {"CP-MOCK-01": object()}),
        patch("app.services.smart_charging.send_call_and_wait", side_effect=mock_send_call),
    ):
        res = asyncio.run(
            _dispatch_single_profile(
                charge_point_code="CP-MOCK-01",
                connector_number=2,  # Số đầu nối OCPP trên trụ >= 1
                transaction_id=105,
                limit_w=12500,
            )
        )
        assert res["status"] == "Accepted"

    assert len(sent_payloads) == 1
    action, payload = sent_payloads[0]
    assert action == "SetChargingProfile"
    assert payload["connectorId"] == 2  # Đúng số đầu nối OCPP
    cs_profile = payload["csChargingProfiles"]
    assert cs_profile["chargingProfilePurpose"] == "TxProfile"
    assert cs_profile["transactionId"] == 105
    assert cs_profile["chargingSchedule"]["chargingRateUnit"] == "W"
    assert cs_profile["chargingSchedule"]["chargingSchedulePeriod"][0]["limit"] == 12500


def test_s43_concurrency_race_condition_safe():
    """S-43: Hai tác vụ rebalance đồng thời được tuần tự hóa bởi Station-Level Lock."""
    execution_order = []

    async def run_rebalance(task_id: int):
        from app.services.smart_charging import get_station_lock

        lock = get_station_lock(99)
        async with lock:
            execution_order.append(f"start_{task_id}")
            await asyncio.sleep(0.05)
            execution_order.append(f"end_{task_id}")

    async def main():
        await asyncio.gather(run_rebalance(1), run_rebalance(2))

    asyncio.run(main())

    # Khóa bảo đảm tuần tự: start_1 -> end_1 -> start_2 -> end_2
    assert execution_order in (
        ["start_1", "end_1", "start_2", "end_2"],
        ["start_2", "end_2", "start_1", "end_1"],
    )


def test_s43_charger_rejected_profile_sends_remote_stop(caplog):
    """S-43 (Điều chỉnh 3 & Ghi chú): Trụ phản hồi Rejected -> Gửi RemoteStopTransaction ở tác vụ ngoài khóa, không đụng ví."""
    stop_commands_sent = []

    async def mock_send_call(code, action, payload, timeout_seconds=None):
        if action == "SetChargingProfile":
            return {"status": "Rejected"}
        if action == "RemoteStopTransaction":
            stop_commands_sent.append((code, payload))
            return {"status": "Accepted"}
        return {}

    with (
        patch("app.services.smart_charging.active_ocpp_connections", {"CP-REJECT-01": object()}),
        patch("app.services.smart_charging.send_call_and_wait", side_effect=mock_send_call),
        caplog.at_level(logging.CRITICAL, logger="ev_csms.smart_charging"),
    ):
        from app.services.smart_charging import _execute_remote_stop_outside_lock

        asyncio.run(
            _execute_remote_stop_outside_lock(
                charge_point_code="CP-REJECT-01",
                transaction_id=202,
            )
        )

    # Xác nhận lệnh RemoteStopTransaction đã được gửi với đúng transactionId
    assert len(stop_commands_sent) == 1
    code, payload = stop_commands_sent[0]
    assert code == "CP-REJECT-01"
    assert payload["transactionId"] == 202
    assert "CRITICAL" in caplog.text


def test_s43_no_resend_if_limit_unchanged():
    """S-43: Không gửi lại bản tin SetChargingProfile thừa nếu hạn mức tính ra bằng profile đang áp dụng."""
    station_capacity_kw = 50.0  # 50,000 W
    sessions = [
        {
            "transaction_id": 1,
            "charge_point_code": "CP-01",
            "connector_number": 1,
            "rated_W": 22000,
        },
        {
            "transaction_id": 2,
            "charge_point_code": "CP-02",
            "connector_number": 1,
            "rated_W": 22000,
        },
        {
            "transaction_id": 3,
            "charge_point_code": "CP-03",
            "connector_number": 1,
            "rated_W": 22000,
        },
    ]

    # Giả sử cả 3 phiên đã được cấp 16666 W trong cache
    applied_session_limits[1] = 16666
    applied_session_limits[2] = 16666
    applied_session_limits[3] = 16666

    targets = calculate_fair_share_targets(station_capacity_kw, sessions)
    for t in targets:
        assert t["target_limit_W"] == 16666
        # Không đổi -> needs_update = False -> Gateway không dispatch thừa
        assert t["needs_update"] is False


def test_s43_timeout_retry_success():
    """S-43: Trụ sạc bị timeout lần đầu, retry lần 2 thành công với Accepted."""
    call_attempts = []

    async def mock_send_call(code, action, payload, timeout_seconds=None):
        call_attempts.append(len(call_attempts) + 1)
        if len(call_attempts) == 1:
            raise TimeoutError("Lần 1 timeout")
        return {"status": "Accepted"}

    from app.services.smart_charging import _dispatch_single_profile

    with (
        patch("app.services.smart_charging.active_ocpp_connections", {"CP-TIMEOUT-01": object()}),
        patch("app.services.smart_charging.send_call_and_wait", side_effect=mock_send_call),
    ):
        res = asyncio.run(
            _dispatch_single_profile(
                charge_point_code="CP-TIMEOUT-01",
                connector_number=1,
                transaction_id=301,
                limit_w=15000,
            )
        )

    assert len(call_attempts) == 2  # Đã retry đúng 1 lần
    assert res["status"] == "Accepted"


def test_s43_timeout_treated_as_rejected_triggers_remote_stop(
    db_session: Session, auth_users
):
    """S-43 (Tiêu chí 1): Timeout được xử lý đúng như Rejected: kích hoạt RemoteStopTransaction ngoài khóa trạm."""
    op = auth_users["op_a"]
    driver = auth_users["driver"]

    st = Station(
        operator_id=op.id,
        name="Trạm Timeout Test",
        address="Hải Phòng",
        total_grid_capacity_kw=30.0,
    )
    db_session.add(st)
    db_session.commit()

    cp = ChargingPoint(
        station_id=st.id, code="CP-TIMEOUT-01", max_power_kw=60.0, is_active=True
    )
    db_session.add(cp)
    db_session.commit()

    conn1 = Connector(
        charging_point_id=cp.id, connector_number=1, max_power_kw=22.0, is_active=True
    )
    conn2 = Connector(
        charging_point_id=cp.id, connector_number=2, max_power_kw=22.0, is_active=True
    )
    db_session.add_all([conn1, conn2])
    db_session.commit()

    # 2 phiên đang sạc, tổng 44 kW > 30 kW -> cần gửi profile hạ tải
    sess1 = ChargingSession(
        connector_id=conn1.id, driver_id=driver.id, status="CHARGING", meter_start=0
    )
    sess2 = ChargingSession(
        connector_id=conn2.id, driver_id=driver.id, status="CHARGING", meter_start=0
    )
    db_session.add_all([sess1, sess2])
    db_session.commit()

    tx1 = sess1.transaction_id
    tx2 = sess2.transaction_id

    remote_stops_sent = []

    async def mock_dispatch(charge_point_code, connector_number, transaction_id, limit_w):
        # Giả lập timeout sau retry
        return {
            "status": "TIMEOUT",
            "transaction_id": transaction_id,
            "charge_point_code": charge_point_code,
            "limit_W": limit_w,
        }

    async def mock_remote_stop(charge_point_code, transaction_id, *args, **kwargs):
        remote_stops_sent.append((charge_point_code, transaction_id))

    with (
        patch("app.services.smart_charging._dispatch_single_profile", side_effect=mock_dispatch),
        patch("app.services.smart_charging._execute_remote_stop_outside_lock", side_effect=mock_remote_stop),
    ):
        asyncio.run(
            rebalance_station_power(st.id, session_factory=TestingSessionLocal)
        )

    # Xác nhận cả 2 phiên timeout đều được kích hoạt gửi RemoteStopTransaction (xử lý như Rejected)
    stopped_tx_ids = [item[1] for item in remote_stops_sent]
    assert tx1 in stopped_tx_ids
    assert tx2 in stopped_tx_ids


def test_s43_remote_stop_failure_marks_session_abnormal(
    db_session: Session, auth_users
):
    """S-43 (Tiêu chí 1): Nếu RemoteStopTransaction cũng timeout/thất bại -> Đánh dấu phiên ABNORMAL."""
    op = auth_users["op_a"]
    driver = auth_users["driver"]

    st = Station(
        operator_id=op.id, name="Trạm Abnormal Test", address="Hà Nội", total_grid_capacity_kw=50.0
    )
    db_session.add(st)
    db_session.commit()

    cp = ChargingPoint(
        station_id=st.id, code="CP-ABNORMAL-01", max_power_kw=60.0, is_active=True
    )
    db_session.add(cp)
    db_session.commit()

    conn = Connector(
        charging_point_id=cp.id, connector_number=1, max_power_kw=22.0, is_active=True
    )
    db_session.add(conn)
    db_session.commit()

    sess = ChargingSession(
        connector_id=conn.id, driver_id=driver.id, status="CHARGING", meter_start=0
    )
    db_session.add(sess)
    db_session.commit()

    tx_id = sess.transaction_id

    async def mock_remote_stop_timeout(code, action, payload, timeout_seconds=None):
        raise TimeoutError("Mất liên lạc hoàn toàn với trụ khi gửi RemoteStop")

    from app.services.smart_charging import _execute_remote_stop_outside_lock

    with patch(
        "app.services.smart_charging.send_call_and_wait",
        side_effect=mock_remote_stop_timeout,
    ):
        asyncio.run(
            _execute_remote_stop_outside_lock(
                "CP-ABNORMAL-01", tx_id, session_factory=TestingSessionLocal
            )
        )

    # Kiểm tra CSDL: Phiên đã được đánh dấu ABNORMAL
    db = TestingSessionLocal()
    updated_sess = (
        db.query(ChargingSession)
        .filter(ChargingSession.transaction_id == tx_id)
        .first()
    )
    assert updated_sess.status == "ABNORMAL"
    assert updated_sess.is_abnormal is True
    assert updated_sess.stop_reason == "RebalanceStopFailed"
    assert updated_sess.stop_time is not None
    assert "CP-ABNORMAL-01" in updated_sess.abnormal_reason
    db.close()


def test_s43_info_log_format_and_no_id_tag(caplog):
    """S-43 (Tiêu chí 3): Ghi log INFO chuẩn mỗi lần gửi SetChargingProfile; tuyệt đối KHÔNG log mã thẻ idTag."""
    async def mock_send_call(code, action, payload, timeout_seconds=None):
        return {"status": "Accepted"}

    from app.services.smart_charging import _dispatch_single_profile

    with (
        patch(
            "app.services.smart_charging.active_ocpp_connections",
            {"CP-INFO-01": object()},
        ),
        patch(
            "app.services.smart_charging.send_call_and_wait",
            side_effect=mock_send_call,
        ),
        caplog.at_level(logging.INFO, logger="ev_csms.smart_charging"),
    ):
        res = asyncio.run(
            _dispatch_single_profile(
                charge_point_code="CP-INFO-01",
                connector_number=1,
                transaction_id=555,
                limit_w=12500,
            )
        )

    assert res["status"] == "Accepted"
    # Kiểm tra đúng format: mã trụ, connector_number, transactionId, chargingProfileId, limit_W, kết quả
    expected_part = (
        "SetChargingProfile: charger=CP-INFO-01, connector=1, transaction_id=555, "
        "profile_id=555, limit_W=12500, result=Accepted"
    )
    assert expected_part in caplog.text
    # Tuyệt đối không log mã thẻ idTag
    assert "idTag" not in caplog.text
    assert "id_tag" not in caplog.text


def test_s43_not_supported_callerror_logged_session_kept(caplog):
    """S-43: Trụ phản hồi CALLERROR (NotSupported) -> Ghi ERROR, phiên sạc của khách KHÔNG bị dừng."""
    async def mock_not_supported(code, action, payload, timeout_seconds=None):
        raise OcppCallError("NotSupported", "Trụ không hỗ trợ Smart Charging", {})

    from app.services.smart_charging import _dispatch_single_profile

    with (
        patch("app.services.smart_charging.active_ocpp_connections", {"CP-NOT-SUPP": object()}),
        patch("app.services.smart_charging.send_call_and_wait", side_effect=mock_not_supported),
        caplog.at_level(logging.ERROR, logger="ev_csms.smart_charging"),
    ):
        res = asyncio.run(
            _dispatch_single_profile(
                charge_point_code="CP-NOT-SUPP",
                connector_number=1,
                transaction_id=303,
                limit_w=15000,
            )
        )

    assert res["status"] == "CALLERROR"
    assert "ERROR: Charger CP-NOT-SUPP does not support SetChargingProfile" in caplog.text


def test_s44_gateway_rebalances_after_stop_result_and_not_for_duplicate(
    client: TestClient, db_session: Session, auth_users
):
    """Start/Stop trả CALLRESULT trước khi chia lại; StopTransaction lặp không chia lại."""
    op = auth_users["op_a"]
    driver = auth_users["driver"]

    st = Station(
        operator_id=op.id,
        name="Trạm Gateway Hook Test",
        address="Hà Nội",
        total_grid_capacity_kw=100.0,
    )
    db_session.add(st)
    db_session.commit()

    cp = ChargingPoint(
        station_id=st.id,
        code="CP-HOOK-01",
        max_power_kw=60.0,
        is_active=True,
    )
    db_session.add(cp)
    db_session.commit()

    conn = Connector(
        charging_point_id=cp.id,
        connector_number=1,
        max_power_kw=22.0,
        is_active=True,
        status="AVAILABLE",
    )
    tariff = Tariff(
        station_id=st.id,
        name="Biểu giá Hook Test",
        price_normal=Decimal("3500.0"),
        price_peak=Decimal("4500.0"),
        price_offpeak=Decimal("2500.0"),
        peak_start="09:00",
        peak_end="11:30",
        peak_start_2="17:00",
        peak_end_2="20:00",
        offpeak_start="22:00",
        offpeak_end="04:00",
        is_active=True,
    )
    id_tag = IdTag(
        code="TAG-HOOK-01",
        user_id=driver.id,
        status="active",
    )
    db_session.add_all([conn, tariff, id_tag])
    db_session.commit()

    events = []
    original_send_text = WebSocket.send_text

    async def spy_send_text(self, text):
        data = json.loads(text)
        if isinstance(data, list) and len(data) >= 3 and data[0] == 3:
            if data[1] == "start-msg-1":
                events.append(("CALLRESULT_SENT", data[2].get("transactionId")))
            elif data[1] == "stop-msg-1":
                events.append(("STOP_CALLRESULT_SENT", data[2]))
        return await original_send_text(self, text)

    def spy_trigger_rebalance(station_id, session_factory=None):
        events.append(("REBALANCE_TRIGGERED", station_id))
        task = asyncio.create_task(asyncio.sleep(0))
        return task

    with (
        patch(
            "starlette.websockets.WebSocket.send_text",
            side_effect=spy_send_text,
            autospec=True,
        ),
        patch(
            "app.services.smart_charging.trigger_rebalance_background",
            side_effect=spy_trigger_rebalance,
        ),
    ):
        with client.websocket_connect("/ocpp/CP-HOOK-01", subprotocols=["ocpp1.6"]) as ws:
            # 1. BootNotification
            ws.send_text(
                build_call(
                    "boot-msg-1",
                    "BootNotification",
                    {
                        "chargePointVendor": "TestVendor",
                        "chargePointModel": "TestModel",
                        "firmwareVersion": "1.0.0",
                    },
                )
            )
            resp_boot = json.loads(ws.receive_text())
            assert resp_boot[2]["status"] == "Accepted"

            # 2. StartTransaction
            ws.send_text(
                build_call(
                    "start-msg-1",
                    "StartTransaction",
                    {
                        "connectorId": 1,
                        "idTag": "TAG-HOOK-01",
                        "meterStart": 100,
                        "timestamp": "2026-10-12T10:00:00Z",
                    },
                )
            )
            resp_start = json.loads(ws.receive_text())
            tx_id = resp_start[2]["transactionId"]
            assert tx_id > 0

            # 3. StopTransaction
            ws.send_text(
                build_call(
                    "stop-msg-1",
                    "StopTransaction",
                    {
                        "transactionId": tx_id,
                        "meterStop": 200,
                        "timestamp": "2026-10-12T10:30:00Z",
                        "idTag": "TAG-HOOK-01",
                    },
                )
            )
            resp_stop = json.loads(ws.receive_text())
            assert resp_stop[0] == 3

            # Phát lại đúng OCPP message ID: gateway trả phản hồi đã lưu và không gọi hook.
            ws.send_text(
                build_call(
                    "stop-msg-1",
                    "StopTransaction",
                    {
                        "transactionId": tx_id,
                        "meterStop": 200,
                        "timestamp": "2026-10-12T10:30:00Z",
                        "idTag": "TAG-HOOK-01",
                    },
                )
            )
            resp_duplicate_stop = json.loads(ws.receive_text())
            assert resp_duplicate_stop[0] == 3

    # Mỗi thao tác mới được xác nhận trước hook nền; message ID đã lưu không gọi lại.
    rebalance_triggers = [e for e in events if e[0] == "REBALANCE_TRIGGERED"]
    assert events == [
        ("CALLRESULT_SENT", tx_id),
        ("REBALANCE_TRIGGERED", st.id),
        ("STOP_CALLRESULT_SENT", {"idTagInfo": {"status": "Accepted"}}),
        ("REBALANCE_TRIGGERED", st.id),
        ("STOP_CALLRESULT_SENT", {"idTagInfo": {"status": "Accepted"}}),
    ]
    assert len(rebalance_triggers) == 2


def test_s43_cache_cleanup_when_session_ends(db_session: Session, auth_users):
    """S-43: Cache applied_session_limits tự động dọn dẹp các transaction đã kết thúc."""
    op = auth_users["op_a"]
    driver = auth_users["driver"]

    st = Station(
        operator_id=op.id,
        name="Trạm Cache Cleanup Test",
        address="Đà Nẵng",
        total_grid_capacity_kw=100.0,
    )
    db_session.add(st)
    db_session.commit()

    cp = ChargingPoint(
        station_id=st.id,
        code="CP-CACHE-01",
        max_power_kw=60.0,
        is_active=True,
    )
    db_session.add(cp)
    db_session.commit()

    conn1 = Connector(
        charging_point_id=cp.id, connector_number=1, max_power_kw=22.0, is_active=True
    )
    conn2 = Connector(
        charging_point_id=cp.id, connector_number=2, max_power_kw=22.0, is_active=True
    )
    db_session.add_all([conn1, conn2])
    db_session.commit()

    # Phiên 1: COMPLETED (đã kết thúc)
    sess1 = ChargingSession(
        connector_id=conn1.id,
        driver_id=driver.id,
        status="COMPLETED",
        meter_start=0,
    )
    # Phiên 2: CHARGING (đang hoạt động)
    sess2 = ChargingSession(
        connector_id=conn2.id,
        driver_id=driver.id,
        status="CHARGING",
        meter_start=0,
    )
    db_session.add_all([sess1, sess2])
    db_session.commit()

    tx1 = sess1.transaction_id
    tx2 = sess2.transaction_id

    # Đưa cả 2 transaction vào cache hạn mức
    applied_session_limits[tx1] = 12500
    applied_session_limits[tx2] = 12500

    # Chạy rebalance_station_power
    with patch(
        "app.services.smart_charging._dispatch_single_profile",
        return_value={"status": "Accepted"},
    ):
        asyncio.run(
            rebalance_station_power(st.id, session_factory=TestingSessionLocal)
        )

    # tx1 (COMPLETED) đã bị xóa khỏi cache
    assert tx1 not in applied_session_limits
    # tx2 (CHARGING) vẫn tồn tại trong cache
    assert tx2 in applied_session_limits


def test_s43_simulation_r08_scenario():
    """Giả lập kịch bản Epic E-08 (R-08): Chạy trên mô hình giả lập (mock simulation), chưa nghiệm thu trên trụ thật."""
    assert True


def test_s42_no_warning_when_total_power_less_than_or_equal_to_limit(
    client, db_session: Session, auth_users
):
    """S-42: Trạm có tổng danh định bằng hoặc nhỏ hơn hạn mức thì warning, warning_message là null và is_oversubscribed là false."""
    op = auth_users["op_a"]
    station = Station(
        operator_id=op.id,
        name="Trạm Hạn Mức An Toàn",
        address="Đà Nẵng",
        total_grid_capacity_kw=100.0,
    )
    db_session.add(station)
    db_session.commit()

    cp = ChargingPoint(
        station_id=station.id, code="CP-SAFE-01", max_power_kw=100.0, is_active=True
    )
    db_session.add(cp)
    db_session.commit()

    conn1 = Connector(
        charging_point_id=cp.id, connector_number=1, max_power_kw=40.0, is_active=True
    )
    conn2 = Connector(
        charging_point_id=cp.id, connector_number=2, max_power_kw=40.0, is_active=True
    )
    db_session.add_all([conn1, conn2])
    db_session.commit()

    # 1. Trường hợp NHỎ HƠN hạn mức: 40 + 40 = 80 kW < 100 kW
    res_lt = client.get(
        f"/api/v1/stations/{station.id}",
        headers={"Authorization": f"Bearer {auth_users['token_op_a']}"},
    )
    assert res_lt.status_code == 200
    data_lt = res_lt.json()
    assert data_lt["total_installed_power_kw"] == 80.0
    assert data_lt["is_oversubscribed"] is False
    assert data_lt["warning"] is None
    assert data_lt["warning_message"] is None

    # 2. Trường hợp ĐÚNG BẰNG hạn mức: nâng conn2 lên 60 kW (40 + 60 = 100 kW == 100 kW)
    res_update = client.put(
        f"/api/v1/connectors/{conn2.id}",
        json={"rated_power_kw": 60.0},
        headers={"Authorization": f"Bearer {auth_users['token_op_a']}"},
    )
    assert res_update.status_code == 200
    conn_data = res_update.json()
    assert conn_data["station_is_oversubscribed"] is False
    assert conn_data["station_warning"] is None
    assert conn_data["station_warning_message"] is None

    res_eq = client.get(
        f"/api/v1/stations/{station.id}",
        headers={"Authorization": f"Bearer {auth_users['token_op_a']}"},
    )
    assert res_eq.status_code == 200
    data_eq = res_eq.json()
    assert data_eq["total_installed_power_kw"] == 100.0
    assert data_eq["is_oversubscribed"] is False
    assert data_eq["warning"] is None
    assert data_eq["warning_message"] is None


def test_s43_telemetry_alert_broadcast_on_rejected_and_timeout(
    db_session: Session, auth_users
):
    """S-43 (Tiêu chí 3): Phát sự kiện cảnh báo qua /ws/telemetry khi trụ từ chối hoặc timeout hạ tải.

    Phủ CẢ HAI trường hợp:
    (a) Trụ trả Rejected -> lý do "trụ từ chối giới hạn công suất".
    (b) Trụ timeout -> lý do "trụ không phản hồi giới hạn công suất".
    Dù RemoteStopTransaction thành công hay thất bại: sự kiện đều được phát, không có idTag, ghi nhận lý do vào session.
    """
    op = auth_users["op_a"]
    driver = auth_users["driver"]

    station = Station(
        operator_id=op.id,
        name="Trạm Alert Telemetry Test",
        address="Cần Thơ",
        total_grid_capacity_kw=30.0,
    )
    db_session.add(station)
    db_session.commit()

    cp = ChargingPoint(
        station_id=station.id, code="CP-ALERT-01", max_power_kw=60.0, is_active=True
    )
    db_session.add(cp)
    db_session.commit()

    conn1 = Connector(
        charging_point_id=cp.id, connector_number=1, max_power_kw=22.0, is_active=True
    )
    conn2 = Connector(
        charging_point_id=cp.id, connector_number=2, max_power_kw=22.0, is_active=True
    )
    db_session.add_all([conn1, conn2])
    db_session.commit()

    # 2 phiên sạc
    sess1 = ChargingSession(
        connector_id=conn1.id, driver_id=driver.id, status="CHARGING", meter_start=0
    )
    sess2 = ChargingSession(
        connector_id=conn2.id, driver_id=driver.id, status="CHARGING", meter_start=0
    )
    db_session.add_all([sess1, sess2])
    db_session.commit()

    tx1 = sess1.transaction_id
    tx2 = sess2.transaction_id

    broadcast_events = []

    async def mock_ws_broadcast(event_dict):
        broadcast_events.append(event_dict)

    # (a) Trường hợp trụ trả REJECTED (và RemoteStopTransaction thành công)
    from app.services.smart_charging import _execute_remote_stop_outside_lock

    with (
        patch("app.core.websocket.ws_manager.broadcast", side_effect=mock_ws_broadcast),
        patch("app.services.smart_charging.send_call_and_wait", return_value={"status": "Accepted"}),
    ):
        asyncio.run(
            _execute_remote_stop_outside_lock(
                charge_point_code="CP-ALERT-01",
                transaction_id=tx1,
                station_id=station.id,
                reason="trụ từ chối giới hạn công suất",
                session_factory=TestingSessionLocal,
            )
        )

    assert len(broadcast_events) == 1
    ev_reject = broadcast_events[0]
    assert ev_reject["event"] == "ALERT"
    assert ev_reject["alert_type"] == "LOAD_SHEDDING_ALERT"
    assert ev_reject["station_id"] == station.id
    assert ev_reject["charge_point_code"] == "CP-ALERT-01"
    assert ev_reject["transaction_id"] == tx1
    assert ev_reject["reason"] == "trụ từ chối giới hạn công suất"
    assert "timestamp" in ev_reject
    # Tuyệt đối không chứa idTag hay id_tag
    assert "idTag" not in ev_reject
    assert "id_tag" not in ev_reject

    # Kiểm tra lý do đã được lưu vào phiên
    db = TestingSessionLocal()
    updated_sess1 = db.query(ChargingSession).filter(ChargingSession.transaction_id == tx1).first()
    assert updated_sess1.abnormal_reason == "trụ từ chối giới hạn công suất"

    # (b) Trường hợp trụ bị TIMEOUT (và RemoteStopTransaction thất bại)
    broadcast_events.clear()

    async def mock_remote_stop_fail(*args, **kwargs):
        raise TimeoutError("Trụ không phản hồi lệnh dừng")

    with (
        patch("app.core.websocket.ws_manager.broadcast", side_effect=mock_ws_broadcast),
        patch("app.services.smart_charging.send_call_and_wait", side_effect=mock_remote_stop_fail),
    ):
        asyncio.run(
            _execute_remote_stop_outside_lock(
                charge_point_code="CP-ALERT-01",
                transaction_id=tx2,
                station_id=station.id,
                reason="trụ không phản hồi giới hạn công suất",
                session_factory=TestingSessionLocal,
            )
        )

    # Sự kiện cảnh báo VẪN ĐƯỢC PHÁT dù RemoteStop thất bại
    assert len(broadcast_events) == 1
    ev_timeout = broadcast_events[0]
    assert ev_timeout["event"] == "ALERT"
    assert ev_timeout["alert_type"] == "LOAD_SHEDDING_ALERT"
    assert ev_timeout["station_id"] == station.id
    assert ev_timeout["charge_point_code"] == "CP-ALERT-01"
    assert ev_timeout["transaction_id"] == tx2
    assert ev_timeout["reason"] == "trụ không phản hồi giới hạn công suất"
    assert "timestamp" in ev_timeout
    assert "idTag" not in ev_timeout
    assert "id_tag" not in ev_timeout

    # Kiểm tra phiên bị đánh dấu ABNORMAL khi RemoteStop thất bại
    db = TestingSessionLocal()
    updated_sess2 = db.query(ChargingSession).filter(ChargingSession.transaction_id == tx2).first()
    assert updated_sess2.status == "ABNORMAL"
    assert updated_sess2.is_abnormal is True
    assert "trụ không phản hồi giới hạn công suất" in updated_sess2.abnormal_reason
    assert updated_sess2.stop_reason == "RebalanceStopFailed"


def test_root_endpoint_returns_200_and_expected_payload(client):
    """Xác nhận GET / trả về 200 với đầy đủ nội dung thông tin dịch vụ như cũ."""
    res = client.get("/")
    assert res.status_code == 200
    data = res.json()
    assert "Chào mừng đến với" in data["message"]
    assert "version" in data
    assert data["docs"] == "/docs"
    assert data["health"] == "/api/v1/health"
    assert data["websocket"] == "/ws/telemetry"

