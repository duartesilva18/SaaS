from fastapi import APIRouter, Request, HTTPException, Depends, Header
from sqlalchemy.orm import Session
import requests
import json
import logging
import re
import hmac
import hashlib
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, date, timezone
from typing import Optional, Dict, List
import unicodedata

from ..core.config import settings
from ..core.dependencies import get_db
from ..models import database as models
from ..core.limiter import limiter

logger = logging.getLogger("telegram_webhook")
# Não adicionar handlers aqui - usar os do logging root para evitar duplicação

router = APIRouter(prefix='/telegram', tags=['webhooks'])

# Rate Limiting
_rate_limit_store = defaultdict(list)  # chat_id -> [timestamps]
_rate_limit_window = timedelta(minutes=1)
_rate_limit_max_messages = 10  # Máximo 10 mensagens por minuto

def check_rate_limit(chat_id: str) -> bool:
    """Verifica se o chat_id está dentro do limite de rate"""
    now = datetime.now()
    # Limpar timestamps antigos
    _rate_limit_store[chat_id] = [
        ts for ts in _rate_limit_store[chat_id]
        if now - ts < _rate_limit_window
    ]
    
    # Verificar limite
    if len(_rate_limit_store[chat_id]) >= _rate_limit_max_messages:
        return False  # Limite excedido
    
    _rate_limit_store[chat_id].append(now)
    return True

def normalize_text(text: str) -> str:
    """Normaliza texto removendo acentos e símbolos"""
    # Remove acentos
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    # Remove símbolos e converte para minúsculas
    text = re.sub(r'[^\w\s]', '', text.lower())
    return text

def find_similar_transaction(text: str, workspace_id: uuid.UUID, db: Session, tipo: str) -> Optional[uuid.UUID]:
    """
    Busca transações similares no histórico para usar categoria do cache.
    Retorna category_id se encontrar match forte.
    NÃO usa transações de seed (1 cêntimo) para cache.
    """
    # Normalizar texto de entrada
    text_normalized = normalize_text(text)
    words = set(text_normalized.split())
    
    if not words:
        logger.info(f"Texto vazio após normalização: '{text}'")
        return None
    
    # Buscar transações do histórico (últimos 180 dias para melhor aprendizagem)
    # Quanto mais transações, melhor o sistema aprende os padrões do utilizador
    cutoff_date = date.today() - timedelta(days=180)
    
    transactions = db.query(models.Transaction).filter(
        models.Transaction.workspace_id == workspace_id,
        models.Transaction.transaction_date >= cutoff_date,
        models.Transaction.category_id.isnot(None)
    ).order_by(models.Transaction.transaction_date.desc()).limit(500).all()  # Aumentado para 500 para mais dados
    
    # Filtrar por tipo (expense = negativo, income = positivo)
    # E EXCLUIR transações de seed (1 cêntimo) - não devem ser usadas para cache
    if tipo == "expense":
        transactions = [t for t in transactions if t.amount_cents < 0 and abs(t.amount_cents) != 1]
    else:
        transactions = [t for t in transactions if t.amount_cents > 0 and abs(t.amount_cents) != 1]
    
    logger.info(f"Buscando transações similares para '{text}' (tipo: {tipo}). Total de transações a verificar: {len(transactions)}")
    
    best_match = None
    best_score = 0
    best_description = None
    
    for trans in transactions:
        if not trans.description:
            continue
        
        # Normalizar descrição da transação
        desc_normalized = normalize_text(trans.description)
        desc_words = set(desc_normalized.split())
        
        # Calcular score (palavras em comum)
        common_words = words.intersection(desc_words)
        score = len(common_words)
        
        # Bonus para palavras importantes (>4 caracteres)
        important_words = [w for w in common_words if len(w) > 4]
        score += len(important_words) * 2  # Bonus maior para palavras importantes
        
        # Bonus por recência: transações mais recentes têm mais peso (aprendizagem contínua)
        days_ago = (date.today() - trans.transaction_date).days
        if days_ago <= 7:
            score += 3  # Muito recente (última semana)
        elif days_ago <= 30:
            score += 2  # Recente (último mês)
        elif days_ago <= 90:
            score += 1  # Moderado (últimos 3 meses)
        # Transações antigas (90-180 dias) não têm bonus
        
        # Score mínimo mais rigoroso: precisa de pelo menos 2 palavras comuns E pelo menos 1 palavra importante (>4 chars)
        # OU 3+ palavras comuns (mesmo que curtas)
        has_important_word = any(len(w) > 4 for w in common_words)
        min_words_required = 3 if not has_important_word else 2
        
        if score >= min_words_required and (has_important_word or len(common_words) >= 3):
            if score > best_score:
                best_score = score
                best_match = trans.category_id
                best_description = trans.description
                logger.info(f"Match encontrado: '{trans.description}' (score: {score}, palavras comuns: {common_words}, dias atrás: {days_ago})")
    
    if best_match:
        logger.info(f"Melhor match no cache: '{best_description}' (score: {best_score}) -> category_id: {best_match}")
    else:
        logger.info(f"Nenhum match forte encontrado no cache para '{text}' (melhor score: {best_score})")
    
    return best_match

def validate_email(email: str) -> bool:
    """Valida formato de email"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))

def parse_transaction(text: str, workspace: models.Workspace, db: Session) -> Optional[Dict]:
    """
    Extrai valor, tipo e categoria de uma mensagem de texto.
    Suporta múltiplas transações separadas por espaço.
    """
    # Suporta múltiplas transações: "Almoço 15€ Gasolina 10€"
    transactions = []
    
    # Regex para encontrar valores monetários
    # Suporta: "15€", "15.50€", "1.234,56€", "1 234€"
    valor_pattern = r'(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d+)?)\s*(?:€|eur|euros|e)?'
    
    # Encontrar todos os valores na mensagem
    valor_matches = list(re.finditer(valor_pattern, text, re.IGNORECASE))
    
    if not valor_matches:
        return None
    
    # Identificar tipo (despesa ou receita)
    text_lower = text.lower()
    income_keywords = [
        'recebi', 'salário', 'ordenado', 'ganhei', 'vendi', 'rendimento', 
        'bonus', 'vencimento', 'reembolso', 'subsídio', 'prémio', 'premio'
    ]
    tipo = "income" if any(k in text_lower for k in income_keywords) else "expense"
    
    # Buscar categorias do workspace
    categories = db.query(models.Category).filter(
        models.Category.workspace_id == workspace.id,
        models.Category.type == tipo
    ).all()
    
    if not categories:
        return None
    
    # Verificar se o utilizador especificou uma categoria na mensagem
    # Formato: "Bolachas - Alimentação 100€" ou "Bolachas - alimentos 100€"
    text_lower_normalized = normalize_text(text)
    specified_category = None
    specified_category_name = None
    
    # Primeiro, verificar se há um hífen separando descrição da categoria
    # Formato: "Descrição - Categoria Valor€"
    if ' - ' in text or ' -' in text or '- ' in text:
        # Dividir por hífen
        parts = re.split(r'\s*-\s*', text, 1)
        if len(parts) == 2:
            # parts[0] = descrição, parts[1] = categoria + valor
            category_part = parts[1]
            # Remover o valor monetário da parte da categoria
            category_part_clean = re.sub(r'\s*\d+[.,\s]*\d*\s*(?:€|eur|euros|e)?', '', category_part, flags=re.IGNORECASE).strip()
            category_part_normalized = normalize_text(category_part_clean)
            
            # Procurar categoria correspondente
            for cat in categories:
                cat_name_normalized = normalize_text(cat.name)
                # Match exato ou parcial
                if cat_name_normalized == category_part_normalized or cat_name_normalized in category_part_normalized or category_part_normalized in cat_name_normalized:
                    specified_category = cat
                    specified_category_name = cat.name
                    logger.info(f"✓ Categoria especificada após hífen: '{cat.name}' (id: {cat.id})")
                    break
    
    # Se não encontrou com hífen, verificar match direto no texto completo
    if not specified_category:
        # Mapeamento de palavras-chave comuns para categorias
        category_keywords = {
            'alimentação': ['alimento', 'alimentos', 'comida', 'restaurante', 'supermercado', 'mercearia', 'alimentar'],
            'transportes': ['transporte', 'uber', 'bolt', 'taxi', 'gasolina', 'combustível', 'combustivel', 'metro', 'autocarro', 'bus'],
            'habitação': ['casa', 'renda', 'luz', 'água', 'agua', 'internet', 'telefone', 'electricidade', 'eletricidade'],
            'saúde': ['saude', 'médico', 'medico', 'farmacia', 'farmacia', 'hospital', 'medicina', 'clinica'],
            'entretenimento': ['cinema', 'netflix', 'spotify', 'jogo', 'jogos', 'diversão', 'diversao', 'lazer'],
            'salário': ['salario', 'ordenado', 'vencimento', 'recebi', 'ganhei']
        }
        
        # Verificar match direto com nomes de categorias
        for cat in categories:
            cat_name_normalized = normalize_text(cat.name)
            # Match exato da categoria no texto
            if cat_name_normalized in text_lower_normalized:
                specified_category = cat
                specified_category_name = cat.name
                logger.info(f"✓ Categoria especificada na mensagem (match direto): '{cat.name}' (id: {cat.id})")
                break
        
        # Se não encontrou match direto, verificar palavras-chave
        if not specified_category:
            for cat in categories:
                cat_name_normalized = normalize_text(cat.name)
                keywords = category_keywords.get(cat_name_normalized, [])
                # Verificar se alguma palavra-chave está no texto
                for keyword in keywords:
                    if keyword in text_lower_normalized:
                        specified_category = cat
                        specified_category_name = cat.name
                        logger.info(f"✓ Categoria especificada na mensagem (via palavra-chave '{keyword}'): '{cat.name}' (id: {cat.id})")
                        break
                if specified_category:
                    break
    
    # Processar cada valor encontrado
    for i, valor_match in enumerate(valor_matches):
        # Extrair valor
        valor_str = valor_match.group(1).replace(' ', '').replace('.', '').replace(',', '.')
        try:
            amount = float(valor_str)
        except ValueError:
            continue
        
        # Extrair descrição (texto antes do valor, ou texto entre valores)
        # Se há hífen no texto, a descrição é apenas a parte ANTES do hífen
        if ' - ' in text or ' -' in text or '- ' in text:
            # Dividir o texto completo por hífen
            text_parts = re.split(r'\s*-\s*', text, 1)
            if len(text_parts) == 2:
                # A descrição é a primeira parte (antes do hífen)
                first_part = text_parts[0].strip()
                # Remover qualquer valor monetário que possa estar na primeira parte
                description = re.sub(r'\s*\d+[.,\s]*\d*\s*(?:€|eur|euros|e)?', '', first_part, flags=re.IGNORECASE).strip()
                logger.info(f"Descrição após separar por hífen: '{description}'")
            else:
                # Fallback: usar lógica normal
                start_pos = valor_matches[i-1].end() if i > 0 else 0
                end_pos = valor_match.start()
                description = text[start_pos:end_pos].strip()
        else:
            # Sem hífen: usar lógica normal
            start_pos = valor_matches[i-1].end() if i > 0 else 0
            end_pos = valor_match.start()
            description = text[start_pos:end_pos].strip()
        
        # Limpar descrição (remover categoria se foi especificada sem hífen)
        words_to_remove = ['€', 'euro', 'euros', 'eur', 'gastei', 'paguei', 'recebi', 
                          'em', 'no', 'na', 'de', 'do', 'da', 'com', 'para']
        
        # Se categoria foi especificada (sem hífen), removê-la da descrição (incluindo variações parciais)
        if specified_category and not (' - ' in text or ' -' in text or '- ' in text):
                desc_words = description.split()
                category_name_normalized = normalize_text(specified_category.name)
                # Remover palavras que correspondem à categoria (exato ou parcial)
                filtered_words = []
                for word in desc_words:
                    word_normalized = normalize_text(word)
                    # Verificar se a palavra é parte da categoria ou vice-versa
                    is_category_word = (
                        word_normalized == category_name_normalized or
                        category_name_normalized in word_normalized or
                        word_normalized in category_name_normalized
                    )
                    if not is_category_word:
                        filtered_words.append(word)
                description = " ".join(filtered_words).strip()
                logger.info(f"Descrição após remover categoria '{specified_category.name}': '{description}'")
        
        desc_words = description.split()
        final_desc_words = [w for w in desc_words if w.lower() not in words_to_remove]
        
        if final_desc_words:
            description = " ".join(final_desc_words).strip()
        else:
            description = "Transação Telegram"
        
        # Se categoria foi especificada, usar diretamente (SEM ir ao cache ou Gemini)
        if specified_category:
            category_id = specified_category.id
            logger.info(f"✓ Usando categoria especificada pelo utilizador: '{specified_category_name}' (id: {category_id}) - PULANDO cache e Gemini")
        else:
            # Tentar encontrar categoria via cache (transações similares)
            category_id = find_similar_transaction(description, workspace.id, db, tipo)
            
            # Se não encontrou no cache de transações, verificar cache de categorizações do Gemini
            if not category_id:
                description_normalized = normalize_text(description)
                category_id = get_cached_category(description_normalized, workspace.id, tipo, categories, db)
                
                if category_id:
                    logger.info(f"Categoria encontrada no cache do Gemini para '{description}': category_id={category_id}")
                else:
                    # Se não está no cache, usar Gemini AI para categorizar
                    logger.info(f"Nenhuma transação similar encontrada no cache para '{description}'. Usando Gemini AI para categorizar.")
                    category_id = categorize_with_ai(description, categories, tipo, text, workspace.id, db)
                    if category_id:
                        # Encontrar nome da categoria
                        category_obj = next((cat for cat in categories if cat.id == category_id), None)
                        category_name = category_obj.name if category_obj else "Outros"
                        
                        logger.info(f"Gemini categorizou '{description}' com sucesso: category_id={category_id}")
                        # Guardar no cache para futuras utilizações (privado e global se for comum)
                        save_cached_category(description_normalized, workspace.id, category_id, category_name, tipo, db, is_common=True)
                    else:
                        logger.warning(f"Gemini não conseguiu categorizar '{description}'. Usando categoria padrão.")
            else:
                logger.info(f"Transação similar encontrada no cache para '{description}'. Usando categoria do cache: category_id={category_id}")
        
        # Se ainda não encontrou (nem cache nem IA), usar primeira categoria do tipo
        if not category_id and categories:
            logger.info(f"Usando primeira categoria do tipo '{tipo}' como fallback")
            category_id = categories[0].id
        
        transactions.append({
            "amount": amount,
            "description": description[:255],
            "type": tipo,
            "category_id": category_id
        })
    
    # Retornar primeira transação ou lista se múltiplas
    if len(transactions) == 1:
        return transactions[0]
    return {"multiple": True, "transactions": transactions}

def get_cached_category(description_normalized: str, workspace_id: uuid.UUID, tipo: str, categories: List[models.Category], db: Session) -> Optional[uuid.UUID]:
    """
    Verifica se existe uma categorização em cache para esta descrição.
    Primeiro verifica cache do workspace (privado), depois cache global (partilhado).
    Retorna category_id se encontrar.
    """
    # 1. Verificar cache privado do workspace
    cache_entry = db.query(models.CategoryMappingCache).filter(
        models.CategoryMappingCache.workspace_id == workspace_id,
        models.CategoryMappingCache.description_normalized == description_normalized,
        models.CategoryMappingCache.transaction_type == tipo
    ).first()
    
    if cache_entry and cache_entry.category_id:
        # Atualizar contador e última utilização
        cache_entry.usage_count += 1
        cache_entry.last_used_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(f"Cache privado hit: '{description_normalized}' -> '{cache_entry.category_id}' (usado {cache_entry.usage_count}x)")
        return cache_entry.category_id
    
    # 2. Verificar cache global (partilhado entre utilizadores)
    global_cache = db.query(models.CategoryMappingCache).filter(
        models.CategoryMappingCache.is_global == True,
        models.CategoryMappingCache.workspace_id.is_(None),
        models.CategoryMappingCache.description_normalized == description_normalized,
        models.CategoryMappingCache.transaction_type == tipo
    ).first()
    
    if global_cache:
        # Procurar categoria com o mesmo nome no workspace atual
        category_name = global_cache.category_name
        for cat in categories:
            if cat.name == category_name and cat.type == tipo:
                # Atualizar contador do cache global
                global_cache.usage_count += 1
                global_cache.last_used_at = datetime.now(timezone.utc)
                db.commit()
                logger.info(f"Cache global hit: '{description_normalized}' -> '{category_name}' (usado {global_cache.usage_count}x globalmente)")
                return cat.id
    
    return None

def save_cached_category(description_normalized: str, workspace_id: uuid.UUID, category_id: uuid.UUID, category_name: str, tipo: str, db: Session, is_common: bool = False):
    """
    Guarda uma categorização no cache para reutilização futura.
    Se is_common=True, guarda também no cache global (partilhado).
    """
    try:
        # 1. Guardar no cache privado do workspace
        existing = db.query(models.CategoryMappingCache).filter(
            models.CategoryMappingCache.workspace_id == workspace_id,
            models.CategoryMappingCache.description_normalized == description_normalized,
            models.CategoryMappingCache.transaction_type == tipo
        ).first()
        
        if existing:
            # Atualizar existente
            existing.category_id = category_id
            existing.category_name = category_name
            existing.usage_count += 1
            existing.last_used_at = datetime.now(timezone.utc)
        else:
            # Criar novo
            cache_entry = models.CategoryMappingCache(
                workspace_id=workspace_id,
                description_normalized=description_normalized,
                category_id=category_id,
                category_name=category_name,
                transaction_type=tipo,
                is_global=False
            )
            db.add(cache_entry)
        
        # 2. Se for uma categoria comum (ex: "Alimentação", "Transportes"), guardar também no cache global
        # Categorias comuns que todos os utilizadores têm
        common_category_names = ['Alimentação', 'Transportes', 'Habitação', 'Saúde', 'Entretenimento', 'Salário']
        
        if is_common or category_name in common_category_names:
            global_existing = db.query(models.CategoryMappingCache).filter(
                models.CategoryMappingCache.is_global == True,
                models.CategoryMappingCache.workspace_id.is_(None),
                models.CategoryMappingCache.description_normalized == description_normalized,
                models.CategoryMappingCache.transaction_type == tipo
            ).first()
            
            if not global_existing:
                # Criar cache global (sem workspace_id, sem category_id específico)
                global_cache = models.CategoryMappingCache(
                    workspace_id=None,
                    description_normalized=description_normalized,
                    category_id=None,  # Não precisa de category_id específico (cada workspace tem o seu)
                    category_name=category_name,
                    transaction_type=tipo,
                    is_global=True
                )
                db.add(global_cache)
                logger.info(f"Categoria comum guardada no cache global: '{description_normalized}' -> '{category_name}'")
        
        db.commit()
        logger.info(f"Categoria guardada no cache privado: '{description_normalized}' -> '{category_id}'")
    except Exception as e:
        logger.error(f"Erro ao guardar no cache: {str(e)}")
        db.rollback()

def categorize_with_ai(text: str, categories: List[models.Category], tipo: str, original_text: str, workspace_id: uuid.UUID, db: Session) -> Optional[uuid.UUID]:
    """
    Usa Gemini AI para categorizar a transação quando não encontra no cache.
    Retorna category_id ou None.
    """
    if not settings.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY não configurada. Não é possível usar IA para categorizar.")
        return None
    
    # Filtrar apenas categorias do tipo correto (já vem filtrado, mas garantir)
    filtered_categories = [cat for cat in categories if cat.type == tipo]
    if not filtered_categories:
        logger.warning(f"Nenhuma categoria do tipo '{tipo}' disponível")
        return None
    
    try:
        import google.generativeai as genai
        
        genai.configure(api_key=settings.GEMINI_API_KEY)
        
        # Preparar lista de categorias (apenas do tipo correto, formato compacto)
        categories_list = [cat.name for cat in filtered_categories]
        categories_text = ", ".join(categories_list)
        
        # Prompt otimizado e mais direto (menos tokens = mais rápido)
        prompt = f"""Categoriza: "{original_text}"

Categorias: {categories_text}

Responde APENAS com o nome exato da categoria:"""
        
        logger.info(f"Consultando Gemini: '{original_text}' → {categories_list}")
        
        # Usar apenas gemini-flash-latest (mais rápido)
        try:
            model = genai.GenerativeModel('gemini-flash-latest')
            # Configurar para resposta rápida
            response = model.generate_content(
                prompt,
                generation_config={
                    'temperature': 0.1,  # Mais determinístico
                    'max_output_tokens': 20,  # Resposta curta
                }
            )
            ai_category_name = response.text.strip()
            logger.info(f"Resposta Gemini: '{ai_category_name}'")
            
            category_id_found = None
            
            # Procurar categoria correspondente (match exato primeiro)
            for cat in filtered_categories:
                if cat.name.lower() == ai_category_name.lower():
                    logger.info(f"Match exato: '{cat.name}' (id: {cat.id})")
                    category_id_found = cat.id
                    break
            
            # Match parcial (contém)
            if not category_id_found:
                for cat in filtered_categories:
                    if cat.name.lower() in ai_category_name.lower() or ai_category_name.lower() in cat.name.lower():
                        logger.info(f"Match parcial: '{cat.name}' (id: {cat.id})")
                        category_id_found = cat.id
                        break
            
            # Match por primeira palavra
            if not category_id_found:
                first_word = ai_category_name.split()[0] if ai_category_name.split() else ""
                if first_word:
                    for cat in filtered_categories:
                        if first_word.lower() in cat.name.lower():
                            logger.info(f"Match por palavra: '{cat.name}' (id: {cat.id})")
                            category_id_found = cat.id
                            break
            
            if category_id_found:
                # Guardar no cache para futuras utilizações (já é guardado na função chamadora, mas garantir)
                return category_id_found
            else:
                logger.warning(f"Nenhuma categoria encontrada para: '{ai_category_name}'")
                return None
                        
        except Exception as e:
            logger.error(f"Erro ao usar Gemini: {str(e)}")
            return None
        
    except ImportError:
        logger.warning("google-generativeai não instalado. Instale com: pip install google-generativeai")
        return None
    except Exception as e:
        logger.error(f"Erro na categorização IA: {str(e)}")
        return None

def send_telegram_msg(chat_id: int, text: str, reply_markup: Optional[Dict] = None):
    """Envia mensagem para o Telegram"""
    if not settings.TELEGRAM_BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN não configurado")
        return
    
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    
    # Escapar caracteres especiais do Markdown que podem causar erro 400
    # Telegram MarkdownV2 requer escape de: _ * [ ] ( ) ~ ` > # + - = | { } . !
    # Vamos usar HTML que é mais simples e robusto
    payload = {
        'chat_id': chat_id,
        'text': text,
        'parse_mode': 'HTML'  # HTML é mais robusto que Markdown
    }
    if reply_markup:
        payload['reply_markup'] = reply_markup
    
    try:
        response = requests.post(url, json=payload, timeout=5)
        response.raise_for_status()
    except requests.exceptions.HTTPError as e:
        # Tentar sem parse_mode se falhar
        if response.status_code == 400:
            logger.warning(f"Erro 400 ao enviar com HTML, tentando sem parse_mode: {response.text}")
            payload.pop('parse_mode', None)
            try:
                response = requests.post(url, json=payload, timeout=5)
                response.raise_for_status()
            except Exception as e2:
                logger.error(f"Erro ao enviar mensagem Telegram (sem parse_mode): {str(e2)}")
        else:
            logger.error(f"Erro HTTP ao enviar mensagem Telegram: {response.status_code} - {response.text}")
    except Exception as e:
        logger.error(f"Erro ao enviar mensagem Telegram: {str(e)}")

@router.post('/webhook')
@limiter.limit('30/minute')
async def telegram_webhook(
    request: Request, 
    db: Session = Depends(get_db),
    x_telegram_bot_api_secret_token: str | None = Header(None)
):
    """Webhook Telegram com validação de segurança"""
    logger.info("=" * 50)
    logger.info("Webhook Telegram recebido")
    logger.info(f"Headers: X-Telegram-Bot-Api-Secret-Token presente: {x_telegram_bot_api_secret_token is not None}")
    
    try:
        # Validação do secret token
        if settings.TELEGRAM_WEBHOOK_SECRET:
            logger.info(f"Validando secret token... (configurado: {bool(settings.TELEGRAM_WEBHOOK_SECRET)})")
            if not x_telegram_bot_api_secret_token or x_telegram_bot_api_secret_token != settings.TELEGRAM_WEBHOOK_SECRET:
                logger.warning(f"Tentativa de acesso ao webhook sem token válido. Recebido: {x_telegram_bot_api_secret_token is not None}, Esperado: {settings.TELEGRAM_WEBHOOK_SECRET[:10]}...")
                raise HTTPException(status_code=403, detail="Invalid secret token")
            logger.info("Secret token valido [OK]")
        else:
            logger.warning("TELEGRAM_WEBHOOK_SECRET não configurado - validação desativada")
        
        data = await request.json()
        logger.info(f"Payload recebido: {json.dumps(data, indent=2, ensure_ascii=False)[:500]}...")  # Primeiros 500 chars
        
        # Processar callback_query (botões inline)
        if 'callback_query' in data:
            logger.info("Processando callback_query (botão inline)")
            callback_query = data['callback_query']
            chat_id = callback_query['message']['chat']['id']
            callback_data = callback_query.get('data', '')
            message_id = callback_query['message']['message_id']
            logger.info(f"Callback: chat_id={chat_id}, data={callback_data}")
            
            # Verificar rate limit
            if not check_rate_limit(str(chat_id)):
                send_telegram_msg(chat_id, "⚠️ Muitas mensagens. Aguarda um momento.")
                return {'status': 'rate_limited'}
            
            # Buscar utilizador
            user = db.query(models.User).filter(models.User.phone_number == str(chat_id)).first()
            if not user:
                send_telegram_msg(chat_id, "⚠️ Sessão expirada. Envia /start para começar.")
                return {'status': 'unauthorized'}
            
            # Processar callback
            if callback_data.startswith("confirm_"):
                logger.info(f"Processando confirmacao de transacao: {callback_data}")
                # Confirmar transação
                pending_id_hex = callback_data.replace("confirm_", "")
                logger.info(f"Buscando pending transaction com hex: {pending_id_hex}")
                
                # Buscar por hex curto (primeiros 16 caracteres do UUID)
                # Buscar todas as transações pendentes deste chat e filtrar por UUID
                all_pending = db.query(models.TelegramPendingTransaction).filter(
                    models.TelegramPendingTransaction.chat_id == str(chat_id)
                ).all()
                logger.info(f"Encontradas {len(all_pending)} transacoes pendentes para chat_id={chat_id}")
                
                pending = None
                for p in all_pending:
                    logger.info(f"Comparando: {p.id.hex[:16]} com {pending_id_hex}")
                    if p.id.hex.startswith(pending_id_hex):
                        pending = p
                        logger.info(f"Match encontrado! Pending ID: {p.id}, workspace: {p.workspace_id}, amount: {p.amount_cents}")
                        break
                
                if not pending:
                    logger.warning(f"Pending transaction nao encontrada para hex: {pending_id_hex}")
                    send_telegram_msg(chat_id, "❌ Transação não encontrada ou já processada.")
                    return {'status': 'not_found'}
                
                # Criar transação real
                logger.info(f"Criando transacao: workspace_id={pending.workspace_id}, category_id={pending.category_id}, amount_cents={pending.amount_cents}, description={pending.description}, transaction_date={pending.transaction_date}")
                transaction = models.Transaction(
                    workspace_id=pending.workspace_id,
                    category_id=pending.category_id,
                    amount_cents=pending.amount_cents,
                    description=pending.description,
                    transaction_date=pending.transaction_date
                )
                db.add(transaction)
                db.flush()
                logger.info(f"Transacao criada com ID: {transaction.id}, transaction_date: {transaction.transaction_date}, created_at: {transaction.created_at}")
                
                db.delete(pending)
                db.commit()
                logger.info("Transacao confirmada e commitada com sucesso")
                
                # Responder ao callback
                try:
                    requests.post(
                        f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/answerCallbackQuery",
                        json={'callback_query_id': callback_query['id']},
                        timeout=5
                    )
                except Exception as e:
                    logger.error(f"Erro ao responder callback: {str(e)}")
                
                # Editar mensagem
                tipo_emoji = "💸" if pending.amount_cents < 0 else "💰"
                send_telegram_msg(chat_id, f"{tipo_emoji} <b>Transação confirmada!</b>\n\n📝 {pending.description}\n💰 {abs(pending.amount_cents)/100:.2f}€")
                
                logger.info("Callback de confirmacao processado com sucesso")
                return {'status': 'confirmed'}
                
            elif callback_data.startswith("cancel_"):
                # Cancelar transação
                pending_id_hex = callback_data.replace("cancel_", "")
                logger.info(f"Cancelando transação pendente: hex={pending_id_hex}, chat_id={chat_id}")
                
                # Buscar por hex curto (primeiros 16 caracteres do UUID)
                all_pending = db.query(models.TelegramPendingTransaction).filter(
                    models.TelegramPendingTransaction.chat_id == str(chat_id)
                ).all()
                
                logger.info(f"Transações pendentes encontradas para chat_id {chat_id}: {len(all_pending)}")
                
                pending = None
                for p in all_pending:
                    p_hex = p.id.hex[:16]
                    logger.info(f"Comparando: pending_id_hex={pending_id_hex}, p.id.hex[:16]={p_hex}, match={p.id.hex.startswith(pending_id_hex)}")
                    if p.id.hex.startswith(pending_id_hex):
                        pending = p
                        logger.info(f"Transação pendente encontrada: id={p.id}, description={p.description}, amount_cents={p.amount_cents}")
                        break
                
                if pending:
                    db.delete(pending)
                    db.commit()
                    logger.info(f"Transação pendente eliminada com sucesso: id={pending.id}")
                    
                    # Responder ao callback
                    try:
                        requests.post(
                            f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/answerCallbackQuery",
                            json={'callback_query_id': callback_query['id']}
                        )
                        logger.info("Callback query respondido com sucesso")
                    except Exception as e:
                        logger.error(f"Erro ao responder callback query: {str(e)}")
                    
                    send_telegram_msg(chat_id, "❌ Transação cancelada.")
                    logger.info("Mensagem de cancelamento enviada ao utilizador")
                    return {'status': 'cancelled'}
                else:
                    logger.warning(f"Transação pendente não encontrada: hex={pending_id_hex}, chat_id={chat_id}")
                    send_telegram_msg(chat_id, "❌ Transação não encontrada.")
                    return {'status': 'not_found'}
            
            return {'status': 'ok'}
        
        # Processar mensagens normais
        if 'message' not in data:
            logger.info("Payload não contém 'message' - ignorando")
            return {'status': 'ignored'}
        
        logger.info("Processando mensagem normal")
        message = data['message']
        chat_id = message['chat']['id']
        text = message.get('text', '').strip()
        logger.info(f"Mensagem recebida: chat_id={chat_id}, text='{text[:100]}'")
        
        # Verificar rate limit
        if not check_rate_limit(str(chat_id)):
            send_telegram_msg(chat_id, "⚠️ Muitas mensagens. Aguarda um momento.")
            return {'status': 'rate_limited'}
        
        # Comando /start
        if text.startswith('/start'):
            logger.info(f"Comando /start recebido de chat_id={chat_id}")
            user = db.query(models.User).filter(models.User.phone_number == str(chat_id)).first()
            logger.info(f"User encontrado: {user is not None}")
            
            if not user:
                # Primeira vez, pedir email
                send_telegram_msg(chat_id, 
                    "🧘‍♂️ <b>Bem-vindo ao Ecossistema FinanZen.</b>\n\n"
                    "Para começarmos, envia por favor o <b>email</b> que utilizas na plataforma FinanZen.")
                return {'status': 'email_required'}
            else:
                # Já associado
                send_telegram_msg(chat_id,
                    f"✅ <b>Olá de novo!</b>\n\n"
                    f"Podes enviar transações como:\n"
                    f"• Almoço 15€\n"
                    f"• Salário 1000€\n"
                    f"• Gasolina 50€\n\n"
                    f"Envia /info para mais ajuda.")
                return {'status': 'ok'}
        
        # Comandos /info e /help
        if text.startswith('/info') or text.startswith('/help'):
            help_text = (
                "📖 <b>Como usar o bot:</b>\n\n"
                "Envia mensagens no formato:\n"
                "• <code>Descrição Valor€</code>\n\n"
                "<b>Exemplos:</b>\n"
                "• Almoço 15€\n"
                "• Salário 1000€\n"
                "• Ginásio 30€\n"
                "• Almoço 25€ Gasolina 10€ (múltiplas)\n\n"
                "O bot categoriza automaticamente usando IA e histórico."
            )
            send_telegram_msg(chat_id, help_text)
            return {'status': 'ok'}
        
        # Processar email (associação)
        if "@" in text and "." in text:
            logger.info(f"Email detectado na mensagem: {text[:50]}")
            email_limpo = text.lower().replace(" ", "").strip()
            logger.info(f"Email limpo: {email_limpo[:10]}***")
            
            # Validar formato
            if not validate_email(email_limpo):
                logger.warning(f"Email inválido: {email_limpo}")
                send_telegram_msg(chat_id, "⚠️ Por favor, envia um email válido.")
                return {'status': 'invalid_email'}
            
            # Procurar utilizador
            user = db.query(models.User).filter(models.User.email == email_limpo).first()
            
            if not user:
                # Resposta genérica para prevenir email enumeration
                send_telegram_msg(chat_id, 
                    "✅ Email recebido. Se estiver associado a uma conta Pro, já podes começar a usar o bot.")
                logger.warning(f"Tentativa de associação com email não registado: {email_limpo[:5]}***")
                return {'status': 'not_found'}
            
            # Verificar se é conta Pro
            if user.subscription_status not in ['active', 'trialing']:
                send_telegram_msg(chat_id, 
                    "⚠️ Esta funcionalidade requer conta Pro.\n\n"
                    "Faz upgrade na plataforma para usar o bot Telegram.")
                return {'status': 'pro_required'}
            
            # Verificar conflitos (um chat_id só pode estar associado a um email)
            existing_user = db.query(models.User).filter(
                models.User.phone_number == str(chat_id)
            ).first()
            
            if existing_user and existing_user.email != email_limpo:
                # Já está associado a outro email
                send_telegram_msg(chat_id, 
                    "⚠️ Este Telegram já está associado a outra conta.\n\n"
                    f"Conta atual: {existing_user.email[:3]}***")
                return {'status': 'already_associated'}
            
            # Associar Telegram (armazenar chat_id em phone_number)
            old_phone = user.phone_number
            user.phone_number = str(chat_id)
            db.commit()
            
            # Verificar workspace após associação
            workspace_check = db.query(models.Workspace).filter(models.Workspace.owner_id == user.id).first()
            logger.info(f"Conta Telegram associada: email={email_limpo[:10]}***, user_id={user.id}, workspace_id={workspace_check.id if workspace_check else None}, chat_id={chat_id}")
            
            send_telegram_msg(chat_id, 
                f"✅ <b>Conta associada com sucesso!</b>\n\n"
                f"Conta: {user.email[:3]}***\n\n"
                f"Agora podes enviar transações como:\n"
                f"• Almoço 15€\n"
                f"• Salário 1000€")
            return {'status': 'ok'}
        
        # Procurar User
        logger.info(f"Buscando user com phone_number={chat_id}")
        user = db.query(models.User).filter(models.User.phone_number == str(chat_id)).first()
        logger.info(f"User encontrado: {user is not None} (id: {user.id if user else None}, email: {user.email[:10] if user else None}***)")
        if user:
            logger.info(f"telegram_auto_confirm: {user.telegram_auto_confirm}")
            # Verificar workspace do user
            workspace_check = db.query(models.Workspace).filter(models.Workspace.owner_id == user.id).first()
            logger.info(f"Workspace do user Telegram: {workspace_check.id if workspace_check else None}")
        if not user:
            send_telegram_msg(chat_id, 
                "⚠️ Para começares, envia o teu <b>email</b> que utilizas na plataforma FinanZen.\n\n"
                "Ou envia /start para começar.")
            return {'status': 'unauthorized'}
        
        logger.info(f"Buscando workspace para user_id={user.id}")
        workspace = db.query(models.Workspace).filter(models.Workspace.owner_id == user.id).first()
        logger.info(f"Workspace encontrado: {workspace is not None} (id: {workspace.id if workspace else None})")
        if not workspace:
            send_telegram_msg(chat_id, "❌ Workspace não encontrado.")
            return {'status': 'error'}
        
        # Processar fotos (desativado por enquanto)
        if 'photo' in message:
            send_telegram_msg(chat_id, 
                "❌ Processamento de imagens indisponível.\n\n"
                "Por favor, escreve a transação em texto.\n\n"
                "<b>Exemplo:</b> Almoço 15€")
            return {'status': 'error'}
        
        # Processar texto
        if text:
            logger.info(f"Processando texto como transação: '{text}'")
            parsed = parse_transaction(text, workspace, db)
            logger.info(f"Resultado do parsing: {parsed}")
            
            if not parsed:
                logger.warning(f"Não foi possível fazer parse da mensagem: '{text}'")
                send_telegram_msg(chat_id, 
                    "❌ Não consegui entender a mensagem.\n\n"
                    "<b>Tenta formatos como:</b>\n"
                    "• Almoço 15€\n"
                    "• Gasolina 50€\n"
                    "• Recebi 500€")
                return {'status': 'error'}
            
            # Processar múltiplas transações
            if parsed.get('multiple'):
                transactions = parsed['transactions']
                created_count = 0
                
                for trans_data in transactions:
                    amount_cents = int(trans_data['amount'] * 100)
                    if trans_data['type'] == 'expense':
                        amount_cents = -abs(amount_cents)
                    else:
                        amount_cents = abs(amount_cents)
                    
                    if user.telegram_auto_confirm:
                        # Criar diretamente
                        transaction = models.Transaction(
                            workspace_id=workspace.id,
                            category_id=trans_data['category_id'],
                            amount_cents=amount_cents,
                            description=trans_data['description'],
                            transaction_date=date.today()
                        )
                        db.add(transaction)
                        created_count += 1
                    else:
                        # Criar pendente
                        pending = models.TelegramPendingTransaction(
                            chat_id=str(chat_id),
                            workspace_id=workspace.id,
                            category_id=trans_data['category_id'],
                            amount_cents=amount_cents,
                            description=trans_data['description'],
                            transaction_date=date.today()
                        )
                        db.add(pending)
                        db.flush()
                        
                        # Enviar botões de confirmação
                        category = db.query(models.Category).filter(
                            models.Category.id == trans_data['category_id']
                        ).first()
                        category_name = category.name if category else "Outros"
                        
                        tipo_emoji = "💸" if amount_cents < 0 else "💰"
                        message_text = (
                            f"{tipo_emoji} <b>Nova transação</b>\n\n"
                            f"📝 {trans_data['description']}\n"
                            f"💰 {abs(amount_cents)/100:.2f}€\n"
                            f"🏷️ {category_name}\n\n"
                            f"Confirma?"
                        )
                        
                        # Usar UUID curto no callback_data (limite 64 bytes)
                        pending_id_hex = pending.id.hex[:16]
                        reply_markup = {
                            "inline_keyboard": [[
                                {"text": "✅ Confirmar", "callback_data": f"confirm_{pending_id_hex}"},
                                {"text": "❌ Cancelar", "callback_data": f"cancel_{pending_id_hex}"}
                            ]]
                        }
                        send_telegram_msg(chat_id, message_text, reply_markup)
                
                if user.telegram_auto_confirm:
                    db.commit()
                    send_telegram_msg(chat_id, f"✅ {created_count} transação(ões) criada(s)!")
                else:
                    db.commit()
                
                return {'status': 'success'}
            
            # Processar transação única
            amount_cents = int(parsed['amount'] * 100)
            if parsed['type'] == 'expense':
                amount_cents = -abs(amount_cents)
            else:
                amount_cents = abs(amount_cents)
            
            category = db.query(models.Category).filter(
                models.Category.id == parsed['category_id']
            ).first()
            category_name = category.name if category else "Outros"
            
            if user.telegram_auto_confirm:
                logger.info(f"Modo auto_confirm ativo - criando transacao diretamente")
                # Criar transação diretamente
                transaction = models.Transaction(
                    workspace_id=workspace.id,
                    category_id=parsed['category_id'],
                    amount_cents=amount_cents,
                    description=parsed['description'],
                    transaction_date=date.today()
                )
                db.add(transaction)
                db.flush()
                logger.info(f"Transacao criada com ID: {transaction.id}, workspace_id: {workspace.id}, amount_cents: {amount_cents}")
                db.commit()
                logger.info("Transacao commitada com sucesso (auto_confirm)")
                
                tipo_emoji = "💸" if amount_cents < 0 else "💰"
                send_telegram_msg(chat_id, 
                    f"{tipo_emoji} <b>Registado!</b>\n\n"
                    f"📝 {parsed['description']}\n"
                    f"💰 {abs(parsed['amount']):.2f}€\n"
                    f"🏷️ {category_name}")
            else:
                # Criar TelegramPendingTransaction
                pending = models.TelegramPendingTransaction(
                    chat_id=str(chat_id),
                    workspace_id=workspace.id,
                    category_id=parsed['category_id'],
                    amount_cents=amount_cents,
                    description=parsed['description'],
                    transaction_date=date.today()
                )
                db.add(pending)
                db.commit()
                
                # Enviar mensagem com botões de confirmação
                tipo_emoji = "💸" if amount_cents < 0 else "💰"
                message_text = (
                    f"{tipo_emoji} <b>Nova transação</b>\n\n"
                    f"📝 {parsed['description']}\n"
                    f"💰 {abs(parsed['amount']):.2f}€\n"
                    f"🏷️ {category_name}\n\n"
                    f"Confirma?"
                )
                
                # Usar UUID curto no callback_data (limite 64 bytes)
                pending_id_hex = pending.id.hex[:16]
                reply_markup = {
                    "inline_keyboard": [[
                        {"text": "✅ Confirmar", "callback_data": f"confirm_{pending_id_hex}"},
                        {"text": "❌ Cancelar", "callback_data": f"cancel_{pending_id_hex}"}
                    ]]
                }
                send_telegram_msg(chat_id, message_text, reply_markup)
            
            logger.info("Transação processada com sucesso")
            return {'status': 'success'}
        
        logger.info("Mensagem não processada (sem texto)")
        return {'status': 'ignored'}
        
    except Exception as e:
        logger.error(f"Erro Telegram: {str(e)}", exc_info=True)
        import traceback
        logger.error(f"Traceback completo: {traceback.format_exc()}")
        return {'status': 'error'}
