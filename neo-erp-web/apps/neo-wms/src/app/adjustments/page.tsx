"use client";

import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Dropdown } from 'primereact/dropdown';
import { TreeSelect } from 'primereact/treeselect';
import api from '@/lib/api';
import { isWeightUom, sanitizeQuantity, getUomDecimals, formatQuantity, preventDecimalKey } from '@/lib/uom';

export default function WmsAdjustmentsPage() {
  const toast = useRef<Toast>(null);

  // Active Tab: 0 = Ajustes Directos, 1 = Tomas Físicas Masivas
  const [activeTab, setActiveTab] = useState(0);

  // DATA STATES
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [locationsTree, setLocationsTree] = useState<any[]>([]);
  const [reasons, setReasons] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // NEW DIRECT ADJUSTMENT DIALOG STATE
  const [newAdjDialogVisible, setNewAdjDialogVisible] = useState(false);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [selectedReasonId, setSelectedReasonId] = useState<number | null>(null);
  const [movementType, setMovementType] = useState<string>('OUT'); // 'OUT' Descargo, 'IN' Cargo
  const [notes, setNotes] = useState('');
  const [adjLines, setAdjLines] = useState<any[]>([]);
  const [savingAdj, setSavingAdj] = useState(false);

  // FAST TRANSCRIPTION & BULK PASTE STATE (DIRECT ADJUSTMENTS)
  const [adjFastCodeInput, setAdjFastCodeInput] = useState('');
  const [adjFastSelectedProd, setAdjFastSelectedProd] = useState<any | null>(null);
  const [adjFastQty, setAdjFastQty] = useState<number>(1);
  const adjFastQtyRef = useRef<number>(1);
  const [adjFastSearching, setAdjFastSearching] = useState(false);
  const adjFastCodeInputRef = useRef<HTMLInputElement>(null);
  const adjFastQtyInputRef = useRef<any>(null);
  const [f2SearchDialogVisible, setF2SearchDialogVisible] = useState(false);
  const [f2SearchQuery, setF2SearchQuery] = useState('');
  const [f2SearchResults, setF2SearchResults] = useState<any[]>([]);
  const [f2SelectedIndex, setF2SelectedIndex] = useState<number>(0);
  const [f2Loading, setF2Loading] = useState(false);
  const f2InputRef = useRef<HTMLInputElement>(null);
  const f2SearchTimeoutRef = useRef<any>(null);
  const [bulkPasteDialogVisible, setBulkPasteDialogVisible] = useState(false);
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [processingBulkPaste, setProcessingBulkPaste] = useState(false);

  // VIEW/APPROVE ADJUSTMENT DIALOG STATE
  const [viewAdjDialogVisible, setViewAdjDialogVisible] = useState(false);
  const [selectedAdj, setSelectedAdj] = useState<any | null>(null);
  const [processingApprove, setProcessingApprove] = useState(false);

  // REASONS MANAGEMENT DIALOG STATE
  const [reasonsDialogVisible, setReasonsDialogVisible] = useState(false);
  const [newReasonCode, setNewReasonCode] = useState('');
  const [newReasonName, setNewReasonName] = useState('');
  const [newReasonType, setNewReasonType] = useState('OUT');
  const [newReasonAccount, setNewReasonAccount] = useState('');

  // PHYSICAL INVENTORY SESSION STATE
  const [newSessionDialogVisible, setNewSessionDialogVisible] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [sessionFacilityId, setSessionFacilityId] = useState<number | null>(null);
  const [sessionWarehouseId, setSessionWarehouseId] = useState<number | null>(null);
  const [sessionScopeType, setSessionScopeType] = useState('GENERAL');
  const [sessionScopeValue, setSessionScopeValue] = useState<string>('');
  const [sessionCategoryId, setSessionCategoryId] = useState<number | null>(null);
  const [sessionLocationId, setSessionLocationId] = useState<number | null>(null);
  const [sessionIsBlindCount, setSessionIsBlindCount] = useState<boolean>(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [categoriesTree, setCategoriesTree] = useState<any[]>([]);
  const [creatingSession, setCreatingSession] = useState(false);

  // MANAGE SESSION MODAL STATE
  const [manageSessionDialogVisible, setManageSessionDialogVisible] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessionScopedProducts, setSessionScopedProducts] = useState<any[]>([]);
  const [loadingSessionProducts, setLoadingSessionProducts] = useState(false);
  const [countingProdId, setCountingProdId] = useState<number | null>(null);
  const [countingBarcodeInput, setCountingBarcodeInput] = useState('');
  const countingBarcodeInputRef = useRef<HTMLInputElement>(null);
  const countingQtyInputRef = useRef<any>(null);
  const [countingQty, setCountingQty] = useState<number>(0);
  const [countingSheetNo, setCountingSheetNo] = useState('');
  const [countingOperator, setCountingOperator] = useState('');
  const [countingNotes, setCountingNotes] = useState('');
  const [savingCount, setSavingCount] = useState(false);
  const [validatingSession, setValidatingSession] = useState(false);
  const [aiAuditResult, setAiAuditResult] = useState<any>(null);
  const [loadingAiAudit, setLoadingAiAudit] = useState(false);

  // PHASE 2 BATCH & INDIVIDUAL REASON ASSIGNMENT
  const [batchReasonOut, setBatchReasonOut] = useState<number | null>(null);
  const [batchReasonIn, setBatchReasonIn] = useState<number | null>(null);
  const [savingBatchReasons, setSavingBatchReasons] = useState(false);
  const [updatingLineReasonId, setUpdatingLineReasonId] = useState<number | null>(null);

  // VIEW SESSION CONFIG CARD (READ-ONLY)
  const [viewConfigDialogVisible, setViewConfigDialogVisible] = useState(false);
  const [viewConfigSession, setViewConfigSession] = useState<any>(null);

  // COUNT SHEET REPORT (IMPRIMIR / EXCEL) DIALOG STATE
  const [countSheetDialogVisible, setCountSheetDialogVisible] = useState(false);
  const [sheetSessionId, setSheetSessionId] = useState<number | null>(null);
  const [sheetFacilityId, setSheetFacilityId] = useState<number | null>(null);
  const [sheetWarehouseId, setSheetWarehouseId] = useState<number | null>(null);
  const [sheetCategoryId, setSheetCategoryId] = useState<number | null>(null);
  const [sheetResponsible, setSheetResponsible] = useState('');
  const [sheetShowTheoretical, setSheetShowTheoretical] = useState<boolean>(true);
  const [sheetIncludeZero, setSheetIncludeZero] = useState<boolean>(true);
  const [sheetLoading, setSheetLoading] = useState<boolean>(false);
  const [sheetData, setSheetData] = useState<any>(null);

  const loadCountSheetReport = async (overrides?: {
    session_id?: number | null;
    facility_id?: number | null;
    warehouse_id?: number | null;
    category_id?: number | null;
    include_zero?: boolean;
  }) => {
    setSheetLoading(true);
    try {
      const sessId = overrides?.session_id !== undefined ? overrides.session_id : sheetSessionId;
      const facId = overrides?.facility_id !== undefined ? overrides.facility_id : sheetFacilityId;
      const whId = overrides?.warehouse_id !== undefined ? overrides.warehouse_id : sheetWarehouseId;
      const catId = overrides?.category_id !== undefined ? overrides.category_id : sheetCategoryId;
      const incZero = overrides?.include_zero !== undefined ? overrides.include_zero : sheetIncludeZero;

      const params = new URLSearchParams();
      if (sessId) {
        params.append('session_id', String(sessId));
      } else {
        if (facId) params.append('facility_id', String(facId));
        if (whId) params.append('warehouse_id', String(whId));
        if (catId) params.append('category_id', String(catId));
      }
      params.append('include_zero_stock', String(incZero));

      const res = await api.get(`/inventory-valuation/physical-count-sheet?${params.toString()}`);
      setSheetData(res.data);
      return res.data;
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo generar el reporte de conteo físico.' });
      return null;
    } finally {
      setSheetLoading(false);
    }
  };

  const openSessionCountSheet = (s: any) => {
    if (!s) return;
    setSheetSessionId(s.id);
    setSheetFacilityId(s.facility_id || null);
    setSheetWarehouseId(s.warehouse_id || null);
    setSheetCategoryId(s.category_id || null);
    setSheetIncludeZero(true);
    setCountSheetDialogVisible(true);
    loadCountSheetReport({ session_id: s.id, include_zero: true });
  };

  const printCountSheetData = (dataToPrint: any, showTheo: boolean, responsible: string) => {
    if (!dataToPrint) return;
    const printWindow = window.open('', '_blank', 'width=1050,height=800');
    if (!printWindow) {
      toast.current?.show({ severity: 'warn', summary: 'Ventana bloqueada', detail: 'Permita las ventanas emergentes para imprimir.' });
      return;
    }
    const items: any[] = dataToPrint.items || [];
    const formatNum = (val: any) => Number(val ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const rowsHtml = items.map(item => `
      <tr>
        <td class="col-code">${item.product_code || item.sku || ''}</td>
        <td class="col-desc">${item.description || ''}</td>
        ${showTheo ? `<td class="col-theo">${formatNum(item.theoretical_qty)}</td>` : ''}
        <td class="col-real"><div class="real-line"></div></td>
      </tr>
    `).join('');

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Neo ERP - Reporte de Productos - Toma de Inventario</title>
        <style>
          @page { size: letter portrait; margin: 12mm 12mm 15mm 12mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0; padding: 0; font-size: 11px; background: #fff; }
          .neo-brand-bar { display: flex; justify-content: space-between; font-size: 9px; font-weight: bold; color: #334155; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 10px; }
          .report-header { display: grid; grid-template-columns: 45% 55%; align-items: start; margin-bottom: 14px; }
          .header-left { text-align: center; padding-right: 10px; }
          .company-title { font-size: 16px; margin: 0 0 6px 0; }
          .locality-subtitle { font-size: 13px; margin: 0; }
          .header-right { text-align: center; }
          .report-title { font-size: 13px; margin: 0 0 4px 0; padding-bottom: 3px; border-bottom: 1px solid #000; }
          .report-scope { font-size: 12px; font-weight: bold; margin: 3px 0; padding-bottom: 4px; border-bottom: 1px solid #000; line-height: 1.35; }
          .report-meta { display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px; padding: 0 4px; }
          .deposit-bar { display: grid; grid-template-columns: 90px 80px 1fr 240px; align-items: center; font-size: 10.5px; font-weight: bold; margin-top: 10px; margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; }
          thead th { font-size: 10.5px; font-weight: bold; text-align: left; padding: 4px 6px 6px 6px; border-bottom: 3px double #000; }
          tbody td { padding: 3.5px 6px; font-size: 10px; vertical-align: bottom; }
          .col-code { width: 125px; white-space: nowrap; }
          .col-theo { width: 100px; text-align: right !important; padding-right: 16px !important; font-variant-numeric: tabular-nums; }
          .col-real { width: 125px; text-align: center !important; }
          .real-line { border-bottom: 1px solid #000; width: 105px; height: 12px; margin: 0 auto; }
          .report-footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; align-items: flex-end; font-size: 9.5px; color: #334155; page-break-inside: avoid; }
          .sig-block { width: 200px; text-align: center; }
          .sig-line { border-bottom: 1px solid #000; height: 24px; margin-bottom: 4px; }
        </style>
      </head>
      <body>
        <div class="neo-brand-bar">
          <span>NEO ERP — MÓDULO DE INVENTARIO Y AUDITORÍA FÍSICA</span>
          <span>MODO: ${showTheo ? 'CON EXISTENCIA TEÓRICA' : 'CONTEO CIEGO (SIN EXISTENCIA)'}</span>
        </div>
        <div class="report-header">
          <div class="header-left">
            <div class="company-title">${dataToPrint.company_name || 'CATANIA HIPERMERCADO, C.A.'}</div>
            <div class="locality-subtitle">Localidades: ${dataToPrint.facility_name || 'TODAS'}</div>
            ${dataToPrint.session_code ? `<div style="font-size: 11px; font-weight: bold; margin-top: 4px;">Toma Física: [${dataToPrint.session_code}] ${dataToPrint.session_name || ''}</div>` : ''}
          </div>
          <div class="header-right">
            <div class="report-title">REPORTE DE PRODUCTOS - TOMA DE INVENTARIO</div>
            <div class="report-scope">
              Depósito: ${dataToPrint.deposit_name || 'TODOS'}, Departamento:<br/>
              ${dataToPrint.department_name || 'TODOS'}, Moneda: ${dataToPrint.currency_name || 'BOLIVAR DIGITAL'}
            </div>
            <div class="report-meta">
              <span>Fecha de Emisión <strong>${dataToPrint.emission_date || ''}</strong></span>
              <span>Total Items: <strong>${items.length}</strong></span>
            </div>
          </div>
        </div>
        <div class="deposit-bar">
          <span>Depósito</span>
          <span>${dataToPrint.deposit_code || ''}</span>
          <span>${dataToPrint.deposit_name || ''}</span>
          <span>Responsable: ${responsible ? `<u>${responsible}</u>` : '________________________'}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th class="col-code">Producto</th>
              <th class="col-desc">Descripción del Producto</th>
              ${showTheo ? '<th class="col-theo">Existencia</th>' : ''}
              <th class="col-real">Existencia Real</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="report-footer">
          <div class="sig-block"><div class="sig-line"></div><strong>Contado por (Firma y Fecha)</strong></div>
          <div style="text-align: center; font-size: 9px;">Documento generado por <strong>Neo ERP</strong> — ${new Date().toLocaleString('es-VE')}</div>
          <div class="sig-block"><div class="sig-line"></div><strong>Verificado / Supervisor</strong></div>
        </div>
        <script>window.onload = function() { setTimeout(function() { window.print(); }, 250); };</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const printCountSheetThermal80mm = (dataToPrint: any, showTheo: boolean, responsible: string) => {
    if (!dataToPrint) return;
    const printWindow = window.open('', '_blank', 'width=420,height=740');
    if (!printWindow) {
      toast.current?.show({ severity: 'warn', summary: 'Ventana bloqueada', detail: 'Permita las ventanas emergentes para imprimir en la tickera.' });
      return;
    }
    const items: any[] = dataToPrint.items || [];
    const formatNum = (val: any) => Number(val ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const estHeightMm = Math.max(95, 78 + items.length * 10);

    const rowsHtml = items.map(item => `
      <tr>
        <td style="padding: 3px 0; border-bottom: 1px dotted #000; max-width: 44mm; word-wrap: break-word;">
          <div style="font-weight: 900; font-size: 10.5px;">${item.product_code || item.sku || ''}</div>
          <div style="font-weight: 700; font-size: 10px;">${item.description || ''}</div>
        </td>
        ${showTheo ? `<td style="padding: 3px 2px; border-bottom: 1px dotted #000; text-align: right; font-weight: 800; font-size: 10.5px;">${formatNum(item.theoretical_qty)}</td>` : ''}
        <td style="padding: 3px 0; border-bottom: 1px dotted #000; text-align: right; font-weight: 800; font-size: 10.5px;">[ &nbsp; &nbsp; &nbsp; ]</td>
      </tr>
    `).join('');

    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Neo ERP - Toma de Inventario 80mm</title>
  <style id="thermal-page-style">
    @page { size: 80mm ${estHeightMm}mm; margin: 0mm; }
  </style>
  <style>
    * { box-sizing: border-box; color: #000000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body {
      width: 72mm;
      max-width: 72mm;
      margin: 0;
      padding: 2mm 2mm 4mm 2mm;
      font-family: Arial, Helvetica, 'Courier New', monospace;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.25;
      background: #ffffff !important;
      color: #000000 !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: hidden !important;
    }
    .no-print-bar {
      background: #0f172a;
      color: #fff !important;
      padding: 8px;
      margin-bottom: 8px;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: sans-serif;
      font-size: 11px;
    }
    .no-print-bar button {
      background: #10b981;
      color: #fff !important;
      border: none;
      padding: 5px 10px;
      border-radius: 4px;
      font-weight: bold;
      cursor: pointer;
    }
    @media print {
      .no-print-bar { display: none !important; }
    }
    .header-title { text-align: center; font-weight: 900; font-size: 13px; margin-bottom: 2px; }
    .header-sub { text-align: center; font-weight: 800; font-size: 10.5px; border-bottom: 1.5px dashed #000; padding-bottom: 4px; margin-bottom: 5px; }
    .meta-row { margin: 2px 0; font-size: 10.5px; font-weight: 700; word-wrap: break-word; }
    .divider { border-bottom: 1.5px dashed #000; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { border-bottom: 1.5px solid #000; padding: 3px 0; font-size: 10px; font-weight: 900; }
    .sig-block { margin-top: 16px; text-align: center; font-size: 10px; font-weight: 800; page-break-inside: avoid; }
    .sig-line { border-bottom: 1.5px solid #000; width: 100%; height: 18px; margin-bottom: 3px; }
    .footer-note { margin-top: 8px; text-align: center; font-size: 9px; font-weight: 700; border-top: 1.5px dashed #000; padding-top: 4px; }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <span style="color:#fff !important;">Formato Tickera 80mm</span>
    <button onclick="window.print()">🖨️ Imprimir</button>
  </div>
  <div id="ticket-root">
    <div class="header-title">${dataToPrint.company_name || 'CATANIA HIPERMERCADO, C.A.'}</div>
    <div class="header-sub">TOMA DE INVENTARIO (${showTheo ? 'CON EXIST.' : 'CIEGO'})</div>
    ${dataToPrint.session_code ? `<div class="meta-row"><strong>SESIÓN:</strong> [${dataToPrint.session_code}] ${dataToPrint.session_name || ''}</div>` : ''}
    <div class="meta-row"><strong>LOCALIDAD:</strong> ${dataToPrint.facility_name || 'TODAS'}</div>
    <div class="meta-row"><strong>DEPÓSITO:</strong> ${dataToPrint.deposit_code || ''} ${dataToPrint.deposit_name || 'TODOS'}</div>
    <div class="meta-row"><strong>DEPTO:</strong> ${dataToPrint.department_name || 'TODOS'}</div>
    <div class="meta-row"><strong>EMISIÓN:</strong> ${dataToPrint.emission_date || ''} | <strong>ITEMS:</strong> ${items.length}</div>
    <div class="meta-row"><strong>RESP:</strong> ${responsible || '________________________'}</div>
    <div class="divider"></div>
    <table>
      <thead>
        <tr>
          <th style="text-align: left;">PRODUCTO</th>
          ${showTheo ? '<th style="text-align: right;">EXIST.</th>' : ''}
          <th style="text-align: right;">REAL</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="divider"></div>
    <div class="sig-block"><div class="sig-line"></div><div>Contado por (Firma y Fecha)</div></div>
    <div class="sig-block"><div class="sig-line"></div><div>Verificado / Supervisor</div></div>
    <div class="footer-note">Neo ERP — ${new Date().toLocaleString('es-VE')}</div>
  </div>
  <script>
    window.onload = function() {
      var root = document.getElementById('ticket-root');
      var hPx = root ? root.offsetHeight : document.body.scrollHeight;
      var exactMm = Math.max(75, Math.ceil((hPx * 25.4) / 96) + 8);
      var pageStyle = document.getElementById('thermal-page-style');
      if (pageStyle) {
        pageStyle.innerHTML = '@page { size: 80mm ' + exactMm + 'mm; margin: 0mm; }';
      }
      setTimeout(function() {
        window.focus();
        window.print();
      }, 200);
    };
  </script>
</body>
</html>`);
    printWindow.document.close();
  };

  const exportCountSheetExcelData = (dataToExport: any, showTheo: boolean, responsible: string) => {
    if (!dataToExport || !dataToExport.items || dataToExport.items.length === 0) return;
    const rows: any[][] = [
      ["NEO ERP - REPORTE DE PRODUCTOS - TOMA DE INVENTARIO"],
      [
        dataToExport.company_name || "CATANIA HIPERMERCADO, C.A.",
        dataToExport.session_code ? `Toma Física: [${dataToExport.session_code}] ${dataToExport.session_name || ''}` : ""
      ],
      [
        `Localidades: ${dataToExport.facility_name || 'TODAS'}`,
        `Depósito: ${dataToExport.deposit_code || ''} ${dataToExport.deposit_name || 'TODOS'}`,
        `Departamento: ${dataToExport.department_name || 'TODOS'}`
      ],
      [
        `Moneda: ${dataToExport.currency_name || 'BOLIVAR DIGITAL'}`,
        `Fecha de Emisión: ${dataToExport.emission_date || new Date().toLocaleDateString('es-VE')}`,
        `Responsable: ${responsible || '______________________'}`
      ],
      [],
      showTheo
        ? ["Producto", "SKU Interno", "Descripción del Producto", "Departamento / Categoría", "Unidad", "Existencia", "Existencia Real"]
        : ["Producto", "SKU Interno", "Descripción del Producto", "Departamento / Categoría", "Unidad", "Existencia Real"]
    ];

    dataToExport.items.forEach((item: any) => {
      if (showTheo) {
        rows.push([
          item.product_code || item.sku || "",
          item.sku || "",
          item.description || "",
          item.category || "",
          item.uom || "UND",
          Number(Number(item.theoretical_qty ?? 0).toFixed(2)),
          ""
        ]);
      } else {
        rows.push([
          item.product_code || item.sku || "",
          item.sku || "",
          item.description || "",
          item.category || "",
          item.uom || "UND",
          ""
        ]);
      }
    });

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = showTheo
      ? [{ wch: 18 }, { wch: 16 }, { wch: 46 }, { wch: 26 }, { wch: 10 }, { wch: 16 }, { wch: 18 }]
      : [{ wch: 18 }, { wch: 16 }, { wch: 46 }, { wch: 26 }, { wch: 10 }, { wch: 18 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Toma de Inventario');
    const safeDept = (dataToExport.department_name || 'General').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 25);
    const modeSuffix = showTheo ? 'ConExistencia' : 'ConteoCiego';
    XLSX.writeFile(workbook, `NeoERP_Toma_Inventario_${safeDept}_${modeSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Helper para saber si la sesión activa está acotada a una categoría específica
  const isSessionCategoryScoped = Boolean(
    selectedSession &&
    (selectedSession.scope_type === 'CYCLIC' || selectedSession.scope_type === 'CATEGORY') &&
    selectedSession.scope_value &&
    !isNaN(Number(selectedSession.scope_value))
  );
  const availableCountingProducts = isSessionCategoryScoped ? sessionScopedProducts : products;


  // Formateador jerárquico recursivo para TreeSelect de PrimeReact
  const formatCategoryTreeNodes = (nodes: any[], parentBreadcrumb = '', depth = 0): any[] => {
    if (!nodes || !Array.isArray(nodes)) return [];
    return nodes.map(node => {
      const levelTag = node.level_name || (depth === 0 ? 'Depto' : depth === 1 ? 'Grupo' : 'Subgrupo');
      const breadcrumb = node.full_path || (parentBreadcrumb ? `${parentBreadcrumb} > ${node.name}` : node.name);
      const label = depth === 0 
        ? `[${levelTag}] ${node.name}`
        : `[${levelTag}] ${node.name} (${parentBreadcrumb || breadcrumb})`;

      return {
        key: String(node.id),
        label: label,
        data: node.id,
        rawName: node.name,
        levelTag: levelTag,
        depth: depth,
        fullPath: breadcrumb,
        parentBreadcrumb: parentBreadcrumb,
        icon: (node.children && node.children.length > 0) 
          ? (depth === 0 ? 'pi pi-folder text-indigo-600 font-bold' : 'pi pi-folder-open text-amber-600') 
          : 'pi pi-tag text-slate-500',
        children: (node.children && node.children.length > 0) 
          ? formatCategoryTreeNodes(node.children, breadcrumb, depth + 1) 
          : undefined
      };
    });
  };

  const categoryTreeNodeTemplate = (node: any) => {
    const isRoot = node.depth === 0;
    const isGroup = node.depth === 1;
    return (
      <div className="flex items-center gap-2 py-0.5 text-xs">
        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold tracking-wider uppercase shrink-0 ${
          isRoot ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
          isGroup ? 'bg-amber-100 text-amber-800 border border-amber-200' :
          'bg-slate-100 text-slate-700 border border-slate-200'
        }`}>
          {node.levelTag || (isRoot ? 'Depto' : isGroup ? 'Grupo' : 'Subgrupo')}
        </span>
        <span className={`font-semibold ${isRoot ? 'text-indigo-950 font-bold' : isGroup ? 'text-slate-800' : 'text-slate-700'}`}>
          {node.rawName || node.label}
        </span>
        {node.parentBreadcrumb && (
          <span className="text-[10px] text-slate-400 font-mono truncate max-w-[220px]" title={node.parentBreadcrumb}>
            ({node.parentBreadcrumb})
          </span>
        )}
      </div>
    );
  };

  const categoryTreeValueTemplate = (selectedNode: any, props: any) => {
    if (!selectedNode) {
      return <span className="text-slate-400">{props?.placeholder || "Todas las categorías..."}</span>;
    }
    const node = Array.isArray(selectedNode) ? selectedNode[0] : selectedNode;
    if (!node) return <span className="text-slate-400">{props?.placeholder || "Todas las categorías..."}</span>;
    const isRoot = node.depth === 0;
    const isGroup = node.depth === 1;
    return (
      <div className="flex items-center gap-1.5 text-xs truncate">
        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
          isRoot ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
          isGroup ? 'bg-amber-100 text-amber-800 border border-amber-200' :
          'bg-slate-100 text-slate-700 border border-slate-200'
        }`}>
          {node.levelTag || (isRoot ? 'Depto' : isGroup ? 'Grupo' : 'Subgrupo')}
        </span>
        <span className="font-semibold text-slate-800 truncate">
          {node.fullPath || node.label}
        </span>
      </div>
    );
  };

  const productValueTemplate = (option: any, props: any) => {
    if (!option) {
      return <span className="text-slate-400 text-xs truncate block">{props?.placeholder || "Buscar por Código Neo, PLU, Barra o Nombre..."}</span>;
    }
    return (
      <div className="flex items-center gap-2 min-w-0 max-w-full overflow-hidden">
        <span className="font-mono font-extrabold text-[11px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 shrink-0">
          {option.sku}
        </span>
        <span className="font-bold text-slate-800 text-xs truncate min-w-0" title={option.name}>
          {option.name}
        </span>
      </div>
    );
  };

  const productOptionTemplate = (option: any) => {
    if (!option) return null;
    return (
      <div className="flex flex-col py-1 text-xs gap-0.5 max-w-full min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-mono font-extrabold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 shrink-0">
            {option.sku}
          </span>
          <span className="font-bold text-slate-800 truncate min-w-0 flex-1" title={option.name}>
            {option.name}
          </span>
          <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
            {option.uom_base}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 min-w-0">
          {option.primary_barcode ? (
            <span className="flex items-center text-slate-600 font-mono bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 shrink-0">
              <i className="pi pi-barcode mr-1 text-[10px]"></i>
              {option.primary_barcode}
            </span>
          ) : (
            <span className="text-[10px] text-slate-400 italic">Sin barra</span>
          )}
          {option.barcodes && option.barcodes.length > 1 && (
            <span className="text-[10px] text-slate-400 font-mono truncate min-w-0">
              Alt: {option.barcodes.slice(1, 3).join(', ')}
            </span>
          )}
        </div>
      </div>
    );
  };

  const buildCodeCandidates = (clean: string) => {
    const candidates = [clean];
    if (/^\d+$/.test(clean)) {
      if (clean.length === 12) {
        candidates.push('0' + clean);
      } else if (clean.length === 13 && clean.startsWith('0')) {
        candidates.push(clean.slice(1));
      }
      const unpadded = clean.replace(/^0+/, '');
      if (unpadded && !candidates.includes(unpadded)) {
        candidates.push(unpadded);
        candidates.push(`prd-${unpadded}`);
      }
      for (const len of [6, 13, 12, 14, 8]) {
        const padded = (unpadded || clean).padStart(len, '0');
        if (padded && !candidates.includes(padded)) {
          candidates.push(padded);
        }
      }
    }
    return candidates;
  };

  const handleBarcodeScanOrLookup = async (codeToSearch: string) => {
    const clean = codeToSearch.trim().toLowerCase();
    if (!clean) return;

    const candidates = buildCodeCandidates(clean);

    const matchesProduct = (p: any) => {
      const pSku = (p.sku || '').toLowerCase();
      const pPrimary = (p.primary_barcode || '').toLowerCase();
      const pBarcodes = (p.barcodes || []).map((b: string) => b.toLowerCase());
      const pName = (p.name || '').toLowerCase();
      return candidates.some(c => c === pSku || c === pPrimary || pBarcodes.includes(c)) ||
             (clean.length >= 3 && pName.includes(clean));
    };

    const selectFoundForCounting = (prod: any) => {
      setCountingProdId(prod.value);
      setCountingBarcodeInput('');
      toast.current?.show({ severity: 'success', summary: 'Producto Identificado', detail: `[${prod.sku}] ${prod.name}`, life: 2000 });
      setTimeout(() => {
        if (countingQtyInputRef.current) {
          const inputEl = countingQtyInputRef.current.getInput ? countingQtyInputRef.current.getInput() : countingQtyInputRef.current;
          if (inputEl && inputEl.focus) {
            inputEl.focus();
            if (inputEl.select) inputEl.select();
          }
        }
      }, 60);
    };

    // 1. Buscar primero en memoria
    const foundInScope = availableCountingProducts.find(matchesProduct);
    if (foundInScope) {
      selectFoundForCounting(foundInScope);
      return;
    }

    // 2. Si no está en los primeros 1,000 en memoria, consultar rápido al backend (/products/selector?q=...)
    try {
      const catParam = isSessionCategoryScoped && selectedSession?.scope_value ? `&category_id=${selectedSession.scope_value}` : '';
      const res = await api.get(`/products/selector?q=${encodeURIComponent(codeToSearch.trim())}&limit=25${catParam}`);
      const remoteList = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.items || []);
      if (remoteList.length > 0) {
        if (isSessionCategoryScoped) {
          setSessionScopedProducts(prev => {
            const existingIds = new Set(prev.map((x: any) => x.value));
            return [...prev, ...remoteList.filter((x: any) => !existingIds.has(x.value))];
          });
        } else {
          setProducts(prev => {
            const existingIds = new Set(prev.map((x: any) => x.value));
            return [...prev, ...remoteList.filter((x: any) => !existingIds.has(x.value))];
          });
        }
        const exactMatch = remoteList.find(matchesProduct) || remoteList[0];
        selectFoundForCounting(exactMatch);
        return;
      }
    } catch (err) {
      console.error('Error buscando producto en servidor:', err);
    }

    // 3. Si es conteo cíclico y no se halló en el alcance, verificar si existe en otra categoría del catálogo global
    if (isSessionCategoryScoped) {
      const foundInGlobal = products.find(matchesProduct);
      if (foundInGlobal) {
        toast.current?.show({
          severity: 'warn',
          summary: '⚠️ Producto Fuera de Alcance',
          detail: `El producto "${foundInGlobal.name}" (${foundInGlobal.sku}) pertenece a otra categoría y no forma parte del conteo de "${selectedSession?.category_name || 'categoría seleccionada'}".`,
          life: 5000
        });
        return;
      }
    }

    // 4. No encontrado en ningún catálogo
    toast.current?.show({ severity: 'warn', summary: 'Código no Encontrado', detail: `No se halló ningún producto con código o barra: "${codeToSearch}"`, life: 3500 });
  };


  // LOAD DATA
  const fetchAdjustments = async () => {
    try {
      const res = await api.get('/wms/adjustments');
      setAdjustments(res.data || []);
    } catch (e) {
      console.error(e);
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar los ajustes directos.' });
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await api.get('/inventory-session/');
      setSessions(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchFacilities = async () => {
    try {
      const res = await api.get('/facilities/');
      setFacilities(res.data || []);
      if (res.data && res.data.length > 0) {
        setSelectedFacilityId(res.data[0].id);
        setSessionFacilityId(res.data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const res = await api.get('/warehouses/');
      setWarehouses(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLocationsTree = async () => {
    try {
      const res = await api.get('/wms/locations/tree');
      setLocationsTree(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchReasons = async () => {
    try {
      const res = await api.get('/wms/adjustment-reasons');
      setReasons(res.data || []);
      if (res.data && res.data.length > 0) {
        setSelectedReasonId(res.data[0].id);
        setMovementType(res.data[0].default_type || 'OUT');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const productFilterTimeoutRef = useRef<any>(null);
  const handleProductFilter = (filterText: string) => {
    if (productFilterTimeoutRef.current) clearTimeout(productFilterTimeoutRef.current);
    productFilterTimeoutRef.current = setTimeout(async () => {
      try {
        const q = (filterText || '').trim();
        const url = q ? `/products/selector?q=${encodeURIComponent(q)}&limit=100` : '/products/selector?limit=500';
        const res = await api.get(url);
        const list = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.items || []);
        if (list.length > 0 && list[0].search_key) {
          setProducts(prev => {
            const selectedIds = new Set(adjLines.map((l: any) => l.product_variant_id).filter(Boolean));
            const preserved = prev.filter((p: any) => selectedIds.has(p.value) && !list.some((m: any) => m.value === p.value));
            return [...preserved, ...list];
          });
        }
      } catch (e) {
        console.error(e);
      }
    }, 200);
  };

  const fetchProducts = async () => {
    try {
      let res;
      try {
        res = await api.get('/products/selector?limit=1000');
      } catch (err) {
        res = await api.get('/products/?limit=1000');
      }
      const list = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.items || []);
      // Si proviene del endpoint /products/selector, los objetos ya vienen preformateados y optimizados
      if (list.length > 0 && list[0].search_key) {
        setProducts(list);
        return;
      }

      const formatted = list.map((p: any) => {
        const mainVar = (p.variants && p.variants.length > 0) ? p.variants[0] : null;
        const skuCode = mainVar?.sku || p.sku || p.code || p.default_code || `PRD-${p.id}`;
        const variantId = mainVar?.id || p.variant_id || p.id;
        const prodName = p.name || p.product_name || 'Producto Sin Nombre';
        const costVal = mainVar?.average_cost || mainVar?.standard_cost || p.cost_usd || p.cost || 0.0;

        // Extraer todos los códigos de barra y códigos alternos de todas las variantes
        const allBarcodes: string[] = [];
        if (mainVar?.barcode && !allBarcodes.includes(mainVar.barcode)) allBarcodes.push(mainVar.barcode);
        if (mainVar?.barcodes && Array.isArray(mainVar.barcodes)) {
          mainVar.barcodes.forEach((b: any) => {
            if (b.barcode && !allBarcodes.includes(b.barcode)) allBarcodes.push(b.barcode);
          });
        }
        if (p.variants && Array.isArray(p.variants)) {
          p.variants.forEach((v: any) => {
            if (v.barcode && !allBarcodes.includes(v.barcode)) allBarcodes.push(v.barcode);
            if (v.barcodes && Array.isArray(v.barcodes)) {
              v.barcodes.forEach((b: any) => {
                if (b.barcode && !allBarcodes.includes(b.barcode)) allBarcodes.push(b.barcode);
              });
            }
            if (v.part_number && !allBarcodes.includes(v.part_number)) allBarcodes.push(v.part_number);
          });
        }

        const primaryBarcode = allBarcodes.length > 0 ? allBarcodes[0] : '';
        const barcodes_str = allBarcodes.join(' ');
        const search_key = `${skuCode} ${prodName} ${barcodes_str}`.toLowerCase();
  const displayLabel = `[${skuCode}] ${prodName}`;

        return {
          id: variantId,
          value: variantId,
          variant_id: variantId,
          sku: skuCode,
          name: prodName,
          uom_base: p.uom_base || 'UND',
          label: displayLabel,
          primary_barcode: primaryBarcode,
          barcodes: allBarcodes,
          barcodes_str: barcodes_str,
          search_key: search_key,
          cost: costVal
        };
      });
      setProducts(formatted);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCategories = async () => {
    try {
      let res;
      try {
        res = await api.get('/categories/tree');
      } catch (err) {
        res = await api.get('/catalog/categories/tree');
      }
      const rawTree = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      setCategories(rawTree);
      setCategoriesTree(formatCategoryTreeNodes(rawTree));
    } catch (e) {
      console.error('Error cargando árbol de categorías:', e);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    // 1. Carga inmediata y prioritaria de los datos visibles en pantalla (tiempo de respuesta < 200 ms)
    await Promise.all([
      fetchAdjustments(),
      fetchSessions(),
      fetchFacilities(),
      fetchWarehouses(),
      fetchLocationsTree(),
      fetchReasons()
    ]);
    setLoading(false);

    // 2. Carga en segundo plano sin congelar la interfaz de usuario (para modales)
    fetchProducts();
    fetchCategories();
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Filter Warehouses by Facility
  const filteredWarehouses = React.useMemo(() => {
    if (!selectedFacilityId) return warehouses;
    return warehouses.filter((w: any) => w.facility_id === selectedFacilityId);
  }, [warehouses, selectedFacilityId]);

  // Set default warehouse when facility changes
  useEffect(() => {
    if (filteredWarehouses.length > 0) {
      setSelectedWarehouseId(filteredWarehouses[0].id);
    } else {
      setSelectedWarehouseId(null);
    }
  }, [filteredWarehouses]);

  // Filter Locations by Selected Warehouse
  const availableLocations = React.useMemo(() => {
    if (!selectedWarehouseId) return [];
    const wh = locationsTree.find((w: any) => w.id === selectedWarehouseId);
    return (wh?.locations || []).map((l: any) => ({
      label: `${l.name} (${l.code})`,
      value: l.id
    }));
  }, [locationsTree, selectedWarehouseId]);

  // Filter Locations for Toma Física Modal by Selected Session Warehouse
  const sessionAvailableLocations = React.useMemo(() => {
    if (!sessionWarehouseId) return [];
    const wh = locationsTree.find((w: any) => w.id === sessionWarehouseId);
    return (wh?.locations || []).map((l: any) => ({
      label: `[${l.code || 'LOC'}] ${l.name}`,
      value: l.id
    }));
  }, [locationsTree, sessionWarehouseId]);

  // QUICK IN-LINE REASON CREATION
  const [quickReasonDialogVisible, setQuickReasonDialogVisible] = useState(false);
  const [quickReasonCode, setQuickReasonCode] = useState('');
  const [quickReasonName, setQuickReasonName] = useState('');
  const [quickReasonType, setQuickReasonType] = useState('OUT');
  const [quickReasonAccount, setQuickReasonAccount] = useState('');
  const [savingQuickReason, setSavingQuickReason] = useState(false);

  const handleCreateQuickReason = async () => {
    if (!quickReasonCode.trim() || !quickReasonName.trim()) {
      toast.current?.show({ severity: 'warn', summary: 'Campos Requeridos', detail: 'Ingrese código y nombre descriptivo del motivo.' });
      return;
    }
    setSavingQuickReason(true);
    try {
      const res = await api.post('/wms/adjustment-reasons', {
        code: quickReasonCode.trim(),
        name: quickReasonName.trim(),
        default_type: quickReasonType,
        account_code: quickReasonAccount.trim()
      });
      toast.current?.show({ severity: 'success', summary: 'Motivo Creado In-Line', detail: `Motivo "${res.data.name}" agregado y seleccionado.` });
      setQuickReasonCode('');
      setQuickReasonName('');
      setQuickReasonAccount('');
      setQuickReasonDialogVisible(false);
      await fetchReasons();
      if (res.data && res.data.id) {
        setSelectedReasonId(res.data.id);
        setMovementType(res.data.default_type || 'OUT');
      }
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'No se pudo crear el motivo.' });
    }
    setSavingQuickReason(false);
  };

  // ADD LINE TO ADJUSTMENT (EMPTY BY DEFAULT)
  const addLine = () => {
    setAdjLines(prev => [
      ...prev,
      {
        product_variant_id: null,
        batch_id: null,
        quantity: 1,
        unit_cost: 0.0,
        total_value: 0.0,
        uom_base: 'UND'
      }
    ]);
  };

  // TRANSCRIPCIÓN RÁPIDA EN AJUSTE DIRECTO (CÓDIGO -> ENTER -> CANTIDAD -> ENTER)
  const focusAdjFastQty = () => {
    setTimeout(() => {
      if (adjFastQtyInputRef.current) {
        const inputEl = adjFastQtyInputRef.current.getInput ? adjFastQtyInputRef.current.getInput() : adjFastQtyInputRef.current;
        if (inputEl && inputEl.focus) {
          inputEl.focus();
          if (inputEl.select) inputEl.select();
        }
      }
    }, 50);
  };

  const selectProductForFastEntry = (prod: any) => {
    if (!prod) return;
    setAdjFastSelectedProd(prod);
    setAdjFastCodeInput(`${prod.sku} — ${prod.name}`);
    setAdjFastQty(1);
    adjFastQtyRef.current = 1;
    focusAdjFastQty();
  };

  const runF2Search = async (queryText: string) => {
    const q = (queryText || '').trim();
    if (!q) {
      const initial = products.slice(0, 30);
      setF2SearchResults(initial);
      setF2SelectedIndex(0);
      return;
    }
    setF2Loading(true);
    try {
      const res = await api.get(`/products/selector?q=${encodeURIComponent(q)}&limit=40`);
      const remoteList = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.items || []);
      if (remoteList.length > 0) {
        setProducts(prev => {
          const existingIds = new Set(prev.map((x: any) => x.value));
          return [...prev, ...remoteList.filter((x: any) => !existingIds.has(x.value))];
        });
        setF2SearchResults(remoteList);
        setF2SelectedIndex(0);
        return;
      }
    } catch (e) {
      console.error('Error en búsqueda F2:', e);
    } finally {
      setF2Loading(false);
    }
    const low = q.toLowerCase();
    const localFiltered = products.filter((p: any) => (p.search_key || `${p.sku} ${p.name}`).toLowerCase().includes(low)).slice(0, 40);
    setF2SearchResults(localFiltered);
    setF2SelectedIndex(0);
  };

  const openF2SearchModal = (initialQuery: string = '') => {
    const cleanQ = (initialQuery || '').trim();
    setF2SearchQuery(cleanQ);
    setF2SearchDialogVisible(true);
    runF2Search(cleanQ);
    setTimeout(() => {
      if (f2InputRef.current) {
        f2InputRef.current.focus();
        f2InputRef.current.select();
      }
    }, 60);
  };

  const handleAdjFastLookup = async (rawCode: string) => {
    const clean = (rawCode || '').trim().toLowerCase();
    if (!clean) {
      openF2SearchModal('');
      return;
    }

    const candidates = buildCodeCandidates(clean);
    const matchesProduct = (p: any) => {
      const pSku = (p.sku || '').toLowerCase();
      const pPrimary = (p.primary_barcode || '').toLowerCase();
      const pBarcodes = (p.barcodes || []).map((b: string) => b.toLowerCase());
      const pName = (p.name || '').toLowerCase();
      return candidates.some(c => c === pSku || c === pPrimary || pBarcodes.includes(c)) ||
             (clean.length >= 3 && pName.includes(clean));
    };

    const exactMatches = (p: any) => {
      const pSku = (p.sku || '').toLowerCase();
      const pPrimary = (p.primary_barcode || '').toLowerCase();
      const pBarcodes = (p.barcodes || []).map((b: string) => b.toLowerCase());
      return candidates.some(c => c === pSku || c === pPrimary || pBarcodes.includes(c));
    };

    // 1. Buscar coincidencia exacta en memoria
    const localExact = products.find(exactMatches);
    if (localExact) {
      selectProductForFastEntry(localExact);
      return;
    }

    // 2. Consultar en el servidor (/products/selector?q=...) para cubrir los 10,854+ SKUs
    setAdjFastSearching(true);
    try {
      const res = await api.get(`/products/selector?q=${encodeURIComponent(rawCode.trim())}&limit=25`);
      const remoteList = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.items || []);
      if (remoteList.length > 0) {
        setProducts(prev => {
          const existingIds = new Set(prev.map((x: any) => x.value));
          return [...prev, ...remoteList.filter((x: any) => !existingIds.has(x.value))];
        });
        const exactHit = remoteList.find(exactMatches);
        if (exactHit || remoteList.length === 1) {
          selectProductForFastEntry(exactHit || remoteList[0]);
          return;
        }
        // Si escribió texto parcial y hay varios resultados, abrir el selector F2 con los resultados listos para elegir con flechas + Enter
        setF2SearchQuery(rawCode.trim());
        setF2SearchResults(remoteList);
        setF2SelectedIndex(0);
        setF2SearchDialogVisible(true);
        setTimeout(() => {
          if (f2InputRef.current) f2InputRef.current.focus();
        }, 60);
        return;
      }
    } catch (err) {
      console.error('Error en búsqueda rápida de ajuste:', err);
    } finally {
      setAdjFastSearching(false);
    }

    const localPartial = products.find(matchesProduct);
    if (localPartial) {
      selectProductForFastEntry(localPartial);
      return;
    }

    toast.current?.show({
      severity: 'warn',
      summary: 'Producto No Encontrado',
      detail: `No se halló ningún producto para "${rawCode}".`,
      life: 2500
    });
  };

  const handleAdjFastAdd = (rawDomValue?: string) => {
    if (!adjFastSelectedProd) {
      if (adjFastCodeInput.trim()) {
        handleAdjFastLookup(adjFastCodeInput);
      }
      return;
    }
    const uom = adjFastSelectedProd.uom_base || 'UND';

    // Leer el valor real directamente del input DOM por si el usuario presionó Enter sin hacer blur en PrimeReact InputNumber
    let resolvedRawQty: number = adjFastQtyRef.current || adjFastQty || 1;
    const domStr = rawDomValue !== undefined
      ? rawDomValue
      : (adjFastQtyInputRef.current?.getInput ? adjFastQtyInputRef.current.getInput()?.value : undefined);
    if (domStr !== undefined && domStr !== null && String(domStr).trim() !== '') {
      const cleaned = String(domStr).replace(/,/g, '').trim();
      const parsedDom = parseFloat(cleaned);
      if (!isNaN(parsedDom) && parsedDom > 0) {
        resolvedRawQty = parsedDom;
      }
    }

    const qtyToAdd = sanitizeQuantity(resolvedRawQty, uom);
    if (qtyToAdd <= 0) {
      toast.current?.show({ severity: 'warn', summary: 'Cantidad Inválida', detail: 'Ingrese una cantidad mayor a 0.', life: 2000 });
      return;
    }
    const unitCost = parseFloat(adjFastSelectedProd.cost || 0);

    setAdjLines(prev => {
      // Si hay una única fila vacía inicial, reemplazarla
      const nonEmpty = prev.filter(l => l.product_variant_id !== null);
      const existingIdx = nonEmpty.findIndex(l => l.product_variant_id === adjFastSelectedProd.value);
      if (existingIdx >= 0) {
        const copy = [...nonEmpty];
        const newQty = sanitizeQuantity(parseFloat(copy[existingIdx].quantity || 0) + qtyToAdd, uom);
        const c = parseFloat(copy[existingIdx].unit_cost || unitCost || 0);
        copy[existingIdx] = {
          ...copy[existingIdx],
          quantity: newQty,
          unit_cost: c,
          total_value: roundVal(newQty * c)
        };
        return copy;
      }
      return [
        ...nonEmpty,
        {
          product_variant_id: adjFastSelectedProd.value,
          batch_id: null,
          quantity: qtyToAdd,
          unit_cost: unitCost,
          total_value: roundVal(qtyToAdd * unitCost),
          uom_base: uom
        }
      ];
    });

    setAdjFastSelectedProd(null);
    setAdjFastCodeInput('');
    setAdjFastQty(1);
    adjFastQtyRef.current = 1;
    setTimeout(() => {
      if (adjFastCodeInputRef.current) {
        adjFastCodeInputRef.current.focus();
      }
    }, 40);
  };

  const handleBulkPasteProcess = async () => {
    const rawLines = (bulkPasteText || '')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
    if (rawLines.length === 0) {
      toast.current?.show({ severity: 'warn', summary: 'Texto Vacío', detail: 'Pegue al menos una línea con Código y Cantidad.' });
      return;
    }

    setProcessingBulkPaste(true);
    let addedCount = 0;
    const notFoundCodes: string[] = [];
    const newProductsDiscovered: any[] = [];
    const resolvedEntries: { prod: any; qty: number }[] = [];

    for (const rawLine of rawLines) {
      // Soportar tabulador (Excel), punto y coma, coma o espacio al final
      let parts = rawLine.split(/\t|;/);
      if (parts.length < 2) {
        const match = rawLine.match(/^(\S+)\s+([\d.,]+)$/);
        if (match) {
          parts = [match[1], match[2]];
        } else {
          parts = rawLine.split(',');
        }
      }
      const codeToken = (parts[0] || '').trim();
      const qtyToken = parts.length > 1 ? (parts[1] || '1').trim().replace(',', '.') : '1';
      const parsedQty = parseFloat(qtyToken);
      const qtyVal = !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : 1;
      if (!codeToken) continue;

      const candidates = buildCodeCandidates(codeToken.toLowerCase());
      const exactMatches = (p: any) => {
        const pSku = (p.sku || '').toLowerCase();
        const pPrimary = (p.primary_barcode || '').toLowerCase();
        const pBarcodes = (p.barcodes || []).map((b: string) => b.toLowerCase());
        return candidates.some(c => c === pSku || c === pPrimary || pBarcodes.includes(c));
      };

      let prod = products.find(exactMatches) || newProductsDiscovered.find(exactMatches);
      if (!prod) {
        try {
          const res = await api.get(`/products/selector?q=${encodeURIComponent(codeToken)}&limit=10`);
          const list = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.items || []);
          if (list.length > 0) {
            newProductsDiscovered.push(...list);
            prod = list.find(exactMatches) || list[0];
          }
        } catch (e) {
          console.error(e);
        }
      }

      if (prod) {
        resolvedEntries.push({ prod, qty: qtyVal });
        addedCount++;
      } else {
        notFoundCodes.push(codeToken);
      }
    }

    if (newProductsDiscovered.length > 0) {
      setProducts(prev => {
        const existingIds = new Set(prev.map((x: any) => x.value));
        const uniqueNew = newProductsDiscovered.filter((x: any, idx: number, arr: any[]) =>
          !existingIds.has(x.value) && arr.findIndex(y => y.value === x.value) === idx
        );
        return [...prev, ...uniqueNew];
      });
    }

    if (resolvedEntries.length > 0) {
      setAdjLines(prev => {
        const copy = [...prev.filter(l => l.product_variant_id !== null)];
        for (const item of resolvedEntries) {
          const uom = item.prod.uom_base || 'UND';
          const cleanQty = sanitizeQuantity(item.qty, uom);
          const cost = parseFloat(item.prod.cost || 0);
          const idx = copy.findIndex(l => l.product_variant_id === item.prod.value);
          if (idx >= 0) {
            const sumQty = sanitizeQuantity(parseFloat(copy[idx].quantity || 0) + cleanQty, uom);
            const c = parseFloat(copy[idx].unit_cost || cost || 0);
            copy[idx] = { ...copy[idx], quantity: sumQty, unit_cost: c, total_value: roundVal(sumQty * c) };
          } else {
            copy.push({
              product_variant_id: item.prod.value,
              batch_id: null,
              quantity: cleanQty,
              unit_cost: cost,
              total_value: roundVal(cleanQty * cost),
              uom_base: uom
            });
          }
        }
        return copy;
      });
    }

    setProcessingBulkPaste(false);
    if (addedCount > 0) {
      setBulkPasteDialogVisible(false);
      setBulkPasteText('');
      toast.current?.show({
        severity: notFoundCodes.length > 0 ? 'warn' : 'success',
        summary: `${addedCount} Producto(s) Cargados`,
        detail: notFoundCodes.length > 0
          ? `No se encontraron ${notFoundCodes.length}: ${notFoundCodes.slice(0, 5).join(', ')}`
          : 'Todos los renglones fueron agregados correctamente.',
        life: 4500
      });
    } else {
      toast.current?.show({
        severity: 'error',
        summary: 'Sin Coincidencias',
        detail: `No se pudo identificar ninguno de los códigos indicados (${notFoundCodes.slice(0, 5).join(', ')}).`,
        life: 4500
      });
    }
  };

  const updateLine = (index: number, field: string, val: any) => {
    setAdjLines(prev => {
      const copy = [...prev];
      const line = { ...copy[index], [field]: val };

      if (field === 'product_variant_id') {
        const prod = products.find(p => p.value === val);
        if (prod) {
          line.unit_cost = prod.cost || 0.0;
          line.uom_base = prod.uom_base || 'UND';
        }
      }

      if (field === 'quantity') {
        const prod = products.find(p => p.value === line.product_variant_id);
        line.quantity = sanitizeQuantity(val, prod?.uom_base);
      }

      const q = parseFloat(line.quantity || 0);
      const c = parseFloat(line.unit_cost || 0);
      line.total_value = roundVal(q * c);
      copy[index] = line;
      return copy;
    });
  };

  const removeLine = (index: number) => {
    setAdjLines(prev => prev.filter((_, i) => i !== index));
  };

  const roundVal = (num: number) => Math.round(num * 10000) / 10000;

  // Calculate Total General for New Adjustment Draft
  const calcDraftTotal = React.useMemo(() => {
    return adjLines.reduce((acc, l) => acc + (l.total_value || 0), 0);
  }, [adjLines]);

  // SAVE DIRECT ADJUSTMENT (PENDING)
  const saveDirectAdjustment = async () => {
    if (!selectedFacilityId || !selectedWarehouseId || !selectedReasonId) {
      toast.current?.show({ severity: 'warn', summary: 'Campos Incompletos', detail: 'Seleccione sucursal, almacén y motivo de ajuste.' });
      return;
    }
    if (adjLines.length === 0) {
      toast.current?.show({ severity: 'warn', summary: 'Sin Productos', detail: 'Agregue al menos un producto a la solicitud de ajuste.' });
      return;
    }

    const hasEmptyProduct = adjLines.some(l => !l.product_variant_id);
    if (hasEmptyProduct) {
      toast.current?.show({ severity: 'warn', summary: 'Producto No Seleccionado', detail: 'Por favor seleccione un producto/SKU en todas las líneas de la grilla.' });
      return;
    }

    const hasZeroQty = adjLines.some(l => !l.quantity || l.quantity <= 0);
    if (hasZeroQty) {
      toast.current?.show({ severity: 'warn', summary: 'Cantidad Inválida', detail: 'La cantidad ajustada en cada producto debe ser mayor a 0.' });
      return;
    }

    const hasZeroCost = adjLines.some(l => !l.unit_cost || l.unit_cost <= 0);
    if (hasZeroCost) {
      toast.current?.show({ severity: 'warn', summary: 'Costo Inválido ($0.00)', detail: 'Un ajuste no puede guardarse en $0.00. El producto debe tener un costo unitario asignado.' });
      return;
    }

    if (calcDraftTotal <= 0) {
      toast.current?.show({ severity: 'warn', summary: 'Total Inválido ($0.00)', detail: 'El total general del ajuste debe ser mayor a $0.00.' });
      return;
    }

    setSavingAdj(true);
    try {
      const payload = {
        facility_id: selectedFacilityId,
        warehouse_id: selectedWarehouseId,
        location_id: selectedLocationId,
        reason_id: selectedReasonId,
        movement_type: movementType,
        notes: notes.trim(),
        lines: adjLines.map(l => {
          const prod = products.find(p => p.value === l.product_variant_id);
          const uom = l.uom_base || prod?.uom_base || 'UND';
          return {
            product_variant_id: l.product_variant_id,
            batch_id: l.batch_id,
            quantity: sanitizeQuantity(l.quantity, uom),
            unit_cost: l.unit_cost
          };
        })
      };

      const res = await api.post('/wms/adjustments', payload);
      toast.current?.show({ severity: 'success', summary: 'Ajuste Creado', detail: res.data.message });
      setNewAdjDialogVisible(false);
      setAdjLines([]);
      setNotes('');
      fetchAdjustments();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'No se pudo guardar el ajuste.' });
    }
    setSavingAdj(false);
  };

  // APPROVE ADJUSTMENT
  const handleApproveAdj = async (id: number) => {
    setProcessingApprove(true);
    try {
      const res = await api.post(`/wms/adjustments/${id}/approve`);
      toast.current?.show({ severity: 'success', summary: 'Ajuste Aprobado', detail: res.data.message });
      setViewAdjDialogVisible(false);
      fetchAdjustments();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error de Aprobación', detail: e.response?.data?.detail || 'Fallo al aprobar ajuste.' });
    }
    setProcessingApprove(false);
  };

  // REJECT ADJUSTMENT
  const handleRejectAdj = async (id: number) => {
    setProcessingApprove(true);
    try {
      const res = await api.post(`/wms/adjustments/${id}/reject`);
      toast.current?.show({ severity: 'info', summary: 'Ajuste Rechazado', detail: res.data.message });
      setViewAdjDialogVisible(false);
      fetchAdjustments();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al rechazar.' });
    }
    setProcessingApprove(false);
  };

  // CREATE REASON
  const handleCreateReason = async () => {
    if (!newReasonCode.trim() || !newReasonName.trim()) {
      toast.current?.show({ severity: 'warn', summary: 'Campos Requeridos', detail: 'Ingrese código y nombre del motivo.' });
      return;
    }
    try {
      await api.post('/wms/adjustment-reasons', {
        code: newReasonCode.trim(),
        name: newReasonName.trim(),
        default_type: newReasonType,
        account_code: newReasonAccount.trim()
      });
      toast.current?.show({ severity: 'success', summary: 'Motivo Guardado', detail: 'Motivo de ajuste registrado correctamente.' });
      setNewReasonCode('');
      setNewReasonName('');
      setNewReasonAccount('');
      fetchReasons();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'No se pudo guardar el motivo.' });
    }
  };

  // CREATE PHYSICAL SESSION
  const createSession = async () => {
    if (!sessionName.trim() || !sessionFacilityId || !sessionWarehouseId) {
      toast.current?.show({ severity: 'warn', summary: 'Incompleto', detail: 'Debe ingresar Nombre, Sucursal y Almacén obligatorio.' });
      return;
    }
    setCreatingSession(true);
    try {
      await api.post('/inventory-session/', {
        name: sessionName,
        facility_id: sessionFacilityId,
        warehouse_id: sessionWarehouseId,
        scope_type: sessionScopeType || 'GENERAL',
        scope_value: sessionCategoryId ? String(sessionCategoryId) : (sessionScopeValue || null),
        category_id: sessionCategoryId || null,
        location_id: sessionLocationId || null,
        is_blind_count: sessionIsBlindCount
      });
      toast.current?.show({ severity: 'success', summary: 'Toma Física Creada', detail: 'Sesión de recuento e inventario teórico generados con éxito.' });
      setNewSessionDialogVisible(false);
      setSessionName('');
      setSessionScopeValue('');
      setSessionCategoryId(null);
      setSessionLocationId(null);
      setSessionIsBlindCount(true);
      fetchSessions();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al crear sesión.' });
    }
    setCreatingSession(false);
  };

  // OPEN SESSION DETAIL & CONCILIATION
  const handleOpenSessionDetail = async (sessionId: number) => {
    try {
      const res = await api.get(`/inventory-session/${sessionId}`);
      const sessionData = res.data;
      setSelectedSession(sessionData);
      setCountingProdId(null);
      setCountingQty(0);
      setCountingSheetNo('');
      setCountingOperator('');
      setCountingNotes('');
      setAiAuditResult(null);
      setManageSessionDialogVisible(true);

      // Pre-seleccionar motivos por defecto para faltantes y sobrantes
      if (reasons && reasons.length > 0) {
        const defOut = reasons.find(r => r.default_type === 'OUT' || r.code?.includes('MERMA')) || reasons[0];
        const defIn = reasons.find(r => r.default_type === 'IN' || r.code?.includes('SOBRANTE')) || reasons[0];
        if (defOut) setBatchReasonOut(defOut.id);
        if (defIn) setBatchReasonIn(defIn.id);
      }

      // Si la sesión está acotada por categoría (CYCLIC / CATEGORY)
      const hasCategoryScope = (sessionData.scope_type === 'CYCLIC' || sessionData.scope_type === 'CATEGORY') && sessionData.scope_value && !isNaN(Number(sessionData.scope_value));
      if (hasCategoryScope) {
        setLoadingSessionProducts(true);
        try {
          const prodRes = await api.get(`/products/selector?category_id=${sessionData.scope_value}&limit=2000`);
          const pList = Array.isArray(prodRes.data) ? prodRes.data : (prodRes.data?.data || []);
          setSessionScopedProducts(pList);
        } catch (err) {
          console.error("Error fetching scoped products for session:", err);
          setSessionScopedProducts([]);
        } finally {
          setLoadingSessionProducts(false);
        }
      } else {
        setSessionScopedProducts([]);
      }

      if (sessionData.state === 'REVIEW' || sessionData.state === 'DONE') {
        handleRunAIAudit(sessionId);
      }
    } catch (e) {
      console.error(e);
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el detalle de la toma física.' });
    }
  };

  // ADVANCE SESSION PHASE (IN_PROGRESS -> REVIEW -> DONE)
  const handleAdvancePhase = async (targetState: string) => {
    if (!selectedSession) return;
    try {
      const res = await api.post(`/inventory-session/${selectedSession.id}/advance-phase?target_state=${targetState}`);
      setSelectedSession(res.data);
      toast.current?.show({
        severity: 'info',
        summary: 'Fase Actualizada',
        detail: `La toma física avanzó a estado: ${targetState}`
      });
      fetchSessions();
      if (targetState === 'REVIEW') {
        handleRunAIAudit(selectedSession.id);
      }
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'No se pudo cambiar de fase.' });
    }
  };

  // AUDIT WITH CLARA AI
  const handleRunAIAudit = async (sessionId: number) => {
    setLoadingAiAudit(true);
    try {
      const res = await api.post(`/inventory-session/${sessionId}/ai-audit`);
      setAiAuditResult(res.data);
      toast.current?.show({ severity: 'success', summary: 'Análisis IA Completado', detail: 'Métricas de precisión y cotejo generadas con éxito.' });
    } catch (e: any) {
      console.error(e);
    }
    setLoadingAiAudit(false);
  };

  // RECORD BLIND COUNT FOR A LINE (ULTRA-FAST SINGLE LINE UPDATE)
  const handleRecordCount = async (overrideQtyRaw?: number | string) => {
    if (!selectedSession || !countingProdId) {
      toast.current?.show({ severity: 'warn', summary: 'Selección Requerida', detail: 'Seleccione un producto para registrar el conteo.' });
      return;
    }
    setSavingCount(true);
    try {
      const prod = availableCountingProducts.find(p => p.value === countingProdId) || products.find(p => p.value === countingProdId);
      let rawQty = countingQty;
      if (overrideQtyRaw !== undefined && overrideQtyRaw !== null && overrideQtyRaw !== '') {
        const parsed = typeof overrideQtyRaw === 'number'
          ? overrideQtyRaw
          : parseFloat(String(overrideQtyRaw).replace(/,/g, ''));
        if (!isNaN(parsed)) {
          rawQty = parsed;
        }
      }
      const sanitizedQty = sanitizeQuantity(rawQty, prod?.uom_base);

      const res = await api.post(`/inventory-session/${selectedSession.id}/count-line`, {
        product_variant_id: countingProdId,
        counted_qty: sanitizedQty,
        notes: countingNotes
      });
      const updatedLine = res.data;

      setSelectedSession((prev: any) => {
        if (!prev) return prev;
        const lines = Array.isArray(prev.lines) ? [...prev.lines] : [];
        const existingIdx = lines.findIndex((l: any) => l.product_variant_id === updatedLine.product_variant_id || l.id === updatedLine.id);
        if (existingIdx >= 0) {
          lines[existingIdx] = { ...lines[existingIdx], ...updatedLine };
        } else {
          lines.unshift(updatedLine);
        }
        return { ...prev, lines };
      });

      toast.current?.show({
        severity: 'success',
        summary: 'Conteo Guardado',
        detail: `[${prod?.sku || updatedLine.sku}] Cantidad: ${sanitizedQty}`,
        life: 1800
      });
      setCountingProdId(null);
      setCountingQty(0);
      setCountingNotes('');
      setTimeout(() => {
        if (countingBarcodeInputRef.current) {
          countingBarcodeInputRef.current.focus();
        }
      }, 40);
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al registrar conteo.' });
    }
    setSavingCount(false);
  };


  // CONSOLIDATE & CLOSE PHYSICAL INVENTORY SESSION
  const handleValidateSession = async (sessionId: number) => {
    setValidatingSession(true);
    try {
      const res = await api.post(`/inventory-session/${sessionId}/validate`);
      toast.current?.show({ severity: 'success', summary: 'Toma Física Consolidada', detail: res.data?.message || 'Inventario y stock físico actualizados correctamente.' });
      setManageSessionDialogVisible(false);
      fetchSessions();
      fetchAdjustments();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error de Consolidación', detail: e.response?.data?.detail || 'No se pudo finalizar la toma física.' });
    }
    setValidatingSession(false);
  };

  // ACTUALIZAR MOTIVO INDIVIDUAL POR RENGLÓN EN FASE 2
  const handleUpdateLineReason = async (lineId: number, reasonId: number | null) => {
    if (!selectedSession) return;
    setUpdatingLineReasonId(lineId);
    try {
      const res = await api.patch(`/inventory-session/${selectedSession.id}/lines/${lineId}/reason`, {
        adjustment_reason_id: reasonId
      });
      const updatedLine = res.data;
      setSelectedSession((prev: any) => {
        if (!prev) return prev;
        const newLines = (prev.lines || []).map((l: any) => l.id === lineId ? { ...l, ...updatedLine } : l);
        return { ...prev, lines: newLines };
      });
      toast.current?.show({
        severity: 'success',
        summary: 'Motivo Guardado',
        detail: 'Motivo de ajuste asignado correctamente.',
        life: 2000
      });
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: e.response?.data?.detail || 'No se pudo guardar el motivo de ajuste.'
      });
    } finally {
      setUpdatingLineReasonId(null);
    }
  };

  // ASIGNACIÓN MASIVA DE MOTIVOS PARA FALTANTES O SOBRANTES EN FASE 2
  const handleBatchAssignReasons = async (type: 'OUT' | 'IN') => {
    if (!selectedSession) return;
    setSavingBatchReasons(true);
    try {
      const payload: any = {};
      if (type === 'OUT') {
        if (!batchReasonOut) {
          toast.current?.show({ severity: 'warn', summary: 'Selección Requerida', detail: 'Seleccione un motivo para los faltantes.' });
          setSavingBatchReasons(false);
          return;
        }
        payload.reason_id_out = batchReasonOut;
      } else {
        if (!batchReasonIn) {
          toast.current?.show({ severity: 'warn', summary: 'Selección Requerida', detail: 'Seleccione un motivo para los sobrantes.' });
          setSavingBatchReasons(false);
          return;
        }
        payload.reason_id_in = batchReasonIn;
      }

      const res = await api.post(`/inventory-session/${selectedSession.id}/lines/reasons/batch`, payload);
      setSelectedSession(res.data);
      toast.current?.show({
        severity: 'success',
        summary: 'Asignación Masiva Exitosa',
        detail: `Se aplicó el motivo seleccionado a todos los renglones de ${type === 'OUT' ? 'faltantes (-)' : 'sobrantes (+)'}.`
      });
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: e.response?.data?.detail || 'Fallo en asignación masiva de motivos.'
      });
    } finally {
      setSavingBatchReasons(false);
    }
  };

  const getAdjStateSeverity = (state: string) => {
    switch (state) {
      case 'PENDING': return 'warning';
      case 'APPROVED': return 'success';
      case 'REJECTED': return 'danger';
      default: return 'info';
    }
  };

  const getAdjStateText = (state: string) => {
    switch (state) {
      case 'PENDING': return 'PENDIENTE APROBACIÓN';
      case 'APPROVED': return 'APROBADO & EJECUTADO';
      case 'REJECTED': return 'RECHAZADO';
      default: return state;
    }
  };

  // Stats calculation
  const totalAdjustedAmount = React.useMemo(() => {
    return adjustments.filter(a => a.state === 'APPROVED').reduce((acc, a) => acc + (a.total_amount || 0), 0);
  }, [adjustments]);

  const pendingCount = React.useMemo(() => {
    return adjustments.filter(a => a.state === 'PENDING').length;
  }, [adjustments]);

  return (
    <div className="p-4 sm:p-8 w-full max-w-[1500px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />

      {/* HEADER BAR */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-indigo-500 to-purple-600"></div>
        <div className="pl-4">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
            <i className="pi pi-sort-alt text-indigo-600 mr-3"></i>Gestión de Ajustes de Inventario
          </h1>
          <p className="text-slate-500 text-sm mt-1">Registro de cargos y descargos por mermas, daños, hurtos y tomas físicas masivas de stock.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            label="⚙️ Catálogo Motivos"
            outlined
            className="font-bold text-slate-700 border-slate-300 hover:bg-slate-50 text-xs"
            onClick={() => setReasonsDialogVisible(true)}
          />
          <Button
            icon="pi pi-refresh"
            rounded
            outlined
            className="font-bold text-slate-600 border-slate-300 hover:bg-slate-50"
            onClick={loadAllData}
          />
        </div>
      </div>

      {/* TABS SEGMENTED CONTROL */}
      <div className="flex bg-slate-200/70 p-1.5 rounded-2xl w-full max-w-md shadow-inner border border-slate-300/60 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab(0)}
          className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex-1 ${activeTab === 0 ? 'bg-white shadow-md text-indigo-700' : 'text-slate-600 hover:text-slate-800'}`}
        >
          <i className="pi pi-sliders-h"></i>
          Ajustes
          {pendingCount > 0 && (
            <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black ml-1">{pendingCount}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab(1)}
          className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex-1 ${activeTab === 1 ? 'bg-white shadow-md text-indigo-700' : 'text-slate-600 hover:text-slate-800'}`}
        >
          <i className="pi pi-check-square"></i>
          Tomas Físicas (Conteos)
        </button>
      </div>

      {/* TAB 0: AJUSTES */}
      {activeTab === 0 && (
        <div className="space-y-6">
          {/* Tab Header Action Bar */}
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Ajustes Directos de Inventario</h3>
              <p className="text-slate-500 text-xs mt-0.5">Registra solicitudes puntuales de cargo (+) o descargo (-) con justificación y flujo de aprobación.</p>
            </div>
            <Button
              label="+ Nuevo Ajuste"
              icon="pi pi-plus"
              severity="info"
              className="font-bold text-xs bg-indigo-600 border-indigo-600 text-white shadow-md hover:bg-indigo-700"
              onClick={() => {
                setAdjLines([]);
                setNewAdjDialogVisible(true);
              }}
            />
          </div>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Ajustes Aprobados ($)</span>
                <span className="text-2xl font-black text-slate-800 mt-1 block">${totalAdjustedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl font-bold">
                <i className="pi pi-dollar"></i>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Pendientes por Aprobación</span>
                <span className="text-2xl font-black text-amber-600 mt-1 block">{pendingCount} Solicitudes</span>
              </div>
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-xl font-bold">
                <i className="pi pi-clock"></i>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Registros</span>
                <span className="text-2xl font-black text-slate-800 mt-1 block">{adjustments.length} Movimientos</span>
              </div>
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-xl font-bold">
                <i className="pi pi-list"></i>
              </div>
            </div>
          </div>

          {/* DataTable */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
            <DataTable
              value={adjustments}
              loading={loading}
              paginator
              rows={10}
              emptyMessage="No hay ajustes directos registrados."
              className="p-datatable-sm text-slate-700 text-xs"
              stripedRows
              responsiveLayout="scroll"
            >
              <Column field="number" header="NÚMERO" body={a => <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{a.number}</span>} sortable />
              <Column field="facility_name" header="SUCURSAL" body={a => <span className="font-semibold text-slate-700">{a.facility_name}</span>} sortable />
              <Column field="warehouse_name" header="ALMACÉN" body={a => <span className="font-semibold text-slate-700">{a.warehouse_name}</span>} sortable />
              <Column field="location_name" header="UBICACIÓN" body={a => <span className="font-mono text-slate-600">{a.location_name}</span>} sortable />
              <Column field="reason_name" header="MOTIVO DE AJUSTE" body={a => <span className="font-bold text-slate-800">{a.reason_name}</span>} sortable />
              <Column header="TIPO" body={a => (
                <Tag 
                  value={a.movement_type === 'IN' ? 'CARGO (+)' : 'DESCARGO (-)'} 
                  severity={a.movement_type === 'IN' ? 'success' : 'danger'} 
                  className="font-bold text-[9px] px-2 py-0.5" 
                />
              )} align="center" sortable />
              <Column header="TOTAL GENERAL ($)" body={a => (
                <span className="font-mono font-bold text-slate-900 text-sm">
                  ${(a.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              )} align="right" sortable />
              <Column header="ESTADO" body={a => (
                <Tag severity={getAdjStateSeverity(a.state)} value={getAdjStateText(a.state)} className="font-bold text-[9px] px-2 py-1" />
              )} align="center" sortable />
              <Column field="created_by_name" header="SOLICITADO / FECHA" body={a => (
                <div className="flex flex-col text-xs">
                  <span className="text-slate-800 font-bold">{a.created_by_name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {a.created_at ? new Date(a.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              )} sortable />
              <Column header="ACCIONES / CONTROL" body={a => (
                <div className="flex items-center justify-center gap-2">
                  <Button
                    label="Ver"
                    icon="pi pi-eye"
                    severity="secondary"
                    size="small"
                    className="font-bold text-xs"
                    onClick={() => {
                      setSelectedAdj(a);
                      setViewAdjDialogVisible(true);
                    }}
                  />
                  {a.state === 'PENDING' && (
                    <Button
                      label="Aprobar"
                      icon="pi pi-check"
                      severity="success"
                      size="small"
                      className="font-bold text-xs"
                      onClick={() => {
                        setSelectedAdj(a);
                        setViewAdjDialogVisible(true);
                      }}
                    />
                  )}
                </div>
              )} align="center" style={{ width: '13rem' }} />
            </DataTable>
          </div>
        </div>
      )}

      {/* TAB 1: TOMAS FÍSICAS MASIVAS */}
      {activeTab === 1 && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Tomas Físicas y Recuentos por Pasillo</h3>
              <p className="text-slate-500 text-xs mt-0.5">Genera una captura masiva teórica, imprime o exporta planillas de conteo físico e ingresa conteos ciegos para conciliar inventario.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                label="Reporte / Planilla de Conteo"
                icon="pi pi-print"
                outlined
                severity="secondary"
                className="font-bold text-xs border-slate-300 text-slate-800 hover:bg-slate-50"
                onClick={() => {
                  const defaultFac = facilities.length > 0 ? facilities[0].id : null;
                  setSheetSessionId(null);
                  setSheetFacilityId(defaultFac);
                  setCountSheetDialogVisible(true);
                  loadCountSheetReport({ session_id: null, facility_id: defaultFac });
                }}
              />
              <Button
                label="+ Nueva Toma Física"
                icon="pi pi-plus"
                severity="info"
                className="font-bold text-xs bg-indigo-600 border-indigo-600 text-white"
                onClick={() => setNewSessionDialogVisible(true)}
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
            <DataTable
              value={sessions}
              loading={loading}
              paginator
              rows={10}
              emptyMessage="No hay recuentos físicos registrados."
              className="p-datatable-sm text-slate-700 text-xs"
              stripedRows
            >
              <Column field="id" header="ID SESIÓN" body={s => <span className="font-mono font-bold text-slate-700">SES-{s.id}</span>} sortable />
              <Column field="name" header="NOMBRE DE LA TOMA FÍSICA" body={s => (
                <div className="flex flex-col">
                  <span className="font-bold text-slate-800">{s.name}</span>
                  {s.category_full_path ? (
                    <span className="text-[10px] text-amber-700 font-mono mt-0.5 font-semibold truncate max-w-[320px]" title={s.category_full_path}>
                      🎯 {s.category_full_path}
                    </span>
                  ) : s.category_name ? (
                    <span className="text-[10px] text-amber-700 font-mono mt-0.5 font-semibold">
                      🎯 {s.category_name}
                    </span>
                  ) : null}
                </div>
              )} sortable />
              <Column field="facility_id" header="CENTRO / SUCURSAL" body={s => (
                <div className="flex flex-col">
                  <span className="font-bold text-slate-800 text-xs">
                    {s.facility_name || (facilities.find(f => f.id === s.facility_id)?.name) || `Sucursal #${s.facility_id}`}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {s.warehouse_name || 'Almacén Principal'}
                  </span>
                </div>
              )} sortable />
              <Column field="state" header="ESTADO / MODALIDAD" body={s => (
                <div className="flex flex-col items-center gap-1">
                  <Tag
                    severity={s.state === 'DONE' ? 'success' : s.state === 'REVIEW' ? 'info' : 'warning'}
                    value={
                      s.state === 'DONE'
                        ? 'FASE 3: CONCILIADO'
                        : s.state === 'REVIEW'
                        ? 'FASE 2: ANÁLISIS & COTEJO'
                        : s.is_blind_count === false
                        ? 'FASE 1: CONTEO GUIADO'
                        : 'FASE 1: CONTEO CIEGO'
                    }
                    className="font-bold text-[9px] px-2 py-1"
                  />
                  <span className={`text-[10px] font-semibold ${s.is_blind_count === false ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {s.is_blind_count === false ? '📋 Stock Visible' : '👁️ Stock Oculto'}
                  </span>
                </div>
              )} align="center" sortable />
              <Column header="RENGLONES" body={s => <span className="font-semibold text-slate-700">{s.total_lines !== undefined ? s.total_lines : (s.lines?.length || 0)} ítems</span>} align="right" />
              <Column header="ACCIONES / CONTROL" body={s => (
                <div className="flex items-center justify-center gap-1.5">
                  <Button
                    icon="pi pi-print"
                    label="Planilla"
                    tooltip="Imprimir o Exportar Excel de los productos de esta Toma Física"
                    tooltipOptions={{ position: 'top' }}
                    outlined
                    severity="help"
                    size="small"
                    className="font-bold text-xs border-slate-300 text-slate-800 hover:bg-slate-100"
                    onClick={() => openSessionCountSheet(s)}
                  />
                  <Button
                    icon="pi pi-eye"
                    tooltip="Ver Ficha de Configuración (Inmutable)"
                    tooltipOptions={{ position: 'top' }}
                    outlined
                    severity="secondary"
                    size="small"
                    className="font-bold text-xs"
                    onClick={() => {
                      setViewConfigSession(s);
                      setViewConfigDialogVisible(true);
                    }}
                  />
                  <Button
                    label="Gestionar Conteo & Conciliación"
                    icon="pi pi-sliders-h"
                    severity="info"
                    size="small"
                    className="font-bold text-xs bg-indigo-600 border-indigo-600 text-white"
                    onClick={() => handleOpenSessionDetail(s.id)}
                  />
                </div>
              )} align="center" style={{ width: '25rem' }} />
            </DataTable>
          </div>
        </div>
      )}

      {/* DIÁLOGO: NUEVO AJUSTE DIRECTO */}
      <Dialog
        header="Crear Solicitud de Ajuste Directo de Inventario"
        visible={newAdjDialogVisible}
        onHide={() => setNewAdjDialogVisible(false)}
        style={{ width: '950px' }}
        className="rounded-2xl"
      >
        <div className="flex flex-col gap-6 py-2">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-xs text-indigo-900 font-medium flex items-center justify-between">
            <div className="flex items-center">
              <i className="pi pi-info-circle text-indigo-600 text-xl mr-3"></i>
              <span>Esta solicitud ingresará en estado <b>PENDIENTE APROBACIÓN</b>. El stock no será modificado hasta que un supervisor o gerente apruebe el documento.</span>
            </div>
          </div>

          {/* Form Header Controls - 2 Rows for Maximum Visual Harmony */}
          <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/80 space-y-4">
            {/* Row 1: Ubicación Físico-Logística */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="h-6 flex items-center">
                  <label className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">1. Sucursal *</label>
                </div>
                <Dropdown
                  value={selectedFacilityId}
                  options={facilities}
                  optionLabel="name"
                  optionValue="id"
                  onChange={e => setSelectedFacilityId(e.value)}
                  placeholder="Seleccione Sucursal"
                  className="w-full text-xs font-bold !rounded-xl"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="h-6 flex items-center">
                  <label className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">2. Almacén *</label>
                </div>
                <Dropdown
                  value={selectedWarehouseId}
                  options={filteredWarehouses}
                  optionLabel="name"
                  optionValue="id"
                  onChange={e => setSelectedWarehouseId(e.value)}
                  placeholder="Seleccione Almacén"
                  className="w-full text-xs font-bold !rounded-xl"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="h-6 flex items-center">
                  <label className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">3. Ubicación / Estante</label>
                </div>
                <Dropdown
                  value={selectedLocationId}
                  options={availableLocations}
                  optionLabel="label"
                  optionValue="value"
                  onChange={e => setSelectedLocationId(e.value)}
                  placeholder="Ubicación General (Opcional)"
                  className="w-full text-xs !rounded-xl"
                  showClear
                />
              </div>
            </div>

            {/* Row 2: Motivo y Sentido */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="h-6 flex items-center justify-between">
                  <label className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">4. Motivo de Ajuste *</label>
                  <button
                    type="button"
                    onClick={() => setQuickReasonDialogVisible(true)}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200/60"
                    title="Crear un motivo rápidamente sin salir"
                  >
                    <i className="pi pi-plus text-[9px]"></i>
                    Nuevo Motivo
                  </button>
                </div>
                <Dropdown
                  value={selectedReasonId}
                  options={reasons}
                  optionLabel="name"
                  optionValue="id"
                  onChange={e => {
                    setSelectedReasonId(e.value);
                    const r = reasons.find(item => item.id === e.value);
                    if (r) setMovementType(r.default_type || 'OUT');
                  }}
                  placeholder="Seleccione Motivo"
                  className="w-full text-xs font-bold !rounded-xl"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="h-6 flex items-center">
                  <label className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">5. Sentido del Ajuste</label>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    label="DESCARGO (-)"
                    icon="pi pi-arrow-down-right"
                    severity={movementType === 'OUT' ? 'danger' : 'secondary'}
                    outlined={movementType !== 'OUT'}
                    onClick={() => setMovementType('OUT')}
                    className="font-bold text-xs flex-1 !rounded-xl py-2"
                  />
                  <Button
                    type="button"
                    label="CARGO (+)"
                    icon="pi pi-arrow-up-right"
                    severity={movementType === 'IN' ? 'success' : 'secondary'}
                    outlined={movementType !== 'IN'}
                    onClick={() => setMovementType('IN')}
                    className="font-bold text-xs flex-1 !rounded-xl py-2"
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Justificación / Observación Full Width */}
            <div className="flex flex-col gap-1.5">
              <div className="h-6 flex items-center">
                <label className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">6. Justificación / Observación (Motivo Detallado)</label>
              </div>
              <InputText
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ej. Mercancía dañada durante traslado en montacargas, se requiere descargo de stock de almacén central..."
                className="text-xs p-inputtext-sm w-full !rounded-xl"
              />
            </div>
          </div>

          {/* Items Table */}
          <div className="space-y-3">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Detalle de Productos a Ajustar</h3>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  label="Pegar Lote (Excel)"
                  icon="pi pi-clipboard"
                  size="small"
                  outlined
                  severity="secondary"
                  className="font-bold text-xs"
                  onClick={() => setBulkPasteDialogVisible(true)}
                  tooltip="Pegar múltiples códigos y cantidades directamente desde Excel"
                  tooltipOptions={{ position: 'top' }}
                />
                <Button
                  type="button"
                  label="Añadir Fila Manual"
                  icon="pi pi-plus"
                  size="small"
                  severity="info"
                  className="font-bold text-xs"
                  onClick={addLine}
                />
              </div>
            </div>

            {/* BARRA DE TRANSCRIPCIÓN RÁPIDA (TECLADO / ESCÁNER SIN USAR MOUSE) */}
            <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-extrabold text-indigo-900 uppercase tracking-wide flex items-center gap-1.5">
                  <i className="pi pi-bolt text-amber-500"></i>
                  Transcripción Rápida (Escáner / Teclado):
                </span>
                <span className="text-indigo-700 font-medium hidden sm:inline">
                  1️⃣ Código + <b>Enter</b> (o <b>F2</b> para buscar) ➔ 2️⃣ Cantidad + <b>Enter</b> para agregar
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                <div className="md:col-span-6 flex items-center gap-1.5">
                  <div className="relative flex-1 min-w-0">
                    <i className={`pi ${adjFastSearching ? 'pi-spin pi-spinner text-indigo-600' : 'pi-barcode text-slate-400'} absolute left-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none z-10`}></i>
                    <InputText
                      ref={adjFastCodeInputRef}
                      value={adjFastCodeInput}
                      onChange={e => {
                        setAdjFastCodeInput(e.target.value);
                        if (adjFastSelectedProd) setAdjFastSelectedProd(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'F2') {
                          e.preventDefault();
                          openF2SearchModal(adjFastCodeInput);
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAdjFastLookup(adjFastCodeInput);
                        }
                      }}
                      placeholder="Código Neo (PRD-...), PLU, Barra + Enter (o F2 Catálogo)..."
                      className="text-xs p-inputtext-sm w-full font-mono !pl-9 bg-white"
                      style={{ paddingLeft: '2.25rem' }}
                    />
                  </div>
                  <Button
                    type="button"
                    label="F2"
                    icon="pi pi-search"
                    size="small"
                    outlined
                    severity="secondary"
                    className="font-mono font-bold text-[11px] shrink-0 bg-white px-2.5"
                    tooltip="Buscador Rápido por Teclado (Tecla F2)"
                    tooltipOptions={{ position: 'top' }}
                    onClick={() => openF2SearchModal(adjFastCodeInput)}
                  />
                </div>

                <div className="md:col-span-3">
                  <div className="flex items-center gap-1.5">
                    <InputNumber
                      ref={adjFastQtyInputRef}
                      value={adjFastQty}
                      onChange={e => {
                        const val = e.value !== null && e.value !== undefined ? Number(e.value) : 1;
                        setAdjFastQty(val);
                        adjFastQtyRef.current = val;
                      }}
                      onValueChange={e => {
                        const val = e.value !== null && e.value !== undefined ? Number(e.value) : 1;
                        setAdjFastQty(val);
                        adjFastQtyRef.current = val;
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const liveInputVal = (e.target as HTMLInputElement)?.value;
                          handleAdjFastAdd(liveInputVal);
                        } else if (e.key === 'F2') {
                          e.preventDefault();
                          openF2SearchModal(adjFastCodeInput);
                        }
                      }}
                      min={adjFastSelectedProd && isWeightUom(adjFastSelectedProd.uom_base) ? 0.001 : 1}
                      minFractionDigits={getUomDecimals(adjFastSelectedProd?.uom_base)}
                      maxFractionDigits={getUomDecimals(adjFastSelectedProd?.uom_base)}
                      step={adjFastSelectedProd && isWeightUom(adjFastSelectedProd.uom_base) ? 0.001 : 1}
                      placeholder="Cant."
                      className="w-full"
                      inputClassName="p-inputtext-sm text-xs font-bold w-full text-right bg-white"
                    />
                    <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-1.5 rounded shrink-0">
                      {adjFastSelectedProd?.uom_base || 'UND'}
                    </span>
                  </div>
                </div>

                <div className="md:col-span-3 flex gap-1.5">
                  <Button
                    type="button"
                    label={adjFastSelectedProd ? "Agregar (Enter)" : "Buscar (Enter)"}
                    icon={adjFastSelectedProd ? "pi pi-check" : "pi pi-search"}
                    size="small"
                    severity={adjFastSelectedProd ? "success" : "info"}
                    loading={adjFastSearching}
                    className="font-bold text-xs w-full"
                    onClick={() => {
                      if (adjFastSelectedProd) {
                        const inputEl = adjFastQtyInputRef.current?.getInput
                          ? adjFastQtyInputRef.current.getInput()
                          : null;
                        handleAdjFastAdd(inputEl?.value);
                      } else {
                        handleAdjFastLookup(adjFastCodeInput);
                      }
                    }}
                  />
                </div>
              </div>

              {adjFastSelectedProd && (
                <div className="flex items-center justify-between bg-white border border-emerald-200 rounded-lg px-3 py-1.5 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-extrabold text-[11px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 shrink-0">
                      {adjFastSelectedProd.sku}
                    </span>
                    <span className="font-bold text-slate-800 truncate">
                      {adjFastSelectedProd.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="text-[11px] font-mono text-slate-600">
                      Costo: <b>${Number(adjFastSelectedProd.cost || 0).toFixed(2)}</b> / {adjFastSelectedProd.uom_base || 'UND'}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Presione Enter en Cantidad para agregar ↵
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full table-fixed text-xs text-left text-slate-700">
                <thead className="bg-slate-100 uppercase text-[10px] font-bold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-[44%]">PRODUCTO / CÓDIGO NEO</th>
                    <th className="p-3 w-[16%] text-center">CANTIDAD</th>
                    <th className="p-3 w-[18%] text-right">COSTO UNITARIO ($)</th>
                    <th className="p-3 w-[15%] text-right">SUBTOTAL ($)</th>
                    <th className="p-3 w-[7%] text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adjLines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400 bg-slate-50/50">
                        <i className="pi pi-box text-3xl mb-2 text-slate-300 block"></i>
                        <p className="font-semibold text-xs text-slate-600">No hay productos agregados a esta solicitud.</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Usa la <b className="text-indigo-600">Barra de Transcripción Rápida</b> arriba o haz clic en <b className="text-indigo-600">+ Añadir Fila Manual</b>.</p>
                      </td>
                    </tr>
                  ) : (
                    adjLines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 min-w-0 overflow-hidden align-middle">
                          <Dropdown
                            value={line.product_variant_id}
                            options={products}
                            optionLabel="label"
                            optionValue="value"
                            onChange={e => updateLine(idx, 'product_variant_id', e.value)}
                            placeholder="Buscar por Código Neo, PLU, Barra o Nombre..."
                            className="w-full max-w-full min-w-0 text-xs"
                            panelStyle={{ maxWidth: '540px' }}
                            virtualScrollerOptions={{ itemSize: 48 }}
                            filter
                            filterBy="label,search_key,sku,name,product_name,barcodes_str"
                            filterMatchMode="contains"
                            onFilter={e => handleProductFilter(e.filter)}
                            valueTemplate={productValueTemplate}
                            itemTemplate={productOptionTemplate}
                            showClear
                          />
                        </td>
                        <td className="p-2 align-middle">
                          <div className="flex items-center gap-1">
                            <InputNumber
                              value={line.quantity}
                              onValueChange={e => updateLine(idx, 'quantity', e.value || 0)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (adjFastCodeInputRef.current) {
                                    adjFastCodeInputRef.current.focus();
                                  } else {
                                    addLine();
                                  }
                                }
                              }}
                              min={isWeightUom(line.uom_base) ? 0.001 : 1}
                              minFractionDigits={getUomDecimals(line.uom_base)}
                              maxFractionDigits={getUomDecimals(line.uom_base)}
                              step={isWeightUom(line.uom_base) ? 0.001 : 1}
                              className="w-full"
                              inputClassName="p-inputtext-sm text-xs font-bold w-full text-right"
                            />
                            <span className="text-[10px] font-bold text-slate-400 shrink-0 w-7 text-right">
                              {line.uom_base || 'UND'}
                            </span>
                          </div>
                        </td>
                        <td className="p-2 align-middle">
                          <InputNumber
                            value={line.unit_cost}
                            onValueChange={e => updateLine(idx, 'unit_cost', e.value || 0)}
                            mode="currency"
                            currency="USD"
                            locale="en-US"
                            className="w-full"
                            inputClassName="p-inputtext-sm text-xs font-bold w-full text-right"
                          />
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-slate-900 align-middle truncate">
                          ${(line.total_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-center align-middle">
                          <Button
                            icon="pi pi-trash"
                            rounded
                            text
                            severity="danger"
                            size="small"
                            onClick={() => removeLine(idx)}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-800">
                  <tr>
                    <td colSpan={3} className="p-3 text-right uppercase text-[11px] tracking-wider">Total General del Ajuste ($):</td>
                    <td className="p-3 text-right font-mono text-base text-indigo-700 font-black">
                      ${calcDraftTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-200">
            <Button
              label="Cancelar"
              outlined
              severity="secondary"
              className="font-bold text-xs"
              onClick={() => setNewAdjDialogVisible(false)}
            />
            <Button
              label="Guardar Solicitud (Pendiente)"
              icon="pi pi-send"
              severity="info"
              loading={savingAdj}
              className="font-bold text-xs bg-indigo-600 border-indigo-600 text-white"
              onClick={saveDirectAdjustment}
            />
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO: PEGADO MASIVO DE PRODUCTOS DESDE EXCEL / TEXTO */}
      <Dialog
        header="📋 Pegar Lote de Productos (Excel / Códigos)"
        visible={bulkPasteDialogVisible}
        onHide={() => setBulkPasteDialogVisible(false)}
        style={{ width: '580px' }}
        className="rounded-2xl"
      >
        <div className="flex flex-col gap-4 py-2 text-xs">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-indigo-900 space-y-1">
            <p className="font-bold">¿Cómo pegar rápido desde Excel o Bloc de Notas?</p>
            <p className="text-[11px] text-indigo-800">
              Copia dos columnas desde Excel (<b>Columna 1: Código Neo / PLU / Código de Barra</b> y <b>Columna 2: Cantidad</b>) y pégalas abajo. Un producto por línea:
            </p>
            <pre className="bg-white/80 border border-indigo-200 rounded p-2 font-mono text-[10px] text-slate-700 mt-1">
{`PRD-3343\t12
003377\t5
7891080148743\t24`}
            </pre>
          </div>

          <textarea
            value={bulkPasteText}
            onChange={e => setBulkPasteText(e.target.value)}
            rows={8}
            placeholder={"Pegue aquí sus líneas (Código y Cantidad)...\nEjemplo:\nPRD-3343  10\n003377    5"}
            className="w-full p-3 border border-slate-300 rounded-xl font-mono text-xs focus:outline-none focus:border-indigo-500"
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <Button
              type="button"
              label="Cancelar"
              outlined
              severity="secondary"
              className="font-bold text-xs"
              onClick={() => setBulkPasteDialogVisible(false)}
            />
            <Button
              type="button"
              label="Procesar y Cargar Productos"
              icon="pi pi-check-circle"
              severity="success"
              loading={processingBulkPaste}
              className="font-bold text-xs"
              onClick={handleBulkPasteProcess}
            />
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO: BUSCADOR RÁPIDO DE CATÁLOGO POR TECLADO (TECLA F2) */}
      <Dialog
        header="🔍 Buscador Rápido de Productos por Teclado (F2)"
        visible={f2SearchDialogVisible}
        onHide={() => {
          setF2SearchDialogVisible(false);
          setTimeout(() => {
            if (adjFastCodeInputRef.current) {
              adjFastCodeInputRef.current.focus();
            }
          }, 50);
        }}
        style={{ width: '680px' }}
        className="rounded-2xl"
      >
        <div className="flex flex-col gap-3 py-1 text-xs">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 flex items-center justify-between text-[11px] text-indigo-800">
            <span>
              Use las flechas <b>↑</b> / <b>↓</b> para desplazarse y presione <b>Enter</b> para seleccionar e ir directo a <b>Cantidad</b>.
            </span>
            <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-indigo-200 text-indigo-700 shrink-0">
              ESC para cerrar
            </span>
          </div>

          <div className="relative">
            <i className={`pi ${f2Loading ? 'pi-spin pi-spinner text-indigo-600' : 'pi-search text-slate-400'} absolute left-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none z-10`}></i>
            <InputText
              ref={f2InputRef}
              value={f2SearchQuery}
              onChange={e => {
                const val = e.target.value;
                setF2SearchQuery(val);
                if (f2SearchTimeoutRef.current) clearTimeout(f2SearchTimeoutRef.current);
                f2SearchTimeoutRef.current = setTimeout(() => {
                  runF2Search(val);
                }, 180);
              }}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setF2SelectedIndex(prev =>
                    f2SearchResults.length > 0 ? Math.min(prev + 1, f2SearchResults.length - 1) : 0
                  );
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setF2SelectedIndex(prev => Math.max(prev - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const chosen = f2SearchResults[f2SelectedIndex];
                  if (chosen) {
                    setF2SearchDialogVisible(false);
                    selectProductForFastEntry(chosen);
                  }
                }
              }}
              placeholder="Escriba nombre del producto, código Neo (PRD-...), PLU o código de barra..."
              className="text-xs p-inputtext-sm w-full font-mono !pl-9"
              style={{ paddingLeft: '2.25rem' }}
            />
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[340px] overflow-y-auto divide-y divide-slate-100">
            {f2SearchResults.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                {f2Loading ? 'Buscando en el catálogo maestro...' : 'No se encontraron productos coincidentes.'}
              </div>
            ) : (
              f2SearchResults.map((item, idx) => {
                const isSelected = idx === f2SelectedIndex;
                return (
                  <div
                    key={item.value}
                    onClick={() => {
                      setF2SearchDialogVisible(false);
                      selectProductForFastEntry(item);
                    }}
                    onMouseEnter={() => setF2SelectedIndex(idx)}
                    className={`flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors ${
                      isSelected ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span
                        className={`font-mono font-extrabold text-[11px] px-2 py-0.5 rounded border shrink-0 ${
                          isSelected
                            ? 'bg-white text-indigo-700 border-white'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}
                      >
                        {item.sku}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={`font-bold text-xs truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                          {item.name}
                        </div>
                        {item.barcodes_str && (
                          <div className={`text-[10px] font-mono truncate ${isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>
                            Barras/PLU: {item.barcodes_str}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span
                        className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                          isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        ${Number(item.cost || 0).toFixed(2)} / {item.uom_base || 'UND'}
                      </span>
                      {isSelected && (
                        <span className="text-[10px] font-bold bg-emerald-400 text-slate-950 px-1.5 py-0.5 rounded">
                          Enter ↵
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO: VER Y APROBAR / RECHAZAR AJUSTE */}
      <Dialog
        header={`Solicitud de Ajuste Directo: ${selectedAdj?.number || ''}`}
        visible={viewAdjDialogVisible}
        onHide={() => setViewAdjDialogVisible(false)}
        style={{ width: '850px' }}
        className="rounded-2xl"
      >
        {selectedAdj && (
          <div className="flex flex-col gap-6 py-2 text-xs">
            {/* Header info - Audit Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 font-bold uppercase block text-[10px]">SUCURSAL / ALMACÉN</span>
                <span className="font-bold text-slate-800 block mt-0.5">{selectedAdj.facility_name}</span>
                <span className="text-[11px] text-slate-500 font-medium">{selectedAdj.warehouse_name} ({selectedAdj.location_name})</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase block text-[10px]">MOTIVO DE AJUSTE</span>
                <span className="font-bold text-indigo-700 block mt-0.5">{selectedAdj.reason_name}</span>
                <Tag 
                  value={selectedAdj.movement_type === 'IN' ? 'CARGO (+)' : 'DESCARGO (-)'} 
                  severity={selectedAdj.movement_type === 'IN' ? 'success' : 'danger'} 
                  className="font-bold text-[9px] px-1.5 py-0.2 mt-1" 
                />
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase block text-[10px]">ESTADO</span>
                <Tag severity={getAdjStateSeverity(selectedAdj.state)} value={getAdjStateText(selectedAdj.state)} className="font-bold text-[10px] px-2 py-0.5 mt-1 block w-fit" />
              </div>
              <div className="border-t border-slate-200/80 pt-2">
                <span className="text-slate-400 font-bold uppercase block text-[10px]">REGISTRADO POR</span>
                <span className="font-bold text-slate-800 block mt-0.5">{selectedAdj.created_by_name}</span>
                <span className="text-[11px] text-slate-500 block font-mono">
                  {selectedAdj.created_at ? new Date(selectedAdj.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}
                </span>
              </div>
              <div className="border-t border-slate-200/80 pt-2 col-span-2">
                <span className="text-slate-400 font-bold uppercase block text-[10px]">AUDITORÍA DE APROBACIÓN</span>
                {selectedAdj.state === 'APPROVED' ? (
                  <div className="mt-0.5 text-emerald-700 font-bold flex items-center gap-1.5">
                    <i className="pi pi-check-circle text-emerald-600"></i>
                    <span>Aprobado por <b>{selectedAdj.approved_by_name || 'Supervisor'}</b> {selectedAdj.approved_at ? `el ${new Date(selectedAdj.approved_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</span>
                  </div>
                ) : selectedAdj.state === 'REJECTED' ? (
                  <div className="mt-0.5 text-rose-700 font-bold flex items-center gap-1.5">
                    <i className="pi pi-times-circle text-rose-600"></i>
                    <span>Rechazado por <b>{selectedAdj.approved_by_name || 'Supervisor'}</b></span>
                  </div>
                ) : (
                  <span className="text-amber-600 font-semibold italic block mt-0.5">⏳ Pendiente por revisión de supervisión</span>
                )}
              </div>
            </div>

            {selectedAdj.notes && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-slate-700 italic">
                <b>Observaciones:</b> "{selectedAdj.notes}"
              </div>
            )}

            {/* Lines Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-100 uppercase text-[10px] font-bold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3">SKU</th>
                    <th className="p-3">PRODUCTO</th>
                    <th className="p-3 text-right">CANTIDAD</th>
                    <th className="p-3 text-right">COSTO UNIT. ($)</th>
                    <th className="p-3 text-right">SUBTOTAL ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(selectedAdj.lines || []).map((line: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-slate-700">{line.sku}</td>
                      <td className="p-3 font-bold text-slate-800">{line.product_name}</td>
                      <td className="p-3 text-right font-bold text-slate-800">{line.quantity}</td>
                      <td className="p-3 text-right font-mono text-slate-700">${(line.unit_cost || 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">${(line.total_value || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200 font-bold">
                  <tr>
                    <td colSpan={4} className="p-3 text-right uppercase text-[11px] tracking-wider">TOTAL GENERAL DEL AJUSTE ($):</td>
                    <td className="p-3 text-right font-mono text-sm text-indigo-700 font-black">${(selectedAdj.total_amount || 0).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Approval Controls */}
            {selectedAdj.state === 'PENDING' ? (
              <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                <Button
                  label="Rechazar Ajuste"
                  icon="pi pi-times"
                  severity="danger"
                  outlined
                  loading={processingApprove}
                  className="font-bold text-xs"
                  onClick={() => handleRejectAdj(selectedAdj.id)}
                />
                <Button
                  label="Aprobar Ajuste (Supervisor)"
                  icon="pi pi-check-circle"
                  severity="success"
                  loading={processingApprove}
                  className="font-bold text-xs bg-emerald-600 border-emerald-600 text-white shadow-md"
                  onClick={() => handleApproveAdj(selectedAdj.id)}
                />
              </div>
            ) : (
              <div className="text-right text-slate-500 font-medium text-xs pt-2">
                {selectedAdj.state === 'APPROVED' ? (
                  <span>✅ Aprobado por <b>{selectedAdj.approved_by_name || 'Supervisor'}</b> en fecha {selectedAdj.approved_at ? new Date(selectedAdj.approved_at).toLocaleString() : ''}</span>
                ) : (
                  <span>❌ Rechazado por <b>{selectedAdj.approved_by_name || 'Supervisor'}</b></span>
                )}
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* DIÁLOGO: CATÁLOGO DE MOTIVOS DE AJUSTE */}
      <Dialog
        header="Catálogo de Motivos de Ajuste & Cuentas Contables"
        visible={reasonsDialogVisible}
        onHide={() => setReasonsDialogVisible(false)}
        style={{ width: '700px' }}
        className="rounded-2xl"
      >
        <div className="flex flex-col gap-6 py-2 text-xs">
          {/* Create new reason form */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800 uppercase text-[11px] tracking-wider">Añadir Nuevo Motivo de Ajuste</h4>
            <div className="grid grid-cols-2 gap-3">
              <InputText
                value={newReasonCode}
                onChange={e => setNewReasonCode(e.target.value)}
                placeholder="Código (Ej. MERMA_02)"
                className="text-xs p-inputtext-sm font-mono font-bold uppercase"
              />
              <InputText
                value={newReasonName}
                onChange={e => setNewReasonName(e.target.value)}
                placeholder="Nombre (Ej. Rotura en Transporte)"
                className="text-xs p-inputtext-sm"
              />
              <Dropdown
                value={newReasonType}
                options={[{ label: 'Descargo (-) Salida', value: 'OUT' }, { label: 'Cargo (+) Entrada', value: 'IN' }]}
                optionLabel="label"
                optionValue="value"
                onChange={e => setNewReasonType(e.value)}
                className="text-xs"
              />
              <InputText
                value={newReasonAccount}
                onChange={e => setNewReasonAccount(e.target.value)}
                placeholder="Cuenta Contable (Ej. 6.1.02.05)"
                className="text-xs p-inputtext-sm font-mono"
              />
            </div>
            <div className="text-right">
              <Button
                label="Guardar Motivo"
                icon="pi pi-plus"
                size="small"
                severity="info"
                className="font-bold text-xs"
                onClick={handleCreateReason}
              />
            </div>
          </div>

          {/* List of Reasons */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left text-slate-700">
              <thead className="bg-slate-100 uppercase text-[10px] font-bold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="p-3">CÓDIGO</th>
                  <th className="p-3">MOTIVO DE AJUSTE</th>
                  <th className="p-3">TIPO</th>
                  <th className="p-3">CUENTA CONTABLE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reasons.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-slate-800">{r.code}</td>
                    <td className="p-3 font-bold text-slate-800">{r.name}</td>
                    <td className="p-3">
                      <Tag severity={r.default_type === 'IN' ? 'success' : 'danger'} value={r.default_type === 'IN' ? 'Cargo (+)' : 'Descargo (-)'} className="text-[9px] font-bold" />
                    </td>
                    <td className="p-3 font-mono text-slate-600">{r.account_code || 'Por Asignar'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO: NUEVA TOMA FÍSICA MASIVA */}
      <Dialog
        header="Crear Nueva Toma Física de Inventario"
        visible={newSessionDialogVisible}
        onHide={() => setNewSessionDialogVisible(false)}
        style={{ width: '550px' }}
        className="rounded-2xl"
      >
        <div className="flex flex-col gap-4 py-2 text-xs">
          <div className="flex flex-col gap-1">
            <label className="font-bold text-slate-700">Nombre de la Toma / Conteo *</label>
            <InputText
              value={sessionName}
              onChange={e => setSessionName(e.target.value)}
              placeholder="Ej. Conteo Cíclico Abarrotes / Anual Total 2026"
              className="text-xs p-inputtext-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="font-bold text-slate-700">Sucursal *</label>
              <Dropdown
                value={sessionFacilityId}
                options={facilities}
                optionLabel="name"
                optionValue="id"
                onChange={e => {
                  setSessionFacilityId(e.value);
                  setSessionWarehouseId(null);
                }}
                placeholder="Seleccione Sucursal"
                className="text-xs"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-bold text-slate-700">Almacén / Depósito *</label>
              <Dropdown
                value={sessionWarehouseId}
                options={warehouses.filter(w => !sessionFacilityId || w.facility_id === sessionFacilityId)}
                optionLabel="name"
                optionValue="id"
                onChange={e => {
                  setSessionWarehouseId(e.value);
                  setSessionLocationId(null);
                }}
                placeholder="Seleccione Almacén"
                className="text-xs font-bold"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-bold text-slate-700">Tipo de Toma Física *</label>
            <Dropdown
              value={sessionScopeType}
              options={[
                { label: '🏬 CONTEO GENERAL (Total Almacén - No contados bajan a 0)', value: 'GENERAL' },
                { label: '📍 CONTEO CÍCLICO / PARCIAL (Filtros Combinados)', value: 'CYCLIC' }
              ]}
              optionLabel="label"
              optionValue="value"
              onChange={e => {
                setSessionScopeType(e.value);
                if (e.value === 'GENERAL') {
                  setSessionCategoryId(null);
                  setSessionLocationId(null);
                }
              }}
              className="text-xs font-bold"
            />
          </div>

          {sessionScopeType === 'CYCLIC' && (
            <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-200 space-y-3">
              <h5 className="font-bold text-amber-900 text-xs uppercase tracking-wider">🎯 Filtros de Alcance Cíclico (Opcionales / Combinables)</h5>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-amber-900 text-[11px]">Categoría Jerárquica (Opcional)</label>
                  <TreeSelect
                    value={sessionCategoryId ? String(sessionCategoryId) : null}
                    options={categoriesTree}
                    onChange={e => setSessionCategoryId(e.value ? Number(e.value) : null)}
                    placeholder="Todas las categorías (desplegable)..."
                    filter
                    filterBy="label,rawName,fullPath"
                    filterMode="lenient"
                    nodeTemplate={categoryTreeNodeTemplate}
                    valueTemplate={categoryTreeValueTemplate}
                    showClear
                    className="text-xs w-full"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-bold text-amber-900 text-[11px]">Estante / Ubicación (Opcional)</label>
                  <Dropdown
                    value={sessionLocationId}
                    options={sessionAvailableLocations}
                    onChange={e => setSessionLocationId(e.value)}
                    placeholder={sessionWarehouseId ? "Todas las ubicaciones internas..." : "Seleccione primero un almacén..."}
                    disabled={!sessionWarehouseId}
                    filter
                    showClear
                    className="text-xs"
                  />
                </div>
              </div>

              <span className="text-[10px] text-amber-800 font-medium block">
                💡 **Combinación WMS:** Puedes dejar ambos en blanco (para contar todo el almacén por partes) o elegir una Categoría (incluye subcategorías descendientes) y/o Estante específico.
              </span>
            </div>
          )}

          <div className="flex flex-col gap-1.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Modalidad de Conteo en Piso
            </label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={() => setSessionIsBlindCount(true)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                  sessionIsBlindCount
                    ? 'bg-blue-50/80 border-blue-500 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                    <span>👁️</span> Conteo Ciego
                  </span>
                  {sessionIsBlindCount && <i className="pi pi-check text-blue-600 text-xs font-bold"></i>}
                </div>
                <p className="text-[10px] text-slate-500 leading-tight m-0">
                  Oculta existencias en PDA y planillas. Máxima imparcialidad.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSessionIsBlindCount(false)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                  !sessionIsBlindCount
                    ? 'bg-emerald-50/80 border-emerald-500 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                    <span>📋</span> Conteo Guiado
                  </span>
                  {!sessionIsBlindCount && <i className="pi pi-check text-emerald-600 text-xs font-bold"></i>}
                </div>
                <p className="text-[10px] text-slate-500 leading-tight m-0">
                  Muestra existencias esperadas en PDA y planillas para agilizar.
                </p>
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-slate-200">
            <Button label="Cancelar" outlined severity="secondary" className="font-bold text-xs" onClick={() => setNewSessionDialogVisible(false)} />
            <Button label="Crear Sesión (Snapshot Teórico)" icon="pi pi-check" loading={creatingSession} className="font-bold text-xs bg-indigo-600 border-indigo-600 text-white shadow-md" onClick={createSession} />
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO RÁPIDO: CREAR MOTIVO IN-LINE */}
      <Dialog
        header="⚡ Crear Nuevo Motivo de Ajuste (In-Line)"
        visible={quickReasonDialogVisible}
        onHide={() => setQuickReasonDialogVisible(false)}
        style={{ width: '520px' }}
        className="rounded-2xl"
      >
        <div className="flex flex-col gap-4 py-2 text-xs">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-indigo-900 font-medium">
            Al guardar, este nuevo motivo se seleccionará automáticamente en la solicitud actual sin perder tus productos cargados.
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-bold text-slate-700">Código del Motivo *</label>
            <InputText
              value={quickReasonCode}
              onChange={e => setQuickReasonCode(e.target.value)}
              placeholder="Ej. DAÑO_TRANSPORTE, MERMA_MUELE"
              className="text-xs p-inputtext-sm font-mono font-bold uppercase"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-bold text-slate-700">Nombre Descriptivo *</label>
            <InputText
              value={quickReasonName}
              onChange={e => setQuickReasonName(e.target.value)}
              placeholder="Ej. Daños durante Transporte / Estibado"
              className="text-xs p-inputtext-sm"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-bold text-slate-700">Tipo Predeterminado</label>
            <Dropdown
              value={quickReasonType}
              options={[{ label: 'Descargo (-) Salida', value: 'OUT' }, { label: 'Cargo (+) Entrada', value: 'IN' }]}
              optionLabel="label"
              optionValue="value"
              onChange={e => setQuickReasonType(e.value)}
              className="text-xs font-bold"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-bold text-slate-700">Cuenta Contable Asociada (Opcional)</label>
            <InputText
              value={quickReasonAccount}
              onChange={e => setQuickReasonAccount(e.target.value)}
              placeholder="Ej. 6.1.02.05"
              className="text-xs p-inputtext-sm font-mono"
            />
          </div>

          <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-slate-200">
            <Button label="Cancelar" outlined severity="secondary" className="font-bold text-xs" onClick={() => setQuickReasonDialogVisible(false)} />
            <Button label="Guardar y Seleccionar" icon="pi pi-check" loading={savingQuickReason} className="font-bold text-xs bg-indigo-600 border-indigo-600 text-white" onClick={handleCreateQuickReason} />
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO PRINCIPAL: GESTIÓN DE CONTEO CIEGO & CONCILIACIÓN DE TOMA FÍSICA EN 3 FASES */}
      <Dialog
        header={selectedSession ? `📋 Gestión de Toma Física: ${selectedSession.name}` : 'Toma Física'}
        visible={manageSessionDialogVisible}
        onHide={() => setManageSessionDialogVisible(false)}
        style={{ width: '1280px', maxWidth: '96vw' }}
        className="rounded-2xl"
      >
        {selectedSession && (
          <div className="flex flex-col gap-6 py-2">
            {/* FASE STEPPER / HEADER INFO BAR */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-wrap justify-between items-center gap-4">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">CÓDIGO SESIÓN</span>
                  <span className="text-sm font-mono font-bold text-slate-800">SES-{selectedSession.id}</span>
                </div>
                <div className="h-8 w-[1px] bg-slate-200"></div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">FECHA INICIO</span>
                  <span className="text-xs font-medium text-slate-700">{selectedSession.date_start ? new Date(selectedSession.date_start).toLocaleString('es-ES') : ''}</span>
                </div>
                <div className="h-8 w-[1px] bg-slate-200"></div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">FASE DE PROCESO</span>
                  <Tag
                    severity={selectedSession.state === 'DONE' ? 'success' : selectedSession.state === 'REVIEW' ? 'info' : 'warning'}
                    value={
                      selectedSession.state === 'DONE'
                        ? 'FASE 3: CONCILIADO & CERRADO'
                        : selectedSession.state === 'REVIEW'
                        ? 'FASE 2: ANÁLISIS & COTEJO (IA)'
                        : selectedSession.is_blind_count === false
                        ? 'FASE 1: CONTEO GUIADO (Captura)'
                        : 'FASE 1: CONTEO CIEGO (Captura)'
                    }
                    className="font-bold text-[9px] px-2 py-1 mt-0.5"
                  />
                </div>
                <div className="h-8 w-[1px] bg-slate-200"></div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">MODALIDAD</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-md inline-block mt-0.5 ${selectedSession.is_blind_count === false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                    {selectedSession.is_blind_count === false ? '📋 Conteo Guiado' : '👁️ Conteo Ciego'}
                  </span>
                </div>
              </div>

              {/* BOTONES DE TRANSICIÓN DE FASE Y PLANILLA */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  label="🖨️ Imprimir / Excel Planilla de esta Toma"
                  icon="pi pi-print"
                  outlined
                  size="small"
                  className="font-bold text-xs border-slate-300 text-slate-800 bg-white hover:bg-slate-50"
                  onClick={() => openSessionCountSheet(selectedSession)}
                />

                {selectedSession.state === 'IN_PROGRESS' && (
                  <Button
                    label="🔒 Finalizar Conteo Ciego y Pasar a Análisis de Cotejo (Fase 2)"
                    icon="pi pi-arrow-right"
                    severity="info"
                    className="font-bold text-xs bg-indigo-600 border-indigo-600 text-white shadow-md hover:bg-indigo-700"
                    onClick={() => handleAdvancePhase('REVIEW')}
                  />
                )}

                {selectedSession.state === 'REVIEW' && (
                  <>
                    <Button
                      label="🔓 Reabrir Conteo Ciego"
                      icon="pi pi-lock-open"
                      outlined
                      severity="warning"
                      className="font-bold text-xs"
                      onClick={() => handleAdvancePhase('IN_PROGRESS')}
                    />
                    <Button
                      label="✅ Consolidar & Generar Ajustes Automáticos (Fase 3)"
                      icon="pi pi-check-circle"
                      severity="success"
                      loading={validatingSession}
                      className="font-bold text-xs bg-emerald-600 border-emerald-600 text-white shadow-md hover:bg-emerald-700"
                      onClick={() => handleValidateSession(selectedSession.id)}
                    />
                  </>
                )}
              </div>
            </div>

            {/* FICHA INMUTABLE DE CONFIGURACIÓN Y PARÁMETROS DEL CONTEO */}
            <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100/70 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold">
                    <i className="pi pi-lock text-xs"></i>
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      Ficha de Configuración de la Toma Física
                      <span className="text-[10px] text-slate-400 font-normal">| Parámetros Iniciales de Apertura</span>
                    </h5>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase bg-slate-200/80 text-slate-700 border border-slate-300">
                    <i className="pi pi-lock text-[9px] text-slate-500"></i> Parámetros Inmutables
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {/* 1. Alcance Operativo */}
                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    1. Alcance de Toma
                  </span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    {selectedSession.scope_type === 'CYCLIC' || selectedSession.scope_type === 'CATEGORY' ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                        <i className="pi pi-tags text-xs"></i> Conteo Cíclico por Categoría
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-indigo-700 font-bold">
                        <i className="pi pi-box text-xs"></i> Conteo General de Almacén
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    {selectedSession.lines?.length || 0} SKUs registrados en sesión
                  </span>
                </div>

                {/* 2. Sucursal y Almacén */}
                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    2. Centro / Sucursal
                  </span>
                  <div className="font-bold text-slate-800 truncate" title={selectedSession.facility_name || `Sucursal #${selectedSession.facility_id}`}>
                    🏢 {selectedSession.facility_name || (facilities.find(f => f.id === selectedSession.facility_id)?.name) || `Sucursal #${selectedSession.facility_id}`}
                  </div>
                  <span className="text-[11px] text-slate-500 block truncate mt-0.5" title={selectedSession.warehouse_name || 'Almacén General'}>
                    📦 {selectedSession.warehouse_name || (warehouses.find(w => w.id === selectedSession.warehouse_id)?.name) || 'Almacén General'}
                  </span>
                </div>

                {/* 3. Ubicación o Estante */}
                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    3. Ubicación / Estante
                  </span>
                  <div className="font-bold text-slate-800 truncate">
                    📍 {selectedSession.location_name || (() => {
                      for (const wh of locationsTree) {
                        const found = (wh.locations || []).find((l: any) => l.id === selectedSession.location_id);
                        if (found) return `[${found.code || 'LOC'}] ${found.name}`;
                      }
                      return 'Todas las ubicaciones internas';
                    })()}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Filtro físico de pasillo
                  </span>
                </div>

                {/* 4. Categoría Jerárquica */}
                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    4. Jerarquía de Categoría
                  </span>
                  {selectedSession.category_full_path || selectedSession.category_name ? (
                    <div>
                      <div className="font-bold text-amber-900 truncate" title={selectedSession.category_full_path || selectedSession.category_name}>
                        🏷️ {selectedSession.category_name || selectedSession.category_full_path?.split(' > ').pop()}
                      </div>
                      {selectedSession.category_full_path && (
                        <div className="text-[10px] text-amber-700 font-mono mt-0.5 line-clamp-2" title={selectedSession.category_full_path}>
                          {selectedSession.category_full_path}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-400 italic">Sin filtro categórico</span>
                  )}
                </div>
              </div>
            </div>

            {/* PANEL ASISTENTE IA DE AUDITORÍA (Fase 2 & Fase 3) */}
            {(selectedSession.state === 'REVIEW' || selectedSession.state === 'DONE') && (
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 rounded-2xl border border-indigo-500/30 text-white shadow-lg space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="flex h-3 w-3 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                    </span>
                    <h4 className="font-extrabold text-xs tracking-wider uppercase text-indigo-300">
                      🤖 Asistente IA de Auditoría WMS
                    </h4>
                  </div>
                  <Button
                    label="Re-analizar con IA"
                    icon="pi pi-refresh"
                    size="small"
                    loading={loadingAiAudit}
                    className="font-bold text-[10px] p-button-text text-indigo-300"
                    onClick={() => handleRunAIAudit(selectedSession.id)}
                  />
                </div>

                {aiAuditResult ? (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                    <div className="bg-white/10 p-3 rounded-xl backdrop-blur-md">
                      <span className="text-[10px] text-slate-300 block uppercase">PRECISIÓN IRA %</span>
                      <span className="text-xl font-black text-emerald-400">{aiAuditResult.accuracy_pct}%</span>
                    </div>
                    <div className="bg-white/10 p-3 rounded-xl backdrop-blur-md">
                      <span className="text-[10px] text-slate-300 block uppercase">ANOMALÍAS DETECTADAS</span>
                      <span className={`text-xl font-black ${aiAuditResult.anomalies_count > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {aiAuditResult.anomalies_count} SKUs
                      </span>
                    </div>
                    <div className="md:col-span-2 bg-white/5 p-3 rounded-xl border border-white/10 text-xs font-medium leading-relaxed">
                      {aiAuditResult.ai_recommendation}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs italic text-slate-400">Analizando discrepancias de inventario con algoritmos predictivos...</div>
                )}
              </div>
            )}

            {/* FASE 1: INGRESO RÁPIDO DE CONTEO CIEGO */}
            {selectedSession.state === 'IN_PROGRESS' && (
              <div className="bg-indigo-50/60 border border-indigo-200/80 p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-indigo-950 uppercase tracking-wider flex items-center">
                    <i className="pi pi-eye-slash text-indigo-600 mr-2"></i>Fase 1: Transcripción / Conteo Ciego (Blind Count)
                  </h4>
                  <span className="text-[10px] text-indigo-600 font-medium">🙈 Las cantidades teóricas están ocultas para preservar la imparcialidad del operador.</span>
                </div>

                {/* Banner de Alcance de Conteo Cíclico */}
                {isSessionCategoryScoped && (
                  <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2.5 w-2.5 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                      </span>
                      <span className="font-bold text-amber-900">
                        🎯 Conteo Cíclico Filtrado por Categoría: &quot;{selectedSession.category_full_path || selectedSession.category_name || 'HARINAS'}&quot;
                      </span>
                      <span className="text-amber-800 bg-amber-100/90 border border-amber-200 px-2 py-0.5 rounded font-mono font-bold text-[11px]">
                        {loadingSessionProducts ? 'Cargando catálogo...' : `${availableCountingProducts.length} productos habilitados`}
                      </span>
                    </div>
                    {availableCountingProducts.length === 0 && !loadingSessionProducts && (
                      <span className="text-rose-600 font-bold text-[11px] flex items-center gap-1">
                        <i className="pi pi-exclamation-triangle"></i>
                        No hay productos registrados en esta categoría o sus subcategorías.
                      </span>
                    )}
                  </div>
                )}

                {/* Buscador Rápido por Código de Barras / Escáner */}
                <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-sm flex flex-col sm:flex-row items-center gap-3">
                  <div className="flex items-center gap-2 text-indigo-700 text-xs font-bold shrink-0">
                    <i className="pi pi-barcode text-base"></i>
                    <span>Escanear Código / Barra:</span>
                  </div>
                  <div className="relative flex-1 w-full">
                    <i className="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none z-10"></i>
                    <InputText
                      ref={countingBarcodeInputRef}
                      value={countingBarcodeInput}
                      onChange={e => setCountingBarcodeInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleBarcodeScanOrLookup(countingBarcodeInput);
                        }
                      }}
                      placeholder={
                        isSessionCategoryScoped
                          ? `Escanee código de barra de ${selectedSession.category_name || 'la categoría'}...`
                          : "Escanee con pistola o ingrese cualquier código (PRD-..., PLU, EAN, DUN) y presione Enter..."
                      }
                      className="text-xs p-inputtext-sm w-full font-mono !pl-9"
                      style={{ paddingLeft: '2.25rem' }}
                    />
                  </div>
                  <Button
                    label="Buscar"
                    icon="pi pi-search"
                    size="small"
                    outlined
                    className="font-bold text-xs shrink-0"
                    onClick={() => handleBarcodeScanOrLookup(countingBarcodeInput)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                  <div className="md:col-span-2 flex flex-col gap-1 min-w-0">
                    <label className="text-[11px] font-bold text-slate-700">
                      Producto / Código Neo *
                      {isSessionCategoryScoped && (
                        <span className="text-amber-700 font-semibold text-[10px] ml-2">
                          (Solo {selectedSession.category_name || 'categoría'})
                        </span>
                      )}
                    </label>
                    <Dropdown
                      value={countingProdId}
                      options={availableCountingProducts}
                      optionLabel="label"
                      optionValue="value"
                      onChange={e => {
                        setCountingProdId(e.value);
                        setTimeout(() => {
                          if (countingQtyInputRef.current) {
                            const inputEl = countingQtyInputRef.current.getInput ? countingQtyInputRef.current.getInput() : countingQtyInputRef.current;
                            if (inputEl && inputEl.focus) {
                              inputEl.focus();
                              if (inputEl.select) inputEl.select();
                            }
                          }
                        }, 60);
                      }}
                      placeholder={
                        loadingSessionProducts
                          ? "Cargando catálogo de la categoría..."
                          : isSessionCategoryScoped
                          ? `Buscar en ${selectedSession.category_name || 'categoría'} (${availableCountingProducts.length} productos)...`
                          : "Buscar por Código Neo, PLU, Barra o Nombre..."
                      }
                      disabled={loadingSessionProducts}
                      filter
                      filterBy="label,search_key,sku,name,barcodes_str"
                      filterMatchMode="contains"
                      onFilter={e => {
                        if (!isSessionCategoryScoped) handleProductFilter(e.filter);
                      }}
                      virtualScrollerOptions={{ itemSize: 48 }}
                      valueTemplate={productValueTemplate}
                      itemTemplate={productOptionTemplate}
                      showClear
                      className="text-xs w-full max-w-full min-w-0"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-700">
                      Cantidad Contada Real * {countingProdId && `(${availableCountingProducts.find(p => p.value === countingProdId)?.uom_base || 'UND'})`}
                    </label>
                    <InputNumber
                      ref={countingQtyInputRef}
                      value={countingQty}
                      onChange={e => {
                        const prod = availableCountingProducts.find(p => p.value === countingProdId);
                        setCountingQty(sanitizeQuantity(e.value || 0, prod?.uom_base));
                      }}
                      onValueChange={e => {
                        const prod = availableCountingProducts.find(p => p.value === countingProdId);
                        setCountingQty(sanitizeQuantity(e.value || 0, prod?.uom_base));
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const liveInputVal = (e.target as HTMLInputElement)?.value;
                          handleRecordCount(liveInputVal);
                        }
                      }}
                      min={0}
                      minFractionDigits={getUomDecimals(availableCountingProducts.find(p => p.value === countingProdId)?.uom_base)}
                      maxFractionDigits={getUomDecimals(availableCountingProducts.find(p => p.value === countingProdId)?.uom_base)}
                      step={isWeightUom(availableCountingProducts.find(p => p.value === countingProdId)?.uom_base) ? 0.001 : 1}
                      className="text-xs w-full p-inputtext-sm font-bold"
                    />
                  </div>


                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-700">Planilla / Hoja #</label>
                    <InputText
                      value={countingSheetNo}
                      onChange={e => setCountingSheetNo(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleRecordCount();
                        }
                      }}
                      placeholder="Ej. PL-014"
                      className="text-xs p-inputtext-sm font-mono"
                    />
                  </div>

                  <Button
                    label="Guardar Conteo (Enter)"
                    icon="pi pi-save"
                    loading={savingCount}
                    className="font-bold text-xs bg-indigo-600 border-indigo-600 text-white shadow-md h-[38px]"
                    onClick={() => handleRecordCount()}
                  />
                </div>
              </div>
            )}

            {/* BARRA DE ASIGNACIÓN MASIVA DE MOTIVOS DE AJUSTE (FASE 2) */}
            {selectedSession.state === 'REVIEW' && (
              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                      <i className="pi pi-tags"></i>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 m-0 uppercase tracking-wide">
                        Clasificación Contable & Motivos de Ajuste (Fase 2)
                      </h4>
                      <p className="text-[11px] text-slate-500 m-0">
                        Asigne individualmente o de forma masiva el motivo de ajuste (mermas, averías, hurtos, sobrantes) antes de consolidar.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  {/* Faltantes (OUT) */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-rose-50/70 p-2.5 rounded-xl border border-rose-200/70">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                      <span className="text-[11px] font-bold text-rose-900 uppercase">Faltantes (-):</span>
                    </div>
                    <Dropdown
                      value={batchReasonOut}
                      onChange={(e) => setBatchReasonOut(e.value)}
                      options={reasons.filter(r => r.default_type === 'OUT' || !r.default_type)}
                      optionLabel="name"
                      optionValue="id"
                      itemTemplate={(opt) => (
                        <div className="flex items-center justify-between gap-2 text-xs py-0.5">
                          <span className="font-semibold text-slate-800">{opt.name}</span>
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                            {opt.code}
                          </span>
                        </div>
                      )}
                      valueTemplate={(opt) => opt ? (
                        <span className="text-xs font-semibold text-slate-800 truncate">
                          [{opt.code}] {opt.name}
                        </span>
                      ) : <span className="text-xs text-slate-400">Seleccionar motivo...</span>}
                      placeholder="Motivo para faltantes..."
                      className="text-xs p-inputtext-sm flex-1 bg-white"
                    />
                    <Button
                      label="Aplicar a Faltantes"
                      icon="pi pi-check"
                      size="small"
                      severity="danger"
                      loading={savingBatchReasons}
                      onClick={() => handleBatchAssignReasons('OUT')}
                      className="text-[11px] font-bold shrink-0 h-[34px]"
                    />
                  </div>

                  {/* Sobrantes (IN) */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200/70">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      <span className="text-[11px] font-bold text-emerald-900 uppercase">Sobrantes (+):</span>
                    </div>
                    <Dropdown
                      value={batchReasonIn}
                      onChange={(e) => setBatchReasonIn(e.value)}
                      options={reasons.filter(r => r.default_type === 'IN' || !r.default_type)}
                      optionLabel="name"
                      optionValue="id"
                      itemTemplate={(opt) => (
                        <div className="flex items-center justify-between gap-2 text-xs py-0.5">
                          <span className="font-semibold text-slate-800">{opt.name}</span>
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                            {opt.code}
                          </span>
                        </div>
                      )}
                      valueTemplate={(opt) => opt ? (
                        <span className="text-xs font-semibold text-slate-800 truncate">
                          [{opt.code}] {opt.name}
                        </span>
                      ) : <span className="text-xs text-slate-400">Seleccionar motivo...</span>}
                      placeholder="Motivo para sobrantes..."
                      className="text-xs p-inputtext-sm flex-1 bg-white"
                    />
                    <Button
                      label="Aplicar a Sobrantes"
                      icon="pi pi-check"
                      size="small"
                      severity="success"
                      loading={savingBatchReasons}
                      onClick={() => handleBatchAssignReasons('IN')}
                      className="text-[11px] font-bold shrink-0 h-[34px]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN DE MATRIZ DE TABLA DE REGISTROS */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center">
                  <i className="pi pi-table text-slate-500 mr-2"></i>
                  {selectedSession.state === 'IN_PROGRESS' ? 'Registros de Conteo Ciego' : 'Matriz de Conciliación & Cotejo de Inventario'}
                </h4>
                <span className="text-xs text-slate-500 font-medium">Total Renglones: <b>{selectedSession.lines?.length || 0}</b></span>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-xs text-left text-slate-700">
                  <thead className="bg-slate-100 uppercase text-[10px] font-bold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="p-3">PRODUCTO / SKU</th>
                      <th className="p-3 text-right">CANTIDAD CONTADA REAL</th>
                      {selectedSession.state !== 'IN_PROGRESS' && (
                        <>
                          <th className="p-3 text-right">STOCK TEÓRICO (Snapshot)</th>
                          <th className="p-3 text-right">DIFERENCIA</th>
                          <th className="p-3 text-center">SEMÁFORO DISCREPANCIA</th>
                          <th className="p-3 text-left min-w-[220px]">MOTIVO DE AJUSTE (CAUSA)</th>
                        </>
                      )}
                      {selectedSession.state === 'IN_PROGRESS' && (
                        <th className="p-3 text-center">ACCIONES / EDICIÓN</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(!selectedSession.lines || selectedSession.lines.length === 0) ? (
                      <tr>
                        <td colSpan={selectedSession.state !== 'IN_PROGRESS' ? 6 : 3} className="p-6 text-center text-slate-400 font-medium">
                          No hay renglones en esta toma física. Registre el primer conteo arriba.
                        </td>
                      </tr>
                    ) : (
                      selectedSession.lines.map((line: any, idx: number) => {
                        const prod = (availableCountingProducts || []).find((p: any) => p.id === line.product_variant_id || p.value === line.product_variant_id || p.variant_id === line.product_variant_id)
                          || (sessionScopedProducts || []).find((p: any) => p.id === line.product_variant_id || p.value === line.product_variant_id || p.variant_id === line.product_variant_id)
                          || (products || []).find((p: any) => p.id === line.product_variant_id || p.value === line.product_variant_id || p.variant_id === line.product_variant_id);
                        const counted = line.counted_qty ?? 0;
                        const theo = line.theoretical_qty ?? 0;
                        const diff = counted - theo;
                        const uom = line.uom_base || prod?.uom_base || 'UND';
                        const productName = line.product_name || prod?.name || `Variante #${line.product_variant_id}`;
                        const productSku = line.sku || prod?.sku || '';

                        return (
                          <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-800">{productName}</span>
                                {productSku && (
                                  <span className="font-mono text-[10px] text-slate-500 font-semibold">{productSku}</span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-right font-bold text-slate-900 text-sm">
                              {formatQuantity(counted, uom, true)}
                            </td>

                            {selectedSession.state !== 'IN_PROGRESS' && (
                              <>
                                <td className="p-3 text-right font-medium text-slate-500">
                                  {formatQuantity(theo, uom, true)}
                                </td>
                                <td className="p-3 text-right font-bold">
                                  {diff === 0 ? (
                                    <span className="text-slate-500">0 {uom}</span>
                                  ) : diff > 0 ? (
                                    <span className="text-emerald-600">+{formatQuantity(diff, uom, true)} (Sobrante)</span>
                                  ) : (
                                    <span className="text-rose-600">{formatQuantity(diff, uom, true)} (Faltante)</span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  {diff === 0 ? (
                                    <Tag severity="success" value="🟢 Coincidencia Exacta" className="text-[9px] font-bold" />
                                  ) : Math.abs(diff) <= 2 ? (
                                    <Tag severity="warning" value="🟡 Tolerancia Menor" className="text-[9px] font-bold" />
                                  ) : (
                                    <div className="flex items-center justify-center gap-2">
                                      <Tag severity="danger" value="🔴 Descuadre Crítico" className="text-[9px] font-bold" />
                                      {selectedSession.state === 'REVIEW' && (
                                        <Button
                                          icon="pi pi-refresh"
                                          size="small"
                                          severity="warning"
                                          tooltip="Solicitar Reconteo (2da Vuelta)"
                                          className="p-button-rounded p-button-text p-button-sm h-6 w-6"
                                        />
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="p-3">
                                  {diff === 0 ? (
                                    <span className="text-slate-400 text-[11px] italic">Sin descuadre</span>
                                  ) : selectedSession.state === 'REVIEW' ? (
                                    <div className="flex items-center gap-1.5 min-w-[190px]">
                                      <Dropdown
                                        value={line.adjustment_reason_id || null}
                                        onChange={(e) => handleUpdateLineReason(line.id, e.value)}
                                        options={reasons.filter(r => (diff < 0 ? r.default_type === 'OUT' : r.default_type === 'IN') || !r.default_type)}
                                        optionLabel="name"
                                        optionValue="id"
                                        placeholder="Seleccione motivo..."
                                        disabled={updatingLineReasonId === line.id}
                                        itemTemplate={(opt) => (
                                          <div className="flex items-center justify-between gap-2 text-xs py-0.5">
                                            <span className="font-semibold text-slate-800">{opt.name}</span>
                                            <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded border border-slate-200">
                                              {opt.code}
                                            </span>
                                          </div>
                                        )}
                                        valueTemplate={(opt) => opt ? (
                                          <span className="text-[11px] font-semibold text-slate-800 truncate block max-w-[170px]" title={opt.name}>
                                            [{opt.code}] {opt.name}
                                          </span>
                                        ) : <span className="text-[11px] text-amber-600 font-medium italic">Asignar motivo...</span>}
                                        className={`text-xs p-inputtext-sm w-full ${!line.adjustment_reason_id ? 'border-amber-400 bg-amber-50/40' : 'bg-white'}`}
                                      />
                                      {updatingLineReasonId === line.id && (
                                        <i className="pi pi-spin pi-spinner text-indigo-600 text-xs shrink-0"></i>
                                      )}
                                    </div>
                                  ) : (
                                    line.adjustment_reason_name || line.adjustment_reason_code ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-50 text-indigo-900 border border-indigo-200 text-[11px] font-bold">
                                        <i className="pi pi-tag text-[10px] text-indigo-600"></i>
                                        [{line.adjustment_reason_code}] {line.adjustment_reason_name}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 text-[11px] italic">No clasificado</span>
                                    )
                                  )}
                                </td>
                              </>
                            )}

                            {selectedSession.state === 'IN_PROGRESS' && (
                              <td className="p-3 text-center">
                                <Button
                                  icon="pi pi-pencil"
                                  size="small"
                                  severity="secondary"
                                  className="p-button-rounded p-button-text h-7 w-7 text-indigo-600"
                                  tooltip="Editar Cifra Contada"
                                  onClick={() => {
                                    setCountingProdId(line.product_variant_id);
                                    setCountingQty(line.counted_qty);
                                  }}
                                />
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* DIÁLOGO: FICHA TÉCNICA INMUTABLE DE CONFIGURACIÓN DEL CONTEO */}
      <Dialog
        header={viewConfigSession ? `🔒 Ficha de Configuración: ${viewConfigSession.name} (SES-${viewConfigSession.id})` : 'Ficha de Configuración'}
        visible={viewConfigDialogVisible}
        onHide={() => setViewConfigDialogVisible(false)}
        style={{ width: '650px' }}
        className="rounded-2xl"
      >
        {viewConfigSession && (
          <div className="flex flex-col gap-5 py-2">
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold">
                    <i className="pi pi-lock text-sm"></i>
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      Parámetros Inmutables de la Toma Física
                    </h5>
                    <span className="text-[10px] text-slate-500">
                      Configuración registrada en la apertura. No modificable para garantizar la integridad de auditoría.
                    </span>
                  </div>
                </div>
                <Tag severity="info" value="🔒 INMUTABLE" className="font-bold text-[9px] px-2 py-0.5" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Código & Nombre de Toma
                  </span>
                  <div className="font-mono font-bold text-indigo-900">SES-{viewConfigSession.id}</div>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">{viewConfigSession.name}</div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Tipo de Alcance
                  </span>
                  <div className="font-bold text-slate-800">
                    {viewConfigSession.scope_type === 'CYCLIC' || viewConfigSession.scope_type === 'CATEGORY' ? (
                      <span className="inline-flex items-center gap-1.5 text-amber-700 font-bold">
                        <i className="pi pi-tags"></i> Conteo Cíclico por Categoría
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-indigo-700 font-bold">
                        <i className="pi pi-box"></i> Conteo General de Almacén
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    {viewConfigSession.total_lines !== undefined ? viewConfigSession.total_lines : (viewConfigSession.lines?.length || 0)} renglones / SKUs
                  </span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Centro / Sucursal & Almacén
                  </span>
                  <div className="font-bold text-slate-800">
                    🏢 {viewConfigSession.facility_name || (facilities.find(f => f.id === viewConfigSession.facility_id)?.name) || `Sucursal #${viewConfigSession.facility_id}`}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    📦 {viewConfigSession.warehouse_name || 'Almacén General'}
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Fecha y Estado Actual
                  </span>
                  <div className="font-bold text-slate-800">
                    📅 {viewConfigSession.date_start ? new Date(viewConfigSession.date_start).toLocaleString('es-ES') : 'N/D'}
                  </div>
                  <Tag
                    severity={viewConfigSession.state === 'DONE' ? 'success' : viewConfigSession.state === 'REVIEW' ? 'info' : 'warning'}
                    value={
                      viewConfigSession.state === 'DONE'
                        ? 'FASE 3: CONCILIADO'
                        : viewConfigSession.state === 'REVIEW'
                        ? 'FASE 2: ANÁLISIS & COTEJO'
                        : 'FASE 1: CONTEO CIEGO'
                    }
                    className="font-bold text-[9px] px-2 py-0.5 mt-1"
                  />
                </div>

                <div className="sm:col-span-2 bg-white p-3 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Jerarquía de Categoría Asociada
                  </span>
                  {viewConfigSession.category_full_path || viewConfigSession.category_name ? (
                    <div>
                      <span className="font-bold text-amber-900 text-xs">
                        🏷️ {viewConfigSession.category_name || viewConfigSession.category_full_path?.split(' > ').pop()}
                      </span>
                      {viewConfigSession.category_full_path && (
                        <div className="text-[11px] text-amber-700 font-mono mt-1 bg-amber-50/60 p-2 rounded-lg border border-amber-200/60">
                          {viewConfigSession.category_full_path}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-400 italic">Sin restricción categórica (Alcance General de Almacén)</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                label="Cerrar Ficha"
                outlined
                severity="secondary"
                className="font-bold text-xs"
                onClick={() => setViewConfigDialogVisible(false)}
              />
              <Button
                label="Gestionar Conteo"
                icon="pi pi-sliders-h"
                className="font-bold text-xs bg-indigo-600 border-indigo-600 text-white"
                onClick={() => {
                  const sid = viewConfigSession.id;
                  setViewConfigDialogVisible(false);
                  handleOpenSessionDetail(sid);
                }}
              />
            </div>
          </div>
        )}
      </Dialog>

      {/* DIÁLOGO: REPORTE / PLANILLA DE PRODUCTOS PARA TOMA DE INVENTARIO (IMPRIMIR Y EXCEL) */}
      <Dialog
        header="🖨️ Reporte de Productos — Toma de Inventario (Conteo Físico)"
        visible={countSheetDialogVisible}
        onHide={() => setCountSheetDialogVisible(false)}
        style={{ width: '1150px', maxWidth: '96vw' }}
        className="rounded-2xl"
      >
        <div className="flex flex-col gap-5 py-2">
          {/* Controls bar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setSheetShowTheoretical(prev => !prev)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-all flex items-center gap-2 cursor-pointer ${
                  sheetShowTheoretical
                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                    : 'bg-amber-50 text-amber-900 border-amber-300'
                }`}
              >
                <i className={`pi ${sheetShowTheoretical ? 'pi-eye text-blue-600' : 'pi-eye-slash text-amber-600'}`}></i>
                <span>{sheetShowTheoretical ? 'Mostrar Existencia Teórica: SÍ' : 'Mostrar Existencia Teórica: NO (Conteo Ciego)'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = !sheetIncludeZero;
                  setSheetIncludeZero(next);
                  loadCountSheetReport({ include_zero: next });
                }}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer ${
                  sheetIncludeZero ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300'
                }`}
              >
                <i className={`pi ${sheetIncludeZero ? 'pi-check-circle text-cyan-400' : 'pi-circle text-slate-400'} text-xs`}></i>
                <span>Incluir existencia en 0.00</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                icon="pi pi-refresh"
                label="Generar / Actualizar"
                size="small"
                outlined
                loading={sheetLoading}
                className="font-bold text-xs"
                onClick={() => loadCountSheetReport()}
              />
              <Button
                icon="pi pi-print"
                label="Imprimir Carta"
                size="small"
                disabled={!sheetData?.items?.length}
                className="font-bold text-xs bg-slate-900 border-slate-900 text-white"
                onClick={() => printCountSheetData(sheetData, sheetShowTheoretical, sheetResponsible)}
              />
              <Button
                icon="pi pi-receipt"
                label="Tickera 80mm"
                size="small"
                disabled={!sheetData?.items?.length}
                className="font-bold text-xs bg-amber-600 border-amber-600 text-white"
                onClick={() => printCountSheetThermal80mm(sheetData, sheetShowTheoretical, sheetResponsible)}
              />
              <Button
                icon="pi pi-file-excel"
                label="Exportar Excel"
                size="small"
                severity="success"
                disabled={!sheetData?.items?.length}
                className="font-bold text-xs bg-emerald-600 border-emerald-600 text-white"
                onClick={() => exportCountSheetExcelData(sheetData, sheetShowTheoretical, sheetResponsible)}
              />
            </div>
          </div>

          {/* Selector de Toma Física Abierta (Sin Conciliar) */}
          <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                <i className="pi pi-check-square text-sm"></i>
              </div>
              <div>
                <label className="font-extrabold text-indigo-950 text-xs block">
                  Extraer productos de una Toma Física pendiente por conciliar
                </label>
                <span className="text-[11px] text-indigo-700">
                  Seleccione una sesión abierta (Fase 1 o Fase 2) para mostrar exactamente los productos que pertenecen a esa toma física, o déjelo vacío para filtrar libremente por departamento.
                </span>
              </div>
            </div>
            <div className="w-full md:w-[440px] shrink-0">
              <Dropdown
                value={sheetSessionId}
                options={sessions
                  .filter(s => s.state !== 'DONE')
                  .map(s => {
                    const count = s.total_lines !== undefined ? s.total_lines : (s.lines?.length || 0);
                    const facLabel = s.facility_name || (facilities.find(f => f.id === s.facility_id)?.name) || '';
                    const phaseLabel = s.state === 'REVIEW' ? 'Fase 2: Análisis' : 'Fase 1: Conteo Ciego';
                    return {
                      id: s.id,
                      label: `[SES-${s.id}] ${s.name} — ${facLabel} (${count} ítems · ${phaseLabel})`
                    };
                  })}
                optionLabel="label"
                optionValue="id"
                onChange={e => {
                  const sid = e.value || null;
                  setSheetSessionId(sid);
                  if (sid) {
                    const found = sessions.find(s => s.id === sid);
                    if (found) {
                      setSheetFacilityId(found.facility_id || null);
                      setSheetWarehouseId(found.warehouse_id || null);
                      setSheetCategoryId(found.category_id || null);
                    }
                    loadCountSheetReport({ session_id: sid });
                  } else {
                    loadCountSheetReport({ session_id: null });
                  }
                }}
                placeholder="📋 Seleccionar Toma Física sin conciliar (ej. SES-2)..."
                showClear
                filter
                emptyMessage="No hay tomas físicas abiertas sin conciliar"
                className="text-xs w-full border-indigo-300"
              />
            </div>
          </div>

          {/* Filter controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="flex flex-col gap-1">
              <label className="font-bold text-slate-600 uppercase text-[10px]">Localidad / Sucursal</label>
              <Dropdown
                value={sheetFacilityId}
                options={facilities}
                optionLabel="name"
                optionValue="id"
                disabled={Boolean(sheetSessionId)}
                onChange={e => {
                  setSheetFacilityId(e.value);
                  setSheetWarehouseId(null);
                  loadCountSheetReport({ facility_id: e.value, warehouse_id: null });
                }}
                placeholder="Todas las localidades"
                showClear
                className="text-xs w-full"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-bold text-slate-600 uppercase text-[10px]">Depósito / Almacén</label>
              <Dropdown
                value={sheetWarehouseId}
                options={warehouses.filter(w => !sheetFacilityId || w.facility_id === sheetFacilityId)}
                optionLabel="name"
                optionValue="id"
                disabled={Boolean(sheetSessionId)}
                onChange={e => {
                  setSheetWarehouseId(e.value);
                  loadCountSheetReport({ warehouse_id: e.value });
                }}
                placeholder="Todos los depósitos"
                showClear
                filter
                className="text-xs w-full"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-bold text-slate-600 uppercase text-[10px]">Departamento / Categoría</label>
              <TreeSelect
                value={sheetCategoryId ? String(sheetCategoryId) : null}
                options={categoriesTree}
                disabled={Boolean(sheetSessionId)}
                onChange={e => {
                  const val = e.value ? Number(e.value) : null;
                  setSheetCategoryId(val);
                  loadCountSheetReport({ category_id: val });
                }}
                placeholder="Todos los departamentos..."
                filter
                filterBy="label,rawName,fullPath"
                filterMode="lenient"
                showClear
                className="text-xs w-full"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-bold text-slate-600 uppercase text-[10px]">Responsable</label>
              <InputText
                value={sheetResponsible}
                onChange={e => setSheetResponsible(e.target.value)}
                placeholder="Opcional..."
                className="text-xs p-inputtext-sm"
              />
            </div>
          </div>

          {/* Paper preview */}
          <div className="border-2 border-slate-200 rounded-2xl p-5 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start mb-4">
              <div className="md:col-span-5 text-center">
                <div className="text-base font-normal text-slate-900">{sheetData?.company_name || 'CATANIA HIPERMERCADO, C.A.'}</div>
                <div className="text-xs text-slate-800 mt-1">Localidades: <strong>{sheetData?.facility_name || 'TODAS'}</strong></div>
                {sheetData?.session_code && (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-bold">
                    <span>Toma Física: [{sheetData.session_code}] {sheetData.session_name}</span>
                  </div>
                )}
              </div>
              <div className="md:col-span-7 text-center">
                <div className="border-b border-slate-900 pb-1 text-xs text-slate-900">REPORTE DE PRODUCTOS - TOMA DE INVENTARIO</div>
                <div className="border-b border-slate-900 py-1 text-xs font-bold text-slate-900">
                  Depósito: {sheetData?.deposit_name || 'TODOS'}, Departamento: {sheetData?.department_name || 'TODOS'}, Moneda: {sheetData?.currency_name || 'BOLIVAR DIGITAL'}
                </div>
                <div className="flex justify-between pt-1 text-xs text-slate-900">
                  <span>Fecha de Emisión <strong>{sheetData?.emission_date || ''}</strong></span>
                  <span>Total: <strong>{sheetData?.total_items ?? 0}</strong></span>
                </div>
              </div>
            </div>

            <div className="overflow-auto max-h-[45vh] border-t border-slate-200">
              <table className="w-full border-collapse text-xs text-left">
                <thead className="sticky top-0 bg-white border-b-4 border-double border-slate-900">
                  <tr>
                    <th className="py-2 px-2 w-[150px]">Producto</th>
                    <th className="py-2 px-2">Descripción del Producto</th>
                    {sheetShowTheoretical && <th className="py-2 px-3 text-right w-[120px]">Existencia</th>}
                    <th className="py-2 px-2 text-center w-[140px]">Existencia Real</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sheetLoading ? (
                    <tr>
                      <td colSpan={sheetShowTheoretical ? 4 : 3} className="py-8 text-center text-slate-400">
                        Cargando productos...
                      </td>
                    </tr>
                  ) : (sheetData?.items || []).map((it: any) => (
                    <tr key={it.variant_id}>
                      <td className="py-1.5 px-2 font-mono">{it.product_code || it.sku}</td>
                      <td className="py-1.5 px-2">{it.description}</td>
                      {sheetShowTheoretical && (
                        <td className="py-1.5 px-3 text-right font-mono tabular-nums">
                          {Number(it.theoretical_qty ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      )}
                      <td className="py-1.5 px-2 text-center">
                        <div className="border-b border-slate-900 w-24 h-3.5 mx-auto"></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
