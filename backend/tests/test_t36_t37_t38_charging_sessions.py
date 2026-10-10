"""Bộ kiểm thử cho Task T-36, T-37, T-38 (Sprint 3: Charging Sessions & OCPP Handlers)."""

import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.models.id_tag import IdTag
from app.models.meter_value import MeterValue
from app.models.orphan_message import OrphanMessage
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.tariff import Tariff
from app.models.user import User
from app.ocpp.frames import build_call
from app.ocpp.handlers.start_transaction import handle_start_transaction
from app.ocpp.handlers.stop_transaction import handle_stop_transaction


def _create_test_fixture(db_session: Session):
    """Tạo dữ liệu fixture cơ bản phục vụ kiểm thử."""
    user = User(
        username="driver_sprint3",
        email="driver_sprint3@example.com",
        password_hash="argon2id$fakehash",
        role="CUSTOMER",
    )
    db_session.add(user)
    db_session.flush()

    station = Station(
        name="Trạm Sprint 3 Test",
        address="123 Đường Test",
        total_grid_capacity_kw=100.0,
        is_active=True,
    )
    db_session.add(station)
    db_session.flush()

    tariff = Tariff(
        station_id=station.id,
        name="Biểu giá chuẩn",
        price_normal=3500.0,
        price_peak=4500.0,
        price_offpeak=2500.0,
        peak_start="09:00",
        peak_end="11:30",
        peak_start_2="17:00",
        peak_end_2="20:00",
        offpeak_start="22:00",
        offpeak_end="04:00",
        is_active=True,
    )
    db_session.add(tariff)
    db_session.flush()

    cp = ChargingPoint(
        station_id=station.id,
        code="CP-SPRINT3-01",
        max_power_kw=60.0,
    )
    db_session.add(cp)
    db_session.flush()

    connector = Connector(
        charge_point_id=cp.id,
        connector_id=1,
        connector_number=1,
        status="AVAILABLE",
        ocpp_status="Available",
    )
    db_session.add(connector)
    db_session.flush()

    id_tag_active = IdTag(
        code="TAG-VALID-01",
        user_id=user.id,
        status="active",
        expiry_date=datetime.now(timezone.utc) + timedelta(days=30),
    )
    id_tag_blocked = IdTag(
        code="TAG-BLOCKED-01",
        user_id=user.id,
        status="blocked",
    )
    id_tag_expired = IdTag(
        code="TAG-EXPIRED-01",
        user_id=user.id,
        status="active",
        expiry_date=datetime.now(timezone.utc) - timedelta(days=1),
    )
    db_session.add_all([id_tag_active, id_tag_blocked, id_tag_expired])
    db_session.commit()

    return {
        "user": user,
        "station": station,
        "tariff": tariff,
        "cp": cp,
        "connector": connector,
        "tag_active": id_tag_active,
        "tag_blocked": id_tag_blocked,
        "tag_expired": id_tag_expired,
    }


# =====================================================================
# TASK T-36: Model & Partial Unique Index Tests
# =====================================================================


def test_t36_charging_session_model_and_synonyms(db_session: Session):
    """Kiểm tra model ChargingSession, các trường Wh và synonym tương thích ngược."""
    fx = _create_test_fixture(db_session)

    session = ChargingSession(
        connector_id=fx["connector"].id,
        id_tag=fx["tag_active"].code,
        driver_id=fx["user"].id,
        tariff_id=fx["tariff"].id,
        applied_price_per_kwh=3500.0,
        meter_start=15000,
        meter_start_kwh=15.0,
        status="CHARGING",
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)

    # Khóa chính và synonym id <-> transaction_id
    assert session.transaction_id > 0
    assert session.id == session.transaction_id

    # Synonym driver_id <-> user_id
    assert session.driver_id == fx["user"].id
    assert session.user_id == fx["user"].id

    # Số điện Wh
    assert session.meter_start == 15000
    assert session.status == "CHARGING"

    # Stop time và end_time synonym
    now_stop = datetime.now(timezone.utc)
    session.stop_time = now_stop
    assert session.end_time == now_stop


def test_t36_partial_unique_index_prevents_concurrent_charging(db_session: Session):
    """Kiểm tra Partial Unique Index chặn 2 phiên cùng CHARGING trên 1 cổng sạc."""
    fx = _create_test_fixture(db_session)

    s1 = ChargingSession(
        connector_id=fx["connector"].id,
        id_tag=fx["tag_active"].code,
        driver_id=fx["user"].id,
        tariff_id=fx["tariff"].id,
        applied_price_per_kwh=3500.0,
        meter_start=10000,
        status="CHARGING",
    )
    db_session.add(s1)
    db_session.commit()

    # Tạo phiên thứ 2 cũng ở trạng thái CHARGING trên cùng cổng
    s2 = ChargingSession(
        connector_id=fx["connector"].id,
        id_tag=fx["tag_active"].code,
        driver_id=fx["user"].id,
        tariff_id=fx["tariff"].id,
        applied_price_per_kwh=3500.0,
        meter_start=12000,
        status="CHARGING",
    )
    db_session.add(s2)

    with pytest.raises(IntegrityError):
        db_session.commit()

    db_session.rollback()

    # Nếu phiên 1 đã COMPLETED, thì phiên khác được phép CHARGING
    s1_loaded = (
        db_session.query(ChargingSession)
        .filter(ChargingSession.transaction_id == s1.transaction_id)
        .one()
    )
    s1_loaded.status = "COMPLETED"
    db_session.commit()

    # Bây giờ tạo phiên mới CHARGING sẽ thành công
    s3 = ChargingSession(
        connector_id=fx["connector"].id,
        id_tag=fx["tag_active"].code,
        driver_id=fx["user"].id,
        tariff_id=fx["tariff"].id,
        applied_price_per_kwh=3500.0,
        meter_start=20000,
        status="CHARGING",
    )
    db_session.add(s3)
    db_session.commit()
    assert s3.transaction_id > 0


# =====================================================================
# TASK T-37: StartTransaction Handler Tests
# =====================================================================


def test_t37_start_transaction_valid_tag(db_session: Session):
    """StartTransaction với thẻ hợp lệ cấp transactionId và tạo phiên CHARGING."""
    fx = _create_test_fixture(db_session)

    payload = {
        "connectorId": 1,
        "idTag": "TAG-VALID-01",
        "meterStart": 5000,
        "timestamp": "2026-10-04T10:00:00Z",
    }
    result = handle_start_transaction(db_session, fx["cp"], payload)

    assert result["idTagInfo"]["status"] == "Accepted"
    assert result["transactionId"] > 0

    session = (
        db_session.query(ChargingSession)
        .filter(ChargingSession.transaction_id == result["transactionId"])
        .one()
    )
    assert session.status == "CHARGING"
    assert session.meter_start == 5000
    assert session.driver_id == fx["user"].id
    assert session.connector_id == fx["connector"].id

    # Trạng thái connector chuyển sang CHARGING
    db_session.refresh(fx["connector"])
    assert fx["connector"].status == "CHARGING"


def test_t37_start_transaction_invalid_and_blocked_tag(db_session: Session):
    """StartTransaction với thẻ không tồn tại hoặc bị khóa/hết hạn."""
    fx = _create_test_fixture(db_session)

    # Thẻ lạ không tồn tại
    res_invalid = handle_start_transaction(
        db_session,
        fx["cp"],
        {
            "connectorId": 1,
            "idTag": "UNKNOWN-TAG",
            "meterStart": 0,
            "timestamp": "2026-10-04T10:00:00Z",
        },
    )
    assert res_invalid["idTagInfo"]["status"] == "Invalid"
    assert res_invalid["transactionId"] == 0

    # Thẻ bị khóa
    res_blocked = handle_start_transaction(
        db_session,
        fx["cp"],
        {
            "connectorId": 1,
            "idTag": "TAG-BLOCKED-01",
            "meterStart": 0,
            "timestamp": "2026-10-04T10:00:00Z",
        },
    )
    assert res_blocked["idTagInfo"]["status"] == "Blocked"
    assert res_blocked["transactionId"] == 0

    # Thẻ hết hạn
    res_expired = handle_start_transaction(
        db_session,
        fx["cp"],
        {
            "connectorId": 1,
            "idTag": "TAG-EXPIRED-01",
            "meterStart": 0,
            "timestamp": "2026-10-04T10:00:00Z",
        },
    )
    assert res_expired["idTagInfo"]["status"] == "Expired"
    assert res_expired["transactionId"] == 0


def test_t37_start_transaction_concurrency_abnormal_closure(db_session: Session):
    """Cổng sạc đang có phiên CHARGING thì phiên cũ bị đóng bất thường ABNORMAL."""
    fx = _create_test_fixture(db_session)

    # Bắt đầu phiên 1
    res1 = handle_start_transaction(
        db_session,
        fx["cp"],
        {
            "connectorId": 1,
            "idTag": "TAG-VALID-01",
            "meterStart": 1000,
            "timestamp": "2026-10-04T10:00:00Z",
        },
    )
    assert res1["transactionId"] > 0

    # Bắt đầu phiên 2 khi chưa stop phiên 1
    res2 = handle_start_transaction(
        db_session,
        fx["cp"],
        {
            "connectorId": 1,
            "idTag": "TAG-VALID-01",
            "meterStart": 2000,
            "timestamp": "2026-10-04T10:05:00Z",
        },
    )
    assert res2["transactionId"] > 0
    assert res2["transactionId"] != res1["transactionId"]

    # Kiểm tra phiên 1 đã bị chuyển sang ABNORMAL
    s1 = (
        db_session.query(ChargingSession)
        .filter(ChargingSession.transaction_id == res1["transactionId"])
        .one()
    )
    assert s1.status == "ABNORMAL"
    assert s1.stop_reason == "Other"
    assert s1.stop_time is not None

    # Phiên 2 đang CHARGING
    s2 = (
        db_session.query(ChargingSession)
        .filter(ChargingSession.transaction_id == res2["transactionId"])
        .one()
    )
    assert s2.status == "CHARGING"


def test_t37_start_transaction_idempotency(db_session: Session):
    """Gửi lại cùng một StartTransaction không tạo thêm phiên mới."""
    fx = _create_test_fixture(db_session)

    payload = {
        "connectorId": 1,
        "idTag": "TAG-VALID-01",
        "meterStart": 3000,
        "timestamp": "2026-10-04T10:00:00Z",
    }
    res1 = handle_start_transaction(db_session, fx["cp"], payload)
    res2 = handle_start_transaction(db_session, fx["cp"], payload)

    assert res1["transactionId"] == res2["transactionId"]
    count = (
        db_session.query(ChargingSession)
        .filter(ChargingSession.connector_id == fx["connector"].id)
        .count()
    )
    assert count == 1


# =====================================================================
# TASK T-38: StopTransaction Handler Tests
# =====================================================================


def test_t38_stop_transaction_normal_flow(db_session: Session):
    """StopTransaction bình thường tính đúng kWh, cập nhật COMPLETED và giải phóng cổng."""
    fx = _create_test_fixture(db_session)

    res_start = handle_start_transaction(
        db_session,
        fx["cp"],
        {
            "connectorId": 1,
            "idTag": "TAG-VALID-01",
            "meterStart": 10000,
            "timestamp": "2026-10-04T10:00:00Z",
        },
    )
    t_id = res_start["transactionId"]

    stop_payload = {
        "transactionId": t_id,
        "meterStop": 25000,
        "timestamp": "2026-10-04T11:00:00Z",
        "reason": "EVDisconnected",
    }
    res_stop = handle_stop_transaction(db_session, fx["cp"], stop_payload)
    assert res_stop["idTagInfo"]["status"] == "Accepted"

    session = (
        db_session.query(ChargingSession)
        .filter(ChargingSession.transaction_id == t_id)
        .one()
    )
    assert session.status == "COMPLETED"
    assert float(session.total_kwh) == 15.0  # (25000 - 10000) / 1000.0
    assert session.meter_stop == 25000
    assert session.stop_reason == "EVDisconnected"
    assert float(session.total_amount) == round(3500.0 * 15.0, 2)

    # Cổng sạc được giải phóng về AVAILABLE
    db_session.refresh(fx["connector"])
    assert fx["connector"].status == "AVAILABLE"


def test_t38_stop_transaction_counter_rollback_needs_review(db_session: Session):
    """StopTransaction với số đo lùi chuyển sang NEEDS_REVIEW, total_kwh = None, không số âm."""
    fx = _create_test_fixture(db_session)

    res_start = handle_start_transaction(
        db_session,
        fx["cp"],
        {
            "connectorId": 1,
            "idTag": "TAG-VALID-01",
            "meterStart": 20000,
            "timestamp": "2026-10-04T10:00:00Z",
        },
    )
    t_id = res_start["transactionId"]

    # Gửi meterStop nhỏ hơn meterStart (số đo lùi bất thường)
    stop_payload = {
        "transactionId": t_id,
        "meterStop": 18000,
        "timestamp": "2026-10-04T11:00:00Z",
        "reason": "EmergencyStop",
    }
    res_stop = handle_stop_transaction(db_session, fx["cp"], stop_payload)
    assert res_stop["idTagInfo"]["status"] == "Accepted"

    session = (
        db_session.query(ChargingSession)
        .filter(ChargingSession.transaction_id == t_id)
        .one()
    )
    assert session.status == "NEEDS_REVIEW"
    assert session.total_kwh is None
    assert session.meter_stop == 18000
    assert session.stop_reason == "EmergencyStop"


def test_t38_stop_transaction_orphan_message(db_session: Session):
    """StopTransaction với transactionId không tồn tại lưu vào orphan_messages."""
    fx = _create_test_fixture(db_session)

    orphan_payload = {
        "transactionId": 999999,
        "meterStop": 5000,
        "timestamp": "2026-10-04T12:00:00Z",
        "reason": "Local",
    }
    res = handle_stop_transaction(db_session, fx["cp"], orphan_payload)
    assert res["idTagInfo"]["status"] == "Accepted"

    orphan = (
        db_session.query(OrphanMessage)
        .filter(OrphanMessage.charge_point_code == fx["cp"].code)
        .first()
    )
    assert orphan is not None
    assert orphan.action == "StopTransaction"
    assert "999999" in orphan.payload


def test_t38_stop_transaction_idempotent(db_session: Session):
    """Gọi StopTransaction nhiều lần trên phiên COMPLETED không ghi đè."""
    fx = _create_test_fixture(db_session)

    res_start = handle_start_transaction(
        db_session,
        fx["cp"],
        {
            "connectorId": 1,
            "idTag": "TAG-VALID-01",
            "meterStart": 10000,
            "timestamp": "2026-10-04T10:00:00Z",
        },
    )
    t_id = res_start["transactionId"]

    stop_payload = {
        "transactionId": t_id,
        "meterStop": 20000,
        "timestamp": "2026-10-04T11:00:00Z",
    }
    handle_stop_transaction(db_session, fx["cp"], stop_payload)

    # Gọi lần 2 với meterStop khác
    res2 = handle_stop_transaction(
        db_session,
        fx["cp"],
        {
            "transactionId": t_id,
            "meterStop": 30000,
            "timestamp": "2026-10-04T12:00:00Z",
        },
    )
    assert res2["idTagInfo"]["status"] == "Accepted"

    session = (
        db_session.query(ChargingSession)
        .filter(ChargingSession.transaction_id == t_id)
        .one()
    )
    # Vẫn giữ nguyên kết quả của lần stop đầu tiên
    assert float(session.total_kwh) == 10.0
    assert session.meter_stop == 20000


def test_t38_stop_transaction_persists_transaction_data_once(db_session: Session):
    """StopTransaction lưu mẫu số đo hợp lệ và không nhân đôi khi phát lại."""
    fx = _create_test_fixture(db_session)
    started = handle_start_transaction(
        db_session,
        fx["cp"],
        {
            "connectorId": 1,
            "idTag": "TAG-VALID-01",
            "meterStart": 10000,
            "timestamp": "2026-10-04T10:00:00Z",
        },
    )
    transaction_id = started["transactionId"]
    payload = {
        "transactionId": transaction_id,
        "meterStop": 11000,
        "timestamp": "2026-10-04T11:00:00Z",
        "transactionData": [
            {
                "timestamp": "2026-10-04T10:30:00Z",
                "sampledValue": [
                    {
                        "value": "10.500000000",
                        "measurand": "Energy.Active.Import.Register",
                        "unit": "kWh",
                    }
                ],
            }
        ],
    }

    handle_stop_transaction(db_session, fx["cp"], payload)
    handle_stop_transaction(db_session, fx["cp"], payload)

    readings = (
        db_session.query(MeterValue)
        .filter(MeterValue.session_id == transaction_id)
        .all()
    )
    assert len(readings) == 1
    assert readings[0].measurand == "Energy.Active.Import.Register"
    assert readings[0].value == Decimal("10.500000000")
    assert readings[0].unit == "kWh"


def test_t38_stop_transaction_preserves_other_review_flags(db_session: Session):
    """StopTransaction không tự xóa cờ review có nguyên nhân khác."""
    fx = _create_test_fixture(db_session)
    started = handle_start_transaction(
        db_session,
        fx["cp"],
        {
            "connectorId": 1,
            "idTag": "TAG-VALID-01",
            "meterStart": 10000,
            "timestamp": "2026-10-04T10:00:00Z",
        },
    )
    transaction_id = started["transactionId"]
    session = (
        db_session.query(ChargingSession)
        .filter(ChargingSession.transaction_id == transaction_id)
        .one()
    )
    session.needs_review = True
    session.is_abnormal = True
    session.abnormal_reason = "MeterValuesInconsistent"
    db_session.commit()

    handle_stop_transaction(
        db_session,
        fx["cp"],
        {
            "transactionId": transaction_id,
            "meterStop": 11000,
            "timestamp": "2026-10-04T11:00:00Z",
        },
    )

    db_session.refresh(session)
    assert session.status == "COMPLETED"
    assert session.needs_review is True
    assert session.is_abnormal is True
    assert session.abnormal_reason == "MeterValuesInconsistent"


# =====================================================================
# INTEGRATION TEST: Full WebSocket OCPP Flow
# =====================================================================


def test_ocpp_websocket_start_and_stop_transaction_flow(
    client: TestClient, db_session: Session
):
    """Kiểm thử luồng WebSocket OCPP hoàn chỉnh: Boot -> StartTransaction -> StopTransaction."""
    fx = _create_test_fixture(db_session)
    cp_code = fx["cp"].code

    with client.websocket_connect(f"/ocpp/{cp_code}", subprotocols=["ocpp1.6"]) as ws:
        # 1. BootNotification
        ws.send_text(
            build_call(
                "msg-boot",
                "BootNotification",
                {
                    "chargePointVendor": "TestVendor",
                    "chargePointModel": "ModelX",
                },
            )
        )
        boot_resp = json.loads(ws.receive_text())
        assert boot_resp[2]["status"] == "Accepted"

        # 2. StartTransaction
        ws.send_text(
            build_call(
                "msg-start",
                "StartTransaction",
                {
                    "connectorId": 1,
                    "idTag": "TAG-VALID-01",
                    "meterStart": 10000,
                    "timestamp": "2026-10-04T10:00:00Z",
                },
            )
        )
        start_resp = json.loads(ws.receive_text())
        assert start_resp[0] == 3, f"Expected CALLRESULT (3), got: {start_resp}"
        assert start_resp[1] == "msg-start"
        assert start_resp[2]["idTagInfo"]["status"] == "Accepted"
        t_id = start_resp[2]["transactionId"]
        assert t_id > 0

        # 3. StopTransaction
        ws.send_text(
            build_call(
                "msg-stop",
                "StopTransaction",
                {
                    "transactionId": t_id,
                    "meterStop": 22500,
                    "timestamp": "2026-10-04T11:00:00Z",
                    "reason": "Local",
                },
            )
        )
        stop_resp = json.loads(ws.receive_text())
        assert stop_resp[0] == 3  # CALLRESULT
        assert stop_resp[1] == "msg-stop"
        assert stop_resp[2]["idTagInfo"]["status"] == "Accepted"

    # Kiểm tra CSDL sau WebSocket flow
    session = (
        db_session.query(ChargingSession)
        .filter(ChargingSession.transaction_id == t_id)
        .one()
    )
    assert session.status == "COMPLETED"
    assert float(session.total_kwh) == 12.5
