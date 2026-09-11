from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "Neo ERP"
    API_V1_STR: str = "/api/v1"
    
    # PRODUCT SKU CONFIGURATION
    PRODUCT_SKU_PREFIX: str = "PRD"
    PRODUCT_SKU_SEQUENCE_DIGITS: int = 6

    # DATABASE
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: str = "5432"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "Pegaso#26"
    POSTGRES_DB: str = "morpheus"
    
    GEMINI_API_KEY: Optional[str] = None
    GOOGLE_API_KEY: Optional[str] = None

    # WHATSAPP CLOUD API
    WHATSAPP_VERIFY_TOKEN: str = "morpheus_wa_verify_2026"
    WHATSAPP_APP_SECRET: Optional[str] = "morpheus_wa_secret_2026"
    WHATSAPP_PHONE_NUMBER_ID: Optional[str] = None
    WHATSAPP_ACCESS_TOKEN: Optional[str] = None
    
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "ignore"

settings = Settings()
