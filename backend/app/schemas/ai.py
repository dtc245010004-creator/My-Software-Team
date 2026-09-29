from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# --- 1. Smart Charging & Load Balancing Schemas ---

class SmartChargingAllocationItem(BaseModel):
    """Chi tiết phân bổ công suất cho từng cổng sạc."""
    connector_id: int
    charger_id: Optional[int] = None
    charger_code: Optional[str] = None
    connector_number: Optional[int] = None
    soc: float = Field(..., ge=0.0, le=100.0, description="Dung lượng pin hiện tại (%)")
    requested_power_kw: float = Field(..., ge=0.0, description="Công suất yêu cầu ban đầu (kW)")
    weight: float = Field(..., ge=0.0, description="Trọng số ưu tiên theo SoC")
    allocated_power_kw: float = Field(..., ge=0.0, description="Công suất phân bổ an toàn (kW)")


class SmartChargingResponse(BaseModel):
    """Kết quả phân tích điều phối tải lưới điện (Load Balancing)."""
    station_id: int
    grid_limit_kw: float = Field(..., description="Công suất an toàn tối đa của trạm (kW)")
    total_requested_kw: float = Field(..., description="Tổng công suất các xe đang yêu cầu (kW)")
    total_allocated_kw: float = Field(..., description="Tổng công suất phân bổ thực tế (kW)")
    allocations: List[SmartChargingAllocationItem] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    source: str = Field(..., description="'GEMINI_AI' hoặc 'HEURISTIC_FALLBACK'")
    is_fallback: bool = Field(..., description="True nếu chạy thuật toán Heuristic")


# --- 2. Predictive Maintenance Schemas ---

class PredictiveMaintenanceResponse(BaseModel):
    """Kết quả phân tích dự báo bảo trì trụ sạc."""
    charger_id: int
    charger_code: str
    risk_level: str = Field(..., description="'NORMAL' | 'MEDIUM' | 'HIGH' | 'CRITICAL'")
    health_score: float = Field(..., ge=0.0, le=100.0, description="Điểm sức khỏe thiết bị (0-100)")
    thermal_trend: str = Field(..., description="'stable' | 'increasing' | 'decreasing'")
    avg_temperature: float = Field(..., description="Nhiệt độ trung bình (°C)")
    max_temperature: float = Field(..., description="Nhiệt độ đỉnh (°C)")
    voltage_stability_pct: float = Field(..., description="Độ ổn định điện áp (%)")
    recommended_action: str = Field(..., description="Hành động kỹ thuật đề xuất")
    source: str = Field(..., description="'GEMINI_AI' hoặc 'HEURISTIC_FALLBACK'")
    is_fallback: bool = Field(..., description="True nếu chạy thuật toán Heuristic")


# --- 3. Dynamic Pricing Advisor Schemas ---

class PricingAdjustmentItem(BaseModel):
    """Chi tiết điều chỉnh biểu giá theo khung giờ."""
    time_slot: str = Field(..., description="'PEAK' | 'NORMAL' | 'OFFPEAK'")
    current_price: float = Field(..., description="Đơn giá hiện tại (VND/kWh)")
    suggested_price: float = Field(..., description="Đơn giá đề xuất (VND/kWh)")
    change_pct: float = Field(..., description="Tỷ lệ thay đổi (%)")


class PricingAdviceResponse(BaseModel):
    """Kết quả tư vấn tối ưu hóa biểu giá trạm sạc."""
    station_id: int
    current_tariff_id: Optional[int] = None
    occupancy_peak_pct: float = Field(..., description="Tỷ lệ lấp đầy giờ cao điểm (%)")
    occupancy_offpeak_pct: float = Field(..., description="Tỷ lệ lấp đầy giờ thấp điểm (%)")
    adjustments: List[PricingAdjustmentItem] = Field(default_factory=list)
    reasoning: str = Field(..., description="Giải trình cơ sở khuyến nghị biểu giá")
    source: str = Field(..., description="'GEMINI_AI' hoặc 'HEURISTIC_FALLBACK'")
    is_fallback: bool = Field(..., description="True nếu chạy thuật toán Heuristic")


# --- 4. NLP AI Advisor Schemas ---

class AIAskRequest(BaseModel):
    """Câu hỏi gửi trợ lý AI thông minh."""
    question: str = Field(..., min_length=2, max_length=1000, description="Nội dung câu hỏi của người vận hành")


class AIAskResponse(BaseModel):
    """Phản hồi từ trợ lý AI thông minh."""
    question: str
    answer: str
    source: str = Field(..., description="'GEMINI_AI' hoặc 'HEURISTIC_FALLBACK'")
    is_fallback: bool = Field(..., description="True nếu chạy thuật toán Heuristic")
    basic_stats: Optional[Dict[str, Any]] = Field(default=None, description="Số liệu thống kê thực tế trích xuất từ DB")
