import argparse
import asyncio
import json
import time
from uuid import uuid4

from websockets import connect


def parse_codes(value: str) -> list[str]:
    codes = [code.strip() for code in value.split(",") if code.strip()]

    if not codes:
        raise ValueError("Phải cung cấp ít nhất một mã trụ.")

    return codes


async def recv_json(websocket) -> list:
    raw = await websocket.recv()
    return json.loads(raw)


async def boot(websocket, code: str) -> None:
    message_id = f"boot-{code}-{uuid4().hex[:8]}"

    payload = [
        2,
        message_id,
        "BootNotification",
        {
            "chargePointVendor": "StagingSimulator",
            "chargePointModel": "OCPP-S06",
            "firmwareVersion": "1.0.0",
        },
    ]

    await websocket.send(json.dumps(payload))

    response = await asyncio.wait_for(
        recv_json(websocket),
        timeout=5,
    )

    if response[0:2] != [3, message_id]:
        raise RuntimeError(
            f"{code}: BootNotification response không hợp lệ: {response}"
    )

    if response[2].get("status") != "Accepted":
        raise RuntimeError(
            f"{code}: BootNotification bị từ chối: {response}"
        )


async def heartbeat(websocket, code: str) -> None:
    message_id = f"heartbeat-{code}-{uuid4().hex[:8]}"

    payload = [
        2,
        message_id,
        "Heartbeat",
        {},
    ]

    await websocket.send(json.dumps(payload))

    response = await asyncio.wait_for(
        recv_json(websocket),
        timeout=5,
    )

    if response[0:2] != [3, message_id]:
        raise RuntimeError(
            f"{code}: Heartbeat response không hợp lệ: {response}"
        )

    if "currentTime" not in response[2]:
        raise RuntimeError(
            f"{code}: Heartbeat không có currentTime: {response}"
        )


async def run_charge_point(
    base_url: str,
    code: str,
    hold_seconds: int,
    heartbeat_seconds: int,
) -> None:
    url = f"{base_url.rstrip('/')}/{code}"

    started = time.perf_counter()

    async with connect(
        url,
        subprotocols=["ocpp1.6"],
        open_timeout=5,
        ping_interval=20,
        ping_timeout=20,
    ) as websocket:
        await boot(websocket, code)

        deadline = time.perf_counter() + hold_seconds

        while time.perf_counter() < deadline:
            remaining = deadline - time.perf_counter()

            await asyncio.sleep(
                min(heartbeat_seconds, max(0, remaining))
            )

            if time.perf_counter() >= deadline:
                break

            await heartbeat(websocket, code)

    elapsed = time.perf_counter() - started

    print(f"[PASS] {code}: giữ kết nối {elapsed:.1f}s")


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Kiểm tra OCPP staging theo T-12/T-19."
    )

    parser.add_argument(
        "--base-url",
        required=True,
        help="Ví dụ: ws://127.0.0.1:8000/ocpp",
    )

    parser.add_argument(
        "--codes",
        required=True,
        help="Danh sách mã trụ, phân tách bằng dấu phẩy.",
    )

    parser.add_argument(
        "--hold-seconds",
        type=int,
        default=600,
    )

    parser.add_argument(
        "--heartbeat-seconds",
        type=int,
        default=30,
    )

    parser.add_argument(
        "--expect-count",
        type=int,
        default=None,
    )

    args = parser.parse_args()

    codes = parse_codes(args.codes)

    if args.expect_count is not None and len(codes) != args.expect_count:
        raise SystemExit(
            f"Cần {args.expect_count} mã trụ nhưng nhận {len(codes)} mã."
        )

    print(
        f"Kiểm tra {len(codes)} connection, "
        f"giữ {args.hold_seconds}s..."
    )

    started = time.perf_counter()

    results = await asyncio.gather(
        *(
            run_charge_point(
                args.base_url,
                code,
                args.hold_seconds,
                args.heartbeat_seconds,
            )
            for code in codes
        ),
        return_exceptions=True,
    )

    failures = [
        result
        for result in results
        if isinstance(result, Exception)
    ]

    elapsed = time.perf_counter() - started

    if failures:
        for failure in failures:
            print(f"[FAIL] {failure}")

        raise SystemExit(1)

    print(
        f"[PASS] {len(codes)} connection đồng thời, "
        f"tổng thời gian {elapsed:.1f}s"
    )


if __name__ == "__main__":
    asyncio.run(main())
