from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://postgres:1234@localhost:5432/sprint1_db"
    secret_key: str = "doi-secret-nay-trong-production-ev-csms-secret-key-super-secure"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    session_cookie_name: str = "session_token"
    max_failed_logins: int = 5
    lockout_duration_minutes: int = 15

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()