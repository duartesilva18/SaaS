from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List
from ..core.dependencies import get_db
from ..core.audit import log_action
from ..models import database as models
from .. import schemas
from .auth import get_current_user
from uuid import UUID
from datetime import date

router = APIRouter(prefix='/transactions', tags=['transactions'])

def process_automatic_recurring(db: Session, workspace_id: UUID):
    today = date.today()
    
    rules = db.query(models.RecurringTransaction).filter(
        models.RecurringTransaction.workspace_id == workspace_id,
        models.RecurringTransaction.is_active == True,
        models.RecurringTransaction.process_automatically == True
    ).all()
    
    for rule in rules:
        if today.day >= rule.day_of_month:
            start_of_month = date(today.year, today.month, 1)
            
            existing = db.query(models.Transaction).filter(
                models.Transaction.workspace_id == workspace_id,
                models.Transaction.description == rule.description,
                models.Transaction.amount_cents == rule.amount_cents,
                models.Transaction.transaction_date >= start_of_month
            ).first()
            
            if existing:
                continue
            
            new_t = models.Transaction(
                workspace_id=workspace_id,
                category_id=rule.category_id,
                amount_cents=rule.amount_cents,
                description=rule.description,
                transaction_date=date(today.year, today.month, rule.day_of_month),
                is_installment=False
            )
            db.add(new_t)
    
    db.commit()

@router.get('/', response_model=List[schemas.TransactionResponse])
async def get_transactions(request: Request, skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    workspace = db.query(models.Workspace).filter(models.Workspace.owner_id == current_user.id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail='Workspace not found')
    
    process_automatic_recurring(db, workspace.id)
    
    return db.query(models.Transaction).filter(
        models.Transaction.workspace_id == workspace.id
    ).order_by(models.Transaction.transaction_date.desc()).offset(skip).limit(limit).all()

@router.post('/', response_model=schemas.TransactionResponse)
async def create_transaction(request: Request, transaction_in: schemas.TransactionCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    workspace = db.query(models.Workspace).filter(models.Workspace.owner_id == current_user.id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail='Workspace not found')
    
    new_transaction = models.Transaction(
        **transaction_in.dict(),
        workspace_id=workspace.id
    )
    db.add(new_transaction)
    db.commit()
    db.refresh(new_transaction)
    
    await log_action(db, action='create_transaction', user_id=current_user.id, details=f'amount: {new_transaction.amount_cents}', request=request)
    return new_transaction

@router.patch('/{transaction_id}', response_model=schemas.TransactionResponse)
async def update_transaction(request: Request, transaction_id: UUID, transaction_in: schemas.TransactionUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    workspace = db.query(models.Workspace).filter(models.Workspace.owner_id == current_user.id).first()
    db_transaction = db.query(models.Transaction).filter(
        models.Transaction.id == transaction_id,
        models.Transaction.workspace_id == workspace.id
    ).first()
    
    if not db_transaction:
        raise HTTPException(status_code=404, detail='Transação não encontrada')
    
    update_data = transaction_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_transaction, field, value)
    
    db.commit()
    db.refresh(db_transaction)
    
    await log_action(db, action='update_transaction', user_id=current_user.id, details=f'id: {transaction_id}', request=request)
    return db_transaction

@router.delete('/{transaction_id}')
async def delete_transaction(request: Request, transaction_id: UUID, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    workspace = db.query(models.Workspace).filter(models.Workspace.owner_id == current_user.id).first()
    db_transaction = db.query(models.Transaction).filter(
        models.Transaction.id == transaction_id,
        models.Transaction.workspace_id == workspace.id
    ).first()
    
    if not db_transaction:
        raise HTTPException(status_code=404, detail='Transação não encontrada')
    
    db.delete(db_transaction)
    db.commit()
    
    await log_action(db, action='delete_transaction', user_id=current_user.id, details=f'id: {transaction_id}', request=request)
    return {'message': 'Transação eliminada com sucesso'}

