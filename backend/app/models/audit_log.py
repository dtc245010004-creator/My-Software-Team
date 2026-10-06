"""Nhật ký bất biến cho các lệnh điều khiển từ xa."""
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, JSON, String, func
from app.core.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_created_at", "created_at"),
        Index("ix_audit_logs_user_created_at", "user_id", "created_at"),
        Index("ix_audit_logs_object_created_at", "object_type", "object_id", "created_at"),
    )
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(100), nullable=False)
    object_type = Column(String(100), nullable=False)
    object_id = Column(String(100), nullable=True)
    data = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
