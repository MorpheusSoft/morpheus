import hmac
import hashlib
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, Request, Response, Depends, HTTPException, Query, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.api.deps import get_db
from app.agents.whatsapp_agent import process_incoming_whatsapp_message

logger = logging.getLogger(__name__)

router = APIRouter()

class WhatsAppSimulationRequest(BaseModel):
    phone_number: str
    message: str

def verify_meta_signature(payload: bytes, signature_header: Optional[str]) -> bool:
    """Verifica el hash HMAC SHA-256 enviado por Meta en el encabezado X-Hub-Signature-256."""
    if not settings.WHATSAPP_APP_SECRET or not signature_header:
        return True  # Si no está configurado el secreto en entorno de pruebas, se permite
        
    expected_hash = hmac.new(
        key=settings.WHATSAPP_APP_SECRET.encode("utf-8"),
        msg=payload,
        digestmod=hashlib.sha256
    ).hexdigest()
    
    # Meta envía el encabezado en formato 'sha256=<hash>'
    if signature_header.startswith("sha256="):
        received_hash = signature_header[7:]
    else:
        received_hash = signature_header

    return hmac.compare_digest(expected_hash, received_hash)

@router.get("/webhook")
def meta_webhook_handshake(
    request: Request,
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge")
):
    """
    Handshake de verificación exigido por Meta (WhatsApp Cloud API) para registrar webhooks.
    """
    if hub_mode == "subscribe" and hub_verify_token == settings.WHATSAPP_VERIFY_TOKEN:
        logger.info("[WHATSAPP WEBHOOK] Handshake con Meta verificado con éxito.")
        return Response(content=hub_challenge, media_type="text/plain")

    logger.warning("[WHATSAPP WEBHOOK] Falló handshake de verificación con Meta.")
    raise HTTPException(status_code=403, detail="Fallo de verificación de token")

@router.post("/webhook")
async def receive_meta_webhook(
    request: Request,
    x_hub_signature_256: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Receptor principal de eventos y mensajes entrantes de Meta WhatsApp Cloud API.
    """
    body_bytes = await request.body()
    if not verify_meta_signature(body_bytes, x_hub_signature_256):
        logger.error("[WHATSAPP SECURITY] Firma HMAC SHA-256 de Meta inválida.")
        raise HTTPException(status_code=403, detail="Firma de webhook inválida")

    try:
        data = await request.json()
    except Exception:
        return {"status": "ignored"}

    # Extraer mensajes del payload estándar de Meta
    entry = data.get("entry", [])
    for e in entry:
        changes = e.get("changes", [])
        for ch in changes:
            value = ch.get("value", {})
            messages = value.get("messages", [])
            for msg in messages:
                sender_phone = msg.get("from")
                msg_type = msg.get("type")
                if msg_type == "text" and sender_phone:
                    text_body = msg.get("text", {}).get("body", "")
                    try:
                        result = process_incoming_whatsapp_message(sender_phone, text_body, db)
                        logger.info(f"[WHATSAPP BOT] Mensaje de {sender_phone} procesado con herramienta {result.get('tool')}")
                    except Exception as err:
                        logger.error(f"[WHATSAPP BOT ERROR] Error procesando mensaje de {sender_phone}: {err}")

    # Retornar siempre 200 OK a Meta para evitar reintentos y bloqueos de webhook
    return {"status": "received"}

@router.post("/simulate")
def simulate_whatsapp_message(
    payload: WhatsAppSimulationRequest,
    db: Session = Depends(get_db)
):
    """
    Endpoint de simulación y pruebas directas para verificar la interacción conversacional
    y la vinculación de PIN desde la consola web de Morpheus o pruebas automatizadas.
    """
    result = process_incoming_whatsapp_message(payload.phone_number, payload.message, db)
    return result
