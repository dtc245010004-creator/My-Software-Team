import json
import logging
from typing import Any, Dict, List
from fastapi import WebSocket

logger = logging.getLogger("ev_csms.websocket")


class ConnectionManager:
    """Quản lý các kết nối WebSocket realtime cho trạm sạc và bảng điều khiển."""

    def __init__(self):
        # Danh sách các WebSocket client đang kết nối
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        """Chấp nhận kết nối từ client."""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client kết nối. Tổng số kết nối: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        """Hủy đăng ký khi client ngắt kết nối."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client ngắt kết nối. Còn lại: {len(self.active_connections)}")

    async def send_personal_message(self, message: Dict[str, Any], websocket: WebSocket):
        """Gửi thông điệp riêng cho 1 client."""
        try:
            await websocket.send_text(json.dumps(message, ensure_ascii=False))
        except Exception as e:
            logger.error(f"Lỗi gửi thông điệp riêng: {e}")

    async def broadcast(self, message: Dict[str, Any]):
        """Phát sóng thông số đo đếm telemetry tới tất cả các client đang theo dõi."""
        if not self.active_connections:
            return

        payload = json.dumps(message, ensure_ascii=False)
        disconnected = []

        for connection in self.active_connections:
            try:
                await connection.send_text(payload)
            except Exception as e:
                logger.warning(f"Không thể gửi telemetry tới client: {e}")
                disconnected.append(connection)

        # Dọn dẹp các kết nối lỗi
        for connection in disconnected:
            self.disconnect(connection)


# Singleton instance toàn hệ thống
ws_manager = ConnectionManager()
