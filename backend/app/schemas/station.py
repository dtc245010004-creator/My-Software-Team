from datetime import datetime
from typing import Optional, Union
from pydantic import BaseModel, ConfigDict, Field


class StationBase(BaseModel):
    name: str
    address: str
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Vĩ độ [-90, 90]")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Kinh độ [-180, 180]")


class StationCreate(StationBase):
    pass


class StationUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)


class StationResponse(StationBase):
    id: int
    is_active: bool
    owner_id: int
    created_at: Optional[Union[datetime, str]] = None
    updated_at: Optional[Union[datetime, str]] = None

    model_config = ConfigDict(from_attributes=True)