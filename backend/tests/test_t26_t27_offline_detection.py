import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.models.station import ChargingPoint, Connector, Station
from app.ocpp.frames import build_call
from app.ocpp.handlers.heartbeat import handle_heartbeat
from app.ocpp.handlers.status_notification import handle as handle_status_notification
from app.services.charge_point_service import scan_and_mark_offline_charge_points


@pytest.fixture
def t26_t27_seed_data(db_session: Session):
    """Seed dữ liệu cho Story S-12 (T-26 & T-27)."""
    now = datetime.now(timezone.utc)
    station = Station(
        name="Trạm Test Offline Detection",
        address="123 Đường Điện Biên Phủ, Đà Nẵng",
        latitude=16.06,
        longitude=108.21,
        total_grid_capacity_kw=150.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(station)
    db_session.commit()

    # 1. Trụ hết hạn heartbeat (> 2 * 60s = 120s): cách đây 250s
    cp_expired = ChargingPoint(
        station_id=station.id,
        code="CP-EXPIRED-99",
        vendor="ABB",
        status="Online",
        last_seen_at=now - timedelta(seconds=250),
        is_active=True,
    )
    # 2. Trụ hoạt động bình thường: cách đây 30s (< 60s)
    cp_active = ChargingPoint(
        station_id=station.id,
        code="CP-ACTIVE-88",
        vendor="Schneider",
        status="Online",
        last_seen_at=now - timedelta(seconds=30),
        is_active=True,
    )
    # 3. Trụ đã ở trạng thái Offline từ trước
    cp_already_offline = ChargingPoint(
        station_id=station.id,
        code="CP-ALREADY-OFFLINE-77",
        vendor="Delta",
        status="Offline",
        last_seen_at=now - timedelta(seconds=600),
        is_active=True,
    )
    db_session.add_all([cp_expired, cp_active, cp_already_offline])
    db_session.commit()

    conn_exp_1 = Connector(
        charge_point_id=cp_expired.id,
        connector_number=1,
        connector_type="CCS2",
        status="Available",
        is_active=True,
    )
    conn_exp_2 = Connector(
        charge_point_id=cp_expired.id,
        connector_number=2,
        connector_type="Type 2",
        status="Available",
        is_active=True,
    )
    conn_act_1 = Connector(
        charge_point_id=cp_active.id,
        connector_number=1,
        connector_type="CCS2",
        status="Available",
        is_active=True,
    )
    db_session.add_all([conn_exp_1, conn_exp_2, conn_act_1])
    db_session.commit()

    return {
        "station": station,
        "cp_expired": cp_expired,
        "cp_active": cp_active,
        "cp_already_offline": cp_already_offline,
        "conn_exp_1": conn_exp_1,
        "conn_exp_2": conn_exp_2,
        "conn_act_1": conn_act_1,
    }


def test_t26_job_marks_expired_charge_points_offline(
    db_session: Session, t26_t27_seed_data
):
    """Test 1 (T-26): Background Job phát hiện trụ quá 2 chu kỳ nhịp tim và chuyển sang Offline.

    - Trụ quá hạn chuyển thành Offline, các đầu nối chuyển sang Unavailable.
    - Chạy lại job lần 2 ngay lập tức không sinh thêm thay đổi (Idempotency).
    """
    cp_exp = t26_t27_seed_data["cp_expired"]
    conn_1 = t26_t27_seed_data["conn_exp_1"]
    conn_2 = t26_t27_seed_data["conn_exp_2"]
    cp_act = t26_t27_seed_data["cp_active"]

    # Chạy lần 1: với chu kỳ nhịp tim 60s (ngưỡng quá hạn = 120s)
    modified_ids = scan_and_mark_offline_charge_points(
        db=db_session, heartbeat_interval=60
    )

    assert cp_exp.id in modified_ids, "Trụ hết hạn phải nằm trong danh sách cập nhật"
    assert cp_act.id not in modified_ids, (
        "Trụ còn hoạt động không được chuyển sang Offline"
    )

    db_session.refresh(cp_exp)
    db_session.refresh(conn_1)
    db_session.refresh(conn_2)
    db_session.refresh(cp_act)

    assert cp_exp.status == "Offline"
    assert conn_1.status == "Unavailable"
    assert conn_2.status == "Unavailable"
    assert cp_act.status == "Online"

    # Chạy lần 2: kiểm tra tính bất biến lặp lại (Idempotency)
    second_run_modified = scan_and_mark_offline_charge_points(
        db=db_session, heartbeat_interval=60
    )
    assert second_run_modified == [], (
        "Chạy lại lần 2 không được phát sinh thay đổi thừa"
    )


@pytest.mark.asyncio
async def test_t27_two_way_status_transition(db_session: Session, t26_t27_seed_data):
    """Test 2 (T-27): Kiểm tra vòng đời 2 chiều (Online -> Offline -> Online).

    - Chiều 1: Trụ quá hạn heartbeat bị chuyển thành Offline.
    - Chiều 2: Nhận Heartbeat hoặc StatusNotification đưa trụ quay trở lại Online.
    """
    cp = t26_t27_seed_data["cp_expired"]

    # --- Chiều 1: Quét Offline ---
    scan_and_mark_offline_charge_points(db=db_session, heartbeat_interval=60)
    db_session.refresh(cp)
    assert cp.status == "Offline"

    # --- Chiều 2A: Nhận Heartbeat -> phục hồi sang Online ---
    old_last_seen = cp.last_seen_at
    hb_response = handle_heartbeat(db=db_session, charging_point=cp, payload={})
    db_session.commit()
    db_session.refresh(cp)

    assert "currentTime" in hb_response
    assert cp.status == "Online", (
        "Trụ phải tự động phục hồi sang Online khi gửi Heartbeat"
    )
    assert cp.last_seen_at > old_last_seen

    # --- Chiều 1 lần nữa: Chuyển lại về Offline để test StatusNotification ---
    now = datetime.now(timezone.utc)
    cp.last_seen_at = now - timedelta(seconds=300)
    db_session.commit()
    scan_and_mark_offline_charge_points(db=db_session, heartbeat_interval=60)
    db_session.refresh(cp)
    assert cp.status == "Offline"

    # --- Chiều 2B: Nhận StatusNotification -> phục hồi sang Online ---
    await handle_status_notification(
        db=db_session,
        payload={"connectorId": 1, "status": "Available"},
        charge_point=cp,
        charge_point_id=cp.id,
    )
    db_session.refresh(cp)
    assert cp.status == "Online", (
        "Trụ phải tự động phục hồi sang Online khi nhận StatusNotification"
    )


def test_active_charge_points_not_affected(db_session: Session, t26_t27_seed_data):
    """Test 3: Trụ có nhịp tim mới trong vòng 1 chu kỳ heartbeat không bị chuyển Offline."""
    cp_act = t26_t27_seed_data["cp_active"]
    conn_act = t26_t27_seed_data["conn_act_1"]

    now = datetime.now(timezone.utc)
    cp_act.last_seen_at = now - timedelta(seconds=10)
    db_session.commit()

    modified_ids = scan_and_mark_offline_charge_points(
        db=db_session, heartbeat_interval=60
    )

    db_session.refresh(cp_act)
    db_session.refresh(conn_act)

    assert cp_act.id not in modified_ids
    assert cp_act.status == "Online"
    assert conn_act.status == "Available"


def test_t27_gateway_heartbeat_websocket_integration(
    client: TestClient, db_session: Session, t26_t27_seed_data
):
    """Test tích hợp Gateway WebSocket: Nhận CALL Heartbeat và phản hồi CALLRESULT."""
    station = t26_t27_seed_data["station"]
    cp = ChargingPoint(
        station_id=station.id,
        code="CP-WS-HEARTBEAT",
        vendor="TestVendor",
        status="Offline",
        last_seen_at=datetime.now(timezone.utc) - timedelta(seconds=400),
        is_active=True,
    )
    db_session.add(cp)
    db_session.commit()

    with client.websocket_connect(f"/ocpp/{cp.code}", subprotocols=["ocpp1.6"]) as ws:
        # Bước 1: BootNotification để xác thực phiên kết nối
        ws.send_text(
            build_call(
                "boot-msg-1",
                "BootNotification",
                {
                    "chargePointVendor": "TestVendor",
                    "chargePointModel": "ModelX",
                },
            )
        )
        boot_res = json.loads(ws.receive_text())
        assert boot_res[0] == 3
        assert boot_res[2]["status"] == "Accepted"

        # Đặt lại status thành Offline để kiểm tra phản ứng với Heartbeat
        cp.status = "Offline"
        db_session.commit()

        # Bước 2: Gửi Heartbeat
        ws.send_text(build_call("hb-msg-1", "Heartbeat", {}))
        hb_res = json.loads(ws.receive_text())

        assert hb_res[0] == 3
        assert hb_res[1] == "hb-msg-1"
        assert "currentTime" in hb_res[2]

    db_session.refresh(cp)
    assert cp.status == "Online", "Heartbeat qua WebSocket phải đưa trụ trở lại Online"
