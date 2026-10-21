"""Pydantic schemas cho Đặt chỗ trước trụ sạc (User Story S-48, S-49 / Epic E-07)."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ReservationCreateRequest(BaseModel):
    """Payload yêu cầu đặt chỗ đầu nối sạc từ tài xế."""

    connector_id: int = Field(..., description="ID của đầu nối sạc cần đặt chỗ")
    expiry_date: Optional[datetime] = Field(
        None,
        description="Thời điểm hết hạn giữ chỗ (ISO datetime, tối đa 2 giờ kể từ hiện tại)",
    )
    duration_minutes: Optional[int] = Field(
        None,
        ge=1,
        le=120,
        description="Thời lượng đặt chỗ tính bằng phút (1 - 120 phút)",
    )
    simulate_condition: Optional[str] = Field(
        None,
        description="Điều kiện mô phỏng kiểm thử (ACCEPTED, OCCUPIED, REJECTED, UNAVAILABLE, TIMEOUT, OFFLINE)",
    )


class SuggestedConnectorResponse(BaseModel):
    """Thông tin đầu nối sạc thay thế khả dụng trong cùng trạm (S-49)."""

    id: int = Field(..., description="ID đầu nối trong CSDL")
    charge_point_id: int = Field(..., description="ID trụ sạc")
    charge_point_code: str = Field(..., description="Mã nhận diện trụ sạc")
    connector_id: Optional[int] = Field(None, description="Số thứ tự cổng sạc OCPP")
    connector_number: Optional[int] = Field(None, description="Số thứ tự cổng sạc")
    connector_type: Optional[str] = Field(None, description="Loại chuẩn sạc (CCS2, Type 2, CHAdeMO)")
    type: Optional[str] = Field(None, description="Loại chuẩn sạc")
    rated_power_kw: Optional[float] = Field(None, description="Công suất định mức (kW)")
    status: str = Field("AVAILABLE", description="Trạng thái đầu nối")

    model_config = ConfigDict(from_attributes=True)


class ReservationResponse(BaseModel):
    """Thông tin chi tiết một lượt đặt chỗ trước."""

    id: int
    user_id: int
    charge_point_id: int
    charge_point_code: Optional[str] = None
    connector_id: int
    connector_number: Optional[int] = None
    id_tag: str
    start_time: datetime
    expiry_date: datetime
    status: str
    failure_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    # Thông tin mở rộng đồng bộ với giao diện Tài xế (S-50 / SCRUM-378)
    reservation_code: Optional[str] = None
    station_id: Optional[int] = None
    station_name: Optional[str] = None
    station_address: Optional[str] = None
    station_latitude: Optional[float] = None
    station_longitude: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    charger_id: Optional[int] = None
    charger_code: Optional[str] = None
    connector_type: Optional[str] = None
    max_power_kw: Optional[float] = None
    valid_until: Optional[datetime] = None
    no_show_fee: Optional[float] = 0.0
    wallet_transaction_id: Optional[str] = None
    reason: Optional[str] = None
    session_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class ReservationConflictResponse(BaseModel):
    """Phản hồi lỗi 409 Conflict khi bị tranh chấp đặt chỗ kèm gợi ý trụ thay thế (S-49)."""

    detail: str
    suggested_connectors: list[SuggestedConnectorResponse] = []
