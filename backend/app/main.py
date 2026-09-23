from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router

app = FastAPI(
    title="EV CSMS - Nền tảng Quản lý Trạm Sạc Xe Điện",
    description="Hệ thống Backend FastAPI cho EV CSMS",
    version="1.0.0",
)

# Cấu hình CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gắn Router xác thực
app.include_router(auth_router, prefix="/api/v1")
app.include_router(auth_router)  # Hỗ trợ cả đường dẫn /auth

# Gắn Router charge points
from app.api.charge_points import router as charge_points_router
app.include_router(charge_points_router, prefix="/api/v1/charge-points", tags=["Charge Points"])


@app.get("/")
def health_check():
    """Trang chủ dùng làm health check."""
    return {"status": "ok", "service": "ev-csms-backend"}
