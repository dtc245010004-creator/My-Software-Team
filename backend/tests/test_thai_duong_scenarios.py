"""Kiểm thử chi tiết các kịch bản theo tài liệu thai duong.md (S-07, S-08, S-14, S-15, S-16)."""

import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.security import create_access_token
from app.models.id_tag import IdTag
from app.models.ocpp_message import OcppMessage
from app.models.station import ChargingPoint, Station
from app.models.user import User
from app.ocpp.frames import build_call, build_call_result


def _create_charging_point(
    db_session: Session,
    code: str,
    *,
    station_is_active: bool = True,
    operator_id: int | None = None,
) -> ChargingPoint:
    station = Station(
        operator_id=operator_id,
        name=f"Trạm {code}",
        address="Địa chỉ kiểm thử",
        total_grid_capacity_kw=100.0,
        is_active=station_is_active,
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


def _create_user_and_id_tag(
    db_session: Session,
    code: str,
    *,
    status: str = "active",
) -> IdTag:
    user = User(
        username=f"user_{code.lower()}",
        email=f"user_{code.lower()}@example.test",
        password_hash="test-hash",
        role="CUSTOMER",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    tag = IdTag(
        code=code,
        user_id=user.id,
        status=status,
    )
    db_session.add(tag)
    db_session.commit()
    db_session.refresh(tag)
    return tag


def _operator_headers(db_session: Session) -> tuple[dict[str, str], User]:
    user = User(
        username="op_thai_duong",
        email="op_thai_duong@example.test",
        password_hash="test-hash",
        role="OPERATOR",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    token = create_access_token({"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}, user


def _read_frame(websocket) -> list:
    return json.loads(websocket.receive_text())


# ============================================================================
# S-07: Hệ thống đọc và ghi đúng ba loại khung tin nhắn OCPP
# ============================================================================

def test_s07_scenario2_malformed_frame_with_message_id_keeps_connection_alive(
    client: TestClient, db_session: Session
) -> None:
    """S-07 Kịch bản 2:

    Giả sử trụ gửi khung sai định dạng hoặc thiếu trường có kèm messageId,
    Khi hệ thống nhận,
    Thì trả về khung CALLERROR với mã lỗi đúng chuẩn thay vì đóng kết nối.
    """
    cp_code = "CP-S07-SC2"
    _create_charging_point(db_session, cp_code)

    with client.websocket_connect(
        f"/ocpp/{cp_code}", subprotocols=["ocpp1.6"]
    ) as websocket:
        # 1. Gửi khung thiếu trường bắt buộc (len < 4 đối với CALL loại 2)
        websocket.send_text('[2, "msg-missing-field", "BootNotification"]')
        err_frame1 = _read_frame(websocket)
        assert err_frame1[0] == 4
        assert err_frame1[1] == "msg-missing-field"
        assert err_frame1[2] == "ProtocolError"

        # 2. Gửi khung có payload không phải object JSON (string thay vì dict)
        websocket.send_text('[2, "msg-bad-payload", "BootNotification", "invalid-payload"]')
        err_frame2 = _read_frame(websocket)
        assert err_frame2[0] == 4
        assert err_frame2[1] == "msg-bad-payload"
        assert err_frame2[2] == "FormationViolation"

        # 3. Xác nhận kết nối vẫn sống, gửi tiếp BootNotification hợp lệ và nhận phản hồi bình thường
        websocket.send_text(
            build_call("boot-after-errors", "BootNotification", {"chargePointVendor": "V1"})
        )
        boot_res = _read_frame(websocket)
        assert boot_res[0] == 3
        assert boot_res[1] == "boot-after-errors"
        assert boot_res[2]["status"] == "Accepted"


def test_s07_scenario2_malformed_frame_without_message_id_closes_connection(
    client: TestClient, db_session: Session
) -> None:
    """S-07 Kịch bản 2 (biên):

    Khi khung sai định dạng không chứa messageId để phản hồi CALLERROR,
    hệ thống phải đóng kết nối với WebSocket close code 1002 (Protocol error).
    """
    cp_code = "CP-S07-SC2-CLOSE"
    _create_charging_point(db_session, cp_code)

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            f"/ocpp/{cp_code}", subprotocols=["ocpp1.6"]
        ) as websocket:
            websocket.send_text('{"not": "an array"}')
            _ = websocket.receive_text()

    assert exc_info.value.code == 1002


def test_s07_scenario3_unsupported_action_returns_not_implemented(
    client: TestClient, db_session: Session
) -> None:
    """S-07 Kịch bản 3:

    Giả sử trụ gửi tên hành động hệ thống chưa hỗ trợ sau khi đã Boot,
    Khi hệ thống nhận,
    Thì trả về CALLERROR mã NotImplemented.
    """
    cp_code = "CP-S07-SC3"
    _create_charging_point(db_session, cp_code)

    with client.websocket_connect(
        f"/ocpp/{cp_code}", subprotocols=["ocpp1.6"]
    ) as websocket:
        websocket.send_text(
            build_call("boot-s07", "BootNotification", {"chargePointVendor": "V1"})
        )
        assert _read_frame(websocket)[2]["status"] == "Accepted"

        websocket.send_text(build_call("unsupported-1", "CustomNonExistentAction", {}))
        resp1 = _read_frame(websocket)
        assert resp1[0] == 4
        assert resp1[1] == "unsupported-1"
        assert resp1[2] == "NotImplemented"


# ============================================================================
# S-15: Xác thực thẻ tài xế qua Authorize (End-to-End WebSocket & Idempotency)
# ============================================================================

def test_s15_authorize_via_websocket_and_idempotency_saved(
    client: TestClient, db_session: Session
) -> None:
    cp_code = "CP-S15-WS"
    _create_charging_point(db_session, cp_code)
    _create_user_and_id_tag(db_session, "RFID-VALID-9999", status="active")

    with client.websocket_connect(
        f"/ocpp/{cp_code}", subprotocols=["ocpp1.6"]
    ) as websocket:
        websocket.send_text(
            build_call("boot-s15", "BootNotification", {"chargePointVendor": "V1"})
        )
        assert _read_frame(websocket)[2]["status"] == "Accepted"

        auth_call = build_call(
            "auth-ws-001", "Authorize", {"idTag": "RFID-VALID-9999"}
        )
        websocket.send_text(auth_call)
        auth_res1 = _read_frame(websocket)
        assert auth_res1[0] == 3
        assert auth_res1[1] == "auth-ws-001"
        assert auth_res1[2]["idTagInfo"]["status"] == "Accepted"

        websocket.send_text(auth_call)
        auth_res2 = _read_frame(websocket)
        assert auth_res2 == auth_res1

    messages = (
        db_session.query(OcppMessage)
        .filter_by(charge_point_code=cp_code, message_id="auth-ws-001")
        .all()
    )
    assert len(messages) == 1
    assert messages[0].action == "Authorize"


# ============================================================================
# S-16: Vận hành viên khởi động lại trụ từ xa bằng Reset (Hard)
# ============================================================================

def test_s16_scenario1_hard_reset_accepted(
    client: TestClient, db_session: Session
) -> None:
    code = "CP-RESET-HARD"
    headers, operator = _operator_headers(db_session)
    _create_charging_point(db_session, code, operator_id=operator.id)

    with client.websocket_connect(
        f"/ocpp/{code}", subprotocols=["ocpp1.6"]
    ) as websocket:
        websocket.send_text(
            build_call("boot-hard-reset", "BootNotification", {"chargePointVendor": "V"})
        )
        assert _read_frame(websocket)[2]["status"] == "Accepted"

        with ThreadPoolExecutor(max_workers=1) as executor:
            response_future = executor.submit(
                client.post,
                f"/api/v1/chargers/{code}/reset",
                json={"type": "Hard"},
                headers=headers,
            )
            reset_call = _read_frame(websocket)
            assert reset_call[0] == 2
            assert reset_call[2] == "Reset"
            assert reset_call[3] == {"type": "Hard"}

            websocket.send_text(
                build_call_result(reset_call[1], {"status": "Accepted"})
            )
            response = response_future.result(timeout=3)

    assert response.status_code == 200
    assert response.json() == {"status": "Accepted"}
