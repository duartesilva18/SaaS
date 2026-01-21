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

@router.post('/portal')
async def customer_portal(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    try:
        if not current_user.stripe_customer_id:
            raise HTTPException(
                status_code=400, 
                detail='Não tens um cliente Stripe associado. Subscreve primeiro um plano.'
            )
        
        # Verifica se o Stripe API key está configurado
        if not settings.STRIPE_API_KEY:
            raise HTTPException(
                status_code=500,
                detail='Stripe não está configurado no servidor.'
            )
            
        portal_session = stripe.billing_portal.Session.create(
            customer=current_user.stripe_customer_id,
            return_url=f"{settings.FRONTEND_URL}/settings"
        )
        return {'url': portal_session.url}
    except stripe.error.StripeError as e:
        logger.error(f'Erro Stripe Portal: {str(e)}')
        raise HTTPException(
            status_code=400, 
            detail=f'Erro ao aceder ao portal: {str(e)}'
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f'Erro inesperado no Portal: {str(e)}')
        raise HTTPException(
            status_code=500, 
            detail='Erro inesperado ao aceder ao portal de faturação.'
        )

@router.get('/verify-session/{session_id}')
async def verify_checkout_session(session_id: str, current_user: models.User = Depends(get_current_user)):
    """Verifica o status de uma sessão de checkout e atualiza a subscrição do utilizador"""
    try:
        # Buscar a sessão do Stripe
        session = stripe.checkout.Session.retrieve(session_id)
        
        # Verificar se a sessão pertence ao utilizador atual
        session_client_ref = getattr(session, 'client_reference_id', None)
        if session_client_ref and session_client_ref != str(current_user.id):
            raise HTTPException(status_code=403, detail='Esta sessão não pertence ao utilizador atual')
        
        # Se a sessão está completa e tem uma subscrição
        session_status = getattr(session, 'status', None)
        session_mode = getattr(session, 'mode', None)
        
        if session_status == 'complete' and session_mode == 'subscription':
            subscription_id = getattr(session, 'subscription', None)
            
            if subscription_id:
                # Buscar informações da subscrição
                subscription = stripe.Subscription.retrieve(subscription_id)
                subscription_status = subscription.status
                
                # Atualizar o utilizador na base de dados
                # Usar uma sessão de DB separada para garantir atualização
                from ..core.dependencies import SessionLocal
                db = SessionLocal()
                try:
                    user = db.query(models.User).filter(models.User.id == current_user.id).first()
                    if user:
                        user.stripe_subscription_id = subscription_id
                        user.subscription_status = subscription_status
                        session_customer = getattr(session, 'customer', None)
                        if not user.stripe_customer_id and session_customer:
                            user.stripe_customer_id = session_customer
                        db.commit()
                        db.refresh(user)
                        logger.info(f'Subscrição verificada e atualizada para {user.email}: {subscription_status}')
                except Exception as e:
                    db.rollback()
                    logger.error(f'Erro ao atualizar subscrição: {str(e)}')
                finally:
                    db.close()
                
                return {
                    'success': True,
                    'subscription_status': subscription_status,
                    'is_active': subscription_status in ['active', 'trialing']
                }
        
        return {
            'success': False,
            'message': 'A sessão ainda não está completa ou não tem subscrição'
        }
    except stripe.error.StripeError as e:
        logger.error(f'Erro Stripe ao verificar sessão: {str(e)}')
        raise HTTPException(status_code=400, detail=f'Erro ao verificar sessão: {str(e)}')
    except Exception as e:
        logger.error(f'Erro inesperado ao verificar sessão: {str(e)}')
        raise HTTPException(status_code=500, detail='Erro ao verificar sessão')

@router.get('/invoices')
async def get_stripe_invoices(current_user: models.User = Depends(get_current_user)):
    try:
        if not current_user.stripe_customer_id:
            return []
        
        # Verificar se é um customer de simulação/teste (começa com "sim_")
        if current_user.stripe_customer_id.startswith('sim_'):
            logger.debug(f'Customer de simulação detectado: {current_user.stripe_customer_id}. Retornando lista vazia.')
            return []
        
        invoices = stripe.Invoice.list(customer=current_user.stripe_customer_id, limit=10)
        return invoices.data
    except stripe.error.InvalidRequestError as e:
        # Customer não existe ou foi eliminado
        error_code = getattr(e, 'code', None)
        if error_code == 'resource_missing':
            logger.debug(f'Customer não encontrado no Stripe: {current_user.stripe_customer_id}')
            return []
        logger.error(f'Erro ao buscar invoices (InvalidRequestError): {str(e)}')
        return []
    except stripe.error.StripeError as e:
        logger.error(f'Erro Stripe ao buscar invoices: {str(e)}')
        return []
    except Exception as e:
        logger.error(f'Erro inesperado ao buscar invoices: {str(e)}')
        return []

