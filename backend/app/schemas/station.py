from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.datetime_utils import UTCDateTime


# ==========================================
# 1. Cá»”NG Sáº C (CONNECTOR SCHEMAS)
# ==========================================
class ConnectorBase(BaseModel):
    connector_number: int = Field(
        ..., ge=1, description="Thá»© tá»± cá»•ng sÃºng sáº¡c (1, 2...)"
    )
    connector_type: str = Field(..., description="Chuáº©n sáº¡c: CCS2, TYPE_2, CHADEMO")
    max_power_kw: float = Field(
        ..., gt=0, description="CÃ´ng suáº¥t tá»‘i Ä‘a cá»§a cá»•ng sáº¡c (kW)"
    )

    @field_validator("connector_type")
    @classmethod
    def validate_connector_type(cls, v: str) -> str:
        v_upper = v.upper()
        if v_upper not in ["CCS2", "TYPE_2", "CHADEMO"]:
            raise ValueError(
                "Chuáº©n sáº¡c khÃ´ng há»£p lá»‡. Chá»‰ cháº¥p nháº­n: CCS2, TYPE_2, CHADEMO."
            )
        return v_upper


class ConnectorCreate(ConnectorBase):
    pass


class ConnectorResponse(ConnectorBase):
    id: int
    charging_point_id: int
    status: str
    is_active: bool
    created_at: UTCDateTime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# 2. TRá»¤ Sáº C (CHARGING POINT SCHEMAS)
# ==========================================
class ChargingPointBase(BaseModel):
    code: str = Field(
        ..., min_length=3, max_length=50, description="MÃ£ Ä‘á»‹nh danh trá»¥ sáº¡c EVSE ID"
    )
    vendor: str = Field(default="ABB", max_length=100, description="HÃ£ng sáº£n xuáº¥t")
    model: Optional[str] = Field(
        default=None, max_length=100, description="Model trá»¥ sáº¡c"
    )
    max_power_kw: float = Field(
        ..., gt=0, description="CÃ´ng suáº¥t tá»‘i Ä‘a cá»§a trá»¥ sáº¡c (kW)"
    )
    firmware_version: Optional[str] = Field(default="1.0.0", max_length=50)
    power_sharing_enabled: bool = Field(
        default=True, description="Báº­t tÃ­nh nÄƒng chia táº£i Ä‘á»™ng giá»¯a cÃ¡c sÃºng"
    )


class ChargingPointCreate(ChargingPointBase):
    connectors: Optional[List[ConnectorCreate]] = Field(
        default_factory=list, description="Danh sÃ¡ch sÃºng sáº¡c ban Ä‘áº§u"
    )


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
            if v_upper not in [
                "AVAILABLE",
                "PREPARING",
                "CHARGING",
                "FAULTED",
                "UNAVAILABLE",
            ]:
                raise ValueError("Tráº¡ng thÃ¡i trá»¥ sáº¡c khÃ´ng há»£p lá»‡.")
            return v_upper
        return v


class ChargingPointStatusUpdate(BaseModel):
    status: str = Field(..., description="Tráº¡ng thÃ¡i váº­n hÃ nh má»›i cá»§a trá»¥")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        v_upper = v.upper()
        if v_upper not in [
            "AVAILABLE",
            "PREPARING",
            "CHARGING",
            "FAULTED",
            "UNAVAILABLE",
        ]:
            raise ValueError(
                "Tráº¡ng thÃ¡i khÃ´ng há»£p lá»‡: AVAILABLE, PREPARING, CHARGING, FAULTED, UNAVAILABLE."
            )
        return v_upper


class ChargingPointResponse(ChargingPointBase):
    id: int
    station_id: int
    status: str
    is_active: bool
    created_at: UTCDateTime
    connectors: List[ConnectorResponse] = Field(default_factory=list)

    # Chá»‰ sá»‘ tÃ­nh toÃ¡n táº¡i táº§ng Charger (Charger vs Connectors)
    total_connector_power_kw: float = 0.0
    is_power_sharing: bool = False

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# 3. TRáº M Sáº C (STATION SCHEMAS)
# ==========================================
class StationBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=150, description="TÃªn tráº¡m sáº¡c")
    address: str = Field(
        ..., min_length=5, max_length=255, description="Äá»‹a chá»‰ váº­t lÃ½ chi tiáº¿t"
    )
    latitude: Optional[float] = Field(
        default=None, ge=-90.0, le=90.0, description="VÄ© Ä‘á»™ GPS"
    )
    longitude: Optional[float] = Field(
        default=None, ge=-180.0, le=180.0, description="Kinh Ä‘á»™ GPS"
    )
    total_grid_capacity_kw: float = Field(default=100.0, gt=0, description="Tong cong suat luoi dinh muc kW")
    operating_hours: Optional[str] = Field(default="24/7", max_length=50)
    status: str = Field(
        default="ACTIVE", description="Tráº¡ng thÃ¡i váº­n hÃ nh: ACTIVE hoáº·c MAINTENANCE"
    )

    @field_validator("status")
    @classmethod
    def validate_station_status(cls, v: str) -> str:
        v_upper = v.upper()
        if v_upper not in ["ACTIVE", "MAINTENANCE"]:
            raise ValueError("Tráº¡ng thÃ¡i tráº¡m chá»‰ cÃ³ thá»ƒ lÃ  ACTIVE hoáº·c MAINTENANCE.")
        return v_upper


class StationCreate(StationBase):
    operator_id: Optional[int] = Field(
        default=None, description="ID Chá»§ tráº¡m sáº¡c (chá»‰ Admin Ä‘Æ°á»£c gÃ¡n)"
    )


class StationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    address: Optional[str] = Field(default=None, min_length=5, max_length=255)
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    total_grid_capacity_kw: float = Field(default=100.0, gt=0, description="Tong cong suat luoi dinh muc kW")
    operating_hours: Optional[str] = None
    status: Optional[str] = None
    operator_id: Optional[int] = Field(
        default=None, description="ID Chá»§ tráº¡m sáº¡c (chá»‰ Admin Ä‘Æ°á»£c gÃ¡n/Ä‘á»•i)"
    )

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v_upper = v.upper()
            if v_upper not in ["ACTIVE", "MAINTENANCE"]:
                raise ValueError(
                    "Tráº¡ng thÃ¡i tráº¡m chá»‰ cÃ³ thá»ƒ lÃ  ACTIVE hoáº·c MAINTENANCE."
                )
            return v_upper
        return v


class StationResponse(StationBase):
    id: int
    operator_id: Optional[int] = None
    owner_id: Optional[int] = None
    is_active: bool
    created_at: UTCDateTime
    updated_at: UTCDateTime
    charging_points: List[ChargingPointResponse] = Field(default_factory=list)

    # Chá»‰ sá»‘ tÃ­nh toÃ¡n táº¡i táº§ng Station (Station vs Chargers - Oversubscription)
    total_installed_power_kw: float = 0.0
    oversubscription_ratio: float = 0.0
    is_oversubscribed: bool = False

    model_config = ConfigDict(from_attributes=True)


class StationDistanceResponse(StationResponse):
    """Schema má»Ÿ rá»™ng cho API tÃ¬m kiáº¿m tráº£ vá» khoáº£ng cÃ¡ch tÃ­nh báº±ng km."""

    distance_km: Optional[float] = None



