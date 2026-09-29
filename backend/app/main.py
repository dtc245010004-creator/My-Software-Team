from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
<<<<<<< Updated upstream
=======
from fastapi.routing import APIRoute, Match
from app.api.deps import get_current_user, get_current_user_or_driver_guest, get_optional_current_user
from app.core.config import settings
from app.core.websocket import ws_manager
from app.api.v1 import api_router
>>>>>>> Stashed changes

from app.api.auth import router as auth_router
from app.core.rbac import RBACMiddleware, roles
from app.routers.rbac_test import router as rbac_router

<<<<<<< Updated upstream
=======

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Vòng đời khởi động và kết thúc của ứng dụng FastAPI."""
    logger.info(f"Khởi động {settings.PROJECT_NAME} v{settings.VERSION}")
    logger.info("Loại cơ sở dữ liệu: %s", settings.DATABASE_URL.split(":", 1)[0])
    logger.info(f"CORS cho phép các nguồn: {settings.BACKEND_CORS_ORIGINS}")
    
    # Tạo schema tự động chỉ cho SQLite local; staging dùng Alembic trước khi chạy app.
    from app.core.database import Base, engine, SessionLocal
    import app.models  # noqa: F401
    if settings.AUTO_CREATE_SCHEMA:
        Base.metadata.create_all(bind=engine)
        logger.info("Đã đồng bộ schema CSDL local qua Base.metadata.create_all")

    from app.models.auth import UserRole
    from app.models.user import User
    from app.core.security import get_password_hash
    from app.services.rbac_service import assign_user_role, ensure_role_catalog
    with SessionLocal() as db:
        roles = ensure_role_catalog(db)
        for code, role in roles.items():
            for user in db.query(User).filter(User.role == code).all():
                assignment = db.query(UserRole).filter_by(user_id=user.id, role_id=role.id).first()
                if assignment is None:
                    db.add(UserRole(user_id=user.id, role_id=role.id))
        bootstrap_accounts = [
            (
                settings.BOOTSTRAP_ADMIN_EMAIL,
                settings.BOOTSTRAP_ADMIN_USERNAME,
                settings.BOOTSTRAP_ADMIN_PASSWORD,
                "ADMIN",
            ),
            (
                settings.BOOTSTRAP_STATION_OWNER_EMAIL,
                settings.BOOTSTRAP_STATION_OWNER_USERNAME,
                settings.BOOTSTRAP_STATION_OWNER_PASSWORD,
                "STATION_OWNER",
            ),
        ]
        for email, username, password, role_code in bootstrap_accounts:
            if not (email and username and password):
                continue
            account = db.query(User).filter((User.email == email) | (User.username == username)).first()
            if account is not None:
                continue
            user = User(
                email=email,
                username=username,
                full_name="Tài khoản khởi tạo",
                password_hash=get_password_hash(password),
                role=role_code,
                is_active=True,
            )
            db.add(user)
            db.flush()
            assign_user_role(db, user, role_code)
        db.commit()
        db.commit()

    # Phục hồi các phiên sạc bị gián đoạn nếu server crash trước đó (Crash Reconciliation)
    from app.services.session_service import reconcile_interrupted_sessions
    with SessionLocal() as db:
        reconciled = reconcile_interrupted_sessions(db)
        if reconciled > 0:
            logger.warning(f"Đã phục hồi và đóng {reconciled} phiên sạc mồ côi do server crash.")

    # Liên kết Main AsyncIO Event Loop cho Simulator Manager
    import asyncio
    from app.simulator.charging_simulator import simulator_manager
    simulator_manager.set_main_loop(asyncio.get_running_loop())

    # Khởi động dịch vụ lập lịch phân tích AI định kỳ (Slow Loop) ngoài môi trường pytest
    import os
    from app.services.scheduler_service import start_scheduler, stop_scheduler
    is_testing = os.environ.get("PYTEST_CURRENT_TEST") is not None
    if not is_testing:
        start_scheduler()

    yield
    if not is_testing:
        stop_scheduler()
    logger.info("Đang tắt ứng dụng EV CSMS...")



# Khởi tạo ứng dụng FastAPI
>>>>>>> Stashed changes
app = FastAPI(
    title="EV CSMS - Nền tảng Quản lý Trạm Sạc Xe Điện",
    description="Hệ thống Backend FastAPI cho EV CSMS",
    version="1.0.0",
)


<<<<<<< Updated upstream
# RBAC Middleware
app.add_middleware(RBACMiddleware)
=======

PUBLIC_API_ROUTES = {
    ("POST", "/api/v1/auth/register"),
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/logout"),
    ("GET", "/api/v1/health"),
}


def _route_has_access_policy(dependant) -> bool:
    if dependant.call in (get_current_user, get_current_user_or_driver_guest, get_optional_current_user):
        return True
    return any(_route_has_access_policy(child) for child in dependant.dependencies)


@app.middleware("http")
async def deny_unclassified_api_routes(request, call_next):
    """Mặc định chặn route API mới cho đến khi có dependency quyền hoặc khai công khai."""
    if request.url.path.startswith("/api/v1/") and request.method != "OPTIONS":
        matched_route = None
        for route in app.router.routes:
            if isinstance(route, APIRoute):
                match, _ = route.matches(request.scope)
                if match == Match.FULL:
                    matched_route = route
                    break
        if matched_route and not _route_has_access_policy(matched_route.dependant):
            policy_key = (request.method, matched_route.path)
            if policy_key not in PUBLIC_API_ROUTES:
                from fastapi.responses import JSONResponse

                return JSONResponse(
                    status_code=403,
                    content={"detail": "Route chưa khai báo quyền truy cập."},
                )
    return await call_next(request)

# Đăng ký API router v1
app.include_router(api_router)
>>>>>>> Stashed changes


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