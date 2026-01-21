from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from .routes import auth, categories, transactions, stripe as stripe_routes, insights, recurring, admin
from .webhooks import stripe as stripe_webhooks, whatsapp as whatsapp_webhooks
from .models.database import Base
from .core.dependencies import engine
from .core.limiter import limiter
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
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
allowed_origins = allowed_origins_str.split(',')

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if allowed_origins != ['*'] else ['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*']
)

# Incluir rotas
app.include_router(auth.router)
app.include_router(categories.router)
app.include_router(transactions.router)
app.include_router(insights.router)
app.include_router(recurring.router)
app.include_router(admin.router)
app.include_router(stripe_routes.router)
app.include_router(stripe_webhooks.router)
app.include_router(whatsapp_webhooks.router)

@app.get('/')
@limiter.limit('5/minute')
async def root(request: Request):
    return {'message': 'Bem-vindo à API de Gestão Financeira'}

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000)

