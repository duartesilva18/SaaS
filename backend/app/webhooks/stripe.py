from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.orm import Session
import stripe
from ..core.config import settings
from ..core.dependencies import get_db
from ..models import database as models
from datetime import datetime

router = APIRouter(prefix='/webhooks', tags=['webhooks'])

@router.post('/stripe')
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get('stripe-signature')
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(status_code=400, detail='Invalid payload')
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail='Invalid signature')

    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        handle_checkout_completed(session, db)
    elif event['type'] == 'customer.subscription.updated':
        subscription = event['data']['object']
        handle_subscription_updated(subscription, db)
    elif event['type'] == 'customer.subscription.deleted':
        subscription = event['data']['object']
        handle_subscription_deleted(subscription, db)

    return {'status': 'success'}

def handle_checkout_completed(session: dict, db: Session):
    customer_id = session['customer']
    subscription_id = session['subscription']
    
    sub = db.query(models.User).filter(models.User.stripe_customer_id == customer_id).first()
    if sub:
        sub.stripe_subscription_id = subscription_id
        sub.subscription_status = 'active'
        db.commit()

def handle_subscription_updated(subscription: dict, db: Session):
    sub = db.query(models.User).filter(models.User.stripe_subscription_id == subscription['id']).first()
    if sub:
        sub.subscription_status = subscription['status']
        # Optionally handle current_period_end if needed
        db.commit()

def handle_subscription_deleted(subscription: dict, db: Session):
    sub = db.query(models.User).filter(models.User.stripe_subscription_id == subscription['id']).first()
    if sub:
        sub.subscription_status = 'canceled'
        db.commit()

