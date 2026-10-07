import json
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.security import create_access_token
from app.models.station import ChargingPoint, Station
from app.models.user import User
from app.ocpp.frames import build_call, build_call_error, build_call_result
from app.ocpp.gateway import active_ocpp_connections


def _create_charging_point(
    db_session: Session, code: str, operator_id: int | None = None
) -> ChargingPoint:
    charging_point = ChargingPoint(
        station=Station(
            operator_id=operator_id,
            name=f"Trạm {code}",
            address="Địa chỉ kiểm thử",
            total_grid_capacity_kw=100.0,
            is_active=True,
        ),
        code=code,
        max_power_kw=60.0,
    )
    db_session.add(charging_point)
    db_session.commit()
    db_session.refresh(charging_point)
    return charging_point


def _operator_headers(
    db_session: Session, role: str = "OPERATOR"
) -> tuple[dict[str, str], User]:
    user = User(
        username=f"reset_{role.lower()}",
        email=f"reset_{role.lower()}@example.test",
        password_hash="test-hash",
        role=role,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    token = create_access_token({"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}, user


def _read_frame(websocket) -> list:
    return json.loads(websocket.receive_text())


def _boot_charge_point(websocket) -> None:
    websocket.send_text(
        build_call(
            "boot-reset-test",
            "BootNotification",
            {"chargePointVendor": "Vendor", "chargePointModel": "Model"},
        )
    )
    assert _read_frame(websocket)[2]["status"] == "Accepted"


def test_reset_online_forwards_callresult_and_processes_other_calls(
    client: TestClient, db_session: Session
) -> None:
    code = "CP-RESET-ONLINE"
    headers, operator = _operator_headers(db_session)
    _create_charging_point(db_session, code, operator.id)

    with client.websocket_connect(
        f"/ocpp/{code}", subprotocols=["ocpp1.6"]
    ) as websocket:
        _boot_charge_point(websocket)

        with ThreadPoolExecutor(max_workers=1) as executor:
            response_future = executor.submit(
                client.post,
                f"/api/v1/chargers/{code}/reset",
                json={"type": "Soft"},
                headers=headers,
            )
            reset_call = _read_frame(websocket)
            assert reset_call[0] == 2
            assert reset_call[2:] == ["Reset", {"type": "Soft"}]

            # Lệnh do trụ chủ động gửi vẫn được xử lý trong lúc CSMS chờ Reset.
            websocket.send_text(
                build_call(
                    "authorize-during-reset", "Authorize", {"idTag": "MISS-1234"}
                )
            )
            authorize_result = _read_frame(websocket)
            assert authorize_result == [
                3,
                "authorize-during-reset",
                {"idTagInfo": {"status": "Invalid"}},
            ]

            websocket.send_text(
                build_call_result(reset_call[1], {"status": "Accepted"})
            )
            response = response_future.result(timeout=3)

    assert response.status_code == 200
    assert response.json() == {"status": "Accepted"}
    assert code not in active_ocpp_connections


def test_reset_offline_returns_conflict_without_dispatching(
    client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers, operator = _operator_headers(db_session)
    _create_charging_point(db_session, "CP-RESET-OFFLINE", operator.id)
    send_call = AsyncMock()
    monkeypatch.setattr("app.api.v1.endpoints.chargers.send_call_and_wait", send_call)

    response = client.post(
        "/api/v1/chargers/CP-RESET-OFFLINE/reset",
        json={"type": "Hard"},
        headers=headers,
    )

    assert response.status_code == 409
    send_call.assert_not_awaited()


def test_reset_no_response_returns_gateway_timeout(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.api.v1.endpoints import chargers

    code = "CP-RESET-TIMEOUT"
    headers, operator = _operator_headers(db_session)
    _create_charging_point(db_session, code, operator.id)
    send_call = chargers.send_call_and_wait

    async def short_timeout(
        charge_point_code: str,
        action: str,
        payload: dict,
        timeout_seconds: float | None = None,
    ) -> dict:
        return await send_call(charge_point_code, action, payload, timeout_seconds=0.5)

    monkeypatch.setattr(chargers, "send_call_and_wait", short_timeout)

    with client.websocket_connect(
        f"/ocpp/{code}", subprotocols=["ocpp1.6"]
    ) as websocket:
        _boot_charge_point(websocket)
        with ThreadPoolExecutor(max_workers=1) as executor:
            response_future = executor.submit(
                client.post,
                f"/api/v1/chargers/{code}/reset",
                json={"type": "Hard"},
                headers=headers,
            )
            reset_call = _read_frame(websocket)
            assert reset_call[2:] == ["Reset", {"type": "Hard"}]
            response = response_future.result(timeout=3)

    assert response.status_code == 504
    assert "không phản hồi" in response.json()["detail"]


def test_reset_returns_bad_gateway_for_ocpp_callerror(
    client: TestClient, db_session: Session
) -> None:
    code = "CP-RESET-CALLERROR"
    headers, operator = _operator_headers(db_session)
    _create_charging_point(db_session, code, operator.id)

    with client.websocket_connect(
        f"/ocpp/{code}", subprotocols=["ocpp1.6"]
    ) as websocket:
        _boot_charge_point(websocket)
        with ThreadPoolExecutor(max_workers=1) as executor:
            response_future = executor.submit(
                client.post,
                f"/api/v1/chargers/{code}/reset",
                json={"type": "Hard"},
                headers=headers,
            )
            reset_call = _read_frame(websocket)
            websocket.send_text(
                build_call_error(
                    reset_call[1], "InternalError", "Lỗi trụ", {"reason": "test"}
                )
            )
            response = response_future.result(timeout=3)

    assert response.status_code == 502
    assert response.json()["detail"] == {
        "error_code": "InternalError",
        "description": "Lỗi trụ",
        "details": {"reason": "test"},
    }


def test_reset_rejects_customer_role(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _ = _operator_headers(db_session, role="CUSTOMER")
    send_call = AsyncMock()
    monkeypatch.setattr("app.api.v1.endpoints.chargers.send_call_and_wait", send_call)

    response = client.post(
        "/api/v1/chargers/CP-RESET-FORBIDDEN/reset",
        json={"type": "Soft"},
        headers=headers,
    )

    assert response.status_code == 403
    send_call.assert_not_awaited()
