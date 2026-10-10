from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import relationship

from app.core.database import Base

class TopupOrder(Base):
    """Mô hình đơn nạp tiền qua cổng thanh toán Sandbox (S-35)."""
    __tablename__ = "topup_orders"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    order_code = Column(String(50), unique=True, nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    status = Column(String(20), nullable=False, default="PENDING") # PENDING, SUCCESS, FAILED, CANCELLED
    failure_reason = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", backref="topup_orders")
