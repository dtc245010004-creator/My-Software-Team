"""Đoạn giá đã chốt của một phiên sạc."""

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class SessionBillingSegment(Base):
    __tablename__ = "session_billing_segments"
    __table_args__ = (
        UniqueConstraint(
            "session_id",
            "segment_index",
            name="uq_session_billing_segment_session_index",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(
        Integer,
        ForeignKey("charging_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    segment_index = Column(Integer, nullable=False)
    segment_date = Column(Date, nullable=False)
    start_at = Column(DateTime(timezone=True), nullable=False)
    end_at = Column(DateTime(timezone=True), nullable=False)
    kwh = Column(Numeric(12, 4), nullable=False)
    price_per_kwh = Column(Numeric(10, 2), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    tariff_id = Column(
        Integer,
        ForeignKey("tariffs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    session = relationship("ChargingSession", back_populates="billing_segments")
    tariff = relationship("Tariff")
