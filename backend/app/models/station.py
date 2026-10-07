import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import relationship, synonym

from app.core.database import Base


class StationStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    UNDER_MAINTENANCE = "UNDER_MAINTENANCE"


class Station(Base):
    __tablename__ = "stations"

    id = Column(Integer, primary_key=True, index=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    address = Column(String(500), nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    total_grid_capacity_kw = Column(Float, nullable=True, default=100.0)
    operating_hours = Column(String(100), nullable=True, default="24/7")
    status = Column(String(50), nullable=False, default=StationStatus.ACTIVE.value)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    operator = relationship("User", foreign_keys=[operator_id], lazy="joined")
    charging_points = relationship(
        "ChargingPoint",
        back_populates="station",
        cascade="all, delete-orphan",
        lazy="select",
    )
    power_metrics = relationship(
        "StationPowerMetric",
        back_populates="station",
        cascade="all, delete-orphan",
        lazy="select",
    )

    def __init__(self, **kwargs):
        kwargs.pop("vendor", None)
        super().__init__(**kwargs)


class ChargingPoint(Base):
    __tablename__ = "charging_points"
    __table_args__ = (
        CheckConstraint("max_power_kw > 0", name="ck_charger_max_power_positive"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(
        Integer,
        ForeignKey("stations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    charge_point_id = Column(String(100), nullable=True, index=True)
    code = Column(String(100), nullable=True, unique=True, index=True)
    vendor = Column(String(100), nullable=True, default="Generic")
    model = Column(String(100), nullable=True)

    # Synonyms / Aliases phục vụ Pydantic response và các test case
    charge_point_vendor = synonym("vendor")
    charge_point_model = synonym("model")
    charge_point_model_name = synonym("model")
    charger_code = synonym("code")

    firmware_version = Column(String(100), nullable=True)
    status = Column(String(50), nullable=True, default="AVAILABLE")
    max_power_kw = Column(Float, nullable=True, default=22.0)
    power_sharing_enabled = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    last_seen_at = Column(DateTime, nullable=True)
    created_at = Column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=True
    )
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=datetime.utcnow,
        nullable=True,
    )

    station = relationship("Station", back_populates="charging_points")
    connectors = relationship(
        "Connector",
        back_populates="charging_point",
        primaryjoin="ChargingPoint.id == Connector.charge_point_id",
        cascade="all, delete-orphan",
    )

    def __init__(self, **kwargs):
        c_code = (
            kwargs.get("code")
            or kwargs.get("charge_point_id")
            or kwargs.get("charger_code")
        )
        if c_code:
            kwargs["code"] = c_code
            kwargs["charge_point_id"] = c_code

        c_vendor = kwargs.get("vendor") or kwargs.get("charge_point_vendor")
        if c_vendor:
            kwargs["vendor"] = c_vendor

        c_model = (
            kwargs.get("model")
            or kwargs.get("charge_point_model")
            or kwargs.get("charge_point_model_name")
        )
        if c_model:
            kwargs["model"] = c_model

        if "created_at" not in kwargs:
            kwargs["created_at"] = datetime.now(timezone.utc)
        if "updated_at" not in kwargs:
            kwargs["updated_at"] = datetime.now(timezone.utc)

        valid_cols = {c.name for c in self.__table__.columns}
        filtered = {
            k: v for k, v in kwargs.items() if k in valid_cols or hasattr(type(self), k)
        }
        for k, v in kwargs.items():
            if k not in filtered:
                setattr(self, k, v)
        super().__init__(**filtered)


class Connector(Base):
    __tablename__ = "connectors"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    charge_point_id = Column(
        Integer,
        ForeignKey("charging_points.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    charging_point_id = synonym("charge_point_id")

    connector_id = Column(Integer, nullable=True)
    connector_number = Column(Integer, nullable=True)
    connector_type = Column(String(50), nullable=True, default="Type 2")
    status = Column(String(50), default="AVAILABLE")
    ocpp_status = Column(String(50), default="Available")
    max_kw = Column(Float, nullable=True, default=22.0)
    max_power_kw = Column(Float, nullable=True, default=22.0)
    type = Column(String(50), nullable=True, default="Type 2")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    charging_point = relationship(
        "ChargingPoint",
        back_populates="connectors",
        primaryjoin="ChargingPoint.id == Connector.charge_point_id",
    )
    errors = relationship(
        "ConnectorError", back_populates="connector", cascade="all, delete-orphan"
    )

    def __init__(self, **kwargs):
        if "charging_point_id" in kwargs and not kwargs.get("charge_point_id"):
            kwargs["charge_point_id"] = kwargs.pop("charging_point_id")
        if "connector_number" in kwargs and not kwargs.get("connector_id"):
            kwargs["connector_id"] = kwargs["connector_number"]
        elif "connector_id" in kwargs and not kwargs.get("connector_number"):
            kwargs["connector_number"] = kwargs["connector_id"]
        if "connector_type" in kwargs and not kwargs.get("type"):
            kwargs["type"] = kwargs["connector_type"]
        if "max_power_kw" in kwargs and not kwargs.get("max_kw"):
            kwargs["max_kw"] = kwargs["max_power_kw"]
        if "created_at" not in kwargs:
            kwargs["created_at"] = datetime.now(timezone.utc)
        super().__init__(**kwargs)


class ConnectorError(Base):
    __tablename__ = "connector_errors"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    connector_id = Column(
        Integer,
        ForeignKey("connectors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    error_code = Column(String(100), nullable=False)
    vendor_error_code = Column(String(255), nullable=True)
    info = Column(String(255), nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=True
    )

    connector = relationship("Connector", back_populates="errors")


class StationPowerMetric(Base):
    __tablename__ = "station_power_metrics"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(
        Integer,
        ForeignKey("stations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    recorded_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    timestamp = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    total_active_power_kw = Column(Float, default=0.0)
    power_kw = Column(Float, default=0.0)
    grid_limit_kw = Column(Float, default=100.0)
    active_sessions_count = Column(Integer, default=0)
    active_chargers_count = Column(Integer, default=0)

    station = relationship("Station", back_populates="power_metrics")

    def __init__(self, **kwargs):
        if "power_kw" in kwargs and not kwargs.get("total_active_power_kw"):
            kwargs["total_active_power_kw"] = kwargs["power_kw"]
        elif "total_active_power_kw" in kwargs and not kwargs.get("power_kw"):
            kwargs["power_kw"] = kwargs["total_active_power_kw"]
        if "timestamp" in kwargs and not kwargs.get("recorded_at"):
            kwargs["recorded_at"] = kwargs["timestamp"]
        elif "recorded_at" in kwargs and not kwargs.get("timestamp"):
            kwargs["timestamp"] = kwargs["recorded_at"]
        if "active_chargers_count" in kwargs and not kwargs.get(
            "active_sessions_count"
        ):
            kwargs["active_sessions_count"] = kwargs["active_chargers_count"]
        super().__init__(**kwargs)
