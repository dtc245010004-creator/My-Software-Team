import json
from pathlib import Path

import pytest

from app.ocpp.frames import (
    CallErrorFrame,
    CallFrame,
    CallResultFrame,
    OcppFrameError,
    build_call,
    build_call_error,
    build_call_result,
    parse_frame,
)


def _captured_frames():
    """Nạp toàn bộ khung từ log thật của Spike K-01."""

    trace_path = (
        Path(__file__).resolve().parents[2]
        / "docs"
        / "spikes"
        / "k01-ocpp16j-trace.jsonl"
    )
    frame_types = {2: CallFrame, 3: CallResultFrame, 4: CallErrorFrame}
    frames = []
    for line in trace_path.read_text(encoding="utf-8").splitlines():
        record = json.loads(line)
        frame = record["frame"]
        frames.append(
            (
                json.dumps(frame, ensure_ascii=False, separators=(",", ":")),
                frame_types[frame[0]],
            )
        )
    return frames


# Dùng toàn bộ khung trong log thật. Log không có CALLERROR nên bổ sung một
# khung CALLERROR mẫu tự tạo do thiếu log Spike thật cho loại khung này.
VALID_FRAMES = [
    *_captured_frames(),
    (
        '[4,"msg-error","NotImplemented","Unsupported action: CustomAction",{}]',
        CallErrorFrame,
    ),
]


@pytest.mark.parametrize(("raw", "frame_type"), VALID_FRAMES)
def test_parse_and_build_round_trip_preserves_frame_value(raw, frame_type):
    frame = parse_frame(raw)

    assert isinstance(frame, frame_type)
    if isinstance(frame, CallFrame):
        rebuilt = build_call(frame.message_id, frame.action, frame.payload)
    elif isinstance(frame, CallResultFrame):
        rebuilt = build_call_result(frame.message_id, frame.payload)
    else:
        rebuilt = build_call_error(
            frame.message_id,
            frame.error_code,
            frame.description,
            frame.details,
        )

    assert json.loads(rebuilt) == json.loads(raw)


@pytest.mark.parametrize(
    ("raw", "error_code"),
    [
        ('{"not":"an array"}', "FormationViolation"),
        ('[2,"message-1","BootNotification"]', "ProtocolError"),
        ('[99,"message-1",{}]', "FormationViolation"),
        ('[3,"message-1",[]]', "FormationViolation"),
        ('[2,"message-1","CustomAction",{}]', "NotImplemented"),
    ],
)
def test_parse_invalid_frame_raises_with_ocpp_error_code(raw, error_code):
    with pytest.raises(OcppFrameError) as raised:
        parse_frame(raw)

    assert raised.value.error_code == error_code
