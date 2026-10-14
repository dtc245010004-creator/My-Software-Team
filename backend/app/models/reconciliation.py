"""Mô hình Đối soát, Chia doanh thu & Khóa kỳ đối soát (User Story S-54, S-55 / Epic E-09)."""

import enum
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    event,
    func,
    text,
)
from sqlalchemy.orm import relationship

try:
    from ..core.database import Base
except (ImportError, ValueError):
    from app.core.database import Base


class PeriodStatus(str, enum.Enum):
    OPEN = "OPEN"
    LOCKED = "LOCKED"
    REOPENED = "REOPENED"


class PeriodLockedException(Exception):
    """Ngoại lệ khi cố gắng thay đổi dữ liệu thuộc kỳ đối soát đã bị khóa (S-55 / HTTP 409 Conflict)."""

    def __init__(
        self,
        detail: str = "Kỳ đối soát đã khóa, dữ liệu ở chế độ chỉ đọc (Read-only).",
        status_code: int = 409,
    ):
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


class PartnerRevenueShareConfig(Base):
    """Cấu hình tỉ lệ chia doanh thu của đối tác theo hợp đồng (S-54)."""

    __tablename__ = "partner_revenue_share_configs"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    partner_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    station_id = Column(
        Integer,
        ForeignKey("stations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    share_percentage = Column(
        Numeric(5, 2),
        nullable=False,
        default=Decimal("70.00"),
    )  # Tỉ lệ chia hợp đồng cho đối tác (0.00 - 100.00 %)
    include_idle_fee = Column(
        Boolean,
        nullable=False,
        default=True,
    )  # Có tính phí chiếm trụ vào doanh thu chia hay không
    effective_from = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    effective_to = Column(
        DateTime(timezone=True),
        nullable=True,
    )
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
    partner = relationship("User", foreign_keys=[partner_id])
    station = relationship("Station", foreign_keys=[station_id])


class ReconciliationPeriod(Base):
    """Kỳ đối soát tài chính (S-55)."""

    __tablename__ = "reconciliation_periods"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    period_code = Column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )  # Ví dụ: "2026-10" hoặc "CUSTOM-20261001-20261015"
    name = Column(String(255), nullable=False)
    period_type = Column(String(20), nullable=False, default="month")  # month | custom
    start_date = Column(DateTime(timezone=True), nullable=False, index=True)
    end_date = Column(DateTime(timezone=True), nullable=False, index=True)
    status = Column(
        String(20),
        nullable=False,
        default=PeriodStatus.OPEN.value,
        index=True,
    )  # OPEN, LOCKED, REOPENED

    # Tổng tiền toàn kỳ (Số nguyên đồng - VND integer)
    total_reconciled_revenue = Column(Integer, nullable=False, default=0)
    total_partner_payout = Column(Integer, nullable=False, default=0)
    total_platform_retained = Column(Integer, nullable=False, default=0)

    closed_by_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    closed_at = Column(DateTime(timezone=True), nullable=True)

    reopened_by_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reopened_at = Column(DateTime(timezone=True), nullable=True)
    reopen_reason = Column(String(500), nullable=True)

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
    closed_by = relationship("User", foreign_keys=[closed_by_id])
    reopened_by = relationship("User", foreign_keys=[reopened_by_id])
    settlements = relationship(
        "PartnerSettlement",
        back_populates="period",
        cascade="all, delete-orphan",
    )


class PartnerSettlement(Base):
    """Bảng kê chia doanh thu chi tiết cho từng đối tác trong kỳ đối soát (S-54)."""

    __tablename__ = "partner_settlements"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    period_id = Column(
        Integer,
        ForeignKey("reconciliation_periods.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    partner_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Doanh thu & Phân chia (Số nguyên đồng - VND integer)
    reconciled_revenue = Column(Integer, nullable=False, default=0)
    share_percentage = Column(Numeric(5, 2), nullable=False, default=Decimal("70.00"))
    partner_payout_amount = Column(Integer, nullable=False, default=0)
    platform_retained_amount = Column(Integer, nullable=False, default=0)

    # Thông tin thống kê chi tiết
    total_sessions = Column(Integer, nullable=False, default=0)
    total_kwh = Column(Numeric(12, 3), nullable=False, default=Decimal("0.000"))
    energy_amount = Column(Integer, nullable=False, default=0)
    idle_fee_amount = Column(Integer, nullable=False, default=0)
    include_idle_fee = Column(Boolean, nullable=False, default=True)

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
    period = relationship("ReconciliationPeriod", back_populates="settlements")
    partner = relationship("User", foreign_keys=[partner_id])


# ---------------------------------------------------------------------------
# SQLAlchemy ORM Event Listeners: Bảo vệ đa tầng (Defense-in-Depth)
# Chặn đứng mọi nỗ lực sửa đổi/xóa dữ liệu phiên, đoạn hóa đơn và sổ cái
# thuộc kỳ đối soát đã bị KHÓA (status == 'LOCKED').
# ---------------------------------------------------------------------------


def _prevent_mutation_in_locked_period(mapper, connection, target):
    """Listener chặn update/delete trên các bản ghi thuộc kỳ đã LOCKED bằng Core SQL expression."""
    if getattr(target, "_bypass_lock_guard", False):
        return

    # Xác định mốc thời gian của đối tượng
    target_dt = None
    if hasattr(target, "stop_time") and target.stop_time:
        target_dt = target.stop_time
    elif hasattr(target, "end_time") and target.end_time:
        target_dt = target.end_time
    elif hasattr(target, "start_time") and target.start_time:
        target_dt = target.start_time
    elif hasattr(target, "start_at") and target.start_at:
        target_dt = target.start_at
    elif hasattr(target, "created_at") and target.created_at:
        target_dt = target.created_at

    if target_dt is None:
        return

    # Sử dụng trực tiếp đối tượng connection.execute(text(...)) (Core SQL)
    # để tránh đệ quy 'Session is already flushing' của SQLAlchemy
    stmt = text(
        "SELECT id, period_code FROM reconciliation_periods "
        "WHERE status = 'LOCKED' AND :target_dt >= start_date AND :target_dt <= end_date "
        "LIMIT 1"
    )
    try:
        row = connection.execute(stmt, {"target_dt": target_dt}).fetchone()
    except Exception:  # noqa: BLE001, S110
        # Nếu bảng chưa tồn tại (ví dụ trong teardown), bỏ qua an toàn
        return

    if row is not None:
        raise PeriodLockedException(
            f"Kỳ đối soát '{row[1]}' đã khóa, dữ liệu ở chế độ chỉ đọc (Read-only)."
        )


def register_reconciliation_listeners():
    """Đăng ký listener cho ChargingSession, SessionBillingSegment, WalletTransaction."""
    try:
        from .session import ChargingSession
        from .session_billing_segment import SessionBillingSegment
        from .wallet import WalletTransaction
    except (ImportError, ValueError):
        from app.models.session import ChargingSession
        from app.models.session_billing_segment import SessionBillingSegment
        from app.models.wallet import WalletTransaction

    for model_cls in (ChargingSession, SessionBillingSegment, WalletTransaction):
        if not event.contains(model_cls, "before_update", _prevent_mutation_in_locked_period):
            event.listen(model_cls, "before_update", _prevent_mutation_in_locked_period)
        if not event.contains(model_cls, "before_delete", _prevent_mutation_in_locked_period):
            event.listen(model_cls, "before_delete", _prevent_mutation_in_locked_period)


# Tự động kích hoạt khi import module
register_reconciliation_listeners()
