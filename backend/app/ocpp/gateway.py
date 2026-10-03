"""WebSocket gateway OCPP 1.6J, tách khỏi kênh telemetry của dashboard."""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import func, update
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.models.ocpp_message import OcppMessage
from app.models.station import ChargingPoint
from app.ocpp.dispatcher import OcppCallError, pending_responses
from app.ocpp.frames import (
    CallErrorFrame,
    CallFrame,
    CallResultFrame,
    OcppFrameError,
    build_call_error,
    build_call_result,
    parse_frame,
)
from app.ocpp.handlers.authorize import handle_authorize
from app.ocpp.handlers.boot_notification import handle_boot_notification
from app.ocpp.handlers.heartbeat import handle_heartbeat

logger = logging.getLogger(__name__)

router = APIRouter()

active_ocpp_connections: dict[str, WebSocket] = {}
connection_registry_lock = asyncio.Lock()

call_handlers = {
    "BootNotification": handle_boot_notification,
    "Authorize": handle_authorize,
    "Heartbeat": handle_heartbeat,
}


def touch_last_seen(db: Session, charge_point_id: int) -> None:
    """Cập nhật đúng một cột last_seen_at bằng giờ của CSDL."""
    db.execute(
        update(ChargingPoint)
        .where(ChargingPoint.id == charge_point_id)
        .values(last_seen_at=func.now())
    )
    db.commit()


@router.websocket("/ocpp/{charge_point_code}")
async def ocpp_endpoint(
    websocket: WebSocket,
    charge_point_code: str,
    db: Session = Depends(get_db),
) -> None:
    """Nhận kết nối OCPP và điều phối BootNotification cùng Authorize."""

    charging_point = (
        db.query(ChargingPoint)
        .options(joinedload(ChargingPoint.station))
        .filter(ChargingPoint.code == charge_point_code)
        .first()
    )

    if charging_point is None:
        client_ip = websocket.client.host if websocket.client else "unknown"

        logger.warning(
            "Từ chối kết nối OCPP với mã trụ lạ code=%s ip=%s",
            charge_point_code,
            client_ip,
        )

        await websocket.close(code=4001)
        return

    if "ocpp1.6" not in websocket.scope.get("subprotocols", []):
        await websocket.close(code=1002)
        return

    await websocket.accept(subprotocol="ocpp1.6")

    async with connection_registry_lock:
        previous_connection = active_ocpp_connections.get(charge_point_code)

        if previous_connection is not None and previous_connection is not websocket:
            try:
                await previous_connection.close(code=1000)

                logger.info(
                    "Kết nối OCPP cũ bị thay thế code=%s",
                    charge_point_code,
                )
            except (OSError, RuntimeError):
                logger.info(
                    "Kết nối OCPP cũ đã đóng hoặc không thể đóng code=%s",
                    charge_point_code,
                )

        active_ocpp_connections[charge_point_code] = websocket

    is_booted = False

    try:
        while True:
            raw_frame = await websocket.receive_text()

            # T-18: mọi message OCPP đi vào đều cập nhật last_seen_at.
            touch_last_seen(db, charging_point.id)

            try:
                frame = parse_frame(raw_frame)

            except OcppFrameError as exc:
                if exc.message_id is None:
                    await websocket.close(code=1002)
                    return

                error_code = exc.error_code
                description = exc.description

                if not is_booted and error_code == "NotImplemented":
                    error_code = "SecurityError"
                    description = (
                        "Trụ phải được chấp nhận qua BootNotification trước."
                    )

                await websocket.send_text(
                    build_call_error(
                        exc.message_id,
                        error_code,
                        description,
                        {},
                    )
                )

                continue

            if isinstance(frame, (CallResultFrame, CallErrorFrame)):
                pending_response = pending_responses.get(frame.message_id)

                if pending_response is not None and not pending_response.done():
                    if isinstance(frame, CallResultFrame):
                        pending_response.set_result(frame.payload)
                    else:
                        pending_response.set_exception(
                            OcppCallError(
                                frame.error_code,
                                frame.description,
                                frame.details,
                            )
                        )

                    continue

                if not is_booted:
                    await websocket.send_text(
                        build_call_error(
                            frame.message_id,
                            "SecurityError",
                            "Trụ phải được chấp nhận qua BootNotification trước.",
                            {},
                        )
                    )

                continue

            if not isinstance(frame, CallFrame):
                continue

            # Khóa chống lặp nằm trong CSDL để tồn tại qua kết nối mới
            # hoặc lần khởi động lại tiến trình.
            saved_message = (
                db.query(OcppMessage)
                .filter(
                    OcppMessage.charge_point_code == charge_point_code,
                    OcppMessage.message_id == frame.message_id,
                )
                .first()
            )

            if saved_message is not None:
                if saved_message.action != frame.action:
                    logger.warning(
                        "OCPP message ID được dùng lại với action khác "
                        "code=%s message_id=%s saved_action=%s received_action=%s",
                        charge_point_code,
                        frame.message_id,
                        saved_message.action,
                        frame.action,
                    )

                await websocket.send_text(saved_message.response_payload)

                if (
                    saved_message.action == "BootNotification"
                    and frame.action == "BootNotification"
                ):
                    cached_frame = json.loads(saved_message.response_payload)
                    is_booted = cached_frame[2].get("status") == "Accepted"

                continue

            if not is_booted and frame.action != "BootNotification":
                await websocket.send_text(
                    build_call_error(
                        frame.message_id,
                        "SecurityError",
                        "Trụ phải được chấp nhận qua BootNotification trước.",
                        {},
                    )
                )

                continue

            handler = call_handlers.get(frame.action)

            if handler is None:
                await websocket.send_text(
                    build_call_error(
                        frame.message_id,
                        "NotImplemented",
                        f"Action chưa được triển khai: {frame.action}.",
                        {},
                    )
                )

                continue

            result = handler(
                db,
                charging_point,
                frame.payload,
            )

            response = build_call_result(
                frame.message_id,
                result,
            )

            db.add(
                OcppMessage(
                    charge_point_code=charge_point_code,
                    message_id=frame.message_id,
                    action=frame.action,
                    response_payload=response,
                )
            )

            db.commit()

            await websocket.send_text(response)

            if (
                frame.action == "BootNotification"
                and result["status"] == "Accepted"
            ):
                is_booted = True

    except WebSocketDisconnect:
        pass

    finally:
        if active_ocpp_connections.get(charge_point_code) is websocket:
            del active_ocpp_connections[charge_point_code]