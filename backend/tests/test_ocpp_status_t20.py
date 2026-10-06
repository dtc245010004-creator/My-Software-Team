from unittest.mock import MagicMock

import pytest

from app.models.station import ChargingPoint, Connector, ConnectorError
from app.ocpp.handlers.status_notification import handle
from app.ocpp.status_mapping import map_ocpp_to_internal


@pytest.mark.parametrize(
    "ocpp_status, expected_internal",
    [
        ("Available", "AVAILABLE"),
        ("Preparing", "OCCUPIED"),
        ("Charging", "OCCUPIED"),
        ("SuspendedEVSE", "OCCUPIED"),
        ("SuspendedEV", "OCCUPIED"),
        ("Finishing", "OCCUPIED"),
        ("Reserved", "RESERVED"),
        ("Faulted", "FAULTED"),
        ("Unavailable", "FAULTED"),
        ("CustomUnknownStatus", "UNKNOWN"),
    ],
)
def test_map_ocpp_to_internal_statuses(ocpp_status, expected_internal):
    assert map_ocpp_to_internal(ocpp_status) == expected_internal


@pytest.mark.asyncio
async def test_status_notification_handler_connector_zero():
    db_mock = MagicMock()
    charge_point_mock = ChargingPoint(id=1, code="EVSE_001", status="AVAILABLE")

    payload = {"connectorId": 0, "status": "Faulted", "errorCode": "NoError"}

    response = await handle(
        db=db_mock, payload=payload, charge_point=charge_point_mock, charge_point_id=1
    )

    assert response == {}
    assert charge_point_mock.status == "FAULTED"
    assert charge_point_mock.last_seen_at is not None
    db_mock.commit.assert_called_once()


@pytest.mark.asyncio
async def test_status_notification_handler_connector_valid_with_error():
    db_mock = MagicMock()
    charge_point_mock = ChargingPoint(id=1, code="EVSE_001", status="AVAILABLE")
    connector_mock = Connector(
        id=10, charging_point_id=1, connector_number=1, status="AVAILABLE"
    )

    db_mock.query().filter_by().first.return_value = connector_mock

    payload = {
        "connectorId": 1,
        "status": "Charging",
        "errorCode": "GroundFailure",
        "vendorErrorCode": "ERR_GF_01",
    }

    response = await handle(
        db=db_mock, payload=payload, charge_point=charge_point_mock, charge_point_id=1
    )

    assert response == {}
    assert connector_mock.status == "OCCUPIED"
    assert connector_mock.ocpp_status == "Charging"
    assert charge_point_mock.last_seen_at is not None

    db_mock.add.assert_called_once()
    added_obj = db_mock.add.call_args[0][0]
    assert isinstance(added_obj, ConnectorError)
    assert added_obj.connector_id == 10
    assert added_obj.error_code == "GroundFailure"
    assert added_obj.vendor_error_code == "ERR_GF_01"

    db_mock.commit.assert_called_once()


@pytest.mark.asyncio
async def test_status_notification_handler_connector_not_found():
    db_mock = MagicMock()
    charge_point_mock = ChargingPoint(id=1, code="EVSE_001", status="AVAILABLE")

    db_mock.query().filter_by().first.return_value = None

    payload = {"connectorId": 99, "status": "Charging", "errorCode": "NoError"}

    response = await handle(
        db=db_mock, payload=payload, charge_point=charge_point_mock, charge_point_id=1
    )

    assert response == {}
    db_mock.commit.assert_not_called()
