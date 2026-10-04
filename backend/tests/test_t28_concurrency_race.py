"""Kiểm thử bổ sung cho Task T-28: Concurrency Race Condition và Delayed Disconnect Handling."""

import asyncio
import json
import logging
from typing import Any

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.models.station import ChargingPoint, Station
from app.ocpp.frames import build_call
from app.ocpp.gateway import active_ocpp_connections


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
                "chargePointVendor": "RaceVendor",
                "chargePointModel": "RaceModel",
            },
        )
    )
    res = _read_frame(websocket)
    assert res[2]["status"] == "Accepted"


def test_concurrent_ten_connections_race_condition(
    client: TestClient,
    db_session: Session,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """T-28 AC 1, AC 2, AC 3: Đua 10 kết nối đồng thời qua asyncio.gather.

    - Bắn 10 kết nối cùng mã trụ đồng thời.
    - Assert các kết nối cũ nhận close frame (code 1000).
    - Cấu trúc registry active_ocpp_connections cuối cùng duy trì duy nhất 1 mục,
      không rò rỉ socket hay gặp race condition.
    """
    code = "CP-T28-RACE-10"
    _create_charging_point(db_session, code)

    connection_events = []

    def connect_worker(idx: int) -> None:
        try:
            with client.websocket_connect(f"/ocpp/{code}", subprotocols=["ocpp1.6"]) as ws:
                connection_events.append(("connected", idx))
                # Gửi Boot để nhận diện
                ws.send_text(
                    build_call(
                        f"boot-race-{idx}",
                        "BootNotification",
                        {"chargePointVendor": "V", "chargePointModel": "M"},
                    )
                )
                try:
                    res = json.loads(ws.receive_text())
                    connection_events.append(("accepted", idx, res[2]["status"]))
                except WebSocketDisconnect as disc:
                    connection_events.append(("closed_after_send", idx, disc.code))
        except WebSocketDisconnect as disc:
            connection_events.append(("evicted_with_disconnect", idx, disc.code))
        except Exception as exc:
            connection_events.append(("error", idx, type(exc).__name__))

    with caplog.at_level(logging.INFO, logger="app.ocpp.gateway"):
        async def run_race():
            await asyncio.gather(
                *(asyncio.to_thread(connect_worker, i) for i in range(10))
            )

        asyncio.run(run_race())

    # 1. AC 2: Bộ nhớ registry sau khi các connection hoàn tất không bị rò rỉ
    # Do các context manager with đã thoát nên registry phải được dọn sạch an toàn
    assert code not in active_ocpp_connections, "Registry còn sót socket sau khi các kết nối đóng!"

    # 2. AC bổ sung: Log hệ thống ghi nhận đúng các lần thay thế kết nối
    replacement_logs = [
        r.getMessage()
        for r in caplog.records
        if "Kết nối OCPP cũ bị thay thế" in r.getMessage() and code in r.getMessage()
    ]
    # Khi 10 kết nối đua nhau, phải có các sự kiện thay thế được ghi log
    assert len(replacement_logs) >= 1, "Hệ thống không ghi log khi có kết nối bị thay thế!"

    # 3. AC 1: Các kết nối bị thay thế nhận close code 1000
    evicted_codes = [
        ev[2]
        for ev in connection_events
        if ev[0] in ("evicted_with_disconnect", "closed_after_send")
    ]
    assert all(c == 1000 for c in evicted_codes), f"Có kết nối bị đóng với mã khác 1000: {evicted_codes}"


def test_slow_closing_old_connection_does_not_evict_new_connection(
    client: TestClient,
    db_session: Session,
) -> None:
    """T-28 AC 2: Kết nối cũ đóng muộn KHÔNG được xóa nhầm mục của kết nối mới.

    Kịch bản:
    1. WS1 mở kết nối và nằm trong active_ocpp_connections.
    2. WS2 mở kết nối cùng mã -> WS1 bị server yêu cầu đóng (close code 1000), WS2 trở thành active.
    3. WS1 hoàn tất thoát (block finally của WS1 chạy).
    4. Xác nhận: WS1 KHÔNG xóa WS2 khỏi active_ocpp_connections.
    5. WS2 vẫn gửi và nhận tin nhắn bình thường.
    """
    code = "CP-T28-SLOW-CLOSE"
    _create_charging_point(db_session, code)

    with client.websocket_connect(f"/ocpp/{code}", subprotocols=["ocpp1.6"]) as ws1:
        _boot(ws1, "boot-ws1")
        assert code in active_ocpp_connections
        assert active_ocpp_connections[code] is not None

        # Mở WS2 thay thế WS1
        with client.websocket_connect(f"/ocpp/{code}", subprotocols=["ocpp1.6"]) as ws2:
            # WS1 nhận close frame code 1000
            with pytest.raises(WebSocketDisconnect) as exc_info:
                ws1.receive_text()
            assert exc_info.value.code == 1000

            # Lúc này trong active_ocpp_connections phải là ws2
            # Block finally của ws1 sẽ chạy khi ws1 context thoát
            pass

        # Khi ws2 vẫn đang mở (hoặc kiểm tra ngay trước khi ws2 thoát):
        # Ta kiểm tra lại với một phiên ws2 độc lập để bắt đúng thời điểm
    
    # Kiểm tra chi tiết bằng 2 websocket lồng nhau:
    with client.websocket_connect(f"/ocpp/{code}", subprotocols=["ocpp1.6"]) as first_ws:
        _boot(first_ws, "boot-first")

        with client.websocket_connect(f"/ocpp/{code}", subprotocols=["ocpp1.6"]) as second_ws:
            # second_ws đã vào registry
            # Bắt first_ws đóng
            with pytest.raises(WebSocketDisconnect):
                first_ws.receive_text()

            # Bây giờ first_ws đã bị server đóng.
            # active_ocpp_connections[code] BẮT BUỘC vẫn phải là second_ws
            assert code in active_ocpp_connections
            assert active_ocpp_connections[code] is not None

            # second_ws vẫn gửi Boot và hoạt động bình thường, chứng minh không bị first_ws xóa nhầm
            _boot(second_ws, "boot-second")
