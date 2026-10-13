"""Schema Pydantic cho quản lý cảnh báo trụ sạc (SCRUM-319)."""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.datetime_utils import UTCDateTime


class ChargerAlertResponse(BaseModel):
    id: int
    charging_point_id: int
    station_id: int
    alert_type: str
    status: str
    severity: str
    message: str
    detail_info: Optional[str] = None
    opened_at: UTCDateTime
    resolved_at: Optional[UTCDateTime] = None
    resolved_reason: Optional[str] = None
    resolved_by_user_id: Optional[int] = None
    email_sent_at: Optional[UTCDateTime] = None

    model_config = ConfigDict(from_attributes=True)


class ResolveAlertRequest(BaseModel):
    resolved_reason: str = Field(
        default="Đã xử lý sự cố",
        min_length=1,
        max_length=255,
        description="Lý do đóng cảnh báo",
    )
