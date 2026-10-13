"""Dịch vụ giám sát cảnh báo ngoại tuyến và lỗi liên tục (SCRUM-317, SCRUM-318, SCRUM-319)."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.station import ChargerAlert, ChargingPoint, Connector, ConnectorError
from app.services.email_service import send_alert_email

logger = logging.getLogger("ev_csms.alerts")


def check_offline_chargers_and_alert(
    db: Session, now: datetime | None = None
) -> list[ChargerAlert]:
    """Kiểm tra các trụ ngoại tuyến quá ngưỡng cấu hình và tạo cảnh báo (SCRUM-317, SCRUM-318)."""
    now_utc = now or datetime.now(timezone.utc)
    threshold_minutes = settings.CHARGER_OFFLINE_ALERT_MINUTES
    cutoff = now_utc - timedelta(minutes=threshold_minutes)

    # Lấy các trụ đang hoạt động nhưng bị offline hoặc quá hạn heartbeat
    candidates = (
        db.query(ChargingPoint)
        .filter(
            ChargingPoint.is_active.is_(True),
            (ChargingPoint.status.in_(["Offline", "offline"]))
            | (ChargingPoint.last_seen_at < cutoff)
            | (ChargingPoint.last_seen_at.is_(None)),
        )
        .all()
    )

    created_alerts = []
    for cp in candidates:
        # Kiểm tra xem đã có cảnh báo OFFLINE đang OPEN chưa (chống trùng lặp - SCRUM-318)
        existing_open = (
            db.query(ChargerAlert)
            .filter(
                ChargerAlert.charging_point_id == cp.id,
                ChargerAlert.alert_type == "OFFLINE",
                ChargerAlert.status == "OPEN",
            )
            .first()
        )
        if existing_open:
            continue

        last_seen_str = cp.last_seen_at.isoformat() if cp.last_seen_at else "Chưa từng liên lạc"
        msg = f"Trụ sạc {cp.code} đã ngoại tuyến quá {threshold_minutes} phút (lần cuối: {last_seen_str})."
        alert = ChargerAlert(
            charging_point_id=cp.id,
            station_id=cp.station_id,
            alert_type="OFFLINE",
            status="OPEN",
            severity="CRITICAL",
            message=msg,
            detail_info=f"vendor={cp.vendor}, model={cp.model}, last_seen_at={last_seen_str}",
            opened_at=now_utc,
        )
        try:
            db.add(alert)
            db.flush()

            # Gửi email cảnh báo (SCRUM-319)
            recipients = [settings.ALERT_EMAIL_ADMINS]
            if cp.station and cp.station.operator and cp.station.operator.email:
                recipients.append(cp.station.operator.email)

            subject = f"[EV CSMS CẢNH BÁO] Trụ sạc {cp.code} tại trạm {cp.station.name if cp.station else cp.station_id} ngoại tuyến"
            if send_alert_email(to_emails=recipients, subject=subject, content_html=f"<p>{msg}</p>"):
                alert.email_sent_at = now_utc

            created_alerts.append(alert)
            logger.warning("Đã tạo cảnh báo OFFLINE cho trụ #%s (%s)", cp.id, cp.code)
        except IntegrityError:
            db.rollback()
            logger.debug("Bỏ qua do đã tồn tại cảnh báo mở cho trụ #%s (Partial Index)", cp.id)

    # Tự động đóng (Auto-resolve) các cảnh báo OFFLINE của các trụ đã Online trở lại
    online_cps = (
        db.query(ChargingPoint)
        .filter(
            ChargingPoint.is_active.is_(True),
            ChargingPoint.status.in_(["Online", "online", "AVAILABLE", "Available"]),
            ChargingPoint.last_seen_at >= cutoff,
        )
        .all()
    )
    for cp in online_cps:
        open_offline_alerts = (
            db.query(ChargerAlert)
            .filter(
                ChargerAlert.charging_point_id == cp.id,
                ChargerAlert.alert_type == "OFFLINE",
                ChargerAlert.status == "OPEN",
            )
            .all()
        )
        for a in open_offline_alerts:
            a.status = "RESOLVED"
            a.resolved_at = now_utc
            a.resolved_reason = "Trụ sạc đã trực tuyến trở lại"
            logger.info("Tự động đóng cảnh báo OFFLINE cho trụ #%s", cp.id)

    db.commit()
    return created_alerts


def check_connector_errors_burst_and_alert(
    db: Session, now: datetime | None = None
) -> list[ChargerAlert]:
    """Kiểm tra số lỗi trong connector_errors trong cửa sổ trượt vượt ngưỡng (SCRUM-317, SCRUM-318)."""
    now_utc = now or datetime.now(timezone.utc)
    window_minutes = settings.CONNECTOR_ERROR_WINDOW_MINUTES
    threshold_count = settings.CONNECTOR_ERROR_ALERT_THRESHOLD
    cutoff = now_utc - timedelta(minutes=window_minutes)

    burst_rows = (
        db.query(
            Connector.charge_point_id,
            func.count(ConnectorError.id).label("err_count"),
        )
        .join(ConnectorError, Connector.id == ConnectorError.connector_id)
        .filter(ConnectorError.created_at >= cutoff)
        .group_by(Connector.charge_point_id)
        .having(func.count(ConnectorError.id) >= threshold_count)
        .all()
    )

    created_alerts = []
    for cp_id, err_count in burst_rows:
        existing_open = (
            db.query(ChargerAlert)
            .filter(
                ChargerAlert.charging_point_id == cp_id,
                ChargerAlert.alert_type == "ERROR_BURST",
                ChargerAlert.status == "OPEN",
            )
            .first()
        )
        if existing_open:
            continue

        cp = db.query(ChargingPoint).filter(ChargingPoint.id == cp_id).first()
        if not cp:
            continue

        msg = f"Trụ sạc {cp.code} ghi nhận {err_count} lỗi liên tục trong {window_minutes} phút (ngưỡng: {threshold_count})."
        alert = ChargerAlert(
            charging_point_id=cp.id,
            station_id=cp.station_id,
            alert_type="ERROR_BURST",
            status="OPEN",
            severity="WARNING",
            message=msg,
            detail_info=f"error_count={err_count}, window_minutes={window_minutes}, threshold={threshold_count}",
            opened_at=now_utc,
        )
        try:
            db.add(alert)
            db.flush()

            recipients = [settings.ALERT_EMAIL_ADMINS]
            if cp.station and cp.station.operator and cp.station.operator.email:
                recipients.append(cp.station.operator.email)

            subject = f"[EV CSMS CẢNH BÁO] Trụ sạc {cp.code} báo lỗi liên tục ({err_count} lỗi)"
            if send_alert_email(to_emails=recipients, subject=subject, content_html=f"<p>{msg}</p>"):
                alert.email_sent_at = now_utc

            created_alerts.append(alert)
            logger.warning("Đã tạo cảnh báo ERROR_BURST cho trụ #%s (%s)", cp.id, cp.code)
        except IntegrityError:
            db.rollback()
            logger.debug("Bỏ qua do đã tồn tại cảnh báo mở cho trụ #%s", cp.id)

    db.commit()
    return created_alerts


def auto_resolve_offline_alert_for_charger(
    db: Session, charging_point_id: int, now: datetime | None = None
) -> int:
    """Tự động đóng cảnh báo OFFLINE khi trụ nhận bản tin trực tuyến."""
    now_utc = now or datetime.now(timezone.utc)
    alerts = (
        db.query(ChargerAlert)
        .filter(
            ChargerAlert.charging_point_id == charging_point_id,
            ChargerAlert.alert_type == "OFFLINE",
            ChargerAlert.status == "OPEN",
        )
        .all()
    )
    resolved_count = 0
    for a in alerts:
        a.status = "RESOLVED"
        a.resolved_at = now_utc
        a.resolved_reason = "Trụ sạc đã gửi tín hiệu trực tuyến trở lại"
        resolved_count += 1
    if resolved_count:
        db.commit()
        logger.info("Đã tự động đóng %s cảnh báo OFFLINE cho trụ #%s", resolved_count, charging_point_id)
    return resolved_count
