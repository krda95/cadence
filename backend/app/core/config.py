from functools import lru_cache

from pydantic import PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Cadence API"
    environment: str = "development"
    debug: bool = True

    frontend_url: str = "http://localhost:4200"
    database_url: PostgresDsn

    supabase_url: str
    supabase_api_key: str

    supabase_service_role_key: str
    supabase_avatar_bucket: str = "avatars"

    openai_api_key: str
    openai_model: str = "gpt-5-mini"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
