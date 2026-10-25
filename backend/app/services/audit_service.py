from typing import Optional, Dict, Any
from app.api.deps import SessionLocal
from app.models.core import AuditLog

def log_audit_event_async(
    user_id: Optional[int],
    user_name: Optional[str],
    user_email: Optional[str],
    action: str,
    module: str,
    entity_name: str,
    entity_id: Optional[str],
    facility_id: Optional[int] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None
):
    """
    Registra un evento de auditoría de forma asíncrona en segundo plano (FastAPI BackgroundTask).
    No bloquea ni añade latencia a la respuesta HTTP al usuario.
    """
    db = SessionLocal()
    try:
        log_entry = AuditLog(
            user_id=user_id,
            user_name=user_name,
            user_email=user_email,
            action=action,
            module=module,
            entity_name=entity_name,
            entity_id=str(entity_id) if entity_id is not None else None,
            facility_id=facility_id,
            details=details or {},
            ip_address=ip_address
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[AUDIT_ERROR] Error al registrar evento de auditoría en segundo plano: {str(e)}")
    finally:
        db.close()
