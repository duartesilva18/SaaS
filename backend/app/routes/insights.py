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
        vault = 0
        exp_by_cat = {}
        for t in txs:
            cat = cat_map.get(t.category_id)
            amount = abs(t.amount_cents / 100)
            if cat:
                if cat.type == 'income':
                    income += amount
                elif cat.vault_type != 'none':
                    vault += amount
                else:
                    expenses += amount
                    exp_by_cat[cat.name] = exp_by_cat.get(cat.name, 0) + amount
            else:
                expenses += amount
        return income, expenses, vault, exp_by_cat

    total_income, total_expenses, total_vault, expenses_by_cat = calculate_totals(transactions)
    
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
    
    this_income, this_expenses, this_vault, this_expenses_by_cat = calculate_totals(this_month_transactions)
    last_income, last_expenses, last_vault, last_expenses_by_cat = calculate_totals(last_month_transactions)
    
    insights = []
    health_score = 50 # Base neutra (era 65)
    
    # 1. Taxa de Poupança (Saving Rate) - A métrica mestre
    if this_income > 0:
        saving_rate = ((this_income - this_expenses) / this_income) * 100
        if saving_rate >= 50:
            health_score += 25 # Bónus de elite
            insights.append(schemas.InsightItem(
                type='success',
                title='💎 MESTRE DA ABUNDÂNCIA',
                message=f"Uau! Estás a poupar {saving_rate:.0f}%. Este é o nível de elite da liberdade financeira.",
                icon='sparkles'
            ))
        elif saving_rate >= 25:
            health_score += 15
            insights.append(schemas.InsightItem(
                type='success',
                title='📈 RITMO POSITIVO',
                message=f"Estás a reter {saving_rate:.0f}% do teu rendimento. Mantém este fôlego para construir o teu império.",
                icon='trending-up'
            ))
        elif saving_rate >= 10:
            health_score += 5
            insights.append(schemas.InsightItem(
                type='info',
                title='⚖️ EQUILÍBRIO JUSTO',
                message=f"A tua taxa de poupança está em {saving_rate:.0f}%. Tenta reduzir despesas supérfluas.",
                icon='compass'
            ))
        elif saving_rate >= 0:
            health_score -= 5 # Poupança medíocre tira pontos
            insights.append(schemas.InsightItem(
                type='warning',
                title='🐌 RITMO LENTO',
                message=f"A tua taxa de poupança ({saving_rate:.0f}%) é baixa. Estás muito próximo do limite de segurança.",
                icon='activity'
            ))
        else:
            health_score -= 45 # Penalização severa para défice
            insights.append(schemas.InsightItem(
                type='danger',
                title='🚨 DÉFICE CRÍTICO',
                message=f"ALERTA: Estás a gastar {abs(saving_rate):.0f}% acima do que ganhas. O teu ecossistema está em risco.",
                icon='alert-circle'
            ))
    elif this_expenses > 0:
        health_score -= 40
        insights.append(schemas.InsightItem(
            type='warning',
            title='⚠️ CONSUMO SEM RECEITA',
            message="Detetámos gastos mas ainda não registaste receitas este mês.",
            icon='alert-circle'
        ))

    # 2. Consistência de Investimento (Cofre)
    if this_vault > 0:
        investment_ratio = (this_vault / this_income * 100) if this_income > 0 else 10
        # Só ganha pontos reais se investir mais de 10%
        if investment_ratio >= 20:
            health_score += 20
        elif investment_ratio >= 10:
            health_score += 10
        else:
            health_score += 2
            
        if last_vault > 0 and this_vault >= last_vault:
            insights.append(schemas.InsightItem(
                type='success',
                title='🛡️ ESCUDO ZEN',
                message="A tua disciplina de investimento está impecável.",
                icon='shield-check'
            ))
    elif this_income > 0:
        health_score -= 20 # Punição severa por não investir
        insights.append(schemas.InsightItem(
            type='info',
            title='🌱 SEMEIA O FUTURO',
            message="Ainda não reforçaste o teu Cofre este mês.",
            icon='target'
        ))

    # 3. Análise de Limites de Categorias
    categories_near_limit = []
    for cat in categories:
        if cat.type == 'expense' and cat.monthly_limit_cents > 0:
            spent = this_expenses_by_cat.get(cat.name, 0)
            limit = cat.monthly_limit_cents / 100
            if spent > limit:
                categories_near_limit.append((cat.name, (spent/limit)*100, True))
            elif spent >= limit * 0.8:
                categories_near_limit.append((cat.name, (spent/limit)*100, False))

    if categories_near_limit:
        critical_violations = [c for c in categories_near_limit if c[2]]
        if critical_violations:
            health_score -= (25 * len(critical_violations)) # Muito punitivo
            top = max(critical_violations, key=lambda x: x[1])
            insights.append(schemas.InsightItem(
                type='danger',
                title='💀 LIMITE EXCEDIDO',
                message=f"A categoria {top[0]} ultrapassou o teto planeado ({top[1]:.0f}%).",
                icon='zap'
            ))
        else:
            health_score -= 15
            top = max(categories_near_limit, key=lambda x: x[1])
            insights.append(schemas.InsightItem(
                type='warning',
                title='⚠️ ZONA AMARELA',
                message=f"Atenção a {top[0]} ({top[1]:.0f}% do limite).",
                icon='zap'
            ))

    # 4. Detetção de Anomalias (Spikes)
    if this_expenses > 0 and len(this_month_transactions) > 0:
        avg_trans = this_expenses / len(this_month_transactions)
        big_spenders = [t for t in this_month_transactions if (t.amount_cents/100) > avg_trans * 4 and t.amount_cents > 10000]
        if big_spenders:
            health_score -= 20 # Penalização pesada para impulsividade
            insights.append(schemas.InsightItem(
                type='info',
                title='⚡ PICO DE CONSUMO',
                message=f"Detetámos um gasto singular elevado em '{big_spenders[0].description}'.",
                icon='activity'
            ))

    # 5. Pequenos Gastos (Ghost Spending)
    small_expenses = [t for t in this_month_transactions if 0 < t.amount_cents < 1000]
    if len(small_expenses) > 6: # Limite de tolerância menor (era 8)
        health_score -= 15
        insights.append(schemas.InsightItem(
            type='info',
            title='👻 GASTOS FANTASMA',
            message=f"Fizeste {len(small_expenses)} pequenas compras. Estas fugas silenciosas destroem a tua paz.",
            icon='ghost'
        ))

    # Ajuste final do score e fallbacks
    health_score = max(0, min(100, health_score))
    
    fallbacks = [
        schemas.InsightItem(type='info', title='💎 SABEDORIA ZEN', message='O dinheiro é um bom servo, mas um mestre perigoso. Mantém a clareza.', icon='lightbulb'),
        schemas.InsightItem(type='info', title='🧘‍♂️ FOCO NO AGORA', message='Regista as tuas despesas no momento em que acontecem para manter o controlo.', icon='sparkles'),
        schemas.InsightItem(type='info', title='🚀 EVOLUÇÃO', message='O teu futuro financeiro é construído com as decisões que tomas hoje.', icon='trending-up')
    ]
    
    for fb in fallbacks:
        if len(insights) >= 3:
            break
        insights.append(fb)
        
    summary = 'O teu ecossistema financeiro está em constante evolução.'
    if health_score < 40:
        summary = '⚠️ CRÍTICO: O teu equilíbrio financeiro necessita de intervenção urgente.'
    elif health_score < 60:
        summary = '⚠️ ATENÇÃO: Estás a consumir capital. Reavalia as tuas prioridades.'
    elif health_score > 90:
        summary = '✨ EXCELENTE: Estás em plena harmonia e domínio do teu capital.'
    elif health_score > 75:
        summary = '🧘‍♂️ ZEN: O teu ecossistema segue um trilho saudável e equilibrado.'
    elif health_score > 60:
        summary = '⚖️ ESTÁVEL: Manténs o controlo, mas há margem para otimização.'
        
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

