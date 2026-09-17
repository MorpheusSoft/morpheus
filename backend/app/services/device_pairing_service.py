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
            "message": "❌ El PIN de vinculación ingresado es inválido o ha expirado. Por favor genera un nuevo PIN desde el módulo de Usuarios Digitales en Neo ERP."
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

    worker_title = worker.display_title if worker else "Asistente Digital Neo"
    return {
        "success": True,
        "user_id": user.id,
        "full_name": user.full_name,
        "phone_number": clean_phone,
        "worker_name": worker_title,
        "message": (
            f"✅ *¡Dispositivo Vinculado con Éxito!*\n\n"
            f"Hola *{user.full_name}*, has conectado tu WhatsApp con el ecosistema de IA de Neo ERP.\n"
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


def pair_telegram_by_pin(
    chat_id: int,
    pin: str,
    db: Session,
    username: Optional[str] = None,
    agent_code: str = "DANTE_IT"
) -> Dict[str, Any]:
    """
    Vincula una cuenta / chat de Telegram con un Usuario / Supervisor del ERP mediante un PIN de 6 dígitos.
    """
    clean_pin = pin.strip().replace(" ", "").replace("-", "").upper().replace("VINCULAR_", "").replace("LINK_", "")

    # Verificar si el remitente ya está previamente vinculado con este chat_id
    existing_user = get_authenticated_user_by_telegram(chat_id, db)

    user = db.query(User).filter(User.pairing_pin == clean_pin).first()
    if not user:
        if existing_user:
            worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == agent_code).first()
            worker_title = worker.display_title if worker else "Asistente Digital"
            return {
                "success": True,
                "user_id": existing_user.id,
                "full_name": existing_user.full_name,
                "message": (
                    f"✅ *¡Tu cuenta ya está vinculada y activa!*\n\n"
                    f"Hola *{existing_user.full_name}*, tu cuenta de Telegram ya está autenticada en *Neo ERP* para interactuar con *{worker_title}*.\n\n"
                    f"No necesitas ingresar un nuevo PIN. Puedes escribir `/ayuda` para ver las funciones disponibles o hacerme tus consultas directamente."
                )
            }
        return {
            "success": False,
            "message": "❌ El PIN de vinculación ingresado es inválido o ha expirado. Por favor genera un nuevo PIN desde el módulo de Usuarios Digitales en Neo ERP."
        }

    # Asignar Telegram chat_id principal si no tenía o mantener el actual
    if not user.telegram_chat_id:
        user.telegram_chat_id = chat_id
    if username:
        user.telegram_username = username.lstrip("@")
    user.pairing_pin = None  # Consumir PIN de un solo uso
    db.commit()
    db.refresh(user)

    # Identificar trabajador digital asociado al saludo
    worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == agent_code).first()
    if not worker:
        worker = db.query(DigitalWorker).first()

    # Registrar o actualizar la conversación en el canal Telegram para TODOS los trabajadores activos
    all_workers = db.query(DigitalWorker).filter(DigitalWorker.is_active == True).all()
    for w in all_workers:
        conv = db.query(DigitalWorkerConversation).filter(
            DigitalWorkerConversation.worker_id == w.id,
            DigitalWorkerConversation.channel == "TELEGRAM",
            DigitalWorkerConversation.external_sender_id == str(chat_id)
        ).first()

        if not conv:
            conv = DigitalWorkerConversation(
                worker_id=w.id,
                channel="TELEGRAM",
                external_sender_id=str(chat_id),
                sender_user_id=user.id,
                is_authenticated=True,
                context_data={
                    "user_email": user.email,
                    "full_name": user.full_name,
                    "telegram_username": username
                }
            )
            db.add(conv)
        else:
            conv.is_authenticated = True
            conv.sender_user_id = user.id
            if conv.context_data:
                conv.context_data["telegram_username"] = username

    db.commit()

    worker_title = worker.display_title if worker else "Asistente Digital"
    clean_code = (agent_code or "").upper()

    if "CLARA" in clean_code:
        greeting = (
            f"💜 *¡Telegram Vinculado Exitosamente!*\n\n"
            f"Hola *{user.full_name}*, tu cuenta de Telegram ha sido autenticada en *Neo ERP*.\n"
            f"Soy *{worker_title}* (Analista Estratégica de Compras y Rentabilidad).\n\n"
            f"Desde aquí puedo apoyarte con:\n"
            f"• `/producto <nombre o sku>`: Ficha 360° (costos, stock multitienda, rotación y proveedor)\n"
            f"• `/crear_odc <proveedor>`: Generar ODC borrador sugerida (MRP) o personalizada\n"
            f"• `/sugeridos`: Quiebres de stock y sugeridos de compra\n"
            f"• `/odc`: Órdenes de compra recientes y su estado\n"
            f"• `/conciliacion`: Conciliación de facturas 3-way match\n\n"
            f"¿En qué puedo ayudarte hoy con compras y abastecimiento?"
        )
    elif "ARTURO" in clean_code:
        greeting = (
            f"📦 *¡Telegram Vinculado Exitosamente!*\n\n"
            f"Hola *{user.full_name}*, tu cuenta de Telegram ha sido autenticada en *Neo ERP*.\n"
            f"Soy *{worker_title}* (Supervisor Autónomo de Almacenes).\n\n"
            f"Desde aquí superviso el inventario físico y almacenes:\n"
            f"• `/negativos`: Existencias negativas detectadas\n"
            f"• `/stock <producto>`: Consulta de existencia en tiempo real\n"
            f"• `/devoluciones`: Devoluciones a proveedores en muelle\n\n"
            f"¿Qué almacén o stock deseas verificar?"
        )
    elif "VALERIA" in clean_code or "PRICING" in clean_code:
        greeting = (
            f"💎 *¡Telegram Vinculado Exitosamente!*\n\n"
            f"Hola *{user.full_name}*, tu cuenta de Telegram ha sido autenticada en *Neo ERP*.\n"
            f"Soy *{worker_title}* (Estratega de Precios, Costos y Rentabilidad).\n\n"
            f"Desde aquí protejo los márgenes y la coherencia de precios:\n"
            f"• `/margen_critico`: Alerta de venta a pérdida o margen < 15%\n"
            f"• `/precio <producto>`: Consulta inmediata de costo de reposición, PVP y margen\n"
            f"• `/sesiones`: Sesiones de precios en borrador por publicar\n"
            f"• `/aumentos`: Alzas recientes de costo de proveedores\n"
            f"• `/discrepancias`: Chequeo de precios desalineados entre tiendas\n\n"
            f"¿Qué precio o costo deseas revisar?"
        )
    else:
        greeting = (
            f"🛡️ *¡Telegram Vinculado Exitosamente!*\n\n"
            f"Hola *{user.full_name}*, tu cuenta de Telegram ha sido autenticada en *Neo ERP*.\n"
            f"Soy *{worker_title}*.\n\n"
            f"Desde aquí puedo responderte de inmediato sobre la salud de la plataforma:\n"
            f"• `/estado` o `/tiendas`: Ver latidos y conectividad de sucursales físicas\n"
            f"• `/cuadratura`: Conciliación de ventas Stellar vs Neo ERP\n"
            f"• `/correlatividad`: Auditoría de saltos en tickets fiscales\n"
            f"• `/historial`: Historial de sincronización y cajas activas\n"
            f"• `/remediar`: Auto-remediar desfases de sincronización\n\n"
            f"También recibirás alertas proactivas instantáneas si alguna tienda pierde conexión.\n\n"
            f"¿En qué puedo ayudarte hoy?"
        )

    return {
        "success": True,
        "user_id": user.id,
        "full_name": user.full_name,
        "telegram_chat_id": chat_id,
        "telegram_username": username,
        "worker_name": worker_title,
        "message": greeting
    }


def get_authenticated_user_by_telegram(chat_id: int, db: Session) -> Optional[User]:
    """
    Busca si el remitente de Telegram está registrado y autenticado en Neo ERP.
    Soporta múltiples cuentas/dispositivos (móvil, tablet, desktop) vinculados
    al mismo supervisor.
    """
    # 1. Búsqueda directa por chat_id principal en core.users
    user = db.query(User).filter(
        User.telegram_chat_id == chat_id,
        User.is_active == True
    ).first()
    if user:
        return user

    # 2. Búsqueda en conversaciones autenticadas multicanal
    conv = db.query(DigitalWorkerConversation).filter(
        DigitalWorkerConversation.channel == "TELEGRAM",
        DigitalWorkerConversation.external_sender_id == str(chat_id),
        DigitalWorkerConversation.is_authenticated == True,
        DigitalWorkerConversation.sender_user_id.isnot(None)
    ).first()
    if conv and conv.sender_user_id:
        return db.query(User).filter(
            User.id == conv.sender_user_id,
            User.is_active == True
        ).first()

    return None
