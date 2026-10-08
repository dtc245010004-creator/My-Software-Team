from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

from app.core.datetime_utils import UTCDateTime


def _validate_non_negative(
    value: Decimal | int | None, field_name: str
) -> Decimal | int | None:
    if value is not None and value < 0:
        raise ValueError(f"Trường {field_name} không được âm.")
    return value


class TariffBase(BaseModel):
    name: str = Field(
        ..., min_length=2, max_length=100, description="Tên biểu giá điện"
    )
    price_normal: Decimal = Field(
        ..., description="Đơn giá giờ bình thường (VNĐ/kWh)"
    )
    price_peak: Decimal = Field(..., description="Đơn giá giờ cao điểm (VNĐ/kWh)")
    price_offpeak: Decimal = Field(
        ..., description="Đơn giá giờ thấp điểm (VNĐ/kWh)"
    )
    idle_fee_per_minute: Decimal = Field(
        default=Decimal("0.00"), description="Phí chiếm trụ (VNĐ/phút)"
    )
    idle_grace_minutes: int = Field(default=0, description="Thời gian ân hạn chiếm trụ (phút)")
    peak_start: str = Field(default="09:30", max_length=5)
    peak_end: str = Field(default="11:30", max_length=5)
    peak_start_2: str = Field(default="17:00", max_length=5)
    peak_end_2: str = Field(default="20:00", max_length=5)
    offpeak_start: str = Field(default="22:00", max_length=5)
    offpeak_end: str = Field(default="04:00", max_length=5)

    @field_validator(
        "price_normal", "price_peak", "price_offpeak", "idle_fee_per_minute"
    )
    @classmethod
    def validate_non_negative_amount(cls, value: Decimal, info: ValidationInfo):
        return _validate_non_negative(value, info.field_name)

    @field_validator("idle_grace_minutes")
    @classmethod
    def validate_non_negative_grace(cls, value: int, info: ValidationInfo):
        return _validate_non_negative(value, info.field_name)


class TariffCreate(TariffBase):
    station_id: int | None = Field(
        default=None, description="Trạm sạc áp dụng (Null = Biểu giá hệ thống)"
    )


class TariffUpdate(BaseModel):
    name: str | None = None
    price_normal: Decimal | None = None
    price_peak: Decimal | None = None
    price_offpeak: Decimal | None = None
    idle_fee_per_minute: Decimal | None = None
    idle_grace_minutes: int | None = None
    peak_start: str | None = None
    peak_end: str | None = None
    peak_start_2: str | None = None
    peak_end_2: str | None = None
    offpeak_start: str | None = None
    offpeak_end: str | None = None
    is_active: bool | None = None

    @field_validator(
        "price_normal", "price_peak", "price_offpeak", "idle_fee_per_minute"
    )
    @classmethod
    def validate_non_negative_amount(cls, value: Decimal | None, info: ValidationInfo):
        return _validate_non_negative(value, info.field_name)

    @field_validator("idle_grace_minutes")
    @classmethod
    def validate_non_negative_grace(cls, value: int | None, info: ValidationInfo):
        return _validate_non_negative(value, info.field_name)


class TariffResponse(TariffBase):
    id: int
    station_id: int | None = None
    is_active: bool
    created_at: UTCDateTime

    model_config = ConfigDict(from_attributes=True)
