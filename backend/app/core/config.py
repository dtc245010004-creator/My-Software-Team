from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://csms:csms@localhost:5432/csms"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()