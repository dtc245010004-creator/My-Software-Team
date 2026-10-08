"""Các phép tính tiền điện và phí chiếm trụ."""

from datetime import datetime
from decimal import Decimal
from typing import NamedTuple

from app.core.config import settings


class SessionTotal(NamedTuple):
    energy_amount: Decimal
    idle_amount: Decimal
    total_amount: Decimal


def calculate_idle_fee(
    idle_start: datetime,
    idle_end: datetime,
    grace_minutes: int,
    fee_per_minute: Decimal,
) -> Decimal:
    """Tính phí sau ân hạn, làm tròn lên và áp trần settings; không truy cập DB/API."""
    max_minutes = settings.IDLE_FEE_MAX_MINUTES
    if grace_minutes < 0 or fee_per_minute < 0 or max_minutes < 0:
        raise ValueError("Ân hạn, phí chiếm trụ và trần phút không được âm.")

    duration = idle_end - idle_start
    duration_microseconds = (
        duration.days * 86_400_000_000
        + duration.seconds * 1_000_000
        + duration.microseconds
    )
    minute_microseconds = 60_000_000
    excess_microseconds = duration_microseconds - grace_minutes * minute_microseconds
    chargeable_minutes = max(
        0,
        (excess_microseconds + minute_microseconds - 1) // minute_microseconds,
    )
    return fee_per_minute * min(max_minutes, chargeable_minutes)


def calculate_session_total(session, tariff) -> SessionTotal:
    """Tính tổng tiền phiên bằng đơn giá đã chốt và phí chiếm trụ (nếu có)."""
    total_kwh = Decimal(str(session.total_kwh or 0))
    applied_price = Decimal(str(session.applied_price_per_kwh or 0))
    energy_amount = round(total_kwh * applied_price, 2)

    idle_amount = Decimal("0.00")
    if tariff is not None:
        connector = getattr(session, "connector", None)
        idle_start = getattr(connector, "idle_started_at", None)
        idle_end = getattr(connector, "idle_ended_at", None)
        if idle_start is not None and idle_end is not None:
            idle_amount = calculate_idle_fee(
                idle_start,
                idle_end,
                tariff.idle_grace_minutes,
                Decimal(str(tariff.idle_fee_per_minute)),
            )

    return SessionTotal(
        energy_amount=energy_amount,
        idle_amount=idle_amount,
        total_amount=energy_amount + idle_amount,
    )
