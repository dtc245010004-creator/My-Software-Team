from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.models.session import ChargingSession
from app.models.station import Connector
from app.models.user import User

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


@router.get("", summary="Tra nhật ký điều khiển hệ thống")
def list_audit_logs(
    charge_point_id: int | None = Query(None, description="Lọc theo mã trụ sạc"),
    user_id: int | None = Query(None, description="Lọc theo người thực hiện"),
    from_time: datetime | None = Query(None),
    to_time: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=50),
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """S-27/T-58 backend query: ba bộ lọc + phân trang tối đa 50 dòng."""
    q = db.query(AuditLog)

    if charge_point_id is not None:
        session_object_ids = (
            db.query(ChargingSession.id)
            .join(Connector, Connector.id == ChargingSession.connector_id)
            .filter(Connector.charging_point_id == charge_point_id)
        )
        q = q.filter(
            or_(
                (AuditLog.object_type == "charging_point")
                & (AuditLog.object_id == str(charge_point_id)),
                (AuditLog.object_type == "charging_session")
                & AuditLog.object_id.in_(session_object_ids),
            )
        )

    if user_id is not None:
        q = q.filter(AuditLog.user_id == user_id)
    if from_time is not None:
        q = q.filter(AuditLog.created_at >= from_time)
    if to_time is not None:
        q = q.filter(AuditLog.created_at <= to_time)

    total = q.count()
    rows = (
        q.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return {
        "items": rows,
        "page": page,
        "limit": limit,
        "total": total,
    }
