"""Run the disposable K-01 OCPP simulator against a minimal WebSocket CSMS."""

import argparse
import asyncio
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

import websockets


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = Path(__file__).with_name("chargepoint.js")
TRACE = ROOT / "docs" / "spikes" / "k01-ocpp16j-trace.jsonl"
REQUIRED_ACTIONS = {
    "BootNotification",
    "Heartbeat",
    "StatusNotification",
    "Authorize",
    "StartTransaction",
    "MeterValues",
    "StopTransaction",
    "Reset",
}


def trace(direction, frame):
    record = {"at": datetime.now(timezone.utc).isoformat(), "direction": direction, "frame": frame}
    with TRACE.open("a", encoding="utf-8") as output:
        output.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")


async def capture(args):
    node = shutil.which("node")
    if node is None:
        raise RuntimeError("Node.js must be available on PATH to run the simulator.")

    simulator = args.simulator.resolve()
    runner = simulator / "node_modules" / "ts-node" / "dist" / "bin.js"
    if not runner.is_file():
        raise RuntimeError(f"Simulator dependencies are missing under {simulator}; run npm ci there first.")

    TRACE.parent.mkdir(parents=True, exist_ok=True)
    TRACE.write_text("", encoding="utf-8")
    reset_call_id = "csms-k01-reset-1"
    reset_requested = False
    transaction_stopped = False
    boot_count = 0
    reset_accepted = asyncio.Event()
    second_boot_replied = asyncio.Event()

    async def handle(connection):
        nonlocal reset_requested, transaction_stopped, boot_count
        if connection.subprotocol != "ocpp1.6":
            await connection.close(code=1002, reason="OCPP 1.6J subprotocol required")
            return

        async for raw in connection:
            frame = json.loads(raw)
            if frame[0] == 2:
                _, unique_id, action, payload = frame
                trace("charge-point-to-csms", frame)
                if action == "BootNotification":
                    boot_count += 1
                    result = {"currentTime": datetime.now(timezone.utc).isoformat(), "interval": 3600, "status": "Accepted"}
                elif action == "Heartbeat":
                    result = {"currentTime": datetime.now(timezone.utc).isoformat()}
                elif action == "Authorize":
                    result = {"idTagInfo": {"status": "Accepted"}}
                elif action == "StartTransaction":
                    result = {"transactionId": 7001, "idTagInfo": {"status": "Accepted"}}
                elif action == "StopTransaction":
                    result = {"idTagInfo": {"status": "Accepted"}}
                    transaction_stopped = True
                elif action in {"StatusNotification", "MeterValues"}:
                    result = {}
                else:
                    await connection.send(json.dumps([4, unique_id, "NotImplemented", f"Unsupported action: {action}", {}]))
                    continue

                await connection.send(json.dumps([3, unique_id, result], separators=(",", ":")))
                if action == "BootNotification" and boot_count == 2:
                    second_boot_replied.set()
                if (
                    action == "StatusNotification"
                    and payload.get("status") == "Available"
                    and transaction_stopped
                    and not reset_requested
                ):
                    reset_requested = True
                    reset = [2, reset_call_id, "Reset", {"type": "Soft"}]
                    trace("csms-to-charge-point", reset)
                    await connection.send(json.dumps(reset, separators=(",", ":")))
            elif frame[0] == 3:
                trace("charge-point-to-csms", frame)
                if frame[1] == reset_call_id and frame[2].get("status") == "Accepted":
                    reset_accepted.set()
            else:
                trace("charge-point-to-csms", frame)

    async with websockets.serve(handle, "127.0.0.1", args.port, subprotocols=["ocpp1.6"]):
        env = os.environ.copy()
        env["WS_CONNECT_URL"] = f"ws://127.0.0.1:{args.port}/K01-CP-001"
        process = await asyncio.create_subprocess_exec(
            node,
            str(runner),
            "--project",
            "tsconfig.release.json",
            "src/main.ts",
            "--stdin",
            cwd=simulator,
            env=env,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, stderr = await asyncio.wait_for(process.communicate(SCRIPT.read_bytes()), timeout=args.timeout)
        except TimeoutError:
            process.kill()
            await process.wait()
            raise RuntimeError(f"Simulator timed out after {args.timeout} seconds.") from None
        if process.returncode != 0:
            raise RuntimeError(stderr.decode("utf-8", errors="replace")[-2000:])
        await asyncio.wait_for(reset_accepted.wait(), timeout=5)
        await asyncio.wait_for(second_boot_replied.wait(), timeout=5)

    captured = [json.loads(line) for line in TRACE.read_text(encoding="utf-8").splitlines() if line.strip()]
    actions = {
        frame[2]
        for row in captured
        if (frame := row["frame"])[0] == 2
    }
    missing = REQUIRED_ACTIONS - actions
    if missing:
        raise RuntimeError(f"OCPP capture is incomplete; missing: {', '.join(sorted(missing))}")
    print(f"Captured {len(captured)} OCPP frames; all 8 K-01 actions are present.")
    print(f"Trace: {TRACE}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--simulator", type=Path, required=True, help="Path to the cloned simulator repository")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--timeout", type=int, default=60)
    args = parser.parse_args()
    asyncio.run(capture(args))


if __name__ == "__main__":
    main()
