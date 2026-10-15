"""Endpoints quản lý Đặt chỗ trước đầu nối sạc (User Story S-48, S-49 / Epic E-07)."""

import logging
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_or_driver_guest
from app.core.database import get_db
from app.models.user import User
from app.schemas.reservation import (
    ReservationConflictResponse,
    ReservationCreateRequest,
    ReservationResponse,
)
from app.services.reservation_service import (
    cancel_reservation,
    create_reservation,
    get_all_reservations,
    get_my_reservations,
    get_reservation_by_id,
)

logger = logging.getLogger("ev_csms.reservations_api")

router = APIRouter(prefix="/reservations", tags=["Đặt chỗ trước trụ sạc (Reservations)"])


@router.get(
    "",
    response_model=List[ReservationResponse],
    summary="Xem danh sách đặt chỗ theo phân quyền người dùng",
)
def get_reservations_endpoint(
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    """Tra cứu các lượt đặt chỗ (tài xế xem của mình, admin/operator xem theo phạm vi quản lý)."""
    return get_all_reservations(db=db, user=current_user)


@router.post(
    "",
    response_model=ReservationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tài xế đặt chỗ trước một đầu nối sạc (OCPP 1.6 ReserveNow)",
    responses={
        400: {"description": "Dữ liệu không hợp lệ hoặc ví/thẻ RFID không đủ điều kiện"},
        409: {
            "model": ReservationConflictResponse,
            "description": "Đầu nối đang bận/đã được đặt trước, kèm danh sách gợi ý thay thế",
        },
        503: {"description": "Trụ sạc ngoại tuyến hoặc gặp sự cố"},
        504: {"description": "Hết thời gian chờ phản hồi từ trụ sạc"},
    },
)
async def create_reservation_endpoint(
    request: ReservationCreateRequest,
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    """Tài xế đặt trước đầu nối sạc trong khoảng thời gian tối đa 2 giờ (S-48).

    Bảo vệ chống đua tranh bằng khóa hàng bi quan CSDL theo R-03 và gợi ý trụ thay thế nếu xung đột (S-49).
    """
    return await create_reservation(db=db, user=current_user, payload=request)


@router.get(
    "/my",
    response_model=List[ReservationResponse],
    summary="Xem danh sách đặt chỗ của tài xế hiện tại",
)
def get_my_reservations_endpoint(
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    """Tra cứu các lượt đặt chỗ của tài xế (tự động cập nhật các lượt quá hạn)."""
    return get_my_reservations(db=db, user=current_user)


@router.get(
    "/{reservation_id}",
    response_model=ReservationResponse,
    summary="Xem chi tiết một lượt đặt chỗ theo ID",
)
def get_reservation_by_id_endpoint(
    reservation_id: int,
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    """Xem chi tiết một lượt đặt chỗ theo ID."""
    return get_reservation_by_id(
        db=db, reservation_id=reservation_id, user=current_user
    )


@router.post(
    "/{reservation_id}/cancel",
    response_model=ReservationResponse,
    summary="Hủy đặt chỗ trước đầu nối sạc (OCPP 1.6 CancelReservation)",
)
async def cancel_reservation_endpoint(
    reservation_id: int,
    current_user: User = Depends(get_current_user_or_driver_guest),
    db: Session = Depends(get_db),
):
    """Hủy đặt chỗ trước: giải phóng đầu nối sạc về AVAILABLE và gửi CancelReservation tới trụ sạc."""
    return await cancel_reservation(
        db=db, reservation_id=reservation_id, user=current_user
    )

