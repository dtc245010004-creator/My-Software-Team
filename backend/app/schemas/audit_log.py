"""Pydantic schemas cho endpoint tra nhật ký Audit Logs.

Trả về camelCase để frontend dùng trực tiếp.
"""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


def _camel(snake: str) -> str:
    """Convert snake_case to camelCase."""
    parts = snake.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


class _CamelModel(BaseModel):
    """Base: alias generation tự động snake -> camel."""
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=_camel,
    )


class AuditLogItem(_CamelModel):
    """Response schema khớp với frontend AuditTable/AuditLogs (camelCase).

    Tên trường Python giữ snake_case để khớp DB.
    """

    id: int
    timestamp: datetime  # created_at trong DB
    action: str
    object_type: str  # → objectType
    object_id: int | str | None  # → objectId
    object_code: str | None  # trích từ data.charge_point_code
    station_id: int | None  # → stationId
    station_name: str | None  # → stationName
    user_id: int | None  # → userId
    actor_name: str | None  # → actorName
    actor_username: str | None  # → actorUsername
    result: str | None  # từ data.result
    description: str | None  # từ data.description
    detail: Any | None  # nguyên data payload


class AuditLogListResponse(_CamelModel):
    """Response wrapper phân trang."""

    items: list[AuditLogItem]
    page: int
    limit: int
    total: int
