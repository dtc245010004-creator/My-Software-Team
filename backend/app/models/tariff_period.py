"""Khung giờ và đơn giá tùy chọn thuộc một biểu giá."""

from sqlalchemy import CheckConstraint, Column, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class TariffPeriod(Base):
    __tablename__ = "tariff_periods"
    __table_args__ = (
        CheckConstraint(
            "price_per_kwh >= 0", name="ck_tariff_period_price_non_negative"
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tariff_id = Column(
        Integer,
        ForeignKey("tariffs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    start_time = Column(String(5), nullable=False)
    end_time = Column(String(5), nullable=False)
    price_per_kwh = Column(Numeric(10, 2), nullable=False)
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")

    tariff = relationship("Tariff", back_populates="periods")
