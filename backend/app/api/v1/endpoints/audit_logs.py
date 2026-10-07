from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import String, and_, cast, or_, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


@router.get("", summary="Tra nhật ký điều khiển hệ thống")
def list_audit_logs(
    charge_point_id: int | None = Query(None, description="Lọc theo ID trụ sạc"),
    user_id: int | None = Query(None, description="Lọc theo người thực hiện"),
    from_time: datetime | None = Query(None),
    to_time: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=50),
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """S-27/T-58: lọc nhật ký theo trạm, người thực hiện, thời gian và phân trang."""
    query = db.query(AuditLog)

    if current_user.role == "OPERATOR":
        owned_points = (
            select(ChargingPoint.id)
            .join(Station, Station.id == ChargingPoint.station_id)
            .where(Station.operator_id == current_user.id)
        )
        owned_point_ids = select(cast(ChargingPoint.id, String)).where(
            ChargingPoint.id.in_(owned_points)
        )
        owned_point_codes = select(ChargingPoint.code).where(
            ChargingPoint.id.in_(owned_points)
        )
        owned_session_ids = (
            select(cast(ChargingSession.id, String))
            .join(Connector, Connector.id == ChargingSession.connector_id)
            .where(Connector.charging_point_id.in_(owned_points))
        )
        owned_connector_ids = select(cast(Connector.id, String)).where(
            Connector.charging_point_id.in_(owned_points)
        )
        query = query.filter(
            or_(
                and_(
                    AuditLog.object_type == "charging_point",
                    or_(
                        AuditLog.object_id.in_(owned_point_ids),
                        AuditLog.object_id.in_(owned_point_codes),
                    ),
                ),
                and_(
                    AuditLog.object_type == "charging_session",
                    AuditLog.object_id.in_(owned_session_ids),
                ),
                and_(
                    AuditLog.object_type == "connector",
                    AuditLog.object_id.in_(owned_connector_ids),
                ),
            )
        )

    if charge_point_id is not None:
        point_code = select(ChargingPoint.code).where(
            ChargingPoint.id == charge_point_id
        )
        session_ids = (
            select(cast(ChargingSession.id, String))
            .join(Connector, Connector.id == ChargingSession.connector_id)
            .where(Connector.charging_point_id == charge_point_id)
        )
        connector_ids = select(cast(Connector.id, String)).where(
            Connector.charging_point_id == charge_point_id
        )
        query = query.filter(
            or_(
                and_(
                    AuditLog.object_type == "charging_point",
                    or_(
                        AuditLog.object_id == str(charge_point_id),
                        AuditLog.object_id.in_(point_code),
                    ),
                ),
                and_(
                    AuditLog.object_type == "charging_session",
                    AuditLog.object_id.in_(session_ids),
                ),
                and_(
                    AuditLog.object_type == "connector",
                    AuditLog.object_id.in_(connector_ids),
                ),
            )
        )

    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)
    if from_time is not None:
        query = query.filter(AuditLog.created_at >= from_time)
    if to_time is not None:
        query = query.filter(AuditLog.created_at <= to_time)

    total = query.count()
    rows = (
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return {"items": rows, "page": page, "limit": limit, "total": total}
