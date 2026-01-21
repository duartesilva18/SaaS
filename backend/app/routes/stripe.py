from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.orm import Session
import stripe
from ..core.config import settings
from ..core.dependencies import get_db
from ..models import database as models
from .auth import get_current_user
import logging

router = APIRouter(prefix='/stripe', tags=['stripe'])
stripe.api_key = settings.STRIPE_API_KEY
STRIPE_WEBHOOK_SECRET = settings.STRIPE_WEBHOOK_SECRET

logger = logging.getLogger(__name__)

@router.post('/create-checkout-session')
async def create_checkout_session(price_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    try:
        customer_id = current_user.stripe_customer_id
        
        if not customer_id:
            customer = stripe.Customer.create(
                email=current_user.email,
                metadata={'user_id': str(current_user.id)}
            )
            customer_id = customer.id
            current_user.stripe_customer_id = customer_id
            db.commit()
            
        checkout_session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=['card'],
            line_items=[{
                'price': price_id,
                'quantity': 1,
            }],
            mode='subscription',
            client_reference_id=str(current_user.id),
            success_url=f"{settings.FRONTEND_URL}/dashboard?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.FRONTEND_URL}/pricing",
            subscription_data={
                'metadata': {'user_id': str(current_user.id)}
            }
        )
        return {'url': checkout_session.url}
    except Exception as e:
        logger.error(f'Erro Stripe Checkout: {str(e)}')
        raise HTTPException(status_code=400, detail=str(e))

@router.post('/webhook')
async def stripe_webhook(request: Request, stripe_signature: str = Header(None), db: Session = Depends(get_db)):
    payload = await request.body()
    
    try:
        if STRIPE_WEBHOOK_SECRET == 'whsec_...':
            event = stripe.Event.construct_from(await request.json(), stripe.api_key)
        else:
            event = stripe.Webhook.construct_event(
                payload, stripe_signature, STRIPE_WEBHOOK_SECRET
            )
    except Exception as e:
        logger.error(f'Webhook Error: {str(e)}')
        raise HTTPException(status_code=400, detail=f'Webhook Error: {str(e)}')

    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        user_id = session.get('client_reference_id')
        if user_id:
            user = db.query(models.User).filter(models.User.id == user_id).first()
            if user:
                user.subscription_status = 'active'
                user.stripe_subscription_id = session.get('subscription')
                db.commit()
                logger.info(f'Subscription activated for user {user.email}')
                
    elif event['type'] == 'customer.subscription.deleted':
        subscription = event['data']['object']
        user = db.query(models.User).filter(models.User.stripe_subscription_id == subscription['id']).first()
        if user:
            user.subscription_status = 'none'
            user.stripe_subscription_id = None
            db.commit()
            logger.info(f'Subscription canceled for user {user.email}')

    return {'status': 'success'}

@router.post('/portal')
async def customer_portal(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    try:
        if not current_user.stripe_customer_id:
            raise HTTPException(status_code=400, detail='No Stripe customer ID found')
            
        portal_session = stripe.billing_portal.Session.create(
            customer=current_user.stripe_customer_id,
            return_url=f"{settings.FRONTEND_URL}/dashboard"
        )
        return {'url': portal_session.url}
    except Exception as e:
        logger.error(f'Portal Error: {str(e)}')
        raise HTTPException(status_code=400, detail=str(e))

@router.get('/invoices')
async def get_stripe_invoices(current_user: models.User = Depends(get_current_user)):
    try:
        if not current_user.stripe_customer_id:
            return []
        invoices = stripe.Invoice.list(customer=current_user.stripe_customer_id, limit=10)
        return invoices.data
    except Exception as e:
        logger.error(f'Invoices Error: {str(e)}')
        return []

@router.post('/simulate-success')
async def simulate_success(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    current_user.subscription_status = 'active'
    db.commit()
    return {'message': 'Subscription simulated successfully'}

