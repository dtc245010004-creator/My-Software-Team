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
