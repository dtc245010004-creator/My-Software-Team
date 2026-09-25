from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class SessionStartRequest(BaseModel):
    connector_id: int = Field(..., description="ID cổng/súng sạc kết nối")


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
    start_time: datetime
    end_time: Optional[datetime] = None
    meter_start_kwh: Decimal
    meter_stop_kwh: Optional[Decimal] = None
    total_kwh: Decimal
    total_amount: Decimal
    current_soc: float = 0.0
    last_checkpoint_at: Optional[datetime] = None
    status: str
    stop_reason: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

