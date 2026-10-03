"""Đọc và ghi các khung JSON OCPP 1.6J, độc lập với tầng kết nối."""

import json
from dataclasses import dataclass
from typing import Any, TypeAlias

# Phạm vi action của Spike K-01 dùng cho lớp nền S-07.
SUPPORTED_ACTIONS = frozenset(
    {
        "BootNotification",
        "Heartbeat",
        "StatusNotification",
        "Authorize",
        "StartTransaction",
        "MeterValues",
        "StopTransaction",
        "Reset",
    }
)


@dataclass(frozen=True)
class CallFrame:
    """Khung CALL OCPP 1.6J."""

    message_id: str
    action: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class CallResultFrame:
    """Khung CALLRESULT OCPP 1.6J."""

    message_id: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class CallErrorFrame:
    """Khung CALLERROR OCPP 1.6J."""

    message_id: str
    error_code: str
    description: str
    details: dict[str, Any]


Frame: TypeAlias = CallFrame | CallResultFrame | CallErrorFrame


class OcppFrameError(ValueError):
    """Lỗi khung kèm mã CALLERROR để tầng giao tiếp có thể phản hồi."""

    def __init__(
        self, error_code: str, description: str, message_id: str | None = None
    ) -> None:
        super().__init__(description)
        self.error_code = error_code
        self.description = description
        self.message_id = message_id


def _reject_non_finite(value: str) -> None:
    raise ValueError(f"Giá trị JSON không hợp lệ: {value}")  # noqa: TRY003


def _error(
    error_code: str, description: str, message_id: str | None = None
) -> OcppFrameError:
    return OcppFrameError(error_code, description, message_id)


def _message_id(frame: list[Any]) -> str | None:
    if len(frame) > 1 and isinstance(frame[1], str):
        return frame[1]
    return None


def _require_message_id(frame: list[Any]) -> str:
    message_id = _message_id(frame)
    if message_id is None or not message_id:
        raise _error("FormationViolation", "Mã tin nhắn phải là chuỗi không rỗng.")
    return message_id


def parse_frame(raw: str) -> Frame:
    """Phân tích một khung OCPP 1.6J hoặc ném lỗi mang mã CALLERROR chuẩn."""

    if not isinstance(raw, str):
        raise _error("FormationViolation", "Khung phải được cung cấp dưới dạng JSON.")

    try:
        frame = json.loads(raw, parse_constant=_reject_non_finite)
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        raise _error("FormationViolation", "Khung JSON không hợp lệ.") from exc

    if not isinstance(frame, list):
        raise _error("FormationViolation", "Khung OCPP phải là một mảng JSON.")
    if not frame:
        raise _error("FormationViolation", "Khung OCPP thiếu mã loại khung.")

    message_id = _message_id(frame)
    message_type = frame[0]
    if type(message_type) is not int:
        raise _error(
            "FormationViolation", "Mã loại khung phải là số nguyên.", message_id
        )
    if message_type not in (2, 3, 4):
        raise _error(
            "FormationViolation",
            f"Loại khung OCPP không được nhận diện: {message_type}.",
            message_id,
        )

    expected_lengths = {2: 4, 3: 3, 4: 5}
    if len(frame) < expected_lengths[message_type]:
        raise _error(
            "ProtocolError",
            f"Khung loại {message_type} thiếu phần tử bắt buộc.",
            message_id,
        )
    if len(frame) > expected_lengths[message_type]:
        raise _error(
            "FormationViolation",
            f"Khung loại {message_type} phải có "
            f"{expected_lengths[message_type]} phần tử.",
            message_id,
        )

    message_id = _require_message_id(frame)
    if message_type == 2:
        action, payload = frame[2], frame[3]
        if not isinstance(action, str) or not action:
            raise _error(
                "FormationViolation", "Tên action phải là chuỗi không rỗng.", message_id
            )
        if action not in SUPPORTED_ACTIONS:
            raise _error(
                "NotImplemented",
                f"Action chưa được hỗ trợ: {action}.",
                message_id,
            )
        if not isinstance(payload, dict):
            raise _error(
                "FormationViolation",
                "Payload của CALL phải là object JSON.",
                message_id,
            )
        return CallFrame(message_id, action, payload)

    if message_type == 3:
        payload = frame[2]
        if not isinstance(payload, dict):
            raise _error(
                "FormationViolation",
                "Payload của CALLRESULT phải là object JSON.",
                message_id,
            )
        return CallResultFrame(message_id, payload)

    error_code, description, details = frame[2], frame[3], frame[4]
    if not isinstance(error_code, str) or not isinstance(description, str):
        raise _error(
            "FormationViolation",
            "Mã lỗi và mô tả của CALLERROR phải là chuỗi.",
            message_id,
        )
    if not isinstance(details, dict):
        raise _error(
            "FormationViolation",
            "Details của CALLERROR phải là object JSON.",
            message_id,
        )
    return CallErrorFrame(message_id, error_code, description, details)


def _build(frame: list[Any]) -> str:
    return json.dumps(frame, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def build_call(message_id: str, action: str, payload: dict[str, Any]) -> str:
    """Đóng gói một khung CALL thành chuỗi JSON."""

    return _build([2, message_id, action, payload])


def build_call_result(message_id: str, payload: dict[str, Any]) -> str:
    """Đóng gói một khung CALLRESULT thành chuỗi JSON."""

    return _build([3, message_id, payload])


def build_call_error(
    message_id: str,
    error_code: str,
    description: str,
    details: dict[str, Any],
) -> str:
    """Đóng gói một khung CALLERROR thành chuỗi JSON."""

    return _build([4, message_id, error_code, description, details])
