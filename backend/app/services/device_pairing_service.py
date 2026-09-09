import logging
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

from app.models.core import User
from app.models.digital_workers import DigitalWorker, DigitalWorkerConversation

logger = logging.getLogger(__name__)

def pair_device_by_pin(phone_number: str, pin: str, db: Session) -> Dict[str, Any]:
    """
    Vincula un número de teléfono móvil de WhatsApp con un Usuario / Supervisor del ERP mediante un PIN de 6 dígitos.
    """
    clean_pin = pin.strip().replace(" ", "").replace("-", "")
    clean_phone = phone_number.strip().replace("+", "").replace(" ", "").replace("-", "")

    user = db.query(User).filter(User.pairing_pin == clean_pin).first()
    if not user:
        return {
            "success": False,
            "message": "❌ El PIN de vinculación ingresado es inválido o ha expirado. Por favor genera un nuevo PIN desde el módulo de Usuarios Digitales en Morpheus ERP."
        }

    # Asignar teléfono y verificar
    user.phone_number = clean_phone
    user.is_phone_verified = True
    user.pairing_pin = None  # Consumir PIN de un solo uso
    db.commit()
    db.refresh(user)

    # Identificar trabajador digital asociado al rol o perfil
    worker = db.query(DigitalWorker).filter(DigitalWorker.user_id == user.id).first()
    if not worker:
        # Si el usuario es un supervisor humano, asociar por defecto con el supervisor general Arturo WMS
        worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == "ARTURO_WMS").first()

    # Registrar o actualizar la conversación en el canal WhatsApp
    if worker:
        conv = db.query(DigitalWorkerConversation).filter(
            DigitalWorkerConversation.worker_id == worker.id,
            DigitalWorkerConversation.external_sender_id == clean_phone
        ).first()

        if not conv:
            conv = DigitalWorkerConversation(
                worker_id=worker.id,
                channel="WHATSAPP",
                external_sender_id=clean_phone,
                sender_user_id=user.id,
                is_authenticated=True,
                context_data={"user_email": user.email, "full_name": user.full_name}
            )
            db.add(conv)
        else:
            conv.is_authenticated = True
            conv.sender_user_id = user.id

        db.commit()

    worker_title = worker.display_title if worker else "Asistente Digital Morpheus"
    return {
        "success": True,
        "user_id": user.id,
        "full_name": user.full_name,
        "phone_number": clean_phone,
        "worker_name": worker_title,
        "message": (
            f"✅ *¡Dispositivo Vinculado con Éxito!*\n\n"
            f"Hola *{user.full_name}*, has conectado tu WhatsApp con el ecosistema de IA de Morpheus ERP.\n"
            f"Soy *{worker_title}*. A partir de este momento puedes preguntarme directamente por aquí:\n\n"
            f"• *'¿Hay existencia negativa en Patio Trigal?'*\n"
            f"• *'¿Qué órdenes de compra están pendientes de conciliar?'*\n"
            f"• *'¿Tenemos devoluciones o mermas pendientes?'*\n"
            f"• *'Consultar stock de Harina PAN'*\n\n"
            f"¿En qué puedo asistirte hoy?"
        )
    }

def get_authenticated_user_by_phone(phone_number: str, db: Session) -> Optional[User]:
    """
    Busca si el remitente está verificado en el sistema.
    """
    clean_phone = phone_number.strip().replace("+", "").replace(" ", "").replace("-", "")
    return db.query(User).filter(
        User.phone_number == clean_phone,
        User.is_phone_verified == True
    ).first()
