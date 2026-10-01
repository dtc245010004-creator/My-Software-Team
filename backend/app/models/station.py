from datetime import datetime, timezone
from app.core.database import Base
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from sqlalchemy.orm import relationship

class Station(Base):
    __tablename__ = "stations"
    __table_args__ = {"extend_existing": True}
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=True)
    name = Column(String, nullable=True)
    status = Column(String, default="ACTIVE")
    operator_id = Column(Integer, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    address = Column(String, nullable=True)
    operating_hours = Column(String, nullable=True, default="24/7")
    total_grid_capacity_kw = Column(Float, nullable=True, default=100.0)
    is_active = Column(Boolean, default=True)
    last_seen_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    charging_points = relationship("ChargePoint", back_populates="station", foreign_keys="ChargePoint.station_id", lazy="joined")

    def __init__(self, **kwargs):
        # Tự động chuẩn hóa trạng thái hợp lệ cho Pydantic validator
        if "status" in kwargs and kwargs["status"]:
            st_val = str(kwargs["status"]).upper()
            if st_val in ("AVAILABLE", "ACTIVE"):
                kwargs["status"] = "ACTIVE"
            elif st_val in ("MAINTENANCE", "FAULTED", "UNAVAILABLE"):
                kwargs["status"] = "MAINTENANCE"
        else:
            kwargs["status"] = "ACTIVE"
        super().__init__(**kwargs)

from app.models.connector import Connector
from app.models.charge_point import ChargePoint

ChargingPoint = ChargePoint
ChargingPointModel = ChargePoint

class ConnectorError(Base):
    __tablename__ = "connector_errors"
    __table_args__ = {"extend_existing": True}
    
    id = Column(Integer, primary_key=True, index=True)
    connector_id = Column(Integer, nullable=False)
    error_code = Column(String, nullable=False)
    vendor_error_code = Column(String, nullable=True)

class StationPowerMetric(Base):
    __tablename__ = "station_power_metrics"
    __table_args__ = {"extend_existing": True}
    
    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, nullable=False)
    power_kw = Column(Float, nullable=True)
    active_chargers_count = Column(Integer, nullable=True, default=0)
    timestamp = Column(DateTime, nullable=True)
