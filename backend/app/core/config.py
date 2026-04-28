from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "Inventory ERP"
    API_V1_STR: str = "/api/v1"
    
    # PRODUCT SKU CONFIGURATION
    PRODUCT_SKU_PREFIX: str = "PROD"
    PRODUCT_SKU_SEQUENCE_DIGITS: int = 5

    # DATABASE
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: str = "5432"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "Pegaso#26"
    POSTGRES_DB: str = "morpheus"
    
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()
