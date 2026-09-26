from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class TariffBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Tên biểu giá điện")
    price_normal: Decimal = Field(..., ge=0, description="Đơn giá giờ bình thường (VNĐ/kWh)")
    price_peak: Decimal = Field(..., ge=0, description="Đơn giá giờ cao điểm (VNĐ/kWh)")
    price_offpeak: Decimal = Field(..., ge=0, description="Đơn giá giờ thấp điểm (VNĐ/kWh)")
    peak_start: str = Field(default="09:30", max_length=5)
    peak_end: str = Field(default="11:30", max_length=5)
    peak_start_2: str = Field(default="17:00", max_length=5)
    peak_end_2: str = Field(default="20:00", max_length=5)
    offpeak_start: str = Field(default="22:00", max_length=5)
    offpeak_end: str = Field(default="04:00", max_length=5)


class TariffCreate(TariffBase):
    station_id: Optional[int] = Field(default=None, description="Trạm sạc áp dụng (Null = Biểu giá hệ thống)")


class TariffUpdate(BaseModel):
    name: Optional[str] = None
    price_normal: Optional[Decimal] = Field(default=None, ge=0)
    price_peak: Optional[Decimal] = Field(default=None, ge=0)
    price_offpeak: Optional[Decimal] = Field(default=None, ge=0)
    peak_start: Optional[str] = None
    peak_end: Optional[str] = None
    peak_start_2: Optional[str] = None
    peak_end_2: Optional[str] = None
    offpeak_start: Optional[str] = None
    offpeak_end: Optional[str] = None
    is_active: Optional[bool] = None


from app.core.datetime_utils import UTCDateTime


class TariffResponse(TariffBase):
    id: int
    station_id: Optional[int] = None
    is_active: bool
    created_at: UTCDateTime

    model_config = ConfigDict(from_attributes=True)
