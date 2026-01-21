from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from .routes import auth, categories, transactions, stripe as stripe_routes, insights, recurring, admin, goals
from .webhooks import stripe as stripe_webhooks, whatsapp as whatsapp_webhooks, telegram as telegram_webhooks
from .models.database import Base, SystemSetting
from .core.dependencies import engine, get_db
from .core.limiter import limiter
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from sqlalchemy.orm import Session
import logging
import os

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('security.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('FinanZenAPI')

# Criar tabelas no banco de dados
Base.metadata.create_all(bind=engine)

app = FastAPI(title='FinanZen - Gestão Financeira Pessoal API')
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configuração de CORS
allowed_origins_str = os.getenv('ALLOWED_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000')
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(',') if origin.strip()]

# Em produção, nunca permitir '*' com allow_credentials=True
environment = os.getenv('ENVIRONMENT', 'development')
if environment == 'production' and ('*' in allowed_origins or not allowed_origins):
    logger.warning("CORS configurado de forma insegura para produção! Configurando origens padrão.")
    allowed_origins = ['https://finanzen.pt']  # Ajustar para o domínio real

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allow_headers=['*'],
    expose_headers=['*']
)

# Incluir rotas
app.include_router(auth.router)
app.include_router(categories.router)
app.include_router(transactions.router)
app.include_router(insights.router)
app.include_router(recurring.router)
app.include_router(admin.router)
app.include_router(goals.router)
app.include_router(stripe_routes.router)
app.include_router(stripe_webhooks.router)
app.include_router(whatsapp_webhooks.router)
app.include_router(telegram_webhooks.router)

# Novo endpoint público para as definições básicas do sistema
@app.get('/api/settings/public')
async def get_public_settings(db: Session = Depends(get_db)):
    phone = db.query(SystemSetting).filter(SystemSetting.key == 'support_phone').first()
    return {"support_phone": phone.value if phone else "351925989577"}

@app.get('/')
@limiter.limit('5/minute')
async def root(request: Request):
    return {'message': 'Bem-vindo à API de Gestão Financeira'}

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000)
