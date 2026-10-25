'use client';
import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { TreeSelect } from 'primereact/treeselect';
import { InputText } from 'primereact/inputtext';
import { Dialog } from 'primereact/dialog';
import { InputTextarea } from 'primereact/inputtextarea';
import { Message } from 'primereact/message';
import { PhysicalCountService } from '@/services/physical-count.service';
import { ValuationService } from '@/services/valuation.service';
import { formatQuantity } from '@/lib/uom';

export default function PhysicalCountsPage() {
  // Active View Tab: 'report' (Planilla / Reporte de Conteo Físico) | 'sessions' (Sesiones de Toma)
  const [activeTab, setActiveTab] = useState<'report' | 'sessions'>('report');

  // --- REPORT / COUNT SHEET STATE ---
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetData, setSheetData] = useState<any>(null);

  const [facilities, setFacilities] = useState<any[]>([]);
  const [allWarehouses, setAllWarehouses] = useState<any[]>([]);
  const [locationsTree, setLocationsTree] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [categoriesTree, setCategoriesTree] = useState<any[]>([]);

  // Report Filters
  const [reportSessionId, setReportSessionId] = useState<number | null>(null);
  const [reportFacilityId, setReportFacilityId] = useState<number | null>(null);
  const [reportWarehouseId, setReportWarehouseId] = useState<number | null>(null);
  const [reportLocationId, setReportLocationId] = useState<number | null>(null);
  const [reportCategoryId, setReportCategoryId] = useState<number | null>(null);
  const [reportSearch, setReportSearch] = useState('');
  const [responsibleName, setResponsibleName] = useState('');

  // Toggles requested by user
  const [showTheoreticalStock, setShowTheoreticalStock] = useState<boolean>(true);
  const [includeZeroStock, setIncludeZeroStock] = useState<boolean>(true);
  const [codeDisplayMode, setCodeDisplayMode] = useState<'barcode' | 'sku' | 'both'>('barcode');

  // --- SESSIONS STATE ---
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isSupervisor, setIsSupervisor] = useState(false);

  // Modals for Sessions
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // New Session fields
  const [newSessionName, setNewSessionName] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<any>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [scopeType, setScopeType] = useState('GENERAL');
  const [scopeValue, setScopeValue] = useState('');

  // CSV Import field
  const [csvContent, setCsvContent] = useState('');
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const scopeOptions = [
    { label: 'General (Toda la Sucursal)', value: 'GENERAL' },
    { label: 'Por Almacén', value: 'WAREHOUSE' },
    { label: 'Por Ubicación', value: 'LOCATION' },
    { label: 'Por Categoría de Producto', value: 'CATEGORY' }
  ];

  const formatCategoryTreeNodes = (nodes: any[], parentBreadcrumb = '', depth = 0): any[] => {
    if (!nodes || !Array.isArray(nodes)) return [];
    return nodes.map(node => {
      const levelTag = node.level_name || (depth === 0 ? 'Depto' : depth === 1 ? 'Grupo' : 'Subgrupo');
      const breadcrumb = node.full_path || (parentBreadcrumb ? `${parentBreadcrumb} > ${node.name}` : node.name);
      return {
        key: String(node.id),
        label: `[${levelTag}] ${node.name}`,
        data: node.id,
        rawName: node.name,
        fullPath: breadcrumb,
        icon: (node.children && node.children.length > 0) ? 'pi pi-folder text-blue-600' : 'pi pi-tag text-slate-500',
        children: (node.children && node.children.length > 0) ? formatCategoryTreeNodes(node.children, breadcrumb, depth + 1) : undefined
      };
    });
  };

  // Initial load of metadata & user role
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [facs, whs, cats, tree] = await Promise.all([
          ValuationService.getFacilities(),
          ValuationService.getWarehouses(),
          ValuationService.getCategories(),
          ValuationService.getCategoriesTree()
        ]);
        const facList = facs || [];
        const whList = whs || [];
        setFacilities(facList);
        setAllWarehouses(whList);
        setCategories(cats || []);
        setCategoriesTree(formatCategoryTreeNodes(tree || []));

        // Default to first facility if available so the user immediately sees a realistic report
        if (facList.length > 0) {
          const defaultFac = facList.find((f: any) => f.id === 1) || facList[0];
          setReportFacilityId(defaultFac.id);
        }
      } catch (err) {
        console.error("Error cargando metadatos", err);
      }
    };

    import('@/lib/api').then(({ default: api }) => {
      api.get('/users/me')
        .then(res => {
          if (res.data && res.data.active_role) {
            const roleName = res.data.active_role.name.toUpperCase();
            if (['SUPERVISOR', 'ADMIN', 'GERENTE'].includes(roleName)) {
              setIsSupervisor(true);
            }
          } else if (res.data?.is_superuser) {
            setIsSupervisor(true);
          }
        })
        .catch(err => console.error("Error cargando rol de usuario: ", err));
    });

    loadMetadata();
    loadSessions();
  }, []);

  // Filter warehouses for report when reportFacilityId changes
  const reportWarehouses = useMemo(() => {
    const filtered = reportFacilityId
      ? allWarehouses.filter((w: any) => w.facility_id === reportFacilityId)
      : allWarehouses;
    return filtered.map((w: any) => ({
      ...w,
      displayLabel: w.code ? `${w.code} - ${w.name}` : w.name
    }));
  }, [allWarehouses, reportFacilityId]);

  // Load locations tree when reportFacilityId changes
  useEffect(() => {
    if (reportFacilityId) {
      ValuationService.getLocationsTree(reportFacilityId)
        .then(data => setLocationsTree(data || []))
        .catch(() => setLocationsTree([]));
    } else {
      setLocationsTree([]);
    }
    setReportWarehouseId(null);
    setReportLocationId(null);
  }, [reportFacilityId]);

  const reportLocations = useMemo(() => {
    if (!reportWarehouseId) return [];
    const whNode = locationsTree.find((w: any) => w.id === reportWarehouseId);
    if (!whNode || !Array.isArray(whNode.locations)) return [];
    return whNode.locations.map((l: any) => ({
      id: l.id,
      label: l.code ? `[${l.code}] ${l.name}` : l.name
    }));
  }, [locationsTree, reportWarehouseId]);

  // Load Physical Count Sheet Report
  const loadCountSheet = async () => {
    setSheetLoading(true);
    try {
      const data = await ValuationService.getPhysicalCountSheet({
        session_id: reportSessionId,
        facility_id: reportSessionId ? null : reportFacilityId,
        warehouse_id: reportSessionId ? null : reportWarehouseId,
        location_id: reportSessionId ? null : reportLocationId,
        category_id: reportSessionId ? null : reportCategoryId,
        include_zero_stock: includeZeroStock,
        search: reportSearch
      });
      setSheetData(data);
    } catch (err) {
      console.error("Error cargando planilla de conteo físico", err);
    } finally {
      setSheetLoading(false);
    }
  };

  useEffect(() => {
    loadCountSheet();
  }, [reportSessionId, reportFacilityId, reportWarehouseId, reportLocationId, reportCategoryId, includeZeroStock]);

  // Load warehouses if facility is selected in create session dialog
  useEffect(() => {
    if (selectedFacility) {
      ValuationService.getWarehouses(selectedFacility).then(setWarehouses);
    } else {
      setWarehouses([]);
    }
  }, [selectedFacility]);

  const formatStockNumber = (val: number | undefined | null) => {
    const num = Number(val ?? 0);
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const resolveProductCode = (item: any) => {
    if (codeDisplayMode === 'sku') return item.sku || item.product_code || '';
    if (codeDisplayMode === 'both') {
      if (item.barcode && item.sku && item.barcode !== item.sku) {
        return `${item.barcode} (${item.sku})`;
      }
      return item.product_code || item.sku || '';
    }
    return item.product_code || item.barcode || item.sku || '';
  };

  const clearReportFilters = () => {
    setReportSessionId(null);
    setReportWarehouseId(null);
    setReportLocationId(null);
    setReportCategoryId(null);
    setReportSearch('');
    setResponsibleName('');
  };

  // --- PRINT REPORT (Matches uploaded image format + Neo ERP official header/footer) ---
  const handlePrintCountSheet = () => {
    if (!sheetData) return;
    const printWindow = window.open('', '_blank', 'width=1050,height=800');
    if (!printWindow) {
      alert('Por favor permita las ventanas emergentes para imprimir el reporte.');
      return;
    }

    const items: any[] = sheetData.items || [];
    const rowsHtml = items.map((item) => {
      const code = resolveProductCode(item);
      const theoCell = showTheoreticalStock
        ? `<td class="col-theo">${formatStockNumber(item.theoretical_qty)}</td>`
        : '';
      return `
        <tr>
          <td class="col-code">${code}</td>
          <td class="col-desc">${item.description || ''}</td>
          ${theoCell}
          <td class="col-real"><div class="real-line"></div></td>
        </tr>
      `;
    }).join('');

    const theoHeader = showTheoreticalStock
      ? `<th class="col-theo">Existencia</th>`
      : '';

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Neo ERP - Reporte de Productos - Toma de Inventario</title>
        <style>
          @page {
            size: letter portrait;
            margin: 12mm 12mm 15mm 12mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #000;
            margin: 0;
            padding: 0;
            font-size: 11px;
            background: #fff;
          }
          .neo-brand-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 9px;
            font-weight: bold;
            color: #334155;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 4px;
            margin-bottom: 10px;
            letter-spacing: 0.05em;
          }
          .report-header {
            display: grid;
            grid-template-columns: 45% 55%;
            align-items: start;
            margin-bottom: 14px;
          }
          .header-left {
            text-align: center;
            padding-right: 10px;
          }
          .company-title {
            font-size: 16px;
            font-weight: normal;
            margin: 0 0 6px 0;
            letter-spacing: 0.02em;
          }
          .locality-subtitle {
            font-size: 13px;
            margin: 0;
          }
          .header-right {
            text-align: center;
          }
          .report-title {
            font-size: 13px;
            font-weight: normal;
            margin: 0 0 4px 0;
            padding-bottom: 3px;
            border-bottom: 1px solid #000;
          }
          .report-scope {
            font-size: 12px;
            font-weight: bold;
            margin: 3px 0;
            padding-bottom: 4px;
            border-bottom: 1px solid #000;
            line-height: 1.35;
          }
          .report-meta {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            margin-top: 4px;
            padding: 0 4px;
          }
          .deposit-bar {
            display: grid;
            grid-template-columns: 90px 80px 1fr 240px;
            align-items: center;
            font-size: 10.5px;
            font-weight: bold;
            margin-top: 10px;
            margin-bottom: 4px;
            padding: 2px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          thead th {
            font-size: 10.5px;
            font-weight: bold;
            text-align: left;
            padding: 4px 6px 6px 6px;
            border-bottom: 3px double #000;
          }
          tbody td {
            padding: 3.5px 6px;
            font-size: 10px;
            vertical-align: bottom;
          }
          .col-code {
            width: 125px;
            font-family: Arial, Helvetica, sans-serif;
            white-space: nowrap;
          }
          .col-desc {
            width: auto;
          }
          .col-theo {
            width: 100px;
            text-align: right !important;
            padding-right: 16px !important;
            font-variant-numeric: tabular-nums;
          }
          .col-real {
            width: 125px;
            text-align: center !important;
          }
          .real-line {
            border-bottom: 1px solid #000;
            width: 105px;
            height: 12px;
            margin: 0 auto;
          }
          .report-footer {
            margin-top: 28px;
            padding-top: 10px;
            border-top: 1px solid #cbd5e1;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            font-size: 9.5px;
            color: #334155;
            page-break-inside: avoid;
          }
          .sig-block {
            width: 200px;
            text-align: center;
          }
          .sig-line {
            border-bottom: 1px solid #000;
            height: 24px;
            margin-bottom: 4px;
          }
        </style>
      </head>
      <body>
        <div class="neo-brand-bar">
          <span>NEO ERP — MÓDULO DE INVENTARIO Y AUDITORÍA FÍSICA</span>
          <span>MODO: ${showTheoreticalStock ? 'CON EXISTENCIA TEÓRICA' : 'CONTEO CIEGO (SIN EXISTENCIA)'}</span>
        </div>

        <div class="report-header">
          <div class="header-left">
            <div class="company-title">${sheetData.company_name || 'CATANIA HIPERMERCADO, C.A.'}</div>
            <div class="locality-subtitle">Localidades: ${sheetData.facility_name || 'TODAS'}</div>
            ${sheetData.session_code ? `<div style="font-size: 11px; font-weight: bold; margin-top: 4px;">Toma Física: [${sheetData.session_code}] ${sheetData.session_name || ''}</div>` : ''}
          </div>
          <div class="header-right">
            <div class="report-title">REPORTE DE PRODUCTOS - TOMA DE INVENTARIO</div>
            <div class="report-scope">
              Depósito: ${sheetData.deposit_name || 'TODOS'}, Departamento:<br/>
              ${sheetData.department_name || 'TODOS'}, Moneda: ${sheetData.currency_name || 'BOLIVAR DIGITAL'}
            </div>
            <div class="report-meta">
              <span>Fecha de Emisión <strong>${sheetData.emission_date || ''}</strong></span>
              <span>Total Items: <strong>${items.length}</strong></span>
            </div>
          </div>
        </div>

        <div class="deposit-bar">
          <span>Depósito</span>
          <span>${sheetData.deposit_code || ''}</span>
          <span>${sheetData.deposit_name || ''}</span>
          <span>Responsable: ${responsibleName ? `<u>${responsibleName}</u>` : '________________________'}</span>
        </div>

        <table>
          <thead>
            <tr>
              <th class="col-code">Producto</th>
              <th class="col-desc">Descripción del Producto</th>
              ${theoHeader}
              <th class="col-real">Existencia Real</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="report-footer">
          <div class="sig-block">
            <div class="sig-line"></div>
            <strong>Contado por (Firma y Fecha)</strong>
          </div>
          <div style="text-align: center; font-size: 9px;">
            Documento generado por <strong>Neo ERP</strong> — ${new Date().toLocaleString('es-VE')}
          </div>
          <div class="sig-block">
            <div class="sig-line"></div>
            <strong>Verificado / Supervisor</strong>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 250);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // --- PRINT ON 80MM THERMAL RECEIPT PRINTER (TICKERA) ---
  const handlePrintThermal80mm = () => {
    if (!sheetData) return;
    const printWindow = window.open('', '_blank', 'width=420,height=740');
    if (!printWindow) {
      alert('Por favor permita las ventanas emergentes para imprimir en la tickera.');
      return;
    }

    const items: any[] = sheetData.items || [];
    const estHeightMm = Math.max(95, 78 + items.length * 10);

    const rowsHtml = items.map((item) => {
      const code = resolveProductCode(item);
      return `
        <tr>
          <td style="padding: 3px 0; border-bottom: 1px dotted #000; max-width: 44mm; word-wrap: break-word;">
            <div style="font-weight: 900; font-size: 10.5px;">${code}</div>
            <div style="font-weight: 700; font-size: 10px;">${item.description || ''}</div>
          </td>
          ${showTheoreticalStock ? `<td style="padding: 3px 2px; border-bottom: 1px dotted #000; text-align: right; font-weight: 800; font-size: 10.5px;">${formatStockNumber(item.theoretical_qty)}</td>` : ''}
          <td style="padding: 3px 0; border-bottom: 1px dotted #000; text-align: right; font-weight: 800; font-size: 10.5px;">[ &nbsp; &nbsp; &nbsp; ]</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `<!DOCTYPE html>
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
    <div class="header-title">${sheetData.company_name || 'CATANIA HIPERMERCADO, C.A.'}</div>
    <div class="header-sub">TOMA DE INVENTARIO (${showTheoreticalStock ? 'CON EXIST.' : 'CIEGO'})</div>
    ${sheetData.session_code ? `<div class="meta-row"><strong>SESIÓN:</strong> [${sheetData.session_code}] ${sheetData.session_name || ''}</div>` : ''}
    <div class="meta-row"><strong>LOCALIDAD:</strong> ${sheetData.facility_name || 'TODAS'}</div>
    <div class="meta-row"><strong>DEPÓSITO:</strong> ${sheetData.deposit_code || ''} ${sheetData.deposit_name || 'TODOS'}</div>
    <div class="meta-row"><strong>DEPTO:</strong> ${sheetData.department_name || 'TODOS'}</div>
    <div class="meta-row"><strong>EMISIÓN:</strong> ${sheetData.emission_date || ''} | <strong>ITEMS:</strong> ${items.length}</div>
    <div class="meta-row"><strong>RESP:</strong> ${responsibleName || '________________________'}</div>
    <div class="divider"></div>
    <table>
      <thead>
        <tr>
          <th style="text-align: left;">PRODUCTO</th>
          ${showTheoreticalStock ? '<th style="text-align: right;">EXIST.</th>' : ''}
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
</html>`;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // --- EXPORT TO EXCEL (.xlsx) ---
  const handleExportExcel = () => {
    if (!sheetData || !sheetData.items || sheetData.items.length === 0) return;

    const headerRows: any[][] = [
      ["NEO ERP - REPORTE DE PRODUCTOS - TOMA DE INVENTARIO"],
      [
        sheetData.company_name || "CATANIA HIPERMERCADO, C.A.",
        sheetData.session_code ? `Toma Física: [${sheetData.session_code}] ${sheetData.session_name || ''}` : ""
      ],
      [
        `Localidades: ${sheetData.facility_name || 'TODAS'}`,
        `Depósito: ${sheetData.deposit_code || ''} ${sheetData.deposit_name || 'TODOS'}`,
        `Departamento: ${sheetData.department_name || 'TODOS'}`
      ],
      [
        `Moneda: ${sheetData.currency_name || 'BOLIVAR DIGITAL'}`,
        `Fecha de Emisión: ${sheetData.emission_date || new Date().toLocaleDateString('es-VE')}`,
        `Responsable: ${responsibleName || '______________________'}`
      ],
      []
    ];

    const tableHeader = showTheoreticalStock
      ? ["Producto", "SKU Interno", "Descripción del Producto", "Departamento / Categoría", "Unidad", "Existencia", "Existencia Real"]
      : ["Producto", "SKU Interno", "Descripción del Producto", "Departamento / Categoría", "Unidad", "Existencia Real"];

    headerRows.push(tableHeader);

    sheetData.items.forEach((item: any) => {
      const code = resolveProductCode(item);
      if (showTheoreticalStock) {
        headerRows.push([
          code,
          item.sku || "",
          item.description || "",
          item.category || "",
          item.uom || "UND",
          Number(Number(item.theoretical_qty ?? 0).toFixed(2)),
          "" // Blank cell for physical count
        ]);
      } else {
        headerRows.push([
          code,
          item.sku || "",
          item.description || "",
          item.category || "",
          item.uom || "UND",
          "" // Blank cell for physical count
        ]);
      }
    });

    const worksheet = XLSX.utils.aoa_to_sheet(headerRows);
    worksheet['!cols'] = showTheoreticalStock
      ? [
          { wch: 18 }, // Producto
          { wch: 16 }, // SKU
          { wch: 46 }, // Descripción
          { wch: 26 }, // Categoría
          { wch: 10 }, // Unidad
          { wch: 16 }, // Existencia
          { wch: 18 }  // Existencia Real
        ]
      : [
          { wch: 18 }, // Producto
          { wch: 16 }, // SKU
          { wch: 46 }, // Descripción
          { wch: 26 }, // Categoría
          { wch: 10 }, // Unidad
          { wch: 18 }  // Existencia Real
        ];

    const totalRows = headerRows.length;
    const lastCol = showTheoreticalStock ? 'G' : 'F';
    if (totalRows >= 6) {
      worksheet['!autofilter'] = { ref: `A6:${lastCol}${totalRows}` };
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Toma de Inventario');

    const safeDept = (sheetData.department_name || 'General').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 25);
    const modeSuffix = showTheoreticalStock ? 'ConExistencia' : 'ConteoCiego';
    const fileName = `NeoERP_Toma_Inventario_${safeDept}_${modeSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // --- SESSIONS HANDLERS ---
  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await PhysicalCountService.getSessions();
      setSessions(data || []);
    } catch (err) {
      console.error("Error cargando sesiones de conteo", err);
    } finally {
      setLoading(false);
    }
  };

  const selectSession = async (session: any) => {
    setLoading(true);
    try {
      const fullSession = await PhysicalCountService.getSession(session.id);
      setSelectedSession(fullSession);
    } catch (err) {
      console.error("Error cargando detalle de sesión", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async () => {
    if (!newSessionName.trim() || !selectedFacility) {
      alert("Por favor indique nombre y sucursal.");
      return;
    }
    let resolvedScopeValue = '';
    if (scopeType === 'WAREHOUSE') {
      resolvedScopeValue = String(selectedWarehouse || '');
    } else if (scopeType === 'CATEGORY') {
      resolvedScopeValue = String(selectedCategory || '');
    } else {
      resolvedScopeValue = scopeValue;
    }

    try {
      setLoading(true);
      const session = await PhysicalCountService.createSession({
        name: newSessionName,
        facility_id: selectedFacility,
        warehouse_id: selectedWarehouse || undefined,
        scope_type: scopeType,
        scope_value: resolvedScopeValue || undefined
      });
      setShowCreateDialog(false);
      setNewSessionName('');
      setSelectedFacility(null);
      setSelectedWarehouse(null);
      setSelectedCategory(null);
      setScopeType('GENERAL');
      setScopeValue('');
      await loadSessions();
      selectSession(session);
    } catch (err) {
      console.error("Error creando sesión", err);
      alert("Error al crear sesión.");
    } finally {
      setLoading(false);
    }
  };

  const handleCsvImport = async () => {
    if (!csvContent.trim() || !selectedSession) return;
    setImportStatus({ type: 'info', text: 'Procesando líneas...' });
    const lines: any[] = [];
    const rows = csvContent.split('\n');
    let errors = 0;

    for (const r of rows) {
      const trimmed = r.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(',');
      if (parts.length < 3) {
        errors++;
        continue;
      }
      const sku = parts[0].trim();
      const location_code = parts[1].trim();
      const counted_qty = parseFloat(parts[2].trim());
      if (!sku || !location_code || isNaN(counted_qty)) {
        errors++;
        continue;
      }
      lines.push({ sku, location_code, counted_qty });
    }

    if (lines.length === 0) {
      setImportStatus({ type: 'error', text: 'No se encontraron líneas válidas. Formato requerido: SKU,UBICACION,CANTIDAD' });
      return;
    }

    try {
      const updated = await PhysicalCountService.uploadLinesBulk(selectedSession.id, lines);
      setSelectedSession(updated);
      setCsvContent('');
      setShowUploadDialog(false);
      setImportStatus(null);
      alert(`Importación completada: ${lines.length} líneas procesadas con éxito.` + (errors > 0 ? ` (${errors} líneas omitidas por formato incorrecto).` : ''));
    } catch (err) {
      console.error("Error importando líneas", err);
      setImportStatus({ type: 'error', text: 'Error al enviar líneas al servidor.' });
    }
  };

  const handleValidateSession = async () => {
    if (!selectedSession) return;
    if (!confirm("¿Está seguro de que desea validar y consolidar esta toma de inventario? Se generarán los movimientos de ajuste y se actualizarán las existencias en tiempo real.")) {
      return;
    }

    setLoading(true);
    try {
      const res = await PhysicalCountService.validateSession(selectedSession.id);
      alert(res.message || "Inventario consolidado con éxito.");
      await loadSessions();
      const fullSession = await PhysicalCountService.getSession(selectedSession.id);
      setSelectedSession(fullSession);
    } catch (err: any) {
      console.error("Error consolidando sesión", err);
      alert(err.response?.data?.detail || "Error al validar la sesión.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSession = async () => {
    if (!selectedSession) return;
    const trimmedReason = cancelReason.trim();
    if (!trimmedReason || trimmedReason.length < 5) {
      alert("Por favor indique un motivo de cancelación detallado (mínimo 5 caracteres).");
      return;
    }

    setCancelling(true);
    try {
      const updated = await PhysicalCountService.cancelSession(selectedSession.id, trimmedReason);
      setShowCancelDialog(false);
      setCancelReason('');
      await loadSessions();
      setSelectedSession(updated);
    } catch (err: any) {
      console.error("Error cancelando sesión", err);
      alert(err.response?.data?.detail || "Error al cancelar la sesión de inventario.");
    } finally {
      setCancelling(false);
    }
  };

  const stateBodyTemplate = (rowData: any) => {
    const isDone = rowData.state === 'DONE';
    const isCancelled = rowData.state === 'CANCELLED';

    if (isCancelled) {
      return (
        <span
          className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200/70"
          title={rowData.cancellation_reason ? `Motivo: ${rowData.cancellation_reason}` : 'Toma física cancelada'}
        >
          <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-rose-500"></span>
          Cancelada
        </span>
      );
    }

    return (
      <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold ${isDone ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/60' : 'bg-amber-50 text-amber-600 border border-amber-200/60'}`}>
        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isDone ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
        {isDone ? 'Consolidado' : 'Borrador / Abierto'}
      </span>
    );
  };

  const getScopeBadge = (session: any) => {
    if (!session) return null;
    let label = 'General';
    let color = 'bg-slate-100 text-slate-700';
    if (session.scope_type === 'WAREHOUSE') {
      label = `Almacén`;
      color = 'bg-blue-50 text-blue-700 border border-blue-100';
    } else if (session.scope_type === 'LOCATION') {
      label = `Ubicación: ${session.scope_value}`;
      color = 'bg-purple-50 text-purple-700 border border-purple-100';
    } else if (session.scope_type === 'CATEGORY') {
      label = `Categoría`;
      color = 'bg-indigo-50 text-indigo-700 border border-indigo-100';
    }
    return <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${color}`}>{label}</span>;
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto flex flex-col gap-6">
      {/* Top Mode Switcher */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white rounded-3xl px-6 py-4 shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 m-0 tracking-tight">
            Toma de Inventario y Conteo Físico
          </h1>
          <p className="text-slate-500 text-xs mt-1 font-medium">
            Generación de planillas para conteo físico en piso o almacén, impresión directa y exportación a Excel
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('report')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'report'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <i className="pi pi-file-pdf text-sm"></i>
            Reporte / Planilla de Conteo
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sessions')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'sessions'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <i className="pi pi-check-square text-sm"></i>
            Sesiones de Toma ({sessions.length})
          </button>
        </div>
      </div>

      {activeTab === 'report' ? (
        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 opacity-90"></div>

          <div className="p-5 md:p-6 flex flex-col gap-6">
            {/* Controls & Action Bar */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Toggle: Mostrar o no la existencia teórica */}
                <button
                  type="button"
                  onClick={() => setShowTheoreticalStock(prev => !prev)}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold border transition-all flex items-center gap-2.5 cursor-pointer shadow-xs ${
                    showTheoreticalStock
                      ? 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                      : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  }`}
                >
                  <i className={`pi ${showTheoreticalStock ? 'pi-eye text-blue-600' : 'pi-eye-slash text-amber-600'} text-sm`}></i>
                  <span>
                    {showTheoreticalStock ? 'Mostrar Existencia Teórica: SÍ' : 'Mostrar Existencia Teórica: NO (Conteo Ciego)'}
                  </span>
                </button>

                {/* Toggle: Incluir artículos con stock 0 */}
                <button
                  type="button"
                  onClick={() => setIncludeZeroStock(prev => !prev)}
                  className={`px-3.5 py-2.5 rounded-2xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer ${
                    includeZeroStock
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <i className={`pi ${includeZeroStock ? 'pi-check-circle text-cyan-400' : 'pi-circle text-slate-400'} text-xs`}></i>
                  <span>Incluir existencia en 0.00</span>
                </button>

                {/* Code format selector */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setCodeDisplayMode('barcode')}
                    className={`px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${codeDisplayMode === 'barcode' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                  >
                    Cód. Barra
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeDisplayMode('sku')}
                    className={`px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${codeDisplayMode === 'sku' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                  >
                    SKU
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeDisplayMode('both')}
                    className={`px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${codeDisplayMode === 'both' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                  >
                    Ambos
                  </button>
                </div>
              </div>

              {/* Action Buttons: Print & Excel */}
              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  icon="pi pi-filter-slash"
                  rounded
                  text
                  severity="secondary"
                  onClick={clearReportFilters}
                  tooltip="Limpiar Filtros"
                />
                <Button
                  icon="pi pi-refresh"
                  label="Actualizar"
                  rounded
                  outlined
                  size="small"
                  onClick={loadCountSheet}
                  loading={sheetLoading}
                  className="font-bold text-xs"
                />
                <Button
                  icon="pi pi-print"
                  label="Imprimir Carta"
                  rounded
                  size="small"
                  onClick={handlePrintCountSheet}
                  disabled={!sheetData?.items?.length}
                  className="font-bold text-xs !bg-slate-900 !border-slate-900 hover:!bg-slate-800 text-white shadow-sm"
                />
                <Button
                  icon="pi pi-receipt"
                  label="Tickera 80mm"
                  rounded
                  size="small"
                  onClick={handlePrintThermal80mm}
                  disabled={!sheetData?.items?.length}
                  className="font-bold text-xs !bg-amber-600 !border-amber-600 hover:!bg-amber-700 text-white shadow-sm"
                />
                <Button
                  icon="pi pi-file-excel"
                  label="Exportar a Excel (.xlsx)"
                  rounded
                  severity="success"
                  size="small"
                  onClick={handleExportExcel}
                  disabled={!sheetData?.items?.length}
                  className="font-bold text-xs !bg-emerald-600 !border-emerald-600 hover:!bg-emerald-700 text-white shadow-sm"
                />
              </div>
            </div>

            {/* Selector de Toma Física Abierta (Sin Conciliar) */}
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-3xl p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  <i className="pi pi-check-square text-base"></i>
                </div>
                <div>
                  <label className="font-extrabold text-indigo-950 text-xs sm:text-sm block">
                    Extraer productos de una Toma Física pendiente por conciliar
                  </label>
                  <span className="text-xs text-indigo-700">
                    Seleccione una sesión abierta (sin conciliar) para generar la planilla con los productos exactos de esa toma física, o déjelo vacío para filtrar libremente por departamento.
                  </span>
                </div>
              </div>
              <div className="w-full lg:w-[460px] shrink-0">
                <Dropdown
                  value={reportSessionId}
                  options={sessions
                    .filter((s: any) => s.state !== 'DONE')
                    .map((s: any) => {
                      const count = s.total_lines !== undefined ? s.total_lines : (s.lines?.length || 0);
                      const facLabel = s.facility_name || (facilities.find((f: any) => f.id === s.facility_id)?.name) || '';
                      return {
                        id: s.id,
                        label: `[SES-${s.id}] ${s.name}${facLabel ? ` — ${facLabel}` : ''}${count ? ` (${count} ítems)` : ''}`
                      };
                    })}
                  optionLabel="label"
                  optionValue="id"
                  onChange={(e) => setReportSessionId(e.value || null)}
                  placeholder="📋 Seleccionar Toma Física sin conciliar (ej. SES-2)..."
                  showClear
                  filter
                  emptyMessage="No hay tomas físicas abiertas sin conciliar"
                  className="w-full !rounded-xl !bg-white border-indigo-300 text-xs shadow-xs"
                />
              </div>
            </div>

            {/* Filters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-slate-50/70 p-4 rounded-3xl border border-slate-100">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-1">
                  Localidad / Sucursal
                </label>
                <Dropdown
                  value={reportFacilityId}
                  options={facilities}
                  optionLabel="name"
                  optionValue="id"
                  disabled={Boolean(reportSessionId)}
                  onChange={(e) => setReportFacilityId(e.value)}
                  placeholder="Todas las localidades"
                  showClear
                  className="w-full !rounded-xl !bg-white border-slate-200 text-xs shadow-xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-1">
                  Depósito / Almacén
                </label>
                <Dropdown
                  value={reportWarehouseId}
                  options={reportWarehouses}
                  optionLabel="displayLabel"
                  optionValue="id"
                  disabled={Boolean(reportSessionId)}
                  onChange={(e) => {
                    setReportWarehouseId(e.value);
                    setReportLocationId(null);
                  }}
                  placeholder="Todos los depósitos"
                  showClear
                  filter
                  className="w-full !rounded-xl !bg-white border-slate-200 text-xs shadow-xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-1">
                  Departamento / Categoría
                </label>
                <TreeSelect
                  value={reportCategoryId ? String(reportCategoryId) : null}
                  options={categoriesTree}
                  disabled={Boolean(reportSessionId)}
                  onChange={(e) => setReportCategoryId(e.value ? Number(e.value) : null)}
                  placeholder="Todos los departamentos..."
                  filter
                  filterBy="label,rawName,fullPath"
                  filterMode="lenient"
                  showClear
                  className="w-full !rounded-xl !bg-white border-slate-200 text-xs shadow-xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-1">
                  Responsable del Conteo
                </label>
                <InputText
                  value={responsibleName}
                  onChange={(e) => setResponsibleName(e.target.value)}
                  placeholder="Opcional (o en blanco para firma)"
                  className="w-full !rounded-xl !bg-white border-slate-200 text-xs shadow-xs !py-2"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-1">
                  Buscar Artículo
                </label>
                <div className="flex gap-1.5">
                  <InputText
                    type="search"
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') loadCountSheet();
                    }}
                    placeholder="Código, barra o nombre..."
                    className="w-full !rounded-xl !bg-white border-slate-200 text-xs shadow-xs !py-2"
                  />
                  <Button
                    icon="pi pi-search"
                    onClick={loadCountSheet}
                    loading={sheetLoading}
                    className="!rounded-xl !bg-blue-600 !border-blue-600 text-white shrink-0"
                  />
                </div>
              </div>
            </div>

            {/* Paper-Style Preview matching the user's attached report */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 md:p-8 shadow-inner">
              {/* Neo ERP Official Subheader */}
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4">
                <span>NEO ERP — SISTEMA DE GESTIÓN DE INVENTARIO</span>
                <span>
                  {showTheoreticalStock ? 'VISTA CON EXISTENCIA TEÓRICA' : 'VISTA DE CONTEO CIEGO (EXISTENCIA OCULTA)'}
                </span>
              </div>

              {/* Classic Two-Column Report Header (like attached image) */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start mb-6">
                <div className="md:col-span-5 text-center flex flex-col justify-center">
                  <h2 className="text-lg md:text-xl font-normal text-slate-900 tracking-wide m-0">
                    {sheetData?.company_name || 'CATANIA HIPERMERCADO, C.A.'}
                  </h2>
                  <p className="text-sm text-slate-800 mt-1.5 mb-0">
                    Localidades: <span className="font-semibold">{sheetData?.facility_name || 'TODAS'}</span>
                  </p>
                  {sheetData?.session_code && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-bold mx-auto">
                      <span>Toma Física: [{sheetData.session_code}] {sheetData.session_name}</span>
                    </div>
                  )}
                </div>

                <div className="md:col-span-7 text-center">
                  <div className="border-b border-slate-900 pb-1 text-sm md:text-base text-slate-900 tracking-wide">
                    REPORTE DE PRODUCTOS - TOMA DE INVENTARIO
                  </div>
                  <div className="border-b border-slate-900 py-1.5 text-xs md:text-sm font-bold text-slate-900 leading-snug">
                    Depósito: {sheetData?.deposit_name || 'TODOS'}, Departamento:{' '}
                    {sheetData?.department_name || 'TODOS'}, Moneda: {sheetData?.currency_name || 'BOLIVAR DIGITAL'}
                  </div>
                  <div className="flex justify-between items-center pt-1.5 text-xs md:text-sm text-slate-900 px-1">
                    <span>
                      Fecha de Emisión <strong>{sheetData?.emission_date || new Date().toLocaleDateString('es-VE')}</strong>
                    </span>
                    <span>
                      Total Productos: <strong>{sheetData?.total_items ?? 0}</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Deposit & Responsible Sub-bar */}
              <div className="grid grid-cols-12 gap-2 items-center text-xs font-bold text-slate-900 mb-2 px-1">
                <div className="col-span-2 sm:col-span-1">Depósito</div>
                <div className="col-span-2 sm:col-span-1 font-mono">{sheetData?.deposit_code || '---'}</div>
                <div className="col-span-8 sm:col-span-5">{sheetData?.deposit_name || 'TODOS LOS DEPÓSITOS'}</div>
                <div className="col-span-12 sm:col-span-5 sm:text-right">
                  Responsable:{' '}
                  <span className="font-normal underline decoration-slate-400">
                    {responsibleName || '________________________________'}
                  </span>
                </div>
              </div>

              {/* Accessible Responsive Table Wrapper with Sticky Headers */}
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="count-sheet-caption"
                className="overflow-auto max-w-full max-h-[65vh] border-t border-slate-200"
              >
                <table className="w-full border-collapse text-left">
                  <caption id="count-sheet-caption" className="sr-only">
                    Reporte de productos para toma de inventario físico
                  </caption>
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b-4 border-double border-slate-900 text-xs font-bold text-slate-900">
                      <th className="py-2.5 px-2 w-[160px]">Producto</th>
                      <th className="py-2.5 px-2">Descripción del Producto</th>
                      {showTheoreticalStock && (
                        <th className="py-2.5 px-4 text-right w-[140px]">Existencia</th>
                      )}
                      <th className="py-2.5 px-2 text-center w-[160px]">Existencia Real</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                    {sheetLoading ? (
                      <tr>
                        <td colSpan={showTheoreticalStock ? 4 : 3} className="py-12 text-center text-slate-400 font-semibold">
                          <i className="pi pi-spin pi-spinner mr-2"></i> Generando planilla de toma de inventario...
                        </td>
                      </tr>
                    ) : !sheetData?.items || sheetData.items.length === 0 ? (
                      <tr>
                        <td colSpan={showTheoreticalStock ? 4 : 3} className="py-12 text-center text-slate-400">
                          No se encontraron productos para los filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      sheetData.items.map((item: any) => (
                        <tr key={item.variant_id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-1.5 px-2 font-mono text-[11px] text-slate-800 whitespace-nowrap">
                            {resolveProductCode(item)}
                          </td>
                          <td className="py-1.5 px-2 font-medium text-slate-900">
                            {item.description}
                          </td>
                          {showTheoreticalStock && (
                            <td className="py-1.5 px-4 text-right font-mono tabular-nums text-slate-900">
                              {formatStockNumber(item.theoretical_qty)}
                            </td>
                          )}
                          <td className="py-1.5 px-2 text-center">
                            <div className="border-b border-slate-900 w-28 h-4 mx-auto"></div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* TAB 2: SESIONES DE TOMA FÍSICA */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sessions list (col-4) */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
            <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-800 m-0">Tomas de Inventario</h3>
                <Button label="Nuevo" icon="pi pi-plus" size="small" rounded className="!bg-blue-600 !border-blue-600" onClick={() => setShowCreateDialog(true)} />
              </div>

              <style dangerouslySetInnerHTML={{__html: `
                .session-row-active {
                  background-color: #f0f7ff !important;
                  border-left: 4px solid #3b82f6 !important;
                }
              `}} />

              <DataTable
                value={sessions}
                loading={loading}
                selectionMode="single"
                onSelectionChange={(e) => selectSession(e.value)}
                dataKey="id"
                rowClassName={(data) => selectedSession?.id === data.id ? 'session-row-active' : ''}
                emptyMessage="No hay tomas registradas"
                className="premium-datatable cursor-pointer"
              >
                <Column field="name" header="SESIÓN" className="font-semibold text-slate-800 text-[13px]"></Column>
                <Column header="ESTADO" body={stateBodyTemplate} style={{ width: '30%' }}></Column>
              </DataTable>
            </div>
          </div>

          {/* Detail panel (col-8) */}
          <div className="col-span-12 lg:col-span-8">
            {selectedSession ? (
              <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden relative">
                <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-90"></div>
                
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-5 mb-5">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xl font-black text-slate-900 m-0">{selectedSession.name}</h2>
                        {getScopeBadge(selectedSession)}
                        {stateBodyTemplate(selectedSession)}
                      </div>
                      <p className="text-slate-500 text-xs mt-1 font-medium">
                        Creado el {new Date(selectedSession.date_start).toLocaleString('es-VE')}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        label="Ver / Imprimir Planilla"
                        icon="pi pi-print"
                        outlined
                        rounded
                        size="small"
                        onClick={() => {
                          setReportSessionId(selectedSession.id);
                          setActiveTab('report');
                        }}
                      />
                      {selectedSession.state !== 'DONE' && selectedSession.state !== 'CANCELLED' && (
                        <>
                          <Button label="Subir CSV" icon="pi pi-upload" severity="secondary" rounded size="small" onClick={() => setShowUploadDialog(true)} />
                          {isSupervisor && (
                            <Button label="Consolidar" icon="pi pi-check" severity="success" rounded size="small" onClick={handleValidateSession} />
                          )}
                          <Button
                            label="Cancelar Toma"
                            icon="pi pi-times-circle"
                            severity="danger"
                            outlined
                            rounded
                            size="small"
                            onClick={() => {
                              setCancelReason('');
                              setShowCancelDialog(true);
                            }}
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {selectedSession.state === 'CANCELLED' && (
                    <div className="mb-5 bg-rose-50/90 border border-rose-200/90 rounded-2xl p-4 flex gap-3.5 items-start shadow-sm">
                      <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0 mt-0.5 border border-rose-200">
                        <i className="pi pi-ban text-rose-600 text-lg"></i>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <h4 className="text-rose-900 text-xs font-black uppercase tracking-wider m-0 flex items-center gap-1.5">
                            <span>Toma Física Cancelada</span>
                            <span className="text-[10px] font-bold text-rose-500 bg-rose-100/80 px-2 py-0.5 rounded-full">No consolidada</span>
                          </h4>
                          {selectedSession.cancelled_at && (
                            <span className="text-rose-600 text-[11px] font-semibold">
                              {new Date(selectedSession.cancelled_at).toLocaleString('es-VE')}
                            </span>
                          )}
                        </div>
                        <p className="text-rose-900 text-xs mt-1.5 font-medium leading-relaxed">
                          <strong className="font-bold text-rose-950">Motivo:</strong> {selectedSession.cancellation_reason || 'Sin motivo especificado'}
                        </p>
                        {selectedSession.cancelled_by_name && (
                          <p className="text-rose-700 text-[11px] mt-1 font-semibold flex items-center gap-1.5">
                            <i className="pi pi-user text-[11px]"></i>
                            <span>Cancelado por: <strong>{selectedSession.cancelled_by_name}</strong></span>
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {isSupervisor && selectedSession.lines?.some((l: any) => l.is_anomaly) && (
                    <div className="mb-5 bg-rose-50 border border-rose-200/80 rounded-2xl p-4 flex gap-3 items-start animate-pulse">
                      <i className="pi pi-exclamation-triangle text-rose-500 text-lg mt-0.5"></i>
                      <div>
                        <h4 className="text-rose-800 text-xs font-extrabold uppercase tracking-wider">Alerta de IA / Desviaciones Anómalas Detectadas</h4>
                        <p className="text-rose-600 text-xs mt-0.5 font-semibold">
                          Se han detectado diferencias significativas de stock o conteo en artículos de alto valor. Se sugiere realizar reconteo antes de consolidar.
                        </p>
                      </div>
                    </div>
                  )}

                  <DataTable
                    value={selectedSession.lines || []}
                    paginator
                    rows={10}
                    emptyMessage={
                      <div className="flex flex-col items-center justify-center p-8 text-slate-400">
                        <i className="pi pi-upload text-4xl mb-3 opacity-50"></i>
                        <p className="font-semibold text-sm">No hay líneas en esta sesión de conteo.</p>
                        {selectedSession.state !== 'DONE' && selectedSession.state !== 'CANCELLED' && (
                          <Button label="Cargar Primeras Líneas" size="small" severity="info" text className="mt-2" onClick={() => setShowUploadDialog(true)} />
                        )}
                      </div>
                    }
                    className="premium-datatable"
                  >
                    <Column field="product_variant_id" header="ARTÍCULO" body={(r) => (
                      <div className="flex flex-col">
                        {r.product_name && <span className="font-bold text-xs text-slate-800">{r.product_name}</span>}
                        <span className="font-mono text-[10px] text-slate-600 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded w-fit mb-1">
                          SKU: {r.sku || r.product_variant_id}
                        </span>
                        {r.is_anomaly && (
                          <span className="text-[10px] text-rose-600 font-bold flex items-center gap-1">
                            <i className="pi pi-exclamation-circle"></i> Anómalo
                          </span>
                        )}
                      </div>
                    )} style={{ width: '25%' }}></Column>

                    <Column field="location_id" header="UBICACIÓN" body={(r) => (
                      <span className="font-bold text-slate-600 text-xs">Ubicación ID: {r.location_id}</span>
                    )} style={{ width: '15%' }}></Column>

                    <Column field="counted_qty" header="CONTEO FÍSICO" body={(r) => (
                      <span className="font-extrabold text-blue-700 text-sm tabular-nums">{formatQuantity(r.counted_qty, r.uom_base, true)}</span>
                    )} style={{ width: '15%' }}></Column>

                    {isSupervisor && (
                      <Column field="theoretical_qty" header="STOCK SISTEMA" body={(r) => (
                        <span className="font-semibold text-slate-500 text-sm tabular-nums">{formatQuantity(r.theoretical_qty, r.uom_base, true)}</span>
                      )} style={{ width: '15%' }}></Column>
                    )}

                    {isSupervisor && (
                      <Column header="DIFERENCIA" body={(r) => {
                        const diff = (r.counted_qty || 0) - (r.theoretical_qty || 0);
                        const color = diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600 font-extrabold' : 'text-slate-400';
                        const prefix = diff > 0 ? '+' : '';
                        return <span className={`font-black text-sm tabular-nums ${color}`}>{prefix}{formatQuantity(diff, r.uom_base, true)}</span>;
                      }} style={{ width: '15%' }}></Column>
                    )}

                    <Column header="COMENTARIOS / ALERTAS" body={(r) => (
                      <div className="flex flex-col gap-0.5 max-w-[200px]">
                        {r.notes && <span className="text-slate-500 text-xs">{r.notes}</span>}
                        {r.anomaly_reason && <span className="text-rose-500 text-[10px] font-semibold">{r.anomaly_reason}</span>}
                      </div>
                    )} style={{ width: '15%' }}></Column>
                  </DataTable>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[400px] bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center p-8 text-slate-400">
                <i className="pi pi-check-square text-6xl mb-4 opacity-30"></i>
                <p className="font-extrabold text-lg m-0">Seleccione una Sesión de Conteo</p>
                <p className="text-xs text-slate-400 mt-1">Cree una nueva sesión o seleccione una existente de la lista lateral.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialog: Create Session */}
      <Dialog header="Nueva Toma de Inventario" visible={showCreateDialog} style={{ width: '35vw' }} onHide={() => setShowCreateDialog(false)} className="backdrop-blur-sm">
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Nombre / Identificador</label>
            <InputText value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)} placeholder="Ej. Inventario Anual Pasillo A" className="w-full !rounded-xl border-slate-200 focus:!border-blue-400" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Sucursal / Localidad</label>
            <Dropdown
              value={selectedFacility}
              options={facilities}
              optionLabel="name"
              optionValue="id"
              onChange={(e) => setSelectedFacility(e.value)}
              placeholder="Seleccionar sucursal"
              className="w-full !rounded-xl border-slate-200 focus:!border-blue-400"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Tipo de Alcance</label>
            <Dropdown
              value={scopeType}
              options={scopeOptions}
              onChange={(e) => setScopeType(e.value)}
              className="w-full !rounded-xl border-slate-200 focus:!border-blue-400"
            />
          </div>

          {scopeType === 'WAREHOUSE' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Seleccionar Almacén</label>
              <Dropdown
                value={selectedWarehouse}
                options={warehouses}
                optionLabel="name"
                optionValue="id"
                onChange={(e) => setSelectedWarehouse(e.value)}
                placeholder="Seleccione almacén"
                disabled={!selectedFacility}
                className="w-full !rounded-xl border-slate-200 focus:!border-blue-400"
              />
            </div>
          )}

          {scopeType === 'CATEGORY' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Seleccionar Categoría Jerárquica</label>
              <TreeSelect
                value={selectedCategory ? String(selectedCategory) : null}
                options={categoriesTree}
                onChange={(e) => setSelectedCategory(e.value ? Number(e.value) : null)}
                placeholder="Seleccione categoría jerárquica (desplegable)..."
                filter
                filterBy="label"
                filterMode="lenient"
                showClear
                className="w-full !rounded-xl border-slate-200 focus:!border-blue-400 text-xs"
              />
            </div>
          )}

          {scopeType === 'LOCATION' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Código de Ubicación</label>
              <InputText value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} placeholder="Ej. PASILLO-A" className="w-full !rounded-xl border-slate-200" />
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <Button label="Cancelar" severity="secondary" text onClick={() => setShowCreateDialog(false)} />
            <Button label="Iniciar Sesión" className="!bg-blue-600 !border-blue-600" onClick={handleCreateSession} />
          </div>
        </div>
      </Dialog>

      {/* Dialog: Upload CSV */}
      <Dialog header="Carga Rápida (Doble Ciego)" visible={showUploadDialog} style={{ width: '40vw' }} onHide={() => setShowUploadDialog(false)} className="backdrop-blur-sm">
        <div className="flex flex-col gap-4 mt-2">
          <div>
            <p className="text-slate-500 text-xs font-medium m-0">
              Copie y pegue la lista física de productos contados. Ingrese una línea por cada artículo usando el formato:
            </p>
            <code className="block bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-mono text-slate-600 mt-2">
              SKU_O_CODIGO_BARRAS,CODIGO_UBICACION,CANTIDAD_CONTADA
            </code>
            <p className="text-[10px] text-slate-400 mt-1 italic">
              Ejemplo: 7591000123456,ALM1-P01,42 ó HARINA-PAN,ALM1-P01,42 (Acepta cualquier código de barra, Stellar o SKU)
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Listado de Conteo</label>
            <InputTextarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              rows={8}
              placeholder="HARINA-PAN,ALM1-P01,42&#10;POLLO-KG,NEVERA-1,35.5"
              className="w-full !rounded-xl border-slate-200 focus:!border-blue-400 font-mono text-xs p-3"
            />
          </div>

          {importStatus && (
            <Message severity={importStatus.type} text={importStatus.text} className="w-full" />
          )}

          <div className="flex justify-end gap-2 mt-2">
            <Button label="Cancelar" severity="secondary" text onClick={() => setShowUploadDialog(false)} />
            <Button label="Procesar e Importar" className="!bg-blue-600 !border-blue-600" onClick={handleCsvImport} />
          </div>
        </div>
      </Dialog>

      {/* Dialog: Cancelar Toma de Inventario */}
      <Dialog
        header={
          <div className="flex items-center gap-2 text-rose-600 font-extrabold text-base">
            <i className="pi pi-exclamation-triangle text-lg"></i>
            <span>Cancelar Toma Física de Inventario</span>
          </div>
        }
        visible={showCancelDialog}
        style={{ width: '480px' }}
        onHide={() => !cancelling && setShowCancelDialog(false)}
        className="backdrop-blur-sm"
      >
        <div className="flex flex-col gap-4 mt-2">
          <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-900 flex gap-2.5 items-start">
            <i className="pi pi-info-circle text-amber-600 mt-0.5 shrink-0 text-sm"></i>
            <div className="leading-relaxed">
              Por normativas de auditoría interna, este conteo <strong>no se eliminará</strong> de la base de datos. Quedará registrado en estado <strong>Cancelada</strong> con trazabilidad completa de usuario, fecha y justificación.
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700">
              Motivo o Justificación de la Cancelación <span className="text-rose-500">*</span>
            </label>
            <InputTextarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={4}
              placeholder="Indique detalladamente el motivo (ej. Toma duplicada por error, conteo suspendido por cambio de turno, recálculo de almacén...)"
              className="w-full !rounded-xl border-slate-200 focus:!border-rose-400 text-xs p-3"
              autoResize
              disabled={cancelling}
            />
            <div className="flex justify-between items-center text-[11px] text-slate-400">
              <span>Mínimo 5 caracteres</span>
              <span className={cancelReason.trim().length >= 5 ? 'text-emerald-600 font-semibold' : 'text-slate-400'}>
                {cancelReason.length} caracteres
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button
              label="Regresar"
              severity="secondary"
              text
              onClick={() => setShowCancelDialog(false)}
              disabled={cancelling}
            />
            <Button
              label={cancelling ? "Cancelando..." : "Confirmar Cancelación"}
              icon="pi pi-times-circle"
              severity="danger"
              onClick={handleCancelSession}
              loading={cancelling}
              disabled={!cancelReason.trim() || cancelReason.trim().length < 5 || cancelling}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
