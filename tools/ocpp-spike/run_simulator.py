"""Giữ N trụ OCPP 1.6J thật sự kết nối tới CSMS bằng client Spike K-01 và tự động xử lý RemoteStart/RemoteStop."""

import asyncio
import json
import os
import uuid
from datetime import datetime, timezone

import websockets
from seed_simulator_charge_points import seed_simulator_charge_points


class OcppClient:
    def __init__(self, code: str, socket):
        self.code = code
        self.socket = socket
        self.pending_futures: dict[str, asyncio.Future] = {}
        self.active_transactions: dict[int, dict] = {}

    async def call(self, action: str, payload: dict) -> dict:
        msg_id = uuid.uuid4().hex
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self.pending_futures[msg_id] = future
        frame = [2, msg_id, action, payload]
        await self.socket.send(json.dumps(frame, separators=(",", ":")))
        try:
            return await asyncio.wait_for(future, timeout=20.0)
        finally:
            self.pending_futures.pop(msg_id, None)

    async def send_result(self, msg_id: str, payload: dict):
        frame = [3, msg_id, payload]
        await self.socket.send(json.dumps(frame, separators=(",", ":")))

    async def send_error(self, msg_id: str, error_code: str, error_description: str):
        frame = [4, msg_id, error_code, error_description, {}]
        await self.socket.send(json.dumps(frame, separators=(",", ":")))

    async def handle_server_call(self, msg_id: str, action: str, payload: dict):
        if action == "RemoteStartTransaction":
            # 1. Trả lời CALLRESULT Accepted
            await self.send_result(msg_id, {"status": "Accepted"})
            connector_id = payload.get("connectorId", 1)
            id_tag = payload.get("idTag", f"REMOTE-{self.code}")

            # 2. Bắt đầu phiên sạc: StatusNotification -> Preparing
            await self.call(
                "StatusNotification",
                {
                    "connectorId": connector_id,
                    "errorCode": "NoError",
                    "status": "Preparing",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )
            await asyncio.sleep(0.3)

            # 3. Gửi StartTransaction để CSMS kích hoạt phiên sạc
            start_res = await self.call(
                "StartTransaction",
                {
                    "connectorId": connector_id,
                    "idTag": id_tag,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "meterStart": 0,
                },
            )
            trans_id = start_res.get("transactionId")
            print(
                f"[{self.code}] Đã khởi động phiên sạc thành công: TransactionId={trans_id}",
                flush=True,
            )

            # 4. Chuyển trạng thái sang Charging
            await self.call(
                "StatusNotification",
                {
                    "connectorId": connector_id,
                    "errorCode": "NoError",
                    "status": "Charging",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )

            if trans_id:
                asyncio.create_task(self._charge_meter_loop(trans_id, connector_id))

        elif action == "RemoteStopTransaction":
            trans_id = payload.get("transactionId")
            await self.send_result(msg_id, {"status": "Accepted"})
            print(
                f"[{self.code}] Nhận lệnh dừng phiên sạc: TransactionId={trans_id}",
                flush=True,
            )
            self.active_transactions.pop(trans_id, None)
            await self.call(
                "StopTransaction",
                {
                    "transactionId": trans_id,
                    "idTag": f"REMOTE-{self.code}",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "meterStop": 10000,
                    "reason": "Remote",
                },
            )
            await self.call(
                "StatusNotification",
                {
                    "connectorId": 1,
                    "errorCode": "NoError",
                    "status": "Available",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )

        elif action == "Reset":
            await self.send_result(msg_id, {"status": "Accepted"})
        else:
            await self.send_result(msg_id, {})

    async def _charge_meter_loop(self, trans_id: int, connector_id: int):
        self.active_transactions[trans_id] = {"meter": 0}
        current_meter = 0
        current_soc = 20
        while trans_id in self.active_transactions:
            await asyncio.sleep(5)
            if trans_id not in self.active_transactions:
                break
            current_meter += 500  # +0.5 kWh mỗi nhịp
            current_soc = min(100, current_soc + 2)
            try:
                await self.call(
                    "MeterValues",
                    {
                        "connectorId": connector_id,
                        "transactionId": trans_id,
                        "meterValue": [
                            {
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "sampledValue": [
                                    {
                                        "value": str(current_meter),
                                        "measurand": "Energy.Active.Import.Register",
                                        "unit": "Wh",
                                    },
                                    {
                                        "value": str(current_soc),
                                        "measurand": "SoC",
                                        "unit": "Percent",
                                    },
                                ],
                            }
                        ],
                    },
                )
            except Exception:
                break


async def keep_charge_point_online(code: str, base_url: str, heartbeat_seconds: float):
    while True:
        try:
            async with websockets.connect(
                f"{base_url.rstrip('/')}/{code}",
                subprotocols=["ocpp1.6"],
                open_timeout=10,
                ping_interval=20,
            ) as socket:
                client = OcppClient(code, socket)

                async def receiver_loop():
                    async for raw in socket:
                        try:
                            msg = json.loads(raw)
                        except Exception:
                            continue
                        msg_type = msg[0]
                        if msg_type in (3, 4):  # CALLRESULT / CALLERROR
                            msg_id = msg[1]
                            fut = client.pending_futures.get(msg_id)
                            if fut and not fut.done():
                                if msg_type == 3:
                                    fut.set_result(msg[2])
                                else:
                                    fut.set_exception(
                                        RuntimeError(f"CALLERROR: {msg[2]} {msg[3]}")
                                    )
                        elif msg_type == 2:  # CALL từ server
                            msg_id = msg[1]
                            action = msg[2]
                            payload = msg[3]
                            asyncio.create_task(
                                client.handle_server_call(msg_id, action, payload)
                            )

                recv_task = asyncio.create_task(receiver_loop())

                boot = await client.call(
                    "BootNotification",
                    {
                        "chargePointVendor": "CSMS Simulator",
                        "chargePointModel": "Virtual OCPP 1.6J",
                    },
                )
                if boot.get("status") != "Accepted":
                    raise RuntimeError(f"{code}: BootNotification={boot}")

                await client.call(
                    "StatusNotification",
                    {
                        "connectorId": 1,
                        "errorCode": "NoError",
                        "status": "Available",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    },
                )
                print(f"{code} đang trực tuyến", flush=True)

                async def heartbeat_loop():
                    while True:
                        await asyncio.sleep(heartbeat_seconds)
                        await client.call("Heartbeat", {})

                hb_task = asyncio.create_task(heartbeat_loop())
                try:
                    done, pending = await asyncio.wait(
                        [hb_task, recv_task],
                        return_when=asyncio.FIRST_EXCEPTION,
                    )
                    for t in pending:
                        t.cancel()
                    for t in done:
                        t.result()
                finally:
                    hb_task.cancel()
                    recv_task.cancel()
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
        *(
            keep_charge_point_online(code, base_url, heartbeat_seconds)
            for code in codes
        )
    )


if __name__ == "__main__":
    asyncio.run(main())
