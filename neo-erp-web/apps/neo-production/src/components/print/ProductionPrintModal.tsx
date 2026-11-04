"use client";

import React, { useState, useEffect, useRef, useId } from "react";

export type PaperFormat = "A4" | "THERMAL_80MM";

export interface PrintableOrderInput {
  id?: number;
  component_variant_id: number;
  component_sku: string;
  component_name: string;
  input_role: string;
  uom_base: string;
  is_discrete_uom?: boolean;
  planned_base_qty: number;
  consumed_base_qty: number;
  delta_qty_base?: number;
  delta_pct?: number;
  is_extra_input?: boolean;
  is_overridden?: boolean;
  batch_number?: string | null;
  batch_expiry_date?: string | null;
  unit_cost_usd: number;
  unit_cost_ves?: number;
  total_cost_usd?: number;
  total_cost_ves?: number;
}

export interface PrintableOrderOutput {
  id?: number;
  output_variant_id: number;
  output_sku: string;
  output_name: string;
  output_type: string;
  uom_base: string;
  planned_qty: number;
  actual_good_qty: number;
  explicit_damaged_qty: number;
  expected_yield_pct: number;
  actual_yield_pct: number;
  market_reference_price_usd?: number;
  current_sales_price_usd?: number;
  cost_allocation_pct: number;
  allocated_total_cost_usd: number;
  allocated_total_cost_ves?: number;
  calculated_unit_cost_usd: number;
  calculated_unit_cost_ves: number;
  current_inventory_stock_qty?: number;
  current_inventory_wavg_usd: number;
  current_inventory_wavg_ves?: number;
  generated_batch_number?: string | null;
  generated_batch_manufacturing_date?: string | null;
  generated_batch_expiry_date?: string | null;
}

export interface PrintableOrderData {
  id: number;
  order_number: string;
  state: string;
  order_type: string;
  sector: string;
  facility_name: string;
  source_warehouse_name: string;
  dest_warehouse_name: string;
  work_center_name?: string | null;
  bom_code: string;
  bom_name: string;
  bom_type?: string;
  bom_instructions?: string | null;
  instructions?: string | null;
  uom_id: string;
  expected_shrinkage_pct: number;
  shelf_life_days?: number;
  exchange_rate: number;
  base_qty?: number;
  scale_factor?: number;
  planned_base_qty: number;
  actual_input_weight_kg?: number;
  actual_good_output_weight_kg: number;
  actual_byproduct_weight_kg?: number;
  natural_shrinkage_qty: number;
  explicit_waste_qty: number;
  actual_labor_hours: number;
  cost_summary: {
    direct_materials_usd: number;
    direct_materials_ves: number;
    packaging_usd: number;
    packaging_ves: number;
    direct_labor_mod_usd: number;
    direct_labor_mod_ves: number;
    indirect_overhead_cif_usd: number;
    indirect_overhead_cif_ves: number;
    gross_production_cost_usd: number;
    gross_production_cost_ves: number;
    byproduct_credit_usd?: number;
    byproduct_credit_ves?: number;
    explicit_waste_cost_usd: number;
    explicit_waste_cost_ves: number;
    net_production_cost_usd: number;
    net_production_cost_ves: number;
  };
  kardex_links?: {
    picking_consumption_folio?: string | null;
    picking_output_folio?: string | null;
    waste_move_reference?: string | null;
  };
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  notes?: string | null;
  inputs: PrintableOrderInput[];
  outputs: PrintableOrderOutput[];
}

export interface PrintableBatchRunOrderItem {
  id?: number;
  order_number: string;
  state: string;
  work_center_name?: string | null;
  bom_code: string;
  bom_name: string;
  product_sku?: string | null;
  product_name: string;
  uom_id: string;
  scale_factor?: number;
  planned_base_qty: number;
  actual_good_qty: number;
  natural_shrinkage_qty?: number;
  explicit_damaged_qty?: number;
  net_production_cost_usd: number;
  net_production_cost_ves?: number;
  unit_cost_usd: number;
  unit_cost_ves?: number;
  new_wavg_cost_usd?: number;
  generated_batch_number?: string | null;
  generated_batch_expiry_date?: string | null;
  picking_consumption_name?: string | null;
  picking_output_name?: string | null;
}

export interface PrintableBatchConsolidatedInput {
  component_variant_id: number;
  component_sku: string;
  component_name: string;
  input_role: string;
  uom_base: string;
  recipes_count: number;
  recipe_codes?: string[];
  used_in_recipes?: Array<{
    bom_code: string;
    bom_name: string;
    required_base_qty: number;
    uom_base: string;
  }>;
  total_required_base_qty: number;
  available_stock_qty?: number;
  suggested_batch_number?: string | null;
  suggested_batch_expiry_date?: string | null;
  unit_cost_usd: number;
  unit_cost_ves?: number;
  total_cost_usd: number;
  total_cost_ves: number;
}

export interface PrintableBatchRunData {
  id?: number;
  plan_number: string;
  plan_date?: string | null;
  shift: string;
  sector: string;
  state: string; // "DRAFT_PREVIEW" | "ORDERS_GENERATED" | "CLOSED"
  execution_mode?: string;
  facility_name: string;
  source_warehouse_name: string;
  dest_warehouse_name: string;
  exchange_rate: number;
  notes?: string | null;
  orders_count?: number;
  completed_orders_count?: number;
  total_direct_materials_usd?: number;
  total_packaging_usd?: number;
  total_direct_labor_mod_usd?: number;
  total_indirect_overhead_cif_usd?: number;
  total_explicit_waste_cost_usd?: number;
  total_cost_usd: number;
  total_cost_ves: number;
  orders: PrintableBatchRunOrderItem[];
  consolidated_inputs: PrintableBatchConsolidatedInput[];
}

interface ProductionPrintModalProps {
  open: boolean;
  onClose: () => void;
  mode?: "ORDER" | "BATCH_RUN";
  order?: PrintableOrderData | null;
  batchRun?: PrintableBatchRunData | null;
  defaultFormat?: PaperFormat;
}

const SHIFT_NAMES: Record<string, string> = {
  MORNING: "Mañana (Matutino)",
  AFTERNOON: "Tarde (Vespertino)",
  NIGHT: "Noche (Nocturno)",
  FULL_DAY: "Jornada Completa",
};

const SECTOR_NAMES: Record<string, string> = {
  BAKERY: "Panadería & Pastelería",
  GASTRONOMY: "Cocina & Gastronomía",
  MEAT_PROCESSING: "Sala de Desposte & Cárnicos",
  ALL: "Multi-Sector Convergente",
};

const OUTPUT_TYPE_NAMES: Record<string, string> = {
  PRIMARY_PRODUCT: "Corte Principal",
  CO_PRODUCT: "Co-Producto",
  BY_PRODUCT: "Subproducto (VRN)",
};

function fmtNum(val: number | undefined | null, decimals = 2): string {
  const n = Number(val || 0);
  return n.toLocaleString("es-VE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtQty(val: number | undefined | null): string {
  const n = Number(val || 0);
  if (Math.abs(n - Math.round(n)) < 0.0001) {
    return String(Math.round(n));
  }
  return Number(n.toFixed(4)).toString();
}

function fmtDate(iso?: string | null): string {
  if (!iso) return new Date().toLocaleString("es-VE");
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("es-VE");
  } catch {
    return iso;
  }
}

export function ProductionPrintModal({
  open,
  onClose,
  order,
  batchRun,
  defaultFormat = "A4",
}: ProductionPrintModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const printAreaRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  const isCompleted = order
    ? order.state === "COMPLETED"
    : batchRun
    ? batchRun.state === "CLOSED" ||
      (batchRun.orders.length > 0 && batchRun.orders.every((o) => o.state === "COMPLETED"))
    : false;

  const docKey = `${order?.id ?? ""}-${order?.state ?? ""}-${batchRun?.plan_number ?? ""}-${batchRun?.state ?? ""}`;
  const [format, setFormat] = useState<PaperFormat>(defaultFormat);
  const [costOverride, setCostOverride] = useState<{ key: string; value: boolean } | null>(null);
  const showCosts = costOverride?.key === docKey ? costOverride.value : isCompleted;
  const setShowCosts = (value: boolean) => setCostOverride({ key: docKey, value });

  // Native <dialog> open/close sync
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && (order || batchRun)) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, order, batchRun]);

  // Fallback for browsers without <dialog closedby="any"> support
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || typeof HTMLDialogElement === "undefined") return;
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      const handleBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!isDialogContent) {
          dialog.close();
        }
      };
      dialog.addEventListener("click", handleBackdropClick);
      return () => dialog.removeEventListener("click", handleBackdropClick);
    }
  }, [open, order, batchRun]);

  const handlePrintNow = () => {
    const contentEl = printAreaRef.current;
    if (!contentEl) return;

    const docTitle = order
      ? `${order.order_number} - Neo ERP Neo Producción`
      : `${batchRun?.plan_number || "CORRIDA-MASIVA"} - Neo ERP Neo Producción`;

    const isThermal = format === "THERMAL_80MM";

    const printWindow = window.open("", "_blank", isThermal ? "width=420,height=800" : "width=980,height=860");
    if (!printWindow) {
      window.alert("Por favor habilite las ventanas emergentes (pop-ups) en su navegador para imprimir.");
      window.print();
      return;
    }

    const headStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((node) => {
        if (node.tagName.toLowerCase() === "link") {
          const linkEl = node as HTMLLinkElement;
          return `<link rel="stylesheet" href="${linkEl.href}" />`;
        }
        return node.outerHTML;
      })
      .join("\n");

    const pageCss = isThermal
      ? `
        @page {
          size: 80mm auto;
          margin: 2mm;
        }
        html, body {
          margin: 0;
          padding: 0;
          width: 76mm;
          background: #ffffff;
          color: #000000;
          font-family: "Courier New", Courier, monospace;
          font-size: 11px;
          line-height: 1.3;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      `
      : `
        @page {
          size: letter portrait;
          margin: 10mm;
        }
        html, body {
          margin: 0;
          padding: 0;
          background: #ffffff;
          color: #0f172a;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 11px;
          line-height: 1.38;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      `;

    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${docTitle}</title>
  ${headStyles}
  <style>
    * { box-sizing: border-box; }
    ${pageCss}
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { text-align: left; vertical-align: top; }
    .overflow-x-auto { overflow: visible !important; max-block-size: none !important; }
    .sticky { position: static !important; }
    .flex { display: flex; }
    .justify-between { justify-content: space-between; }
    .items-center { align-items: center; }
    .items-start { align-items: flex-start; }
    .grid { display: grid; }
    .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .grid-cols-4, .sm\\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .gap-2 { gap: 8px; }
    .gap-2\\.5 { gap: 10px; }
    .gap-3 { gap: 12px; }
    .gap-8 { gap: 28px; }
    .space-y-0\\.5 > * + * { margin-top: 2px; }
    .space-y-1 > * + * { margin-top: 4px; }
    .space-y-1\\.5 > * + * { margin-top: 6px; }
    .space-y-3 > * + * { margin-top: 10px; }
    .space-y-4 > * + * { margin-top: 16px; }
    .pt-5 { padding-top: 20px; }
    .pt-7 { padding-top: 26px; }
    .p-1\\.5 { padding: 6px; }
    .p-2 { padding: 8px; }
    .p-2\\.5 { padding: 10px; }
    .p-3 { padding: 12px; }
    .pb-0\\.5 { padding-bottom: 2px; }
    .pb-1 { padding-bottom: 4px; }
    .my-1 { margin-top: 4px; margin-bottom: 4px; }
    .my-1\\.5 { margin-top: 6px; margin-bottom: 6px; }
    .border { border: 1px solid #cbd5e1; }
    .border-black { border-color: #000000 !important; }
    .border-b { border-bottom: 1px solid #cbd5e1; }
    .border-dashed { border-style: dashed !important; }
    .whitespace-pre-line { white-space: pre-line; }
    .text-right { text-align: right !important; }
    .text-center { text-align: center !important; }
    .font-mono { font-family: "Courier New", Courier, monospace; }
    .font-bold { font-weight: 700; }
    .font-black { font-weight: 900; }
    .uppercase { text-transform: uppercase; }
    /* A4 Specific Print Styles */
    .neo-a4-sheet {
      width: 100%;
      max-width: 780px;
      margin: 0 auto;
      background: #fff;
      color: #0f172a;
    }
    .neo-a4-header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 10px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .neo-brand-badge {
      display: inline-block;
      background: #0f172a;
      color: #ffffff;
      font-weight: 900;
      font-size: 13px;
      padding: 4px 10px;
      border-radius: 6px;
      letter-spacing: 0.04em;
    }
    .neo-status-stamp {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-weight: 900;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border: 1.5px solid #0f172a;
    }
    .neo-status-completed {
      background: #ecfdf5;
      color: #065f46;
      border-color: #059669;
    }
    .neo-status-floor {
      background: #fffbeb;
      color: #92400e;
      border-color: #d97706;
    }
    .neo-meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 8px 10px;
      margin-bottom: 12px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .neo-meta-item {
      font-size: 10.5px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .neo-meta-label {
      display: block;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      color: #475569;
    }
    .neo-meta-val {
      font-weight: 800;
      color: #0f172a;
    }
    .neo-section-title {
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      background: #0f172a;
      color: #ffffff;
      padding: 5px 10px;
      border-radius: 5px 5px 0 0;
      margin-top: 12px;
      margin-bottom: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      break-after: avoid;
      page-break-after: avoid;
    }
    .neo-table {
      width: 100%;
      border: 1px solid #94a3b8;
      margin-bottom: 10px;
      font-size: 10.5px;
    }
    .neo-table th {
      background: #f1f5f9;
      color: #1e293b;
      font-weight: 800;
      font-size: 9.5px;
      text-transform: uppercase;
      padding: 5px 6px;
      border: 1px solid #cbd5e1;
      position: static !important;
    }
    .neo-table td {
      padding: 5px 6px;
      border: 1px solid #cbd5e1;
      color: #0f172a;
    }
    .neo-write-box {
      display: inline-block;
      min-width: 85px;
      border-bottom: 1.5px solid #0f172a;
      height: 16px;
      vertical-align: bottom;
    }
    .neo-check-box {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 1.5px solid #0f172a;
      border-radius: 2px;
    }
    .neo-floor-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      border: 1px solid #94a3b8;
      padding: 10px;
      border-radius: 0 0 6px 6px;
      background: #ffffff;
      margin-bottom: 10px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .neo-floor-grid-3 {
      grid-template-columns: repeat(3, 1fr) !important;
    }
    .neo-floor-field {
      border: 1px dashed #64748b;
      border-radius: 6px;
      padding: 7px 9px;
      background: #f8fafc;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .neo-nic2-box {
      border: 1.5px solid #0f172a;
      border-radius: 0 0 6px 6px;
      padding: 10px;
      background: #f8fafc;
      margin-bottom: 12px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .neo-signatures {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 18px;
      margin-top: 26px;
      padding-top: 10px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .neo-sig-line {
      border-top: 1.5px solid #0f172a;
      padding-top: 5px;
      text-align: center;
      font-size: 9.5px;
      font-weight: 800;
      color: #1e293b;
    }
    .neo-footer {
      margin-top: 14px;
      border-top: 1px solid #cbd5e1;
      padding-top: 6px;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #475569;
      font-weight: 600;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    /* Thermal 80mm Specific Styles */
    .neo-thermal-ticket {
      width: 76mm;
      max-width: 76mm;
      margin: 0 auto;
      font-family: "Courier New", Courier, monospace;
      font-size: 11px;
      color: #000000;
      background: #ffffff;
    }
    .neo-thermal-divider {
      border-top: 1px dashed #000000;
      margin: 5px 0;
    }
    .neo-thermal-double {
      border-top: 2px solid #000000;
      margin: 5px 0;
    }
    .neo-thermal-title {
      font-weight: 900;
      font-size: 13px;
      text-align: center;
      text-transform: uppercase;
    }
    .neo-thermal-subtitle {
      font-weight: 700;
      font-size: 10.5px;
      text-align: center;
    }
    .neo-thermal-stamp {
      border: 1.5px solid #000;
      padding: 3px 4px;
      text-align: center;
      font-weight: 900;
      font-size: 11px;
      margin: 4px 0;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  ${contentEl.innerHTML}
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 150);
    };
  </script>
</body>
</html>`);
    printWindow.document.close();
  };

  if (!open || (!order && !batchRun)) return null;

  const isButchery =
    order?.order_type === "MEAT_DISASSEMBLY" || order?.bom_type === "DIVERGENT_DISASSEMBLY";
  const primaryOut = order?.outputs?.[0];
  const rate = order?.exchange_rate || batchRun?.exchange_rate || 40.0;
  const instructionsText = order?.bom_instructions || order?.instructions || null;
  const emissionTime = new Date().toLocaleString("es-VE");

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      className="m-auto p-0 bg-transparent border-0 w-full max-w-5xl backdrop:bg-slate-900/70 backdrop:backdrop-blur-xs"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-h-[92vh] flex flex-col overflow-hidden text-left">
        {/* BARRA SUPERIOR DE CONTROLES DEL MODAL DE IMPRESIÓN */}
        <div className="px-5 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white shrink-0 shadow-sm">
              <i className="pi pi-print text-lg"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-400/30">
                  Neo ERP • Neo Producción
                </span>
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                    isCompleted
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/40"
                      : "bg-amber-500/20 text-amber-300 border-amber-400/40"
                  }`}
                >
                  {isCompleted
                    ? "Acta Oficial de Liquidación NIC 2"
                    : "Hoja de Trabajo en Piso / Vale MFG-OUT"}
                </span>
              </div>
              <h2 id={titleId} className="text-base sm:text-lg font-black tracking-tight text-white mt-0.5">
                {order
                  ? `Impresión de Orden ${order.order_number} — ${primaryOut?.output_name || order.bom_name}`
                  : `Impresión de Corrida Masiva ${batchRun?.plan_number} (${batchRun?.orders.length} Fórmulas)`}
              </h2>
            </div>
          </div>

          {/* Controles Interactivos: Selector Carta/A4 vs 80mm + Switch Costos + Botón Imprimir */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Selector de Formato */}
            <div className="inline-flex rounded-xl bg-slate-800 p-1 border border-slate-700">
              <button
                type="button"
                onClick={() => setFormat("A4")}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  format === "A4"
                    ? "bg-orange-500 text-white shadow-xs"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <span>📄 Formato Carta / A4</span>
              </button>
              <button
                type="button"
                onClick={() => setFormat("THERMAL_80MM")}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  format === "THERMAL_80MM"
                    ? "bg-orange-500 text-white shadow-xs"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <span>🧾 Ticket Térmico 80mm</span>
              </button>
            </div>

            {/* Switch de Confidencialidad de Costos */}
            <label
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700/90 border border-slate-700 text-xs font-bold text-slate-200 cursor-pointer select-none"
              title="En órdenes en proceso se ocultan los costos por defecto para confidencialidad en piso de planta"
            >
              <input
                type="checkbox"
                checked={showCosts}
                onChange={(e) => setShowCosts(e.target.checked)}
                className="rounded text-orange-500 focus:ring-orange-500"
              />
              <span>💲 Mostrar costos en el impreso</span>
            </label>

            <button
              type="button"
              onClick={handlePrintNow}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md cursor-pointer transition-all"
            >
              <i className="pi pi-print text-xs"></i>
              <span>🖨️ Imprimir Ahora / Guardar PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer"
              title="Cerrar vista previa"
            >
              <i className="pi pi-times text-sm"></i>
            </button>
          </div>
        </div>

        {/* ÁREA DE VISTA PREVIA EN VIVO */}
        <div className="flex-1 overflow-y-auto bg-slate-200/80 p-4 sm:p-6 flex justify-center">
          <div
            ref={printAreaRef}
            className={`bg-white shadow-xl border border-slate-300 transition-all ${
              format === "THERMAL_80MM"
                ? "w-[330px] p-4 rounded-lg font-mono text-black"
                : "w-full max-w-[820px] p-6 sm:p-8 rounded-xl text-slate-900"
            }`}
          >
            {/* =========================================================================
                CASO 1: ORDEN INDIVIDUAL (CONVERGENTE O SALA DE DESPOSTE) — FORMATO CARTA / A4
               ========================================================================= */}
            {order && format === "A4" && (
              <div className="neo-a4-sheet space-y-3 text-xs">
                {/* ENCABEZADO OFICIAL NEO ERP */}
                <div className="neo-a4-header flex justify-between items-start border-b-2 border-slate-900 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="neo-brand-badge bg-slate-900 text-white font-black px-2.5 py-1 rounded text-xs">
                        NEO ERP — NEO PRODUCCIÓN
                      </span>
                      <span className="text-[11px] font-bold text-slate-600 uppercase">
                        {SECTOR_NAMES[order.sector] || order.sector}
                      </span>
                    </div>
                    <h1 className="text-base font-black text-slate-900 mt-1.5 uppercase tracking-tight">
                      {isCompleted
                        ? isButchery
                          ? "Acta Oficial de Liquidación de Desposte y Costeo Conjunto (NIC 2 Párrafo 14)"
                          : "Acta Oficial de Liquidación de Producción y Costeo (NIC 2 Párrafo 16)"
                        : isButchery
                        ? "Hoja de Trabajo de Sala de Desposte y Vale de Retiro de Canal (MFG-OUT)"
                        : "Hoja de Trabajo en Piso y Vale de Retiro de Insumos (MFG-OUT)"}
                    </h1>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Sucursal / Sede: <strong>{order.facility_name}</strong> • Estación:{" "}
                      <strong>{order.work_center_name || "Planta Central"}</strong> • Almacén:{" "}
                      <strong>{order.source_warehouse_name}</strong> →{" "}
                      <strong>{order.dest_warehouse_name}</strong>
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`neo-status-stamp inline-block px-2.5 py-1 rounded font-black text-[11px] uppercase border ${
                        isCompleted
                          ? "neo-status-completed bg-emerald-50 text-emerald-800 border-emerald-600"
                          : "neo-status-floor bg-amber-50 text-amber-900 border-amber-600"
                      }`}
                    >
                      {isCompleted
                        ? "✓ LIQUIDADA EN KARDEX (NIC 2)"
                        : `EN PISO DE PLANTA (${order.state})`}
                    </div>
                    <div className="font-mono text-sm font-black text-slate-900 mt-1">
                      Folio: {order.order_number}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Emisión: {emissionTime}
                    </div>
                  </div>
                </div>

                {/* FICHA TÉCNICA DE LA ORDEN */}
                <div className="neo-meta-grid grid grid-cols-3 gap-2.5 bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-[11px]">
                  <div className="neo-meta-item">
                    <span className="neo-meta-label text-[9px] font-extrabold uppercase text-slate-500 block">
                      {isButchery ? "Plantilla / Pieza Matriz" : "Producto Terminado a Elaborar"}
                    </span>
                    <span className="neo-meta-val font-black text-slate-900">
                      {isButchery
                        ? `${order.inputs[0]?.component_name || order.bom_name}`
                        : `${primaryOut?.output_name || order.bom_name}`}
                    </span>
                    <div className="text-[10px] text-slate-600 font-mono">
                      Fórmula: [{order.bom_code}] {order.bom_name}
                    </div>
                  </div>

                  <div className="neo-meta-item">
                    <span className="neo-meta-label text-[9px] font-extrabold uppercase text-slate-500 block">
                      {isButchery ? "Peso Canal Planificado / Real" : "Escala de Tanda y Meta Planificada"}
                    </span>
                    <span className="neo-meta-val font-mono font-black text-slate-900">
                      {isButchery ? (
                        <>
                          Plan: {fmtQty(order.planned_base_qty)} {order.uom_id} | Real:{" "}
                          {fmtQty(order.actual_input_weight_kg || order.planned_base_qty)} {order.uom_id}
                        </>
                      ) : (
                        <>
                          Meta: {fmtQty(order.planned_base_qty)} {order.uom_id}{" "}
                          {order.scale_factor ? `(Escala ×${Number(order.scale_factor.toFixed(2))})` : ""}
                        </>
                      )}
                    </span>
                    <div className="text-[10px] text-slate-600">
                      Merma Nat. Esp: {order.expected_shrinkage_pct}% • Vida Útil:{" "}
                      {order.shelf_life_days || 7} días
                    </div>
                  </div>

                  <div className="neo-meta-item">
                    <span className="neo-meta-label text-[9px] font-extrabold uppercase text-slate-500 block">
                      {isCompleted
                        ? "Trazabilidad Kardex, Lote y Fechas"
                        : "Fechas y Referencia Operativa"}
                    </span>
                    {isCompleted ? (
                      <>
                        <div className="font-mono font-bold text-slate-900 text-[10.5px]">
                          {order.kardex_links?.picking_consumption_folio || `MFG-OUT/${order.order_number}`}{" "}
                          • {order.kardex_links?.picking_output_folio || `MFG-IN/${order.order_number}`}
                        </div>
                        <div className="font-mono text-[10px] text-emerald-800 font-bold">
                          Lote:{" "}
                          {primaryOut?.generated_batch_number ||
                            `${order.outputs.filter((o) => o.generated_batch_number).length} Lotes Cárnicos`}{" "}
                          {primaryOut?.generated_batch_manufacturing_date
                            ? `(Elab: ${primaryOut.generated_batch_manufacturing_date}`
                            : ""}
                          {primaryOut?.generated_batch_expiry_date
                            ? `${primaryOut?.generated_batch_manufacturing_date ? " • " : "("}Vence: ${primaryOut.generated_batch_expiry_date})`
                            : primaryOut?.generated_batch_manufacturing_date
                            ? ")"
                            : ""}
                        </div>
                        <div className="text-[9.5px] text-slate-600">
                          Inicio: {order.started_at ? fmtDate(order.started_at) : "N/A"} • Cierre:{" "}
                          {order.completed_at ? fmtDate(order.completed_at) : emissionTime}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-semibold text-slate-800 text-[10.5px]">
                          Inicio: {order.started_at ? fmtDate(order.started_at) : "Por iniciar en piso"}
                        </div>
                        <div className="text-[10px] text-slate-600 font-mono">
                          Ubicación WIP: VIRT_PRODUCTION {showCosts ? `• BCV: Bs. ${fmtNum(rate)}` : ""}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* SECCIÓN 1: INSUMOS / MATERIA PRIMA (MFG-OUT) */}
                <div>
                  <div className="neo-section-title bg-slate-900 text-white px-3 py-1.5 rounded-t-md font-black text-[11px] uppercase flex justify-between items-center">
                    <span>
                      {isCompleted
                        ? "1. Auditoría de Consumos de Materia Prima y Empaque (Estándar vs. Real — MFG-OUT)"
                        : "1. Vale de Retiro de Materia Prima e Insumos desde Almacén (Picking FEFO — MFG-OUT)"}
                    </span>
                    <span className="font-mono text-[10px]">
                      Origen: {order.source_warehouse_name} ({order.inputs.length} ítems)
                    </span>
                  </div>

                  <div
                    tabIndex={0}
                    role="region"
                    aria-label="Tabla de insumos de la orden para impresión"
                    className="overflow-x-auto"
                  >
                    <table className="neo-table w-full border border-slate-400 text-[11px]">
                      <thead className="sticky top-0 z-10 bg-slate-100">
                        <tr className="bg-slate-100 border-b border-slate-300 text-[9.5px] font-extrabold uppercase text-slate-700">
                          <th className="py-1.5 px-2 sticky top-0 bg-slate-100">Código / Insumo</th>
                          <th className="py-1.5 px-2 sticky top-0 bg-slate-100">Rol</th>
                          <th className="py-1.5 px-2 sticky top-0 bg-slate-100">Lote FEFO / Vencimiento</th>
                          <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Cant. Fórmula</th>
                          {isCompleted ? (
                            <>
                              <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Cant. Real Usada</th>
                              <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Variación (Δ)</th>
                            </>
                          ) : (
                            <>
                              <th className="py-1.5 px-2 text-center sticky top-0 bg-slate-100">Cant. Real Usada (Piso)</th>
                              <th className="py-1.5 px-2 text-center sticky top-0 bg-slate-100">Check</th>
                            </>
                          )}
                          {showCosts && (
                            <>
                              <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Costo Unit. ($)</th>
                              <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Subtotal ($ / Bs.)</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {order.inputs.map((inp, idx) => {
                          const stdQty = Number(inp.planned_base_qty || 0);
                          const realQty = Number(inp.consumed_base_qty ?? inp.planned_base_qty ?? 0);
                          const delta = Number((realQty - stdQty).toFixed(4));
                          const subUsd = realQty * Number(inp.unit_cost_usd || 0);
                          const subVes = subUsd * rate;
                          return (
                            <tr key={inp.id || idx}>
                              <td className="py-1.5 px-2">
                                <div className="font-bold text-slate-900">{inp.component_name}</div>
                                <div className="font-mono text-[9.5px] text-slate-500">
                                  SKU: {inp.component_sku}
                                  {inp.is_extra_input ? " • [INSUMO EXTRA]" : ""}
                                </div>
                              </td>
                              <td className="py-1.5 px-2 font-mono text-[10px]">
                                {inp.input_role}
                              </td>
                              <td className="py-1.5 px-2 font-mono text-[10px]">
                                <div className="font-bold text-slate-900">
                                  {inp.batch_number || "FEFO-ESTÁNDAR"}
                                </div>
                                {inp.batch_expiry_date && (
                                  <div className="text-[9.5px] text-slate-500">
                                    Vence: {inp.batch_expiry_date}
                                  </div>
                                )}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono font-bold">
                                {fmtQty(isCompleted ? stdQty : realQty)} {inp.uom_base}
                              </td>
                              {isCompleted ? (
                                <>
                                  <td className="py-1.5 px-2 text-right font-mono font-black">
                                    {fmtQty(realQty)} {inp.uom_base}
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono text-[10px]">
                                    {Math.abs(delta) > 0.0001 ? (
                                      <span className="font-bold">
                                        {delta > 0 ? `+${fmtQty(delta)}` : fmtQty(delta)} {inp.uom_base}
                                      </span>
                                    ) : (
                                      <span className="text-slate-500">0 (Exacto)</span>
                                    )}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="py-1.5 px-2 text-center font-mono">
                                    <span className="neo-write-box inline-block min-w-[75px] border-b border-slate-800">
                                      &nbsp;
                                    </span>{" "}
                                    <span className="text-[9.5px] text-slate-500">{inp.uom_base}</span>
                                  </td>
                                  <td className="py-1.5 px-2 text-center">
                                    <span className="neo-check-box inline-block w-3.5 h-3.5 border border-slate-800"></span>
                                  </td>
                                </>
                              )}
                              {showCosts && (
                                <>
                                  <td className="py-1.5 px-2 text-right font-mono">
                                    ${Number(inp.unit_cost_usd || 0).toFixed(4)}
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono">
                                    <div className="font-bold">${subUsd.toFixed(2)}</div>
                                    <div className="text-[9.5px] text-slate-500">
                                      Bs. {fmtNum(subVes)}
                                    </div>
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* SECCIÓN 2 (OPCIONAL): INSTRUCCIONES TÉCNICAS DE LA RECETA / NOTAS */}
                {(instructionsText || order.notes) && (
                  <div>
                    <div className="neo-section-title bg-slate-800 text-white px-3 py-1 rounded-t-md font-black text-[10.5px] uppercase">
                      <span>2. Instrucciones Técnicas de Elaboración y Observaciones de Planta</span>
                    </div>
                    <div className="border border-slate-300 rounded-b-md p-2.5 bg-slate-50/70 text-[10.5px] space-y-1">
                      {instructionsText && (
                        <div>
                          <strong className="uppercase text-[9.5px] text-slate-600 block">
                            Procedimiento Estándar de la Receta ({order.bom_code}):
                          </strong>
                          <p className="whitespace-pre-line text-slate-800">{instructionsText}</p>
                        </div>
                      )}
                      {order.notes && (
                        <div>
                          <strong className="uppercase text-[9.5px] text-slate-600 block">
                            Notas / Observaciones de la Orden:
                          </strong>
                          <p className="text-slate-800">{order.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* SECCIÓN 3: CUADRO DE RENDIMIENTO / CORTES SEGÚN ESTADO Y TIPO */}
                {!isCompleted ? (
                  /* --- MODO EN PROCESO (HOJA DE PISO PARA LLENAR A MANO) --- */
                  isButchery ? (
                    <div>
                      <div className="neo-section-title bg-slate-900 text-white px-3 py-1.5 rounded-t-md font-black text-[11px] uppercase flex justify-between items-center">
                        <span>
                          3. Planilla de Pesaje en Balanza de Sala de Desposte (1 Canal → N Cortes)
                        </span>
                        <span className="font-mono text-[10px]">
                          Peso Canal Entrada:{" "}
                          {fmtQty(order.actual_input_weight_kg || order.planned_base_qty)} Kg
                        </span>
                      </div>
                      <div
                        tabIndex={0}
                        role="region"
                        aria-label="Planilla de pesaje de cortes en sala de desposte"
                        className="overflow-x-auto"
                      >
                        <table className="neo-table w-full border border-slate-400 text-[11px]">
                          <thead className="sticky top-0 z-10 bg-slate-100">
                            <tr className="bg-slate-100 border-b border-slate-300 text-[9.5px] font-extrabold uppercase text-slate-700">
                              <th className="py-1.5 px-2 sticky top-0 bg-slate-100">Corte / Subproducto Esperado</th>
                              <th className="py-1.5 px-2 sticky top-0 bg-slate-100">Clasificación</th>
                              <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">% Yield Esp.</th>
                              <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Peso Estimado</th>
                              <th className="py-1.5 px-2 text-center sticky top-0 bg-slate-100">Peso Real Bueno (Balanza)</th>
                              <th className="py-1.5 px-2 text-center sticky top-0 bg-slate-100">Merma Dañada (Kg)</th>
                              <th className="py-1.5 px-2 text-center sticky top-0 bg-slate-100">Check</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {order.outputs.map((out, idx) => (
                              <tr key={out.id || idx}>
                                <td className="py-1.5 px-2">
                                  <div className="font-bold text-slate-900">{out.output_name}</div>
                                  <div className="font-mono text-[9.5px] text-slate-500">
                                    SKU: {out.output_sku}
                                  </div>
                                </td>
                                <td className="py-1.5 px-2 text-[10px]">
                                  {OUTPUT_TYPE_NAMES[out.output_type] || out.output_type}
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono">
                                  {Number(out.expected_yield_pct || 0).toFixed(2)}%
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono font-bold">
                                  {Number(out.planned_qty || 0).toFixed(2)} {out.uom_base}
                                </td>
                                <td className="py-1.5 px-2 text-center font-mono">
                                  <span className="neo-write-box inline-block min-w-[80px] border-b border-slate-800">
                                    &nbsp;
                                  </span>{" "}
                                  Kg
                                </td>
                                <td className="py-1.5 px-2 text-center font-mono">
                                  <span className="neo-write-box inline-block min-w-[65px] border-b border-slate-800">
                                    &nbsp;
                                  </span>{" "}
                                  Kg
                                </td>
                                <td className="py-1.5 px-2 text-center">
                                  <span className="neo-check-box inline-block w-3.5 h-3.5 border border-slate-800"></span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="neo-floor-grid neo-floor-grid-3 grid grid-cols-3 gap-2.5 border border-slate-300 rounded-md p-2.5 bg-slate-50 text-[10.5px]">
                        <div className="neo-floor-field border border-dashed border-slate-400 rounded p-2 bg-white">
                          <span className="font-bold uppercase text-[9.5px] text-slate-600 block">
                            Merma por Oreo / Goteo (Kg):
                          </span>
                          <div className="mt-2 font-mono text-xs">
                            [ ________________________ Kg ]
                          </div>
                        </div>
                        <div className="neo-floor-field border border-dashed border-slate-400 rounded p-2 bg-white">
                          <span className="font-bold uppercase text-[9.5px] text-slate-600 block">
                            Total Peso Contabilizado (100%):
                          </span>
                          <div className="mt-2 font-mono text-xs">
                            [ ________________________ Kg ]
                          </div>
                        </div>
                        <div className="neo-floor-field border border-dashed border-slate-400 rounded p-2 bg-white">
                          <span className="font-bold uppercase text-[9.5px] text-slate-600 block">
                            Horas Reales Cuadrilla (MOD):
                          </span>
                          <div className="mt-2 font-mono text-xs">
                            [ _______________________ HRS ]
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Receta Convergente en Proceso: Cuadro de Cierre en Piso para anotar a mano */
                    <div>
                      <div className="neo-section-title bg-slate-900 text-white px-3 py-1.5 rounded-t-md font-black text-[11px] uppercase flex justify-between items-center">
                        <span>
                          3. Cuadro de Cierre de Rendimiento en Piso de Planta (Para Llenar a Mano)
                        </span>
                        <span className="font-mono text-[10px]">
                          Meta Esperada: {fmtQty(order.planned_base_qty)} {order.uom_id}
                        </span>
                      </div>
                      <div className="neo-floor-grid grid grid-cols-2 gap-3 border border-slate-400 rounded-b-md p-3 bg-white">
                        <div className="neo-floor-field border border-dashed border-slate-400 rounded-lg p-2.5 bg-slate-50">
                          <span className="text-[10px] font-black uppercase text-emerald-900 block">
                            1. Producción Buena Real Obtenida (MFG-IN):
                          </span>
                          <span className="text-[9.5px] text-slate-500 block mb-2">
                            Unidades / Kg aptos para ingreso a {order.dest_warehouse_name}
                          </span>
                          <div className="font-mono text-xs font-bold text-slate-900">
                            Cant. Buena: [ ______________________ {order.uom_id} ]
                          </div>
                        </div>

                        <div className="neo-floor-field border border-dashed border-slate-400 rounded-lg p-2.5 bg-slate-50">
                          <span className="text-[10px] font-black uppercase text-amber-900 block">
                            2. Merma Térmica / Cocción / Evaporación (NIC 2):
                          </span>
                          <span className="text-[9.5px] text-slate-500 block mb-2">
                            Merma natural esperada ({order.expected_shrinkage_pct}% ref.)
                          </span>
                          <div className="font-mono text-xs font-bold text-slate-900">
                            Merma Nat.: [ ______________________ {order.uom_id} ]
                          </div>
                        </div>

                        <div className="neo-floor-field border border-dashed border-slate-400 rounded-lg p-2.5 bg-slate-50">
                          <span className="text-[10px] font-black uppercase text-red-900 block">
                            3. Merma Dañada / Descarte Explícito (VIRT_LOSS):
                          </span>
                          <span className="text-[9.5px] text-slate-500 block mb-2">
                            Producto quemado o defectuoso (no capitalizable)
                          </span>
                          <div className="font-mono text-xs font-bold text-slate-900">
                            Merma Dañ.: [ ______________________ {order.uom_id} ]
                          </div>
                        </div>

                        <div className="neo-floor-field border border-dashed border-slate-400 rounded-lg p-2.5 bg-slate-50">
                          <span className="text-[10px] font-black uppercase text-slate-800 block">
                            4. Horas Reales Trabajadas (MOD) y Lote Asignado:
                          </span>
                          <span className="text-[9.5px] text-slate-500 block mb-2">
                            Tiempo efectivo de horneado/cocción en estación
                          </span>
                          <div className="font-mono text-xs font-bold text-slate-900">
                            Horas MOD: [ _________ HRS ] • Lote: L-{order.order_number}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  /* --- MODO COMPLETADA (ACTA OFICIAL DE LIQUIDACIÓN NIC 2) --- */
                  isButchery ? (
                    <div>
                      <div className="neo-section-title bg-slate-900 text-white px-3 py-1.5 rounded-t-md font-black text-[11px] uppercase flex justify-between items-center">
                        <span>
                          2. Balance de Masa y Liquidación Conjunta de Cortes (NIC 2 Párrafo 14 — MFG-IN)
                        </span>
                        <span className="font-mono text-[10px]">
                          Entrada Canal: {fmtNum(order.actual_input_weight_kg || order.planned_base_qty)} Kg | Oreo:{" "}
                          {fmtNum(order.natural_shrinkage_qty)} Kg | Dañado: {fmtNum(order.explicit_waste_qty)} Kg
                        </span>
                      </div>
                      <div
                        tabIndex={0}
                        role="region"
                        aria-label="Tabla de cortes obtenidos en liquidación de desposte"
                        className="overflow-x-auto"
                      >
                        <table className="neo-table w-full border border-slate-400 text-[10.5px]">
                          <thead className="sticky top-0 z-10 bg-slate-100">
                            <tr className="bg-slate-100 border-b border-slate-300 text-[9.5px] font-extrabold uppercase text-slate-700">
                              <th className="py-1.5 px-2 sticky top-0 bg-slate-100">Corte / Subproducto</th>
                              <th className="py-1.5 px-2 sticky top-0 bg-slate-100">Lote Sanitario / Vigencia</th>
                              <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Peso Real Bueno</th>
                              <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">% Yield (Esp / Real)</th>
                              {showCosts && (
                                <>
                                  <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">% Absorción</th>
                                  <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Costo Unit. ($ / Bs.)</th>
                                  <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Nuevo WAVG ($/Kg)</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {order.outputs.map((out, idx) => (
                              <tr key={out.id || idx}>
                                <td className="py-1.5 px-2">
                                  <div className="font-bold text-slate-900">{out.output_name}</div>
                                  <div className="font-mono text-[9.5px] text-slate-500">
                                    SKU: {out.output_sku} • {OUTPUT_TYPE_NAMES[out.output_type] || out.output_type}
                                  </div>
                                </td>
                                <td className="py-1.5 px-2 font-mono text-[10px]">
                                  <div className="font-bold text-emerald-800">
                                    {out.generated_batch_number || `L-${order.order_number}-${out.output_sku}`}
                                  </div>
                                  <div className="text-[9.5px] text-slate-500">
                                    Elab: {out.generated_batch_manufacturing_date || "Hoy"}
                                    {out.generated_batch_expiry_date
                                      ? ` • Vence: ${out.generated_batch_expiry_date}`
                                      : ""}
                                  </div>
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono font-black">
                                  {Number(out.actual_good_qty || 0).toFixed(2)} {out.uom_base}
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono text-[10px]">
                                  {Number(out.expected_yield_pct || 0).toFixed(1)}% →{" "}
                                  <strong>{Number(out.actual_yield_pct || 0).toFixed(2)}%</strong>
                                </td>
                                {showCosts && (
                                  <>
                                    <td className="py-1.5 px-2 text-right font-mono">
                                      {out.output_type === "BY_PRODUCT"
                                        ? "Crédito VRN"
                                        : `${Number(out.cost_allocation_pct || 0).toFixed(2)}%`}
                                    </td>
                                    <td className="py-1.5 px-2 text-right font-mono">
                                      <div className="font-black text-slate-900">
                                        ${Number(out.calculated_unit_cost_usd || 0).toFixed(4)}
                                      </div>
                                      <div className="text-[9.5px] text-slate-500">
                                        Bs. {fmtNum(out.calculated_unit_cost_ves)}
                                      </div>
                                    </td>
                                    <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-800">
                                      ${Number(out.current_inventory_wavg_usd || 0).toFixed(4)}
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    /* Receta Convergente Completada: Balance de Masa y Lote Sanitario */
                    <div>
                      <div className="neo-section-title bg-slate-900 text-white px-3 py-1.5 rounded-t-md font-black text-[11px] uppercase flex justify-between items-center">
                        <span>
                          2. Balance de Masa, Rendimiento Real (% Yield) y Lote Sanitario (MFG-IN)
                        </span>
                        <span className="font-mono text-[10px]">
                          Folio Kardex Entrada:{" "}
                          {order.kardex_links?.picking_output_folio || `MFG-IN/${order.order_number}`}
                        </span>
                      </div>
                      <div
                        tabIndex={0}
                        role="region"
                        aria-label="Tabla de balance de masa y lote sanitario"
                        className="overflow-x-auto"
                      >
                        <table className="neo-table w-full border border-slate-400 text-[11px]">
                          <thead className="sticky top-0 z-10 bg-slate-100">
                            <tr className="bg-slate-100 border-b border-slate-300 text-[9.5px] font-extrabold uppercase text-slate-700">
                              <th className="py-1.5 px-2 sticky top-0 bg-slate-100">Producto Terminado</th>
                              <th className="py-1.5 px-2 sticky top-0 bg-slate-100">Lote Sanitario / Vigencia</th>
                              <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Meta Plan.</th>
                              <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Salida Buena</th>
                              <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Merma Térmica</th>
                              <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Merma Dañada</th>
                              <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">% Yield Real</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="py-2 px-2">
                                <div className="font-black text-slate-900">
                                  {primaryOut?.output_name || order.bom_name}
                                </div>
                                <div className="font-mono text-[9.5px] text-slate-500">
                                  SKU: {primaryOut?.output_sku || order.bom_code}
                                </div>
                              </td>
                              <td className="py-2 px-2 font-mono text-[10px]">
                                <div className="font-black text-emerald-800">
                                  {primaryOut?.generated_batch_number || `L-${order.order_number}`}
                                </div>
                                <div className="text-[9.5px] text-slate-600">
                                  Elab: {primaryOut?.generated_batch_manufacturing_date || "Hoy"} • Vence:{" "}
                                  <strong>{primaryOut?.generated_batch_expiry_date || "N/A"}</strong>
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right font-mono font-bold">
                                {fmtQty(order.planned_base_qty)} {order.uom_id}
                              </td>
                              <td className="py-2 px-2 text-right font-mono font-black text-emerald-800">
                                {fmtQty(primaryOut?.actual_good_qty ?? order.actual_good_output_weight_kg)}{" "}
                                {order.uom_id}
                              </td>
                              <td className="py-2 px-2 text-right font-mono">
                                {fmtQty(order.natural_shrinkage_qty)} {order.uom_id}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-red-700 font-bold">
                                {fmtQty(order.explicit_waste_qty)} {order.uom_id}
                              </td>
                              <td className="py-2 px-2 text-right font-mono font-black">
                                {order.planned_base_qty > 0
                                  ? (
                                      ((primaryOut?.actual_good_qty ?? order.actual_good_output_weight_kg) /
                                        order.planned_base_qty) *
                                      100
                                    ).toFixed(1)
                                  : "100.0"}
                                %
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                )}

                {/* SECCIÓN FINANCIERA NIC 2 (CUANDO showCosts === true) */}
                {showCosts && (
                  <div>
                    <div className="neo-section-title bg-slate-900 text-white px-3 py-1.5 rounded-t-md font-black text-[11px] uppercase flex justify-between items-center">
                      <span>
                        {isCompleted
                          ? "3. Resumen Financiero Bimonetario de Liquidación Contable (NIC 2)"
                          : "4. Proyección Financiera Bimonetaria de la Orden (NIC 2)"}
                      </span>
                      <span className="font-mono text-[10px]">
                        Tasa Oficial BCV: Bs. {fmtNum(rate)} / USD • Horas MOD: {order.actual_labor_hours} h
                      </span>
                    </div>
                    <div className="neo-nic2-box border border-slate-400 rounded-b-md p-3 bg-slate-50 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10.5px]">
                      <div>
                        <span className="text-[9px] font-extrabold uppercase text-slate-500 block">
                          Materiales + Empaque
                        </span>
                        <div className="font-mono font-bold text-slate-900">
                          $
                          {(
                            Number(order.cost_summary.direct_materials_usd || 0) +
                            Number(order.cost_summary.packaging_usd || 0)
                          ).toFixed(2)}{" "}
                          USD
                        </div>
                        <div className="font-mono text-[9.5px] text-slate-600">
                          Mat: ${Number(order.cost_summary.direct_materials_usd || 0).toFixed(2)} | Emp: $
                          {Number(order.cost_summary.packaging_usd || 0).toFixed(2)}
                        </div>
                      </div>

                      <div>
                        <span className="text-[9px] font-extrabold uppercase text-slate-500 block">
                          Conversión (MOD + CIF)
                        </span>
                        <div className="font-mono font-bold text-slate-900">
                          $
                          {(
                            Number(order.cost_summary.direct_labor_mod_usd || 0) +
                            Number(order.cost_summary.indirect_overhead_cif_usd || 0)
                          ).toFixed(2)}{" "}
                          USD
                        </div>
                        <div className="font-mono text-[9.5px] text-slate-600">
                          MOD: ${Number(order.cost_summary.direct_labor_mod_usd || 0).toFixed(2)} | CIF: $
                          {Number(order.cost_summary.indirect_overhead_cif_usd || 0).toFixed(2)}
                        </div>
                      </div>

                      <div>
                        <span className="text-[9px] font-extrabold uppercase text-slate-500 block">
                          Deducciones (VRN / Merma Anorm.)
                        </span>
                        <div className="font-mono font-bold text-red-700">
                          -$
                          {(
                            Number(order.cost_summary.byproduct_credit_usd || 0) +
                            Number(order.cost_summary.explicit_waste_cost_usd || 0)
                          ).toFixed(2)}{" "}
                          USD
                        </div>
                        <div className="font-mono text-[9.5px] text-slate-600">
                          Subprod: -${Number(order.cost_summary.byproduct_credit_usd || 0).toFixed(2)} |
                          Daño: -${Number(order.cost_summary.explicit_waste_cost_usd || 0).toFixed(2)}
                        </div>
                      </div>

                      <div className="bg-white p-2 rounded border border-slate-300">
                        <span className="text-[9px] font-black uppercase text-emerald-800 block">
                          Costo Neto Capitalizado
                        </span>
                        <div className="font-mono text-sm font-black text-slate-900">
                          ${Number(order.cost_summary.net_production_cost_usd || 0).toFixed(2)} USD
                        </div>
                        <div className="font-mono text-[10px] font-bold text-emerald-800">
                          Bs. {fmtNum(order.cost_summary.net_production_cost_ves)}
                        </div>
                        {!isButchery && primaryOut && (
                          <div className="font-mono text-[9.5px] text-slate-700 mt-0.5">
                            Unit: ${Number(primaryOut.calculated_unit_cost_usd || 0).toFixed(4)} | WAVG: $
                            {Number(primaryOut.current_inventory_wavg_usd || 0).toFixed(4)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* PIE DE FIRMAS Y MEMBRETE INFERIOR NEO ERP */}
                <div className="neo-signatures grid grid-cols-3 gap-8 pt-7">
                  <div className="neo-sig-line border-t border-slate-800 pt-1.5 text-center text-[10px] font-bold text-slate-800">
                    {isCompleted
                      ? "Liquidado por (Jefe de Planta / Operador)"
                      : "Entregado por Almacén (Despacho MFG-OUT)"}
                  </div>
                  <div className="neo-sig-line border-t border-slate-800 pt-1.5 text-center text-[10px] font-bold text-slate-800">
                    {isCompleted
                      ? `Recibido Conforme (${order.dest_warehouse_name})`
                      : "Ejecutado por Maestro / Operador de Piso"}
                  </div>
                  <div className="neo-sig-line border-t border-slate-800 pt-1.5 text-center text-[10px] font-bold text-slate-800">
                    {isCompleted
                      ? "Auditoría de Costos / Contabilidad NIC 2"
                      : "Supervisor de Planta / Control de Calidad"}
                  </div>
                </div>

                <div className="neo-footer border-t border-slate-300 pt-2 mt-3 flex justify-between items-center text-[9.5px] text-slate-500 font-semibold">
                  <span>
                    Neo ERP — Módulo Neo Producción & Transformación (Kardex WMS & Costeo NIC 2)
                  </span>
                  <span>
                    Documento Oficial • {order.order_number} • Impreso: {emissionTime}
                  </span>
                </div>
              </div>
            )}

            {/* =========================================================================
                CASO 2: ORDEN INDIVIDUAL — TICKET TÉRMICO 80MM
               ========================================================================= */}
            {order && format === "THERMAL_80MM" && (
              <div className="neo-thermal-ticket space-y-1.5 text-[11px] leading-tight">
                <div className="neo-thermal-title font-black text-sm text-center">
                  NEO ERP • NEO PRODUCCIÓN
                </div>
                <div className="neo-thermal-subtitle text-center text-[10.5px] font-bold">
                  {order.facility_name}
                </div>
                <div className="text-center text-[10px]">
                  Estación: {order.work_center_name || "Planta Central"}
                </div>

                <div className="neo-thermal-stamp border border-black py-1 px-1 text-center font-black text-[10.5px] uppercase my-1">
                  {isCompleted
                    ? "COMPROBANTE LIQUIDACIÓN NIC 2"
                    : "VALE DE PISO / RETIRO INSUMOS"}
                </div>

                <div className="text-[10.5px] space-y-0.5">
                  <div>
                    <strong>FOLIO OP:</strong> {order.order_number}
                  </div>
                  <div>
                    <strong>ESTADO:</strong> {order.state}
                  </div>
                  <div>
                    <strong>EMISIÓN:</strong> {emissionTime}
                  </div>
                  {isCompleted && (
                    <>
                      <div>
                        <strong>INICIO:</strong> {order.started_at ? fmtDate(order.started_at) : "N/A"}
                      </div>
                      <div>
                        <strong>CIERRE:</strong> {order.completed_at ? fmtDate(order.completed_at) : emissionTime}
                      </div>
                    </>
                  )}
                  <div>
                    <strong>ORIGEN:</strong> {order.source_warehouse_name}
                  </div>
                  <div>
                    <strong>DESTINO:</strong> {order.dest_warehouse_name}
                  </div>
                  <div>
                    <strong>RECETA:</strong> [{order.bom_code}] {order.bom_name}
                  </div>
                  <div>
                    <strong>META PLAN:</strong> {fmtQty(order.planned_base_qty)} {order.uom_id}{" "}
                    {order.scale_factor ? `(x${Number(order.scale_factor.toFixed(2))})` : ""}
                  </div>
                </div>

                <div className="neo-thermal-double border-t-2 border-black my-1.5"></div>

                {/* INSUMOS EN 80MM */}
                <div className="font-black uppercase text-[10.5px]">
                  {isCompleted ? "1. CONSUMO REAL INSUMOS:" : "1. RETIRO INSUMOS (FEFO):"}
                </div>
                <div className="space-y-1.5 pt-0.5">
                  {order.inputs.map((inp, idx) => {
                    const qty = isCompleted
                      ? inp.consumed_base_qty
                      : inp.consumed_base_qty ?? inp.planned_base_qty;
                    return (
                      <div key={inp.id || idx} className="border-b border-dashed border-black/40 pb-1">
                        <div className="font-bold">
                          {idx + 1}. {inp.component_name}
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span>Lote: {inp.batch_number || "FEFO"}</span>
                          <span className="font-bold">
                            {isCompleted ? "Real:" : "Req:"} {fmtQty(qty)} {inp.uom_base}
                          </span>
                        </div>
                        {!isCompleted && (
                          <div className="text-[10px] mt-0.5">
                            Usado: __________ {inp.uom_base} [ ]
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="neo-thermal-double border-t-2 border-black my-1.5"></div>

                {/* RENDIMIENTO / LOTE SANITARIO EN 80MM */}
                {!isCompleted ? (
                  <div className="space-y-1.5 text-[10.5px]">
                    <div className="font-black uppercase">2. CIERRE EN PISO (ANOTAR):</div>
                    {isButchery ? (
                      <div className="space-y-1">
                        {order.outputs.map((out, idx) => (
                          <div key={out.id || idx} className="text-[10px]">
                            <div>
                              • {out.output_name} (Esp: {out.planned_qty.toFixed(1)}Kg)
                            </div>
                            <div>  Real: ________Kg | Dañ: _____Kg</div>
                          </div>
                        ))}
                        <div className="pt-1">Merma Oreo: __________ Kg</div>
                        <div>Horas MOD: ___________ HRS</div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div>Sal. Buena: _________ {order.uom_id}</div>
                        <div>Merma Térm: _________ {order.uom_id}</div>
                        <div>Merma Dañ.: _________ {order.uom_id}</div>
                        <div>Horas MOD : _________ HRS</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1 text-[10.5px]">
                    <div className="font-black uppercase">2. ENTRADA ALMACÉN (MFG-IN):</div>
                    <div className="text-[10px]">
                      Salida MP:{" "}
                      {order.kardex_links?.picking_consumption_folio || `MFG-OUT/${order.order_number}`}
                    </div>
                    <div className="text-[10px]">
                      Entrada PT:{" "}
                      {order.kardex_links?.picking_output_folio || `MFG-IN/${order.order_number}`}
                    </div>
                    {isButchery ? (
                      <div className="space-y-1 pt-1">
                        {order.outputs.map((out, idx) => (
                          <div key={out.id || idx} className="border-b border-dashed border-black/30 pb-0.5 text-[10px]">
                            <div className="font-bold">
                              {out.output_name}: {out.actual_good_qty.toFixed(2)} {out.uom_base}
                            </div>
                            <div>
                              Lote: {out.generated_batch_number || `L-${order.order_number}`}
                              {showCosts ? ` • $${out.calculated_unit_cost_usd.toFixed(2)}/Kg` : ""}
                            </div>
                            <div className="text-[9.5px]">
                              Elab: {out.generated_batch_manufacturing_date || "Hoy"} • Vence:{" "}
                              {out.generated_batch_expiry_date || "N/A"}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="border border-black p-1.5 my-1 space-y-0.5">
                        <div className="font-black text-xs">
                          LOTE: {primaryOut?.generated_batch_number || `L-${order.order_number}`}
                        </div>
                        <div>
                          PROD: {primaryOut?.output_name || order.bom_name}
                        </div>
                        <div className="font-black">
                          CANT. BUENA:{" "}
                          {fmtQty(primaryOut?.actual_good_qty ?? order.actual_good_output_weight_kg)}{" "}
                          {order.uom_id}
                        </div>
                        <div className="text-[10px]">
                          Merma Térm: {fmtQty(order.natural_shrinkage_qty)} {order.uom_id} | Dañ:{" "}
                          {fmtQty(order.explicit_waste_qty)} {order.uom_id}
                        </div>
                        <div className="text-[10px]">
                          Elab: {primaryOut?.generated_batch_manufacturing_date || "Hoy"}
                        </div>
                        <div className="font-bold text-[10.5px]">
                          VENCE: {primaryOut?.generated_batch_expiry_date || "N/A"}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {showCosts && (
                  <>
                    <div className="neo-thermal-divider border-t border-dashed border-black my-1"></div>
                    <div className="text-[10px] space-y-0.5">
                      <div className="font-black uppercase">RESUMEN COSTO NIC 2:</div>
                      <div className="flex justify-between">
                        <span>Costo Neto Lote:</span>
                        <span className="font-bold">
                          ${Number(order.cost_summary.net_production_cost_usd || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Equiv. BCV ({fmtNum(rate)}):</span>
                        <span>Bs. {fmtNum(order.cost_summary.net_production_cost_ves)}</span>
                      </div>
                      {!isButchery && primaryOut && (
                        <div className="flex justify-between font-bold">
                          <span>Costo Unitario:</span>
                          <span>
                            ${Number(primaryOut.calculated_unit_cost_usd || 0).toFixed(4)}/{order.uom_id}
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="pt-5 space-y-4 text-center text-[10px]">
                  <div>_______________________________</div>
                  <div>Firma Operador / Maestro</div>
                  <div>_______________________________</div>
                  <div>Firma Almacén / Supervisor</div>
                </div>

                <div className="neo-thermal-divider border-t border-dashed border-black my-1.5"></div>
                <div className="text-center text-[9.5px] font-bold">
                  NEO ERP — NEO PRODUCCIÓN
                </div>
              </div>
            )}

            {/* =========================================================================
                CASO 3: CORRIDA MASIVA POR LOTES (BATCH RUN) — FORMATO CARTA / A4
               ========================================================================= */}
            {batchRun && format === "A4" && (
              <div className="neo-a4-sheet space-y-3 text-xs">
                <div className="neo-a4-header flex justify-between items-start border-b-2 border-slate-900 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="neo-brand-badge bg-slate-900 text-white font-black px-2.5 py-1 rounded text-xs">
                        NEO ERP — NEO PRODUCCIÓN
                      </span>
                      <span className="text-[11px] font-bold text-slate-600 uppercase">
                        CORRIDA MASIVA MULTI-RECETA
                      </span>
                    </div>
                    <h1 className="text-base font-black text-slate-900 mt-1.5 uppercase tracking-tight">
                      {isCompleted
                        ? "Acta Consolidada de Liquidación de Corrida Masiva (NIC 2)"
                        : "Hoja Maestra de Turno y Vale Consolidado de Retiro de Insumos (FEFO)"}
                    </h1>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Sucursal / Sede: <strong>{batchRun.facility_name}</strong> • Turno:{" "}
                      <strong>{SHIFT_NAMES[batchRun.shift] || batchRun.shift}</strong> • Almacén:{" "}
                      <strong>{batchRun.source_warehouse_name}</strong> →{" "}
                      <strong>{batchRun.dest_warehouse_name}</strong>
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`neo-status-stamp inline-block px-2.5 py-1 rounded font-black text-[11px] uppercase border ${
                        isCompleted
                          ? "neo-status-completed bg-emerald-50 text-emerald-800 border-emerald-600"
                          : "neo-status-floor bg-amber-50 text-amber-900 border-amber-600"
                      }`}
                    >
                      {isCompleted ? "✓ LOTE MASIVO LIQUIDADO" : "CORRIDA EN PISO / PLANIFICADA"}
                    </div>
                    <div className="font-mono text-sm font-black text-slate-900 mt-1">
                      Plan: {batchRun.plan_number}
                    </div>
                    <div className="text-[10px] text-slate-500">Emisión: {emissionTime}</div>
                  </div>
                </div>

                {batchRun.notes && (
                  <div className="bg-slate-50 border border-slate-300 rounded-md px-3 py-1.5 text-[10.5px]">
                    <strong>Observaciones de la Corrida:</strong> {batchRun.notes}
                  </div>
                )}

                {/* SECCIÓN 1 DE CORRIDA MASIVA: FÓRMULAS / ÓRDENES DE PRODUCCIÓN */}
                <div>
                  <div className="neo-section-title bg-slate-900 text-white px-3 py-1.5 rounded-t-md font-black text-[11px] uppercase flex justify-between items-center">
                    <span>
                      1. Cuadro de Fórmulas / Órdenes de Producción de la Tanda ({batchRun.orders.length}{" "}
                      Recetas)
                    </span>
                    <span className="font-mono text-[10px]">
                      Sector: {SECTOR_NAMES[batchRun.sector] || batchRun.sector}
                    </span>
                  </div>
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label="Tabla de órdenes de la corrida masiva"
                    className="overflow-x-auto"
                  >
                    <table className="neo-table w-full border border-slate-400 text-[10.5px]">
                      <thead className="sticky top-0 z-10 bg-slate-100">
                        <tr className="bg-slate-100 border-b border-slate-300 text-[9.5px] font-extrabold uppercase text-slate-700">
                          <th className="py-1.5 px-2 sticky top-0 bg-slate-100">Folio OP / Receta</th>
                          <th className="py-1.5 px-2 sticky top-0 bg-slate-100">Producto a Elaborar / Estación</th>
                          <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Escala</th>
                          <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Meta Plan.</th>
                          <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">
                            {isCompleted ? "Cant. Buena Real" : "Buena Esp. / Real Piso"}
                          </th>
                          <th className="py-1.5 px-2 sticky top-0 bg-slate-100">Lote Sanitario / Kardex</th>
                          {showCosts && (
                            <>
                              <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Costo Lote ($)</th>
                              <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Costo Unit. ($)</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {batchRun.orders.map((op, idx) => (
                          <tr key={op.id || idx}>
                            <td className="py-1.5 px-2 font-mono">
                              <div className="font-black text-slate-900">{op.order_number}</div>
                              <div className="text-[9.5px] text-slate-500">[{op.bom_code}]</div>
                            </td>
                            <td className="py-1.5 px-2">
                              <div className="font-bold text-slate-900">{op.product_name}</div>
                              <div className="text-[9.5px] text-slate-500">
                                ⚙️ {op.work_center_name || "Estación Planta"}
                              </div>
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono font-bold">
                              {op.scale_factor ? `${Number(op.scale_factor.toFixed(2))}x` : "1x"}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono font-bold">
                              {fmtQty(op.planned_base_qty)} {op.uom_id}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono">
                              {isCompleted ? (
                                <span className="font-black text-emerald-800">
                                  {fmtQty(op.actual_good_qty)} {op.uom_id}
                                </span>
                              ) : (
                                <span>
                                  {fmtQty(op.actual_good_qty)} / [ ________ {op.uom_id} ]
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 font-mono text-[9.5px]">
                              {op.generated_batch_number ? (
                                <div className="font-bold text-emerald-800">
                                  {op.generated_batch_number}
                                  {op.generated_batch_expiry_date
                                    ? ` (Vence: ${op.generated_batch_expiry_date})`
                                    : ""}
                                </div>
                              ) : (
                                <div className="text-slate-500">Al liquidar</div>
                              )}
                              {op.picking_consumption_name && (
                                <div className="text-slate-500">
                                  {op.picking_consumption_name} • {op.picking_output_name}
                                </div>
                              )}
                            </td>
                            {showCosts && (
                              <>
                                <td className="py-1.5 px-2 text-right font-mono font-bold">
                                  ${Number(op.net_production_cost_usd || 0).toFixed(2)}
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono">
                                  ${Number(op.unit_cost_usd || 0).toFixed(4)}/{op.uom_id}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* SECCIÓN 2 DE CORRIDA MASIVA: CONSOLIDADO DE MATERIA PRIMA (FEFO) */}
                {batchRun.consolidated_inputs && batchRun.consolidated_inputs.length > 0 && (
                  <div>
                    <div className="neo-section-title bg-slate-900 text-white px-3 py-1.5 rounded-t-md font-black text-[11px] uppercase flex justify-between items-center">
                      <span>
                        2. Consolidado Global de Retiro de Materia Prima y Empaque (Picking FEFO —{" "}
                        {batchRun.consolidated_inputs.length} Insumos)
                      </span>
                      <span className="font-mono text-[10px]">
                        Almacén Origen: {batchRun.source_warehouse_name}
                      </span>
                    </div>
                    <div
                      tabIndex={0}
                      role="region"
                      aria-label="Tabla de insumos consolidados de la corrida masiva"
                      className="overflow-x-auto"
                    >
                      <table className="neo-table w-full border border-slate-400 text-[10.5px]">
                        <thead className="sticky top-0 z-10 bg-slate-100">
                          <tr className="bg-slate-100 border-b border-slate-300 text-[9.5px] font-extrabold uppercase text-slate-700">
                            <th className="py-1.5 px-2 sticky top-0 bg-slate-100">[SKU] Insumo / Materia Prima</th>
                            <th className="py-1.5 px-2 sticky top-0 bg-slate-100">Recetas que lo Usan</th>
                            <th className="py-1.5 px-2 sticky top-0 bg-slate-100">Lote FEFO Sugerido</th>
                            <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Cant. Total Requerida</th>
                            {!isCompleted && (
                              <>
                                <th className="py-1.5 px-2 text-center sticky top-0 bg-slate-100">Cant. Despachada</th>
                                <th className="py-1.5 px-2 text-center sticky top-0 bg-slate-100">Check</th>
                              </>
                            )}
                            {showCosts && (
                              <th className="py-1.5 px-2 text-right sticky top-0 bg-slate-100">Subtotal ($ / Bs.)</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {batchRun.consolidated_inputs.map((inp, idx) => (
                            <tr key={inp.component_variant_id || idx}>
                              <td className="py-1.5 px-2">
                                <div className="font-bold text-slate-900">{inp.component_name}</div>
                                <div className="font-mono text-[9.5px] text-slate-500">
                                  SKU: {inp.component_sku} • {inp.input_role}
                                </div>
                              </td>
                              <td className="py-1.5 px-2 text-[9.5px] font-mono">
                                {inp.used_in_recipes && inp.used_in_recipes.length > 0
                                  ? inp.used_in_recipes
                                      .map((u) => `${u.bom_code} (${fmtQty(u.required_base_qty)})`)
                                      .join(" + ")
                                  : `${inp.recipes_count} recetas`}
                              </td>
                              <td className="py-1.5 px-2 font-mono text-[10px]">
                                <div className="font-bold text-slate-900">
                                  {inp.suggested_batch_number || "FEFO"}
                                </div>
                                {inp.suggested_batch_expiry_date && (
                                  <div className="text-[9px] text-slate-500">
                                    Vence: {inp.suggested_batch_expiry_date}
                                  </div>
                                )}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono font-black">
                                {fmtQty(inp.total_required_base_qty)} {inp.uom_base}
                              </td>
                              {!isCompleted && (
                                <>
                                  <td className="py-1.5 px-2 text-center font-mono">
                                    <span className="neo-write-box inline-block min-w-[70px] border-b border-slate-800">
                                      &nbsp;
                                    </span>{" "}
                                    {inp.uom_base}
                                  </td>
                                  <td className="py-1.5 px-2 text-center">
                                    <span className="neo-check-box inline-block w-3.5 h-3.5 border border-slate-800"></span>
                                  </td>
                                </>
                              )}
                              {showCosts && (
                                <td className="py-1.5 px-2 text-right font-mono">
                                  <div className="font-bold">${inp.total_cost_usd.toFixed(2)}</div>
                                  <div className="text-[9px] text-slate-500">
                                    Bs. {fmtNum(inp.total_cost_ves)}
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {showCosts && (
                  <div>
                    <div className="neo-section-title bg-slate-900 text-white px-3 py-1.5 rounded-t-md font-black text-[11px] uppercase flex justify-between items-center">
                      <span>
                        3. Resumen Financiero Consolidado de la Corrida Masiva (NIC 2 — {batchRun.plan_number})
                      </span>
                      <span className="font-mono text-[10px]">
                        Tasa Oficial BCV: Bs. {fmtNum(rate)} / USD
                      </span>
                    </div>
                    <div className="neo-nic2-box border border-slate-400 rounded-b-md p-3 bg-slate-50 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10.5px]">
                      <div>
                        <span className="text-[9px] font-extrabold uppercase text-slate-500 block">
                          Materiales + Empaque
                        </span>
                        <div className="font-mono font-bold text-slate-900">
                          $
                          {(
                            Number(batchRun.total_direct_materials_usd || 0) +
                            Number(batchRun.total_packaging_usd || 0)
                          ).toFixed(2)}{" "}
                          USD
                        </div>
                        <div className="font-mono text-[9.5px] text-slate-600">
                          Mat: ${Number(batchRun.total_direct_materials_usd || 0).toFixed(2)} | Emp: $
                          {Number(batchRun.total_packaging_usd || 0).toFixed(2)}
                        </div>
                      </div>

                      <div>
                        <span className="text-[9px] font-extrabold uppercase text-slate-500 block">
                          Conversión (MOD + CIF)
                        </span>
                        <div className="font-mono font-bold text-slate-900">
                          $
                          {(
                            Number(batchRun.total_direct_labor_mod_usd || 0) +
                            Number(batchRun.total_indirect_overhead_cif_usd || 0)
                          ).toFixed(2)}{" "}
                          USD
                        </div>
                        <div className="font-mono text-[9.5px] text-slate-600">
                          MOD: ${Number(batchRun.total_direct_labor_mod_usd || 0).toFixed(2)} | CIF: $
                          {Number(batchRun.total_indirect_overhead_cif_usd || 0).toFixed(2)}
                        </div>
                      </div>

                      <div>
                        <span className="text-[9px] font-extrabold uppercase text-slate-500 block">
                          Merma Anormal / Daño
                        </span>
                        <div className="font-mono font-bold text-red-700">
                          -${Number(batchRun.total_explicit_waste_cost_usd || 0).toFixed(2)} USD
                        </div>
                        <div className="font-mono text-[9.5px] text-slate-600">
                          Segregado a gasto (NIC 2 P16)
                        </div>
                      </div>

                      <div className="bg-white p-2 rounded border border-slate-300">
                        <span className="text-[9px] font-black uppercase text-emerald-800 block">
                          Costo Neto Total Corrida
                        </span>
                        <div className="font-mono text-sm font-black text-slate-900">
                          ${Number(batchRun.total_cost_usd || 0).toFixed(2)} USD
                        </div>
                        <div className="font-mono text-[10px] font-bold text-emerald-800">
                          Bs. {fmtNum(batchRun.total_cost_ves)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="neo-signatures grid grid-cols-3 gap-8 pt-7">
                  <div className="neo-sig-line border-t border-slate-800 pt-1.5 text-center text-[10px] font-bold text-slate-800">
                    Despachado por Almacén ({batchRun.source_warehouse_name})
                  </div>
                  <div className="neo-sig-line border-t border-slate-800 pt-1.5 text-center text-[10px] font-bold text-slate-800">
                    Ejecutado por Jefe de Turno / Maestro
                  </div>
                  <div className="neo-sig-line border-t border-slate-800 pt-1.5 text-center text-[10px] font-bold text-slate-800">
                    Recibido Conforme PT / Auditoría NIC 2
                  </div>
                </div>

                <div className="neo-footer border-t border-slate-300 pt-2 mt-3 flex justify-between items-center text-[9.5px] text-slate-500 font-semibold">
                  <span>
                    Neo ERP — Módulo Neo Producción (Corrida Masiva por Lotes & Explosión FEFO)
                  </span>
                  <span>
                    Plan: {batchRun.plan_number} • Impreso: {emissionTime}
                  </span>
                </div>
              </div>
            )}

            {/* =========================================================================
                CASO 4: CORRIDA MASIVA POR LOTES (BATCH RUN) — TICKET TÉRMICO 80MM
               ========================================================================= */}
            {batchRun && format === "THERMAL_80MM" && (
              <div className="neo-thermal-ticket space-y-1.5 text-[11px] leading-tight">
                <div className="neo-thermal-title font-black text-sm text-center">
                  NEO ERP • NEO PRODUCCIÓN
                </div>
                <div className="neo-thermal-subtitle text-center text-[10.5px] font-bold">
                  CORRIDA MASIVA • {batchRun.facility_name}
                </div>
                <div className="neo-thermal-stamp border border-black py-1 px-1 text-center font-black text-[10.5px] uppercase my-1">
                  {isCompleted ? "CORRIDA MASIVA LIQUIDADA" : "VALE CONSOLIDADO DE TURNO"}
                </div>

                <div className="text-[10px] space-y-0.5">
                  <div>
                    <strong>PLAN:</strong> {batchRun.plan_number}
                  </div>
                  <div>
                    <strong>TURNO:</strong> {SHIFT_NAMES[batchRun.shift] || batchRun.shift}
                  </div>
                  <div>
                    <strong>FECHA:</strong> {emissionTime}
                  </div>
                  <div>
                    <strong>ALMACÉN:</strong> {batchRun.source_warehouse_name} →{" "}
                    {batchRun.dest_warehouse_name}
                  </div>
                </div>

                <div className="neo-thermal-double border-t-2 border-black my-1.5"></div>
                <div className="font-black uppercase text-[10.5px]">
                  1. FÓRMULAS DEL LOTE ({batchRun.orders.length}):
                </div>
                <div className="space-y-1">
                  {batchRun.orders.map((op, idx) => (
                    <div key={op.id || idx} className="border-b border-dashed border-black/40 pb-1 text-[10px]">
                      <div className="font-bold">
                        {idx + 1}. [{op.order_number}] {op.product_name}
                      </div>
                      <div className="flex justify-between">
                        <span>Meta: {fmtQty(op.planned_base_qty)} {op.uom_id}</span>
                        <span className="font-bold">
                          Bueno: {isCompleted ? `${fmtQty(op.actual_good_qty)} ${op.uom_id}` : "______"}
                        </span>
                      </div>
                      {op.generated_batch_number && (
                        <div>
                          Lote: {op.generated_batch_number}
                          {op.generated_batch_expiry_date ? ` (Vence: ${op.generated_batch_expiry_date})` : ""}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {batchRun.consolidated_inputs && batchRun.consolidated_inputs.length > 0 && (
                  <>
                    <div className="neo-thermal-double border-t-2 border-black my-1.5"></div>
                    <div className="font-black uppercase text-[10.5px]">
                      2. PICKING CONSOLIDADO FEFO ({batchRun.consolidated_inputs.length}):
                    </div>
                    <div className="space-y-1">
                      {batchRun.consolidated_inputs.map((inp, idx) => (
                        <div
                          key={inp.component_variant_id || idx}
                          className="border-b border-dashed border-black/40 pb-1 text-[10px]"
                        >
                          <div className="font-bold">
                            • {inp.component_name}
                          </div>
                          <div className="flex justify-between">
                            <span>Lote: {inp.suggested_batch_number || "FEFO"}</span>
                            <span className="font-black">
                              Total: {fmtQty(inp.total_required_base_qty)} {inp.uom_base}
                            </span>
                          </div>
                          {!isCompleted && <div>Despachado: __________ [ ]</div>}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {showCosts && (
                  <>
                    <div className="neo-thermal-divider border-t border-dashed border-black my-1"></div>
                    <div className="text-[10px] space-y-0.5">
                      <div className="flex justify-between">
                        <span>Mat + Emp:</span>
                        <span>
                          $
                          {(
                            Number(batchRun.total_direct_materials_usd || 0) +
                            Number(batchRun.total_packaging_usd || 0)
                          ).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>MOD + CIF:</span>
                        <span>
                          $
                          {(
                            Number(batchRun.total_direct_labor_mod_usd || 0) +
                            Number(batchRun.total_indirect_overhead_cif_usd || 0)
                          ).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between font-black">
                        <span>COSTO TOTAL LOTE:</span>
                        <span>
                          ${Number(batchRun.total_cost_usd || 0).toFixed(2)} (Bs.{" "}
                          {fmtNum(batchRun.total_cost_ves)})
                        </span>
                      </div>
                    </div>
                  </>
                )}

                <div className="pt-5 space-y-4 text-center text-[10px]">
                  <div>_______________________________</div>
                  <div>Firma Almacén (MFG-OUT)</div>
                  <div>_______________________________</div>
                  <div>Firma Jefe de Planta</div>
                </div>

                <div className="neo-thermal-divider border-t border-dashed border-black my-1.5"></div>
                <div className="text-center text-[9.5px] font-bold">
                  NEO ERP — NEO PRODUCCIÓN
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
