import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

load_dotenv()

class Settings(BaseSettings):
    PROJECT_NAME: str = 'SaaS Gestão Financeira'
    DATABASE_URL: str = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/saas_db')
    SECRET_KEY: str = os.getenv('SECRET_KEY', 'secret_key_super_secreta_para_desenvolvimento')
    ALGORITHM: str = 'HS256'
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    STRIPE_API_KEY: str = os.getenv('STRIPE_API_KEY', '')
    STRIPE_WEBHOOK_SECRET: str = os.getenv('STRIPE_WEBHOOK_SECRET', '')
    
    WHATSAPP_TOKEN: str = os.getenv('WHATSAPP_TOKEN', '')
    WHATSAPP_PHONE_NUMBER_ID: str = os.getenv('WHATSAPP_PHONE_NUMBER_ID', '')
    
    MAIL_USERNAME: str = os.getenv('MAIL_USERNAME', '').strip()
    MAIL_PASSWORD: str = os.getenv('MAIL_PASSWORD', '').strip()
    MAIL_FROM: str = os.getenv('MAIL_FROM', '').strip()
    MAIL_PORT: int = int(os.getenv('MAIL_PORT', 587))
    MAIL_SERVER: str = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False
    USE_CREDENTIALS: bool = True
    
    GOOGLE_CLIENT_ID: str = os.getenv('GOOGLE_CLIENT_ID', '')
    FRONTEND_URL: str = os.getenv('FRONTEND_URL', 'http://localhost:3000')

settings = Settings()

