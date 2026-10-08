from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector
from app.models.user import User

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


@router.get("", summary="Tra nhật ký điều khiển hệ thống")
def list_audit_logs(
    charge_point_id: int | None = Query(None, description="Lọc theo mã trụ sạc"),
    charger_id: int | None = Query(None, description="Lọc theo mã trụ sạc (tương thích frontend)"),
    user_id: int | None = Query(None, description="Lọc theo người thực hiện"),
    from_time: datetime | None = Query(None),
    to_time: datetime | None = Query(None),
    from_param: str | None = Query(None, alias="from"),
    to_param: str | None = Query(None, alias="to"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=50),
    page_size: int | None = Query(None, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """S-27/T-58 backend query: hỗ trợ tất cả vai trò, ba bộ lọc + phân trang tối đa 50 dòng."""
    eff_limit = page_size if page_size is not None else limit
    target_charger_id = charge_point_id if charge_point_id is not None else charger_id

    # Parse mốc thời gian từ tham số alias nếu có
    eff_from = from_time
    if eff_from is None and from_param:
        try:
            eff_from = datetime.fromisoformat(from_param.replace("Z", "+00:00"))
        except ValueError:
            pass

    eff_to = to_time
    if eff_to is None and to_param:
        try:
            eff_to = datetime.fromisoformat(to_param.replace("Z", "+00:00"))
        except ValueError:
            pass

    q = db.query(AuditLog)

    # Phân vùng dữ liệu: CUSTOMER chỉ xem log của chính mình hoặc log chung
    if current_user.role == "CUSTOMER":
        q = q.filter(or_(AuditLog.user_id == current_user.id, AuditLog.user_id.is_(None)))

    if target_charger_id is not None:
        session_object_ids = (
            db.query(ChargingSession.id)
            .join(Connector, Connector.id == ChargingSession.connector_id)
            .filter(Connector.charging_point_id == target_charger_id)
        )
        q = q.filter(
            or_(
                (AuditLog.object_type.in_(["charging_point", "charger"]))
                & (AuditLog.object_id == str(target_charger_id)),
                (AuditLog.object_type == "charging_session")
                & AuditLog.object_id.in_(session_object_ids),
            )
        )

    if user_id is not None:
        q = q.filter(AuditLog.user_id == user_id)
    if eff_from is not None:
        q = q.filter(AuditLog.created_at >= eff_from)
    if eff_to is not None:
        q = q.filter(AuditLog.created_at <= eff_to)

    total = q.count()
    rows = (
        q.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * eff_limit)
        .limit(eff_limit)
        .all()
    )

    enriched = []
    for item in rows:
        actor = db.query(User).filter(User.id == item.user_id).first() if item.user_id else None
        
        object_code = None
        station_name = None
        if item.object_type in ("charging_point", "charger") and item.object_id:
            try:
                cp = db.query(ChargingPoint).filter(ChargingPoint.id == int(item.object_id)).first()
                if cp:
                    object_code = cp.code
                    if cp.station:
                        station_name = cp.station.name
            except (ValueError, TypeError):
                pass
        elif item.object_type == "charging_session" and item.object_id:
            try:
                sess = db.query(ChargingSession).filter(ChargingSession.id == int(item.object_id)).first()
                if sess and sess.connector and sess.connector.charging_point:
                    object_code = sess.connector.charging_point.code
                    if sess.connector.charging_point.station:
                        station_name = sess.connector.charging_point.station.name
            except (ValueError, TypeError):
                pass

        data_val = item.data if isinstance(item.data, dict) else {}
        result_status = data_val.get("result", "SUCCESS") if isinstance(data_val, dict) else "SUCCESS"

        enriched.append({
            "id": item.id,
            "timestamp": item.created_at.isoformat() if item.created_at else None,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "action": item.action,
            "result": result_status,
            "object_type": item.object_type,
            "object_id": item.object_id,
            "objectCode": object_code or (f"CP-{item.object_id}" if item.object_type in ("charging_point", "charger") else (str(item.object_id) if item.object_id else "—")),
            "stationName": station_name or "Trạm sạc trung tâm",
            "actor_id": item.user_id,
            "actorName": actor.full_name if actor else ("Hệ thống" if not item.user_id else f"User #{item.user_id}"),
            "actorUsername": actor.username if actor else "system",
            "description": data_val.get("description", item.action) if isinstance(data_val, dict) else item.action,
            "detail": str(item.data) if item.data else None,
            "data": item.data,
        })

    return {
        "items": enriched,
        "page": page,
        "limit": eff_limit,
        "page_size": eff_limit,
        "total": total,
    }
