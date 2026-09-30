import pytest
from sqlalchemy.exc import IntegrityError

from app.core.database import SessionLocal
from app.models.charge_point import ChargePoint
from app.models.connector import Connector
from app.models.station import Station


def test_charge_point_unique_code():
    db = SessionLocal()
    try:
        # Xóa data cũ: xóa bảng con Connector trước
        db.query(Connector).delete()
        db.query(ChargePoint).filter(ChargePoint.code.in_(["CP001", "CP002"])).delete()
        db.query(Station).filter(Station.name.in_(["Station 1", "Station 2", "Station 3"])).delete()
        db.commit()

        # Tạo station
        station1 = Station(name="Station 1")
        station2 = Station(name="Station 2")
        db.add(station1)
        db.add(station2)
        db.commit()

        # Tạo charge_point thứ 1
        cp1 = ChargePoint(station_id=station1.id, code="CP001")
        db.add(cp1)
        db.commit()

        # Tạo charge_point thứ 2 CÙNG code
        cp2 = ChargePoint(station_id=station2.id, code="CP001")
        db.add(cp2)

        with pytest.raises(IntegrityError):
            db.commit()
    finally:
        db.rollback()
        db.close()


def test_connector_unique_charge_point_id_and_number():
    db = SessionLocal()
    try:
        # Xóa data cũ: xóa bảng con Connector trước để không bị đụng UNIQUE constraint
        db.query(Connector).delete()
        db.query(ChargePoint).filter(ChargePoint.code.in_(["CP001", "CP002"])).delete()
        db.query(Station).filter(Station.name.in_(["Station 1", "Station 2", "Station 3"])).delete()
        db.commit()

        # Tạo station và charge_point
        station = Station(name="Station 3")
        db.add(station)
        db.commit()

        cp = ChargePoint(station_id=station.id, code="CP002")
        db.add(cp)
        db.commit()

        # Tạo connector thứ 1
        conn1 = Connector(charge_point_id=cp.id, connector_number=1, connector_type="Type2")
        db.add(conn1)
        db.commit()

        # Tạo connector thứ 2 CÙNG số trên cùng charge point
        conn2 = Connector(charge_point_id=cp.id, connector_number=1, connector_type="CCS2")
        db.add(conn2)

        with pytest.raises(IntegrityError):
            db.commit()
    finally:
        db.rollback()
        db.close()