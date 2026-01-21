from fastapi import APIRouter, Request, HTTPException, Depends, Header
from sqlalchemy.orm import Session
import requests
import json
import logging
import re
import hmac
import hashlib
from ..core.config import settings
from ..core.dependencies import get_db
from ..models import database as models
from datetime import datetime
from ..core.limiter import limiter

logger = logging.getLogger("telegram_webhook")

router = APIRouter(prefix='/telegram', tags=['webhooks'])

def validate_email(email: str) -> bool:
    """Valida formato de email"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))

def parse_with_keywords(text: str):
    """Tenta extrair valor e categoria usando Regex e Keywords de forma muito robusta"""
    orig_text = text
    text = text.lower().strip()
    
    # 1. Tentar encontrar o valor (ex: 12.50, 15, 10,50, 15e, 15eur)
    # Suporta: 15, 15.50, 15,50, 15€, 15e, 15eur, 15 euros
    valor_match = re.search(r'(\d+[.,]\d+|\d+)\s*(?:€|euro|euros|e|eur)?', text)
    if not valor_match:
        return None
    
    amount = float(valor_match.group(1).replace(',', '.'))
    
    # 2. Identificar se é despesa ou receita
    tipo = "expense"
    income_keywords = ['recebi', 'salário', 'ordenado', 'ganhei', 'vendi', 'rendimento', 'bonus', 'vencimento', 'reembolso', 'subsídio']
    if any(k in text for k in income_keywords):
        tipo = "income"
    
    # 3. Dicionário gigante de Categorias e Keywords
    keywords = {
        "Alimentação": [
            'almoço', 'jantar', 'comida', 'restaurante', 'café', 'lanche', 'pingo doce', 'continente', 
            'mercado', 'supermercado', 'uber eats', 'bolt food', 'padaria', 'pastelaria', 'takeaway', 
            'mercearia', 'lidl', 'aldi', 'auchan', 'minipreço', 'fruta', 'talho', 'peixaria', 'mc', 
            'mcdonalds', 'burger king', 'pizza', 'sushi', 'brunch'
        ],
        "Transportes": [
            'gasolina', 'gasóleo', 'combustível', 'uber', 'bolt', 'autocarro', 'metro', 'comboio', 
            'passe', 'estacionamento', 'via verde', 'portagem', 'oficina', 'pneus', 'inspeção', 
            'reparação', 'revisão', 'cp', 'carris', 'stcp', 'fertagus', 'gira', 'trotinete'
        ],
        "Lazer": [
            'cinema', 'concerto', 'bar', 'festa', 'viagem', 'férias', 'jogo', 'gaming', 'netflix', 
            'spotify', 'hbo', 'disney', 'bilhete', 'museu', 'teatro', 'livro', 'fnac', 'worten', 
            'estádio', 'futebol', 'ginásio', 'gym', 'crossfit', 'padel', 'tenis'
        ],
        "Saúde": [
            'farmácia', 'médico', 'consulta', 'hospital', 'dentista', 'exames', 'análises', 
            'óculos', 'lentes', 'fisioterapia', 'psicólogo', 'medicamento', 'cuf', 'luz saúde'
        ],
        "Habitação": [
            'renda', 'luz', 'água', 'gás', 'internet', 'net', 'tv', 'condomínio', 'móveis', 
            'ikea', 'leroy', 'limpeza', 'reparação casa', 'edp', 'galp', 'meo', 'nos', 'vodafone'
        ],
        "Educação": [
            'propina', 'escola', 'curso', 'livro', 'universidade', 'explicador', 'formação', 
            'udemy', 'coursera', 'workshop'
        ],
        "Roupa e Pessoal": [
            'roupa', 'sapatos', 'zara', 'hm', 'pull', 'bershka', 'nike', 'adidas', 'corte', 
            'barbeiro', 'cabeleireiro', 'suplementos', 'perfume', 'maquilhagem', 'primark'
        ],
        "Investimento": [
            'investimento', 'ações', 'crypto', 'bitcoin', 'etf', 'binance', 'degiro', 'revolut', 
            'corretora', 'trading', 'poupança', 'fundo'
        ],
        "Salário": ['salário', 'ordenado', 'vencimento', 'prémio']
    }
    
    category = "Outros"
    for cat, keys in keywords.items():
        if any(k in text for k in keys):
            category = cat
            break

    # 4. Limpar a descrição
    # Remove o valor e palavras de ligação comuns para deixar a descrição limpa
    clean_desc = orig_text
    words_to_remove = [
        valor_match.group(0), '€', 'euro', 'euros', 'eur', 'gastei', 'paguei', 'recebi', 
        'em', 'no', 'na', 'de', 'do', 'da', 'com', 'para'
    ]
    
    desc_words = clean_desc.split()
    final_desc_words = [w for w in desc_words if w.lower() not in words_to_remove]
    
    if final_desc_words:
        description = " ".join(final_desc_words).strip()
    else:
        description = orig_text.capitalize()

    return {
        "amount": amount,
        "description": description[:40], # Limite de 40 carateres
        "type": tipo,
        "category": category
    }

@router.post('/webhook')
@limiter.limit('30/minute')
async def telegram_webhook(
    request: Request, 
    db: Session = Depends(get_db),
    x_telegram_bot_api_secret_token: str | None = Header(None)
):
    """Webhook Telegram com validação de segurança"""
    try:
        # Validação básica do secret token (se configurado)
        if settings.TELEGRAM_WEBHOOK_SECRET:
            if not x_telegram_bot_api_secret_token or x_telegram_bot_api_secret_token != settings.TELEGRAM_WEBHOOK_SECRET:
                logger.warning("Tentativa de acesso ao webhook sem token válido")
                raise HTTPException(status_code=403, detail="Unauthorized")
        
        data = await request.json()
        
        # Log apenas informação não sensível
        logger.info(f"Webhook Telegram recebido - tipo: {data.get('message', {}).get('text', '')[:50] if 'message' in data else 'sem mensagem'}")
        
        if 'message' not in data:
            return {'status': 'ignored'}
            
        message = data['message']
        chat_id = message['chat']['id']
        text = message.get('text', '').strip()
        
        if text.startswith('/start'):
            welcome_msg = (
                "🧘‍♂️ *Bem-vindo ao Ecossistema FinanZen.*\n\n"
                "Sou o teu assistente inteligente para gestão financeira. Para sincronizarmos a tua jornada Zen, "
                "por favor envia o **email** que utilizas na nossa plataforma.\n\n"
                "_A partir daí, poderei registar as tuas despesas instantaneamente._"
            )
            send_telegram_msg(chat_id, welcome_msg)
            return {'status': 'ok'}

        # Lógica de Email com validação robusta
        if "@" in text and "." in text:
            email_limpo = text.lower().replace(" ", "").strip()
            
            # Validar formato de email
            if not validate_email(email_limpo):
                send_telegram_msg(chat_id, "⚠️ Por favor, envia um email válido.")
                return {'status': 'invalid_email'}
            
            user = db.query(models.User).filter(models.User.email == email_limpo).first()
            
            # Resposta genérica para prevenir email enumeration
            if user:
                user.phone_number = f"tg_{chat_id}"
                db.commit()
                send_telegram_msg(chat_id, f"✅ Conta associada com sucesso!\n\nPodes mandar mensagens como 'Almoço 15€' ou fotos de recibos.")
                logger.info(f"Conta Telegram associada: {email_limpo[:5]}*** (chat_id: {chat_id})")
                return {'status': 'ok'}
            else:
                # Resposta genérica mesmo quando não encontra
                send_telegram_msg(chat_id, "✅ Email recebido. Se estiver associado a uma conta, já podes começar a usar o bot.")
                logger.warning(f"Tentativa de associação com email não registado: {email_limpo[:5]}***")
                return {'status': 'not_found'}
        
        # Procurar User
        user = db.query(models.User).filter(models.User.phone_number == f"tg_{chat_id}").first()
        if not user:
            send_telegram_msg(chat_id, "⚠️ Manda o teu email primeiro.")
            return {'status': 'unauthorized'}

        workspace = db.query(models.Workspace).filter(models.Workspace.owner_id == user.id).first()
        transaction_data = None
        
        # --- PROCESSAMENTO ---
        if 'photo' in message:
            # Processamento de imagens removido (IA desativada)
            send_telegram_msg(chat_id, "❌ Processamento de imagens indisponível. Por favor, escreve a transação em texto.\n\nExemplo: 'Almoço 15€'")
            return {'status': 'error'}
        
        elif text:
            # Apenas parsing por keywords (sem IA)
            transaction_data = parse_with_keywords(text)
            
            if not transaction_data:
                send_telegram_msg(chat_id, "❌ Não consegui entender a mensagem. Tenta formatos como:\n- 'Almoço 15€'\n- 'Gasolina 50€'\n- 'Recebi 500€'")
                return {'status': 'error'}

        # --- GUARDAR ---
        if transaction_data:
            cat_name = transaction_data.get('category', 'Outros')
            category = db.query(models.Category).filter(
                models.Category.workspace_id == workspace.id,
                models.Category.name.ilike(f"%{cat_name}%")
            ).first()
            
            if not category:
                category = db.query(models.Category).filter(
                    models.Category.workspace_id == workspace.id,
                    models.Category.type == transaction_data.get('type', 'expense')
                ).first()

            amount_cents = int(float(transaction_data['amount']) * 100)
            if transaction_data['type'] == 'expense': amount_cents = -abs(amount_cents)
            else: amount_cents = abs(amount_cents)

            new_trans = models.Transaction(
                workspace_id=workspace.id,
                category_id=category.id if category else None,
                amount_cents=amount_cents,
                description=transaction_data.get('description', 'Telegram'),
                transaction_date=datetime.now().date()
            )
            db.add(new_trans)
            db.commit()

            tipo_emoji = "💸" if amount_cents < 0 else "💰"
            send_telegram_msg(chat_id, f"{tipo_emoji} *Registado!*\n\n📝 {transaction_data['description']}\n💰 {abs(transaction_data['amount']):.2f}€\n🏷️ {category.name if category else 'Outros'}")

        return {'status': 'success'}
    except Exception as e:
        logger.error(f"Erro Telegram: {str(e)}")
        return {'status': 'error'}

def send_telegram_msg(chat_id: int, text: str):
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    requests.post(url, json={'chat_id': chat_id, 'text': text, 'parse_mode': 'Markdown'})
