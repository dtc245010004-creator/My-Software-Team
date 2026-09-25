from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class Station(Base):
    """Mô hình Trạm sạc xe điện (Quản lý nguồn điện lưới và tập hợp các trụ sạc)."""

    __tablename__ = "stations"
    __table_args__ = (
        CheckConstraint("total_grid_capacity_kw > 0", name="ck_station_grid_capacity_positive"),
        CheckConstraint("status IN ('ACTIVE', 'MAINTENANCE')", name="ck_station_status_valid"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    operator_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name = Column(String(150), nullable=False)
    address = Column(String(255), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    total_grid_capacity_kw = Column(Float, nullable=False)
    operating_hours = Column(String(50), default="24/7", nullable=False)
    status = Column(String(20), default="ACTIVE", nullable=False)  # ACTIVE, MAINTENANCE
    is_active = Column(Boolean, default=True, nullable=False)  # Soft Delete flag
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Quan hệ
    operator = relationship("User", foreign_keys=[operator_id])
    charging_points = relationship(
        "ChargingPoint",
        back_populates="station",
        cascade="all, delete-orphan",
        order_by="ChargingPoint.id",
    )

    def __repr__(self) -> str:
        return f"<Station(id={self.id}, name='{self.name}', status='{self.status}', is_active={self.is_active})>"


class ChargingPoint(Base):
    """Mô hình Trụ sạc (EVSE - Electric Vehicle Supply Equipment)."""

    __tablename__ = "charging_points"
    __table_args__ = (
        CheckConstraint("max_power_kw > 0", name="ck_charger_max_power_positive"),
        CheckConstraint(
            "status IN ('AVAILABLE', 'PREPARING', 'CHARGING', 'FAULTED', 'UNAVAILABLE')",
            name="ck_charger_status_valid",
        ),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    station_id = Column(
        Integer,
        ForeignKey("stations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code = Column(String(50), unique=True, index=True, nullable=False)  # EVSE ID toàn hệ thống
    vendor = Column(String(100), nullable=False, default="VinFast/ABB")
    model = Column(String(100), nullable=True)
    max_power_kw = Column(Float, nullable=False)
    firmware_version = Column(String(50), default="1.0.0", nullable=True)
    status = Column(String(20), default="AVAILABLE", nullable=False)
    power_sharing_enabled = Column(Boolean, default=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)  # Soft Delete flag
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Quan hệ
    station = relationship("Station", back_populates="charging_points")
    connectors = relationship(
        "Connector",
        back_populates="charging_point",
        cascade="all, delete-orphan",
        order_by="Connector.connector_number",
    )

    def __repr__(self) -> str:
        return f"<ChargingPoint(id={self.id}, code='{self.code}', status='{self.status}')>"


class Connector(Base):
    """Mô hình Cổng / Súng sạc vật lý (CCS2, Type 2, CHAdeMO)."""

    __tablename__ = "connectors"
    __table_args__ = (
        CheckConstraint("connector_number >= 1", name="ck_connector_number_positive"),
        CheckConstraint("max_power_kw > 0", name="ck_connector_max_power_positive"),
        CheckConstraint(
            "connector_type IN ('CCS2', 'TYPE_2', 'CHADEMO')",
            name="ck_connector_type_valid",
        ),
        CheckConstraint(
            "status IN ('AVAILABLE', 'OCCUPIED', 'CHARGING', 'FAULTED', 'UNAVAILABLE')",
            name="ck_connector_status_valid",
        ),
        UniqueConstraint("charging_point_id", "connector_number", name="uq_charger_connector_number"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    charging_point_id = Column(
        Integer,
        ForeignKey("charging_points.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    connector_number = Column(Integer, nullable=False)  # Súng số 1, số 2...
    connector_type = Column(String(20), nullable=False)  # CCS2, TYPE_2, CHADEMO
    max_power_kw = Column(Float, nullable=False)
    status = Column(String(20), default="AVAILABLE", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)  # Soft Delete flag
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Quan hệ
    charging_point = relationship("ChargingPoint", back_populates="connectors")

    def __repr__(self) -> str:
        return f"<Connector(id={self.id}, charger_id={self.charging_point_id}, #{self.connector_number}, type='{self.connector_type}')>"
