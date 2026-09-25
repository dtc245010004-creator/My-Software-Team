import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.websocket import ws_manager
from app.api.v1 import api_router

# Thiết lập ghi log
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - [%(levelname)s] - %(name)s: %(message)s",
)
logger = logging.getLogger("ev_csms.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Vòng đời khởi động và kết thúc của ứng dụng FastAPI."""
    logger.info(f"Khởi động {settings.PROJECT_NAME} v{settings.VERSION}")
    logger.info(f"Cơ sở dữ liệu cấu hình: {settings.DATABASE_URL}")
    logger.info(f"CORS cho phép các nguồn: {settings.BACKEND_CORS_ORIGINS}")
    yield
    logger.info("Đang tắt ứng dụng EV CSMS...")


# Khởi tạo ứng dụng FastAPI
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="API quản lý mạng lưới trạm sạc xe điện, biểu giá TOU, ví tiền ACID và telemetry realtime",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Cấu hình Middleware CORS
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Đăng ký API router v1
app.include_router(api_router)


@app.get("/", summary="Trang chủ API")
def root():
    """Thông tin tổng quan dịch vụ."""
    return {
        "message": f"Chào mừng đến với {settings.PROJECT_NAME}",
        "version": settings.VERSION,
        "docs": "/docs",
        "health": f"{settings.API_V1_STR}/health",
        "websocket": "/ws/telemetry",
    }


@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """Kênh WebSocket truyền phát telemetry sạc xe thời gian thực."""
    await ws_manager.connect(websocket)
    try:
        # Gửi thông điệp chào mừng khi client kết nối thành công
        await ws_manager.send_personal_message(
            {
                "event": "CONNECTED",
                "message": "Kết nối kênh Telemetry EV CSMS thành công",
            },
            websocket,
        )

        while True:
            # Lắng nghe thông điệp từ client (heartbeat / ping)
            data = await websocket.receive_text()
            logger.debug(f"Nhận tin từ WS client: {data}")
            # Phản hồi pong nếu client gửi ping
            if data.strip().lower() == "ping":
                await ws_manager.send_personal_message({"event": "PONG"}, websocket)
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"Lỗi kết nối WebSocket: {e}")
        ws_manager.disconnect(websocket)
