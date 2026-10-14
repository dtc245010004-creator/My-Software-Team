"""Nghiệp vụ Đối soát, Chia doanh thu & Khóa kỳ đối soát (User Story S-54, S-55 / Epic E-09)."""

import logging
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.datetime_utils import get_vietnam_period_utc_bounds
from app.models.reconciliation import (
    PartnerRevenueShareConfig,
    PartnerSettlement,
    PeriodLockedException,
    PeriodStatus,
    ReconciliationPeriod,
)
from app.models.session import ChargingSession
from app.models.station import Station
from app.models.user import User
from app.models.wallet import WalletTransaction
from app.schemas.reconciliation import (
    PartnerRevenueShareConfigCreate,
    ReconciliationPeriodCreate,
    UnresolvedSessionItem,
)
from app.services.audit_service import ghi_nhat_ky

logger = logging.getLogger("ev_csms.reconciliation")


class PeriodLockConflictException(HTTPException):
    """Ngoại lệ khi không thể chốt kỳ do còn phiên bất thường chưa xử lý (S-55 AC 2)."""

    def __init__(
        self,
        detail: str = "Không thể chốt kỳ đối soát do còn phiên bất thường chưa được xử lý.",
        unresolved_sessions: list[UnresolvedSessionItem] | None = None,
    ):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
        )
        self.unresolved_sessions = unresolved_sessions or []


def calculate_partner_revenue_share(
    reconciled_revenue: int,
    share_percentage: Decimal | float,
) -> tuple[int, int]:
    """Thuật toán chia doanh thu bảo toàn tuyệt đối tổng tiền (Zero-Discrepancy Invariant - S-54).

    Quy tắc làm tròn:
        partner_payout_amount = int(Decimal(reconciled_revenue * share_percentage / 100).quantize(1, ROUND_HALF_UP))
        platform_retained_amount = reconciled_revenue - partner_payout_amount

    Bảo đảm:
        partner_payout_amount + platform_retained_amount == reconciled_revenue (lệch = 0 đồng).
    """
    rev_dec = Decimal(str(reconciled_revenue))
    rate_dec = Decimal(str(share_percentage))

    if rev_dec <= Decimal(0):
        return 0, 0

    partner_payout = int(
        (rev_dec * rate_dec / Decimal("100")).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )
    platform_retained = reconciled_revenue - partner_payout

    return partner_payout, platform_retained


def ensure_not_in_locked_period(db: Session, target_dt: datetime | None) -> None:
    """Kiểm tra thời điểm có thuộc kỳ đối soát đã LOCKED không. Nếu có, ném PeriodLockedException."""
    if target_dt is None:
        return

    stmt = text(
        "SELECT id, period_code FROM reconciliation_periods "
        "WHERE status = 'LOCKED' AND :target_dt >= start_date AND :target_dt <= end_date "
        "LIMIT 1"
    )
    row = db.execute(stmt, {"target_dt": target_dt}).fetchone()
    if row is not None:
        raise PeriodLockedException(
            f"Kỳ đối soát '{row[1]}' đã khóa, dữ liệu ở chế độ chỉ đọc (Read-only)."
        )


def create_or_update_partner_config(
    db: Session,
    payload: PartnerRevenueShareConfigCreate,
    current_user: User,
) -> PartnerRevenueShareConfig:
    """Tạo hoặc cập nhật cấu hình tỉ lệ chia doanh thu cho đối tác (S-54)."""
    if current_user.role not in ("ADMIN", "ACCOUNTANT"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản trị viên hoặc Kế toán mới có quyền cấu hình tỉ lệ chia doanh thu.",
        )

    partner = db.query(User).filter(User.id == payload.partner_id).first()
    if not partner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đối tác với ID {payload.partner_id}.",
        )

    if payload.station_id is not None:
        station = db.query(Station).filter(Station.id == payload.station_id).first()
        if not station:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy trạm sạc với ID {payload.station_id}.",
            )

    now = datetime.now(timezone.utc)
    eff_from = payload.effective_from or now
    if eff_from.tzinfo is None:
        eff_from = eff_from.replace(tzinfo=timezone.utc)

    eff_to = payload.effective_to
    if eff_to is not None and eff_to.tzinfo is None:
        eff_to = eff_to.replace(tzinfo=timezone.utc)

    config = PartnerRevenueShareConfig(
        partner_id=payload.partner_id,
        station_id=payload.station_id,
        share_percentage=payload.share_percentage,
        include_idle_fee=payload.include_idle_fee,
        effective_from=eff_from,
        effective_to=eff_to,
    )
    db.add(config)
    db.commit()
    db.refresh(config)

    config.partner_name = partner.full_name or partner.username
    if config.station:
        config.station_name = config.station.name

    return config


def list_partner_configs(
    db: Session,
    partner_id: int | None = None,
) -> list[PartnerRevenueShareConfig]:
    """Lấy danh sách cấu hình tỉ lệ của đối tác."""
    query = db.query(PartnerRevenueShareConfig)
    if partner_id is not None:
        query = query.filter(PartnerRevenueShareConfig.partner_id == partner_id)

    configs = query.order_by(PartnerRevenueShareConfig.id.desc()).all()
    for c in configs:
        if c.partner:
            c.partner_name = c.partner.full_name or c.partner.username
        if c.station:
            c.station_name = c.station.name
    return configs


def create_reconciliation_period(
    db: Session,
    payload: ReconciliationPeriodCreate,
    current_user: User,
) -> ReconciliationPeriod:
    """Tạo mới kỳ đối soát (S-55)."""
    if current_user.role not in ("ADMIN", "ACCOUNTANT"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản trị viên hoặc Kế toán mới có quyền tạo kỳ đối soát.",
        )

    period_type = payload.period_type or "month"

    if period_type == "month":
        # period_code ví dụ: 2026-10
        if payload.period_code and len(payload.period_code) == 7 and "-" in payload.period_code:
            parts = payload.period_code.split("-")
            year, month = int(parts[0]), int(parts[1])
            s_d = f"{year:04d}-{month:02d}-01"
            import calendar
            last_day = calendar.monthrange(year, month)[1]
            e_d = f"{year:04d}-{month:02d}-{last_day:02d}"
            utc_start, utc_end = get_vietnam_period_utc_bounds("custom", start_date=s_d, end_date=e_d)
            period_code = payload.period_code
            name = payload.name or f"Kỳ đối soát Tháng {month:02d}/{year}"
        else:
            utc_start, utc_end = get_vietnam_period_utc_bounds("month")
            vn_now = utc_start.astimezone(timezone.utc)
            period_code = payload.period_code or vn_now.strftime("%Y-%m")
            name = payload.name or f"Kỳ đối soát {period_code}"
    else:  # custom
        if not payload.start_date or not payload.end_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Kỳ custom bắt buộc phải có start_date và end_date.",
            )
        utc_start, utc_end = get_vietnam_period_utc_bounds(
            "custom", start_date=payload.start_date, end_date=payload.end_date
        )
        period_code = payload.period_code or f"CUSTOM-{payload.start_date.replace('-', '')}-{payload.end_date.replace('-', '')}"
        name = payload.name or f"Kỳ đối soát tùy chọn ({payload.start_date} đến {payload.end_date})"

    # Kiểm tra trùng period_code
    existing = (
        db.query(ReconciliationPeriod)
        .filter(ReconciliationPeriod.period_code == period_code)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Kỳ đối soát với mã '{period_code}' đã tồn tại.",
        )

    period = ReconciliationPeriod(
        period_code=period_code,
        name=name,
        period_type=period_type,
        start_date=utc_start,
        end_date=utc_end,
        status=PeriodStatus.OPEN.value,
    )
    db.add(period)
    db.commit()
    db.refresh(period)
    return period


def list_reconciliation_periods(
    db: Session,
    current_user: User,
) -> list[ReconciliationPeriod]:
    """Danh sách các kỳ đối soát."""
    if current_user.role not in ("ADMIN", "ACCOUNTANT", "OPERATOR"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem danh sách kỳ đối soát.",
        )

    periods = (
        db.query(ReconciliationPeriod)
        .order_by(ReconciliationPeriod.start_date.desc())
        .all()
    )
    return periods


def get_reconciliation_period_by_id(
    db: Session,
    period_id: int,
    current_user: User,
) -> ReconciliationPeriod:
    """Xem chi tiết kỳ đối soát kèm danh sách bảng kê."""
    period = (
        db.query(ReconciliationPeriod)
        .filter(ReconciliationPeriod.id == period_id)
        .first()
    )
    if not period:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy kỳ đối soát ID {period_id}.",
        )

    # Nạp partner_name cho settlements
    for s in period.settlements:
        if s.partner:
            s.partner_name = s.partner.full_name or s.partner.username

    return period


def find_unresolved_sessions_in_period(
    db: Session,
    start_date: datetime,
    end_date: datetime,
) -> list[UnresolvedSessionItem]:
    """Quét toàn bộ các phiên sạc trong kỳ và phát hiện các phiên bất thường chưa xử lý (S-55 AC 2)."""
    tolerance = Decimal(str(settings.RECONCILE_TOLERANCE_VND))

    # Lấy toàn bộ các phiên thuộc khoảng thời gian kỳ
    sessions = (
        db.query(ChargingSession)
        .filter(
            (ChargingSession.created_at >= start_date) & (ChargingSession.created_at <= end_date)
            | (ChargingSession.stop_time.isnot(None))
            & (ChargingSession.stop_time >= start_date)
            & (ChargingSession.stop_time <= end_date)
        )
        .all()
    )

    unresolved: list[UnresolvedSessionItem] = []

    for s in sessions:
        cp_id = s.connector.charge_point_id if s.connector else None
        cp_code = s.connector.charging_point.code if (s.connector and s.connector.charging_point) else None
        kwh = Decimal(str(s.total_kwh or 0))
        inv_amt = Decimal(str(s.total_amount or 0))

        # 1. Phiên đang chạy / chưa kết thúc
        if s.status in ("ACTIVE", "PENDING", "CHARGING", "IN_PROGRESS"):
            unresolved.append(
                UnresolvedSessionItem(
                    session_id=s.transaction_id,
                    charge_point_id=cp_id,
                    charge_point_code=cp_code,
                    anomaly_reason=f"Phiên sạc đang treo chưa kết thúc (Trạng thái: {s.status})",
                )
            )
            continue

        # 2. Phiên bị đánh dấu bất thường
        if s.is_abnormal or s.status == "ABNORMAL" or s.needs_review:
            unresolved.append(
                UnresolvedSessionItem(
                    session_id=s.transaction_id,
                    charge_point_id=cp_id,
                    charge_point_code=cp_code,
                    anomaly_reason=f"Phiên sạc bị đánh dấu bất thường: {s.abnormal_reason or s.stop_reason or 'ABNORMAL'}",
                )
            )
            continue

        # 3. UNBILLED_ENERGY: Sản lượng kwh > 0 nhưng chưa có hóa đơn hoặc chưa COMPLETED
        if kwh > Decimal("0.001") and (s.status != "COMPLETED" or inv_amt <= Decimal("0.00")):
            unresolved.append(
                UnresolvedSessionItem(
                    session_id=s.transaction_id,
                    charge_point_id=cp_id,
                    charge_point_code=cp_code,
                    anomaly_reason=f"UNBILLED_ENERGY: Phiên đã cấp {kwh} kWh nhưng chưa có hóa đơn hợp lệ (Trạng thái: {s.status}, Tiền: {inv_amt} VND)",
                )
            )
            continue

        # 4. MISSING_LEDGER: Phiên đã chốt total_amount > 0 nhưng thiếu dòng sổ cái
        if s.status == "COMPLETED" and inv_amt > Decimal("0.00"):
            ledger_tx = (
                db.query(WalletTransaction)
                .filter(
                    (WalletTransaction.reference_id == f"session_{s.transaction_id}")
                    | (WalletTransaction.reference_id == str(s.transaction_id)),
                    WalletTransaction.transaction_type == "CHARGE_FEE",
                )
                .first()
            )
            if ledger_tx is None:
                unresolved.append(
                    UnresolvedSessionItem(
                        session_id=s.transaction_id,
                        charge_point_id=cp_id,
                        charge_point_code=cp_code,
                        anomaly_reason=f"MISSING_LEDGER: Phiên đã chốt {inv_amt:,.0f} VND nhưng thiếu dòng sổ cái trừ tiền ví tương ứng",
                    )
                )
                continue

        # 5. AMOUNT_MISMATCH: Tổng tiền từ các đoạn biểu giá lệch so với tiền điện hóa đơn
        if s.billing_segments and len(s.billing_segments) > 0:
            seg_sum = sum(Decimal(str(seg.amount)) for seg in s.billing_segments)
            energy_amt = inv_amt - Decimal(str(s.idle_amount or 0))
            if abs(seg_sum - energy_amt) > tolerance:
                unresolved.append(
                    UnresolvedSessionItem(
                        session_id=s.transaction_id,
                        charge_point_id=cp_id,
                        charge_point_code=cp_code,
                        anomaly_reason=(
                            f"AMOUNT_MISMATCH: Tổng tiền các đoạn biểu giá ({seg_sum:,.0f} VND) "
                            f"lệch tiền điện hóa đơn ({energy_amt:,.0f} VND) vượt dung sai ({tolerance:,.0f} VND)"
                        ),
                    )
                )

    return unresolved


def lock_reconciliation_period(
    db: Session,
    period_id: int,
    current_user: User,
) -> ReconciliationPeriod:
    """Chốt và khóa kỳ đối soát (S-55): kiểm tra phiên bất thường, sinh bảng kê S-54 và khóa Read-only."""
    if current_user.role not in ("ADMIN", "ACCOUNTANT"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản trị viên hoặc Kế toán mới có quyền chốt kỳ đối soát.",
        )

    period = (
        db.query(ReconciliationPeriod)
        .filter(ReconciliationPeriod.id == period_id)
        .first()
    )
    if not period:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy kỳ đối soát ID {period_id}.",
        )

    if period.status == PeriodStatus.LOCKED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Kỳ đối soát '{period.period_code}' hiện đã bị khóa.",
        )

    # 1. Quét kiểm tra các phiên bất thường trong kỳ (AC 2)
    unresolved_sessions = find_unresolved_sessions_in_period(
        db, period.start_date, period.end_date
    )
    if len(unresolved_sessions) > 0:
        raise PeriodLockConflictException(
            detail="Không thể chốt kỳ đối soát do còn phiên bất thường chưa được xử lý.",
            unresolved_sessions=unresolved_sessions,
        )

    # 2. Lập bảng kê chia doanh thu cho từng đối tác (S-54)
    # Lấy tất cả phiên hợp lệ COMPLETED trong kỳ
    valid_sessions = (
        db.query(ChargingSession)
        .filter(
            ChargingSession.status == "COMPLETED",
            ChargingSession.created_at >= period.start_date,
            ChargingSession.created_at <= period.end_date,
        )
        .all()
    )

    # Nhóm phiên theo chủ trạm (Station.operator_id)
    partner_sessions_map: dict[int, list[ChargingSession]] = {}
    for sess in valid_sessions:
        if sess.connector and sess.connector.charging_point and sess.connector.charging_point.station:
            op_id = sess.connector.charging_point.station.operator_id
            if op_id is not None:
                partner_sessions_map.setdefault(op_id, []).append(sess)

    # Xóa các settlement cũ nếu có của kỳ này trước khi tính mới
    db.query(PartnerSettlement).filter(PartnerSettlement.period_id == period.id).delete()

    total_period_rev = 0
    total_period_payout = 0
    total_period_retained = 0

    now = datetime.now(timezone.utc)

    for partner_id, p_sessions in partner_sessions_map.items():
        partner = db.query(User).filter(User.id == partner_id).first()
        if not partner:
            continue

        # Lấy các cấu hình tỉ lệ của partner này
        configs = (
            db.query(PartnerRevenueShareConfig)
            .filter(PartnerRevenueShareConfig.partner_id == partner_id)
            .order_by(PartnerRevenueShareConfig.effective_from.asc())
            .all()
        )

        p_total_rev = 0
        p_total_payout = 0
        p_total_retained = 0
        p_total_sessions = len(p_sessions)
        p_total_kwh = Decimal("0.000")
        p_total_energy = 0
        p_total_idle = 0
        p_share_percentage = Decimal("70.00")
        p_include_idle_fee = True

        for s in p_sessions:
            s_time = s.stop_time or s.start_time or s.created_at
            if s_time.tzinfo is None:
                s_time = s_time.replace(tzinfo=timezone.utc)

            # Tìm cấu hình có hiệu lực tại thời điểm chốt phiên
            matched_cfg = None
            for cfg in configs:
                c_from = cfg.effective_from
                if c_from.tzinfo is None:
                    c_from = c_from.replace(tzinfo=timezone.utc)
                c_to = cfg.effective_to
                if c_to is not None and c_to.tzinfo is None:
                    c_to = c_to.replace(tzinfo=timezone.utc)

                if c_from <= s_time and (c_to is None or c_to >= s_time):
                    # Ưu tiên cấu hình trạm cụ thể nếu khớp
                    st_id = s.connector.charging_point.station_id if s.connector and s.connector.charging_point else None
                    if cfg.station_id is None or cfg.station_id == st_id:
                        matched_cfg = cfg

            rate = matched_cfg.share_percentage if matched_cfg else Decimal("70.00")
            inc_idle = matched_cfg.include_idle_fee if matched_cfg else True
            p_share_percentage = rate
            p_include_idle_fee = inc_idle

            s_kwh = Decimal(str(s.total_kwh or 0))
            s_tot_amt = int(Decimal(str(s.total_amount or 0)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
            s_idle_amt = int(Decimal(str(s.idle_amount or 0)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
            s_energy_amt = s_tot_amt - s_idle_amt

            p_total_kwh += s_kwh
            p_total_energy += s_energy_amt
            p_total_idle += s_idle_amt

            # Doanh thu tính chia cho phiên này theo cấu hình include_idle_fee
            session_reconciled = s_tot_amt if inc_idle else s_energy_amt
            p_total_rev += session_reconciled

            # Chia doanh thu cho phiên này (bảo toàn tuyệt đối)
            s_payout, s_retained = calculate_partner_revenue_share(session_reconciled, rate)
            p_total_payout += s_payout
            p_total_retained += s_retained

        # Lưu bản ghi PartnerSettlement
        settlement = PartnerSettlement(
            period_id=period.id,
            partner_id=partner_id,
            reconciled_revenue=p_total_rev,
            share_percentage=p_share_percentage,
            partner_payout_amount=p_total_payout,
            platform_retained_amount=p_total_retained,
            total_sessions=p_total_sessions,
            total_kwh=p_total_kwh.quantize(Decimal("0.001")),
            energy_amount=p_total_energy,
            idle_fee_amount=p_total_idle,
            include_idle_fee=p_include_idle_fee,
        )
        db.add(settlement)

        total_period_rev += p_total_rev
        total_period_payout += p_total_payout
        total_period_retained += p_total_retained

    # 3. Cập nhật kỳ sang LOCKED
    period.status = PeriodStatus.LOCKED.value
    period.total_reconciled_revenue = total_period_rev
    period.total_partner_payout = total_period_payout
    period.total_platform_retained = total_period_retained
    period.closed_by_id = current_user.id
    period.closed_at = now
    period.updated_at = now

    # 4. Ghi nhật ký kiểm toán (Audit Log)
    ghi_nhat_ky(
        db=db,
        user_id=current_user.id,
        action="RECONCILIATION_PERIOD_LOCKED",
        object_type="reconciliation_period",
        object_id=period.id,
        data={
            "period_code": period.period_code,
            "total_reconciled_revenue": total_period_rev,
            "total_partner_payout": total_period_payout,
            "total_platform_retained": total_period_retained,
            "closed_by_user_id": current_user.id,
        },
    )

    db.commit()
    db.refresh(period)
    logger.info("Chốt kỳ đối soát thành công period_code=%s", period.period_code)
    return period


def reopen_reconciliation_period(
    db: Session,
    period_id: int,
    current_user: User,
    reason: str,
) -> ReconciliationPeriod:
    """Mở lại kỳ đối soát đã chốt (S-55 AC 3): Chỉ dành cho ADMIN, bắt buộc có lý do và ghi audit log."""
    if current_user.role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản trị viên (ADMIN) mới có quyền mở lại kỳ đối soát.",
        )

    if not reason or len(reason.strip()) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lý do mở lại kỳ đối soát là bắt buộc và phải có ít nhất 5 ký tự.",
        )

    period = (
        db.query(ReconciliationPeriod)
        .filter(ReconciliationPeriod.id == period_id)
        .first()
    )
    if not period:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy kỳ đối soát ID {period_id}.",
        )

    if period.status != PeriodStatus.LOCKED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể mở lại kỳ đối soát ở trạng thái '{period.status}' (chỉ mở lại kỳ đã LOCKED).",
        )

    now = datetime.now(timezone.utc)
    clean_reason = reason.strip()

    # Cập nhật trạng thái sang REOPENED
    period.status = PeriodStatus.REOPENED.value
    period.reopened_by_id = current_user.id
    period.reopened_at = now
    period.reopen_reason = clean_reason
    period.updated_at = now

    # Ghi nhật ký kiểm toán (Audit Log)
    ghi_nhat_ky(
        db=db,
        user_id=current_user.id,
        action="RECONCILIATION_PERIOD_REOPENED",
        object_type="reconciliation_period",
        object_id=period.id,
        data={
            "period_code": period.period_code,
            "reason": clean_reason,
            "previous_status": "LOCKED",
            "new_status": "REOPENED",
            "admin_user_id": current_user.id,
        },
    )

    db.commit()
    db.refresh(period)
    logger.info(
        "Mở lại kỳ đối soát thành công period_code=%s bởi admin_id=%s, lý do: %s",
        period.period_code,
        current_user.id,
        clean_reason,
    )
    return period


def get_period_settlements(
    db: Session,
    period_id: int,
    current_user: User,
) -> list[PartnerSettlement]:
    """Xem bảng kê chia doanh thu của kỳ đối soát."""
    period = (
        db.query(ReconciliationPeriod)
        .filter(ReconciliationPeriod.id == period_id)
        .first()
    )
    if not period:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy kỳ đối soát ID {period_id}.",
        )

    query = db.query(PartnerSettlement).filter(PartnerSettlement.period_id == period_id)

    # Nếu là OPERATOR thì chỉ xem bản kê của chính mình
    if current_user.role == "OPERATOR":
        query = query.filter(PartnerSettlement.partner_id == current_user.id)
    elif current_user.role not in ("ADMIN", "ACCOUNTANT"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem bảng kê chia doanh thu.",
        )

    settlements = query.all()
    for s in settlements:
        if s.partner:
            s.partner_name = s.partner.full_name or s.partner.username

    return settlements
