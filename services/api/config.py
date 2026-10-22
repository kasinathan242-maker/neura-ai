"""Configuration settings for NEURA AI Core API Service."""


from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class APISettings(BaseSettings):
    """Production configuration settings for services/api."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # General
    ENVIRONMENT: str = Field(default="production")
    DEBUG: bool = Field(default=False)
    LOG_LEVEL: str = Field(default="INFO")
    APP_NAME: str = Field(default="neura-api")
    API_V1_STR: str = Field(default="/api/v1")
    CORS_ORIGINS: list[str] = Field(default=["*"])

    # Database
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://neura_admin:neura_secure_pass_2026@localhost:5432/neura_db"
    )
    DATABASE_SYNC_URL: str = Field(
        default="postgresql://neura_admin:neura_secure_pass_2026@localhost:5432/neura_db"
    )
    POSTGRES_POOL_SIZE: int = Field(default=20)
    POSTGRES_MAX_OVERFLOW: int = Field(default=10)

    # Redis
    REDIS_URL: str = Field(
        default="redis://:neura_redis_pass_2026@localhost:6379/0"
    )

    # MinIO
    MINIO_ENDPOINT: str = Field(default="localhost:9000")
    MINIO_ROOT_USER: str = Field(default="neura_minio_admin")
    MINIO_ROOT_PASSWORD: str = Field(default="neura_minio_secret_2026")
    MINIO_USE_SSL: bool = Field(default=False)
    MINIO_DOCUMENTS_BUCKET: str = Field(default="neura-documents")

    # Security
    JWT_SECRET_KEY: str = Field(
        default="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    )
    JWT_REFRESH_SECRET_KEY: str = Field(
        default="abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
    )
    JWT_ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=15)
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7)
    ARGON2_TIME_COST: int = Field(default=3)
    ARGON2_MEMORY_COST: int = Field(default=65536)
    ARGON2_PARALLELISM: int = Field(default=4)

    # Internal Microservices
    INFERENCE_SERVICE_URL: str = Field(default="http://localhost:8001")
    SPEECH_SERVICE_URL: str = Field(default="http://localhost:8002")

    # Safety
    TELE_MANAS_HELPLINE: str = Field(default="14416")


settings = APISettings()
