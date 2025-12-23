from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "NEURA AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "mistral"  # Default model
    
    class Config:
        case_sensitive = True

settings = Settings()
