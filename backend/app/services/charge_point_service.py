import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.station import ChargingPoint

logger = logging.getLogger("ev_csms.charge_point_service")


def scan_and_mark_offline_charge_points(
    db: Optional[Session] = None,
    heartbeat_interval: Optional[int] = None,
) -> list[int]:
    """Quét các trụ sạc quá hạn heartbeat (> 2 * heartbeat_interval) và chuyển sang Offline (T-26).

    - Ngưỡng timeout mặc định = 2 * (heartbeat_interval hoặc settings.HEARTBEAT_INTERVAL_SECONDS).
    - So sánh mốc last_seen_at với thời gian UTC hiện tại của hệ thống.
    - Chuyển trạng thái trụ thành 'Offline' và các cổng sạc thành 'Unavailable'.
    - Ghi log INFO/WARNING kèm mã trụ và thời điểm liên lạc cuối cùng.
    - Idempotent: Chạy lại liên tiếp không gây thay đổi phụ và trả về danh sách rỗng nếu không có trụ mới quá hạn.
    """
    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        interval = (
            heartbeat_interval
            if heartbeat_interval is not None
            else settings.HEARTBEAT_INTERVAL_SECONDS
        )
        timeout_seconds = 2 * interval

        now_utc = datetime.now(timezone.utc)
        cutoff_aware = now_utc - timedelta(seconds=timeout_seconds)
        cutoff_naive = cutoff_aware.replace(tzinfo=None)

        # Lấy các trụ đang hoạt động (chưa offline) có last_seen_at quá hạn hoặc None
        candidates = (
            db.query(ChargingPoint)
            .options(joinedload(ChargingPoint.connectors))
            .filter(
                ChargingPoint.is_active.is_(True),
                ChargingPoint.status.notin_(["Offline", "offline"]),
                (ChargingPoint.last_seen_at < cutoff_aware)
                | (ChargingPoint.last_seen_at < cutoff_naive)
                | (ChargingPoint.last_seen_at.is_(None)),
            )
            .all()
        )

        modified_ids: list[int] = []
        for cp in candidates:
            # Kiểm tra an toàn bổ sung trong Python để đảm bảo đúng ngưỡng quá hạn
            is_expired = False
            if cp.last_seen_at is None:
                is_expired = True
            else:
                last_seen = cp.last_seen_at
                if last_seen.tzinfo is None:
                    last_seen = last_seen.replace(tzinfo=timezone.utc)
                diff = (now_utc - last_seen).total_seconds()
                if diff > timeout_seconds:
                    is_expired = True

            if is_expired:
                logger.warning(
                    "Trụ sạc code=%s (id=%s) quá hạn heartbeat (lần cuối: %s, vượt ngưỡng %ss), chuyển sang Offline.",
                    cp.code,
                    cp.id,
                    cp.last_seen_at,
                    timeout_seconds,
                )
                cp.status = "Offline"
                for conn in cp.connectors:
                    conn.status = "Unavailable"
                    conn.ocpp_status = "Unavailable"
                modified_ids.append(cp.id)

        if modified_ids:
            db.commit()
            logger.info(
                "Đã chuyển %s trụ sạc sang trạng thái Offline: %s",
                len(modified_ids),
                modified_ids,
            )
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Lỗi khi quét trạng thái offline trụ sạc")
        return []
    else:
        return modified_ids
    finally:
        if should_close:
            db.close()


def mark_charge_point_online(
    charging_point: ChargingPoint, db: Optional[Session] = None
) -> None:
    """Cập nhật last_seen_at và khôi phục trạng thái Online cho trụ (T-27)."""
    now = datetime.now(timezone.utc)
    charging_point.last_seen_at = now
    if charging_point.status in ("Offline", "offline", "Unavailable", "unavailable"):
        charging_point.status = "Online"
    if db is not None:
        db.commit()
