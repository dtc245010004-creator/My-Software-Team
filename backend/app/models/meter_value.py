"""Mô hình lưu mẫu điện năng OCPP theo phiên sạc."""

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class MeterValue(Base):
    """Mẫu điện năng nhận được từ MeterValues của OCPP 1.6J."""

    __tablename__ = "meter_values"
    __table_args__ = (
        Index("ix_meter_values_session_recorded_at", "session_id", "recorded_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(
        Integer,
        ForeignKey("charging_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    measurand = Column(String(100), nullable=False)
    value = Column(Numeric(24, 9), nullable=False)
    unit = Column(String(20), nullable=True)
    recorded_at = Column(DateTime(timezone=True), nullable=False)

    session = relationship("ChargingSession")
