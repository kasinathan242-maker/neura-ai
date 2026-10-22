"""Configuration settings for NEURA AI Speech Service (STT, TTS, VAD)."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class SpeechSettings(BaseSettings):
    """Configuration settings for services/speech."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ENVIRONMENT: str = Field(default="production")
    DEBUG: bool = Field(default=False)
    LOG_LEVEL: str = Field(default="INFO")
    APP_NAME: str = Field(default="neura-speech")

    # STT (faster-whisper)
    WHISPER_MODEL_SIZE: str = Field(default="small")
    WHISPER_DEVICE: str = Field(default="cpu")  # "cpu" or "cuda"
    WHISPER_COMPUTE_TYPE: str = Field(default="int8")  # "int8", "float16", "int8_float16"

    # TTS (Piper ONNX)
    PIPER_EN_VOICE_PATH: str = Field(default="models/voices/en_US-lessac-medium.onnx")
    PIPER_TA_VOICE_PATH: str = Field(default="models/voices/ta_IN-indic-medium.onnx")

    # Silero VAD
    SILERO_VAD_THRESHOLD: float = Field(default=0.5)


settings = SpeechSettings()
