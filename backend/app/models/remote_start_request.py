from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from app.core.database import Base


class RemoteStartRequest(Base):
    __tablename__ = "remote_start_requests"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    connector_id = Column(Integer, ForeignKey("connectors.id", ondelete="CASCADE"), nullable=False, index=True)
    id_tag = Column(String(100), nullable=False)
    status = Column(String(20), nullable=False, default="PENDING", index=True)
    transaction_id = Column(Integer, ForeignKey("charging_sessions.id", ondelete="SET NULL"), nullable=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
