from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class ChargePoint(Base):
    __tablename__ = "charging_points"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=True, index=True)
    code = Column(String, unique=True, index=True, nullable=True)
    charge_point_id = Column(String, unique=True, index=True, nullable=True)
    vendor = Column(String, nullable=True, default="Generic")
    model = Column(String, nullable=True, default="Standard")
    firmware_version = Column(String, nullable=True)
    max_power_kw = Column(Float, nullable=True, default=22.0)
    power_sharing_enabled = Column(Boolean, default=True)
    status = Column(String, default="AVAILABLE")
    is_active = Column(Boolean, default=True)
    last_seen_at = Column(DateTime, nullable=True)
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    station = relationship(
        "Station", back_populates="charging_points", foreign_keys=[station_id]
    )
    connectors = relationship(
        "Connector",
        back_populates="charging_point",
        foreign_keys="Connector.charge_point_id",
        cascade="all, delete-orphan",
        lazy="joined",
    )


def __init__(self, **kwargs):
    # Đồng bộ các tên thuộc tính tương đương
    if "charge_point_string_id" in kwargs:
        val = kwargs.pop("charge_point_string_id")
        for candidate in ["identity", "charge_point_id", "charger_code", "code"]:
            if hasattr(type(self), candidate):
                kwargs[candidate] = val
                break
    super().__init__(**kwargs)
