import asyncio
import websockets
from ocpp.v16 import call
from ocpp.v16 import ChargePoint as cp
import datetime

class ChargePoint(cp):
    async def simulate_session(self):
        print("Starting session simulation...")

        # 1. BootNotification
        request = call.BootNotification(
            charge_point_vendor="SpikeVendor",
            charge_point_model="SpikeModel1",
            firmware_version="1.0.0"
        )
        await self.call(request)
        print("BootNotification sent")

        # 2. Heartbeat
        request = call.Heartbeat()
        await self.call(request)
        print("Heartbeat sent")

        # 3. StatusNotification (Available)
        request = call.StatusNotification(
            connector_id=1,
            error_code="NoError",
            status="Available"
        )
        await self.call(request)
        print("StatusNotification (Available) sent")

        # 4. Authorize
        request = call.Authorize(
            id_tag="DEADBEEF"
        )
        await self.call(request)
        print("Authorize sent")

        # 5. StartTransaction
        request = call.StartTransaction(
            connector_id=1,
            id_tag="DEADBEEF",
            meter_start=0,
            timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
        )
        response = await self.call(request)
        transaction_id = response.transaction_id
        print(f"StartTransaction sent, got transaction_id: {transaction_id}")

        # 6. StatusNotification (Charging)
        request = call.StatusNotification(
            connector_id=1,
            error_code="NoError",
            status="Charging"
        )
        await self.call(request)
        print("StatusNotification (Charging) sent")

        # 7. MeterValues
        request = call.MeterValues(
            connector_id=1,
            transaction_id=transaction_id,
            meter_value=[{
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "sampledValue": [{"value": "1000", "measurand": "Energy.Active.Import.Register"}]
            }]
        )
        await self.call(request)
        print("MeterValues sent")

        # 8. StatusNotification (Finishing)
        request = call.StatusNotification(
            connector_id=1,
            error_code="NoError",
            status="Finishing"
        )
        await self.call(request)
        print("StatusNotification (Finishing) sent")

        # 9. StopTransaction
        request = call.StopTransaction(
            meter_stop=1000,
            timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            transaction_id=transaction_id,
            id_tag="DEADBEEF",
            reason="Local"
        )
        await self.call(request)
        print("StopTransaction sent")

        # 10. StatusNotification (Available)
        request = call.StatusNotification(
            connector_id=1,
            error_code="NoError",
            status="Available"
        )
        await self.call(request)
        print("StatusNotification (Available) sent")
        
        # 11. Reset (Note: Usually Server sends Reset, but we just simulate it here for completeness if needed)
        # We will not send Reset from client since Reset is a Central System to Charge Point message,
        # but to see the payload we can just log it or the user just reads the spec.
        print("Session completed.")


async def main():
    async with websockets.connect(
        'ws://localhost:9000/CP_1',
        subprotocols=['ocpp1.6']
    ) as ws:
        cp = ChargePoint('CP_1', ws)
        await asyncio.gather(cp.start(), cp.simulate_session())

if __name__ == '__main__':
    asyncio.run(main())
