from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.core.datetime_utils import UTCDateTime


class SessionStartRequest(BaseModel):
    connector_id: int = Field(..., description="ID cổng/súng sạc kết nối")
    battery_capacity_kwh: float | None = Field(
        default=60.0, ge=10.0, le=250.0, description="Dung lượng pin xe điện (kWh)"
    )
    initial_soc: float | None = Field(
        default=None,
        ge=0.0,
        le=99.0,
        description="Mức pin hiện có khi bắt đầu cắm sạc (SoC %)",
    )


class SessionStopRequest(BaseModel):
    meter_stop_kwh: Decimal | None = Field(
        default=None,
        ge=0,
        description="Chỉ số công tơ điện khi kết thúc (kWh) - nếu bỏ trống sẽ lấy từ Simulator",
    )
    stop_reason: str | None = Field(default="USER_STOPPED", max_length=100)


class SessionResponse(BaseModel):
    id: int
    user_id: int
    connector_id: int
    tariff_id: int
    applied_price_per_kwh: Decimal
    start_time: UTCDateTime
    end_time: UTCDateTime | None = None
    meter_start_kwh: Decimal
    meter_stop_kwh: Decimal | None = None
    total_kwh: Decimal
    total_amount: Decimal
    current_soc: float = 0.0
    last_checkpoint_at: UTCDateTime | None = None
    status: str
    stop_reason: str | None = None
    created_at: UTCDateTime

    model_config = ConfigDict(from_attributes=True)
