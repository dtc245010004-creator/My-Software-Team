from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://postgres:1234@localhost:5432/sprint1_db"
    secret_key: str = "doi-secret-nay-trong-production-ev-csms-secret-key-super-secure"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    session_cookie_name: str = "session_token"
    max_failed_logins: int = 5
    lockout_duration_minutes: int = 15

<<<<<<< Updated upstream
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
=======
    PROJECT_NAME: str = "EV Charging Station Management System"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # JWT & Password Hashing
    SECRET_KEY: str = "supersecret_ev_csms_key_for_development_jwt_auth_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 giờ
    BCRYPT_ROUNDS: int = 12
    COOKIE_SECURE: bool = False
    AUTO_CREATE_SCHEMA: bool = True
    BOOTSTRAP_ADMIN_EMAIL: str = ""
    BOOTSTRAP_ADMIN_USERNAME: str = ""
    BOOTSTRAP_ADMIN_PASSWORD: str = ""
    BOOTSTRAP_STATION_OWNER_EMAIL: str = ""
    BOOTSTRAP_STATION_OWNER_USERNAME: str = ""
    BOOTSTRAP_STATION_OWNER_PASSWORD: str = ""

    # Ví tiền & Ràng buộc tài chính (ACID)
    MIN_START_BALANCE: int = 50000  # 50,000 VND để bắt đầu sạc
    NEGATIVE_BALANCE_LIMIT: int = -300000  # -300,000 VND hạn mức cho nợ
    MAX_SAFE_DEBT_LIMIT: int = -1000000  # -1,000,000 VND cho CheckConstraint CSDL

    # Cơ sở dữ liệu: SQLite local (Giai đoạn 1 MVP)
    DATABASE_URL: str = "sqlite:///./ev_csms.db"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
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

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )
>>>>>>> Stashed changes


settings = Settings()