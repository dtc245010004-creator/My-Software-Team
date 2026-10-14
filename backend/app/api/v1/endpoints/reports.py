"""Endpoints cho Báo cáo thống kê, Doanh thu & Đối soát kế toán (S-52, S-53 / Epic E-07)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.report import (
    ReconciliationReportResponse,
    StationRevenueReportResponse,
)
from app.services.report_service import get_station_revenue_report

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get(
    "/stations/{station_id}/revenue",
    response_model=StationRevenueReportResponse,
    summary="Báo cáo doanh thu & sản lượng theo kỳ, theo trụ (S-52)",
)
def station_revenue_report_endpoint(
    station_id: int,
    period_type: str = Query(
        "month",
        description="Loại kỳ: day (ngày), week (tuần), month (tháng), custom (tùy chọn)",
    ),
    start_date: str | None = Query(
        None,
        description="Ngày bắt đầu (YYYY-MM-DD) nếu period_type='custom'",
    ),
    end_date: str | None = Query(
        None,
        description="Ngày kết thúc (YYYY-MM-DD) nếu period_type='custom'",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StationRevenueReportResponse:
    """
    API lấy báo cáo doanh thu & sản lượng điện theo từng trụ thuộc trạm sạc:
    - SCRUM-390: Một truy vấn gộp GROUP BY đọc từ hóa đơn phiên đã chốt.
    - SCRUM-391: Phân quyền cấp truy vấn (Chủ trạm chỉ xem được trạm mình sở hữu, Admin xem tất cả).
    """
    return get_station_revenue_report(
        db=db,
        station_id=station_id,
        current_user=current_user,
        period_type=period_type,
        start_date=start_date,
        end_date=end_date,
    )


@router.get(
    "/reconciliation",
    response_model=ReconciliationReportResponse,
    summary="Báo cáo đối soát kWh đã cấp với tiền đã thu (S-53)",
)
def reconciliation_report_endpoint(
    period_type: str = Query(
        "month",
        description="Loại kỳ: day (ngày), week (tuần), month (tháng), custom (tùy chọn)",
    ),
    start_date: str | None = Query(
        None,
        description="Ngày bắt đầu (YYYY-MM-DD) nếu period_type='custom'",
    ),
    end_date: str | None = Query(
        None,
        description="Ngày kết thúc (YYYY-MM-DD) nếu period_type='custom'",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ReconciliationReportResponse:
    """
    API Báo cáo đối soát tài chính dành cho Kế toán (ACCOUNTANT) và Quản trị viên (ADMIN) (S-53):
    - SCRUM-394: Phát hiện phiên có kWh không hóa đơn, hoặc có hóa đơn không dòng sổ cái.
    - SCRUM-395: Tính lại tiền từ biểu giá phiên bản đã áp dụng cho phiên và so sánh với hóa đơn.
    - SCRUM-396: Phân quyền RBAC nghiêm ngặt (chỉ ACCOUNTANT và ADMIN).
    """
    from app.services.report_service import get_reconciliation_report

    return get_reconciliation_report(
        db=db,
        current_user=current_user,
        period_type=period_type,
        start_date=start_date,
        end_date=end_date,
    )

