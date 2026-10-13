"""Bộ kiểm thử toàn diện cho Epic E-07 (S-48: Đặt chỗ trụ sạc & S-49: Chống đua tranh và gợi ý trụ thay thế)."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest

from app.core.security import create_access_token, get_password_hash
from app.models.id_tag import IdTag
from app.models.reservation import Reservation, ReservationStatus
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User
from app.models.wallet import Wallet


@pytest.fixture
def env_reservation(db_session):
    """Fixture chuẩn bị dữ liệu: 2 tài xế, 1 CPO, 1 trạm sạc với 2 trụ và nhiều đầu nối."""
    cpo = User(
        username="cpo_res",
        email="cpo_res@evcsms.vn",
        password_hash=get_password_hash("Pass1234"),
        role="OPERATOR",
        is_active=True,
    )
    driver1 = User(
        username="driver_res_1",
        email="driver1@evcsms.vn",
        password_hash=get_password_hash("Pass1234"),
        role="CUSTOMER",
        is_active=True,
    )
    driver2 = User(
        username="driver_res_2",
        email="driver2@evcsms.vn",
        password_hash=get_password_hash("Pass1234"),
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add_all([cpo, driver1, driver2])
    db_session.commit()

    # Ví điện tử cho 2 tài xế
    wallet1 = Wallet(
        user_id=driver1.id,
        balance=Decimal("100000.00"),  # Đủ điều kiện (>= 50k)
        is_debt_locked=False,
    )
    wallet2 = Wallet(
        user_id=driver2.id,
        balance=Decimal("150000.00"),  # Đủ điều kiện (>= 50k)
        is_debt_locked=False,
    )
    db_session.add_all([wallet1, wallet2])
    db_session.commit()

    # Thẻ RFID cho 2 tài xế
    id_tag1 = IdTag(
        code="RFID-RES-001",
        user_id=driver1.id,
        status="active",
        expiry_date=datetime.now(timezone.utc) + timedelta(days=365),
    )
    id_tag2 = IdTag(
        code="RFID-RES-002",
        user_id=driver2.id,
        status="active",
        expiry_date=datetime.now(timezone.utc) + timedelta(days=365),
    )
    db_session.add_all([id_tag1, id_tag2])
    db_session.commit()

    # Trạm sạc
    station = Station(
        operator_id=cpo.id,
        name="Trạm Sạc Đặt Chỗ E-07",
        address="123 Nguyễn Huệ, Q1, TP.HCM",
        latitude=10.7769,
        longitude=106.7009,
        total_grid_capacity_kw=150.0,
        status="ACTIVE",
        is_active=True,
    )
    db_session.add(station)
    db_session.commit()

    # Trụ sạc 1 (2 đầu nối)
    cp1 = ChargingPoint(
        station_id=station.id,
        code="CP-RES-01",
        vendor="ABB",
        model="Terra 54",
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(cp1)
    db_session.commit()

    conn1_1 = Connector(
        charge_point_id=cp1.id,
        connector_number=1,
        connector_type="CCS2",
        max_power_kw=60.0,
        status="AVAILABLE",
        is_active=True,
    )
    conn1_2 = Connector(
        charge_point_id=cp1.id,
        connector_number=2,
        connector_type="Type 2",
        max_power_kw=22.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add_all([conn1_1, conn1_2])

    # Trụ sạc 2 (1 đầu nối)
    cp2 = ChargingPoint(
        station_id=station.id,
        code="CP-RES-02",
        vendor="StarCharge",
        model="Titan 120",
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(cp2)
    db_session.commit()

    conn2_1 = Connector(
        charge_point_id=cp2.id,
        connector_number=1,
        connector_type="CCS2",
        max_power_kw=120.0,
        status="AVAILABLE",
        is_active=True,
    )
    db_session.add(conn2_1)
    db_session.commit()

    # Tokens
    token1 = create_access_token({"sub": str(driver1.id), "role": driver1.role})
    token2 = create_access_token({"sub": str(driver2.id), "role": driver2.role})

    return {
        "driver1": driver1,
        "driver2": driver2,
        "wallet1": wallet1,
        "wallet2": wallet2,
        "id_tag1": id_tag1,
        "id_tag2": id_tag2,
        "station": station,
        "cp1": cp1,
        "cp2": cp2,
        "conn1_1": conn1_1,
        "conn1_2": conn1_2,
        "conn2_1": conn2_1,
        "headers1": {"Authorization": f"Bearer {token1}"},
        "headers2": {"Authorization": f"Bearer {token2}"},
    }


def test_s48_create_reservation_success_with_duration(client, db_session, env_reservation):
    """S-48: Đặt chỗ thành công trong khoảng thời gian bằng duration_minutes (Accepted)."""
    conn = env_reservation["conn1_1"]
    headers = env_reservation["headers1"]

    res = client.post(
        "/api/v1/reservations",
        json={
            "connector_id": conn.id,
            "duration_minutes": 60,
            "simulate_condition": "ACCEPTED",
        },
        headers=headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "ACTIVE"
    assert data["connector_id"] == conn.id
    assert data["charge_point_code"] == "CP-RES-01"
    assert data["id_tag"] == "RFID-RES-001"
    assert data["id"] > 0

    # Kiểm tra trạng thái connector cập nhật sang RESERVED
    db_session.refresh(conn)
    assert conn.status == "RESERVED"
    assert conn.ocpp_status == "Reserved"


def test_s48_create_reservation_success_with_expiry_date(client, db_session, env_reservation):
    """S-48: Đặt chỗ thành công bằng việc chỉ định trực tiếp expiry_date ISO."""
    conn = env_reservation["conn1_2"]
    headers = env_reservation["headers1"]

    future_time = datetime.now(timezone.utc) + timedelta(minutes=90)
    res = client.post(
        "/api/v1/reservations",
        json={
            "connector_id": conn.id,
            "expiry_date": future_time.isoformat(),
            "simulate_condition": "ACCEPTED",
        },
        headers=headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "ACTIVE"
    assert data["connector_id"] == conn.id


def test_s48_validation_expiry_time_limits(client, db_session, env_reservation):
    """S-48: Kiểm tra ràng buộc thời gian: thời gian ở quá khứ hoặc vượt quá 2 giờ bị từ chối 400."""
    conn = env_reservation["conn1_1"]
    headers = env_reservation["headers1"]

    # 1. Thời gian ở quá khứ
    past_time = datetime.now(timezone.utc) - timedelta(minutes=10)
    res_past = client.post(
        "/api/v1/reservations",
        json={
            "connector_id": conn.id,
            "expiry_date": past_time.isoformat(),
            "simulate_condition": "ACCEPTED",
        },
        headers=headers,
    )
    assert res_past.status_code == 400
    assert "tương lai" in res_past.json()["detail"]

    # 2. Thời gian vượt quá 2 giờ (> 120 phút)
    too_far = datetime.now(timezone.utc) + timedelta(minutes=130)
    res_far = client.post(
        "/api/v1/reservations",
        json={
            "connector_id": conn.id,
            "expiry_date": too_far.isoformat(),
            "simulate_condition": "ACCEPTED",
        },
        headers=headers,
    )
    assert res_far.status_code == 400
    assert "2 giờ" in res_far.json()["detail"]

    # 3. duration_minutes > 120
    res_dur = client.post(
        "/api/v1/reservations",
        json={
            "connector_id": conn.id,
            "duration_minutes": 150,
            "simulate_condition": "ACCEPTED",
        },
        headers=headers,
    )
    assert res_dur.status_code == 422 or res_dur.status_code == 400


def test_s48_wallet_below_threshold_blocked(client, db_session, env_reservation):
    """S-48 & S-38: Số dư ví dưới 50.000 VNĐ bị từ chối đặt chỗ với mã lỗi chuẩn hóa."""
    conn = env_reservation["conn1_1"]
    wallet = env_reservation["wallet1"]
    headers = env_reservation["headers1"]

    # Rút ví xuống 20.000 VNĐ (< 50k)
    wallet.balance = Decimal("20000.00")
    db_session.commit()

    res = client.post(
        "/api/v1/reservations",
        json={
            "connector_id": conn.id,
            "duration_minutes": 30,
            "simulate_condition": "ACCEPTED",
        },
        headers=headers,
    )
    assert res.status_code == 400
    data = res.json()
    assert data["error_code"] == "WALLET_INSUFFICIENT_BALANCE"
    assert data["current_balance"] == 20000
    assert data["required_balance"] == 50000
    assert data["suggest_topup"] is True


def test_s48_wallet_debt_locked_blocked(client, db_session, env_reservation):
    """S-48: Ví bị khóa nợ is_debt_locked=True bị từ chối đặt chỗ với HTTP 403."""
    conn = env_reservation["conn1_1"]
    wallet = env_reservation["wallet1"]
    headers = env_reservation["headers1"]

    wallet.is_debt_locked = True
    db_session.commit()

    res = client.post(
        "/api/v1/reservations",
        json={
            "connector_id": conn.id,
            "duration_minutes": 30,
            "simulate_condition": "ACCEPTED",
        },
        headers=headers,
    )
    assert res.status_code == 403
    assert "khóa nợ" in res.json()["detail"]


def test_s48_id_tag_expired_blocked(client, db_session, env_reservation):
    """S-48: Thẻ RFID hết hạn bị từ chối đặt chỗ với HTTP 400."""
    conn = env_reservation["conn1_1"]
    id_tag = env_reservation["id_tag1"]
    headers = env_reservation["headers1"]

    # Chỉnh thẻ hết hạn
    id_tag.expiry_date = datetime.now(timezone.utc) - timedelta(days=1)
    db_session.commit()

    res = client.post(
        "/api/v1/reservations",
        json={
            "connector_id": conn.id,
            "duration_minutes": 30,
            "simulate_condition": "ACCEPTED",
        },
        headers=headers,
    )
    assert res.status_code == 400
    assert "hết hạn" in res.json()["detail"]


def test_s49_concurrency_conflict_returns_409_with_suggested_connectors(
    client, db_session, env_reservation
):
    """S-49: Hai tài xế đặt cùng trụ cùng lúc, người thứ hai nhận 409 Conflict kèm danh sách gợi ý đầu nối thay thế trong cùng trạm."""
    conn1 = env_reservation["conn1_1"]
    headers1 = env_reservation["headers1"]
    headers2 = env_reservation["headers2"]

    # 1. Tài xế 1 đặt thành công
    res1 = client.post(
        "/api/v1/reservations",
        json={
            "connector_id": conn1.id,
            "duration_minutes": 60,
            "simulate_condition": "ACCEPTED",
        },
        headers=headers1,
    )
    assert res1.status_code == 201
    assert res1.json()["status"] == "ACTIVE"

    # 2. Tài xế 2 cố đặt cùng connector1
    res2 = client.post(
        "/api/v1/reservations",
        json={
            "connector_id": conn1.id,
            "duration_minutes": 60,
            "simulate_condition": "ACCEPTED",
        },
        headers=headers2,
    )
    assert res2.status_code == 409
    data2 = res2.json()
    assert "detail" in data2
    assert "suggested_connectors" in data2
    suggested = data2["suggested_connectors"]
    # Trong trạm còn conn1_2 (Type 2) và conn2_1 (CCS2) đang AVAILABLE
    assert len(suggested) >= 1
    suggested_ids = [s["id"] for s in suggested]
    assert conn1.id not in suggested_ids
    assert env_reservation["conn1_2"].id in suggested_ids or env_reservation["conn2_1"].id in suggested_ids


def test_s48_ocpp_occupied_response_returns_409_with_suggestions(
    client, db_session, env_reservation
):
    """S-48: Trụ phản hồi Occupied (xe khác vừa cắm vật lý) -> trả 409 Conflict kèm danh sách gợi ý."""
    conn = env_reservation["conn1_1"]
    headers = env_reservation["headers1"]

    res = client.post(
        "/api/v1/reservations",
        json={
            "connector_id": conn.id,
            "duration_minutes": 45,
            "simulate_condition": "OCCUPIED",
        },
        headers=headers,
    )
    assert res.status_code == 409
    data = res.json()
    assert "Occupied" in data["detail"]
    assert "suggested_connectors" in data
    assert len(data["suggested_connectors"]) >= 1


def test_s48_ocpp_rejected_response_returns_400(client, db_session, env_reservation):
    """S-48: Trụ phản hồi Rejected -> trả 400 Bad Request."""
    conn = env_reservation["conn1_1"]
    headers = env_reservation["headers1"]

    res = client.post(
        "/api/v1/reservations",
        json={
            "connector_id": conn.id,
            "duration_minutes": 45,
            "simulate_condition": "REJECTED",
        },
        headers=headers,
    )
    assert res.status_code == 400
    assert "từ chối" in res.json()["detail"] or "Rejected" in res.json()["detail"]


def test_s48_ocpp_timeout_and_offline(client, db_session, env_reservation):
    """S-48: Trụ timeout trả 504 Gateway Timeout, trụ offline trả 503 Service Unavailable."""
    conn = env_reservation["conn1_1"]
    headers = env_reservation["headers1"]

    # 1. Timeout
    res_timeout = client.post(
        "/api/v1/reservations",
        json={
            "connector_id": conn.id,
            "duration_minutes": 30,
            "simulate_condition": "TIMEOUT",
        },
        headers=headers,
    )
    assert res_timeout.status_code == 504
    assert "Timeout" in res_timeout.json()["detail"]

    # 2. Offline
    res_offline = client.post(
        "/api/v1/reservations",
        json={
            "connector_id": conn.id,
            "duration_minutes": 30,
            "simulate_condition": "OFFLINE",
        },
        headers=headers,
    )
    assert res_offline.status_code == 503
    assert "ngoại tuyến" in res_offline.json()["detail"]


def test_s48_cancel_reservation_releases_connector(client, db_session, env_reservation):
    """S-48: Hủy đặt chỗ giải phóng đầu nối về AVAILABLE và cập nhật reservation thành CANCELLED."""
    conn = env_reservation["conn1_1"]
    headers = env_reservation["headers1"]

    # Đặt trước thành công
    res = client.post(
        "/api/v1/reservations",
        json={
            "connector_id": conn.id,
            "duration_minutes": 60,
            "simulate_condition": "ACCEPTED",
        },
        headers=headers,
    )
    assert res.status_code == 201
    res_id = res.json()["id"]

    db_session.refresh(conn)
    assert conn.status == "RESERVED"

    # Gọi API hủy
    cancel_res = client.post(
        f"/api/v1/reservations/{res_id}/cancel",
        headers=headers,
    )
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "CANCELLED"

    # Connector được giải phóng về AVAILABLE
    db_session.refresh(conn)
    assert conn.status == "AVAILABLE"
    assert conn.ocpp_status == "Available"


def test_s48_cancel_reservation_unauthorized(client, db_session, env_reservation):
    """S-48: Tài xế 2 không thể hủy đặt chỗ của tài xế 1 (403 Forbidden)."""
    conn = env_reservation["conn1_1"]
    headers1 = env_reservation["headers1"]
    headers2 = env_reservation["headers2"]

    # Tài xế 1 tạo đặt chỗ
    res = client.post(
        "/api/v1/reservations",
        json={
            "connector_id": conn.id,
            "duration_minutes": 60,
            "simulate_condition": "ACCEPTED",
        },
        headers=headers1,
    )
    res_id = res.json()["id"]

    # Tài xế 2 cố hủy
    cancel_res = client.post(
        f"/api/v1/reservations/{res_id}/cancel",
        headers=headers2,
    )
    assert cancel_res.status_code == 403
    assert "không có quyền" in cancel_res.json()["detail"]


def test_s48_get_my_reservations_and_auto_expiration(client, db_session, env_reservation):
    """S-48: Xem danh sách đặt chỗ của tôi và tự động cập nhật các lượt quá hạn thành EXPIRED."""
    conn = env_reservation["conn1_1"]
    headers = env_reservation["headers1"]
    driver1 = env_reservation["driver1"]

    # Tạo một reservation trong quá khứ đã quá hạn
    past_reservation = Reservation(
        user_id=driver1.id,
        charge_point_id=conn.charge_point_id,
        connector_id=conn.id,
        id_tag="RFID-RES-001",
        start_time=datetime.now(timezone.utc) - timedelta(hours=3),
        expiry_date=datetime.now(timezone.utc) - timedelta(hours=1),
        status=ReservationStatus.ACTIVE.value,
    )
    conn.status = "RESERVED"
    db_session.add(past_reservation)
    db_session.commit()

    res = client.get("/api/v1/reservations/my", headers=headers)
    assert res.status_code == 200
    items = res.json()
    assert len(items) >= 1
    item = next(i for i in items if i["id"] == past_reservation.id)
    assert item["status"] == "EXPIRED"

    # Connector được tự động mở về AVAILABLE
    db_session.refresh(conn)
    assert conn.status == "AVAILABLE"


def test_s48_real_dispatch_send_call_and_wait_accepted(client, db_session, env_reservation):
    """S-48: Kiểm tra trực tiếp cuộc gọi send_call_and_wait với payload OCPP 1.6 chuẩn xác."""
    conn = env_reservation["conn1_1"]
    cp = env_reservation["cp1"]
    headers = env_reservation["headers1"]

    with patch("app.ocpp.gateway.active_ocpp_connections", {cp.code: AsyncMock()}), \
         patch("app.services.reservation_service.send_call_and_wait", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = {"status": "Accepted"}

        res = client.post(
            "/api/v1/reservations",
            json={
                "connector_id": conn.id,
                "duration_minutes": 30,
            },
            headers=headers,
        )
        assert res.status_code == 201
        data = res.json()
        assert data["status"] == "ACTIVE"

        # Kiểm tra bản tin gửi xuống trụ sạc
        mock_send.assert_awaited_once()
        call_args = mock_send.await_args
        assert call_args.kwargs["charge_point_code"] == cp.code
        assert call_args.kwargs["action"] == "ReserveNow"
        payload = call_args.kwargs["payload"]
        assert payload["connectorId"] == conn.connector_number
        assert payload["idTag"] == "RFID-RES-001"
        assert payload["reservationId"] == data["id"]
        assert "expiryDate" in payload


def test_s48_cancel_reservation_real_dispatch(client, db_session, env_reservation):
    """S-48: Kiểm tra cuộc gọi CancelReservation gửi tới trụ sạc khi hủy đặt chỗ."""
    conn = env_reservation["conn1_1"]
    cp = env_reservation["cp1"]
    headers = env_reservation["headers1"]

    # Đặt trước thành công
    res = client.post(
        "/api/v1/reservations",
        json={
            "connector_id": conn.id,
            "duration_minutes": 45,
            "simulate_condition": "ACCEPTED",
        },
        headers=headers,
    )
    res_id = res.json()["id"]

    with patch("app.ocpp.gateway.active_ocpp_connections", {cp.code: AsyncMock()}), \
         patch("app.services.reservation_service.send_call_and_wait", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = {"status": "Accepted"}

        cancel_res = client.post(
            f"/api/v1/reservations/{res_id}/cancel",
            headers=headers,
        )
        assert cancel_res.status_code == 200
        assert cancel_res.json()["status"] == "CANCELLED"

        mock_send.assert_awaited_once()
        call_args = mock_send.await_args
        assert call_args.kwargs["charge_point_code"] == cp.code
        assert call_args.kwargs["action"] == "CancelReservation"
        assert call_args.kwargs["payload"]["reservationId"] == res_id
