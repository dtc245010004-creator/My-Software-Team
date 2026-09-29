from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


# ==========================================
# 1. CỔNG SẠC (CONNECTOR SCHEMAS)
# ==========================================
class ConnectorBase(BaseModel):
    connector_number: int = Field(..., ge=1, description="Thứ tự cổng súng sạc (1, 2...)")
    connector_type: str = Field(..., description="Chuẩn sạc: CCS2, TYPE_2, CHADEMO")
    max_power_kw: float = Field(..., gt=0, description="Công suất tối đa của cổng sạc (kW)")

    @field_validator("connector_type")
    @classmethod
    def validate_connector_type(cls, v: str) -> str:
        v_upper = v.upper()
        if v_upper not in ["CCS2", "TYPE_2", "CHADEMO"]:
            raise ValueError("Chuẩn sạc không hợp lệ. Chỉ chấp nhận: CCS2, TYPE_2, CHADEMO.")
        return v_upper


class ConnectorCreate(ConnectorBase):
    pass


from app.core.datetime_utils import UTCDateTime


class ConnectorResponse(ConnectorBase):
    id: int
    charging_point_id: int
    status: str
    is_active: bool
    created_at: UTCDateTime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# 2. TRỤ SẠC (CHARGING POINT SCHEMAS)
# ==========================================
class ChargingPointBase(BaseModel):
    code: str = Field(..., min_length=3, max_length=50, description="Mã định danh trụ sạc EVSE ID")
    vendor: str = Field(default="ABB", max_length=100, description="Hãng sản xuất")
    model: Optional[str] = Field(default=None, max_length=100, description="Model trụ sạc")
    max_power_kw: float = Field(..., gt=0, description="Công suất tối đa của trụ sạc (kW)")
    firmware_version: Optional[str] = Field(default="1.0.0", max_length=50)
    power_sharing_enabled: bool = Field(default=True, description="Bật tính năng chia tải động giữa các súng")


class ChargingPointCreate(ChargingPointBase):
    connectors: Optional[List[ConnectorCreate]] = Field(default_factory=list, description="Danh sách súng sạc ban đầu")


class ChargingPointUpdate(BaseModel):
    vendor: Optional[str] = None
    model: Optional[str] = None
    max_power_kw: Optional[float] = Field(default=None, gt=0)
    firmware_version: Optional[str] = None
    power_sharing_enabled: Optional[bool] = None
    status: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_charger_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v_upper = v.upper()
            if v_upper not in ["AVAILABLE", "PREPARING", "CHARGING", "FAULTED", "UNAVAILABLE"]:
                raise ValueError("Trạng thái trụ sạc không hợp lệ.")
            return v_upper
        return v


class ChargingPointStatusUpdate(BaseModel):
    status: str = Field(..., description="Trạng thái vận hành mới của trụ")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        v_upper = v.upper()
        if v_upper not in ["AVAILABLE", "PREPARING", "CHARGING", "FAULTED", "UNAVAILABLE"]:
            raise ValueError("Trạng thái không hợp lệ: AVAILABLE, PREPARING, CHARGING, FAULTED, UNAVAILABLE.")
        return v_upper


class ChargingPointResponse(ChargingPointBase):
    id: int
    station_id: int
    status: str
    is_active: bool
    created_at: UTCDateTime
    connectors: List[ConnectorResponse] = Field(default_factory=list)

    # Chỉ số tính toán tại tầng Charger (Charger vs Connectors)
    total_connector_power_kw: float = 0.0
    is_power_sharing: bool = False

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# 3. TRẠM SẠC (STATION SCHEMAS)
# ==========================================
class StationBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=150, description="Tên trạm sạc")
    address: str = Field(..., min_length=5, max_length=255, description="Địa chỉ vật lý chi tiết")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Vĩ độ GPS")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Kinh độ GPS")
    total_grid_capacity_kw: float = Field(..., gt=0, description="Công suất nguồn trạm (kW)")
    operating_hours: str = Field(default="24/7", max_length=50)
    status: str = Field(default="ACTIVE", description="Trạng thái vận hành: ACTIVE hoặc MAINTENANCE")

    @field_validator("status")
    @classmethod
    def validate_station_status(cls, v: str) -> str:
        v_upper = v.upper()
        if v_upper not in ["ACTIVE", "MAINTENANCE"]:
            raise ValueError("Trạng thái trạm chỉ có thể là ACTIVE hoặc MAINTENANCE.")
        return v_upper


class StationCreate(StationBase):
    pass


class StationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    address: Optional[str] = Field(default=None, min_length=5, max_length=255)
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    total_grid_capacity_kw: Optional[float] = Field(default=None, gt=0)
    operating_hours: Optional[str] = None
    status: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v_upper = v.upper()
            if v_upper not in ["ACTIVE", "MAINTENANCE"]:
                raise ValueError("Trạng thái trạm chỉ có thể là ACTIVE hoặc MAINTENANCE.")
            return v_upper
        return v


class StationResponse(StationBase):
    id: int
    operator_id: int
    is_active: bool
    created_at: UTCDateTime
    updated_at: UTCDateTime
    charging_points: List[ChargingPointResponse] = Field(default_factory=list)

    # Chỉ số tính toán tại tầng Station (Station vs Chargers - Oversubscription)
    total_installed_power_kw: float = 0.0
    oversubscription_ratio: float = 0.0
    is_oversubscribed: bool = False

    model_config = ConfigDict(from_attributes=True)


class StationDistanceResponse(StationResponse):
    """Schema mở rộng cho API tìm kiếm trả về khoảng cách tính bằng km."""
    distance_km: Optional[float] = None
