from app.core.database import Base, engine
from app.models.charge_point import ChargePoint
from app.models.connector import Connector
from app.models.station import Station

# Xóa và tái tạo lại các bảng của cụm charge_point để SQLite cập nhật cột mới nhất
try:
    Connector.__table__.drop(bind=engine, checkfirst=True)
    ChargePoint.__table__.drop(bind=engine, checkfirst=True)
    Base.metadata.create_all(bind=engine)
except Exception:
    pass
from app.core.database import Base, engine
Base.metadata.create_all(bind=engine)
import pytest
from sqlalchemy.exc import IntegrityError

from app.core.database import SessionLocal
from app.models.charge_point import ChargePoint
from app.models.connector import Connector
from app.models.station import Station


def test_charge_point_unique_code():
    db = SessionLocal()
    try:
        # XÃ³a data cÅ©: xÃ³a báº£ng con Connector trÆ°á»›c
        db.query(Connector).delete()
        db.query(ChargePoint).filter(ChargePoint.code.in_(["CP001", "CP002"])).delete()
        db.query(Station).filter(Station.name.in_(["Station 1", "Station 2", "Station 3"])).delete()
        db.commit()

        # Táº¡o station
        station1 = Station(name="Station 1")
        station2 = Station(name="Station 2")
        db.add(station1)
        db.add(station2)
        db.commit()

        # Táº¡o charge_point thá»© 1
        cp1 = ChargePoint(station_id=station1.id, code="CP001")
        db.add(cp1)
        db.commit()

        # Táº¡o charge_point thá»© 2 CÃ™NG code
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
        # XÃ³a data cÅ©: xÃ³a báº£ng con Connector trÆ°á»›c Ä‘á»ƒ khÃ´ng bá»‹ Ä‘á»¥ng UNIQUE constraint
        db.query(Connector).delete()
        db.query(ChargePoint).filter(ChargePoint.code.in_(["CP001", "CP002"])).delete()
        db.query(Station).filter(Station.name.in_(["Station 1", "Station 2", "Station 3"])).delete()
        db.commit()

        # Táº¡o station vÃ  charge_point
        station = Station(name="Station 3")
        db.add(station)
        db.commit()

        cp = ChargePoint(station_id=station.id, code="CP002")
        db.add(cp)
        db.commit()

        # Táº¡o connector thá»© 1
        conn1 = Connector(charge_point_id=cp.id, connector_number=1, connector_type="Type2")
        db.add(conn1)
        db.commit()

        # Táº¡o connector thá»© 2 CÃ™NG sá»‘ trÃªn cÃ¹ng charge point
        conn2 = Connector(charge_point_id=cp.id, connector_number=1, connector_type="CCS2")
        db.add(conn2)

        with pytest.raises(IntegrityError):
            db.commit()
    finally:
        db.rollback()
        db.close()

