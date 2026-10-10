import json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.core.config import settings
from app.core.websocket import ws_manager
from app.ocpp.gateway import router as ocpp_router
from app.routers.admin_users import router as admin_users_router

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

    # Khởi tạo bảng dữ liệu ban đầu cho môi trường phát triển (sẽ chuyển sang Alembic ở Bước 07)
    import app.models  # noqa: F401
    from app.core.database import Base, SessionLocal, engine

    Base.metadata.create_all(bind=engine)
    logger.info("Đã đồng bộ schema CSDL qua Base.metadata.create_all")

    if os.getenv("ENABLE_DEMO_ACCOUNTS", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }:
        from app.services.compose_schema_service import upgrade_compose_sqlite_schema
        from app.services.demo_account_service import ensure_demo_accounts

        added_columns = upgrade_compose_sqlite_schema(engine)
        if added_columns:
            logger.info(
                "Đã nâng bổ sung schema SQLite phát triển: %s",
                ", ".join(added_columns),
            )

        with SessionLocal() as db:
            created_accounts = ensure_demo_accounts(db)
        logger.info(
            "Đã đồng bộ tài khoản demo phát triển (mới tạo %s tài khoản).",
            created_accounts,
        )

    # Phục hồi các phiên sạc bị gián đoạn nếu server crash trước đó (Crash Reconciliation)
    from app.services.session_service import reconcile_interrupted_sessions

    with SessionLocal() as db:
        reconciled = reconcile_interrupted_sessions(db)
        if reconciled > 0:
            logger.warning(
                f"Đã phục hồi và đóng {reconciled} phiên sạc mồ côi do server crash."
            )

    # Liên kết Main AsyncIO Event Loop cho Simulator Manager
    import asyncio

    from app.simulator.charging_simulator import simulator_manager

    simulator_manager.set_main_loop(asyncio.get_running_loop())

    # Khởi động dịch vụ lập lịch phân tích AI định kỳ (Slow Loop) ngoài môi trường pytest
    from app.services.scheduler_service import start_scheduler, stop_scheduler

    is_testing = os.environ.get("PYTEST_CURRENT_TEST") is not None
    if not is_testing:
        start_scheduler()

    yield
    if not is_testing:
        stop_scheduler()
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
app.include_router(admin_users_router, prefix="/api/v1")
app.include_router(ocpp_router)


@app.get("/", summary="Trang chủ API")
def root():
    """Thông tin tổng quan dịch vụ."""
    return {
        "status": "ok",
        "service": "ev-csms-backend",

        "message": f"Chào mừng đến với {settings.PROJECT_NAME}",
        "version": settings.VERSION,
        "docs": "/docs",
        "health": f"{settings.API_V1_STR}/health",
        "websocket": "/ws/telemetry",
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
            text_data = await websocket.receive_text()
            text_strip = text_data.strip()
            if text_strip.lower() == "ping":
                await ws_manager.send_personal_message({"event": "PONG"}, websocket)
                continue

            try:
                msg = json.loads(text_strip)
                action = msg.get("action")
                session_id = msg.get("session_id")
                if action == "subscribe" and session_id is not None:
                    sid = int(session_id)
                    ws_manager.subscribe_session(websocket, sid)
                    await ws_manager.send_personal_message(
                        {"event": "SUBSCRIBED", "session_id": sid},
                        websocket,
                    )
                    from app.simulator.charging_simulator import simulator_manager

                    sim = simulator_manager.get_simulator(sid)
                    if sim:
                        await ws_manager.send_personal_message(
                            sim.to_telemetry_dict(), websocket
                        )
                elif action == "unsubscribe" and session_id is not None:
                    ws_manager.unsubscribe_session(websocket, int(session_id))
                    await ws_manager.send_personal_message(
                        {"event": "UNSUBSCRIBED", "session_id": int(session_id)},
                        websocket,
                    )
            except (json.JSONDecodeError, TypeError, ValueError) as exc:
                logger.debug("Bỏ qua telemetry control frame không hợp lệ: %s", exc)
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except (RuntimeError, OSError):
        logger.exception("Lỗi kết nối WebSocket")
        ws_manager.disconnect(websocket)
