from unittest.mock import MagicMock

import pytest

from app.models.station import ChargingPoint, Connector, ConnectorError
from app.ocpp.handlers.status_notification import handle


@pytest.mark.asyncio
async def test_t21_record_connector_error_with_vendor_error_code():
    """Báo lỗi có vendorErrorCode."""
    db = MagicMock()
    charge_point = ChargingPoint(id=1, charge_point_id="CP_01")
    connector = Connector(id=10, charge_point_id=1, connector_id=1, status="AVAILABLE")

    query_mock = MagicMock()
    db.query.return_value = query_mock
    query_mock.filter.return_value = query_mock
    query_mock.filter_by.return_value = query_mock
    query_mock.first.side_effect = [charge_point, connector]

    payload = {
        "connectorId": 1,
        "errorCode": "GroundFailure",
        "vendorErrorCode": "ERR_VEND_99",
        "status": "Faulted",
        "timestamp": "2026-10-01T17:00:00Z",
    }

    res = await handle(db=db, payload=payload, charge_point=charge_point, charge_point_id=1)
    assert res == {}

    added_objects = [call.args[0] for call in db.add.call_args_list if call.args]
    error_entries = [obj for obj in added_objects if isinstance(obj, ConnectorError)]
    assert len(error_entries) == 1
    assert error_entries[0].connector_id in (1, 10)
    assert error_entries[0].error_code == "GroundFailure"
    assert error_entries[0].vendor_error_code == "ERR_VEND_99"
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_t21_record_error_with_missing_vendor_error_code():
    """Báo lỗi thiếu vendorErrorCode -> lưu rỗng, không từ chối tin nhắn."""
    db = MagicMock()
    charge_point = ChargingPoint(id=1, charge_point_id="CP_01")
    connector = Connector(id=10, charge_point_id=1, connector_id=1, status="AVAILABLE")

    query_mock = MagicMock()
    db.query.return_value = query_mock
    query_mock.filter.return_value = query_mock
    query_mock.filter_by.return_value = query_mock
    query_mock.first.side_effect = [charge_point, connector]

    payload = {
        "connectorId": 1,
        "errorCode": "HighTemperature",
        "status": "Faulted",
        "timestamp": "2026-10-01T17:00:00Z",
    }

    res = await handle(db=db, payload=payload, charge_point=charge_point, charge_point_id=1)
    assert res == {}

    added_objects = [call.args[0] for call in db.add.call_args_list if call.args]
    error_entries = [obj for obj in added_objects if isinstance(obj, ConnectorError)]
    assert len(error_entries) == 1
    assert error_entries[0].connector_id in (1, 10)
    assert error_entries[0].error_code == "HighTemperature"
    assert error_entries[0].vendor_error_code in (None, '')
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_t21_no_error_row_when_noerror():
    """Báo NoError không sinh dòng."""
    db = MagicMock()
    charge_point = ChargingPoint(id=1, charge_point_id="CP_01")
    connector = Connector(id=10, charge_point_id=1, connector_id=1, status="AVAILABLE")

    query_mock = MagicMock()
    db.query.return_value = query_mock
    query_mock.filter.return_value = query_mock
    query_mock.filter_by.return_value = query_mock
    query_mock.first.side_effect = [charge_point, connector]

    payload = {
        "connectorId": 1,
        "errorCode": "NoError",
        "status": "Available",
        "timestamp": "2026-10-01T17:00:00Z",
    }

    res = await handle(db=db, payload=payload, charge_point=charge_point, charge_point_id=1)
    assert res == {}

    added_objects = [call.args[0] for call in db.add.call_args_list if call.args]
    error_entries = [obj for obj in added_objects if isinstance(obj, ConnectorError)]
    assert len(error_entries) == 0


@pytest.mark.asyncio
async def test_t21_available_after_faulted_no_modify_old_errors():
    """Báo Available sau Faulted -> không có thao tác sửa/xoá dòng cũ."""
    db = MagicMock()
    charge_point = ChargingPoint(id=1, charge_point_id="CP_01")
    connector = Connector(id=10, charge_point_id=1, connector_id=1, status="FAULTED")

    query_mock = MagicMock()
    db.query.return_value = query_mock
    query_mock.filter.return_value = query_mock
    query_mock.filter_by.return_value = query_mock
    query_mock.first.side_effect = [charge_point, connector]

    payload = {
        "connectorId": 1,
        "errorCode": "NoError",
        "status": "Available",
        "timestamp": "2026-10-01T17:00:00Z",
    }

    res = await handle(db=db, payload=payload, charge_point=charge_point, charge_point_id=1)
    assert res == {}

    assert db.delete.call_count == 0


@pytest.mark.asyncio
async def test_t21_invalid_timestamp_not_set_at_application_layer():
    """Timestamp sai định dạng -> không gán thời điểm ở tầng ứng dụng."""
    db = MagicMock()
    charge_point = ChargingPoint(id=1, charge_point_id="CP_01")
    connector = Connector(id=10, charge_point_id=1, connector_id=1, status="AVAILABLE")

    query_mock = MagicMock()
    db.query.return_value = query_mock
    query_mock.filter.return_value = query_mock
    query_mock.filter_by.return_value = query_mock
    query_mock.first.side_effect = [charge_point, connector]

    payload = {
        "connectorId": 1,
        "errorCode": "GroundFailure",
        "status": "Faulted",
        "timestamp": "invalid-time",
    }

    res = await handle(db=db, payload=payload, charge_point=charge_point, charge_point_id=1)
    assert res == {}

    added_objects = [call.args[0] for call in db.add.call_args_list if call.args]
    error_entries = [obj for obj in added_objects if isinstance(obj, ConnectorError)]
    assert len(error_entries) == 1
    assert error_entries[0].created_at is None
    db.commit.assert_called_once()
