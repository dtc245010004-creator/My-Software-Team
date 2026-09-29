from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class ChargingSession(Base):
    """Mô hình Phiên sạc xe điện (Quản lý vòng đời và chốt hóa đơn tiền điện)."""

    __tablename__ = "charging_sessions"
    __table_args__ = (
        CheckConstraint("total_kwh >= 0", name="ck_session_total_kwh_non_negative"),
        CheckConstraint("total_amount >= 0", name="ck_session_total_amount_non_negative"),
        CheckConstraint(
            "status IN ('ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED')",
            name="ck_session_status_valid",
        ),
    )


    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    connector_id = Column(
        Integer,
        ForeignKey("connectors.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    tariff_id = Column(
        Integer,
        ForeignKey("tariffs.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Đơn giá điện chốt tại thời điểm bắt đầu phiên sạc (VND/kWh)
    applied_price_per_kwh = Column(Numeric(10, 2), nullable=False)

    start_time = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    end_time = Column(DateTime(timezone=True), nullable=True)

    # Đo đếm điện năng (Decimal)
    meter_start_kwh = Column(Numeric(10, 2), default=0.00, nullable=False)
    meter_stop_kwh = Column(Numeric(10, 2), nullable=True)
    total_kwh = Column(Numeric(10, 2), default=0.00, nullable=False)

    # Tổng tiền thanh toán (VND)
    total_amount = Column(Numeric(12, 2), default=0.00, nullable=False)

    # Checkpoint phục hồi khi server crash & trạng thái sạc tức thời
    current_soc = Column(Float, default=0.0, nullable=False)
    last_checkpoint_at = Column(DateTime(timezone=True), nullable=True)

    # Trạng thái riêng biệt của phiên sạc
    status = Column(String(20), default="ACTIVE", nullable=False)  # ACTIVE, COMPLETED, FAILED, CANCELLED, INTERRUPTED
    stop_reason = Column(String(100), nullable=True)  # USER_STOPPED, EMERGENCY, BATTERY_FULL, DEBT_LIMIT_REACHED...


    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Quan hệ
    user = relationship("User")
    connector = relationship("Connector")
    tariff = relationship("Tariff")

    def __repr__(self) -> str:
        return f"<ChargingSession(id={self.id}, user_id={self.user_id}, status='{self.status}', kwh={self.total_kwh}, amount={self.total_amount})>"
