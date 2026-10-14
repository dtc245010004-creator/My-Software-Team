"""Endpoints quản lý Đối soát, Chia doanh thu & Khóa kỳ đối soát (User Story S-54, S-55 / Epic E-09)."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.database import get_db
from app.models.user import User
from app.schemas.reconciliation import (
    PartnerRevenueShareConfigCreate,
    PartnerRevenueShareConfigResponse,
    PartnerSettlementResponse,
    PeriodLockConflictResponse,
    ReconciliationPeriodCreate,
    ReconciliationPeriodResponse,
    ReopenPeriodRequest,
)
from app.services.reconciliation_service import (
    create_or_update_partner_config,
    create_reconciliation_period,
    get_period_settlements,
    get_reconciliation_period_by_id,
    list_partner_configs,
    list_reconciliation_periods,
    lock_reconciliation_period,
    reopen_reconciliation_period,
)

logger = logging.getLogger("ev_csms.reconciliation_api")

router = APIRouter(prefix="/reconciliation", tags=["Đối soát & Chia doanh thu (Reconciliation & Settlements)"])


# ---------------------------------------------------------------------------
# S-54: Cấu hình tỉ lệ chia doanh thu cho đối tác
# ---------------------------------------------------------------------------


@router.post(
    "/partner-configs",
    response_model=PartnerRevenueShareConfigResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cấu hình tỉ lệ chia doanh thu cho đối tác (ADMIN, ACCOUNTANT)",
)
def configure_partner_revenue_share(
    payload: PartnerRevenueShareConfigCreate,
    current_user: User = Depends(require_roles(["ADMIN", "ACCOUNTANT"])),
    db: Session = Depends(get_db),
):
    """Thiết lập tỉ lệ chia doanh thu hợp đồng cho chủ trạm/đối tác (S-54)."""
    return create_or_update_partner_config(db=db, payload=payload, current_user=current_user)


@router.get(
    "/partner-configs",
    response_model=List[PartnerRevenueShareConfigResponse],
    summary="Lấy danh sách cấu hình tỉ lệ chia doanh thu đối tác",
)
def get_partner_revenue_share_configs(
    partner_id: Optional[int] = Query(None, description="Lọc theo ID đối tác"),
    current_user: User = Depends(require_roles(["ADMIN", "ACCOUNTANT"])),
    db: Session = Depends(get_db),
):
    """Xem danh sách các tỉ lệ chia doanh thu đã cấu hình."""
    return list_partner_configs(db=db, partner_id=partner_id)


# ---------------------------------------------------------------------------
# S-55: Quản lý Kỳ đối soát & Chốt khóa kỳ
# ---------------------------------------------------------------------------


@router.post(
    "/periods",
    response_model=ReconciliationPeriodResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo mới kỳ đối soát tài chính (ADMIN, ACCOUNTANT)",
)
def create_period(
    payload: ReconciliationPeriodCreate,
    current_user: User = Depends(require_roles(["ADMIN", "ACCOUNTANT"])),
    db: Session = Depends(get_db),
):
    """Khởi tạo một kỳ đối soát theo tháng dương lịch hoặc khoảng thời gian tùy chọn (S-55)."""
    return create_reconciliation_period(db=db, payload=payload, current_user=current_user)


@router.get(
    "/periods",
    response_model=List[ReconciliationPeriodResponse],
    summary="Xem danh sách các kỳ đối soát",
)
def get_periods(
    current_user: User = Depends(require_roles(["ADMIN", "ACCOUNTANT", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """Danh sách các kỳ đối soát trong hệ thống."""
    return list_reconciliation_periods(db=db, current_user=current_user)


@router.get(
    "/periods/{period_id}",
    response_model=ReconciliationPeriodResponse,
    summary="Xem chi tiết kỳ đối soát theo ID",
)
def get_period_detail(
    period_id: int,
    current_user: User = Depends(require_roles(["ADMIN", "ACCOUNTANT", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """Xem chi tiết kỳ đối soát kèm danh sách bảng kê phân chia doanh thu."""
    return get_reconciliation_period_by_id(db=db, period_id=period_id, current_user=current_user)


@router.post(
    "/periods/{period_id}/lock",
    response_model=ReconciliationPeriodResponse,
    summary="Chốt và khóa kỳ đối soát (S-55)",
    responses={
        400: {"description": "Kỳ đối soát không hợp lệ hoặc đã khóa"},
        409: {
            "model": PeriodLockConflictResponse,
            "description": "Còn phiên bất thường chưa xử lý hoặc vi phạm đối soát",
        },
    },
)
def lock_period(
    period_id: int,
    current_user: User = Depends(require_roles(["ADMIN", "ACCOUNTANT"])),
    db: Session = Depends(get_db),
):
    """Chốt và khóa kỳ đối soát:

    1. Quét toàn bộ phiên sạc trong kỳ, chặn ngay nếu còn phiên bất thường (AC 2).
    2. Tự động lập bảng kê chia doanh thu cho từng đối tác theo tỉ lệ hợp đồng (S-54).
    3. Đổi trạng thái sang LOCKED, kích hoạt cơ chế khóa chỉ đọc (Read-only) đa tầng (AC 1).
    """
    return lock_reconciliation_period(db=db, period_id=period_id, current_user=current_user)


@router.post(
    "/periods/{period_id}/reopen",
    response_model=ReconciliationPeriodResponse,
    summary="Mở lại kỳ đối soát đã chốt (Chỉ dành cho ADMIN) (S-55 AC 3)",
)
def reopen_period(
    period_id: int,
    request: ReopenPeriodRequest,
    current_user: User = Depends(require_roles(["ADMIN"])),
    db: Session = Depends(get_db),
):
    """Quản trị viên mở lại kỳ đối soát đã chốt kèm lý do bắt buộc và ghi nhật ký kiểm toán (AC 3)."""
    return reopen_reconciliation_period(
        db=db,
        period_id=period_id,
        current_user=current_user,
        reason=request.reason,
    )


@router.get(
    "/periods/{period_id}/settlements",
    response_model=List[PartnerSettlementResponse],
    summary="Xem bảng kê chia doanh thu đối tác của kỳ đối soát (S-54)",
)
def get_settlements_of_period(
    period_id: int,
    current_user: User = Depends(require_roles(["ADMIN", "ACCOUNTANT", "OPERATOR"])),
    db: Session = Depends(get_db),
):
    """Xem bảng kê chi tiết chia doanh thu (Đối tác xem phần của mình, Kế toán/Admin xem toàn bộ)."""
    return get_period_settlements(db=db, period_id=period_id, current_user=current_user)

