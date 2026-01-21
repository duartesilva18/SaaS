from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.orm import Session
import re
import requests
from ..core.config import settings
from ..core.dependencies import get_db
from ..models import database as models
from datetime import datetime

router = APIRouter(prefix='/webhooks', tags=['webhooks'])

TRANSACTION_REGEX = r'(\d+([.,]\d{2})?)'

@router.get('/whatsapp')
async def verify_whatsapp_webhook(request: Request):
    mode = request.query_params.get('hub.mode')
    token = request.query_params.get('hub.verify_token')
    challenge = request.query_params.get('hub.challenge')
    
    if mode == 'subscribe' and token == settings.WHATSAPP_TOKEN:
        return int(challenge)
    return HTTPException(status_code=403)

@router.post('/whatsapp')
async def whatsapp_webhook(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    
    try:
        entry = data['entry'][0]
        changes = entry['changes'][0]
        value = changes['value']
        message = value['messages'][0]
        
        from_phone = message['from']
        text = message['text']['body']
        
        user = db.query(models.User).filter(models.User.phone_number == from_phone).first()
        if not user:
            return {'status': 'user not found'}
            
        match = re.search(r'(\d+([.,]\d{2})?)', text)
        if match:
            amount_str = match.group(0).replace(',', '.')
            amount_cents = int(float(amount_str) * 100)
            
            description = text.replace(match.group(0), '').strip()
            if not description:
                description = 'Transação via WhatsApp'
                
            workspace = db.query(models.Workspace).filter(models.Workspace.owner_id == user.id).first()
            category = db.query(models.Category).filter(
                models.Category.workspace_id == workspace.id,
                models.Category.type == 'expense'
            ).first()
            
            if workspace and category:
                new_transaction = models.Transaction(
                    workspace_id=workspace.id,
                    category_id=category.id,
                    amount_cents=amount_cents,
                    description=description,
                    transaction_date=datetime.now().date()
                )
                db.add(new_transaction)
                db.commit()
                
                send_whatsapp_confirmation(
                    from_phone, 
                    f"✅ Registado: {description} ({amount_str} €)"
                )
                
        return {'status': 'success'}
    except Exception as e:
        print(f"Erro no webhook WhatsApp: {str(e)}")
        return {'status': 'success'}

def send_whatsapp_confirmation(to: str, text: str):
    if not settings.WHATSAPP_PHONE_NUMBER_ID or not settings.WHATSAPP_TOKEN:
        return
        
    url = f"https://graph.facebook.com/v17.0/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        'Authorization': f"Bearer {settings.WHATSAPP_TOKEN}",
        'Content-Type': 'application/json'
    }
    payload = {
        'messaging_product': 'whatsapp',
        'to': to,
        'type': 'text',
        'text': {'body': text}
    }
    requests.post(url, json=payload, headers=headers)

