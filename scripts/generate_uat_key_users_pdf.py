#!/usr/bin/env python3
import os
import subprocess
import tempfile
import sys
import re

BASE_DIR = "/home/lzambrano/Desarrollo/Morpheus"
DOCS_DIR = os.path.join(BASE_DIR, "docs")
STATIC_MANUALS_DIR = os.path.join(BASE_DIR, "backend", "static", "manuales")
os.makedirs(STATIC_MANUALS_DIR, exist_ok=True)

INPUT_MD = os.path.join(DOCS_DIR, "manual_de_pruebas_integrales_uat_funcionalidades_listas.md")
OUTPUT_DOCS_PDF = os.path.join(DOCS_DIR, "MANUAL_PRUEBAS_UAT_KEY_USERS_MORPHEUS.pdf")
OUTPUT_STATIC_PDF = os.path.join(STATIC_MANUALS_DIR, "Manual_Pruebas_UAT_Key_Users_Morpheus.pdf")

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Manual Integral de Pruebas UAT - Key Users</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

@page {
    size: A4 portrait;
    margin: 16mm 14mm 16mm 14mm;
}

* {
    box-sizing: border-box;
}

body {
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 9pt;
    line-height: 1.45;
    color: #1e293b;
    background: #ffffff;
    margin: 0;
    padding: 0;
}

/* Cover Page */
.cover-page {
    min-height: 250mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    page-break-after: always;
    padding: 30px 20px;
}

.cover-badge {
    display: inline-block;
    background: linear-gradient(135deg, #0284c7, #0369a1);
    color: #ffffff;
    font-size: 9.5pt;
    font-weight: 800;
    letter-spacing: 1.5px;
    padding: 6px 18px;
    border-radius: 9999px;
    margin-bottom: 24px;
    text-transform: uppercase;
    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);
}

.cover-title {
    font-size: 26pt;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.15;
    margin: 0 0 14px 0;
    letter-spacing: -0.5px;
}

.cover-subtitle {
    font-size: 13pt;
    font-weight: 600;
    color: #475569;
    max-width: 620px;
    margin: 0 auto 36px auto;
    line-height: 1.4;
}

.cover-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-top: 4px solid #0284c7;
    border-radius: 8px;
    padding: 20px 24px;
    text-align: left;
    max-width: 580px;
    width: 100%;
    margin-bottom: 30px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

.cover-card-title {
    font-size: 11pt;
    font-weight: 700;
    color: #0f172a;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 8px;
    margin-bottom: 12px;
}

.cover-meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 16px;
    font-size: 8.5pt;
}

.cover-meta-item strong {
    color: #0f172a;
}

.cover-footer-note {
    font-size: 8.5pt;
    color: #64748b;
}

/* Page Running Header */
.running-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1.5px solid #e2e8f0;
    padding-bottom: 6px;
    margin-bottom: 16px;
    font-size: 8pt;
    color: #64748b;
    font-weight: 600;
}

.running-logo {
    font-weight: 800;
    color: #0284c7;
    letter-spacing: 0.5px;
}

/* Headings */
h1 {
    font-size: 16pt;
    font-weight: 800;
    color: #0f172a;
    margin-top: 20px;
    margin-bottom: 12px;
    letter-spacing: -0.3px;
    border-bottom: 2px solid #0284c7;
    padding-bottom: 6px;
    page-break-after: avoid;
}

h2 {
    font-size: 13pt;
    font-weight: 800;
    color: #0f172a;
    margin-top: 22px;
    margin-bottom: 10px;
    page-break-after: avoid;
    display: flex;
    align-items: center;
    gap: 8px;
}

h3 {
    font-size: 10.5pt;
    font-weight: 700;
    color: #0369a1;
    background: #f0f9ff;
    border-left: 4px solid #0284c7;
    padding: 6px 12px;
    border-radius: 0 6px 6px 0;
    margin-top: 18px;
    margin-bottom: 10px;
    page-break-after: avoid;
}

h4 {
    font-size: 9.5pt;
    font-weight: 700;
    color: #0f172a;
    margin-top: 12px;
    margin-bottom: 6px;
    page-break-after: avoid;
}

p {
    margin: 0 0 8px 0;
}

/* Lists */
ul, ol {
    margin: 0 0 10px 0;
    padding-left: 20px;
}

li {
    margin-bottom: 4px;
}

/* Code & Pre */
code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8pt;
    background: #f1f5f9;
    color: #0f172a;
    padding: 1.5px 5px;
    border-radius: 3px;
    border: 1px solid #e2e8f0;
}

pre {
    background: #0f172a;
    color: #f8fafc;
    padding: 10px 14px;
    border-radius: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8pt;
    overflow-x: auto;
    margin: 10px 0;
    line-height: 1.4;
    page-break-inside: avoid;
}

pre code {
    background: transparent;
    border: none;
    color: inherit;
    padding: 0;
}

/* Tables */
table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8pt;
    margin: 12px 0 16px 0;
    page-break-inside: avoid;
}

th, td {
    padding: 6px 10px;
    border: 1px solid #cbd5e1;
    text-align: left;
}

th {
    background: #0f172a;
    color: #ffffff;
    font-weight: 700;
    letter-spacing: 0.3px;
}

tr:nth-child(even) td {
    background: #f8fafc;
}

/* Blockquotes / Callouts */
blockquote {
    border-left: 4px solid #0284c7;
    background: #f0f9ff;
    color: #0369a1;
    margin: 10px 0;
    padding: 8px 14px;
    border-radius: 0 6px 6px 0;
    font-size: 8.5pt;
    page-break-inside: avoid;
}

/* Visual Roadmap Box */
.roadmap-container {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin: 14px 0 20px 0;
    page-break-inside: avoid;
}

.roadmap-card {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-top: 3px solid #0284c7;
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 7.5pt;
}

.roadmap-card-title {
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 4px;
    font-size: 8pt;
}

.roadmap-card-cases {
    color: #475569;
    line-height: 1.35;
}

/* Result Box for [✓] */
.success-box {
    background: #f0fdf4;
    border: 1px solid #86efac;
    border-left: 4px solid #16a34a;
    color: #14532d;
    padding: 8px 12px;
    border-radius: 0 6px 6px 0;
    margin: 8px 0 12px 0;
    font-size: 8.5pt;
    font-weight: 600;
    page-break-inside: avoid;
}

.signature-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 20px;
    margin-top: 30px;
    page-break-inside: avoid;
}

.sig-box {
    border-top: 1.5px dashed #64748b;
    padding-top: 6px;
    font-size: 8pt;
    text-align: center;
    color: #334155;
}

.page-break {
    page-break-before: always;
}
</style>
</head>
<body>

<!-- Cover Page -->
<div class="cover-page">
    <div class="cover-badge">Protocolo Oficial UAT • Key Users</div>
    <h1 class="cover-title">MANUAL INTEGRAL DE PRUEBAS<br>DE USUARIO</h1>
    <div class="cover-subtitle">
        Guía Práctica de Ejecución sobre Base de Datos Limpia (Zero-Data / Fresh Start)
        <br><strong style="color: #0284c7;">29 Funcionalidades Operativas Listas [✓]</strong>
    </div>
    
    <div class="cover-card">
        <div class="cover-card-title">Ficha Técnica de Homologación</div>
        <div class="cover-meta-grid">
            <div class="cover-meta-item"><strong>Proyecto:</strong> Morpheus ERP / Cloud WMS</div>
            <div class="cover-meta-item"><strong>Entorno:</strong> QA Staging</div>
            <div class="cover-meta-item"><strong>URL Central:</strong> hub.qa.morpheussoft.net</div>
            <div class="cover-meta-item"><strong>Sucursal Piloto:</strong> Patio Trigal (ID: 1)</div>
            <div class="cover-meta-item"><strong>Versión:</strong> 1.0 Oficial (Septiembre 2026)</div>
            <div class="cover-meta-item"><strong>Madurez Suite:</strong> 29 / 35 Funcionalidades (82.9%)</div>
            <div class="cover-meta-item"><strong>Acceso:</strong> Single Sign-On (AppSwitcher ▦)</div>
            <div class="cover-meta-item"><strong>Audiencia:</strong> Key Users de Almacén, Compras y Finanzas</div>
        </div>
    </div>
    
    <div class="cover-footer-note">
        MorpheusSoft Technologies • Documento Confidencial de Pruebas de Aceptación
    </div>
</div>

<!-- Running Header Template for Content Pages -->
<div class="running-header">
    <div class="running-logo">⚡ MORPHEUS ERP / WMS • PROTOCOLO UAT KEY USERS</div>
    <div>QA Staging • Septiembre 2026 • Versión 1.0</div>
</div>

<div class="content-body">
{content}
</div>

</body>
</html>
"""

def replace_mermaid_with_styled_roadmap(md_text):
    roadmap_html = """
<div class="roadmap-container">
    <div class="roadmap-card">
        <div class="roadmap-card-title">1. INFRAESTRUCTURA</div>
        <div class="roadmap-card-cases">
            • Casos 01 al 04<br>
            • Almacenes, Ubicaciones DOCK/SHELF/LOSS, Proveedores y Productos EAN-13.
        </div>
    </div>
    <div class="roadmap-card">
        <div class="roadmap-card-title">2. COMPRAS & MRP</div>
        <div class="roadmap-card-cases">
            • Casos 05 al 07<br>
            • Sugerido MRP predictivo, ODC Bimonetaria y Portal B2B Proveedor.
        </div>
    </div>
    <div class="roadmap-card">
        <div class="roadmap-card-title">3. INBOUND WMS</div>
        <div class="roadmap-card-cases">
            • Casos 08 al 10<br>
            • Recepción en Muelle DOCK con Lotes, Vencimientos y Ticket 80mm.
        </div>
    </div>
    <div class="roadmap-card">
        <div class="roadmap-card-title">4. CALIDAD & FEFO</div>
        <div class="roadmap-card-cases">
            • Casos 11 al 14<br>
            • Semáforo FEFO, Bloqueo Cuarentena, Putaway y Mapa Térmico.
        </div>
    </div>
    <div class="roadmap-card">
        <div class="roadmap-card-title">5. 3-WAY MATCH</div>
        <div class="roadmap-card-cases">
            • Casos 15 al 18<br>
            • Cruce ODC vs WMS vs Factura, Nota de Débito y Protección de Margen.
        </div>
    </div>
    <div class="roadmap-card">
        <div class="roadmap-card-title">6. COSTOS & PRICING</div>
        <div class="roadmap-card-cases">
            • Casos 19 al 22<br>
            • Costo Promedio, Sesión Precios 30%, Habladores y Kiosco.
        </div>
    </div>
    <div class="roadmap-card">
        <div class="roadmap-card-title">7. DESPACHOS & KARDEX</div>
        <div class="roadmap-card-cases">
            • Casos 23 al 27<br>
            • Picking FEFO sin cuarentena, Traslados, Mermas y Balance Kardex.
        </div>
    </div>
    <div class="roadmap-card">
        <div class="roadmap-card-title">8. IA & PORTAL B2B</div>
        <div class="roadmap-card-cases">
            • Casos 28 y 29<br>
            • Consultas Asistente IA WMS y Pedido en Catálogo B2B Mayorista.
        </div>
    </div>
</div>
"""
    pattern = r'```mermaid[\s\S]*?```'
    return re.sub(pattern, roadmap_html, md_text)

def main():
    print("=" * 60)
    print("Generador de PDF Ejecutivo UAT para Key Users")
    print("=" * 60)
    
    if not os.path.exists(INPUT_MD):
        print(f"Error: No se encontró el archivo {INPUT_MD}")
        sys.exit(1)
        
    with open(INPUT_MD, "r", encoding="utf-8") as f:
        raw_md = f.read()
        
    clean_md = replace_mermaid_with_styled_roadmap(raw_md)
    
    with tempfile.NamedTemporaryFile(suffix=".md", delete=False, mode="w", encoding="utf-8") as tf_md:
        tf_md.write(clean_md)
        temp_md_path = tf_md.name
        
    marked_cmd = f"npx --yes marked -i \"{temp_md_path}\""
    res = subprocess.run(marked_cmd, shell=True, capture_output=True, text=True)
    try:
        os.remove(temp_md_path)
    except:
        pass
        
    if res.returncode != 0:
        print(f"Error al ejecutar marked: {res.stderr}")
        sys.exit(1)
        
    html_content = res.stdout
    
    phases = [
        "FASE 1: Infraestructura",
        "FASE 2: Compras",
        "FASE 3: Recepción",
        "FASE 4: Almacenamiento",
        "FASE 5: Conciliación",
        "FASE 6: Costos",
        "FASE 7: Operaciones",
        "FASE 8: Inteligencia",
        "5. Matriz de Evaluación"
    ]
    
    for ph in phases:
        html_content = re.sub(
            rf'(<h[23][^>]*>.*?' + re.escape(ph) + r'.*?</h[23]>)',
            r'<div class="page-break"></div>\1',
            html_content
        )
        
    full_html = HTML_TEMPLATE.replace("{content}", html_content)
    
    with tempfile.NamedTemporaryFile(suffix=".html", delete=False, mode="w", encoding="utf-8") as tf_html:
        tf_html.write(full_html)
        temp_html_path = tf_html.name
        
    print(f"Compilando PDF con Google Chrome Headless...")
    
    chrome_cmd = [
        "google-chrome",
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--print-to-pdf-no-header",
        f"--print-to-pdf={OUTPUT_DOCS_PDF}",
        temp_html_path
    ]
    
    chrome_res = subprocess.run(chrome_cmd, capture_output=True, text=True)
    try:
        os.remove(temp_html_path)
    except:
        pass
        
    if os.path.exists(OUTPUT_DOCS_PDF) and os.path.getsize(OUTPUT_DOCS_PDF) > 0:
        import shutil
        shutil.copyfile(OUTPUT_DOCS_PDF, OUTPUT_STATIC_PDF)
        
        size_kb = os.path.getsize(OUTPUT_DOCS_PDF) / 1024
        print(f"✓ PDF generado exitosamente:")
        print(f"  - Documento local:  {OUTPUT_DOCS_PDF} ({size_kb:.1f} KB)")
        print(f"  - Descargable Web:  {OUTPUT_STATIC_PDF}")
    else:
        print(f"Error generando PDF: {chrome_res.stderr}")
        sys.exit(1)

if __name__ == "__main__":
    main()
