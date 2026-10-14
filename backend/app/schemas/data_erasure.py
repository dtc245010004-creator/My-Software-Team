"""Schema API cho yêu cầu ẩn danh hóa dữ liệu tài xế."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DataErasureRejectRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=2000)

    @field_validator("reason")
    @classmethod
    def reason_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Lý do từ chối không được để trống.")
        return value


class DataErasureRequestResponse(BaseModel):
    id: int
    user_id: int
    status: str
    requested_at: datetime
    reviewed_by_id: int | None = None
    reviewed_at: datetime | None = None
    reject_reason: str | None = None
    completed_at: datetime | None = None
    block_reason: str | None = None

    model_config = ConfigDict(from_attributes=True)
