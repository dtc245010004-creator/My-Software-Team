import asyncio
import websockets
import datetime

async def on_connect(websocket):
    path = websocket.request.path
    print(f"[{datetime.datetime.now()}] New connection from {path}")
    try:
        async for message in websocket:
            print(f"[{datetime.datetime.now()}] Received: {message}")
            # The server must respond to OCPP messages to not block the simulator.
            # A Call message is [2, "MessageId", "Action", {payload}]
            import json
            try:
                msg = json.loads(message)
                if isinstance(msg, list) and len(msg) >= 3 and msg[0] == 2:
                    msg_id = msg[1]
                    action = msg[2]
                    # Create a dummy CallResult [3, "MessageId", {payload}]
                    payload = {}
                    if action == "BootNotification":
                        payload = {"currentTime": datetime.datetime.now(datetime.timezone.utc).isoformat(), "interval": 300, "status": "Accepted"}
                    elif action == "Heartbeat":
                        payload = {"currentTime": datetime.datetime.now(datetime.timezone.utc).isoformat()}
                    elif action == "StatusNotification":
                        payload = {}
                    elif action == "Authorize":
                        payload = {"idTagInfo": {"status": "Accepted", "expiryDate": (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1)).isoformat()}}
                    elif action == "StartTransaction":
                        payload = {"transactionId": 12345, "idTagInfo": {"status": "Accepted"}}
                    elif action == "MeterValues":
                        payload = {}
                    elif action == "StopTransaction":
                        payload = {"idTagInfo": {"status": "Accepted"}}
                    
                    response = [3, msg_id, payload]
                    resp_str = json.dumps(response)
                    print(f"[{datetime.datetime.now()}] Sending: {resp_str}")
                    await websocket.send(resp_str)
            except Exception as e:
                print(f"Error processing message: {e}")
    except websockets.exceptions.ConnectionClosed:
        print(f"[{datetime.datetime.now()}] Connection closed from {path}")

async def main():
    async with websockets.serve(on_connect, "localhost", 9000, subprotocols=['ocpp1.6']):
        print("WebSocket Server listening on ws://localhost:9000")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
