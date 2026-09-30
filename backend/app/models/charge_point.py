from sqlalchemy import Column, Integer, String, Boolean
from app.core.database import Base

class ChargePoint(Base):
    __tablename__ = "charge_points"
    id = Column(Integer, primary_key=True, index=True)
    charge_point_id = Column(String, unique=True, index=True, nullable=False)
    is_active = Column(Boolean, default=True)
