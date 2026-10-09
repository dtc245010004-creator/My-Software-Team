from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.core.datetime_utils import UTCDateTime


class RemoteStartSessionRequest(BaseModel):
    connector_id: int = Field(..., gt=0, description="ID đầu nối cần bắt đầu sạc")
    simulate_condition: str | None = Field(
        default=None,
        description="Mô phỏng 4 ca S-24 cho kiểm thử: REJECTED, BUSY, TIMEOUT, EXPIRED, SUCCESS",
    )


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


class PriceSegmentItem(BaseModel):
    segment_index: int = Field(..., description="Số thứ tự đoạn giá")
    rate_type: str = Field(..., description="Loại đơn giá: NORMAL | PEAK | OFFPEAK")
    rate_name: str = Field(..., description="Tên hiển thị khung giờ: Giờ bình thường, Giờ cao điểm...")
    time_range: str = Field(..., description="Khoảng thời gian áp dụng (HH:mm - HH:mm)")
    start_time: str = Field(..., description="Mốc thời gian bắt đầu đoạn")
    end_time: str = Field(..., description="Mốc thời gian kết thúc đoạn")
    duration_minutes: int = Field(..., description="Thời lượng của đoạn (phút)")
    kwh: Decimal = Field(..., description="Sản lượng điện năng tiêu thụ trong đoạn (kWh)")
    unit_price: Decimal = Field(..., description="Đơn giá điện áp dụng cho đoạn (VNĐ/kWh)")
    amount: Decimal = Field(..., description="Thành tiền của đoạn (VNĐ)")


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
    total_energy_kwh: str | None
    currency: str
    rounding_rule: str
    rounding_note: str
    daily_groups: list[InvoiceDailyGroupResponse]
    tong_kwh: str | None = None
    tong_tien: int | None = None
    quy_tac_lam_tron: str | None = None
    nhom_theo_ngay: list[InvoiceDailyGroupResponse] | None = None
    total_amount: Decimal | int | float | None
    is_legacy: bool = Field(
        default=False,
        description="Phiên cũ không có snapshot đoạn giá; tổng tiền lấy từ charging_sessions.",
    )
    status: str | None = None
    is_reviewing: bool = Field(default=False, description="Phiên đang ở trạng thái cần xem xét đối soát")
    review_message: str | None = Field(default=None, description="Thông điệp thông báo đang chờ xử lý")
    driver_id: int | None = None
    driver_name: str | None = None
    station_id: int | None = None
    station_name: str | None = None
    charger_code: str | None = None
    connector_id: int | None = None
    connector_number: int | None = None
    connector_type: str | None = None
    start_time: UTCDateTime | str | None = None
    end_time: UTCDateTime | None = None
    duration_minutes: int | None = None
    meter_start_kwh: Decimal | None = None
    meter_stop_kwh: Decimal | None = None
    total_kwh: Decimal | None = None
    applied_price_per_kwh: Decimal | None = None
    tariff_name: str | None = None
    price_segments: list[PriceSegmentItem] = Field(default_factory=list, description="Danh sách từng đoạn giá")
    charging_amount: Decimal | None = Field(default=Decimal("0.00"), description="Tổng tiền sạc điện năng (tổng các đoạn giá)")
    idle_minutes: int = Field(default=0, description="Số phút chiếm trụ sau khi sạc xong")
    idle_rate_per_min: Decimal | None = Field(default=Decimal("1000.00"), description="Đơn giá phí chiếm trụ (VNĐ/phút)")
    idle_fee: Decimal | None = Field(default=Decimal("0.00"), description="Phí chiếm trụ (VNĐ)")
    tax_amount: Decimal | None = Field(default=Decimal("0.00"), description="Thuế GTGT / Phí dịch vụ phụ trợ")
    payment_status: str = Field(default="PAID", description="Trạng thái thanh toán: PAID | PENDING | PENDING_REVIEW")

    model_config = ConfigDict(from_attributes=True, extra="allow")

