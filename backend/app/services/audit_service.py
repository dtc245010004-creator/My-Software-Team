"""Hàm ghi audit dùng chung. Audit log chỉ được tạo thêm/đọc."""
from typing import Any

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def ghi_nhat_ky(
    db: Session,
    *,
    user_id: int | None,
    action: str,
    object_type: str,
    object_id: int | str | None,
    data: dict[str, Any] | None = None,
) -> AuditLog:
    row = AuditLog(
        user_id=user_id,
        action=action,
        object_type=object_type,
        object_id=None if object_id is None else str(object_id),
        data=data or {},
    )
    db.add(row)
    db.flush()
    return row
