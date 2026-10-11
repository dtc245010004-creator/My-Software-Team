"""Lưu snapshot các đoạn do bộ tính S-30/S-31 trả về."""

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.datetime_utils import VIETNAM_TZ
from app.models.meter_value import MeterValue
from app.models.session import ChargingSession
from app.models.session_billing_segment import SessionBillingSegment
from app.services.pricing_engine import calculate_session_pricing


def _session_pricing_input(db: Session, session: ChargingSession) -> dict:
    start_time = session.start_time or session.created_at
    stop_time = session.end_time or session.stop_time
    if stop_time is None:
        raise ValueError("Không thể lưu đoạn giá trước khi phiên có thời điểm kết thúc.")
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    if stop_time.tzinfo is None:
        stop_time = stop_time.replace(tzinfo=timezone.utc)
    if stop_time < start_time:
        stop_time = start_time

    meter_rows = (
        db.query(MeterValue)
        .filter(
            MeterValue.session_id == session.id,
            MeterValue.measurand == "Energy.Active.Import.Register",
        )
        .order_by(MeterValue.recorded_at.asc())
        .all()
    )
    meter_readings: list[tuple[datetime, Decimal]] = []
    for row in meter_rows:
        value = Decimal(str(row.value))
        if (row.unit or "").lower() == "wh":
            value /= Decimal("1000")
        meter_readings.append((row.recorded_at, value))

    if session.meter_start_kwh is not None:
        meter_start_kwh = Decimal(str(session.meter_start_kwh))
    elif session.meter_start is not None:
        meter_start_kwh = Decimal(session.meter_start) / Decimal("1000")
    else:
        meter_start_kwh = Decimal("0")

    if session.stop_reason == "SERVER_CRASH_RECONCILED" and session.total_kwh is not None:
        meter_stop_kwh = meter_start_kwh + Decimal(str(session.total_kwh))
    elif session.meter_stop_kwh is not None:
        meter_stop_kwh = Decimal(str(session.meter_stop_kwh))
    elif session.meter_stop is not None:
        meter_stop_kwh = Decimal(session.meter_stop) / Decimal("1000")
    elif meter_readings:
        meter_stop_kwh = meter_readings[-1][1]
    elif session.total_kwh is not None:
        meter_stop_kwh = meter_start_kwh + Decimal(str(session.total_kwh))
    else:
        meter_stop_kwh = meter_start_kwh

    tariff = session.tariff or Decimal(str(session.applied_price_per_kwh or 0))
    return {
        "start_time": start_time,
        "stop_time": stop_time,
        "meter_start_kwh": meter_start_kwh,
        "meter_stop_kwh": meter_stop_kwh,
        "tariff_schedule": tariff,
        "meter_readings": meter_readings,
        "station_tz": VIETNAM_TZ,
        "session_id": session.id,
    }


def persist_session_billing_segments(
    db: Session, session: ChargingSession
) -> list[SessionBillingSegment]:
    """Lưu nguyên kết quả chia đoạn S-30/S-31 trong giao dịch của caller.

    Hàm không commit. Phiên cũ chỉ được đọc theo dữ liệu đã chốt; hàm này chỉ
    được gọi từ luồng vừa chốt phiên. Ràng buộc unique là lớp bảo vệ cuối cho
    lời gọi đồng thời.
    """
    if (
        session.needs_review
        or session.is_abnormal
        or session.status in ("NEEDS_REVIEW", "ABNORMAL")
    ):
        return []

    if session.end_time is None and session.stop_time is None:
        return []

    existing = (
        db.query(SessionBillingSegment)
        .filter(SessionBillingSegment.session_id == session.id)
        .order_by(SessionBillingSegment.segment_index.asc())
        .all()
    )
    if existing:
        return existing

    pricing = calculate_session_pricing(**_session_pricing_input(db, session))
    rows = []
    for group in pricing["daily_groups"]:
        for segment in group["segments"]:
            rows.append(
                SessionBillingSegment(
                    session_id=session.id,
                    segment_index=segment["segment_index"],
                    segment_date=date.fromisoformat(group["date"]),
                    start_at=datetime.fromisoformat(segment["start_time"]).astimezone(
                        timezone.utc
                    ),
                    end_at=datetime.fromisoformat(segment["end_time"]).astimezone(
                        timezone.utc
                    ),
                    kwh=Decimal(str(segment["energy_kwh"])),
                    price_per_kwh=Decimal(str(segment["unit_price"])),
                    amount=Decimal(str(segment["rounded_amount"])),
                    tariff_id=session.tariff_id,
                )
            )

    db.add_all(rows)
    db.flush()
    return rows
