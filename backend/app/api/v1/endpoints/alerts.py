"""API quản lý và đóng cảnh báo trụ sạc (SCRUM-319)."""

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.station import ChargerAlert, Station
from app.models.user import User
from app.schemas.alert import ChargerAlertResponse, ResolveAlertRequest

router = APIRouter(prefix="/alerts", tags=["Cảnh báo Trụ sạc (Alerts)"])


@router.get(
    "",
    response_model=List[ChargerAlertResponse],
    summary="Xem danh sách cảnh báo trụ sạc (SCRUM-319)",
)
def list_alerts(
    station_id: Optional[int] = Query(None, description="Lọc theo trạm sạc"),
    charging_point_id: Optional[int] = Query(None, description="Lọc theo trụ sạc"),
    alert_type: Optional[str] = Query(None, description="Lọc theo loại: OFFLINE, ERROR_BURST"),
    alert_status: Optional[str] = Query(None, alias="status", description="Lọc theo trạng thái: OPEN, RESOLVED"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """Lấy danh sách cảnh báo (Admin xem toàn bộ; Operator chỉ xem trạm thuộc sở hữu)."""
    query = db.query(ChargerAlert)

    if current_user.role == "OPERATOR":
        # Chỉ lọc các cảnh báo thuộc trạm do Operator sở hữu
        query = query.join(Station, ChargerAlert.station_id == Station.id).filter(
            Station.operator_id == current_user.id
        )

    if station_id is not None:
        query = query.filter(ChargerAlert.station_id == station_id)
    if charging_point_id is not None:
        query = query.filter(ChargerAlert.charging_point_id == charging_point_id)
    if alert_type is not None:
        query = query.filter(ChargerAlert.alert_type == alert_type)
    if alert_status is not None:
        query = query.filter(ChargerAlert.status == alert_status)

    return query.order_by(ChargerAlert.opened_at.desc()).offset(skip).limit(limit).all()


@router.post(
    "/{alert_id}/resolve",
    response_model=ChargerAlertResponse,
    summary="Đóng cảnh báo trụ sạc thủ công (SCRUM-319)",
)
def resolve_alert(
    alert_id: int,
    body: ResolveAlertRequest,
    current_user: User = Depends(require_roles(["ADMIN", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """Đóng cảnh báo mở kèm lý do giải quyết (Admin hoặc Chủ trạm sở hữu)."""
    alert = db.query(ChargerAlert).filter(ChargerAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy cảnh báo."
        )

    if current_user.role == "OPERATOR":
        station = db.query(Station).filter(Station.id == alert.station_id).first()
        if not station or station.operator_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền thao tác trên cảnh báo của trạm này.",
            )

    if alert.status == "RESOLVED":
        return alert

    now_utc = datetime.now(timezone.utc)
    alert.status = "RESOLVED"
    alert.resolved_at = now_utc
    alert.resolved_by_user_id = current_user.id
    alert.resolved_reason = body.resolved_reason

    db.commit()
    db.refresh(alert)
    return alert
