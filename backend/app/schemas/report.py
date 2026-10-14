"""Schema Pydantic cho Báo cáo doanh thu & sản lượng theo kỳ, theo trụ (S-52 / Epic E-07)."""

from decimal import Decimal

from pydantic import BaseModel, Field


class ChargerRevenueItem(BaseModel):
    charger_id: int = Field(..., description="ID của trụ sạc")
    charger_code: str = Field(..., description="Mã trụ sạc")
    total_sessions: int = Field(..., description="Số phiên sạc thành công trong kỳ")
    total_kwh: Decimal = Field(..., description="Tổng sản lượng điện kWh đã cấp")
    total_energy_amount: Decimal = Field(..., description="Tổng tiền điện đã chốt (VND)")
    total_idle_amount: Decimal = Field(..., description="Tổng phí chiếm trụ đã chốt (VND)")
    total_amount: Decimal = Field(..., description="Tổng tiền cước đã chốt (VND)")


class StationRevenueReportResponse(BaseModel):
    station_id: int = Field(..., description="ID của trạm sạc")
    station_name: str = Field(..., description="Tên trạm sạc")
    period_type: str = Field(..., description="Loại kỳ: day, week, month, custom")
    start_time: str = Field(..., description="Mốc bắt đầu kỳ (ISO format)")
    end_time: str = Field(..., description="Mốc kết thúc kỳ (ISO format)")
    total_chargers: int = Field(..., description="Tổng số trụ sạc thuộc trạm")
    total_sessions: int = Field(..., description="Tổng số phiên toàn trạm trong kỳ")
    total_kwh: Decimal = Field(..., description="Tổng kWh toàn trạm trong kỳ")
    total_energy_amount: Decimal = Field(..., description="Tổng tiền điện toàn trạm (VND)")
    total_idle_amount: Decimal = Field(..., description="Tổng phí chiếm trụ toàn trạm (VND)")
    total_amount: Decimal = Field(..., description="Tổng doanh thu toàn trạm (VND)")
    chargers: list[ChargerRevenueItem] = Field(..., description="Chi tiết doanh thu theo từng trụ")


class DiscrepancyItem(BaseModel):
    session_id: int = Field(..., description="ID phiên sạc")
    issue_type: str = Field(
        ...,
        description="Loại bất thường: UNBILLED_ENERGY, MISSING_LEDGER, AMOUNT_MISMATCH",
    )
    description: str = Field(..., description="Mô tả chi tiết sự bất thường")
    kwh: Decimal = Field(..., description="Số kWh cấp")
    invoice_amount: Decimal = Field(..., description="Tiền trên hóa đơn/phiên (VND)")
    calculated_amount: Decimal = Field(..., description="Tiền tính lại từ biểu giá (VND)")
    ledger_amount: Decimal = Field(..., description="Tiền ghi nhận tại sổ cái ví (VND)")
    difference: Decimal = Field(..., description="Độ lệch tiền (VND)")


class ReconciliationReportResponse(BaseModel):
    period_type: str = Field(..., description="Loại kỳ: day, week, month, custom")
    start_time: str = Field(..., description="Mốc bắt đầu kỳ (ISO format)")
    end_time: str = Field(..., description="Mốc kết thúc kỳ (ISO format)")
    tolerance_applied_vnd: Decimal = Field(..., description="Ngưỡng dung sai áp dụng (VND)")
    total_issues: int = Field(..., description="Tổng số phiên phát hiện bất thường")
    total_discrepancy_amount: Decimal = Field(..., description="Tổng tiền chênh lệch cần xử lý (VND)")
    issues: list[DiscrepancyItem] = Field(..., description="Danh sách các phiên bất thường")

