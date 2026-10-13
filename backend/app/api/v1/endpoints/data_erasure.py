"""API tài xế gửi yêu cầu và quản trị viên xử lý ẩn danh hóa dữ liệu."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.user import User
from app.schemas.data_erasure import (
    DataErasureRejectRequest,
    DataErasureRequestResponse,
)
from app.services.data_erasure_service import (
    approve_data_erasure_request,
    create_data_erasure_request,
    list_data_erasure_requests,
    list_own_data_erasure_requests,
    reject_data_erasure_request,
)

router = APIRouter(tags=["Ẩn danh hóa dữ liệu tài xế"])


@router.post(
    "/me/data-erasure-requests",
    response_model=DataErasureRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo yêu cầu ẩn danh hóa dữ liệu của chính tài xế",
)
def request_data_erasure(
    current_user: User = Depends(require_roles(["CUSTOMER"])),
    db: Session = Depends(get_db),
):
    return create_data_erasure_request(db, current_user.id)


@router.get(
    "/me/data-erasure-requests",
    response_model=list[DataErasureRequestResponse],
    summary="Xem trạng thái các yêu cầu ẩn danh hóa của chính tài xế",
)
def get_my_data_erasure_requests(
    current_user: User = Depends(require_roles(["CUSTOMER"])),
    db: Session = Depends(get_db),
):
    return list_own_data_erasure_requests(db, current_user.id)


@router.get(
    "/admin/data-erasure-requests",
    response_model=list[DataErasureRequestResponse],
    summary="Admin xem yêu cầu ẩn danh hóa",
)
def get_data_erasure_requests(
    request_status: str | None = Query(default=None, alias="status"),
    current_admin: User = Depends(require_roles(["ADMIN"])),
    db: Session = Depends(get_db),
):
    del current_admin
    if request_status and request_status.upper() not in {
        "PENDING",
        "APPROVED",
        "REJECTED",
        "COMPLETED",
    }:
        raise HTTPException(status_code=422, detail="Trạng thái yêu cầu không hợp lệ.")
    return list_data_erasure_requests(db, request_status)


@router.post(
    "/admin/data-erasure-requests/{request_id}/approve",
    response_model=DataErasureRequestResponse,
    summary="Admin duyệt và ẩn danh hóa dữ liệu",
)
def approve_request(
    request_id: int,
    current_admin: User = Depends(require_roles(["ADMIN"])),
    db: Session = Depends(get_db),
):
    return approve_data_erasure_request(db, request_id, current_admin.id)


@router.post(
    "/admin/data-erasure-requests/{request_id}/reject",
    response_model=DataErasureRequestResponse,
    summary="Admin từ chối yêu cầu với lý do bắt buộc",
)
def reject_request(
    request_id: int,
    payload: DataErasureRejectRequest,
    current_admin: User = Depends(require_roles(["ADMIN"])),
    db: Session = Depends(get_db),
):
    return reject_data_erasure_request(
        db, request_id, current_admin.id, payload.reason
    )
