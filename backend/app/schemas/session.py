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


class SessionInvoiceResponse(BaseModel):
    session_id: int
    status: str
    is_reviewing: bool = Field(default=False, description="Phiên đang ở trạng thái cần xem xét đối soát")
    review_message: str | None = Field(default=None, description="Thông điệp thông báo đang chờ xử lý")
    driver_id: int | None = None
    driver_name: str | None = None
    station_id: int | None = None
    station_name: str | None = None
    charger_code: str | None = None
    connector_id: int
    connector_number: int | None = None
    connector_type: str | None = None
    start_time: UTCDateTime
    end_time: UTCDateTime | None = None
    duration_minutes: int
    meter_start_kwh: Decimal
    meter_stop_kwh: Decimal | None = None
    total_kwh: Decimal
    applied_price_per_kwh: Decimal
    tariff_name: str | None = None
    price_segments: list[PriceSegmentItem] = Field(default_factory=list, description="Danh sách từng đoạn giá")
    charging_amount: Decimal = Field(..., description="Tổng tiền sạc điện năng (tổng các đoạn giá)")
    idle_minutes: int = Field(default=0, description="Số phút chiếm trụ sau khi sạc xong")
    idle_rate_per_min: Decimal = Field(default=Decimal("1000.00"), description="Đơn giá phí chiếm trụ (VNĐ/phút)")
    idle_fee: Decimal = Field(default=Decimal("0.00"), description="Phí chiếm trụ (VNĐ)")
    tax_amount: Decimal = Field(default=Decimal("0.00"), description="Thuế GTGT / Phí dịch vụ phụ trợ")
    total_amount: Decimal = Field(..., description="Tổng cộng tiền thanh toán (VNĐ)")
    payment_status: str = Field(default="PAID", description="Trạng thái thanh toán: PAID | PENDING | PENDING_REVIEW")

