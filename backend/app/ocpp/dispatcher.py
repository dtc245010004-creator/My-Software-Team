"""Gửi CALL OCPP từ CSMS và ghép phản hồi theo message ID."""

import asyncio
from typing import Any
from uuid import uuid4

from app.core.config import settings
from app.ocpp.frames import build_call


class OcppCallError(Exception):
    """CALLERROR do trụ trả về cho một lệnh do CSMS khởi tạo."""

    def __init__(self, error_code: str, description: str, details: dict[str, Any]):
        super().__init__(f"{error_code}: {description}")
        self.error_code = error_code
        self.description = description
        self.details = details


class ChargePointOfflineError(ConnectionError):
    """Lỗi khi trụ không có kết nối OCPP đang hoạt động."""

    def __init__(self, charge_point_code: str) -> None:
        super().__init__(f"Trụ {charge_point_code} đang ngoại tuyến.")


class OcppCallTimeoutError(TimeoutError):
    """Lỗi khi trụ không phản hồi CALL trong thời gian chờ."""

    def __init__(self, charge_point_code: str, action: str, timeout: float) -> None:
        super().__init__(
            f"Trụ {charge_point_code} không phản hồi action {action} "
            f"trong {timeout} giây."
        )


pending_responses: dict[str, asyncio.Future[dict[str, Any]]] = {}


async def send_call_and_wait(
    charge_point_code: str,
    action: str,
    payload: dict[str, Any],
    timeout_seconds: float | None = None,
) -> dict[str, Any]:
    """Gửi CALL tới trụ online và đợi CALLRESULT khớp message ID.

    Future được đăng ký trước khi gửi để phản hồi đến ngay cũng không bị lỡ.
    Gateway vẫn nhận và xử lý các frame khác trong lúc coroutine này chờ.
    """

    from app.ocpp.gateway import active_ocpp_connections

    websocket = active_ocpp_connections.get(charge_point_code)
    if websocket is None:
        raise ChargePointOfflineError(charge_point_code)

    timeout = (
        settings.OCPP_CALL_TIMEOUT_SECONDS
        if timeout_seconds is None
        else timeout_seconds
    )
    message_id = str(uuid4())
    future = asyncio.get_running_loop().create_future()
    pending_responses[message_id] = future

    try:
        await websocket.send_text(build_call(message_id, action, payload))
        return await asyncio.wait_for(future, timeout=timeout)
    except asyncio.TimeoutError as exc:
        raise OcppCallTimeoutError(charge_point_code, action, timeout) from exc
    finally:
        if pending_responses.get(message_id) is future:
            del pending_responses[message_id]
        if not future.done():
            future.cancel()
