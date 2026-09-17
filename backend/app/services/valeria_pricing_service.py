"""
Servicio Autónomo de Valeria (Neo Pricing / Costos y Precios)
Proporciona auditoría de márgenes, detección de alzas de costos, supervisión de sesiones
de precios, consistencia de precios multitienda y fichas técnicas de costo y PVP.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, text

from app.models.inventory import (
    ProductVariant,
    Product,
    ProductBarcode,
    ProductFacilityPrice,
    PricingSession,
    PricingSessionLine,
    Category
)
from app.models.core import Facility, SystemSettings

logger = logging.getLogger(__name__)


def audit_critical_margins(
    db: Session,
    min_margin_pct: float = 15.0,
    limit: int = 12
) -> List[Dict[str, Any]]:
    """
    Detecta productos con margen crítico o venta a pérdida (PVP <= Costo).
    Fórmula de Margen sobre Ventas: (PVP - Costo) / PVP * 100
    """
    results = []
    try:
        # Tomar variantes activas con precio de venta mayor a 0
        variants = db.query(ProductVariant).filter(
            ProductVariant.is_active == True,
            ProductVariant.sales_price > 0
        ).all()

        for v in variants:
            cost = float(v.replacement_cost or v.standard_cost or v.average_cost or 0)
            pvp = float(v.sales_price or 0)
            if pvp <= 0:
                continue

            margin_pct = ((pvp - cost) / pvp) * 100.0

            if margin_pct < min_margin_pct:
                prod_name = v.product.name if v.product else f"SKU {v.sku}"
                cat_name = v.product.category.name if v.product and v.product.category else "General"
                results.append({
                    "sku": v.sku,
                    "product_name": prod_name,
                    "category": cat_name,
                    "cost": round(cost, 4),
                    "sales_price": round(pvp, 4),
                    "margin_pct": round(margin_pct, 2),
                    "is_negative": margin_pct <= 0,
                    "loss_per_unit": round(cost - pvp, 4) if margin_pct <= 0 else 0.0
                })

        # Ordenar primero los negativos (peores) y luego los de menor margen
        results.sort(key=lambda x: x["margin_pct"])
        return results[:limit]
    except Exception as e:
        logger.error(f"[VALERIA SERVICE] Error en audit_critical_margins: {e}")
        return []


def audit_recent_cost_spikes(
    db: Session,
    limit: int = 8
) -> List[Dict[str, Any]]:
    """
    Detecta productos con alzas significativas de costo registradas en sesiones de fijación de precios.
    """
    results = []
    try:
        lines = db.query(PricingSessionLine).join(PricingSession).filter(
            PricingSessionLine.proposed_cost > PricingSessionLine.old_cost,
            PricingSessionLine.old_cost > 0
        ).order_by(desc(PricingSessionLine.id)).limit(limit * 2).all()

        for l in lines:
            old_c = float(l.old_cost or 0)
            new_c = float(l.proposed_cost or 0)
            pvp = float(l.old_price or 0)

            if old_c <= 0 or new_c <= old_c:
                continue

            cost_increase_pct = ((new_c - old_c) / old_c) * 100.0
            old_margin = ((pvp - old_c) / pvp * 100.0) if pvp > 0 else 0.0
            eroded_margin = ((pvp - new_c) / pvp * 100.0) if pvp > 0 else 0.0

            sku = l.variant_id
            p_name = l.external_reference_name or "Producto"
            if l.variant_id:
                var = db.query(ProductVariant).filter(ProductVariant.id == l.variant_id).first()
                if var:
                    sku = var.sku
                    p_name = var.product.name if var.product else var.sku

            results.append({
                "sku": str(sku),
                "product_name": p_name,
                "session_name": l.session.name if l.session else "Sesión",
                "old_cost": round(old_c, 4),
                "new_cost": round(new_c, 4),
                "cost_increase_pct": round(cost_increase_pct, 1),
                "current_pvp": round(pvp, 4),
                "old_margin_pct": round(old_margin, 1),
                "eroded_margin_pct": round(eroded_margin, 1),
                "margin_drop_pct": round(old_margin - eroded_margin, 1)
            })

        results.sort(key=lambda x: x["cost_increase_pct"], reverse=True)
        return results[:limit]
    except Exception as e:
        logger.error(f"[VALERIA SERVICE] Error en audit_recent_cost_spikes: {e}")
        return []


def audit_pending_pricing_sessions(
    db: Session,
    limit: int = 6
) -> List[Dict[str, Any]]:
    """
    Supervisa las sesiones de precios abiertas (DRAFT) pendientes por aplicar.
    """
    results = []
    try:
        sessions = db.query(PricingSession).filter(
            PricingSession.status == 'DRAFT'
        ).order_by(desc(PricingSession.id)).limit(limit).all()

        for s in sessions:
            supplier_name = s.supplier.name if s.supplier else "Catálogo General / Varios"
            results.append({
                "id": s.id,
                "name": s.name,
                "supplier": supplier_name,
                "source_type": s.source_type,
                "update_type": s.update_type,
                "created_at": s.created_at.strftime("%Y-%m-%d %H:%M") if s.created_at else "N/A",
                "lines_count": len(s.lines)
            })
        return results
    except Exception as e:
        logger.error(f"[VALERIA SERVICE] Error en audit_pending_pricing_sessions: {e}")
        return []


def audit_cross_store_price_discrepancies(
    db: Session,
    limit: int = 8
) -> List[Dict[str, Any]]:
    """
    Compara los precios de venta por sucursal (ProductFacilityPrice) para detectar discrepancias
    no homologadas entre tiendas.
    """
    results = []
    try:
        # Buscar variantes con múltiples precios en sedes activas
        grouped = db.query(
            ProductFacilityPrice.variant_id,
            func.count(func.distinct(ProductFacilityPrice.sales_price)).label("price_variants"),
            func.min(ProductFacilityPrice.sales_price).label("min_price"),
            func.max(ProductFacilityPrice.sales_price).label("max_price")
        ).filter(
            ProductFacilityPrice.is_active == True,
            ProductFacilityPrice.sales_price > 0
        ).group_by(ProductFacilityPrice.variant_id).having(
            func.count(func.distinct(ProductFacilityPrice.sales_price)) > 1
        ).limit(limit).all()

        for g in grouped:
            var = db.query(ProductVariant).filter(ProductVariant.id == g.variant_id).first()
            if not var:
                continue

            fac_prices = db.query(ProductFacilityPrice, Facility).join(
                Facility, ProductFacilityPrice.facility_id == Facility.id
            ).filter(
                ProductFacilityPrice.variant_id == var.id,
                ProductFacilityPrice.is_active == True
            ).all()

            price_breakdown = [
                {"facility": fac.name, "price": float(fp.sales_price)}
                for fp, fac in fac_prices
            ]

            results.append({
                "sku": var.sku,
                "product_name": var.product.name if var.product else var.sku,
                "min_price": float(g.min_price),
                "max_price": float(g.max_price),
                "discrepancy_amount": float(g.max_price - g.min_price),
                "store_prices": price_breakdown
            })
        return results
    except Exception as e:
        logger.error(f"[VALERIA SERVICE] Error en audit_cross_store_price_discrepancies: {e}")
        return []


def lookup_product_price_and_cost(
    query_text: str,
    db: Session
) -> List[Dict[str, Any]]:
    """
    Búsqueda rápida de costo, PVP y rentabilidad por SKU, código de barras o nombre.
    """
    results = []
    clean_q = (query_text or "").strip()
    if not clean_q:
        return []

    try:
        # 1. Búsqueda por SKU exacto o parcial, o por nombre de producto
        variants = db.query(ProductVariant).join(Product).filter(
            ProductVariant.is_active == True,
            (ProductVariant.sku.ilike(f"%{clean_q}%")) |
            (Product.name.ilike(f"%{clean_q}%"))
        ).limit(5).all()

        # Si no hubo resultados, intentar por código de barras
        if not variants:
            bc = db.query(ProductBarcode).filter(ProductBarcode.barcode == clean_q).first()
            if bc and bc.variant:
                variants = [bc.variant]

        for v in variants:
            std_cost = float(v.standard_cost or 0)
            avg_cost = float(v.average_cost or 0)
            rep_cost = float(v.replacement_cost or 0)
            ref_cost = rep_cost or std_cost or avg_cost
            pvp = float(v.sales_price or 0)
            margin_pct = ((pvp - ref_cost) / pvp * 100.0) if pvp > 0 else 0.0

            # Precios por sede
            fac_prices = []
            for fp in v.facility_prices:
                if fp.is_active and fp.facility:
                    fac_prices.append({
                        "facility": fp.facility.name,
                        "sales_price": float(fp.sales_price or 0),
                        "target_utility_pct": float(fp.target_utility_pct) if fp.target_utility_pct else None
                    })

            results.append({
                "sku": v.sku,
                "product_name": v.product.name if v.product else "N/A",
                "category": v.product.category.name if v.product and v.product.category else "General",
                "standard_cost": std_cost,
                "average_cost": avg_cost,
                "replacement_cost": rep_cost,
                "sales_price": pvp,
                "margin_pct": round(margin_pct, 2),
                "is_negative": margin_pct <= 0,
                "facility_prices": fac_prices
            })

        return results
    except Exception as e:
        logger.error(f"[VALERIA SERVICE] Error en lookup_product_price_and_cost: {e}")
        return []
