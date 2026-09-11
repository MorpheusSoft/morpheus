from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func
from app.api.deps import get_db
from app.models.purchasing import PurchaseOrder, PurchaseOrderLine

router = APIRouter()

@router.get("/ceo-inbox")
def get_ceo_metrics(db: Session = Depends(get_db)):
    # Calculate Float and Pending Approval amounts with eager loading
    orders = db.query(PurchaseOrder).options(selectinload(PurchaseOrder.lines)).all()
    
    pending_approval_usd = 0.0
    pending_float_usd = 0.0
    counts = {
        "pending_approval": 0,
        "pending_send": 0,
        "pending_read": 0,
        "pending_receipt": 0,
    }
    
    for o in orders:
        order_total = sum((float(l.expected_base_qty) * float(l.unit_cost)) for l in o.lines)
        
        if o.status in ['draft', 'pending_approval']:
            pending_approval_usd += order_total
            counts["pending_approval"] += 1
        elif o.status == 'approved':
            pending_float_usd += order_total
            counts["pending_send"] += 1
        elif o.status == 'sent':
            pending_float_usd += order_total
            counts["pending_read"] += 1
        elif o.status == 'viewed':
            counts["pending_receipt"] += 1

    return {
        "pending_approval_usd": pending_approval_usd,
        "pending_float_usd": pending_float_usd,
        "total_active_orders": len(orders),
        "counts": counts
    }


@router.get("/core-stats")
def get_core_stats(db: Session = Depends(get_db)):
    from app.models.core import User, Facility, Company, SystemJob, Role
    from app.models.digital_workers import DigitalWorker

    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    superuser_count = db.query(User).filter(User.is_superuser == True).count()

    total_facilities = db.query(Facility).count()
    active_facilities = db.query(Facility).filter(Facility.is_active == True).count()

    companies = db.query(Company).all()
    total_companies = len(companies)
    company_names = [c.name for c in companies]

    total_jobs = db.query(SystemJob).count()
    active_jobs = db.query(SystemJob).filter(SystemJob.is_enabled == True).count()

    total_roles = db.query(Role).count()
    active_roles = db.query(Role).filter(Role.is_active == True).count()

    total_workers = db.query(DigitalWorker).count()
    active_workers = db.query(DigitalWorker).filter(DigitalWorker.is_autonomous_active == True).count()

    nodes = [
        {"name": "Neo Core", "active": True, "port": 4000, "description": "Hub central, seguridad y accesos"},
        {"name": "Neo Inventario", "active": True, "port": 4001, "description": "Catálogo maestro y existencias"},
        {"name": "Neo Compras", "active": True, "port": 4002, "description": "Abastecimiento y proveedores"},
        {"name": "Neo WMS", "active": True, "port": 4003, "description": "Almacenes, recepciones y transferencias"},
        {"name": "Neo Pricing", "active": True, "port": 4004, "description": "Costos, márgenes y habladores"},
        {"name": "Neo B2B", "active": False, "port": 4005, "description": "Portal mayorista B2B (Standby)"},
        {"name": "Neo POS", "active": False, "port": 4006, "description": "Punto de venta (Próximamente)"},
        {"name": "Neo API", "active": True, "port": 8000, "description": "FastAPI Core Engine"},
    ]

    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "superusers": superuser_count,
        },
        "facilities": {
            "total": total_facilities,
            "active": active_facilities,
        },
        "companies": {
            "total": total_companies,
            "names": company_names,
            "primary": company_names[0] if company_names else "Neo ERP",
        },
        "jobs": {
            "total": total_jobs,
            "active": active_jobs,
        },
        "roles": {
            "total": total_roles,
            "active": active_roles,
        },
        "digital_workers": {
            "total": total_workers,
            "active": active_workers,
        },
        "nodes": nodes,
    }

