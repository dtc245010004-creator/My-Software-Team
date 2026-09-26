from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from app.core.datetime_utils import UTCDateTime


class SessionStartRequest(BaseModel):
    connector_id: int = Field(..., description="ID cổng/súng sạc kết nối")
    battery_capacity_kwh: Optional[float] = Field(
        default=60.0, ge=10.0, le=250.0, description="Dung lượng pin xe điện (kWh)"
    )
    initial_soc: Optional[float] = Field(
        default=None, ge=0.0, le=99.0, description="Mức pin hiện có khi bắt đầu cắm sạc (SoC %)"
    )


class SessionStopRequest(BaseModel):
    meter_stop_kwh: Optional[Decimal] = Field(
        default=None, ge=0, description="Chỉ số công tơ điện khi kết thúc (kWh) - nếu bỏ trống sẽ lấy từ Simulator"
    )
    stop_reason: Optional[str] = Field(default="USER_STOPPED", max_length=100)


class SessionResponse(BaseModel):
    id: int
    user_id: int
    connector_id: int
    tariff_id: int
    applied_price_per_kwh: Decimal
    start_time: UTCDateTime
    end_time: Optional[UTCDateTime] = None
    meter_start_kwh: Decimal
    meter_stop_kwh: Optional[Decimal] = None
    total_kwh: Decimal
    total_amount: Decimal
    current_soc: float = 0.0
    last_checkpoint_at: Optional[UTCDateTime] = None
    status: str
    stop_reason: Optional[str] = None
    created_at: UTCDateTime

    model_config = ConfigDict(from_attributes=True)

