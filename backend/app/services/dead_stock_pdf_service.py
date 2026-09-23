"""
Servicio Generador de Informes Ejecutivos en PDF de Rotación & Dead Stock
Especializado para Neo ERP con gráficos estadísticos incrustados (Matplotlib)
y membrete institucional para descarga web y envío directo por Telegram/WhatsApp.
"""

import os
import io
import uuid
import tempfile
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from fpdf import FPDF
from app.services.dead_stock_service import audit_all_dead_stock
from app.services.pdf_service import sanitize_pdf_text

logger = logging.getLogger(__name__)

EXPORTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "static", "uploads", "exports"))
os.makedirs(EXPORTS_DIR, exist_ok=True)


class DeadStockPDF(FPDF):
    def __init__(self, days_threshold: int = 30):
        super().__init__(orientation='P', unit='mm', format='A4')
        self.days_threshold = days_threshold
        self.set_auto_page_break(auto=True, margin=15)

    def header(self):
        # Membrete institucional Neo ERP
        self.set_fill_color(15, 23, 42)  # #0F172A
        self.rect(0, 0, 210, 4, 'F')

        self.set_y(8)
        self.set_font('Helvetica', 'B', 15)
        self.set_text_color(15, 23, 42)
        self.cell(130, 7, "NEO ERP", ln=False)

        self.set_font('Helvetica', 'B', 8)
        self.set_text_color(100, 116, 139)
        self.cell(60, 7, f"EMISIÓN: {datetime.now().strftime('%d/%m/%Y %H:%M')}", ln=True, align='R')

        self.set_font('Helvetica', 'B', 11)
        self.set_text_color(16, 185, 129)  # Emerald
        self.cell(0, 5, "MÓDULO DE COMPRAS & INTELIGENCIA DE ABASTECIMIENTO", ln=True)

        self.set_draw_color(226, 232, 240)
        self.line(10, 22, 200, 22)
        self.ln(4)

    def footer(self):
        self.set_y(-12)
        self.set_draw_color(226, 232, 240)
        self.line(10, 285, 200, 285)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(148, 163, 184)
        self.cell(100, 6, "Neo ERP | Documento Confidencial de Control Interno", ln=False)
        self.cell(90, 6, f"Pagina {self.page_no()}", ln=False, align='R')


def _generate_dead_stock_chart(items: List[Dict[str, Any]]) -> Optional[str]:
    """Genera el gráfico de barras horizontales del Top SKUs con capital inmovilizado."""
    top_items = [it for it in items if it.get("stock_valuation_usd", 0) > 0][:8]
    if not top_items:
        return None

    # Invertir para que el mayor quede arriba
    top_items = list(reversed(top_items))
    names = []
    vals = []

    for it in top_items:
        raw_name = it.get("product_name", f"SKU {it.get('sku')}")
        clean_name = sanitize_pdf_text(raw_name)
        short_name = (clean_name[:24] + '...') if len(clean_name) > 27 else clean_name
        names.append(short_name)
        vals.append(float(it.get("stock_valuation_usd", 0)))

    try:
        fig, ax = plt.subplots(figsize=(6.8, 3.2), dpi=150)
        fig.patch.set_facecolor('#FFFFFF')
        ax.set_facecolor('#F8FAFC')

        bars = ax.barh(names, vals, color='#1E293B', height=0.6, edgecolor='#0F172A', linewidth=0.5)

        # Resaltar la barra superior en rojo/rosa
        if len(bars) > 0:
            bars[-1].set_color('#E11D48')
            bars[-1].set_edgecolor('#BE123C')

        ax.set_title('Top SKUs con Mayor Capital Inmovilizado ($ USD)', fontsize=10, fontweight='bold', color='#0F172A', pad=10)
        ax.set_xlabel('Valoración de Stock Estancado ($ USD)', fontsize=8, color='#64748B')
        ax.grid(axis='x', linestyle='--', alpha=0.5, color='#CBD5E1')
        ax.tick_params(axis='both', which='major', labelsize=8, colors='#334155')

        # Formato de valores en barras
        for bar in bars:
            width = bar.get_width()
            if width > 0:
                ax.text(width + (max(vals) * 0.02), bar.get_y() + bar.get_height()/2,
                        f"${width:,.0f}",
                        va='center', ha='left', fontsize=7.5, fontweight='bold', color='#0F172A')

        ax.set_xlim(0, max(vals) * 1.18 if vals else 100)
        plt.tight_layout()

        tmp_file = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
        plt.savefig(tmp_file.name, format='png', bbox_inches='tight')
        plt.close(fig)
        return tmp_file.name
    except Exception as e:
        logger.warning(f"Error generando gráfico de dead stock: {e}")
        return None


def generate_dead_stock_pdf(
    db: Session,
    days_threshold: int = 30
) -> Dict[str, Any]:
    """
    Genera el informe ejecutivo en PDF de Rotación & Dead Stock de Neo ERP.
    """
    audit_data = audit_all_dead_stock(db, days_threshold=days_threshold, auto_block=False)
    items = audit_data.get("items", [])
    # Ordenar por mayor capital inmovilizado
    items.sort(key=lambda x: float(x.get("stock_valuation_usd", 0)), reverse=True)

    total_dead = audit_data.get("total_dead_stock_items", 0)
    total_slow = audit_data.get("total_slow_moving_items", 0)
    total_capital = float(audit_data.get("total_capital_immobilized_usd", 0.0))

    pdf = DeadStockPDF(days_threshold=days_threshold)
    pdf.add_page()

    # Título principal del informe
    pdf.set_font('Helvetica', 'B', 14)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 8, "INFORME EJECUTIVO DE INVENTARIO INMÓVIL & DEAD STOCK", ln=True)

    pdf.set_font('Helvetica', '', 9)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(0, 5, f"Corte de Análisis: Productos con 0 ventas en los últimos {days_threshold} días y existencia física positiva", ln=True)
    pdf.ln(3)

    # 3 Tarjetas de Resumen KPI
    y_kpi = pdf.get_y()
    
    # Tarjeta 1: Capital Inmovilizado
    pdf.set_xy(10, y_kpi)
    pdf.set_fill_color(254, 242, 242)  # Red light
    pdf.set_draw_color(254, 202, 202)
    pdf.rect(10, y_kpi, 60, 20, 'DF')
    pdf.set_xy(12, y_kpi + 2)
    pdf.set_font('Helvetica', 'B', 7.5)
    pdf.set_text_color(185, 28, 28)
    pdf.cell(56, 4, "CAPITAL INMOVILIZADO TOTAL", ln=True)
    pdf.set_xy(12, y_kpi + 7)
    pdf.set_font('Helvetica', 'B', 13)
    pdf.cell(56, 7, f"${total_capital:,.2f}", ln=True)
    pdf.set_xy(12, y_kpi + 14)
    pdf.set_font('Helvetica', '', 6.5)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(56, 4, "Riesgo financiero en almacén", ln=True)

    # Tarjeta 2: SKUs Dead Stock
    pdf.set_xy(75, y_kpi)
    pdf.set_fill_color(255, 251, 235)  # Amber light
    pdf.set_draw_color(253, 230, 138)
    pdf.rect(75, y_kpi, 60, 20, 'DF')
    pdf.set_xy(77, y_kpi + 2)
    pdf.set_font('Helvetica', 'B', 7.5)
    pdf.set_text_color(180, 83, 9)
    pdf.cell(56, 4, "PRODUCTOS INMÓVILES (CRÍTICO)", ln=True)
    pdf.set_xy(77, y_kpi + 7)
    pdf.set_font('Helvetica', 'B', 13)
    pdf.cell(56, 7, f"{total_dead} SKUs", ln=True)
    pdf.set_xy(77, y_kpi + 14)
    pdf.set_font('Helvetica', '', 6.5)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(56, 4, f"0 ventas >= {days_threshold} días", ln=True)

    # Tarjeta 3: Rotación Lenta
    pdf.set_xy(140, y_kpi)
    pdf.set_fill_color(248, 250, 252)  # Slate light
    pdf.set_draw_color(226, 232, 240)
    pdf.rect(140, y_kpi, 60, 20, 'DF')
    pdf.set_xy(142, y_kpi + 2)
    pdf.set_font('Helvetica', 'B', 7.5)
    pdf.set_text_color(71, 85, 105)
    pdf.cell(56, 4, "ROTACIÓN LENTA (ALERTA)", ln=True)
    pdf.set_xy(142, y_kpi + 7)
    pdf.set_font('Helvetica', 'B', 13)
    pdf.cell(56, 7, f"{total_slow} SKUs", ln=True)
    pdf.set_xy(142, y_kpi + 14)
    pdf.set_font('Helvetica', '', 6.5)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(56, 4, f"En riesgo de inmovilización", ln=True)

    pdf.set_y(y_kpi + 24)

    # Gráfico incrustado
    chart_path = _generate_dead_stock_chart(items)
    if chart_path and os.path.exists(chart_path):
        pdf.image(chart_path, x=10, y=pdf.get_y(), w=190)
        pdf.ln(72)
        try:
            os.unlink(chart_path)
        except Exception:
            pass
    else:
        pdf.ln(4)

    # Tabla Detallada
    pdf.set_font('Helvetica', 'B', 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 6, "DETALLE DE PRODUCTOS INMÓVILES PRIORITARIOS", ln=True)
    pdf.ln(1)

    def print_table_header():
        pdf.set_fill_color(30, 41, 59)  # #1E293B
        pdf.set_font('Helvetica', 'B', 7.5)
        pdf.set_text_color(255, 255, 255)
        pdf.set_draw_color(30, 41, 59)
        pdf.cell(24, 6, "SKU", border=1, fill=True)
        pdf.cell(62, 6, "Producto", border=1, fill=True)
        pdf.cell(28, 6, "Categoría", border=1, fill=True)
        pdf.cell(18, 6, "Stock", border=1, fill=True, align='R')
        pdf.cell(18, 6, "Días s/Vta", border=1, fill=True, align='R')
        pdf.cell(20, 6, "Costo ($)", border=1, fill=True, align='R')
        pdf.cell(20, 6, "Total ($)", border=1, fill=True, align='R')
        pdf.ln()

    print_table_header()

    fill = False
    for it in items[:60]:  # Mostrar los primeros 60 más críticos
        if pdf.get_y() > 270:
            pdf.add_page()
            print_table_header()

        pdf.set_fill_color(248, 250, 252) if fill else pdf.set_fill_color(255, 255, 255)
        pdf.set_draw_color(226, 232, 240)
        pdf.set_text_color(15, 23, 42)
        pdf.set_font('Helvetica', '', 7)

        sku = sanitize_pdf_text(str(it.get("sku", "")))
        p_name = sanitize_pdf_text(str(it.get("product_name", "")))
        if len(p_name) > 36:
            p_name = p_name[:34] + ".."
        cat = sanitize_pdf_text(str(it.get("category_name", "General")))
        if len(cat) > 16:
            cat = cat[:15] + "."

        stock = float(it.get("qty_on_hand", 0))
        days = int(it.get("days_without_sales", 0))
        cost = float(it.get("replacement_cost", 0) or 0)
        total_val = float(it.get("stock_valuation_usd", 0) or 0)

        pdf.cell(24, 5.5, sku, border=1, fill=fill)
        pdf.cell(62, 5.5, p_name, border=1, fill=fill)
        pdf.cell(28, 5.5, cat, border=1, fill=fill)
        pdf.cell(18, 5.5, f"{stock:,.0f}", border=1, fill=fill, align='R')
        pdf.cell(18, 5.5, f"{days}d", border=1, fill=fill, align='R')
        pdf.cell(20, 5.5, f"${cost:,.2f}", border=1, fill=fill, align='R')
        
        # Total en negrita
        pdf.set_font('Helvetica', 'B', 7)
        pdf.cell(20, 5.5, f"${total_val:,.2f}", border=1, fill=fill, align='R')
        pdf.ln()

        fill = not fill

    # Generar bytes del PDF
    pdf_bytes = pdf.output(dest='S')
    if isinstance(pdf_bytes, str):
        pdf_bytes = pdf_bytes.encode('latin-1', 'replace')

    # Guardar archivo en disco para URL de descarga en la web
    filename = f"Reporte_Dead_Stock_NeoERP_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:4]}.pdf"
    filepath = os.path.join(EXPORTS_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(pdf_bytes)

    return {
        "pdf_bytes": pdf_bytes,
        "filepath": filepath,
        "filename": filename,
        "download_url": f"/static/uploads/exports/{filename}",
        "total_dead_stock": total_dead,
        "total_slow_moving": total_slow,
        "total_capital_immobilized_usd": total_capital,
        "top_items": items[:5]
    }
