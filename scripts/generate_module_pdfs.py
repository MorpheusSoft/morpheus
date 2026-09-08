import os
import subprocess
import tempfile
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS_DIR = os.path.join(BASE_DIR, "docs")
MANUALS_DIR = os.path.join(DOCS_DIR, "manuales_uat")

MODULES = [
    {
        "md": "01_MANUAL_UAT_INVENTARIOS_Y_WMS.md",
        "pdf": "Modulo_1_Inventarios_y_WMS.pdf",
        "title": "Módulo 1: Inventarios, Almacenes y WMS",
        "subtitle": "Estructura de Almacenes, Conteos Físicos, Recepciones y Ajustes",
        "module_code": "MOD-01",
        "badge_color": "#2563eb"
    },
    {
        "md": "02_MANUAL_UAT_LOGISTICA_Y_RECEPCIONES.md",
        "pdf": "Modulo_2_Logistica_y_Recepciones.pdf",
        "title": "Módulo 2: Logística, Muelles y Transferencias",
        "subtitle": "Cross-Docking, Recepciones en Muelle, Envíos y Traslados entre Tiendas",
        "module_code": "MOD-02",
        "badge_color": "#059669"
    },
    {
        "md": "03_MANUAL_UAT_COMPRAS_Y_MRP.md",
        "pdf": "Modulo_3_Compras_y_MRP.pdf",
        "title": "Módulo 3: Compras, Motor MRP y Proveedores",
        "subtitle": "Cálculo de Reabastecimiento Automático, Órdenes de Compra y Portal de Proveedores",
        "module_code": "MOD-03",
        "badge_color": "#d97706"
    },
    {
        "md": "04_MANUAL_UAT_COSTOS_Y_PRICING.md",
        "pdf": "Modulo_4_Costos_y_Pricing.pdf",
        "title": "Módulo 4: Costos, Motor de Precios y Promociones",
        "subtitle": "Arquitectura Bimonetaria USD/VES, MarkUp, Márgenes Fiscales y Listas de Precios",
        "module_code": "MOD-04",
        "badge_color": "#7c3aed"
    },
    {
        "md": "05_MANUAL_UAT_IA_DASHBOARDS_CIERRE.md",
        "pdf": "Modulo_5_IA_Dashboards_y_Cierre.pdf",
        "title": "Módulo 5: Inteligencia Artificial, Dashboards y Auditoría",
        "subtitle": "CEO Inbox, Indicadores Ejecutivos en Tiempo Real, Trazabilidad y Cierre Formal",
        "module_code": "MOD-05",
        "badge_color": "#dc2626"
    },
    {
        "md": "01_MANUAL_UAT_MARTES_CADENA_ABASTECIMIENTO.md",
        "pdf": "Manual_UAT_Sesion_Martes_Cadena_Abastecimiento.pdf",
        "title": "Manual de Pruebas UAT: Cadena de Abastecimiento Integral",
        "subtitle": "Sesión Práctica de Ejecución en Muelle, Costos, Compras y WMS",
        "module_code": "SESION-01",
        "badge_color": "#0284c7"
    }
]

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>{title}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

@page {{
    size: A4 portrait;
    margin: 18mm 16mm 18mm 16mm;
}}

* {{
    box-sizing: border-box;
}}

body {{
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 9.5pt;
    line-height: 1.5;
    color: #1e293b;
    background: #ffffff;
    margin: 0;
    padding: 0;
}}

/* Top Brand Header */
.brand-header {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 10px;
    margin-bottom: 18px;
}}

.brand-title {{
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11pt;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: 0.5px;
}}

.brand-badge {{
    background: {badge_color};
    color: #ffffff;
    font-size: 8pt;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 4px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
}}

.meta-pill {{
    font-size: 8pt;
    color: #64748b;
    font-weight: 600;
    background: #f1f5f9;
    padding: 4px 10px;
    border-radius: 9999px;
    border: 1px solid #e2e8f0;
}}

/* Executive Meta Card */
.exec-card {{
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-left: 4px solid {badge_color};
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 22px;
}}

.exec-card-title {{
    font-size: 13pt;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 4px;
}}

.exec-card-sub {{
    font-size: 9pt;
    color: #475569;
    margin-bottom: 10px;
}}

.exec-grid {{
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    font-size: 8pt;
    color: #334155;
    border-top: 1px solid #e2e8f0;
    padding-top: 8px;
}}

.exec-item strong {{
    color: #0f172a;
    font-weight: 700;
}}

/* Content Typography */
h1 {{
    font-size: 16pt;
    font-weight: 800;
    color: #0f172a;
    margin-top: 16px;
    margin-bottom: 10px;
    line-height: 1.25;
    letter-spacing: -0.3px;
    border-bottom: 1.5px solid #e2e8f0;
    padding-bottom: 6px;
}}

h2 {{
    font-size: 12pt;
    font-weight: 700;
    color: #0f172a;
    margin-top: 20px;
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #f1f5f9;
}}

h3 {{
    font-size: 10.5pt;
    font-weight: 700;
    color: #1e293b;
    margin-top: 14px;
    margin-bottom: 6px;
}}

h4 {{
    font-size: 9.5pt;
    font-weight: 600;
    color: #334155;
    margin-top: 10px;
    margin-bottom: 4px;
}}

p {{
    margin-top: 0;
    margin-bottom: 8px;
}}

ul, ol {{
    margin-top: 3px;
    margin-bottom: 10px;
    padding-left: 18px;
}}

li {{
    margin-bottom: 3px;
}}

li > ul, li > ol {{
    margin-top: 2px;
    margin-bottom: 3px;
}}

/* Code Blocks & ASCII */
pre {{
    background: #0f172a;
    color: #f1f5f9;
    font-family: 'JetBrains Mono', Consolas, 'Courier New', monospace;
    font-size: 7.5pt;
    line-height: 1.35;
    padding: 10px 12px;
    border-radius: 5px;
    overflow-x: auto;
    margin: 10px 0;
    border: 1px solid #334155;
    page-break-inside: avoid;
    break-inside: avoid;
    white-space: pre;
}}

code {{
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 8.5pt;
    background: #f1f5f9;
    color: #4338ca;
    padding: 1.5px 5px;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
}}

pre code {{
    background: transparent;
    color: inherit;
    padding: 0;
    border: none;
    font-size: inherit;
}}

/* Tables */
table {{
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 8pt;
    page-break-inside: avoid;
    break-inside: avoid;
}}

th {{
    background: #1e293b;
    color: #ffffff;
    font-weight: 600;
    text-align: left;
    padding: 7px 9px;
    border: 1px solid #334155;
    letter-spacing: 0.2px;
}}

td {{
    padding: 6px 9px;
    border: 1px solid #e2e8f0;
    color: #334155;
    vertical-align: top;
}}

tr:nth-child(even) td {{
    background: #f8fafc;
}}

/* Callouts / Blockquotes */
blockquote {{
    margin: 10px 0;
    padding: 8px 12px;
    background: #f8fafc;
    border-left: 3.5px solid {badge_color};
    border-radius: 0 5px 5px 0;
    color: #334155;
    font-size: 8.5pt;
    page-break-inside: avoid;
    break-inside: avoid;
}}

blockquote p:last-child {{
    margin-bottom: 0;
}}

hr {{
    border: none;
    height: 1px;
    background: #e2e8f0;
    margin: 16px 0;
}}

strong {{
    font-weight: 700;
    color: #0f172a;
}}

.avoid-break {{
    page-break-inside: avoid;
    break-inside: avoid;
}}

/* Process Steps / Cards styling */
.step-card {{
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px 14px;
    margin: 10px 0;
    page-break-inside: avoid;
    break-inside: avoid;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}}
</style>
</head>
<body>

<div class="brand-header">
    <div class="brand-title">
        <span class="brand-badge">{module_code}</span>
        <span>MORPHEUS SOFT • PROTOCOLO UAT</span>
    </div>
    <div class="meta-pill">Septiembre 2026 • Versión 2.0 QA</div>
</div>

<div class="exec-card">
    <div class="exec-card-title">{title}</div>
    <div class="exec-card-sub">{subtitle}</div>
    <div class="exec-grid">
        <div class="exec-item"><strong>Entorno:</strong> QA Cloud (hub.qa.morpheussoft.net)</div>
        <div class="exec-item"><strong>Tienda Piloto:</strong> 10 - Tucacas (CAT-01)</div>
        <div class="exec-item"><strong>Acceso Central:</strong> AppSwitcher (Icono ▦)</div>
    </div>
</div>

<div class="content-body">
{content}
</div>

</body>
</html>
"""

def generate_pdf(mod):
    md_path = os.path.join(MANUALS_DIR, mod["md"])
    pdf_path = os.path.join(DOCS_DIR, mod["pdf"])
    
    if not os.path.exists(md_path):
        print(f"[!] No se encontró el archivo: {md_path}")
        return False
        
    print(f"\n[*] Procesando {mod['title']}...")
    
    # 1. Convert Markdown to HTML using marked
    marked_cmd = f"npx --yes marked -i \"{md_path}\""
    res = subprocess.run(marked_cmd, shell=True, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[!] Error ejecutando marked: {res.stderr}")
        return False
        
    html_content = res.stdout
    
    # 2. Inject into styled template
    full_html = HTML_TEMPLATE.format(
        title=mod["title"],
        subtitle=mod["subtitle"],
        module_code=mod["module_code"],
        badge_color=mod["badge_color"],
        content=html_content
    )
    
    with tempfile.NamedTemporaryFile(suffix=".html", delete=False, mode="w", encoding="utf-8") as tf:
        tf.write(full_html)
        temp_html_path = tf.name
        
    # 3. Print to PDF via Google Chrome
    chrome_cmd = [
        "google-chrome",
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--print-to-pdf-no-header",
        f"--print-to-pdf={pdf_path}",
        temp_html_path
    ]
    
    res = subprocess.run(chrome_cmd, capture_output=True, text=True)
    try:
        os.remove(temp_html_path)
    except:
        pass
        
    if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
        size_kb = os.path.getsize(pdf_path) / 1024
        # Get page count
        info = subprocess.run(["pdfinfo", pdf_path], capture_output=True, text=True)
        pages = "N/A"
        for line in info.stdout.splitlines():
            if line.startswith("Pages:"):
                pages = line.split(":", 1)[1].strip()
        print(f"  [OK] PDF generado: {pdf_path} ({size_kb:.1f} KB, {pages} páginas)")
        return True
    else:
        print(f"  [ERROR] Falló generación de {pdf_path}")
        return False

def main():
    print("=========================================================")
    print("  GENERADOR OFICIAL DE MANUALES PDF - MORPHEUS ERP / UAT")
    print("=========================================================")
    success = 0
    for mod in MODULES:
        if generate_pdf(mod):
            success += 1
            
    print("\n=========================================================")
    print(f"  [+] Generación completada: {success}/{len(MODULES)} manuales.")
    print("=========================================================")

if __name__ == "__main__":
    main()

def generate_master_pdf():
    print("\n[*] Generando Manual Maestro Unificado (Todos los Módulos 1 al 5)...")
    master_pdf_path = os.path.join(DOCS_DIR, "Manual_Completo_UAT_Morpheus_Modulos_1_al_5.pdf")
    
    sections_html = []
    
    # Cover Section
    cover_html = """
    <div style="padding-top: 60px; padding-bottom: 40px; text-align: center; page-break-after: always;">
        <div style="display: inline-block; background: #4f46e5; color: white; padding: 6px 16px; border-radius: 6px; font-size: 11pt; font-weight: 800; letter-spacing: 1px; margin-bottom: 24px;">
            MORPHEUS SOFT • ERP & WMS
        </div>
        <h1 style="font-size: 26pt; font-weight: 800; color: #0f172a; margin-bottom: 12px; line-height: 1.2; border: none;">
            Protocolo de Pruebas Integrales de Aceptación de Usuario (UAT)
        </h1>
        <div style="font-size: 13pt; color: #475569; font-weight: 600; margin-bottom: 40px;">
            Guía Oficial de Ejecución de Procesos de Negocio • Módulos 1 al 5
        </div>
        
        <div style="max-width: 550px; margin: 0 auto; text-align: left; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px 24px; font-size: 9.5pt;">
            <div style="font-size: 11pt; font-weight: 700; color: #0f172a; margin-bottom: 12px; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px;">
                Ficha Técnica del Protocolo
            </div>
            <p style="margin-bottom: 6px;"><strong>Proyecto:</strong> Morpheus ERP / Cloud WMS</p>
            <p style="margin-bottom: 6px;"><strong>Entorno de Pruebas:</strong> QA Staging (<code>https://hub.qa.morpheussoft.net</code>)</p>
            <p style="margin-bottom: 6px;"><strong>Tienda Piloto:</strong> 10 - Tucacas (CAT-01)</p>
            <p style="margin-bottom: 6px;"><strong>Versión:</strong> 2.0 Oficial (Septiembre 2026)</p>
            <p style="margin-bottom: 6px;"><strong>Acceso Unificado:</strong> Neo Core via AppSwitcher (Icono ▦)</p>
            <p style="margin-bottom: 0;"><strong>Audiencia:</strong> Operaciones, Almacén, Compras, Finanzas, TI y Gerencia General</p>
        </div>
        
        <div style="margin-top: 50px; font-size: 9pt; color: #64748b;">
            Documento Confidencial • Propiedad de MorpheusSoft & Cliente
        </div>
    </div>
    """
    sections_html.append(cover_html)
    
    # Process only modules 1 to 5
    for mod in MODULES[:5]:
        md_path = os.path.join(MANUALS_DIR, mod["md"])
        if not os.path.exists(md_path): continue
        
        marked_cmd = f"npx --yes marked -i \"{md_path}\""
        res = subprocess.run(marked_cmd, shell=True, capture_output=True, text=True)
        if res.returncode == 0:
            section_wrapper = f"""
            <div style="page-break-before: always;">
                <div class="brand-header">
                    <div class="brand-title">
                        <span class="brand-badge" style="background: {mod['badge_color']};">{mod['module_code']}</span>
                        <span>MORPHEUS SOFT • PROTOCOLO UAT</span>
                    </div>
                    <div class="meta-pill">Septiembre 2026 • Versión 2.0 QA</div>
                </div>
                <div class="exec-card" style="border-left-color: {mod['badge_color']};">
                    <div class="exec-card-title">{mod['title']}</div>
                    <div class="exec-card-sub">{mod['subtitle']}</div>
                    <div class="exec-grid">
                        <div class="exec-item"><strong>Entorno:</strong> QA Cloud (hub.qa.morpheussoft.net)</div>
                        <div class="exec-item"><strong>Tienda Piloto:</strong> 10 - Tucacas (CAT-01)</div>
                        <div class="exec-item"><strong>Acceso Central:</strong> AppSwitcher (Icono ▦)</div>
                    </div>
                </div>
                <div class="content-body">
                    {res.stdout}
                </div>
            </div>
            """
            sections_html.append(section_wrapper)
            
    full_body = "".join(sections_html)
    
    full_html = HTML_TEMPLATE.format(
        title="Manual Completo UAT Morpheus - Módulos 1 al 5",
        subtitle="Protocolo Integral de Validación",
        module_code="MASTER",
        badge_color="#4f46e5",
        content=full_body
    )
    
    with tempfile.NamedTemporaryFile(suffix=".html", delete=False, mode="w", encoding="utf-8") as tf:
        tf.write(full_html)
        temp_html_path = tf.name
        
    chrome_cmd = [
        "google-chrome",
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--print-to-pdf-no-header",
        f"--print-to-pdf={master_pdf_path}",
        temp_html_path
    ]
    
    res = subprocess.run(chrome_cmd, capture_output=True, text=True)
    try:
        os.remove(temp_html_path)
    except:
        pass
        
    if os.path.exists(master_pdf_path) and os.path.getsize(master_pdf_path) > 0:
        size_kb = os.path.getsize(master_pdf_path) / 1024
        info = subprocess.run(["pdfinfo", master_pdf_path], capture_output=True, text=True)
        pages = "N/A"
        for line in info.stdout.splitlines():
            if line.startswith("Pages:"):
                pages = line.split(":", 1)[1].strip()
        print(f"  [OK] Manual Maestro generado: {master_pdf_path} ({size_kb:.1f} KB, {pages} páginas)")

if __name__ == "__main__":
    generate_master_pdf()
