"""Configuration settings for NEURA AI Self-Hosted Inference Service."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class InferenceSettings(BaseSettings):
    """Configuration settings for services/inference."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ENVIRONMENT: str = Field(default="production")
    DEBUG: bool = Field(default=False)
    LOG_LEVEL: str = Field(default="INFO")
    APP_NAME: str = Field(default="neura-inference")

    # Local model directories
    MODELS_DIR: str = Field(default="models")
    NEURA_LM_MODEL_PATH: str = Field(default="models/neura-lm-1.5b-q4_k_m.gguf")
    NEURA_EMBED_MODEL_PATH: str = Field(default="models/neura-embed-small")

    # llama.cpp server configuration
    LLAMA_N_CTX: int = Field(default=4096)
    LLAMA_N_THREADS: int = Field(default=4)
    LLAMA_N_GPU_LAYERS: int = Field(default=0)  # 0 for CPU fallback, > 0 for CUDA offload

    # Saturation and backpressure queue
    INFERENCE_MAX_CONCURRENT_REQUESTS: int = Field(default=8)
    INFERENCE_REQUEST_TIMEOUT_SECONDS: int = Field(default=60)


settings = InferenceSettings()
