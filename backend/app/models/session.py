"""Mô hình Phiên sạc xe điện (Quản lý vòng đời và chốt hóa đơn tiền điện)."""

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    false,
    func,
    text,
)
from sqlalchemy.orm import relationship, synonym

from app.core.database import Base


class ChargingSession(Base):
    """Mô hình Phiên sạc xe điện (Quản lý vòng đời và chốt hóa đơn tiền điện)."""

    __tablename__ = "charging_sessions"
    __table_args__ = (
        CheckConstraint(
            "total_kwh >= 0 OR total_kwh IS NULL",
            name="ck_session_total_kwh_non_negative",
        ),
        CheckConstraint(
            "total_amount >= 0 OR total_amount IS NULL",
            name="ck_session_total_amount_non_negative",
        ),
        CheckConstraint(
            "status IN ('ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED', 'CHARGING', 'ABNORMAL', 'NEEDS_REVIEW')",
            name="ck_session_status_valid",
        ),
        Index(
            "uq_active_session_per_connector",
            "connector_id",
            unique=True,
            sqlite_where=text("status = 'CHARGING'"),
            postgresql_where=text("status = 'CHARGING'"),
        ),
    )

    transaction_id = Column(
        "id", Integer, primary_key=True, index=True, autoincrement=True
    )
    id = synonym("transaction_id")

    id_tag = Column(String(100), nullable=True, index=True)

    driver_id = Column(
        "user_id",
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_id = synonym("driver_id")

    connector_id = Column(
        Integer,
        ForeignKey("connectors.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    tariff_id = Column(
        Integer,
        ForeignKey("tariffs.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    # Đơn giá điện chốt tại thời điểm bắt đầu phiên sạc (VND/kWh)
    applied_price_per_kwh = Column(Numeric(10, 2), nullable=True, default=0.00)

    start_time = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    stop_time = Column("end_time", DateTime(timezone=True), nullable=True)
    end_time = synonym("stop_time")

    # Số điện Wh (chuẩn OCPP)
    meter_start = Column(Integer, default=0, nullable=False)
    meter_stop = Column(Integer, nullable=True)

    # Đo đếm điện năng (Decimal)
    meter_start_kwh = Column(Numeric(10, 2), default=0.00, nullable=True)
    meter_stop_kwh = Column(Numeric(10, 2), nullable=True)
    total_kwh = Column(Numeric(10, 3), nullable=True, default=0.000)

    # Tổng tiền thanh toán (VND)
    total_amount = Column(Numeric(12, 2), default=0.00, nullable=True)
    idle_amount = Column(
        Numeric(12, 2), nullable=False, default=0.00, server_default="0"
    )

    # Checkpoint phục hồi khi server crash & trạng thái sạc tức thời
    current_soc = Column(Float, default=0.0, nullable=False)
    last_checkpoint_at = Column(DateTime(timezone=True), nullable=True)

    # Trạng thái riêng biệt của phiên sạc
    status = Column(
        String(20), default="CHARGING", nullable=False
    )  # CHARGING, COMPLETED, ABNORMAL, NEEDS_REVIEW, ACTIVE, FAILED, CANCELLED, INTERRUPTED
    needs_review = Column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    is_abnormal = Column(Boolean, nullable=False, default=False, server_default=false())
    abnormal_reason = Column(String(255), nullable=True)
    stop_reason = Column(
        String(100), nullable=True
    )  # USER_STOPPED, EMERGENCY, BATTERY_FULL, DEBT_LIMIT_REACHED, EmergencyStop, CounterRollback, Local...

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Quan hệ
    user = relationship("User", foreign_keys=[driver_id])
    driver = synonym("user")
    connector = relationship("Connector")
    tariff = relationship("Tariff")
    billing_segments = relationship(
        "SessionBillingSegment",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SessionBillingSegment.segment_index",
    )

    def __init__(self, **kwargs):
        if "id" in kwargs and "transaction_id" not in kwargs:
            kwargs["transaction_id"] = kwargs.pop("id")
        if "user_id" in kwargs and "driver_id" not in kwargs:
            kwargs["driver_id"] = kwargs.pop("user_id")
        if "end_time" in kwargs and "stop_time" not in kwargs:
            kwargs["stop_time"] = kwargs.pop("end_time")
        super().__init__(**kwargs)

    @property
    def station_id(self) -> int | None:
        if self.connector and self.connector.charging_point:
            return self.connector.charging_point.station_id
        return None

    @property
    def station_name(self) -> str | None:
        if (
            self.connector
            and self.connector.charging_point
            and self.connector.charging_point.station
        ):
            return self.connector.charging_point.station.name
        return None

    @property
    def charger_code(self) -> str | None:
        if self.connector and self.connector.charging_point:
            return self.connector.charging_point.code
        return None

    def __repr__(self) -> str:
        return f"<ChargingSession(transaction_id={self.transaction_id}, driver_id={self.driver_id}, status='{self.status}', kwh={self.total_kwh}, amount={self.total_amount})>"
