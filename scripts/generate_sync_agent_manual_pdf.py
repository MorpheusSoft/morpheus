#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generador de PDF Ejecutivo: Manual de Instalación y Configuración Neo Sync Agent
Ecosistema Neo ERP
"""

import os
import subprocess
import tempfile
import sys
import shutil

BASE_DIR = "/home/lzambrano/Desarrollo/Morpheus"
DOCS_DIR = os.path.join(BASE_DIR, "docs")
STATIC_MANUALS_DIR = os.path.join(BASE_DIR, "backend", "static", "manuales")
os.makedirs(DOCS_DIR, exist_ok=True)
os.makedirs(STATIC_MANUALS_DIR, exist_ok=True)

OUTPUT_DOCS_PDF = os.path.join(DOCS_DIR, "MANUAL_INSTALACION_Y_CONFIGURACION_NEO_SYNC_AGENT.pdf")
OUTPUT_STATIC_PDF = os.path.join(STATIC_MANUALS_DIR, "Manual_Instalacion_Neo_Sync_Agent.pdf")

HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Manual de Instalación y Configuración - Neo Sync Agent</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

@page {
    size: A4 portrait;
    margin: 14mm 14mm 16mm 14mm;
    @bottom-right {
        content: counter(page);
    }
}

* {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}

body {
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 8.8pt;
    line-height: 1.5;
    color: #1e293b;
    background: #ffffff;
    margin: 0;
    padding: 0;
}

/* Page Breaks */
.page-break {
    page-break-before: always;
}

.no-break {
    page-break-inside: avoid;
}

/* Cover Page */
.cover-page {
    min-height: 258mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    page-break-after: always;
    padding: 10px 10px 0 10px;
}

.cover-top {
    text-align: left;
}

.cover-badge-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 24px;
}

.cover-badge {
    display: inline-flex;
    align-items: center;
    background: linear-gradient(135deg, #4f46e5, #3730a3);
    color: #ffffff;
    font-size: 8.5pt;
    font-weight: 800;
    letter-spacing: 1.2px;
    padding: 5px 14px;
    border-radius: 9999px;
    text-transform: uppercase;
    box-shadow: 0 4px 10px rgba(79, 70, 229, 0.25);
}

.cover-badge-secondary {
    display: inline-flex;
    align-items: center;
    background: #f1f5f9;
    color: #475569;
    font-size: 8.5pt;
    font-weight: 700;
    padding: 5px 14px;
    border-radius: 9999px;
    border: 1px solid #e2e8f0;
}

.cover-title {
    font-size: 26pt;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.15;
    margin: 0 0 14px 0;
    letter-spacing: -0.8px;
}

.cover-title span {
    background: linear-gradient(135deg, #4f46e5, #0284c7);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.cover-subtitle {
    font-size: 12pt;
    font-weight: 500;
    color: #475569;
    max-width: 620px;
    margin: 0 0 28px 0;
    line-height: 1.45;
}

.cover-diagram {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 24px;
    display: flex;
    justify-content: space-around;
    align-items: center;
    text-align: center;
}

.diag-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}

.diag-icon {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 14pt;
    color: white;
}

.diag-pos { background: #0284c7; }
.diag-agent { background: #4f46e5; }
.diag-cloud { background: #059669; }

.diag-title {
    font-size: 8pt;
    font-weight: 700;
    color: #1e293b;
}

.diag-sub {
    font-size: 7pt;
    color: #64748b;
}

.diag-arrow {
    font-size: 14pt;
    color: #94a3b8;
    font-weight: bold;
}

.cover-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-left: 4px solid #4f46e5;
    border-radius: 10px;
    padding: 18px 22px;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
    margin-bottom: 24px;
}

.cover-card-title {
    font-size: 10pt;
    font-weight: 800;
    color: #0f172a;
    border-bottom: 1px solid #f1f5f9;
    padding-bottom: 8px;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.cover-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 18px;
    font-size: 8.5pt;
}

.cover-grid-item strong {
    color: #0f172a;
    display: inline-block;
    min-width: 110px;
}

.cover-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #e2e8f0;
    padding-top: 12px;
    font-size: 7.5pt;
    color: #64748b;
}

/* Header & Footer on Pages */
.page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1.5px solid #e2e8f0;
    padding-bottom: 6px;
    margin-bottom: 14px;
    font-size: 7.5pt;
    color: #64748b;
    font-weight: 600;
}

.page-header-logo {
    font-weight: 800;
    color: #4f46e5;
    letter-spacing: 0.5px;
}

.page-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #e2e8f0;
    padding-top: 6px;
    font-size: 7.5pt;
    color: #94a3b8;
}

/* Headings */
h1:not(.cover-title) {
    font-size: 14pt;
    font-weight: 800;
    color: #0f172a;
    margin: 18px 0 10px 0;
    display: flex;
    align-items: center;
    gap: 8px;
    letter-spacing: -0.3px;
}

h1:not(.cover-title)::before {
    content: "";
    display: inline-block;
    width: 4px;
    height: 18px;
    background: #4f46e5;
    border-radius: 2px;
}

h2 {
    font-size: 11pt;
    font-weight: 800;
    color: #1e293b;
    margin: 14px 0 8px 0;
    display: flex;
    align-items: center;
    gap: 6px;
    border-bottom: 1px solid #f1f5f9;
    padding-bottom: 4px;
}

h3 {
    font-size: 9.5pt;
    font-weight: 700;
    color: #334155;
    margin: 10px 0 6px 0;
}

p {
    margin: 0 0 8px 0;
    color: #334155;
}

/* Badges and Tags */
.badge {
    display: inline-block;
    padding: 2px 7px;
    font-size: 7.5pt;
    font-weight: 700;
    border-radius: 6px;
}

.badge-emerald { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
.badge-indigo { background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; }
.badge-amber { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
.badge-slate { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }

/* Callout Boxes */
.callout {
    border-radius: 8px;
    padding: 10px 14px;
    margin: 10px 0;
    font-size: 8.3pt;
    line-height: 1.45;
}

.callout-info {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-left: 4px solid #16a34a;
    color: #166534;
}

.callout-tip {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-left: 4px solid #2563eb;
    color: #1e40af;
}

.callout-warning {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-left: 4px solid #d97706;
    color: #92400e;
}

/* Method Cards */
.methods-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 12px 0;
}

.method-card {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px;
    background: #f8fafc;
    position: relative;
}

.method-card.featured {
    border-color: #818cf8;
    background: #faf5ff;
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.08);
}

.method-tag {
    position: absolute;
    top: -9px;
    right: 14px;
    background: #4f46e5;
    color: white;
    font-size: 6.5pt;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 9999px;
    text-transform: uppercase;
}

.method-title {
    font-size: 10pt;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
}

/* Terminal & Code Blocks */
.terminal {
    background: #0f172a;
    border-radius: 8px;
    padding: 10px 12px;
    color: #f8fafc;
    margin: 8px 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 7.8pt;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.terminal-header {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 8px;
    border-bottom: 1px solid #334155;
    padding-bottom: 5px;
}

.term-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
}

.term-dot-red { background: #ef4444; }
.term-dot-yellow { background: #f59e0b; }
.term-dot-green { background: #10b981; }

.term-title {
    font-size: 7pt;
    color: #94a3b8;
    margin-left: 6px;
}

.terminal code {
    color: #38bdf8;
    line-height: 1.4;
    word-break: break-all;
    display: block;
}

.terminal .comment {
    color: #64748b;
}

/* Steps Process */
.step-card {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 10px;
    background: #ffffff;
}

.step-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
}

.step-num {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: #4f46e5;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 8pt;
}

.step-title {
    font-weight: 800;
    color: #0f172a;
    font-size: 9.2pt;
}

/* Tables */
table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8pt;
    margin: 8px 0;
}

th {
    background: #f1f5f9;
    color: #334155;
    font-weight: 700;
    text-align: left;
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    font-size: 7.5pt;
    text-transform: uppercase;
}

td {
    padding: 6px 8px;
    border: 1px solid #e2e8f0;
    color: #334155;
}

tr:nth-child(even) td {
    background: #f8fafc;
}

/* Remote Control Pad Simulation */
.remote-pad {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 8px 0;
}

.remote-btn {
    border: 1px solid #e2e8f0;
    background: #ffffff;
    border-radius: 8px;
    padding: 8px 10px;
}

.remote-btn-title {
    font-weight: 700;
    font-size: 8pt;
    color: #0f172a;
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 2px;
}

.remote-btn-desc {
    font-size: 7.2pt;
    color: #64748b;
    line-height: 1.3;
}

</style>
</head>
<body>

<!-- ==================== PORTADA ==================== -->
<div class="cover-page">
    <div class="cover-top">
        <div class="cover-badge-row">
            <span class="cover-badge">Ecosistema Neo ERP</span>
            <span class="cover-badge-secondary">Neo Core & Retail Hub</span>
            <span class="cover-badge-secondary">Versión Oficial 2.2.0-neo</span>
        </div>

        <h1 class="cover-title">
            Manual de Instalación<br>y Configuración: <span>Neo Sync Agent</span>
        </h1>
        
        <p class="cover-subtitle">
            Guía oficial de integración continua entre tiendas físicas con <strong>Stellar POS (SQL Server VAD10/VAD20)</strong> y la plataforma en la nube <strong>Neo ERP</strong>.
        </p>

        <!-- Diagrama Arquitectura -->
        <div class="cover-diagram">
            <div class="diag-node">
                <div class="diag-icon diag-pos">POS</div>
                <div class="diag-title">Stellar POS</div>
                <div class="diag-sub">SQL Server (VAD10/20)</div>
            </div>
            <div class="diag-arrow">➔</div>
            <div class="diag-node">
                <div class="diag-icon diag-agent">AG</div>
                <div class="diag-title">Neo Sync Agent</div>
                <div class="diag-sub">C# Worker (.NET 9)</div>
            </div>
            <div class="diag-arrow">➔</div>
            <div class="diag-node">
                <div class="diag-icon diag-cloud">NEO</div>
                <div class="diag-title">Neo ERP Cloud</div>
                <div class="diag-sub">WMS • Ventas • Dante AI</div>
            </div>
        </div>

        <!-- Ficha Técnica -->
        <div class="cover-card">
            <div class="cover-card-title">Ficha Técnica del Documento</div>
            <div class="cover-grid">
                <div class="cover-grid-item"><strong>Sistema Central:</strong> Neo ERP Hub</div>
                <div class="cover-grid-item"><strong>Agente de Tienda:</strong> Neo Sync Agent</div>
                <div class="cover-grid-item"><strong>Configurador Visual:</strong> MorpheusConfigurador.exe</div>
                <div class="cover-grid-item"><strong>Servicio Windows:</strong> NeoAgentSync (Automático)</div>
                <div class="cover-grid-item"><strong>Entorno Compatible:</strong> Stellar POS / SQL Server</div>
                <div class="cover-grid-item"><strong>Protocolo de Red:</strong> TLS 1.2 / HTTPS (Outbound)</div>
                <div class="cover-grid-item"><strong>Audiencia:</strong> Soporte TI, Administradores, Gerentes</div>
                <div class="cover-grid-item"><strong>Vigencia:</strong> Septiembre 2026 - Producción</div>
            </div>
        </div>
    </div>

    <div class="cover-footer">
        <div>Neo ERP • Manual Técnico de Sincronización de Sucursales</div>
        <div>Documento Oficial de Entrega al Cliente</div>
    </div>
</div>

<!-- ==================== PÁGINA 2: INTRODUCCIÓN Y REQUISITOS ==================== -->
<div class="page-header">
    <span class="page-header-logo">Neo ERP • Neo Sync Agent</span>
    <span>1. Introducción y Requisitos Previos</span>
</div>

<h1>1. Introducción y Arquitectura de Integración</h1>
<p>
<strong>Neo Sync Agent</strong> es la pieza de software instalada localmente en cada una de las 15 tiendas físicas para enlazar su sistema de facturación local (Stellar POS bajo SQL Server) con el ecosistema central de <strong>Neo ERP</strong>.
</p>

<div class="callout callout-info">
<strong>Objetivo Operativo:</strong> Garantizar que cada ticket cobrado en caja se transmita automáticamente hacia Neo ERP en tiempo real o cada 10 minutos, descargando existencias en el Kardex de WMS y reportando telemetría al asistente digital <strong>Dante</strong>, sin necesidad de abrir puertos entrantes en los routers de tienda (comunicación 100% saliente por HTTPS).
</div>

<h2>Capacidades del Sistema</h2>
<ul>
    <li><strong>Sincronización Continua de Ventas:</strong> Extracción incremental con memoria de estado local en SQLite y prevención total de doble facturación.</li>
    <li><strong>Mapeo Inteligente de Depósitos:</strong> Permite sincronizar únicamente los pisos de venta activos y omitir depósitos de avería o merma.</li>
    <li><strong>Carga de Catálogos Maestros:</strong> Sube artículos, SKU, códigos de barra (unidades y bultos), proveedores y costos de compra.</li>
    <li><strong>Inventario Inicial (Baseline):</strong> Carga la foto de existencia inicial a fecha de corte para el arranque en vivo.</li>
    <li><strong>Botonera de Control Remoto (Web):</strong> Permite forzar sincronizaciones, reiniciar el servicio o auto-actualizar el software remotamente vía OTA.</li>
</ul>

<h2>Requisitos Previos de Instalación</h2>
<table>
    <thead>
        <tr>
            <th style="width: 25%;">Componente</th>
            <th style="width: 35%;">Requisito Mínimo</th>
            <th style="width: 40%;">Observaciones</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td><strong>Sistema Operativo</strong></td>
            <td>Windows 10, Windows 11 o Windows Server (64 bits)</td>
            <td>Funciona en computadoras de caja principal o servidores locales de tienda.</td>
        </tr>
        <tr>
            <td><strong>Base de Datos Local</strong></td>
            <td>Microsoft SQL Server (2012 o superior)</td>
            <td>Base de datos de Stellar POS: <code>VAD10</code> o <code>VAD20</code>.</td>
        </tr>
        <tr>
            <td><strong>Permisos de Usuario</strong></td>
            <td>Administrador local de Windows</td>
            <td>Requerido para registrar el Servicio de Windows y crear carpetas.</td>
        </tr>
        <tr>
            <td><strong>Conectividad de Red</strong></td>
            <td>Internet saliente HTTPS (Puerto 443)</td>
            <td>Enlace hacia <code>https://api.qa.morpheussoft.net</code>. No requiere IP fija ni apertura de puertos.</td>
        </tr>
        <tr>
            <td><strong>Librerías / SDK</strong></td>
            <td>Ninguna requerida</td>
            <td>El agente es <strong>auto-contenido (.NET 9)</strong>. No requiere instalar frameworks adicionales.</td>
        </tr>
    </tbody>
</table>

<!-- ==================== PÁGINA 3: MÉTODOS DE INSTALACIÓN ==================== -->
<div class="page-break"></div>
<div class="page-header">
    <span class="page-header-logo">Neo ERP • Neo Sync Agent</span>
    <span>2. Métodos de Instalación</span>
</div>

<h1>2. Métodos de Instalación</h1>
<p>La instalación puede realizarse por cualquiera de las dos vías detalladas a continuación:</p>

<div class="methods-grid">
    <div class="method-card featured">
        <span class="method-tag">Recomendado</span>
        <div class="method-title">
            <span>⚡ Método 1: Comando Rápido</span>
        </div>
        <p style="font-size: 7.8pt; color: #475569;">
            Ideal para personal de TI o administradores. Ejecuta la instalación completa en menos de 30 segundos con una sola línea en PowerShell.
        </p>
    </div>
    <div class="method-card">
        <div class="method-title">
            <span>📦 Método 2: Descarga ZIP</span>
        </div>
        <p style="font-size: 7.8pt; color: #475569;">
            Ideal para supervisores de tienda que prefieren descargar el archivo comprimido mediante el navegador y descomprimirlo visualmente.
        </p>
    </div>
</div>

<h2>🔹 Método 1: Instalación Rápida por PowerShell (Recomendado)</h2>
<p>
1. En la máquina de la tienda, presione la tecla <code>Windows</code>, escriba <strong>PowerShell</strong>, haga clic derecho y seleccione <strong>"Ejecutar como Administrador"</strong>.<br>
2. Copie, pegue en la consola y presione <code>Enter</code>:
</p>

<div class="terminal">
    <div class="terminal-header">
        <span class="term-dot term-dot-red"></span>
        <span class="term-dot term-dot-yellow"></span>
        <span class="term-dot term-dot-green"></span>
        <span class="term-title">Windows PowerShell (Administrador)</span>
    </div>
    <code>[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://api.qa.morpheussoft.net/static/instalar.ps1 | iex</code>
</div>

<div class="callout callout-tip">
<strong>¿Por qué se incluye la instrucción TLS 1.2?</strong><br>
En sistemas Windows 10 y Windows Server, PowerShell 5.1 intenta usar por defecto versiones antiguas de SSL que son rechazadas por servidores modernos. La línea <code>[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;</code> garantiza que la descarga use cifrado <strong>TLS 1.2</strong>, resolviendo de raíz cualquier problema de conexión subyacente.
</div>

<h3>Acciones automáticas que ejecuta el script:</h3>
<ol>
    <li>Detiene procesos y servicios previos si estaban en ejecución para liberar los archivos <code>.exe</code>.</li>
    <li>Descarga el paquete oficial actualizado desde <code>https://api.qa.morpheussoft.net/static/MorpheusSyncAgent_Installer.zip</code>.</li>
    <li><strong>Protección de configuración:</strong> Si ya existía un archivo <code>appsettings.json</code> previo, realiza un respaldo temporal y lo restaura intacto para no perder credenciales ni tiendas configuradas.</li>
    <li>Extrae todos los componentes en el directorio estándar: <code>C:\MorpheusSyncAgent</code>.</li>
    <li>Registra y levanta el servicio de Windows <strong><code>NeoAgentSync</code></strong> (Nombre: <em>NEO Agent Sync - Integrador con Stellar</em>).</li>
    <li>Abre en pantalla el configurador gráfico <strong><code>MorpheusConfigurador.exe</code></strong> listo para parametrizar.</li>
</ol>

<h2>🔹 Método 2: Instalación Manual mediante Descarga ZIP</h2>
<ol>
    <li>Abra el navegador web en la máquina de la tienda y descargue el archivo oficial:<br>
    👉 <strong style="color: #4f46e5;">https://api.qa.morpheussoft.net/static/MorpheusSyncAgent_Installer.zip</strong></li>
    <li>Haga clic derecho sobre el archivo descargado y elija <strong>"Extraer todo..."</strong>.</li>
    <li>Especifique como carpeta de destino exactamente: <code>C:\MorpheusSyncAgent</code>.</li>
    <li>Ingrese a dicha carpeta y ejecute como Administrador el archivo <strong><code>MorpheusConfigurador.exe</code></strong>.</li>
</ol>

<!-- ==================== PÁGINA 4: CONFIGURACIÓN PASO A PASO ==================== -->
<div class="page-break"></div>
<div class="page-header">
    <span class="page-header-logo">Neo ERP • Neo Sync Agent</span>
    <span>3. Configuración Paso a Paso (Panel Visual)</span>
</div>

<h1>3. Configuración Paso a Paso en el Panel Visual</h1>
<p>
Al ejecutarse <strong><code>MorpheusConfigurador.exe</code></strong>, el personal de tienda o TI dispondrá de una interfaz gráfica intuitiva dividida en 5 pestañas de trabajo:
</p>

<!-- PASO 1 -->
<div class="step-card no-break">
    <div class="step-card-header">
        <div class="step-num">1</div>
        <div class="step-title">Pestaña 5: Conexiones & Tienda (Enlace SQL Server y Neo ERP)</div>
    </div>
    <p>Configure las credenciales de acceso a la base de datos de Stellar POS:</p>
    <ul>
        <li><strong>Servidor SQL Server:</strong> Nombre de la máquina, instancia local (ej: <code>localhost</code>, <code>.\SQLEXPRESS</code>) o IP local (ej: <code>192.168.1.50</code>).</li>
        <li><strong>Base de Datos:</strong> Nombre de la base de datos Stellar (habitualmente <code>VAD10</code> o <code>VAD20</code>).</li>
        <li><strong>Usuario y Contraseña SQL:</strong> Usuario del motor (ej: <code>sa</code>) y su clave.</li>
        <li>Presione el botón <strong><code>[ 🔍 Probar Conexión SQL ]</code></strong>. El sistema verificará la lectura de <code>MA_PRODUCTOS</code>, <code>MA_TRANSACCION</code> y <code>MA_DEPOSITO</code>.</li>
        <li>En la sección de nube, seleccione la <strong>Sucursal / Tienda</strong> asignada (ej: <code>10 - CATANIA TUCACAS</code>).</li>
        <li>Haga clic en <strong><code>[ 💾 Guardar Configuración ]</code></strong>.</li>
    </ul>
</div>

<!-- PASO 2 -->
<div class="step-card no-break">
    <div class="step-card-header">
        <div class="step-num">2</div>
        <div class="step-title">Pestaña 2: Mapeo de Depósitos (Stellar POS ➔ Neo WMS)</div>
    </div>
    <p>Define qué depósitos de la tienda física descargan stock real en Neo ERP y cuáles se ignoran:</p>
    <ul>
        <li>Haga clic en <strong><code>[ 🔍 1. Detectar Depósitos (Stellar) ]</code></strong>: El sistema listará los depósitos existentes en la base de datos local (ej: <code>1001 Piso de Venta</code>, <code>1002 Avería</code>, <code>1003 Merma</code>).</li>
        <li>Haga clic en <strong><code>[ ☁ 2. Consultar Neo ERP ]</code></strong>: El agente descargará los almacenes y ubicaciones WMS creados en la nube para esta sucursal.</li>
        <li><strong>Configuración en la grilla:</strong>
            <ul>
                <li><strong><code>¿Sincronizar?</code>:</strong> Marque <span class="badge badge-emerald">✔ Sí</span> solo en los depósitos de venta reales (ej: <code>1001</code>). Desmarque <span class="badge badge-slate">⏸ Omitido</span> los depósitos que no deben mover inventario (ej: averías, mermas).</li>
                <li><strong>Almacén y Ubicación Neo ERP:</strong> Seleccione el almacén destino (ej: <em>Almacén Principal Tucacas</em> ➔ <em>Stock Principal</em>).</li>
                <li><strong><code>¿Afecta Kardex?</code>:</strong> Actívelo para que cada venta genere su salida física en Kardex.</li>
            </ul>
        </li>
        <li>Haga clic en <strong><code>[ 💾 3. Guardar en Neo ERP ]</code></strong> para registrar los mapeos formalmente.</li>
    </ul>
</div>

<!-- PASO 3 -->
<div class="step-card no-break">
    <div class="step-card-header">
        <div class="step-num">3</div>
        <div class="step-title">Pestaña 1: Puesta a Punto Inicial (Maestros & Baseline)</div>
    </div>
    <p><em>(Opcional si la tienda ya fue migrada en el sistema central)</em>. Ejecute la siembra ordenada de datos:</p>
    <ol>
        <li><strong><code>[ 1. Sincronizar Proveedores ]</code>:</strong> Catálogo de proveedores de compras.</li>
        <li><strong><code>[ 2. Sincronizar Productos & Variantes ]</code>:</strong> Catálogo de artículos, referencias y categorías.</li>
        <li><strong><code>[ 3. Sincronizar Códigos de Barra ]</code>:</strong> Códigos de barra unitarios y de empaque/bulto.</li>
        <li><strong><code>[ 4. Sincronizar Costos & Cruces ]</code>:</strong> Costos de compra por proveedor.</li>
        <li><strong><code>5. Inventario Inicial (Baseline)</code>:</strong> Elija <em>"Al momento actual (Hoy)"</em> o indique una fecha de corte histórica y presione <strong><code>[ Sincronizar Inventario Inicial ]</code></strong>.</li>
    </ol>
</div>

<!-- ==================== PÁGINA 5: SERVICIO EN FONDO Y MONITOREO ==================== -->
<div class="page-break"></div>
<div class="page-header">
    <span class="page-header-logo">Neo ERP • Neo Sync Agent</span>
    <span>4. Automatización y Supervisión Web</span>
</div>

<h1>4. Automatización 24/7 y Control Remoto Web</h1>

<!-- PASO 4 y 5 -->
<div class="step-card no-break">
    <div class="step-card-header">
        <div class="step-num">4</div>
        <div class="step-title">Pestaña 4: Servicio en Fondo (NeoAgentSync)</div>
    </div>
    <p>Activa el motor de sincronización silencioso de Windows:</p>
    <ul>
        <li>Verifique el indicador en la esquina superior: si muestra <span class="badge badge-amber">🔴 DETENIDO</span>, presione <strong><code>[ Iniciar Servicio ]</code></strong>.</li>
        <li>El estado cambiará inmediatamente a <span class="badge badge-emerald">🟢 EN EJECUCIÓN</span>.</li>
        <li>Presione <strong><code>[ Crear Acceso Directo en el Escritorio ]</code></strong> para facilitar el acceso rápido del supervisor.</li>
    </ul>
    <div class="callout callout-info" style="margin-top: 6px;">
        <strong>Operación Autónoma:</strong> El servicio Windows <strong>NeoAgentSync</strong> arrancará solo cada vez que se encienda o reinicie la computadora. No requiere que ningún cajero inicie sesión en Windows ni mantenga ventanas abiertas.
    </div>
</div>

<h2>Supervisión en Vivo desde la Web (Neo Core)</h2>
<p>
Desde cualquier ubicación, el equipo de operaciones o gerencia puede auditar la tienda en tiempo real ingresando a:<br>
👉 <strong style="color: #4f46e5;">https://qa.morpheussoft.net/dashboard/store-sync</strong>
</p>

<!-- Telemetría -->
<table>
    <thead>
        <tr>
            <th style="width: 25%;">Indicador</th>
            <th style="width: 25%;">Valor Típico</th>
            <th style="width: 50%;">Significado Operativo</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td><strong>Estado de Conexión</strong></td>
            <td><span class="badge badge-emerald">ONLINE</span></td>
            <td>El agente en tienda está conectado y reportando latidos de vida (Heartbeat).</td>
        </tr>
        <tr>
            <td><strong>Versión del Agente</strong></td>
            <td><code>v2.2.0-neo</code></td>
            <td>Versión binaria ejecutándose en la computadora de la tienda.</td>
        </tr>
        <tr>
            <td><strong>Lag de Sincronización</strong></td>
            <td><code>0 min</code> a <code>5 min</code></td>
            <td>Tiempo transcurrido desde la última venta cobrada en caja y su registro en Neo ERP.</td>
        </tr>
        <tr>
            <td><strong>Facturas de Hoy</strong></td>
            <td>Ej: <code>362 facturas</code></td>
            <td>Volumen de transacciones del día procesadas correctamente.</td>
        </tr>
        <tr>
            <td><strong>Estado SQL Server</strong></td>
            <td><span class="badge badge-emerald">CONECTADO</span></td>
            <td>El agente tiene comunicación fluida con la base de datos de Stellar POS.</td>
        </tr>
    </tbody>
</table>

<h2>Botonera de Control Remoto (Sin AnyDesk ni puertos abiertos)</h2>
<div class="remote-pad no-break">
    <div class="remote-btn">
        <div class="remote-btn-title">⚡ Forzar Sincronización de Ventas</div>
        <div class="remote-btn-desc">Despierta al agente de la tienda para que procese y envíe de inmediato cualquier ticket pendiente.</div>
    </div>
    <div class="remote-btn">
        <div class="remote-btn-title">📦 Sincronizar Catálogo Maestro</div>
        <div class="remote-btn-desc">Ordena al agente refrescar el catálogo de artículos, descripciones y códigos de barra.</div>
    </div>
    <div class="remote-btn">
        <div class="remote-btn-title">📅 Carga Histórica Parametrizada</div>
        <div class="remote-btn-desc">Permite solicitar un rango de fechas histórico (ej. últimos 3 meses) para reprocesar ventas pasadas.</div>
    </div>
    <div class="remote-btn">
        <div class="remote-btn-title">🚀 Actualización de Versión (OTA)</div>
        <div class="remote-btn-desc">Descarga e instala la última versión oficial del software en la tienda de forma 100% remota.</div>
    </div>
</div>

<!-- ==================== PÁGINA 6: TROUBLESHOOTING ==================== -->
<div class="page-break"></div>
<div class="page-header">
    <span class="page-header-logo">Neo ERP • Neo Sync Agent</span>
    <span>5. Estructura de Archivos y Preguntas Frecuentes</span>
</div>

<h1>5. Estructura de Archivos y Resolución de Problemas</h1>

<h2>Directorio de Instalación: <code>C:\MorpheusSyncAgent</code></h2>
<table>
    <thead>
        <tr>
            <th style="width: 30%;">Archivo / Carpeta</th>
            <th style="width: 70%;">Función en el Sistema</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td><code>MorpheusConfigurador.exe</code></td>
            <td>Aplicación gráfica C# WinForms para configuración de tienda, diagnósticos y siembras.</td>
        </tr>
        <tr>
            <td><code>MorpheusSyncAgent.exe</code></td>
            <td>Motor ejecutable del servicio de sincronización en segundo plano (Worker Service .NET 9).</td>
        </tr>
        <tr>
            <td><code>Microsoft.Data.SqlClient.SNI.dll</code></td>
            <td>Biblioteca nativa para comunicación segura y cifrada con Microsoft SQL Server.</td>
        </tr>
        <tr>
            <td><code>e_sqlite3.dll</code></td>
            <td>Motor de base de datos local SQLite para almacenamiento de estado y colas de reintento.</td>
        </tr>
        <tr>
            <td><code>appsettings.json</code></td>
            <td>Archivo de configuración que contiene las cadenas de conexión local, ID de tienda y endpoints.</td>
        </tr>
        <tr>
            <td><code>Configurar_Agente.bat</code></td>
            <td>Lanzador de respaldo por si el usuario no encuentra el ejecutable directo.</td>
        </tr>
        <tr>
            <td><code>scripts/Iniciar_Servicio.bat</code></td>
            <td>Script para iniciar el servicio Windows de forma manual si fuese necesario.</td>
        </tr>
        <tr>
            <td><code>scripts/Detener_Servicio.bat</code></td>
            <td>Script para pausar el servicio de sincronización temporalmente.</td>
        </tr>
    </tbody>
</table>

<h2>Preguntas Frecuentes y Solución de Incidentes</h2>

<div class="callout callout-warning no-break">
<strong>1. El script de PowerShell muestra error de "conexión subyacente cerrada" o "SSL/TLS":</strong><br>
Ocurre cuando la versión de PowerShell no tiene habilitado TLS 1.2 por omisión. Ejecute exactamente el comando con el prefijo oficial:<br>
<code>[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://api.qa.morpheussoft.net/static/instalar.ps1 | iex</code>
</div>

<div class="callout callout-tip no-break">
<strong>2. ¿Qué sucede si la tienda se queda temporalmente sin servicio de Internet?</strong><br>
El agente cuenta con tolerancia a fallas. Los tickets siguen registrándose con normalidad en Stellar POS local. En el momento en que se restablece la conexión a Internet, el agente detecta la brecha y sube automáticamente todas las ventas acumuladas en orden cronológico sin duplicar información.
</div>

<div class="callout callout-info no-break">
<strong>3. ¿Se pierden los datos configurados si se vuelve a ejecutar la instalación?</strong><br>
<strong>No.</strong> El instalador oficial detecta si ya existe un archivo <code>appsettings.json</code>, realiza una copia de seguridad en memoria y vuelve a colocar su configuración personalizada una vez completada la extracción.
</div>

<div class="callout callout-tip no-break">
<strong>4. ¿Cómo verificar que un depósito de avería o merma no esté descargando stock?</strong><br>
Abra la consola Web en <code>/dashboard/store-sync</code>, pestaña <strong>Mapeo de Depósitos</strong>. Verifique que el depósito tenga el badge gris <span class="badge badge-slate">⏸ Omitido</span> y la columna Impacto en Kardex indique <em>"Sin Impacto (Omitido)"</em>.
</div>

<div style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 7.5pt; color: #64748b;">
    <div><strong>Neo ERP</strong> • Ecosistema Tecnológico de Gestión Empresarial</div>
    <div>Soporte Técnico: soporte@morpheussoft.net</div>
</div>

</body>
</html>
"""

def main():
    print("=" * 65)
    print("Generador de Manual PDF Ejecutivo: Neo Sync Agent (Tiendas)")
    print("=" * 65)

    with tempfile.NamedTemporaryFile(suffix=".html", delete=False, mode="w", encoding="utf-8") as tf:
        tf.write(HTML_TEMPLATE)
        temp_html_path = tf.name

    print(f"Compilando PDF con Google Chrome Headless...")
    chrome_cmd = [
        "google-chrome",
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--no-pdf-header-footer",
        f"--print-to-pdf={OUTPUT_DOCS_PDF}",
        temp_html_path
    ]

    res = subprocess.run(chrome_cmd, capture_output=True, text=True)
    try:
        os.remove(temp_html_path)
    except:
        pass

    if os.path.exists(OUTPUT_DOCS_PDF) and os.path.getsize(OUTPUT_DOCS_PDF) > 0:
        shutil.copyfile(OUTPUT_DOCS_PDF, OUTPUT_STATIC_PDF)
        size_kb = os.path.getsize(OUTPUT_DOCS_PDF) / 1024
        print(f"\n✓ PDF compilado exitosamente:")
        print(f"  - Documento local:  {OUTPUT_DOCS_PDF} ({size_kb:.1f} KB)")
        print(f"  - Descargable Web:  {OUTPUT_STATIC_PDF}")
    else:
        print(f"Error generando PDF: {res.stderr}")
        sys.exit(1)

if __name__ == "__main__":
    main()
