# K-01 — OCPP 1.6J spike

## Result

**Pass.** A real open-source charge-point simulator connected to a minimal WebSocket central system using subprotocol `ocpp1.6`. The complete observed exchange is preserved in [the 14-frame JSONL capture](k01-ocpp16j-trace.jsonl). It includes the eight K-01 actions, a completed charging session, and a server-initiated soft reset followed by a second boot notification.

## Simulator

Selected [`oglimmer/scriptable-ocpp-chargepoint-simulator`](https://github.com/oglimmer/scriptable-ocpp-chargepoint-simulator), Apache-2.0, commit `091853aa638093f84baa65286aed327c428e3975`. Its README documents OCPP 1.6J over WebSocket, a scriptable charge-point client, and support for all eight K-01 actions. The scripts used for this throwaway spike are in [`tools/ocpp-spike`](../../tools/ocpp-spike/); they are separate from the product API.

## Observed exchange and fields to retain

The charge point sent JSON `CALL` frames `[2, uniqueId, action, payload]`; the central system returned `CALLRESULT` frames `[3, uniqueId, payload]`. Retain the direction, message ID, action, raw payload, receipt time, and charge-point identity for each frame so duplicate messages can be recognized and audited.

| Action | Fields observed in this run that the CSMS needs |
| --- | --- |
| `BootNotification` | Request: `chargePointVendor`, `chargePointModel`. Response: `currentTime`, `interval`, `status`. |
| `Heartbeat` | Response: `currentTime`; the request payload is empty. |
| `StatusNotification` | `connectorId`, `errorCode`, `status`. The session also emitted `Preparing`, `Charging`, `Finishing`, and `Available`. |
| `Authorize` | Request `idTag`; response `idTagInfo.status`. |
| `StartTransaction` | Request `connectorId`, `idTag`, `meterStart`, `timestamp`; response `transactionId`, `idTagInfo.status`. |
| `MeterValues` | `connectorId`, `transactionId`, each `meterValue.timestamp`, and each `sampledValue.value`, `measurand`, `unit`. |
| `StopTransaction` | Request `transactionId`, `meterStop`, `timestamp`, `idTag`; response `idTagInfo.status`. |
| `Reset` | Central-system request `type`; charge-point response `status`. The simulator accepted `Soft` and then sent another `BootNotification`. |

These are the fields present in the captured happy path, not an exhaustive list of optional OCPP fields. Preserve the raw payload alongside normalized columns so later protocol extensions do not discard data.

## Reproduce

Clone the simulator at the commit above, run `npm ci` in its directory, activate the backend Python environment, then from the project root run:

```powershell
python tools/ocpp-spike/run_capture.py --simulator C:\path\to\scriptable-ocpp-chargepoint-simulator
```

The spike runner starts the minimal local WebSocket server, negotiates `ocpp1.6`, runs the charge-point client, verifies all eight actions, and writes the trace file. The simulator is not part of the production image. Its old dependency tree reports npm audit findings; keep it isolated to this learning spike and do not deploy it.

## Follow-up implications

- The captured `StartTransaction` / `MeterValues` / `StopTransaction` exchange carries the transaction ID, connector ID, meter register, timestamps, and sampled measurand needed to model a session and its meter readings.
- `Reset` is a central-system-to-charge-point `CALL`; its response must be matched to the original message ID.
- This simulator does **not** implement `SetChargingProfile`, so it cannot validate smart-charging behavior from the backlog risk R-08.
