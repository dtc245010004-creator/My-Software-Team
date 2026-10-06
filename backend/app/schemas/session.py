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


class ForceCloseSessionRequest(BaseModel):
    reason: str = Field(
        ...,
        min_length=3,
        max_length=255,
        description="Lý do can thiệp bắt buộc đóng phiên sạc bất thường",
    )
    meter_stop_kwh: Decimal | None = Field(
        default=None,
        ge=0,
        description="Chỉ số công tơ điện chốt cuối cùng (kWh)",
    )


class RemoteStopRequest(BaseModel):
    simulate_condition: str | None = Field(
        default=None,
        description="Điều kiện mô phỏng kiểm thử: REJECTED | OFFLINE | TIMEOUT | NORMAL",
    )


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
    station_id: int | None = None
    station_name: str | None = None
    charger_code: str | None = None

    model_config = ConfigDict(from_attributes=True)


class SessionSummaryItem(BaseModel):
    group_key: str
    station_id: int | None = None
    station_name: str | None = None
    date: str | None = None
    total_sessions: int = 0
    total_kwh: float = 0.0
    total_amount: float = 0.0
    completed_sessions: int = 0


class SessionSummaryResponse(BaseModel):
    group_by: str
    kpi: dict[str, float | int]
    items: list[SessionSummaryItem]
