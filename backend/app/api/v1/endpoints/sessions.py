from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_or_driver_guest
from app.core.database import get_db
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector
from app.models.user import User
from app.schemas.session import (
    RemoteStopRequest,
    SessionResponse,
    SessionStartRequest,
    SessionStopRequest,
    SessionSummaryItem,
    SessionSummaryResponse,
)
from app.services.session_service import (
    remote_stop_charging_session,
    start_charging_session,
    stop_charging_session,
)
from app.services.station_service import get_accessible_station_ids

router = APIRouter(prefix="/sessions", tags=["Phiên sạc xe điện (Charging Sessions)"])


@router.get(
    "",
    response_model=List[SessionResponse],
    summary="Danh sách các phiên sạc (Phân quyền theo Trạm sạc cho Chủ trạm / Toàn quyền cho Admin)",
)
def list_sessions(
    station_id: Optional[int] = Query(None, description="Lọc theo trạm cụ thể"),
    status_filter: Optional[str] = Query(
        None,
        alias="status",
        description="Lọc theo trạng thái phiên: ACTIVE, COMPLETED, INTERRUPTED",
    ),
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    """
    Tra cứu danh sách phiên sạc theo phân quyền:
    - Quản trị viên (ADMIN): Xem toàn bộ hệ thống, có thể lọc theo station_id.
    - Chủ trạm (OPERATOR): Chỉ xem các phiên thuộc các trạm mình sở hữu. Nếu cố lọc station_id ngoài phạm vi -> 403 Forbidden.
    - Khách / Tài xế (CUSTOMER): Chỉ xem các phiên sạc của chính mình.
    """
    if current_user.role == "ADMIN":
        query = db.query(ChargingSession)
        if station_id:
            query = (
                query.join(ChargingSession.connector)
                .join(Connector.charging_point)
                .filter(ChargingPoint.station_id == station_id)
            )
        if status_filter and status_filter.upper() != "ALL":
            query = query.filter(ChargingSession.status == status_filter.upper())
        return query.order_by(ChargingSession.id.desc()).all()

    if current_user.role == "OPERATOR":
        accessible_ids = get_accessible_station_ids(current_user, db)
        if station_id is not None:
            if station_id not in accessible_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bạn không có quyền xem phiên sạc của trạm sạc này.",
                )
            target_ids = [station_id]
        else:
            target_ids = accessible_ids

        if not target_ids:
            return []

        query = (
            db.query(ChargingSession)
            .join(ChargingSession.connector)
            .join(Connector.charging_point)
            .filter(ChargingPoint.station_id.in_(target_ids))
        )
        if status_filter and status_filter.upper() != "ALL":
            query = query.filter(ChargingSession.status == status_filter.upper())
        return query.order_by(ChargingSession.id.desc()).all()

    # CUSTOMER / GUEST
    query = db.query(ChargingSession).filter(ChargingSession.user_id == current_user.id)
    if status_filter and status_filter.upper() != "ALL":
        query = query.filter(ChargingSession.status == status_filter.upper())
    return query.order_by(ChargingSession.id.desc()).all()


@router.get(
    "/summary",
    response_model=SessionSummaryResponse,
    summary="Tổng quan KPI và gom nhóm phiên sạc (Theo ngày hoặc theo trạm)",
)
def get_sessions_summary(
    group_by: str = Query(
        "date", description="Gom nhóm theo: 'date', 'station', 'month'"
    ),
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    """
    Trả về KPI tổng quan và danh sách gom nhóm:
    - ADMIN: Toàn bộ hệ thống.
    - OPERATOR: Chỉ các trạm thuộc quyền sở hữu.
    - CUSTOMER: Các phiên của chính mình.
    """
    if current_user.role == "ADMIN":
        query = db.query(ChargingSession)
    elif current_user.role == "OPERATOR":
        accessible_ids = get_accessible_station_ids(current_user, db)
        if not accessible_ids:
            return SessionSummaryResponse(
                group_by=group_by,
                kpi={
                    "total_sessions": 0,
                    "total_kwh": 0.0,
                    "total_revenue": 0.0,
                    "completed_sessions": 0,
                },
                items=[],
            )
        query = (
            db.query(ChargingSession)
            .join(ChargingSession.connector)
            .join(Connector.charging_point)
            .filter(ChargingPoint.station_id.in_(accessible_ids))
        )
    else:
        query = db.query(ChargingSession).filter(
            ChargingSession.user_id == current_user.id
        )

    sessions = query.all()

    total_sessions_count = len(sessions)
    total_kwh = sum(float(s.total_kwh or 0) for s in sessions)
    total_amount = sum(float(s.total_amount or 0) for s in sessions)
    completed_sessions_count = sum(1 for s in sessions if s.status == "COMPLETED")

    kpi = {
        "total_sessions": total_sessions_count,
        "total_kwh": round(total_kwh, 2),
        "total_revenue": round(total_amount, 2),
        "completed_sessions": completed_sessions_count,
    }

    groups: dict[str, dict] = {}
    for s in sessions:
        if group_by == "station":
            st_id = s.station_id
            st_name = s.station_name or (
                f"Trạm #{st_id}" if st_id else "Không xác định"
            )
            key = f"station_{st_id}"
            if key not in groups:
                groups[key] = {
                    "group_key": st_name,
                    "station_id": st_id,
                    "station_name": st_name,
                    "date": None,
                    "total_sessions": 0,
                    "total_kwh": 0.0,
                    "total_amount": 0.0,
                    "completed_sessions": 0,
                }
        elif group_by == "month":
            month_str = s.start_time.strftime("%Y-%m") if s.start_time else "Chưa rõ"
            key = month_str
            if key not in groups:
                groups[key] = {
                    "group_key": month_str,
                    "station_id": None,
                    "station_name": None,
                    "date": month_str,
                    "total_sessions": 0,
                    "total_kwh": 0.0,
                    "total_amount": 0.0,
                    "completed_sessions": 0,
                }
        else:
            # group_by == 'date'
            date_str = s.start_time.strftime("%Y-%m-%d") if s.start_time else "Chưa rõ"
            key = date_str
            if key not in groups:
                groups[key] = {
                    "group_key": date_str,
                    "station_id": None,
                    "station_name": None,
                    "date": date_str,
                    "total_sessions": 0,
                    "total_kwh": 0.0,
                    "total_amount": 0.0,
                    "completed_sessions": 0,
                }

        groups[key]["total_sessions"] += 1
        groups[key]["total_kwh"] += float(s.total_kwh or 0)
        groups[key]["total_amount"] += float(s.total_amount or 0)
        if s.status == "COMPLETED":
            groups[key]["completed_sessions"] += 1

    items = []
    for g in groups.values():
        g["total_kwh"] = round(g["total_kwh"], 2)
        g["total_amount"] = round(g["total_amount"], 2)
        items.append(SessionSummaryItem(**g))

    if group_by in ("date", "month"):
        items.sort(key=lambda x: x.group_key, reverse=True)
    else:
        items.sort(key=lambda x: x.total_amount, reverse=True)

    return SessionSummaryResponse(group_by=group_by, kpi=kpi, items=items)


@router.post(
    "/start",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Bắt đầu phiên sạc xe điện (Khóa cổng độc quyền, kiểm tra ví - Tài xế không cần đăng nhập)",
)
def start_session_endpoint(
    start_in: SessionStartRequest,
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    """
    Bắt đầu phiên sạc xe điện:
    - Kiểm tra số dư ví (chặn 402 nếu âm tiền, 400 nếu < 50k).
    - Khóa cổng sạc độc quyền bằng Atomic Conditional Update (chặn 409 nếu bị chiếm).
    - Chốt đơn giá điện TOU 1 lần tại thời điểm cắm sạc.
    """
    return start_charging_session(
        db=db,
        user=current_user,
        connector_id=start_in.connector_id,
        battery_capacity_kwh=start_in.battery_capacity_kwh,
        initial_soc=start_in.initial_soc,
    )


@router.post(
    "/{session_id}/stop",
    response_model=SessionResponse,
    summary="Kết thúc phiên sạc xe điện (Chốt kWh & Trừ tiền ví ACID - Hỗ trợ tài xế không cần đăng nhập)",
)
def stop_session_endpoint(
    session_id: int,
    stop_in: SessionStopRequest,
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    """
    Kết thúc phiên sạc:
    - Kiểm tra quyền sở hữu IDOR: chỉ tài xế thực hiện phiên hoặc Admin mới được dừng.
    - Chống gọi trùng (Idempotency): không trừ tiền 2 lần.
    - Quyết toán trừ tiền ví ACID (cho nợ tới hạn mức NEGATIVE_BALANCE_LIMIT).
    - Mở khóa cổng sạc về AVAILABLE.
    """
    return stop_charging_session(
        db=db,
        user=current_user,
        session_id=session_id,
        meter_stop_kwh=stop_in.meter_stop_kwh,
        stop_reason=stop_in.stop_reason or "USER_STOPPED",
    )


@router.post(
    "/{session_id}/remote-stop",
    response_model=SessionResponse,
    summary="Dừng phiên sạc từ xa bằng RemoteStopTransaction (S-23 / T-49: Vận hành viên & Quản trị)",
)
def remote_stop_session_endpoint(
    session_id: int,
    payload: Optional[RemoteStopRequest] = None,
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    """
    S-23 / T-49: Vận hành viên dừng phiên sạc từ xa bằng RemoteStopTransaction.
    - Ràng buộc kỹ thuật (NFR): Chỉ vai trò Vận hành viên (OPERATOR) và Quản trị viên (ADMIN) mới được gọi.
    - Xử lý 3 ca lỗi của S-23:
      * Trụ ngoại tuyến (Offline) -> 400 CHARGER_OFFLINE
      * Trụ từ chối (Rejected) -> 409 CHARGER_REJECTED
      * Hết thời gian chờ (Timeout) -> 504 CHARGER_TIMEOUT
    - Ca thành công: Chốt số kWh với stop_reason='Remote', chuyển status='COMPLETED' không cần tải lại.
    """
    simulate_cond = payload.simulate_condition if payload else None
    return remote_stop_charging_session(
        db=db,
        user=current_user,
        session_id=session_id,
        simulate_condition=simulate_cond,
    )


@router.get(
    "/me",
    response_model=list[SessionResponse],
    summary="Xem lịch sử các phiên sạc của tôi (Hỗ trợ tài xế không cần đăng nhập)",
)
def get_my_sessions(
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    sessions = (
        db.query(ChargingSession)
        .filter(ChargingSession.user_id == current_user.id)
        .order_by(ChargingSession.id.desc())
        .all()
    )
    return sessions


@router.get(
    "/{session_id}",
    response_model=SessionResponse,
    summary="Xem chi tiết hóa đơn phiên sạc",
)
def get_session_detail(
    session_id: int,
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    session = db.query(ChargingSession).filter(ChargingSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiên sạc."
        )

    if current_user.role == "ADMIN":
        return session

    if current_user.role == "OPERATOR":
        connector = session.connector
        station = (
            connector.charging_point.station
            if connector and connector.charging_point
            else None
        )
        if (
            station and station.operator_id == current_user.id
        ) or session.user_id == current_user.id:
            return session
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem thông tin phiên sạc này.",
        )

    if session.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem thông tin phiên sạc của người khác.",
        )

    return session
