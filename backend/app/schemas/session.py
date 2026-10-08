from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.core.datetime_utils import UTCDateTime


class RemoteStartSessionRequest(BaseModel):
    connector_id: int = Field(..., gt=0, description="ID đầu nối cần bắt đầu sạc")


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


class CurrentSessionResponse(SessionResponse):
    latest_kwh: Decimal
    latest_meter_at: UTCDateTime | None = None


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


class InvoiceSegmentResponse(BaseModel):
    segment_index: int
    start_time: str
    end_time: str
    energy_kwh: str
    unit_price: int | float
    raw_amount: str
    rounded_amount: int
    is_interpolated: bool
    tu_gio: str | None = None
    den_gio: str | None = None
    so_kwh: str | None = None
    don_gia: int | float | None = None
    thanh_tien: int | None = None
    co_noi_suy: bool | None = None

    model_config = ConfigDict(extra="allow")


class InvoiceDailyGroupResponse(BaseModel):
    date: str
    daily_energy_kwh: str
    daily_total_amount: int
    segments: list[InvoiceSegmentResponse]
    ngay: str | None = None
    tong_kwh_ngay: str | None = None
    tong_tien_ngay: int | None = None
    cac_doan: list[InvoiceSegmentResponse] | None = None

    model_config = ConfigDict(extra="allow")


class SessionInvoiceResponse(BaseModel):
    session_id: str
    timezone: str
    total_energy_kwh: str
    total_amount: int
    currency: str
    rounding_rule: str
    rounding_note: str
    daily_groups: list[InvoiceDailyGroupResponse]
    tong_kwh: str | None = None
    tong_tien: int | None = None
    quy_tac_lam_tron: str | None = None
    nhom_theo_ngay: list[InvoiceDailyGroupResponse] | None = None

    model_config = ConfigDict(extra="allow")

