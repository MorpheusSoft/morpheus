from decimal import Decimal
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models.core import Facility
from app.models.inventory import Category

def get_sales_performance_30d(
    db: Session,
    variant_id: int,
    category_id: Optional[int],
    facility_id: int,
    facility_stock: float = 0.0,
    exchange_rate: Decimal = Decimal('1.0')
) -> Dict[str, Any]:
    """
    Computes 30-day sales velocity, daily run-rate, days of stock,
    and category benchmark metrics for a product variant.
    """
    fac = db.query(Facility).filter(Facility.id == facility_id).first()
    facility_name = fac.name if fac else "Sucursal Seleccionada"
    
    cat = db.query(Category).filter(Category.id == category_id).first() if category_id else None
    category_name = cat.name if cat else "Sin Categoría"

    rate_float = float(exchange_rate) if exchange_rate else 1.0

    if category_id:
        sql = text("""
        WITH sales_window AS (
            SELECT 
                d.facility_id,
                dl.variant_id,
                (CASE WHEN d.type = 'CREDIT_NOTE' THEN -dl.quantity ELSE dl.quantity END) AS qty,
                (CASE WHEN d.type = 'CREDIT_NOTE' THEN -1 ELSE 1 END) *
                (CASE WHEN d.currency_id = 2 AND COALESCE(d.exchange_rate, 0) > 0 THEN dl.line_total / d.exchange_rate ELSE dl.line_total END) AS usd,
                d.id as doc_id
            FROM sales.document_lines dl
            JOIN sales.documents d ON d.id = dl.document_id
            JOIN inv.product_variants pv ON pv.id = dl.variant_id
            JOIN inv.products p ON p.id = pv.product_id
            WHERE p.category_id = :category_id
              AND d.created_at >= NOW() - INTERVAL '30 days'
              AND d.state IN ('CONFIRMED', 'PAID')
        ),
        cat_totals AS (
            SELECT 
                COALESCE(SUM(usd), 0) AS cat_usd_chain,
                COALESCE(SUM(qty), 0) AS cat_qty_chain,
                COALESCE(SUM(CASE WHEN facility_id = :facility_id THEN usd ELSE 0 END), 0) AS cat_usd_facility,
                COALESCE(SUM(CASE WHEN facility_id = :facility_id THEN qty ELSE 0 END), 0) AS cat_qty_facility,
                COUNT(DISTINCT variant_id) AS cat_skus_count
            FROM sales_window
        ),
        var_facility AS (
            SELECT 
                COALESCE(SUM(qty), 0) AS var_qty_facility,
                COALESCE(SUM(usd), 0) AS var_usd_facility,
                COUNT(DISTINCT doc_id) AS var_tickets_facility
            FROM sales_window
            WHERE variant_id = :variant_id AND facility_id = :facility_id
        ),
        var_chain AS (
            SELECT 
                COALESCE(SUM(qty), 0) AS var_qty_chain,
                COALESCE(SUM(usd), 0) AS var_usd_chain,
                COUNT(DISTINCT doc_id) AS var_tickets_chain
            FROM sales_window
            WHERE variant_id = :variant_id
        ),
        ranks AS (
            SELECT 
                variant_id,
                DENSE_RANK() OVER (ORDER BY SUM(usd) DESC) as rank_chain,
                DENSE_RANK() OVER (ORDER BY SUM(CASE WHEN facility_id = :facility_id THEN usd ELSE 0 END) DESC) as rank_facility
            FROM sales_window
            GROUP BY variant_id
        )
        SELECT 
            ct.cat_usd_chain,
            ct.cat_qty_chain,
            ct.cat_usd_facility,
            ct.cat_qty_facility,
            ct.cat_skus_count,
            vf.var_qty_facility,
            vf.var_usd_facility,
            vf.var_tickets_facility,
            vc.var_qty_chain,
            vc.var_usd_chain,
            vc.var_tickets_chain,
            COALESCE(r.rank_chain, 0) as rank_chain,
            COALESCE(r.rank_facility, 0) as rank_facility
        FROM cat_totals ct
        CROSS JOIN var_facility vf
        CROSS JOIN var_chain vc
        LEFT JOIN ranks r ON r.variant_id = :variant_id;
        """)
        row = db.execute(sql, {
            "variant_id": variant_id,
            "category_id": category_id,
            "facility_id": facility_id
        }).fetchone()
    else:
        sql = text("""
        WITH sales_window AS (
            SELECT 
                d.facility_id,
                dl.variant_id,
                (CASE WHEN d.type = 'CREDIT_NOTE' THEN -dl.quantity ELSE dl.quantity END) AS qty,
                (CASE WHEN d.type = 'CREDIT_NOTE' THEN -1 ELSE 1 END) *
                (CASE WHEN d.currency_id = 2 AND COALESCE(d.exchange_rate, 0) > 0 THEN dl.line_total / d.exchange_rate ELSE dl.line_total END) AS usd,
                d.id as doc_id
            FROM sales.document_lines dl
            JOIN sales.documents d ON d.id = dl.document_id
            WHERE dl.variant_id = :variant_id
              AND d.created_at >= NOW() - INTERVAL '30 days'
              AND d.state IN ('CONFIRMED', 'PAID')
        ),
        var_facility AS (
            SELECT 
                COALESCE(SUM(qty), 0) AS var_qty_facility,
                COALESCE(SUM(usd), 0) AS var_usd_facility,
                COUNT(DISTINCT doc_id) AS var_tickets_facility
            FROM sales_window
            WHERE facility_id = :facility_id
        ),
        var_chain AS (
            SELECT 
                COALESCE(SUM(qty), 0) AS var_qty_chain,
                COALESCE(SUM(usd), 0) AS var_usd_chain,
                COUNT(DISTINCT doc_id) AS var_tickets_chain
            FROM sales_window
        )
        SELECT 
            0.0 AS cat_usd_chain,
            0.0 AS cat_qty_chain,
            0.0 AS cat_usd_facility,
            0.0 AS cat_qty_facility,
            0 AS cat_skus_count,
            vf.var_qty_facility,
            vf.var_usd_facility,
            vf.var_tickets_facility,
            vc.var_qty_chain,
            vc.var_usd_chain,
            vc.var_tickets_chain,
            0 as rank_chain,
            0 as rank_facility
        FROM var_facility vf
        CROSS JOIN var_chain vc;
        """)
        row = db.execute(sql, {
            "variant_id": variant_id,
            "facility_id": facility_id
        }).fetchone()

    cat_usd_chain = float(row[0] or 0.0) if row else 0.0
    cat_qty_chain = float(row[1] or 0.0) if row else 0.0
    cat_usd_facility = float(row[2] or 0.0) if row else 0.0
    cat_qty_facility = float(row[3] or 0.0) if row else 0.0
    cat_skus_count = int(row[4] or 0) if row else 0

    var_qty_facility = float(row[5] or 0.0) if row else 0.0
    var_usd_facility = float(row[6] or 0.0) if row else 0.0
    var_tickets_facility = int(row[7] or 0) if row else 0

    var_qty_chain = float(row[8] or 0.0) if row else 0.0
    var_usd_chain = float(row[9] or 0.0) if row else 0.0
    var_tickets_chain = int(row[10] or 0) if row else 0

    rank_chain = int(row[11] or 0) if row else 0
    rank_facility = int(row[12] or 0) if row else 0

    # Daily averages over 30 days
    facility_daily_units = round(var_qty_facility / 30.0, 2)
    facility_daily_usd = round(var_usd_facility / 30.0, 2)
    chain_daily_units = round(var_qty_chain / 30.0, 2)
    chain_daily_usd = round(var_usd_chain / 30.0, 2)

    # Days of stock coverage
    days_of_stock = None
    if facility_daily_units > 0 and facility_stock > 0:
        days_of_stock = round(facility_stock / facility_daily_units, 1)
    elif facility_stock <= 0:
        days_of_stock = 0.0

    # Category shares
    revenue_share_pct = round((var_usd_chain / cat_usd_chain * 100.0), 2) if cat_usd_chain > 0 else 0.0
    units_share_pct = round((var_qty_chain / cat_qty_chain * 100.0), 2) if cat_qty_chain > 0 else 0.0
    
    facility_revenue_share_pct = round((var_usd_facility / cat_usd_facility * 100.0), 2) if cat_usd_facility > 0 else 0.0
    facility_units_share_pct = round((var_qty_facility / cat_qty_facility * 100.0), 2) if cat_qty_facility > 0 else 0.0

    return {
        "period_days": 30,
        "facility_id": facility_id,
        "facility_name": facility_name,
        "facility_metrics": {
            "units_sold": var_qty_facility,
            "amount_usd": round(var_usd_facility, 2),
            "amount_ves": round(var_usd_facility * rate_float, 2),
            "daily_avg_units": facility_daily_units,
            "daily_avg_usd": facility_daily_usd,
            "tickets_count": var_tickets_facility,
            "days_of_stock": days_of_stock
        },
        "chain_metrics": {
            "units_sold": var_qty_chain,
            "amount_usd": round(var_usd_chain, 2),
            "amount_ves": round(var_usd_chain * rate_float, 2),
            "daily_avg_units": chain_daily_units,
            "daily_avg_usd": chain_daily_usd,
            "tickets_count": var_tickets_chain
        },
        "category_benchmark": {
            "category_id": category_id,
            "category_name": category_name,
            "category_total_usd": round(cat_usd_chain, 2),
            "category_total_units": round(cat_qty_chain, 2),
            "revenue_share_pct": revenue_share_pct,
            "units_share_pct": units_share_pct,
            "facility_revenue_share_pct": facility_revenue_share_pct,
            "facility_units_share_pct": facility_units_share_pct,
            "category_rank": rank_chain,
            "facility_category_rank": rank_facility,
            "category_total_skus": cat_skus_count
        } if category_id else None
    }
