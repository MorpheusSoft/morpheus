"""
Seed Script: Registrar los Roles Estándares Corporativos de Neo ERP.
Siembra en core.roles la matriz RBAC para usuarios humanos:
1. Administrador del Sistema
2. Gerente de Compras
3. Comprador
4. Supervisor de Almacén (WMS)
5. Almacenista
6. Gerente de Pricing
7. Analista de Pricing
8. Auditor de Inventarios
9. Cajero / Vendedor POS
"""

import sys
import os
import json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import text
from app.api.deps import SessionLocal

def get_base_permissions():
    return {
        "neo_core": {
            "companies": {"read": False, "write": False, "delete": False, "approve": False},
            "users": {"read": False, "write": False, "delete": False, "approve": False},
            "roles": {"read": False, "write": False, "delete": False, "approve": False},
            "facilities": {"read": False, "write": False, "delete": False, "approve": False},
            "currencies": {"read": False, "write": False, "delete": False, "approve": False},
            "jobs": {"read": False, "write": False, "delete": False, "approve": False},
        },
        "neo_inventory": {
            "products": {"read": False, "write": False, "delete": False, "approve": False},
            "categories": {"read": False, "write": False, "delete": False, "approve": False},
            "warehouses": {"read": False, "write": False, "delete": False, "approve": False},
        },
        "neo_purchases": {
            "suppliers": {"read": False, "write": False, "delete": False, "approve": False},
            "orders": {"read": False, "write": False, "delete": False, "approve": False},
            "prices": {"read": False, "write": False, "delete": False, "approve": False},
        },
        "neo_pricing": {
            "pricing_metrics": {"read": False, "write": False, "delete": False, "approve": False},
            "pricing_costs": {"read": False, "write": False, "delete": False, "approve": False},
            "pricing_prices": {"read": False, "write": False, "delete": False, "approve": False},
            "pricing_reports": {"read": False, "write": False, "delete": False, "approve": False},
        },
        "neo_logistics": {
            "routes": {"read": False, "write": False, "delete": False, "approve": False},
            "vehicles": {"read": False, "write": False, "delete": False, "approve": False},
            "direct_receipts": {"read": False, "write": False, "delete": False, "approve": False},
        }
    }

def get_admin_permissions():
    perms = get_base_permissions()
    for mod in perms:
        for feat in perms[mod]:
            perms[mod][feat] = {"read": True, "write": True, "delete": True, "approve": True}
    return perms

def get_purchases_manager_permissions():
    perms = get_base_permissions()
    for feat in perms["neo_purchases"]:
        perms["neo_purchases"][feat] = {"read": True, "write": True, "delete": True, "approve": True}
    for feat in perms["neo_inventory"]:
        perms["neo_inventory"][feat] = {"read": True, "write": False, "delete": False, "approve": True}
    for feat in perms["neo_pricing"]:
        perms["neo_pricing"][feat] = {"read": True, "write": False, "delete": False, "approve": True}
    perms["neo_logistics"]["direct_receipts"] = {"read": True, "write": False, "delete": False, "approve": False}
    return perms

def get_buyer_permissions():
    perms = get_base_permissions()
    for feat in perms["neo_purchases"]:
        perms["neo_purchases"][feat] = {"read": True, "write": True, "delete": False, "approve": False}
    for feat in ["products", "categories"]:
        perms["neo_inventory"][feat] = {"read": True, "write": False, "delete": False, "approve": False}
    perms["neo_pricing"]["pricing_costs"] = {"read": True, "write": False, "delete": False, "approve": False}
    return perms

def get_wms_supervisor_permissions():
    perms = get_base_permissions()
    for feat in perms["neo_inventory"]:
        perms["neo_inventory"][feat] = {"read": True, "write": True, "delete": False, "approve": True}
    for feat in perms["neo_logistics"]:
        perms["neo_logistics"][feat] = {"read": True, "write": True, "delete": False, "approve": True}
    perms["neo_purchases"]["orders"] = {"read": True, "write": False, "delete": False, "approve": False}
    return perms

def get_warehouse_operator_permissions():
    perms = get_base_permissions()
    perms["neo_inventory"]["products"] = {"read": True, "write": True, "delete": False, "approve": False}
    perms["neo_inventory"]["warehouses"] = {"read": True, "write": True, "delete": False, "approve": False}
    perms["neo_logistics"]["direct_receipts"] = {"read": True, "write": True, "delete": False, "approve": False}
    return perms

def get_pricing_manager_permissions():
    perms = get_base_permissions()
    for feat in perms["neo_pricing"]:
        perms["neo_pricing"][feat] = {"read": True, "write": True, "delete": True, "approve": True}
    for feat in ["prices", "suppliers"]:
        perms["neo_purchases"][feat] = {"read": True, "write": False, "delete": False, "approve": True}
    for feat in ["products", "categories"]:
        perms["neo_inventory"][feat] = {"read": True, "write": False, "delete": False, "approve": False}
    return perms

def get_pricing_analyst_permissions():
    perms = get_base_permissions()
    for feat in perms["neo_pricing"]:
        perms["neo_pricing"][feat] = {"read": True, "write": True, "delete": False, "approve": False}
    perms["neo_purchases"]["prices"] = {"read": True, "write": False, "delete": False, "approve": False}
    perms["neo_inventory"]["products"] = {"read": True, "write": False, "delete": False, "approve": False}
    return perms

def get_inventory_auditor_permissions():
    perms = get_base_permissions()
    for feat in perms["neo_inventory"]:
        perms["neo_inventory"][feat] = {"read": True, "write": False, "delete": False, "approve": True}
    perms["neo_purchases"]["orders"] = {"read": True, "write": False, "delete": False, "approve": False}
    perms["neo_pricing"]["pricing_costs"] = {"read": True, "write": False, "delete": False, "approve": False}
    perms["neo_pricing"]["pricing_reports"] = {"read": True, "write": False, "delete": False, "approve": False}
    return perms

def get_pos_cashier_permissions():
    perms = get_base_permissions()
    perms["neo_inventory"]["products"] = {"read": True, "write": False, "delete": False, "approve": False}
    perms["neo_pricing"]["pricing_prices"] = {"read": True, "write": False, "delete": False, "approve": False}
    return perms

STANDARD_ROLES = [
    (
        "Administrador del Sistema",
        "Control total y maestro sobre todos los módulos y configuraciones de Neo ERP.",
        True,
        get_admin_permissions()
    ),
    (
        "Gerente de Compras",
        "Supervisión del ciclo de compras, aprobación de ODC, convenios sell-out y proveedores.",
        True,
        get_purchases_manager_permissions()
    ),
    (
        "Comprador",
        "Gestión de órdenes de compra, análisis de reposición MRP y cotizaciones de proveedores.",
        True,
        get_buyer_permissions()
    ),
    (
        "Supervisor de Almacén (WMS)",
        "Control de recepciones, despachos, transferencias, tomas físicas y mapa de almacén.",
        True,
        get_wms_supervisor_permissions()
    ),
    (
        "Almacenista",
        "Operación de carga y descarga, conteos físicos, picking y traslados internos.",
        False,
        get_warehouse_operator_permissions()
    ),
    (
        "Gerente de Pricing",
        "Definición y aprobación de listas de precios, márgenes comerciales y auditoría de costos.",
        True,
        get_pricing_manager_permissions()
    ),
    (
        "Analista de Pricing",
        "Cálculo de estructuras de costos, simulación de márgenes y actualización de precios.",
        False,
        get_pricing_analyst_permissions()
    ),
    (
        "Auditor de Inventarios",
        "Control de diferencias de inventario, auditoría de mermas, averías y trazabilidad de lotes.",
        True,
        get_inventory_auditor_permissions()
    ),
    (
        "Cajero / Vendedor POS",
        "Facturación en caja, cobros y consulta básica de precios y existencias en tienda.",
        False,
        get_pos_cashier_permissions()
    ),
]

def run_seed():
    db = SessionLocal()
    print("=========================================================")
    print("🌱 SEMBRANDO ROLES EMPRESARIALES ESTÁNDARES EN NEO ERP")
    print("=========================================================")

    for name, desc, can_oracle, perms in STANDARD_ROLES:
        existing = db.execute(
            text("SELECT id FROM core.roles WHERE name = :name"),
            {"name": name}
        ).fetchone()

        if existing:
            db.execute(
                text("""
                    UPDATE core.roles 
                    SET description = :desc,
                        can_use_oracle = :oracle,
                        permissions = CAST(:perms AS JSONB),
                        is_active = TRUE
                    WHERE id = :id
                """),
                {
                    "desc": desc,
                    "oracle": can_oracle,
                    "perms": json.dumps(perms),
                    "id": existing[0]
                }
            )
            print(f"  ✓ Rol actualizado: '{name}' (ID: {existing[0]})")
        else:
            res = db.execute(
                text("""
                    INSERT INTO core.roles (name, description, can_use_oracle, permissions, is_active)
                    VALUES (:name, :desc, :oracle, CAST(:perms AS JSONB), TRUE)
                    RETURNING id
                """),
                {
                    "name": name,
                    "desc": desc,
                    "oracle": can_oracle,
                    "perms": json.dumps(perms)
                }
            )
            new_id = res.fetchone()[0]
            print(f"  + Rol creado: '{name}' (ID: {new_id})")

    db.commit()

    total = db.execute(text("SELECT count(*) FROM core.roles")).scalar()
    print(f"\n✅ Total de roles activos en el sistema: {total}")
    db.close()

if __name__ == "__main__":
    run_seed()
