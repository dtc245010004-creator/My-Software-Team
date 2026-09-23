from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.charge_point import ChargePoint


class Connector(Base):
    __tablename__ = "connectors"
    __table_args__ = (
        UniqueConstraint("charge_point_id", "connector_number", name="uix_connector_charge_point_number"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    charge_point_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("charge_points.id", ondelete="CASCADE"), nullable=False, index=True
    )
    connector_number: Mapped[int] = mapped_column(Integer, nullable=False)
    connector_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="offline")
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    charge_point: Mapped["ChargePoint"] = relationship(
        "ChargePoint", back_populates="connectors"
    )
