from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from uuid import UUID
from ..core.dependencies import get_db
from ..models import database as models
from .. import schemas
from .auth import get_current_user
from ..core.audit import log_action
import stripe
from ..core.config import settings

stripe.api_key = settings.STRIPE_API_KEY

router = APIRouter(prefix='/admin', tags=['admin'])

async def check_admin(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Acesso negado. Apenas administradores.'
        )
    return current_user

@router.get('/finance/stats')
async def get_admin_finance_stats(db: Session = Depends(get_db), admin: models.User = Depends(check_admin)):
    try:
        subscriptions = stripe.Subscription.list(limit=100)
        invoices = stripe.Invoice.list(limit=100)
        
        total_mrr = sum(sub.plan.amount for sub in subscriptions.data if sub.plan)
        total_revenue = sum(inv.amount_paid for inv in invoices.data if inv.status == 'paid')
        
        pending_invoices = [inv for inv in invoices.data if inv.status == 'open' and inv.attempt_count > 0]
        
        return {
            'total_mrr_cents': total_mrr,
            'total_revenue_cents': total_revenue,
            'active_subscriptions': len(subscriptions.data),
            'pending_invoices_count': len(pending_invoices)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Stripe error: {str(e)}')

@router.get('/stats', response_model=schemas.AdminStats)
async def get_admin_stats(db: Session = Depends(get_db), admin: models.User = Depends(check_admin)):
    total_users = db.query(func.count(models.User.id)).scalar()
    total_transactions = db.query(func.count(models.Transaction.id)).scalar()
    total_recurring = db.query(func.count(models.RecurringTransaction.id)).scalar()
    active_subscriptions = db.query(func.count(models.User.id)).filter(models.User.subscription_status != 'none').scalar()
    
    total_visits = db.query(func.sum(models.User.login_count)).scalar() or 0
    recent_logs = db.query(models.AuditLog).order_by(models.AuditLog.created_at.desc()).limit(10).all()
    
    return schemas.AdminStats(
        total_users=total_users,
        total_transactions=total_transactions,
        total_recurring=total_recurring,
        active_subscriptions=active_subscriptions,
        total_visits=total_visits,
        recent_logs=recent_logs
    )

@router.get('/users', response_model=List[schemas.AdminUserResponse])
async def get_admin_users(db: Session = Depends(get_db), admin: models.User = Depends(check_admin)):
    return db.query(models.User).order_by(models.User.created_at.desc()).all()

@router.get('/users/{user_id}', response_model=schemas.AdminUserDetail)
async def get_user_detail(user_id: UUID, db: Session = Depends(get_db), admin: models.User = Depends(check_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='Utilizador não encontrado')
    
    workspaces = db.query(models.Workspace).filter(models.Workspace.owner_id == user_id).all()
    logs = db.query(models.AuditLog).filter(models.AuditLog.user_id == user_id).order_by(models.AuditLog.created_at.desc()).limit(50).all()
    
    return schemas.AdminUserDetail(
        **schemas.AdminUserResponse.from_orm(user).dict(),
        workspaces=workspaces,
        logs=logs
    )

@router.post('/users/{user_id}/toggle-admin')
async def toggle_admin_status(user_id: UUID, db: Session = Depends(get_db), admin: models.User = Depends(check_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='Utilizador não encontrado')
    
    user.is_admin = not user.is_admin
    db.commit()
    return {'message': f"Admin status for {user.email} updated to {user.is_admin}"}

@router.put('/users/{user_id}', response_model=schemas.AdminUserResponse)
async def update_user_admin(request: Request, user_id: UUID, user_update: schemas.AdminUserUpdate, db: Session = Depends(get_db), admin: models.User = Depends(check_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='Utilizador não encontrado')
    
    update_data = user_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)
    
    db.commit()
    db.refresh(user)
    
    await log_action(db, action='admin_user_update', user_id=admin.id, details=f'Updated user: {user.email}', request=request)
    return user

@router.delete('/users/{user_id}')
async def delete_user_admin(request: Request, user_id: UUID, db: Session = Depends(get_db), admin: models.User = Depends(check_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='Utilizador não encontrado')
    
    email = user.email
    db.delete(user)
    db.commit()
    
    await log_action(db, action='admin_user_delete', user_id=admin.id, details=f'Deleted user: {email}', request=request)
    return {'message': 'Utilizador eliminado com sucesso'}

