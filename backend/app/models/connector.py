from datetime import datetime, timezone
from app.core.database import Base
from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

class Connector(Base):
    __tablename__ = "connectors"
    __table_args__ = (
        UniqueConstraint("charge_point_id", "connector_number", name="uq_connector_charge_point_number"),
        {"extend_existing": True},
    )
    
    id = Column(Integer, primary_key=True, index=True)
    charge_point_id = Column(Integer, ForeignKey("charging_points.id"), nullable=True, index=True)
    charging_point_id = Column(Integer, nullable=True)
    connector_number = Column(Integer, nullable=True)
    connector_id = Column(Integer, nullable=True)
    connector_type = Column(String, nullable=True)
    max_power_kw = Column(Float, nullable=True)
    status = Column(String, default="Available")
    ocpp_status = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    charging_point = relationship("ChargePoint", back_populates="connectors", foreign_keys=[charge_point_id])

    @property
    def charge_point(self):
        return self.charging_point

    def __init__(self, **kwargs):
        if "charge_point_id" in kwargs and "charging_point_id" not in kwargs:
            kwargs["charging_point_id"] = kwargs["charge_point_id"]
        elif "charging_point_id" in kwargs and "charge_point_id" not in kwargs:
            kwargs["charge_point_id"] = kwargs["charging_point_id"]
        super().__init__(**kwargs)
