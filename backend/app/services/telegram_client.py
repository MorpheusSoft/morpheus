import logging
import os
from typing import Optional, Union, Dict, Any, List
import httpx
from sqlalchemy.orm import Session

from app.core.config import settings

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org"


def get_bot_token(agent_code: str = "DANTE_IT", db: Optional[Session] = None) -> Optional[str]:
    """
    Obtiene el Token HTTP API de Telegram para el agente solicitado.
    Busca por prioridad:
    1. channel_config en la base de datos para ese agente (usando db o creando sesión efímera).
    2. Variable de configuración en settings (ej. TELEGRAM_DANTE_BOT_TOKEN).
    3. Variable de entorno del sistema.
    """
    clean_code = (agent_code or "DANTE_IT").upper()
    try:
        if db:
            from app.models.digital_workers import DigitalWorker
            worker = db.query(DigitalWorker).filter(
                (DigitalWorker.agent_code == clean_code) |
                (DigitalWorker.agent_code == f"{clean_code}_IT") |
                (DigitalWorker.agent_code == "DANTE_IT" if "DANTE" in clean_code else False)
            ).first()
            if worker and worker.channel_config and isinstance(worker.channel_config, dict):
                tg = worker.channel_config.get("telegram", {})
                if isinstance(tg, dict) and tg.get("token"):
                    return tg.get("token").strip()
        else:
            from app.api.deps import SessionLocal
            with SessionLocal() as session:
                return get_bot_token(clean_code, db=session)
    except Exception as e:
        logger.warning(f"Error consultando token de Telegram en BD para {agent_code}: {e}")

    # Fallback a settings / variables de entorno
    if "DANTE" in clean_code:
        token = settings.TELEGRAM_DANTE_BOT_TOKEN or os.getenv("TELEGRAM_DANTE_BOT_TOKEN")
        if token:
            return token.strip()

    # Fallback genérico
    env_token = os.getenv(f"TELEGRAM_{clean_code}_BOT_TOKEN") or os.getenv("TELEGRAM_BOT_TOKEN")
    return env_token.strip() if env_token else None


def get_bot_username(agent_code: str = "DANTE_IT", db: Optional[Session] = None) -> str:
    """
    Retorna el username del bot en Telegram (ej: neo_dante_it_bot).
    """
    clean_code = (agent_code or "DANTE_IT").upper()
    try:
        if db:
            from app.models.digital_workers import DigitalWorker
            worker = db.query(DigitalWorker).filter(
                (DigitalWorker.agent_code == clean_code) |
                (DigitalWorker.agent_code == f"{clean_code}_IT") |
                (DigitalWorker.agent_code == "DANTE_IT" if "DANTE" in clean_code else False)
            ).first()
            if worker and worker.channel_config and isinstance(worker.channel_config, dict):
                tg = worker.channel_config.get("telegram", {})
                if isinstance(tg, dict) and tg.get("bot_username"):
                    return tg.get("bot_username").strip().replace("@", "")
        else:
            from app.api.deps import SessionLocal
            with SessionLocal() as session:
                return get_bot_username(clean_code, db=session)
    except Exception:
        pass

    if "DANTE" in clean_code:
        fallback = settings.TELEGRAM_DANTE_BOT_USERNAME or os.getenv("TELEGRAM_DANTE_BOT_USERNAME") or "neo_dante_it_bot"
        return fallback.strip().replace("@", "")

    return f"{clean_code.lower()}_neo_erp_bot"


async def send_telegram_message(
    chat_id: Union[int, str],
    text: str,
    parse_mode: Optional[str] = "Markdown",
    bot_token: Optional[str] = None,
    agent_code: str = "DANTE_IT",
    disable_web_page_preview: bool = True
) -> bool:
    """
    Despacha un mensaje asíncrono a Telegram mediante httpx.
    Si el parse_mode falla (por caracteres Markdown no escapados), reintenta automáticamente en texto plano.
    """
    token = bot_token or get_bot_token(agent_code)
    if not token or token.startswith("PLACEHOLDER") or token == "NONE":
        logger.warning(f"[TELEGRAM CLIENT] Token no configurado para agente {agent_code}. Mensaje simulado a {chat_id}: {text[:80]}...")
        return False

    url = f"{TELEGRAM_API_BASE}/bot{token}/sendMessage"
    payload: Dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": disable_web_page_preview
    }
    if parse_mode:
        payload["parse_mode"] = parse_mode

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                return True

            # Si falló por formato Markdown, reintentar sin parse_mode
            err_body = resp.text
            if "can't parse entities" in err_body or "parse" in err_body.lower():
                logger.warning(f"[TELEGRAM CLIENT] Error de parseo Markdown, reintentando sin parse_mode: {err_body}")
                payload.pop("parse_mode", None)
                retry_resp = await client.post(url, json=payload)
                return retry_resp.status_code == 200

            logger.error(f"[TELEGRAM CLIENT ERROR] Telegram API devolvió status {resp.status_code}: {err_body}")
            return False
    except Exception as e:
        logger.error(f"[TELEGRAM CLIENT EXCEPTION] Excepción enviando a Telegram chat {chat_id}: {e}")
        return False


def send_telegram_message_sync(
    chat_id: Union[int, str],
    text: str,
    parse_mode: Optional[str] = "Markdown",
    bot_token: Optional[str] = None,
    agent_code: str = "DANTE_IT",
    disable_web_page_preview: bool = True
) -> bool:
    """
    Despacha un mensaje síncrono a Telegram mediante httpx.
    Ideal para llamadas desde tareas programadas, daemons de monitoreo o funciones síncronas.
    """
    token = bot_token or get_bot_token(agent_code)
    if not token or token.startswith("PLACEHOLDER") or token == "NONE":
        logger.warning(f"[TELEGRAM CLIENT SYNC] Token no configurado para {agent_code}. Mensaje simulado: {text[:80]}...")
        return False

    url = f"{TELEGRAM_API_BASE}/bot{token}/sendMessage"
    payload: Dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": disable_web_page_preview
    }
    if parse_mode:
        payload["parse_mode"] = parse_mode

    try:
        with httpx.Client(timeout=12.0) as client:
            resp = client.post(url, json=payload)
            if resp.status_code == 200:
                return True

            err_body = resp.text
            if "can't parse entities" in err_body or "parse" in err_body.lower():
                payload.pop("parse_mode", None)
                retry_resp = client.post(url, json=payload)
                return retry_resp.status_code == 200

            logger.error(f"[TELEGRAM CLIENT SYNC ERROR] Telegram API status {resp.status_code}: {err_body}")
            return False
    except Exception as e:
        logger.error(f"[TELEGRAM CLIENT SYNC EXCEPTION] Error enviando a {chat_id}: {e}")
        return False


def send_telegram_alert_sync(
    text: str,
    group_id: Optional[Union[int, str]] = None,
    bot_token: Optional[str] = None,
    db: Optional[Session] = None,
    agent_code: str = "DANTE_IT"
) -> int:
    """
    Difunde una alerta crítica síncrona tanto al grupo oficial de soporte de TI
    como a todos los supervisores que tengan su cuenta de Telegram vinculada en core.users.
    Retorna la cantidad de mensajes despachados exitosamente.
    """
    target_chats = set()

    # 1. Grupo configurado
    configured_group = group_id or settings.TELEGRAM_ALERT_GROUP_ID or os.getenv("TELEGRAM_ALERT_GROUP_ID")
    if configured_group:
        target_chats.add(str(configured_group))

    # 2. Supervisores vinculados en la base de datos
    if db:
        try:
            from app.models.core import User
            from app.models.digital_workers import DigitalWorkerConversation
            supervisors = db.query(User.telegram_chat_id).filter(
                User.telegram_chat_id.isnot(None),
                User.is_active == True
            ).all()
            for (chat_id,) in supervisors:
                if chat_id:
                    target_chats.add(str(chat_id))

            conv_chats = db.query(DigitalWorkerConversation.external_sender_id).filter(
                DigitalWorkerConversation.channel == "TELEGRAM",
                DigitalWorkerConversation.is_authenticated == True
            ).all()
            for (cid,) in conv_chats:
                if cid:
                    target_chats.add(str(cid))
        except Exception as e:
            logger.warning(f"Error consultando usuarios vinculados de Telegram: {e}")

    if not target_chats:
        logger.warning("[TELEGRAM ALERT] No hay destinatarios configurados para la alerta.")
        return 0

    success_count = 0
    token = bot_token or get_bot_token(agent_code, db=db)
    for cid in target_chats:
        if send_telegram_message_sync(chat_id=cid, text=text, bot_token=token, agent_code=agent_code):
            success_count += 1

    return success_count


async def set_telegram_webhook(
    webhook_url: str,
    secret_token: Optional[str] = None,
    bot_token: Optional[str] = None,
    agent_code: str = "DANTE_IT",
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Registra la URL del webhook en los servidores de Telegram.
    """
    token = bot_token or get_bot_token(agent_code, db=db)
    if not token:
        return {"ok": False, "description": "Token no encontrado"}

    url = f"{TELEGRAM_API_BASE}/bot{token}/setWebhook"
    payload: Dict[str, Any] = {
        "url": webhook_url,
        "drop_pending_updates": False
    }
    secret = secret_token or settings.TELEGRAM_DANTE_WEBHOOK_SECRET
    if secret:
        payload["secret_token"] = secret

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=payload)
        return resp.json()


async def delete_telegram_webhook(
    drop_pending_updates: bool = False,
    bot_token: Optional[str] = None,
    agent_code: str = "DANTE_IT",
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Elimina el webhook configurado en Telegram para volver a modo sondeo (polling) o pausar el bot.
    """
    token = bot_token or get_bot_token(agent_code, db=db)
    if not token:
        return {"ok": False, "description": "Token no encontrado"}

    url = f"{TELEGRAM_API_BASE}/bot{token}/deleteWebhook"
    payload = {"drop_pending_updates": drop_pending_updates}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=payload)
        return resp.json()


async def get_telegram_webhook_info(
    bot_token: Optional[str] = None,
    agent_code: str = "DANTE_IT",
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Consulta el estado del webhook actual configurado en Telegram.
    """
    token = bot_token or get_bot_token(agent_code, db=db)
    if not token:
        return {"ok": False, "description": "Token no encontrado"}

    url = f"{TELEGRAM_API_BASE}/bot{token}/getWebhookInfo"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        return resp.json()


async def get_bot_me(
    bot_token: Optional[str] = None,
    agent_code: str = "DANTE_IT",
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Verifica la validez del token y devuelve la identidad del bot.
    """
    token = bot_token or get_bot_token(agent_code, db=db)
    if not token:
        return {"ok": False, "description": "Token no encontrado"}

    url = f"{TELEGRAM_API_BASE}/bot{token}/getMe"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        return resp.json()


def send_telegram_document_sync(
    chat_id: Union[int, str],
    file_bytes: bytes,
    filename: str,
    caption: Optional[str] = None,
    parse_mode: Optional[str] = "Markdown",
    bot_token: Optional[str] = None,
    agent_code: str = "CLARA_COMPRAS"
) -> bool:
    """
    Envía un archivo/documento (PDF, Excel, etc.) síncronamente a un chat de Telegram.
    """
    token = bot_token or get_bot_token(agent_code)
    if not token or token.startswith("PLACEHOLDER") or token == "NONE":
        logger.warning(f"[TELEGRAM CLIENT SYNC] Token no configurado para {agent_code}. Documento omitido: {filename}")
        return False

    url = f"{TELEGRAM_API_BASE}/bot{token}/sendDocument"
    data: Dict[str, Any] = {"chat_id": chat_id}
    if caption:
        data["caption"] = caption
    if parse_mode:
        data["parse_mode"] = parse_mode

    files = {
        "document": (filename, file_bytes, "application/octet-stream")
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(url, data=data, files=files)
            if resp.status_code == 200:
                return True

            err_body = resp.text
            if "can't parse entities" in err_body or "parse" in err_body.lower():
                data.pop("parse_mode", None)
                retry_resp = client.post(url, data=data, files={"document": (filename, file_bytes, "application/octet-stream")})
                return retry_resp.status_code == 200

            logger.error(f"[TELEGRAM CLIENT SYNC ERROR] sendDocument devolvió {resp.status_code}: {err_body}")
            return False
    except Exception as e:
        logger.error(f"[TELEGRAM CLIENT SYNC EXCEPTION] Error enviando documento {filename} a {chat_id}: {e}")
        return False


async def send_telegram_document(
    chat_id: Union[int, str],
    file_bytes: bytes,
    filename: str,
    caption: Optional[str] = None,
    parse_mode: Optional[str] = "Markdown",
    bot_token: Optional[str] = None,
    agent_code: str = "CLARA_COMPRAS"
) -> bool:
    """
    Envía un archivo/documento (PDF, Excel, etc.) asíncronamente a un chat de Telegram.
    """
    token = bot_token or get_bot_token(agent_code)
    if not token or token.startswith("PLACEHOLDER") or token == "NONE":
        logger.warning(f"[TELEGRAM CLIENT] Token no configurado para {agent_code}. Documento omitido: {filename}")
        return False

    url = f"{TELEGRAM_API_BASE}/bot{token}/sendDocument"
    data: Dict[str, Any] = {"chat_id": chat_id}
    if caption:
        data["caption"] = caption
    if parse_mode:
        data["parse_mode"] = parse_mode

    files = {
        "document": (filename, file_bytes, "application/octet-stream")
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, data=data, files=files)
            if resp.status_code == 200:
                return True

            err_body = resp.text
            if "can't parse entities" in err_body or "parse" in err_body.lower():
                data.pop("parse_mode", None)
                retry_resp = await client.post(url, data=data, files={"document": (filename, file_bytes, "application/octet-stream")})
                return retry_resp.status_code == 200

            logger.error(f"[TELEGRAM CLIENT ERROR] sendDocument devolvió {resp.status_code}: {err_body}")
            return False
    except Exception as e:
        logger.error(f"[TELEGRAM CLIENT EXCEPTION] Error enviando documento {filename} a {chat_id}: {e}")
        return False
