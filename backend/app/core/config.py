import json
import os

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Cáº¥u hÃ¬nh á»©ng dá»¥ng EV CSMS náº¡p tá»« biáº¿n mÃ´i trÆ°á»ng."""

    PROJECT_NAME: str = "EV Charging Station Management System"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # JWT & Password Hashing
    SECRET_KEY: str = (
        "supersecret_ev_csms_key_for_development_jwt_auth_change_in_production"
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 giá»
    BCRYPT_ROUNDS: int = 12

    # KhÃ³a táº¡m khi Ä‘Äƒng nháº­p sai nhiá»u láº§n (Brute-Force Protection)
    MAX_FAILED_LOGIN_ATTEMPTS: int = 5  # Sá»‘ láº§n Ä‘Äƒng nháº­p sai tá»‘i Ä‘a trÆ°á»›c khi khÃ³a
    LOCKOUT_DURATION_MINUTES: int = 15  # Thá»i gian khÃ³a táº¡m thá»i (phÃºt)

    # VÃ­ tiá»n & RÃ ng buá»™c tÃ i chÃ­nh (ACID)
    MIN_START_BALANCE: int = 50000  # 50,000 VND Ä‘á»ƒ báº¯t Ä‘áº§u sáº¡c
    NEGATIVE_BALANCE_LIMIT: int = -300000  # -300,000 VND háº¡n má»©c cho ná»£
    MAX_SAFE_DEBT_LIMIT: int = (
        -500000
    )  # -500,000 VND cho CheckConstraint CSDL (khÃ³a á»Ÿ -300k, chá»‰ cho trÃ n tá»‘i Ä‘a 200k)
    IDLE_FEE_MAX_MINUTES: int = Field(
        default=240, ge=0
    )  # Tráº§n sá»‘ phÃºt Ä‘Æ°á»£c tÃ­nh phÃ­ chiáº¿m trá»¥ má»—i phiÃªn

    # CÆ¡ sá»Ÿ dá»¯ liá»‡u: SQLite local (Giai Ä‘oáº¡n 1 MVP)
    TOPUP_MIN_AMOUNT: int = 10000
    TOPUP_MAX_AMOUNT: int = 50000000
    SANDBOX_PAYMENT_SECRET: str = "sandbox_secret"

    # C s d liu: SQLite local (Giai on 1 MVP)
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

    # MÃ´ phá»ng sáº¡c (Simulator)
    SIMULATOR_INTERVAL_SECONDS: int = 2

    # OCPP 1.6J
    HEARTBEAT_INTERVAL_SECONDS: int = 300
    OCPP_CALL_TIMEOUT_SECONDS: float = 30.0
    ABNORMAL_SESSION_THRESHOLD_SECONDS: int = 500

    model_config = SettingsConfigDict(
        env_file=os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"
        ),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()

