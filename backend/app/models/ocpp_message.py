"""Bảng lưu kết quả CALL OCPP để xử lý tin nhắn lặp qua nhiều phiên."""

from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint, func

from app.core.database import Base


class OcppMessage(Base):
    """Kết quả xử lý OCPP đã lưu theo trụ và message ID duy nhất."""

    __tablename__ = "ocpp_messages"
    __table_args__ = (
        UniqueConstraint(
            "charge_point_code",
            "message_id",
            name="uq_ocpp_message_charge_point_message",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    charge_point_code = Column(String(50), nullable=False, index=True)
    message_id = Column(String(100), nullable=False)
    action = Column(String(100), nullable=False)
    response_payload = Column(Text, nullable=False)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
