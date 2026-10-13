"""Chuẩn hóa và kiểm tra khung giờ trong bộ nhớ, không phụ thuộc DB/FastAPI."""

import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation


@dataclass(frozen=True)
class NormalizedPeriod:
    start_minute: int
    end_minute: int
    price_per_kwh: Decimal | None
    source_index: int
    power_limit_kw: float | None = None


def time_to_minutes(value: str, *, allow_day_end: bool = False) -> int:
    """Đọc HH:MM; 24:00 chỉ được dùng làm cuối khung, không thành datetime.time."""
    if allow_day_end and value == "24:00":
        return 1440
    if (
        not isinstance(value, str)
        or re.fullmatch(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]", value) is None
    ):
        raise ValueError(
            f"Giờ '{value}' không hợp lệ; cần HH:MM từ 00:00 đến 23:59"
            + (" hoặc 24:00 ở cuối khung." if allow_day_end else ".")
        )
    hours, minutes = map(int, value.split(":"))
    return hours * 60 + minutes


def _value(period, field):
    return period.get(field) if isinstance(period, Mapping) else getattr(period, field, None)


def _label(period) -> str:
    return f"{_value(period, 'start_time')}-{_value(period, 'end_time')}"


def _format_minute(minute: int) -> str:
    return f"{minute // 60:02d}:{minute % 60:02d}"


def _normalize_period(
    period, index: int, *, value_field: str | None = "price_per_kwh"
) -> list[NormalizedPeriod]:
    start = time_to_minutes(_value(period, "start_time"))
    end = time_to_minutes(_value(period, "end_time"), allow_day_end=True)
    # Từ chối mọi start == end; cả ngày phải khai báo rõ 00:00-24:00.
    if start == end:
        raise ValueError(
            f"Khung {_label(period)} có giờ bắt đầu trùng giờ kết thúc; "
            "dùng 00:00-24:00 cho cả ngày."
        )
    price: Decimal | None = None
    power_limit: float | None = None

    if value_field == "price_per_kwh":
        try:
            price = Decimal(str(_value(period, "price_per_kwh")))
        except InvalidOperation as exc:
            raise ValueError(f"Khung {_label(period)}: price_per_kwh phải là số.") from exc
        if not price.is_finite() or price < 0:
            raise ValueError(
                f"Khung {_label(period)}: price_per_kwh phải là số hữu hạn, không được âm."
            )
    elif value_field == "power_limit_kw":
        val = _value(period, "power_limit_kw")
        try:
            power_limit = float(val)
        except (ValueError, TypeError) as exc:
            raise ValueError(f"Khung {_label(period)}: power_limit_kw phải là số.") from exc
        if not math.isfinite(power_limit) or power_limit <= 0:
            raise ValueError(
                f"Khung {_label(period)}: power_limit_kw phải là số dương lớn hơn 0."
            )

    if start < end:
        return [NormalizedPeriod(start, end, price, index, power_limit_kw=power_limit)]
    segments = [NormalizedPeriod(start, 1440, price, index, power_limit_kw=power_limit)]
    if end > 0:
        segments.append(NormalizedPeriod(0, end, price, index, power_limit_kw=power_limit))
    return segments


def normalize_periods(
    periods, *, value_field: str | None = "price_per_kwh"
) -> list[NormalizedPeriod]:
    """Tách qua nửa đêm, sắp theo phút; khoảng [start, end), không sửa đầu vào.

    Chấp nhận dict, schema hoặc model với ba trường giờ/giá hoặc giờ/công suất.
    Dữ liệu sai định dạng hoặc start == end gây ValueError; dùng validate_periods để lấy lỗi.
    """
    return sorted(
        [
            segment
            for index, period in enumerate(periods)
            for segment in _normalize_period(period, index, value_field=value_field)
        ],
        key=lambda segment: (segment.start_minute, segment.end_minute),
    )


def validate_periods(
    periods, *, value_field: str | None = "price_per_kwh"
) -> list[str]:
    """Trả các lỗi định dạng, đơn giá/công suất, chồng lấn hoặc khoảng trống trong ngày."""
    periods = list(periods)
    errors = []
    for index, period in enumerate(periods):
        try:
            _normalize_period(period, index, value_field=value_field)
        except ValueError as exc:
            errors.append(str(exc))
    if errors:
        return errors

    segments = normalize_periods(periods, value_field=value_field)
    reported_pairs = set()
    covered_until = 0
    active = []
    for segment in segments:
        if segment.start_minute > covered_until:
            errors.append(
                f"Chưa có khung giờ cho {_format_minute(covered_until)}-"
                f"{_format_minute(segment.start_minute)}"
            )
        active = [other for other in active if other.end_minute > segment.start_minute]
        for other in active:
            pair = tuple(sorted((other.source_index, segment.source_index)))
            if pair not in reported_pairs:
                errors.append(
                    f"Khung {_label(periods[other.source_index])} chồng với khung "
                    f"{_label(periods[segment.source_index])}"
                )
                reported_pairs.add(pair)
        active.append(segment)
        covered_until = max(covered_until, segment.end_minute)
    if covered_until < 1440:
        errors.append(f"Chưa có khung giờ cho {_format_minute(covered_until)}-24:00")
    return errors


def get_effective_periods(tariff) -> list[dict]:
    """Đọc khung mới hoặc dựng khung cũ: ưu tiên peak, offpeak, rồi normal.

    Trả dict giờ/giá/thứ tự, không ghi khung suy ra vào DB. Khung trả về dùng
    biên nửa mở; determine_tou_rate vẫn giữ biên đóng của luồng legacy.
    """
    if tariff.periods:
        return [
            {
                field: getattr(period, field)
                for field in ("start_time", "end_time", "price_per_kwh", "sort_order")
            }
            for period in sorted(tariff.periods, key=lambda period: period.sort_order)
        ]

    peak_ranges = [
        (time_to_minutes(tariff.peak_start), time_to_minutes(tariff.peak_end)),
        (time_to_minutes(tariff.peak_start_2), time_to_minutes(tariff.peak_end_2)),
    ]
    off_start = time_to_minutes(tariff.offpeak_start)
    off_end = time_to_minutes(tariff.offpeak_end)
    boundaries = sorted(
        {0, 1440, off_start, off_end, *(m for pair in peak_ranges for m in pair)}
    )
    periods = []
    for start, end in zip(boundaries, boundaries[1:]):
        price = tariff.price_normal
        if any(left <= start < right for left, right in peak_ranges):
            price = tariff.price_peak
        elif (off_start <= start < off_end) or (
            off_start > off_end and (start >= off_start or start < off_end)
        ):
            price = tariff.price_offpeak
        price = Decimal(str(price))
        if periods and periods[-1]["price_per_kwh"] == price:
            periods[-1]["end_time"] = _format_minute(end)
        else:
            periods.append(
                {
                    "start_time": _format_minute(start),
                    "end_time": _format_minute(end),
                    "price_per_kwh": price,
                    "sort_order": len(periods),
                }
            )
    return periods
