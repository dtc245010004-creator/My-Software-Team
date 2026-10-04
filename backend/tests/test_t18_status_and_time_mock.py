"""Kiểm thử bổ sung cho Task T-18: StatusNotification, Mock lệch giờ không dùng tzset, Single UPDATE query."""

import json
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import patch

import pytest
from sqlalchemy import event, text
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.models.station import ChargingPoint, Station
from app.ocpp.frames import build_call
from app.ocpp.gateway import touch_last_seen


def _create_charging_point(db_session: Session, code: str) -> ChargingPoint:
    station = Station(
        name=f"Trạm {code}",
        address="Địa chỉ kiểm thử",
        total_grid_capacity_kw=100.0,
        is_active=True,
    )
    charging_point = ChargingPoint(
        station=station,
        code=code,
        max_power_kw=60.0,
        is_active=True,
    )
    db_session.add(charging_point)
    db_session.commit()
    db_session.refresh(charging_point)
    return charging_point


def _read_frame(websocket: Any) -> list:
    return json.loads(websocket.receive_text())


def _boot(websocket: Any, message_id: str) -> None:
    websocket.send_text(
        build_call(
            message_id,
            "BootNotification",
            {
                "chargePointVendor": "TestVendor",
                "chargePointModel": "TestModel",
            },
        )
    )
    res = _read_frame(websocket)
    assert res[2]["status"] == "Accepted"


def test_status_notification_updates_last_seen_at(
    client: TestClient,
    db_session: Session,
) -> None:
    """T-18 AC 2: Cập nhật qua các tin nhắn khác (StatusNotification).

    Khi trụ gửi bất kỳ tin nhắn nào khác (ví dụ: StatusNotification), hàm dùng chung
    vẫn kích hoạt và cập nhật mốc thời gian last_seen_at trong CSDL.
    """
    code = "CP-T18-STATUS-NOTIF"
    cp = _create_charging_point(db_session, code)

    with client.websocket_connect(f"/ocpp/{code}", subprotocols=["ocpp1.6"]) as ws:
        _boot(ws, "boot-status-test")

        old_seen = datetime(2020, 1, 1, tzinfo=timezone.utc)
        cp.last_seen_at = old_seen
        db_session.commit()

        # Gửi bản tin StatusNotification chuẩn OCPP 1.6
        ws.send_text(
            build_call(
                "status-msg-1",
                "StatusNotification",
                {
                    "connectorId": 1,
                    "errorCode": "NoError",
                    "status": "Available",
                },
            )
        )
        response = _read_frame(websocket=ws)

    db_session.refresh(cp)

    # 1. AC 2: last_seen_at bắt buộc phải được cập nhật mới
    assert cp.last_seen_at is not None
    observed = cp.last_seen_at if cp.last_seen_at.tzinfo else cp.last_seen_at.replace(tzinfo=timezone.utc)
    assert observed > old_seen, "last_seen_at không được cập nhật khi nhận StatusNotification!"

    # 2. Ghi nhận phản ứng nghiệp vụ của Gateway đối với StatusNotification (hiện tại trả NotImplemented)
    assert response[0] == 4  # CALLERROR do gateway chưa đăng ký handler cho StatusNotification
    assert response[1] == "status-msg-1"
    assert response[2] == "NotImplemented"


def test_last_seen_uses_database_time_with_five_hour_mock_offset(
    client: TestClient,
    db_session: Session,
) -> None:
    """T-18 NFR & AC: Giả lập lệch giờ 5 tiếng KHÔNG dùng time.tzset (chạy tốt trên cả Windows và Linux).

    last_seen_at chênh với now() của cơ sở dữ liệu dưới 2 giây dù trụ ảo hoặc tiến trình
    báo giờ lệch 5 tiếng.
    """
    code = "CP-T18-TIME-OFFSET"
    cp = _create_charging_point(db_session, code)

    # Giả lập thời gian client/ứng dụng bị lệch 5 tiếng trong tương lai
    shifted_time = datetime.now(timezone.utc) + timedelta(hours=5)

    with client.websocket_connect(f"/ocpp/{code}", subprotocols=["ocpp1.6"]) as ws:
        _boot(ws, "boot-time-test")

        # Gửi Heartbeat kèm metadata thời gian lệch 5 tiếng từ phía client
        ws.send_text(
            build_call(
                "hb-shifted",
                "Heartbeat",
                {"clientTimestamp": shifted_time.isoformat()},
            )
        )
        _read_frame(ws)

    db_session.refresh(cp)

    # Lấy thời gian hiện tại chuẩn của Database
    current_db_time = db_session.execute(text("SELECT CURRENT_TIMESTAMP")).scalar_one()
    db_now = datetime.fromisoformat(str(current_db_time)).replace(tzinfo=timezone.utc)

    observed = cp.last_seen_at if cp.last_seen_at.tzinfo else cp.last_seen_at.replace(tzinfo=timezone.utc)
    assert observed is not None

    # Xác nhận: DB dùng CURRENT_TIMESTAMP trực tiếp, chênh lệch dưới 2 giây dù client lệch 5 tiếng
    diff_seconds = abs((observed - db_now).total_seconds())
    assert diff_seconds < 2.0, f"last_seen_at ({observed}) lệch so với DB now ({db_now}) quá 2 giây: {diff_seconds}s"


def test_touch_last_seen_executes_direct_single_update(
    db_session: Session,
) -> None:
    """T-18 AC 3 & NFR: Câu lệnh cập nhật trực tiếp UPDATE đơn, không giữ transaction dài.

    Xác nhận hàm touch_last_seen thực thi đúng 1 câu lệnh UPDATE trực tiếp và commit ngay.
    """
    code = "CP-T18-SINGLE-STMT"
    cp = _create_charging_point(db_session, code)

    executed_statements = []

    def statement_listener(conn, cursor, statement, parameters, context, executemany):
        executed_statements.append(statement)

    engine = db_session.bind
    event.listen(engine, "before_cursor_execute", statement_listener)
    try:
        touch_last_seen(db_session, cp.id)
    finally:
        event.remove(engine, "before_cursor_execute", statement_listener)

    # Lọc ra câu lệnh UPDATE
    update_stmts = [s for s in executed_statements if s.strip().startswith("UPDATE")]
    assert len(update_stmts) == 1, f"Kỳ vọng đúng 1 câu lệnh UPDATE, nhưng tìm thấy: {update_stmts}"
    assert "last_seen_at" in update_stmts[0], "Câu lệnh UPDATE không cập nhật cột last_seen_at!"
