from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import random
import string
import uuid
import requests
from jose import jwt, JWTError
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
import logging
from ..core import security
from ..core.config import settings
from ..core.dependencies import get_db
from ..models import database as models
from ..schemas import schemas
from ..core.limiter import limiter
from ..core.audit import log_action

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/auth', tags=['auth'])

async def get_current_user(db: Session = Depends(get_db), token: str = Depends(security.oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='Could not validate credentials',
        headers={'WWW-Authenticate': 'Bearer'}
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get('sub')
        if email is None:
            raise credentials_exception
        token_data = schemas.TokenData(email=email)
    except JWTError:
        raise credentials_exception
    
    user = db.query(models.User).filter(models.User.email == token_data.email).first()
    if user is None:
        raise credentials_exception
    return user

@router.post('/register', response_model=schemas.UserResponse)
@limiter.limit('30/hour')
async def register(request: Request, user_in: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user_in.email).first()
    if db_user:
        logger.warning(f'Tentativa de registo com email já existente: {user_in.email}')
        raise HTTPException(status_code=400, detail='Este email já está registado e verificado.')
    
    # Remove any existing pending verification for this email
    db.query(models.EmailVerification).filter(models.EmailVerification.email == user_in.email).delete()
    
    hashed_pw = security.get_password_hash(user_in.password)
    token = ''.join(random.choices(string.ascii_letters + string.digits, k=64))
    expires_at = datetime.now() + timedelta(hours=24)
    
    verification = models.EmailVerification(
        email=user_in.email,
        password_hash=hashed_pw,
        token=token,
        expires_at=expires_at
    )
    db.add(verification)
    db.commit()
    
    verify_url = f"{settings.FRONTEND_URL}/auth/verify-email?token={token}"
    html = f'''
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #020617; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }}
            .container {{ max-width: 600px; margin: 40px auto; background-color: #0f172a; border-radius: 32px; overflow: hidden; border: 1px solid #1e293b; box-shadow: 0 40px 100px -20px rgba(0,0,0,0.8); }}
            .header {{ background: #020617; padding: 60px 20px; text-align: center; border-bottom: 1px solid #1e293b; }}
            .logo {{ font-size: 36px; font-weight: 900; color: #ffffff; letter-spacing: -1.5px; }}
            .logo span {{ color: #3b82f6; font-style: italic; }}
            .content {{ padding: 50px; color: #94a3b8; line-height: 1.8; text-align: center; }}
            .content h2 {{ color: #ffffff; margin-top: 0; font-size: 28px; font-weight: 900; letter-spacing: -1px; }}
            .btn {{ display: inline-block; padding: 20px 45px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 20px; font-weight: 900; font-size: 15px; text-transform: uppercase; letter-spacing: 2px; margin: 35px 0; transition: all 0.3s ease; box-shadow: 0 15px 30px rgba(59, 130, 246, 0.3); }}
            .footer {{ background-color: #020617; padding: 40px; text-align: center; border-top: 1px solid #1e293b; color: #475569; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 3px; }}
            .security-notice {{ font-size: 12px; color: #334155; margin-top: 30px; font-style: italic; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">Finan<span>Zen</span></div>
            </div>
            <div class="content">
                <h2>O seu futuro começa agora.</h2>
                <p>Bem-vindo à elite financeira. Falta apenas validar o seu acesso para desbloquear o controlo total sobre o seu património.</p>
                <a href="{verify_url}" class="btn">Ativar Conta Premium</a>
                <p class="security-notice">Este link é pessoal, intransmissível e expira em 24 horas.</p>
            </div>
            <div class="footer">
                FinanZen Portugal © 2026 <br> High-End Financial Management
            </div>
        </div>
    </body>
    </html>
    '''
    
    message = MessageSchema(
        subject='FinanZen - Confirme o seu registo',
        recipients=[user_in.email],
        body=html,
        subtype=MessageType.html
    )
    
    from ..core.dependencies import conf
    fm = FastMail(conf)
    try:
        await fm.send_message(message)
    except Exception as e:
        logger.error(f'Erro ao enviar email de verificação: {str(e)}')
    
    logger.info(f'Novo registo pendente (aguardando verificação): {user_in.email}')
    
    return {
        'id': uuid.uuid4(),
        'email': user_in.email,
        'is_active': True,
        'is_email_verified': False,
        'is_onboarded': False,
        'marketing_opt_in': False,
        'currency': 'EUR',
        'created_at': datetime.now()
    }

@router.get('/verification-status/{email}')
async def check_verification_status(email: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    return {'is_verified': user.is_email_verified if user else False}

@router.get('/verify-email')
async def verify_email(request: Request, token: str, db: Session = Depends(get_db)):
    verification = db.query(models.EmailVerification).filter(
        models.EmailVerification.token == token,
        models.EmailVerification.is_used == False,
        models.EmailVerification.expires_at > datetime.now()
    ).first()
    
    if not verification:
        raise HTTPException(status_code=400, detail='Token de verificação inválido ou expirado.')
    
    user = db.query(models.User).filter(models.User.email == verification.email).first()
    
    if not user:
        user = models.User(
            email=verification.email,
            password_hash=verification.password_hash,
            is_email_verified=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        new_workspace = models.Workspace(owner_id=user.id, name='Meu Workspace')
        db.add(new_workspace)
        db.commit()
        
        logger.info(f'Utilizador criado e verificado: {user.email}')
        await log_action(db, action='register_success', user_id=user.id, details=f'Novo utilizador registado: {user.email}', request=request)
    else:
        user.is_email_verified = True
        db.commit()
    
    verification.is_used = True
    db.commit()
    
    access_token = security.create_access_token(subject=user.email)
    refresh_token = security.create_refresh_token(subject=user.email)
    
    return {
        'message': 'Email verificado com sucesso!',
        'access_token': access_token,
        'refresh_token': refresh_token,
        'token_type': 'bearer'
    }

@router.get('/me', response_model=schemas.UserResponse)
async def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user

@router.post('/onboarding', response_model=schemas.UserResponse)
async def complete_onboarding(onboarding_data: schemas.UserUpdateOnboarding, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.full_name = onboarding_data.full_name
    current_user.phone_number = onboarding_data.phone_number
    current_user.currency = onboarding_data.currency
    current_user.gender = onboarding_data.gender
    current_user.marketing_opt_in = onboarding_data.marketing_opt_in
    current_user.is_onboarded = True
    
    db.commit()
    db.refresh(current_user)
    
    logger.info(f'Utilizador completou onboarding: {current_user.email}')
    return current_user

@router.patch('/profile', response_model=schemas.UserResponse)
async def update_profile(request: Request, onboarding_data: schemas.UserUpdateOnboarding, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.full_name = onboarding_data.full_name
    current_user.phone_number = onboarding_data.phone_number
    current_user.currency = onboarding_data.currency
    current_user.gender = onboarding_data.gender
    current_user.marketing_opt_in = onboarding_data.marketing_opt_in
    current_user.is_onboarded = True
    
    db.commit()
    db.refresh(current_user)
    
    await log_action(db, action='profile_update', user_id=current_user.id, details=f'Perfil atualizado: {current_user.email}', request=request)
    logger.info(f'Utilizador atualizou perfil: {current_user.email}')
    return current_user

@router.delete('/account')
async def delete_user_account(request: Request, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        user_email = current_user.email
        user_id = current_user.id
        db.delete(current_user)
        db.commit()
        
        await log_action(db, action='account_delete', user_id=user_id, details=f'Conta eliminada por utilizador: {user_email}', request=request)
        logger.info(f'Utilizador eliminou a conta: {user_email}')
        return {'message': 'Account deleted successfully'}
    except Exception as e:
        db.rollback()
        logger.error(f'Erro ao eliminar conta {current_user.email}: {str(e)}')
        raise HTTPException(status_code=500, detail='Erro ao eliminar a conta.')

@router.post('/login', response_model=schemas.Token)
@limiter.limit('5/minute')
async def login(request: Request, db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not security.verify_password(form_data.password, user.password_hash):
        logger.warning(f'Falha de login para: {form_data.username} de {request.client.host}')
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Incorrect email or password',
            headers={'WWW-Authenticate': 'Bearer'}
        )
    
    if not user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Por favor, confirme o seu email antes de fazer login.'
        )
    
    user.login_count += 1
    user.last_login = datetime.now()
    db.commit()
    
    await log_action(db, action='login', user_id=user.id, details=f'Login bem-sucedido: {user.email}', request=request)
    
    access_token = security.create_access_token(subject=user.email)
    refresh_token = security.create_refresh_token(subject=user.email)
    
    logger.info(f'Login bem-sucedido: {user.email}')
    return {
        'access_token': access_token,
        'refresh_token': refresh_token,
        'token_type': 'bearer'
    }

@router.post('/password-reset/request')
@limiter.limit('3/hour')
async def request_password_reset(request: Request, data: schemas.PasswordResetRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        logger.warning(f'Pedido de reset de password para email inexistente: {data.email}')
        raise HTTPException(status_code=404, detail='Não existe nenhuma conta associada a este email.')
    
    code = ''.join(random.choices(string.digits, k=6) )
    expires_at = datetime.now() + timedelta(minutes=15)
    
    reset_obj = models.PasswordReset(email=data.email, code=code, expires_at=expires_at)
    db.add(reset_obj)
    db.commit()
    
    await log_action(db, action='password_reset_request', user_id=user.id, details=f'Pedido de reset: {data.email}', request=request)
    
    html = f'''
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #020617; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }}
            .container {{ max-width: 600px; margin: 40px auto; background-color: #0f172a; border-radius: 32px; overflow: hidden; border: 1px solid #1e293b; box-shadow: 0 40px 100px -20px rgba(0,0,0,0.8); }}
            .header {{ background: #020617; padding: 60px 20px; text-align: center; border-bottom: 1px solid #1e293b; }}
            .logo {{ font-size: 36px; font-weight: 900; color: #ffffff; letter-spacing: -1.5px; }}
            .logo span {{ color: #3b82f6; font-style: italic; }}
            .content {{ padding: 50px; color: #94a3b8; line-height: 1.8; text-align: center; }}
            .content h2 {{ color: #ffffff; margin-top: 0; font-size: 28px; font-weight: 900; letter-spacing: -1px; }}
            .code-box {{ background-color: #020617; border: 2px dashed #1e293b; border-radius: 24px; padding: 45px; text-align: center; margin: 35px 0; }}
            .code {{ font-size: 52px; font-weight: 900; color: #3b82f6; letter-spacing: 12px; margin: 0; text-shadow: 0 0 30px rgba(59, 130, 246, 0.4); }}
            .footer {{ background-color: #020617; padding: 40px; text-align: center; border-top: 1px solid #1e293b; color: #475569; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 3px; }}
            .security-notice {{ font-size: 12px; color: #334155; margin-top: 30px; font-style: italic; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">Finan<span>Zen</span></div>
            </div>
            <div class="content">
                <h2>Recuperação de Acesso</h2>
                <p>Recebemos um pedido para redefinir a sua password. Utilize o código de segurança abaixo para prosseguir com a redefinição:</p>
                <div class="code-box">
                    <p style="margin-bottom: 15px; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #475569; font-weight: 800;">Código de Segurança</p>
                    <div class="code">{code}</div>
                </div>
                <p class="security-notice">Este código é válido por apenas 15 minutos e destina-se apenas ao destinatário deste email.</p>
            </div>
            <div class="footer">
                FinanZen Portugal © 2026 <br> Segurança Bancária Certificada
            </div>
        </div>
    </body>
    </html>
    '''
    
    current_conf = ConnectionConfig(
        MAIL_USERNAME=settings.MAIL_USERNAME.strip(),
        MAIL_PASSWORD=settings.MAIL_PASSWORD.strip(),
        MAIL_FROM=settings.MAIL_FROM.strip(),
        MAIL_PORT=settings.MAIL_PORT,
        MAIL_SERVER=settings.MAIL_SERVER,
        MAIL_STARTTLS=True,
        MAIL_SSL_TLS=False,
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True,
        MAIL_FROM_NAME='FinanZen Portugal'
    )
    
    message = MessageSchema(
        subject='FinanZen - Código de Recuperação',
        recipients=[data.email],
        body=html,
        subtype=MessageType.html
    )
    
    fm = FastMail(current_conf)
    try:
        await fm.send_message(message)
    except Exception as e:
        logger.error(f'ERRO CRÍTICO EMAIL para {data.email}: {str(e)}')
    
    return {'message': 'Código de recuperação enviado para o email.'}

@router.post('/password-reset/verify')
async def verify_reset_code(request: Request, data: schemas.PasswordResetVerify, db: Session = Depends(get_db)):
    reset_obj = db.query(models.PasswordReset).filter(
        models.PasswordReset.email == data.email,
        models.PasswordReset.code == data.code,
        models.PasswordReset.is_used == False,
        models.PasswordReset.expires_at > datetime.now()
    ).first()
    
    if not reset_obj:
        raise HTTPException(status_code=400, detail='Código inválido ou expirado')
    
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if user:
        await log_action(db, action='password_reset_verify', user_id=user.id, details=f'Código verificado: {data.email}', request=request)
    
    return {'message': 'Código verificado com sucesso.'}

@router.post('/password-reset/confirm')
async def confirm_password_reset(request: Request, data: schemas.PasswordResetConfirm, db: Session = Depends(get_db)):
    reset_obj = db.query(models.PasswordReset).filter(
        models.PasswordReset.email == data.email,
        models.PasswordReset.code == data.code,
        models.PasswordReset.is_used == False,
        models.PasswordReset.expires_at > datetime.now()
    ).first()
    
    if not reset_obj:
        raise HTTPException(status_code=400, detail='Código inválido ou expirado')
    
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail='Utilizador não encontrado')
    
    user.password_hash = security.get_password_hash(data.new_password)
    reset_obj.is_used = True
    db.commit()
    
    await log_action(db, action='password_reset_confirm', user_id=user.id, details=f'Password redefinida: {user.email}', request=request)
    return {'message': 'Password alterada com sucesso!'}

@router.post('/social-login', response_model=schemas.Token)
async def social_login(request: Request, data: schemas.SocialLoginRequest, db: Session = Depends(get_db)):
    email = None
    social_id = None
    
    if data.provider == 'google':
        try:
            google_response = requests.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                headers={'Authorization': f'Bearer {data.token}'}
            )
            if google_response.status_code != 200:
                raise Exception('Falha ao validar token com a Google')
            idinfo = google_response.json()
            email = idinfo.get('email')
            social_id = idinfo.get('sub')
        except Exception as e:
            raise HTTPException(status_code=400, detail='Token do Google inválido ou expirado')
    
    if not email:
        raise HTTPException(status_code=400, detail='Não foi possível obter o email do provedor social')
    
    user = db.query(models.User).filter(models.User.email == email).first()
    
    if not user:
        user = models.User(
            email=email,
            google_id=social_id if data.provider == 'google' else None,
            is_email_verified=True,
            login_count=1,
            last_login=datetime.now()
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        new_workspace = models.Workspace(owner_id=user.id, name='Meu Workspace')
        db.add(new_workspace)
        db.commit()
    else:
        if data.provider == 'google' and not user.google_id:
            user.google_id = social_id
        user.login_count += 1
        user.last_login = datetime.now()
        db.commit()
    
    await log_action(db, action='login_social', user_id=user.id, details=f'Login via {data.provider}: {user.email}', request=request)
    
    access_token = security.create_access_token(subject=user.email)
    refresh_token = security.create_refresh_token(subject=user.email)
    
    logger.info(f"Login social bem-sucedido para {user.email}. Token gerado.")
    
    return {
        'access_token': access_token,
        'refresh_token': refresh_token,
        'token_type': 'bearer'
    }

