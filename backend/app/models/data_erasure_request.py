"""Yêu cầu tài xế ẩn danh hóa dữ liệu cá nhân."""

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)

from app.core.database import Base


class DataErasureRequest(Base):
    __tablename__ = "data_erasure_requests"
    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')",
            name="ck_data_erasure_request_status_valid",
        ),
        Index(
            "uq_data_erasure_pending_user",
            "user_id",
            unique=True,
            sqlite_where=text("status = 'PENDING'"),
            postgresql_where=text("status = 'PENDING'"),
        ),
        Index("ix_data_erasure_requests_status_requested", "status", "requested_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status = Column(String(20), nullable=False, default="PENDING", server_default="PENDING")
    requested_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    reviewed_by_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reject_reason = Column(Text, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    block_reason = Column(Text, nullable=True)
