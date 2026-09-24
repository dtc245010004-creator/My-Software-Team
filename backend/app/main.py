from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.routers.rbac_test import router as rbac_router
from app.api.auth import router as auth_router
from app.core.rbac import RBACMiddleware, roles

app = FastAPI(
    title="EV CSMS - Nền tảng Quản lý Trạm Sạc Xe Điện",
    description="Hệ thống Backend FastAPI cho EV CSMS",
    version="1.0.0",
)


# RBAC Middleware
app.add_middleware(RBACMiddleware)


# Cấu hình CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Gắn Router xác thực
app.include_router(auth_router, prefix="/api/v1")


# Gắn Router kiểm tra RBAC
app.include_router(rbac_router)

# Gắn Router charge points
from app.api.charge_points import router as charge_points_router

app.include_router(charge_points_router, prefix="/api/v1/charge-points", tags=["Charge Points"])


@app.get("/")
@roles("public")
def health_check():
    """Trang chủ dùng làm health check."""
    return {
        "status": "ok",
        "service": "ev-csms-backend",
    }


@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    """Stub WebSocket endpoint cho telemetry trụ sạc ảo.
    Echo lại message từ client + ping định kỳ để giữ kết nối.
    """
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"echo: {data}")
    except WebSocketDisconnect:
        pass