from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.core.datetime_utils import UTCDateTime


class TariffBase(BaseModel):
    name: str = Field(
        ..., min_length=2, max_length=100, description="Tên biểu giá điện"
    )
    price_normal: Decimal = Field(
        ..., ge=0, description="Đơn giá giờ bình thường (VNĐ/kWh)"
    )
    price_peak: Decimal = Field(..., ge=0, description="Đơn giá giờ cao điểm (VNĐ/kWh)")
    price_offpeak: Decimal = Field(
        ..., ge=0, description="Đơn giá giờ thấp điểm (VNĐ/kWh)"
    )
    peak_start: str = Field(default="09:30", max_length=5)
    peak_end: str = Field(default="11:30", max_length=5)
    peak_start_2: str = Field(default="17:00", max_length=5)
    peak_end_2: str = Field(default="20:00", max_length=5)
    offpeak_start: str = Field(default="22:00", max_length=5)
    offpeak_end: str = Field(default="04:00", max_length=5)
    effective_from: UTCDateTime | None = Field(
        default=None,
        description="Thời điểm bắt đầu có hiệu lực (UTC / ISO 8601). Phải từ ngày mai trở đi (giờ VN).",
    )


class TariffCreate(TariffBase):
    station_id: int | None = Field(
        default=None, description="Trạm sạc áp dụng (Null = Biểu giá hệ thống)"
    )


class TariffUpdate(BaseModel):
    name: str | None = None
    price_normal: Decimal | None = Field(default=None, ge=0)
    price_peak: Decimal | None = Field(default=None, ge=0)
    price_offpeak: Decimal | None = Field(default=None, ge=0)
    peak_start: str | None = None
    peak_end: str | None = None
    peak_start_2: str | None = None
    peak_end_2: str | None = None
    offpeak_start: str | None = None
    offpeak_end: str | None = None
    effective_from: UTCDateTime | None = None
    is_active: bool | None = None


class TariffResponse(TariffBase):
    id: int
    station_id: int | None = None
    effective_from: UTCDateTime
    is_active: bool
    created_at: UTCDateTime

    model_config = ConfigDict(from_attributes=True)
