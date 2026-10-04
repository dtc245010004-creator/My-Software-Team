"""Thẻ định danh OCPP gắn với tài khoản người dùng."""

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String

from app.core.database import Base


class IdTag(Base):
    """Trạng thái và thời hạn sử dụng thẻ RFID của tài xế."""

    __tablename__ = "id_tags"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'blocked')", name="ck_id_tag_status_valid"
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(100), unique=True, index=True, nullable=False)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status = Column(String(20), default="active", nullable=False)
    expiry_date = Column(DateTime(timezone=True), nullable=True)
