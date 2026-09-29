from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api.deps import get_current_user_or_driver_guest
from app.core.database import get_db
from app.models.session import ChargingSession
from app.models.user import User
from app.schemas.session import (
    SessionResponse,
    SessionStartRequest,
    SessionStopRequest,
)
from app.services.session_service import (
    start_charging_session,
    stop_charging_session,
)

router = APIRouter(prefix="/sessions", tags=["Phiên sạc xe điện (Charging Sessions)"])


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


@router.get(
    "/me",
    response_model=List[SessionResponse],
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiên sạc.")

    if current_user.role != "ADMIN" and session.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem thông tin phiên sạc của người khác.",
        )

    return session
