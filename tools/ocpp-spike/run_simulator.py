"""Giữ N trụ OCPP 1.6J thật sự kết nối tới CSMS bằng client Spike K-01."""

import asyncio
import json
import os
import uuid
from datetime import datetime, timezone

import websockets

from seed_simulator_charge_points import seed_simulator_charge_points


async def call(socket, action: str, payload: dict) -> dict:
    message_id = uuid.uuid4().hex
    await socket.send(json.dumps([2, message_id, action, payload], separators=(",", ":")))
    while True:
        response = json.loads(await socket.recv())
        if response[0] == 3 and response[1] == message_id:
            return response[2]
        if response[0] == 4 and response[1] == message_id:
            raise RuntimeError(f"{action} bị từ chối: {response[2]} {response[3]}")


async def keep_charge_point_online(code: str, base_url: str, heartbeat_seconds: float):
    while True:
        try:
            async with websockets.connect(
                f"{base_url.rstrip('/')}/{code}",
                subprotocols=["ocpp1.6"],
                open_timeout=10,
                ping_interval=20,
            ) as socket:
                boot = await call(
                    socket,
                    "BootNotification",
                    {"chargePointVendor": "CSMS Simulator", "chargePointModel": "Virtual OCPP 1.6J"},
                )
                if boot.get("status") != "Accepted":
                    raise RuntimeError(f"{code}: BootNotification={boot}")
                await call(socket, "StatusNotification", {
                    "connectorId": 1,
                    "errorCode": "NoError",
                    "status": "Available",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                print(f"{code} đang trực tuyến", flush=True)
                while True:
                    await asyncio.sleep(heartbeat_seconds)
                    await call(socket, "Heartbeat", {})
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"{code} mất kết nối ({exc}); đang kết nối lại", flush=True)
            await asyncio.sleep(2)


async def main():
    count = int(os.getenv("SIMULATOR_CHARGE_POINT_COUNT", "20"))
    codes = seed_simulator_charge_points(count)
    base_url = os.getenv("SIMULATOR_WS_URL", "ws://127.0.0.1:8000/ocpp")
    heartbeat_seconds = max(1.0, float(os.getenv("SIMULATOR_HEARTBEAT_SECONDS", "15")))
    print(f"Khởi chạy {count} trụ OCPP ảo", flush=True)
    await asyncio.gather(
        *(keep_charge_point_online(code, base_url, heartbeat_seconds) for code in codes)
    )


if __name__ == "__main__":
    asyncio.run(main())
