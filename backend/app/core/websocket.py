import json
import logging
from typing import Any, Dict, List, Set
from fastapi import WebSocket

logger = logging.getLogger("ev_csms.websocket")


class ConnectionManager:
    """Quản lý các kết nối WebSocket realtime cho trạm sạc và bảng điều khiển (hỗ trợ phân kênh theo session)."""

    def __init__(self):
        # Danh sách toàn bộ các WebSocket client đang kết nối
        self.active_connections: List[WebSocket] = []
        # Phân kênh: session_id -> Set[WebSocket]
        self.session_subscriptions: Dict[int, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket):
        """Chấp nhận kết nối từ client."""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client kết nối. Tổng số kết nối: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        """Hủy đăng ký khi client ngắt kết nối và dọn dẹp mọi kênh subscription."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client ngắt kết nối. Còn lại: {len(self.active_connections)}")

        # Dọn dẹp khỏi các kênh phiên sạc
        for session_id, subs in list(self.session_subscriptions.items()):
            if websocket in subs:
                subs.remove(websocket)
            if not subs:
                self.session_subscriptions.pop(session_id, None)

    def subscribe_session(self, websocket: WebSocket, session_id: int) -> None:
        """Đăng ký lắng nghe telemetry của một phiên sạc cụ thể."""
        if session_id not in self.session_subscriptions:
            self.session_subscriptions[session_id] = set()
        self.session_subscriptions[session_id].add(websocket)
        logger.debug(f"Client đã subscribe phiên sạc #{session_id}")

    def unsubscribe_session(self, websocket: WebSocket, session_id: int) -> None:
        """Hủy đăng ký lắng nghe telemetry của một phiên sạc."""
        if session_id in self.session_subscriptions:
            self.session_subscriptions[session_id].discard(websocket)
            if not self.session_subscriptions[session_id]:
                del self.session_subscriptions[session_id]

    async def send_personal_message(self, message: Dict[str, Any], websocket: WebSocket):
        """Gửi thông điệp riêng cho 1 client."""
        try:
            await websocket.send_text(json.dumps(message, ensure_ascii=False))
        except Exception as e:
            logger.error(f"Lỗi gửi thông điệp riêng: {e}")

    async def broadcast_to_session(self, session_id: int, message: Dict[str, Any]):
        """Phát sóng thông số đo đếm telemetry độc quyền tới các client đang theo dõi phiên sạc đó."""
        subscribers = self.session_subscriptions.get(session_id, set())
        if not subscribers:
            return

        payload = json.dumps(message, ensure_ascii=False)
        disconnected = []

        for connection in subscribers:
            try:
                await connection.send_text(payload)
            except Exception as e:
                logger.warning(f"Lỗi gửi telemetry session #{session_id} tới client: {e}")
                disconnected.append(connection)

        for conn in disconnected:
            self.disconnect(conn)

    async def broadcast(self, message: Dict[str, Any]):
        """Phát sóng thông điệp chung tới toàn bộ client (cập nhật trạng thái trạm/trụ)."""
        if not self.active_connections:
            return

        payload = json.dumps(message, ensure_ascii=False)
        disconnected = []

        for connection in self.active_connections:
            try:
                await connection.send_text(payload)
            except Exception as e:
                logger.warning(f"Không thể gửi broadcast tới client: {e}")
                disconnected.append(connection)

        for connection in disconnected:
            self.disconnect(connection)


# Singleton instance toàn hệ thống
ws_manager = ConnectionManager()

