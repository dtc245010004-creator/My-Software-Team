import logging

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.station import Base, ChargingPoint, Connector
from app.ocpp.handlers.status_notification import handle


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()

@pytest.mark.asyncio
async def test_t22_unregistered_connector_ignored_and_logged(db_session, caplog):
    # 1. Tạo 1 trụ có 2 đầu nối (1 và 2)
    cp = ChargingPoint(
        station_id=1,
        charge_point_id="CP-TEST-T22",
        code="CP-TEST-T22",
        status="AVAILABLE",
    )
    db_session.add(cp)
    db_session.flush()

    c1 = Connector(charge_point_id=cp.id, connector_number=1, status="AVAILABLE")
    c2 = Connector(charge_point_id=cp.id, connector_number=2, status="AVAILABLE")
    db_session.add_all([c1, c2])
    db_session.commit()

    # 2. Giả lập gửi StatusNotification cho connectorId=3 (chưa khai báo)
    payload = {
        "connectorId": 3,
        "status": "Available",
        "errorCode": "NoError",
    }

    with caplog.at_level(logging.WARNING):
        res = await handle(db_session, payload, cp, "CP-TEST-T22")

    # 3. Tiêu chí kiểm tra T-22:
    # - Trả CALLRESULT rỗng theo đặc tả
    assert res == {}

    # - Bảng connectors vẫn giữ nguyên 2 dòng
    connectors = db_session.query(Connector).filter_by(charge_point_id=cp.id).all()
    assert len(connectors) == 2
    assert {c.connector_number for c in connectors} == {1, 2}

    # - Ghi nhận cảnh báo trong log
    assert any("connectorId=3" in record.message for record in caplog.records)
