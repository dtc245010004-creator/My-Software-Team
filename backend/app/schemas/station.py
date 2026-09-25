from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class StationBase(BaseModel):
    name: str
    address: str
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Vĩ độ [-90, 90]")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Kinh độ [-180, 180]")


class StationCreate(StationBase):
    pass


class StationUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    latitude: float | None = Field(None, ge=-90.0, le=90.0)
    longitude: float | None = Field(None, ge=-180.0, le=180.0)


class StationResponse(StationBase):
    id: int
    is_active: bool
    owner_id: int
    created_at: datetime | str | None = None
    updated_at: datetime | str | None = None

    model_config = ConfigDict(from_attributes=True)