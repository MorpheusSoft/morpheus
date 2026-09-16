import random
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import get_db, get_current_active_user
from app.models.core import User
from app.models.digital_workers import DigitalWorker, DigitalSkill, DigitalWorkerSkill, DigitalWorkerActionLog
from app.schemas.digital_workers import (
    DigitalWorkerResponse,
    DigitalWorkerCreate,
    DigitalWorkerUpdate,
    DigitalSkill as DigitalSkillSchema,
    DigitalWorkerActionLogResponse,
    SkillToggleRequest,
    WorkerRunResponse,
    TelegramChannelConfigRequest,
    TelegramChannelTestRequest,
    TelegramChannelStatusResponse
)
from app.services.digital_worker_service import (
    get_all_workers,
    get_worker_by_id,
    get_all_skills,
    toggle_worker_skill,
    get_worker_actions,
    run_worker_cycle
)
from app.services.telegram_client import (
    get_bot_me,
    set_telegram_webhook,
    get_telegram_webhook_info,
    delete_telegram_webhook
)

router = APIRouter()

@router.get("/", response_model=List[DigitalWorkerResponse])
def read_workers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retorna la lista de todos los Usuarios Digitales (AI Workers) configurados.
    """
    return get_all_workers(db)

@router.get("/skills", response_model=List[DigitalSkillSchema])
def read_all_skills(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retorna el catálogo global de habilidades disponibles en la plataforma.
    """
    return get_all_skills(db)

@router.get("/{worker_id}", response_model=DigitalWorkerResponse)
def read_worker(
    worker_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    worker = get_worker_by_id(worker_id, db)
    if not worker:
        raise HTTPException(status_code=404, detail="Usuario Digital no encontrado")
    return worker

@router.put("/{worker_id}", response_model=DigitalWorkerResponse)
def update_worker(
    worker_id: int,
    payload: DigitalWorkerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    worker = get_worker_by_id(worker_id, db)
    if not worker:
        raise HTTPException(status_code=404, detail="Usuario Digital no encontrado")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(worker, field, value)

    if "channel_config" in update_data:
        flag_modified(worker, "channel_config")
    if "guardrails_config" in update_data:
        flag_modified(worker, "guardrails_config")

    db.commit()
    db.refresh(worker)
    return worker

@router.post("/{worker_id}/skills/{skill_id}/toggle")
def toggle_skill(
    worker_id: int,
    skill_id: int,
    payload: SkillToggleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    worker = get_worker_by_id(worker_id, db)
    if not worker:
        raise HTTPException(status_code=404, detail="Usuario Digital no encontrado")

    skill = db.query(DigitalSkill).filter(DigitalSkill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Habilidad no encontrada")

    assignment = toggle_worker_skill(
        worker_id=worker_id,
        skill_id=skill_id,
        is_enabled=payload.is_enabled,
        parameters=payload.parameters,
        db=db
    )
    return {
        "message": f"Habilidad '{skill.name}' {'activada' if payload.is_enabled else 'desactivada'} exitosamente.",
        "assignment_id": assignment.id,
        "is_enabled": assignment.is_enabled
    }

@router.post("/{worker_id}/run", response_model=WorkerRunResponse)
def trigger_worker_run(
    worker_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Dispara la ejecución manual inmediata de todas las habilidades activas del Usuario Digital.
    """
    worker = get_worker_by_id(worker_id, db)
    if not worker:
        raise HTTPException(status_code=404, detail="Usuario Digital no encontrado")

    try:
        summary = run_worker_cycle(worker.agent_code, db)
        return WorkerRunResponse(
            status="SUCCESS",
            agent_code=worker.agent_code,
            summary=summary
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error ejecutando ciclo: {str(e)}")

@router.get("/{worker_id}/actions", response_model=List[DigitalWorkerActionLogResponse])
def read_worker_actions(
    worker_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retorna la bitácora de auditoría y acciones ejecutadas por el Usuario Digital.
    """
    worker = get_worker_by_id(worker_id, db)
    if not worker:
        raise HTTPException(status_code=404, detail="Usuario Digital no encontrado")

    return get_worker_actions(worker_id, db, limit=limit)

@router.post("/{worker_id}/generate-pin")
def generate_pairing_pin(
    worker_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Genera un nuevo PIN de vinculación de 6 dígitos para asociar WhatsApp o Telegram de un supervisor humano a este Usuario Digital.
    """
    worker = get_worker_by_id(worker_id, db)
    if not worker:
        raise HTTPException(status_code=404, detail="Usuario Digital no encontrado")

    new_pin = f"{random.randint(100000, 999999)}"
    current_user.pairing_pin = new_pin
    db.commit()
    db.refresh(current_user)

    telegram_bot = "neo_dante_it_bot" if worker.agent_code == "DANTE_IT" else f"{worker.agent_code.lower()}_bot"
    if worker.channel_config and isinstance(worker.channel_config, dict):
        tg_conf = worker.channel_config.get("telegram", {})
        if isinstance(tg_conf, dict) and tg_conf.get("bot_username"):
            telegram_bot = tg_conf.get("bot_username").replace("@", "")

    return {
        "worker_id": worker.id,
        "agent_code": worker.agent_code,
        "display_title": worker.display_title,
        "pairing_pin": new_pin,
        "telegram_bot_username": telegram_bot,
        "telegram_deep_link": f"https://t.me/{telegram_bot}?start=VINCULAR_{new_pin}",
        "instructions": f"Para vincular Telegram abra t.me/{telegram_bot}?start=VINCULAR_{new_pin} o envíe '/vincular {new_pin}'. Para WhatsApp envíe 'Vincular {new_pin}'."
    }

@router.get("/{worker_id}/channel-config/telegram", response_model=TelegramChannelStatusResponse)
async def get_worker_telegram_config(
    worker_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Consulta la configuración guardada del bot de Telegram y verifica el estado en vivo contra Telegram API.
    """
    worker = get_worker_by_id(worker_id, db)
    if not worker:
        raise HTTPException(status_code=404, detail="Usuario Digital no encontrado")

    tg_conf = {}
    if worker.channel_config and isinstance(worker.channel_config, dict):
        tg_conf = worker.channel_config.get("telegram", {}) or {}

    token = tg_conf.get("token")
    if not token:
        default_username = "neo_dante_it_bot" if worker.agent_code == "DANTE_IT" else None
        return TelegramChannelStatusResponse(
            is_configured=False,
            enabled=False,
            bot_username=tg_conf.get("bot_username") or default_username
        )

    # Consultar estado en vivo contra Telegram API
    bot_info = await get_bot_me(bot_token=token)
    webhook_info = await get_telegram_webhook_info(bot_token=token)

    bot_ok = bot_info.get("ok", False)
    bot_res = bot_info.get("result", {})
    wh_res = webhook_info.get("result", {})

    return TelegramChannelStatusResponse(
        is_configured=bot_ok,
        enabled=tg_conf.get("enabled", True),
        bot_id=bot_res.get("id"),
        bot_username=bot_res.get("username") or tg_conf.get("bot_username"),
        bot_first_name=bot_res.get("first_name") or tg_conf.get("bot_first_name"),
        webhook_url=wh_res.get("url") or tg_conf.get("webhook_url"),
        webhook_registered=bool(wh_res.get("url")),
        webhook_info=wh_res,
        updated_at=tg_conf.get("updated_at")
    )

@router.post("/{worker_id}/channel-config/telegram")
async def save_worker_telegram_config(
    worker_id: int,
    payload: TelegramChannelConfigRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Guarda el Token del bot de Telegram en BD y registra automáticamente el webhook oficial en Telegram API.
    """
    worker = get_worker_by_id(worker_id, db)
    if not worker:
        raise HTTPException(status_code=404, detail="Usuario Digital no encontrado")

    clean_token = payload.token.strip()
    if not clean_token:
        raise HTTPException(status_code=400, detail="El token de Telegram no puede estar vacío.")

    # 1. Validar Token contra Telegram API
    bot_info = await get_bot_me(bot_token=clean_token)
    if not bot_info.get("ok"):
        err_msg = bot_info.get("description", "Token inválido o no reconocido por Telegram")
        raise HTTPException(status_code=400, detail=f"Error de validación con Telegram: {err_msg}")

    bot_res = bot_info.get("result", {})
    bot_id = bot_res.get("id")
    bot_username = bot_res.get("username")
    bot_first_name = bot_res.get("first_name")

    # 2. Registrar Webhook si fue solicitado
    webhook_result = None
    default_webhook_url = f"https://api.qa.morpheussoft.net/api/v1/telegram/{worker.agent_code.lower()}/webhook"
    webhook_url = (payload.custom_webhook_url or default_webhook_url).strip()

    if payload.auto_register_webhook:
        webhook_result = await set_telegram_webhook(
            webhook_url=webhook_url,
            bot_token=clean_token
        )

    # 3. Actualizar channel_config en worker
    current_config = dict(worker.channel_config or {})
    current_config["telegram"] = {
        "enabled": payload.enabled if payload.enabled is not None else True,
        "token": clean_token,
        "bot_id": bot_id,
        "bot_username": bot_username,
        "bot_first_name": bot_first_name,
        "webhook_url": webhook_url if payload.auto_register_webhook else None,
        "webhook_registered": webhook_result.get("ok", False) if webhook_result else False,
        "updated_at": datetime.utcnow().isoformat()
    }

    worker.channel_config = current_config
    flag_modified(worker, "channel_config")
    db.commit()
    db.refresh(worker)

    return {
        "success": True,
        "message": f"Canal de Telegram configurado exitosamente para {bot_first_name} (@{bot_username}).",
        "bot": {
            "id": bot_id,
            "username": bot_username,
            "first_name": bot_first_name
        },
        "webhook": {
            "url": webhook_url if payload.auto_register_webhook else None,
            "registered": webhook_result.get("ok", False) if webhook_result else False,
            "response": webhook_result
        },
        "channel_config": worker.channel_config
    }

@router.post("/{worker_id}/channel-config/telegram/test")
async def test_telegram_token(
    worker_id: int,
    payload: TelegramChannelTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Prueba un token contra Telegram API en vivo sin guardarlo todavía.
    """
    clean_token = payload.token.strip()
    if not clean_token:
        raise HTTPException(status_code=400, detail="Token no suministrado")

    bot_info = await get_bot_me(bot_token=clean_token)
    if not bot_info.get("ok"):
        return {
            "success": False,
            "error": bot_info.get("description", "Token inválido")
        }

    webhook_info = await get_telegram_webhook_info(bot_token=clean_token)
    return {
        "success": True,
        "bot": bot_info.get("result"),
        "webhook": webhook_info.get("result")
    }

@router.post("/{worker_id}/channel-config/telegram/delete-webhook")
async def delete_worker_telegram_webhook(
    worker_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Elimina el webhook de Telegram y desactiva la recepción en tiempo real para este bot.
    """
    worker = get_worker_by_id(worker_id, db)
    if not worker:
        raise HTTPException(status_code=404, detail="Usuario Digital no encontrado")

    tg_conf = (worker.channel_config or {}).get("telegram", {})
    token = tg_conf.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="No hay token de Telegram configurado")

    res = await delete_telegram_webhook(bot_token=token)

    current_config = dict(worker.channel_config or {})
    if "telegram" in current_config:
        current_config["telegram"]["webhook_registered"] = False
        current_config["telegram"]["webhook_url"] = None
        current_config["telegram"]["updated_at"] = datetime.utcnow().isoformat()
        worker.channel_config = current_config
        flag_modified(worker, "channel_config")
        db.commit()
        db.refresh(worker)

    return {
        "success": True,
        "message": "Webhook eliminado exitosamente de Telegram",
        "telegram_response": res
    }
