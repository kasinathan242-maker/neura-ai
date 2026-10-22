"""Configuration settings for NEURA AI Background Workers (Dramatiq)."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkerSettings(BaseSettings):
    """Configuration settings for services/workers."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ENVIRONMENT: str = Field(default="production")
    DEBUG: bool = Field(default=False)
    LOG_LEVEL: str = Field(default="INFO")
    APP_NAME: str = Field(default="neura-workers")

    REDIS_URL: str = Field(
        default="redis://:neura_redis_pass_2026@localhost:6379/1"
    )
    DATABASE_URL: str = Field(
        default="postgresql://neura_admin:neura_secure_pass_2026@localhost:5432/neura_db"
    )
    MINIO_ENDPOINT: str = Field(default="localhost:9000")
    WORKER_CONCURRENCY: int = Field(default=4)


settings = WorkerSettings()
