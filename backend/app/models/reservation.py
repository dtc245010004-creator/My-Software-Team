"""Mô hình Đặt chỗ trước đầu nối sạc (User Story S-48, S-49 / Epic E-07)."""

import enum
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

try:
    from ..core.database import Base
except (ImportError, ValueError):
    from app.core.database import Base


class ReservationStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class Reservation(Base):
    """Bản ghi đặt chỗ trước trụ sạc / đầu nối sạc của tài xế."""

    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    charge_point_id = Column(
        Integer,
        ForeignKey("charging_points.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    connector_id = Column(
        Integer,
        ForeignKey("connectors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    id_tag = Column(String(100), nullable=False, index=True)
    start_time = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    expiry_date = Column(DateTime(timezone=True), nullable=False, index=True)
    status = Column(
        String(50),
        default=ReservationStatus.ACTIVE.value,
        nullable=False,
        index=True,
    )
    failure_reason = Column(String(255), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    charging_point = relationship("ChargingPoint", foreign_keys=[charge_point_id])
    connector = relationship("Connector", foreign_keys=[connector_id])

