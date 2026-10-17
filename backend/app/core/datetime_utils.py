from datetime import datetime, timedelta, timezone
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AfterValidator

# Múi giờ Việt Nam chuẩn (UTC+7, Asia/Ho_Chi_Minh)
try:
    VIETNAM_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
except ZoneInfoNotFoundError:
    VIETNAM_TZ = timezone(timedelta(hours=7))


def get_utc_now() -> datetime:
    """Trả về thời gian hiện tại theo UTC chuẩn (timezone-aware)."""
    return datetime.now(timezone.utc)


def get_vn_now() -> datetime:
    """Trả về thời gian hiện tại theo múi giờ Việt Nam (UTC+7, timezone-aware)."""
    return datetime.now(VIETNAM_TZ)


def to_vn_time(dt: datetime | None) -> datetime | None:
    """
    Chuyển đổi một đối tượng datetime sang múi giờ Việt Nam (Asia/Ho_Chi_Minh).
    Nếu dt là naive (không có tzinfo), giả định dữ liệu trong CSDL được lưu ở dạng UTC.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(VIETNAM_TZ)


def ensure_utc(v: datetime | None) -> datetime | None:
    """
    Đảm bảo datetime object luôn có tzinfo là UTC (dùng cho Pydantic serialize).
    Nếu naive, gắn tzinfo=timezone.utc để Pydantic tự động serialize thành chuỗi ISO có hậu tố Z.
    """
    if v is None:
        return None
    if v.tzinfo is None:
        return v.replace(tzinfo=timezone.utc)
    return v.astimezone(timezone.utc)


# Pydantic v2 Type Annotation: Luôn đảm bảo serialize kèm Z / UTC offset
UTCDateTime = Annotated[datetime, AfterValidator(ensure_utc)]


def get_vietnam_period_utc_bounds(
    period_type: str = "month",
    start_date: str | None = None,
    end_date: str | None = None,
) -> tuple[datetime, datetime]:
    """
    Tính mốc thời gian bắt đầu và kết thúc của một kỳ theo giờ Việt Nam (UTC+7),
    sau đó quy đổi về mốc UTC chuẩn để truy vấn trong CSDL.
    
    Hỗ trợ period_type: 'day', 'week', 'month', 'custom'.
    - 'day': ngày hiện tại theo giờ VN (00:00:00 -> 23:59:59.999999).
    - 'week': tuần hiện tại (bắt đầu từ Thứ Hai 00:00:00).
    - 'month': tháng hiện tại (ngày 1 00:00:00 -> hết tháng).
    - 'custom': nhận start_date và end_date dạng YYYY-MM-DD.
    """
    vn_now = get_vn_now()
    if period_type == "day":
        vn_start = vn_now.replace(hour=0, minute=0, second=0, microsecond=0)
        vn_end = vn_now.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif period_type == "week":
        # Thứ Hai là weekday = 0
        days_behind = vn_now.weekday()
        monday = vn_now - timedelta(days=days_behind)
        vn_start = monday.replace(hour=0, minute=0, second=0, microsecond=0)
        sunday = vn_start + timedelta(days=6)
        vn_end = sunday.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif period_type == "month":
        vn_start = vn_now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # Tìm ngày cuối tháng
        if vn_now.month == 12:
            next_month = vn_now.replace(year=vn_now.year + 1, month=1, day=1)
        else:
            next_month = vn_now.replace(month=vn_now.month + 1, day=1)
        last_day = next_month - timedelta(days=1)
        vn_end = last_day.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif period_type == "custom":
        if not start_date or not end_date:
            raise ValueError("Kỳ custom yêu cầu cung cấp start_date và end_date.")
        s_d = datetime.strptime(start_date, "%Y-%m-%d").date()
        e_d = datetime.strptime(end_date, "%Y-%m-%d").date()
        if e_d < s_d:
            raise ValueError("end_date không được nhỏ hơn start_date.")
        if (e_d - s_d).days > 365:
            raise ValueError("Khoảng thời gian tùy chọn không được vượt quá 365 ngày.")
        vn_start = datetime.combine(s_d, datetime.min.time(), tzinfo=VIETNAM_TZ)
        vn_end = datetime.combine(
            e_d, datetime.max.time().replace(microsecond=999999), tzinfo=VIETNAM_TZ
        )
    else:
        raise ValueError(f"Loại kỳ không hợp lệ: {period_type}")

    # Đổi sang UTC timezone-aware
    utc_start = vn_start.astimezone(timezone.utc)
    utc_end = vn_end.astimezone(timezone.utc)
    return utc_start, utc_end

