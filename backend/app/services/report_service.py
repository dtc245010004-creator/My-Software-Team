"""Service nghiệp vụ Báo cáo Doanh thu & Sản lượng theo kỳ, theo trụ (S-52 / SCRUM-390, SCRUM-391)."""

import logging
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.datetime_utils import get_vietnam_period_utc_bounds
from app.models.session import ChargingSession
from app.models.station import ChargingPoint, Connector, Station
from app.models.user import User
from app.schemas.report import (
    ChargerRevenueItem,
    DiscrepancyItem,
    ReconciliationReportResponse,
    StationRevenueReportResponse,
)

logger = logging.getLogger("ev_csms.report")


def get_station_revenue_report(
    db: Session,
    station_id: int,
    current_user: User,
    period_type: str = "month",
    start_date: str | None = None,
    end_date: str | None = None,
) -> StationRevenueReportResponse:
    """
    Truy vấn báo cáo doanh thu & sản lượng theo kỳ, phân rã theo từng trụ sạc (S-52).
    - SCRUM-390: Một query gộp GROUP BY đọc từ phiên đã chốt (COMPLETED), không tính lại từ biểu giá.
    - SCRUM-391: Lọc quyền sở hữu ở TẦNG TRUY VẤN (Chủ trạm A không xem được trạm B -> 403).
    - Tính đúng ranh giới múi giờ Việt Nam (UTC+7).
    """
    # 1. Tính toán ranh giới kỳ báo cáo
    try:
        utc_start, utc_end = get_vietnam_period_utc_bounds(
            period_type=period_type,
            start_date=start_date,
            end_date=end_date,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    # 2. Kiểm tra tồn tại & Quyền sở hữu trạm ở tầng truy vấn (SCRUM-391)
    station_query = db.query(Station).filter(Station.id == station_id)
    station = station_query.first()
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy trạm sạc với ID {station_id}.",
        )

    # Nếu người dùng là OPERATOR (Chủ trạm), bắt buộc trạm phải thuộc sở hữu của họ
    if current_user.role == "OPERATOR" and station.operator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập báo cáo của trạm sạc này.",
        )
    # Nếu là CUSTOMER (tài xế thông thường) thì cấm hoàn toàn
    if current_user.role not in ("ADMIN", "OPERATOR"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản trị viên và Chủ trạm mới có quyền xem báo cáo doanh thu.",
        )

    # 3. Một truy vấn gộp GROUP BY theo trụ sạc (SCRUM-390)
    # Lấy tất cả trụ sạc của trạm (kể cả trụ chưa có phiên nào qua LEFT OUTER JOIN)
    # Phiên được tính thuộc kỳ dựa trên thời điểm kết thúc phiên (stop_time / end_time) đã chốt COMPLETED.
    # Tiền điện = total_amount - idle_amount
    results = (
        db.query(
            ChargingPoint.id.label("cp_id"),
            ChargingPoint.code.label("cp_code"),
            func.count(ChargingSession.transaction_id).label("session_count"),
            func.coalesce(func.sum(ChargingSession.total_kwh), 0).label("sum_kwh"),
            func.coalesce(func.sum(ChargingSession.total_amount), 0).label("sum_total_amount"),
            func.coalesce(func.sum(ChargingSession.idle_amount), 0).label("sum_idle_amount"),
        )
        .join(Station, ChargingPoint.station_id == Station.id)
        .outerjoin(Connector, Connector.charge_point_id == ChargingPoint.id)
        .outerjoin(
            ChargingSession,
            (ChargingSession.connector_id == Connector.id)
            & (ChargingSession.status == "COMPLETED")
            & (ChargingSession.stop_time >= utc_start)
            & (ChargingSession.stop_time <= utc_end),
        )
        .filter(
            Station.id == station_id,
            # Bảo đảm lọc sở hữu tại WHERE cấp truy vấn
            (Station.operator_id == current_user.id) if current_user.role == "OPERATOR" else True,
        )
        .group_by(ChargingPoint.id, ChargingPoint.code)
        .order_by(ChargingPoint.id.asc())
        .all()
    )

    chargers_list: list[ChargerRevenueItem] = []
    total_sessions = 0
    total_kwh = Decimal("0.000")
    total_amount = Decimal("0.00")
    total_idle_amount = Decimal("0.00")
    total_energy_amount = Decimal("0.00")

    for row in results:
        s_count = int(row.session_count or 0)
        s_kwh = Decimal(str(row.sum_kwh or 0)).quantize(Decimal("0.001"))
        s_total = Decimal(str(row.sum_total_amount or 0)).quantize(Decimal("0.01"))
        s_idle = Decimal(str(row.sum_idle_amount or 0)).quantize(Decimal("0.01"))
        s_energy = (s_total - s_idle).quantize(Decimal("0.01"))

        chargers_list.append(
            ChargerRevenueItem(
                charger_id=row.cp_id,
                charger_code=row.cp_code or f"CP-{row.cp_id}",
                total_sessions=s_count,
                total_kwh=s_kwh,
                total_energy_amount=s_energy,
                total_idle_amount=s_idle,
                total_amount=s_total,
            )
        )

        total_sessions += s_count
        total_kwh += s_kwh
        total_amount += s_total
        total_idle_amount += s_idle
        total_energy_amount += s_energy

    return StationRevenueReportResponse(
        station_id=station.id,
        station_name=station.name,
        period_type=period_type,
        start_time=utc_start.isoformat(),
        end_time=utc_end.isoformat(),
        total_chargers=len(chargers_list),
        total_sessions=total_sessions,
        total_kwh=total_kwh.quantize(Decimal("0.001")),
        total_energy_amount=total_energy_amount.quantize(Decimal("0.01")),
        total_idle_amount=total_idle_amount.quantize(Decimal("0.01")),
        total_amount=total_amount.quantize(Decimal("0.01")),
        chargers=chargers_list,
    )


def get_reconciliation_report(
    db: Session,
    current_user: User,
    period_type: str = "month",
    start_date: str | None = None,
    end_date: str | None = None,
) -> ReconciliationReportResponse:
    """
    Báo cáo đối soát kWh đã cấp với tiền đã thu (S-53 / SCRUM-394, 395, 396):
    - Phát hiện 3 loại bất thường:
      (1) UNBILLED_ENERGY: Phiên có kWh > 0 mà không có hóa đơn (total_amount IS NULL hoặc = 0 hoặc chưa COMPLETED)
      (2) MISSING_LEDGER: Phiên đã chốt COMPLETED, total_amount > 0 nhưng không có dòng sổ cái tương ứng
      (3) AMOUNT_MISMATCH: Tiền hóa đơn lệch so với tính lại từ biểu giá vượt ngưỡng dung sai
    - Phân quyền: Chỉ Kế toán (ACCOUNTANT) và Quản trị viên (ADMIN).
    - Ngưỡng lệch đọc từ cấu hình settings.RECONCILIATION_TOLERANCE_VND.
    - Danh sách bất thường và tổng tiền chênh lệch hiển thị ở đầu báo cáo.
    """
    if current_user.role not in ("ADMIN", "ACCOUNTANT"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Kế toán (ACCOUNTANT) hoặc Quản trị viên (ADMIN) mới có quyền xem báo cáo đối soát.",
        )

    try:
        utc_start, utc_end = get_vietnam_period_utc_bounds(
            period_type=period_type,
            start_date=start_date,
            end_date=end_date,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    tolerance = Decimal(str(settings.RECONCILE_TOLERANCE_VND))

    # Import cục bộ để tránh circular import

    from app.models.wallet import WalletTransaction
    from app.services.session_service import calculate_session_price_segments

    # Truy vấn tất cả phiên trong kỳ (dựa vào stop_time nếu có, hoặc start_time nếu chưa kết thúc)
    sessions = (
        db.query(ChargingSession)
        .filter(
            ChargingSession.created_at >= utc_start,
            ChargingSession.created_at <= utc_end,
        )
        .all()
    )

    issues: list[DiscrepancyItem] = []
    total_discrepancy = Decimal("0.00")

    for s in sessions:
        kwh = Decimal(str(s.total_kwh or 0))
        inv_amt = Decimal(str(s.total_amount or 0))
        idle_amt = Decimal(str(s.idle_amount or 0))

        # (1) Bất thường 1: UNBILLED_ENERGY - Phiên cấp điện kWh > 0 nhưng không chốt tiền
        if kwh > Decimal("0.001") and (s.status != "COMPLETED" or inv_amt <= Decimal("0.00")):
            diff = inv_amt  # toàn bộ lượng kwh bị thất thoát doanh thu
            issues.append(
                DiscrepancyItem(
                    session_id=s.transaction_id,
                    issue_type="UNBILLED_ENERGY",
                    description=f"Phiên đã cấp {kwh} kWh nhưng trạng thái là {s.status} và tiền cước là {inv_amt} VND.",
                    kwh=kwh,
                    invoice_amount=inv_amt,
                    calculated_amount=Decimal("0.00"),
                    ledger_amount=Decimal("0.00"),
                    difference=kwh,  # Lưu kWh thất thoát vào difference
                )
            )
            continue

        # Nếu chưa chốt thì bỏ qua các bước kiểm tra sổ cái và biểu giá
        if s.status != "COMPLETED":
            continue

        # Tìm dòng sổ cái ứng với phiên này
        # Tham chiếu dạng session_{id} hoặc số id
        ledger_tx = (
            db.query(WalletTransaction)
            .filter(
                (WalletTransaction.reference_id == f"session_{s.transaction_id}")
                | (WalletTransaction.reference_id == str(s.transaction_id)),
                WalletTransaction.transaction_type == "CHARGE_FEE",
            )
            .first()
        )

        ledger_amt = abs(Decimal(str(ledger_tx.amount))) if ledger_tx else Decimal("0.00")

        # (2) Bất thường 2: MISSING_LEDGER - Có tiền hóa đơn nhưng không có dòng sổ cái trừ tiền
        if inv_amt > Decimal("0.00") and ledger_tx is None:
            issues.append(
                DiscrepancyItem(
                    session_id=s.transaction_id,
                    issue_type="MISSING_LEDGER",
                    description=f"Phiên đã chốt {inv_amt} VND nhưng không tìm thấy dòng trừ tiền hợp lệ trong sổ cái.",
                    kwh=kwh,
                    invoice_amount=inv_amt,
                    calculated_amount=inv_amt,
                    ledger_amount=Decimal("0.00"),
                    difference=inv_amt,
                )
            )
            total_discrepancy += inv_amt
            continue

        # (3) Bất thường 3: AMOUNT_MISMATCH - Tiền hóa đơn lệch so với tính lại từ biểu giá phiên bản đã dùng
        if s.tariff and s.stop_time and s.start_time and kwh > Decimal("0"):
            try:
                segments = calculate_session_price_segments(
                    start_time=s.start_time,
                    end_time=s.stop_time,
                    total_kwh=kwh,
                    tariff=s.tariff,
                )
                recalc_energy = sum(Decimal(str(seg["amount"])) for seg in segments)
                recalc_total = recalc_energy + idle_amt
                diff = abs(inv_amt - recalc_total)

                if diff > tolerance:
                    issues.append(
                        DiscrepancyItem(
                            session_id=s.transaction_id,
                            issue_type="AMOUNT_MISMATCH",
                            description=(
                                f"Tiền hóa đơn ({inv_amt:,.0f} VND) lệch so với tính lại từ biểu giá "
                                f"({recalc_total:,.0f} VND) vượt ngưỡng dung sai ({tolerance:,.0f} VND)."
                            ),
                            kwh=kwh,
                            invoice_amount=inv_amt,
                            calculated_amount=recalc_total,
                            ledger_amount=ledger_amt,
                            difference=diff,
                        )
                    )
                    total_discrepancy += diff
            except Exception as exc:  # noqa: BLE001
                logger.warning("Không thể tính lại giá phiên %s: %s", s.transaction_id, exc)

    return ReconciliationReportResponse(
        period_type=period_type,
        start_time=utc_start.isoformat(),
        end_time=utc_end.isoformat(),
        tolerance_applied_vnd=tolerance,
        total_issues=len(issues),
        total_discrepancy_amount=total_discrepancy.quantize(Decimal("0.01")),
        issues=issues,
    )

