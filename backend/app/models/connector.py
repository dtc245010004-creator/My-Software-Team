from sqlalchemy import Column, Integer, String, Boolean
from app.core.database import Base

class Connector(Base):
    __tablename__ = "connectors"
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    connector_id = Column(Integer, nullable=False)
    status = Column(String, default="Available")
    is_active = Column(Boolean, default=True)
