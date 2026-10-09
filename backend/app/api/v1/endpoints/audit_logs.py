from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.models.charge_point import ChargePoint
from app.models.session import ChargingSession
from app.models.station import Connector, Station
from app.models.user import User
from app.schemas.audit_log import AuditLogItem, AuditLogListResponse

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


@router.get("", response_model=AuditLogListResponse, summary="Tra nhật ký điều khiển hệ thống")
def list_audit_logs(
    charge_point_id: int | None = Query(None, description="Lọc theo ID trụ sạc"),
    charger_id: int | None = Query(None, description="Alias charge_point_id cho frontend"),
    user_id: int | None = Query(None, description="Lọc theo người thực hiện"),
    from_time: datetime | None = Query(None, alias="from_time"),
    to_time: datetime | None = Query(None, alias="to_time"),
    from_: datetime | None = Query(None, alias="from", description="Alias từ frontend"),
    to_: datetime | None = Query(None, alias="to", description="Alias từ frontend"),
    page: int = Query(1, ge=1),
    page_size: int | None = Query(None, description="Alias limit cho frontend"),
    limit: int = Query(50, ge=1, le=50),
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """S-27/T-58 backend query: ba bộ lọc + phân trang tối đa 50 dòng.

    Chấp nhận cả alias từ frontend: charger_id (= charge_point_id),
    page_size (= limit), from/to (= from_time/to_time).
    """
    # Hợp nhất alias
    effective_cp_id = charge_point_id if charge_point_id is not None else charger_id
    effective_from = from_time if from_time is not None else from_
    effective_to = to_time if to_time is not None else to_
    effective_limit = page_size if page_size is not None else limit

    # Subquery: tìm tất cả session IDs thuộc một charge_point cụ thể
    if effective_cp_id is not None:
        session_ids = (
            db.query(ChargingSession.id)
            .join(Connector, Connector.id == ChargingSession.connector_id)
            .filter(Connector.charging_point_id == effective_cp_id)
        )
        q = db.query(AuditLog).filter(
            or_(
                (AuditLog.object_type == "charging_point")
                & (AuditLog.object_id == str(effective_cp_id)),
                (AuditLog.object_type == "charging_session")
                & AuditLog.object_id.in_(session_ids),
                (AuditLog.object_type == "charger")
                & (AuditLog.object_id == str(effective_cp_id)),
            )
        )
    else:
        q = db.query(AuditLog)

    # Lọc theo người thực hiện
    if user_id is not None:
        q = q.filter(AuditLog.user_id == user_id)

    # Lọc theo khoảng thời gian
    if effective_from is not None:
        q = q.filter(AuditLog.created_at >= effective_from)
    if effective_to is not None:
        q = q.filter(AuditLog.created_at <= effective_to)

    total = q.count()

    # Sắp xếp và phân trang
    rows = (
        q.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * effective_limit)
        .limit(effective_limit)
        .all()
    )

    # Lấy danh sách user_id từ kết quả để join bulk
    user_ids = {r.user_id for r in rows if r.user_id is not None}
    users_map = {}
    if user_ids:
        users = db.query(User.id, User.username, User.full_name).filter(User.id.in_(user_ids)).all()
        users_map = {u.id: u for u in users}

    # Lấy danh sách charge_point_id từ object_id dạng số để join
    cp_codes = {r.object_id for r in rows if r.object_id and r.object_id.isdigit()}
    cp_map = {}
    if cp_codes:
        charge_points = (
            db.query(ChargePoint.id, ChargePoint.code, Station.name)
            .join(Station, Station.id == ChargePoint.station_id)
            .filter(ChargePoint.id.in_(int(c) for c in cp_codes))
            .all()
        )
        cp_map = {str(cp.id): cp for cp in charge_points}

    # Map sang response schema
    items = []
    for r in rows:
        data = r.data or {}
        # Xác định charge_point từ object_id hoặc object_code trong data
        cp_code = data.get("charge_point_code") or r.object_id
        station_name = None
        station_id = None
        object_code = None

        if cp_code and cp_code.isdigit():
            cp_info = cp_map.get(cp_code)
            if cp_info:
                station_name = cp_info.name
                object_code = cp_info.code
                station_id = int(cp_code)
        elif cp_code:
            # Tra bằng code string
            cp = db.query(ChargePoint).filter(ChargePoint.code == cp_code).first()
            if cp:
                station_name = cp.station.name if cp.station else None
                object_code = cp.code
                station_id = cp.id

        user_info = users_map.get(r.user_id)
        items.append(
            AuditLogItem(
                id=r.id,
                timestamp=r.created_at,
                action=r.action,
                object_type=r.object_type,
                object_id=r.object_id,
                object_code=object_code,
                station_id=station_id,
                station_name=station_name,
                user_id=r.user_id,
                actor_name=user_info.full_name if user_info else None,
                actor_username=user_info.username if user_info else None,
                result=data.get("result"),
                description=data.get("description"),
                detail=data,
            )
        )

    return AuditLogListResponse(items=items, page=page, limit=effective_limit, total=total)
