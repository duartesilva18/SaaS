from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import List
import random
from ..core.dependencies import get_db
from ..models import database as models
from .. import schemas
from .auth import get_current_user
from .transactions import process_automatic_recurring

router = APIRouter(prefix='/insights', tags=['insights'])

@router.get('/', response_model=schemas.ZenInsightsResponse)
async def get_zen_insights(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    workspace = db.query(models.Workspace).filter(models.Workspace.owner_id == current_user.id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail='Workspace not found')
    
    process_automatic_recurring(db, workspace.id)
    
    thirty_days_ago = datetime.now() - timedelta(days=30)
    
    transactions = db.query(models.Transaction).filter(
        models.Transaction.workspace_id == workspace.id,
        models.Transaction.transaction_date >= thirty_days_ago.date()
    ).all()
    
    categories = db.query(models.Category).filter(
        models.Category.workspace_id == workspace.id
    ).all()
    
    cat_map = {cat.id: cat for cat in categories}
    
    def calculate_totals(txs):
        income = 0
        expenses = 0
        exp_by_cat = {}
        for t in txs:
            cat = cat_map.get(t.category_id)
            amount = t.amount_cents / 100
            if cat:
                if cat.type == 'income':
                    income += amount
                else:
                    expenses += amount
                    exp_by_cat[cat.name] = exp_by_cat.get(cat.name, 0) + amount
            else:
                expenses += amount
        return income, expenses, exp_by_cat

    total_income, total_expenses, expenses_by_cat = calculate_totals(transactions)
    
    now = datetime.now()
    this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_start = (this_month_start - timedelta(days=1)).replace(day=1)
    
    this_month_transactions = db.query(models.Transaction).filter(
        models.Transaction.workspace_id == workspace.id,
        models.Transaction.transaction_date >= this_month_start.date()
    ).all()
    
    last_month_transactions = db.query(models.Transaction).filter(
        models.Transaction.workspace_id == workspace.id,
        models.Transaction.transaction_date >= last_month_start.date(),
        models.Transaction.transaction_date < this_month_start.date()
    ).all()
    
    this_income, this_expenses, this_expenses_by_cat = calculate_totals(this_month_transactions)
    last_income, last_expenses, last_expenses_by_cat = calculate_totals(last_month_transactions)
    
    insights = []
    health_score = 70
    
    if last_expenses > 0:
        variation = (this_expenses - last_expenses) / last_expenses * 100
        if variation > 10:
            health_score -= 15
            insights.append(schemas.InsightItem(
                type='warning',
                title='📈 GASTOS EM ACELERAÇÃO',
                message=f"Estás a gastar {variation:.0f}% mais do que no mês passado. Identifica a 'fuga' antes que se torne uma inundação.",
                icon='alert-circle'
            ))
        elif variation < -5:
            health_score += 15
            insights.append(schemas.InsightItem(
                type='success',
                title='📉 DOMÍNIO TOTAL',
                message=f"Fantástico! Reduziste os gastos em {abs(variation):.0f}%. O teu autocontrolo é a tua maior riqueza.",
                icon='sparkles'
            ))
            
    if this_expenses > this_income and this_income > 0:
        health_score -= 25
        diff = this_expenses - this_income
        insights.append(schemas.InsightItem(
            type='warning',
            title='⚠️ DÉFICE DETETADO',
            message=f"ALERTA: Estás {current_user.currency} {diff:.2f} abaixo do ponto de equilíbrio. Tempo de uma auditoria de emergência.",
            icon='alert-circle'
        ))
    elif this_income > this_expenses * 1.5:
        health_score += 10
        insights.append(schemas.InsightItem(
            type='success',
            title='🧘‍♂️ ESTADO DE ZEN',
            message='O teu excedente é confortável. Considera investir na tua paz futura ou num sonho antigo.',
            icon='sparkles'
        ))
        
    if expenses_by_cat and total_expenses > 0:
        top_cat, top_amount = max(expenses_by_cat.items(), key=lambda x: x[1])
        perc_of_expenses = (top_amount / total_expenses) * 100
        
        is_significant = False
        if this_income > 0:
            perc_of_income = (top_amount / this_income) * 100
            if perc_of_income > 10:
                is_significant = True
        elif top_amount > 50 and perc_of_expenses > 40:
            is_significant = True
            
        if is_significant and perc_of_expenses > 40:
            health_score -= 10
            insights.append(schemas.InsightItem(
                type='warning',
                title=f"⚠️ FOCO EM: {top_cat.upper()}",
                message=f"A categoria {top_cat} representa {perc_of_expenses:.0f}% dos teus gastos atuais. Sendo um peso relevante no teu orçamento, valerá a pena otimizar?",
                icon='trending-up'
            ))
            
    small_expenses = [t for t in this_month_transactions if 0 < t.amount_cents < 1000]
    if len(small_expenses) > 5:
        health_score -= 5
        total_small = sum(t.amount_cents for t in small_expenses) / 100
        insights.append(schemas.InsightItem(
            type='info',
            title='📉 PEQUENAS DESPESAS',
            message=f"Detetámos {len(small_expenses)} transações de baixo valor. Somadas, totalizam {current_user.currency} {total_small:.2f}. Atenção aos pequenos gastos!",
            icon='compass'
        ))
        
    if len(this_month_transactions) > 0 and len(last_month_transactions) == 0:
        insights.append(schemas.InsightItem(
            type='success',
            title='🌱 NOVO COMEÇO',
            message='Estás a dar os primeiros passos no teu ecossistema. A consistência é a chave para a paz financeira.',
            icon='sparkles'
        ))
        
    health_score = max(0, min(100, health_score))
    
    fallbacks = [
        schemas.InsightItem(
            type='info',
            title='💎 SABEDORIA ZEN',
            message='O dinheiro é um servo mestre, mas um mestre terrível. Mantém o controlo.',
            icon='lightbulb'
        ),
        schemas.InsightItem(
            type='info',
            title='🧘‍♂️ FOCO NO AGORA',
            message='Regista todas as tuas transações no momento. A clareza traz tranquilidade.',
            icon='sparkles'
        ),
        schemas.InsightItem(
            type='info',
            title='🚀 EVOLUÇÃO',
            message='Pequenas mudanças hoje criam grandes fortunas amanhã. Continua focado.',
            icon='trending-up'
        )
    ]
    
    for fb in fallbacks:
        if len(insights) >= 3:
            break
        insights.append(fb)
        
    summary = 'O teu ecossistema financeiro está em constante evolução.'
    if health_score < 40:
        summary = 'CUIDADO: A tua paz financeira está em risco crítico.'
    elif health_score > 80:
        summary = 'EXCELENTE: Estás em plena harmonia com a tua abundância.'
        
    return schemas.ZenInsightsResponse(
        insights=insights[:3],
        summary=summary,
        health_score=health_score
    )

@router.get('/composite', response_model=schemas.AnalyticsCompositeResponse)
async def get_analytics_composite(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    workspace = db.query(models.Workspace).filter(models.Workspace.owner_id == current_user.id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail='Workspace not found')
    
    process_automatic_recurring(db, workspace.id)
    
    zen_insights = await get_zen_insights(db, current_user)
    
    transactions = db.query(models.Transaction).filter(
        models.Transaction.workspace_id == workspace.id
    ).order_by(models.Transaction.transaction_date.desc()).all()
    
    categories = db.query(models.Category).filter(
        models.Category.workspace_id == workspace.id
    ).all()
    
    recurring = db.query(models.RecurringTransaction).filter(
        models.RecurringTransaction.workspace_id == workspace.id
    ).all()
    
    return schemas.AnalyticsCompositeResponse(
        transactions=transactions,
        categories=categories,
        insights=zen_insights,
        recurring=recurring,
        currency=current_user.currency
    )

