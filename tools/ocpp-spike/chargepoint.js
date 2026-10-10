// Disposable K-01 client script for the open-source OCPP 1.6J simulator.
module.exports = async function (connect) {
  const cp = await connect(process.env.WS_CONNECT_URL);
  let finishReset;
  const resetFinished = new Promise((resolve) => { finishReset = resolve; });

  cp.answerReset(async (request) => {
    cp.sendResponse(request.uniqueId, { status: "Accepted" });
    await cp.sendBootnotification({ chargePointVendor: "CSMS Spike", chargePointModel: "Virtual-1" });
    finishReset();
  });

  const boot = await cp.sendBootnotification({ chargePointVendor: "CSMS Spike", chargePointModel: "Virtual-1" });
  await cp.sendHeartbeat();
  await cp.sendStatusNotification({ connectorId: 1, errorCode: "NoError", status: "Available" });

  const authorization = await cp.sendAuthorize({ idTag: "K01-DEMO-TAG" });
  if (authorization.idTagInfo.status !== "Accepted") {
    throw new Error("The spike central system did not authorize the demo tag.");
  }

  await cp.sendStatusNotification({ connectorId: 1, errorCode: "NoError", status: "Preparing" });
  const transaction = await cp.startTransaction({
    connectorId: 1,
    idTag: "K01-DEMO-TAG",
    meterStart: 137700,
    timestamp: new Date().toISOString(),
  });
  await cp.sendStatusNotification({ connectorId: 1, errorCode: "NoError", status: "Charging" });
  await cp.meterValues({
    connectorId: 1,
    transactionId: transaction.transactionId,
    meterValue: [{
      timestamp: new Date().toISOString(),
      sampledValue: [{
        value: "137710",
        measurand: "Energy.Active.Import.Register",
        unit: "Wh",
      }],
    }],
  });
  await cp.stopTransaction({
    transactionId: transaction.transactionId,
    meterStop: 137710,
    timestamp: new Date().toISOString(),
    idTag: "K01-DEMO-TAG",
  });
  await cp.sendStatusNotification({ connectorId: 1, errorCode: "NoError", status: "Finishing" });
  await cp.sendStatusNotification({ connectorId: 1, errorCode: "NoError", status: "Available" });

  await resetFinished;
  cp.close();
};
