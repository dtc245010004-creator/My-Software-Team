"""Pydantic schemas cho Đối soát, Chia doanh thu & Khóa kỳ đối soát (S-54, S-55 / Epic E-09)."""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class PartnerRevenueShareConfigCreate(BaseModel):
    """Payload tạo/cập nhật cấu hình chia doanh thu đối tác (S-54)."""

    partner_id: int = Field(..., description="ID đối tác (User ID)")
    station_id: Optional[int] = Field(None, description="ID trạm sạc cụ thể (nếu có)")
    share_percentage: Decimal = Field(
        ...,
        ge=0,
        le=100,
        description="Tỉ lệ chia doanh thu cho đối tác (0.00 - 100.00 %)",
    )
    include_idle_fee: bool = Field(
        True,
        description="Bật/tắt chia phí chiếm trụ (True = chia, False = nền tảng giữ)",
    )
    effective_from: Optional[datetime] = Field(
        None,
        description="Mốc thời gian bắt đầu có hiệu lực",
    )
    effective_to: Optional[datetime] = Field(
        None,
        description="Mốc thời gian kết thúc hiệu lực (nếu có)",
    )


class PartnerRevenueShareConfigResponse(BaseModel):
    """Thông tin cấu hình chia doanh thu của đối tác."""

    id: int
    partner_id: int
    partner_name: Optional[str] = None
    station_id: Optional[int] = None
    station_name: Optional[str] = None
    share_percentage: Decimal
    include_idle_fee: bool
    effective_from: datetime
    effective_to: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReconciliationPeriodCreate(BaseModel):
    """Payload tạo mới kỳ đối soát."""

    period_code: Optional[str] = Field(
        None,
        description="Mã kỳ đối soát (Ví dụ: 2026-10 hoặc CUSTOM-20261001-20261015)",
    )
    name: Optional[str] = Field(None, description="Tên kỳ đối soát")
    period_type: str = Field("month", description="Loại kỳ: month | custom")
    start_date: Optional[str] = Field(None, description="Ngày bắt đầu dạng YYYY-MM-DD")
    end_date: Optional[str] = Field(None, description="Ngày kết thúc dạng YYYY-MM-DD")


class UnresolvedSessionItem(BaseModel):
    """Thông tin phiên sạc bất thường cản trở việc chốt kỳ đối soát (S-55 AC 2)."""

    session_id: int = Field(..., description="ID phiên sạc (transaction_id)")
    charge_point_id: Optional[int] = Field(None, description="ID trụ sạc")
    charge_point_code: Optional[str] = Field(None, description="Mã trụ sạc")
    anomaly_reason: str = Field(..., description="Lý do bất thường cụ thể")


class PeriodLockConflictResponse(BaseModel):
    """Phản hồi lỗi 409 Conflict khi chốt kỳ đối soát mà còn phiên bất thường chưa xử lý."""

    detail: str
    unresolved_sessions: list[UnresolvedSessionItem] = []


class PartnerSettlementResponse(BaseModel):
    """Bảng kê chia doanh thu cho từng đối tác (S-54)."""

    id: int
    period_id: int
    partner_id: int
    partner_name: Optional[str] = None
    reconciled_revenue: int = Field(..., description="Tổng doanh thu đã đối soát (VND nguyên đồng)")
    share_percentage: Decimal = Field(..., description="Tỉ lệ chia hợp đồng (%)")
    partner_payout_amount: int = Field(..., description="Số tiền phải trả đối tác (VND nguyên đồng)")
    platform_retained_amount: int = Field(..., description="Phần nền tảng giữ lại (VND nguyên đồng)")
    total_sessions: int = Field(..., description="Số lượng phiên sạc trong kỳ")
    total_kwh: Decimal = Field(..., description="Tổng sản lượng kWh")
    energy_amount: int = Field(..., description="Doanh thu tiền điện (VND nguyên đồng)")
    idle_fee_amount: int = Field(..., description="Doanh thu phí chiếm trụ (VND nguyên đồng)")
    include_idle_fee: bool = Field(..., description="Đã tính kèm phí chiếm trụ hay chưa")
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReconciliationPeriodResponse(BaseModel):
    """Thông tin chi tiết kỳ đối soát tài chính."""

    id: int
    period_code: str
    name: str
    period_type: str
    start_date: datetime
    end_date: datetime
    status: str
    total_reconciled_revenue: int
    total_partner_payout: int
    total_platform_retained: int
    closed_by_id: Optional[int] = None
    closed_at: Optional[datetime] = None
    reopened_by_id: Optional[int] = None
    reopened_at: Optional[datetime] = None
    reopen_reason: Optional[str] = None
    settlements: list[PartnerSettlementResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReopenPeriodRequest(BaseModel):
    """Payload yêu cầu mở lại kỳ đối soát (S-55 AC 3)."""

    reason: str = Field(
        ...,
        min_length=5,
        description="Lý do bắt buộc để mở lại kỳ đối soát đã chốt",
    )

