import json
import os

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Cấu hình ứng dụng EV CSMS nạp từ biến môi trường."""

    PROJECT_NAME: str = "EV Charging Station Management System"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # JWT & Password Hashing
    SECRET_KEY: str = (
        "supersecret_ev_csms_key_for_development_jwt_auth_change_in_production"
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 giờ
    BCRYPT_ROUNDS: int = 12

    # Khóa tạm khi đăng nhập sai nhiều lần (Brute-Force Protection)
    MAX_FAILED_LOGIN_ATTEMPTS: int = 5  # Số lần đăng nhập sai tối đa trước khi khóa
    LOCKOUT_DURATION_MINUTES: int = 15  # Thời gian khóa tạm thời (phút)

    # Ví tiền & Ràng buộc tài chính (ACID)
    MIN_START_BALANCE: int = 50000  # 50,000 VND để bắt đầu sạc
    MIN_WALLET_BALANCE_TO_START_SESSION: int = 50000  # Ngưỡng số dư ví tối thiểu (S-38 / SCRUM-261)
    NEGATIVE_BALANCE_LIMIT: int = -300000  # -300,000 VND hạn mức cho nợ
    MAX_SAFE_DEBT_LIMIT: int = -500000  # -500,000 VND cho CheckConstraint CSDL
    RECONCILE_INTERVAL_MINUTES: int = Field(default=15, gt=0)
    IDLE_FEE_MAX_MINUTES: int = Field(
        default=240, ge=0
    )  # Trần số phút được tính phí chiếm trụ mỗi phiên
    ALLOW_REMOTE_START_SIMULATION: bool = False
    TESTING: bool = False
    ENVIRONMENT: str = "development"

    # Cổng thanh toán Sandbox & Webhook (S-35)
    TOPUP_MIN_AMOUNT: int = 10000
    TOPUP_MAX_AMOUNT: int = 50000000
    SANDBOX_PAYMENT_SECRET: str = "sandbox_secret"
    PAYMENT_WEBHOOK_SECRET: str = "sandbox_secret"
    ALLOW_PAYMENT_SANDBOX_SIMULATION: bool = False

    # Cơ sở dữ liệu: SQLite local (Giai đoạn 1 MVP)
    DATABASE_URL: str = "sqlite:///./ev_csms.db"

    # CORS
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            if v.startswith("["):
                return json.loads(v)
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    # AI Engine (Google Gemini)
    GEMINI_API_KEY: str = ""
    AI_MODEL_NAME: str = "gemini-1.5-flash"

    # Mô phỏng sạc (Simulator)
    SIMULATOR_INTERVAL_SECONDS: int = 2

    # OCPP 1.6J
    HEARTBEAT_INTERVAL_SECONDS: int = 300
    STATION_NEARBY_DEFAULT_LIMIT: int = Field(default=20, ge=1)
    STATION_NEARBY_MAX_LIMIT: int = Field(default=50, ge=1)
    OCPP_CALL_TIMEOUT_SECONDS: float = 30.0
    ABNORMAL_SESSION_THRESHOLD_SECONDS: int = 500
    REBALANCE_MIN_INTERVAL_SECONDS: int = Field(default=5, gt=0)
    DATA_ERASURE_IDENTIFIER_PREFIX: str = Field(
        default="deleted", min_length=1, max_length=30
    )

    # Cảnh báo trạm & trụ sạc (Story 2: SCRUM-317, SCRUM-319)
    CHARGER_OFFLINE_ALERT_MINUTES: int = 15
    CONNECTOR_ERROR_ALERT_THRESHOLD: int = 5
    CONNECTOR_ERROR_WINDOW_MINUTES: int = 15
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_TLS: bool = True
    ALERT_EMAIL_FROM: str = "alerts@evcsms.vn"
    ALERT_EMAIL_ADMINS: str = "admin@evcsms.vn"

    model_config = SettingsConfigDict(
        env_file=os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"
        ),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
