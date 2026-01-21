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

router = APIRouter(prefix='/categories', tags=['categories'])

@router.get('/', response_model=List[schemas.CategoryResponse])
async def get_categories(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    workspace = db.query(models.Workspace).filter(models.Workspace.owner_id == current_user.id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail='Workspace not found')
    
    return db.query(models.Category).filter(models.Category.workspace_id == workspace.id).all()

@router.get('/stats', response_model=List[schemas.CategoryStats])
async def get_category_stats(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    workspace = db.query(models.Workspace).filter(models.Workspace.owner_id == current_user.id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail='Workspace not found')
    
    today = date.today()
    start_of_month = date(today.year, today.month, 1)
    
    transactions = db.query(models.Transaction).join(models.Category).filter(
        models.Transaction.workspace_id == workspace.id,
        models.Transaction.transaction_date >= start_of_month,
        models.Category.type == 'expense'
    ).all()
    
    total_monthly_cents = sum(t.amount_cents for t in transactions)
    
    stats = {}
    for t in transactions:
        cat_id = str(t.category_id)
        if cat_id not in stats:
            stats[cat_id] = {
                'category_id': t.category_id,
                'name': t.category.name,
                'total_spent_cents': 0,
                'count': 0,
                'color': t.category.color_hex,
                'icon': t.category.icon
            }
        stats[cat_id]['total_spent_cents'] += t.amount_cents
        stats[cat_id]['count'] += 1
    
    result = []
    for cat_id, data in stats.items():
        percentage = (data['total_spent_cents'] / total_monthly_cents * 100) if total_monthly_cents > 0 else 0
        result.append(schemas.CategoryStats(
            **data,
            percentage=round(percentage, 1)
        ))
    
    result.sort(key=lambda x: x.total_spent_cents, reverse=True)
    return result

@router.post('/', response_model=schemas.CategoryResponse)
async def create_category(request: Request, category_in: schemas.CategoryBase, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    workspace = db.query(models.Workspace).filter(models.Workspace.owner_id == current_user.id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail='Workspace not found')
    
    new_category = models.Category(
        **category_in.dict(),
        workspace_id=workspace.id
    )
    db.add(new_category)
    try:
        db.commit()
        db.refresh(new_category)
        
        await log_action(db, action='create_category', user_id=current_user.id, details=f'name: {new_category.name}', request=request)
        return new_category
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail='Erro ao criar categoria. Verifique se o nome já existe.')

@router.patch('/{category_id}', response_model=schemas.CategoryResponse)
async def update_category(request: Request, category_id: UUID, category_in: schemas.CategoryUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    workspace = db.query(models.Workspace).filter(models.Workspace.owner_id == current_user.id).first()
    db_category = db.query(models.Category).filter(
        models.Category.id == category_id,
        models.Category.workspace_id == workspace.id
    ).first()
    
    if not db_category:
        raise HTTPException(status_code=404, detail='Categoria não encontrada')
    
    update_data = category_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_category, field, value)
    
    db.commit()
    db.refresh(db_category)
    
    await log_action(db, action='update_category', user_id=current_user.id, details=f'id: {category_id}', request=request)
    return db_category

@router.delete('/{category_id}')
async def delete_category(request: Request, category_id: UUID, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    workspace = db.query(models.Workspace).filter(models.Workspace.owner_id == current_user.id).first()
    db_category = db.query(models.Category).filter(
        models.Category.id == category_id,
        models.Category.workspace_id == workspace.id
    ).first()
    
    if not db_category:
        raise HTTPException(status_code=404, detail='Categoria não encontrada')
    
    if db_category.is_default:
        raise HTTPException(status_code=400, detail='Não é possível eliminar categorias padrão')
    
    has_transactions = db.query(models.Transaction).filter(models.Transaction.category_id == category_id).first()
    if has_transactions:
        raise HTTPException(status_code=400, detail='Esta categoria tem transações associadas. Mude as transações de categoria antes de a eliminar.')
    
    name = db_category.name
    db.delete(db_category)
    db.commit()
    
    await log_action(db, action='delete_category', user_id=current_user.id, details=f'name: {name}', request=request)
    return {'message': 'Categoria eliminada com sucesso'}

