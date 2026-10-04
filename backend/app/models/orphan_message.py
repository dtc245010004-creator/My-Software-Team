"""Mô hình lưu trữ các tin nhắn OCPP mồ côi không khớp transactionId (Task T-38)."""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.core.database import Base


class OrphanMessage(Base):
    """Lưu trữ thông tin các tin nhắn StopTransaction không tìm thấy transactionId."""

    __tablename__ = "orphan_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    charge_point_code = Column(String(100), nullable=False, index=True)
    message_id = Column(String(100), nullable=True)
    action = Column(String(100), nullable=False, default="StopTransaction")
    payload = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

