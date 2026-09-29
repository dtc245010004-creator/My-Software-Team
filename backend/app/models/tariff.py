from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class Tariff(Base):
    """Mô hình Biểu giá điện linh hoạt theo khung giờ (Time-of-Use - TOU Tariff)."""

    __tablename__ = "tariffs"
    __table_args__ = (
        CheckConstraint("price_normal >= 0", name="ck_tariff_price_normal_positive"),
        CheckConstraint("price_peak >= 0", name="ck_tariff_price_peak_positive"),
        CheckConstraint("price_offpeak >= 0", name="ck_tariff_price_offpeak_positive"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    station_id = Column(
        Integer,
        ForeignKey("stations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )  # NULL = Biểu giá mặc định toàn hệ thống
    name = Column(String(100), nullable=False)
    price_normal = Column(Numeric(10, 2), nullable=False)  # Giá giờ bình thường (VNĐ/kWh)
    price_peak = Column(Numeric(10, 2), nullable=False)  # Giá giờ cao điểm (VNĐ/kWh)
    price_offpeak = Column(Numeric(10, 2), nullable=False)  # Giá giờ thấp điểm (VNĐ/kWh)

    # Khung giờ cao điểm 1 (sáng) & 2 (chiều tối)
    peak_start = Column(String(5), default="09:30", nullable=False)
    peak_end = Column(String(5), default="11:30", nullable=False)
    peak_start_2 = Column(String(5), default="17:00", nullable=False)
    peak_end_2 = Column(String(5), default="20:00", nullable=False)

    # Khung giờ thấp điểm (đêm - rạng sáng)
    offpeak_start = Column(String(5), default="22:00", nullable=False)
    offpeak_end = Column(String(5), default="04:00", nullable=False)

    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Quan hệ
    station = relationship("Station")

    def __repr__(self) -> str:
        return f"<Tariff(id={self.id}, name='{self.name}', normal={self.price_normal}, peak={self.price_peak}, offpeak={self.price_offpeak})>"
