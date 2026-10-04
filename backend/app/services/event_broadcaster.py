import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.models.user import User

logger = logging.getLogger("ev_csms.event_broadcaster")


class StationEventBroadcaster:
    """Quản lý các kết nối SSE (Server-Sent Events) theo mô hình Pub/Sub trong bộ nhớ.

    Hỗ trợ phân quyền & cách ly dữ liệu thời gian thực (RBAC / Tenancy):
    - ADMIN: Nhận toàn bộ sự kiện thay đổi trạng thái của mọi trạm.
    - OPERATOR (CPO): Chỉ nhận sự kiện của các trạm do chính tài khoản đó sở hữu
      (station.operator_id == user.id).
    """

    def __init__(self) -> None:
        # Mapping giữa queue subscriber và metadata thông tin user
        self._subscribers: Dict[asyncio.Queue, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, user: User) -> asyncio.Queue:
        """Đăng ký một subscriber mới gắn liền với user và trả về queue nhận tin."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        async with self._lock:
            self._subscribers[queue] = {
                "user_id": user.id,
                "role": user.role,
            }
        logger.debug(
            "Subscriber mới đăng ký SSE: user_id=%s, role=%s. Tổng subscriber: %s",
            user.id,
            user.role,
            len(self._subscribers),
        )
        return queue

    async def unsubscribe(self, queue: asyncio.Queue) -> None:
        """Hủy đăng ký và giải phóng queue subscriber khỏi bộ nhớ để chống rò rỉ (memory leak)."""
        async with self._lock:
            if queue in self._subscribers:
                del self._subscribers[queue]
                logger.debug(
                    "Đã giải phóng subscriber SSE khỏi bộ nhớ. Còn lại: %s",
                    len(self._subscribers),
                )

    def get_subscriber_count(self) -> int:
        """Trả về số lượng subscriber hiện tại trong bộ nhớ (dùng kiểm tra dọn dẹp kết nối)."""
        return len(self._subscribers)

    async def broadcast_connector_status_change(
        self,
        station_id: int,
        charge_point_id: int,
        connector_id: int,
        status: str,
        operator_id: Optional[int] = None,
        timestamp: Optional[str] = None,
        extra: Optional[Dict[str, Any]] = None,
    ) -> int:
        """Phát sự kiện thay đổi trạng thái đầu nối tới các subscriber đủ thẩm quyền.

        - Admin: nhận toàn bộ sự kiện.
        - Operator: chỉ nhận nếu operator_id == user.id.

        Trả về số lượng client nhận được sự kiện thành công.
        """
        if not timestamp:
            timestamp = datetime.now(timezone.utc).isoformat()

        payload = {
            "event": "connector_status_changed",
            "station_id": station_id,
            "charge_point_id": charge_point_id,
            "connector_id": connector_id,
            "status": status,
            "timestamp": timestamp,
            **(extra or {}),
        }

        async with self._lock:
            subscribers_snapshot = list(self._subscribers.items())

        delivered_count = 0
        for queue, meta in subscribers_snapshot:
            user_id = meta["user_id"]
            role = meta["role"]

            # Kiểm tra phân quyền RBAC
            can_receive = (role == "ADMIN") or (
                operator_id is not None and operator_id == user_id
            )

            if can_receive:
                try:
                    queue.put_nowait(payload)
                    delivered_count += 1
                except asyncio.QueueFull:
                    logger.warning(
                        "Queue của subscriber user_id=%s bị đầy, bỏ qua sự kiện.",
                        user_id,
                    )

        return delivered_count


# Singleton instance quản lý SSE toàn ứng dụng
sse_broadcaster = StationEventBroadcaster()
