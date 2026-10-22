"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import api from "@/lib/api";

interface OrderSummaryItem {
  id: number;
  order_number: string;
  state: string;
  order_type: string;
  sector: string;
  facility_name: string;
  work_center_name?: string;
  bom_code?: string;
  bom_name?: string;
  uom_id: string;
  primary_product_sku?: string;
  primary_product_name?: string;
  planned_base_qty: number;
  actual_good_qty: number;
  natural_shrinkage_qty: number;
  explicit_waste_qty: number;
  net_production_cost_usd: number;
  net_production_cost_ves: number;
  calculated_unit_cost_usd: number;
  calculated_unit_cost_ves: number;
  generated_batch_number?: string | null;
  generated_batch_expiry_date?: string | null;
}

interface DashboardSummary {
  exchange_rate: number;
  exchange_rate_effective_date: string | null;
  kpis: {
    total_work_centers: number;
    active_work_centers: number;
    total_boms: number;
    convergent_recipes_count: number;
    divergent_butchery_count: number;
    average_projected_margin_pct: number;
    average_expected_shrinkage_pct: number;
    active_production_orders: number;
    in_progress_orders?: number;
    completed_orders?: number;
    completed_value_usd?: number;
    completed_value_ves?: number;
    total_butchery_orders?: number;
    in_progress_butchery_orders?: number;
    completed_butchery_orders?: number;
    carcass_weight_processed_kg?: number;
    average_meat_yield_pct?: number;
    settled_cuts_value_usd?: number;
    settled_cuts_value_ves?: number;
  };
  butchery_kpis?: {
    total_butchery_orders: number;
    in_progress_butchery_orders: number;
    completed_butchery_orders: number;
    carcass_weight_processed_kg: number;
    good_cuts_weight_produced_kg: number;
    average_meat_yield_pct: number;
    settled_cuts_value_usd: number;
    settled_cuts_value_ves: number;
  };
  sectors_breakdown: {
    BAKERY: number;
    GASTRONOMY: number;
    MEAT_PROCESSING: number;
  };
  work_centers: Array<{
    id: number;
    code: string;
    name: string;
    sector: string;
    capacity_per_batch: number;
    capacity_uom: string;
    hourly_labor_rate: number;
    hourly_overhead_rate: number;
    overhead_per_kg: number;
    is_active: boolean;
  }>;
  recent_boms: Array<{
    id: number;
    code: string;
    name: string;
    bom_type: string;
    sector: string;
    work_center_name?: string;
    primary_product_sku?: string;
    primary_product_name?: string;
    base_qty: number;
    uom_id: string;
    expected_shrinkage_pct: number;
    estimated_batch_cost_usd: number;
    estimated_batch_cost_ves: number;
    estimated_unit_cost_usd: number;
    estimated_unit_cost_ves: number;
    primary_product_price_usd: number;
    estimated_margin_pct: number;
  }>;
  recent_orders?: OrderSummaryItem[];
}

const SECTOR_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  BAKERY: { label: "Panadería & Pastelería", color: "bg-amber-50 text-amber-700 border-amber-200", icon: "pi-sun" },
  GASTRONOMY: { label: "Cocina & Gastronomía", color: "bg-orange-50 text-orange-700 border-orange-200", icon: "pi-sparkles" },
  MEAT_PROCESSING: { label: "Sala de Desposte Cárnico", color: "bg-red-50 text-red-700 border-red-200", icon: "pi-percentage" },
};

const STATE_BADGES: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Borrador", color: "bg-slate-100 text-slate-700 border-slate-200" },
  PLANNED: { label: "Planificada", color: "bg-blue-50 text-blue-700 border-blue-200" },
  IN_PROGRESS: { label: "En Proceso", color: "bg-amber-50 text-amber-700 border-amber-200" },
  COMPLETED: { label: "Liquidada (Kardex)", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  CANCELLED: { label: "Cancelada", color: "bg-red-50 text-red-700 border-red-200" },
};

export default function NeoProductionDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSummary() {
      try {
        const res = await api.get("/mfg/dashboard-summary");
        setSummary(res.data);
      } catch (err) {
        console.error("Error cargando resumen de Neo Producción:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSummary();
  }, []);

  const rate = summary?.exchange_rate ?? 40.0;
  const kpis = summary?.kpis ?? {
    total_work_centers: 0,
    active_work_centers: 0,
    total_boms: 0,
    convergent_recipes_count: 0,
    divergent_butchery_count: 0,
    average_projected_margin_pct: 0,
    average_expected_shrinkage_pct: 0,
    active_production_orders: 0,
    in_progress_orders: 0,
    completed_orders: 0,
    completed_value_usd: 0,
    completed_value_ves: 0,
  };
  const butcheryKpis = summary?.butchery_kpis ?? {
    total_butchery_orders: kpis.total_butchery_orders ?? 0,
    in_progress_butchery_orders: kpis.in_progress_butchery_orders ?? 0,
    completed_butchery_orders: kpis.completed_butchery_orders ?? 0,
    carcass_weight_processed_kg: kpis.carcass_weight_processed_kg ?? 0,
    good_cuts_weight_produced_kg: 0,
    average_meat_yield_pct: kpis.average_meat_yield_pct ?? 88.0,
    settled_cuts_value_usd: kpis.settled_cuts_value_usd ?? 0,
    settled_cuts_value_ves: kpis.settled_cuts_value_ves ?? 0,
  };

  return (
    <div className="p-2 sm:p-6 w-full max-w-[1440px] mx-auto space-y-6">
      {/* HEADER HERO DE NEO PRODUCCIÓN */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-orange-500 to-red-600"></div>
        <div className="pl-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold mb-2">
            <i className="pi pi-cog text-xs"></i>
            NEO PRODUCCIÓN • INGENIERÍA DE PLANTA & LIQUIDACIÓN NIC 2
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            Central de Producción y Transformación
          </h1>
          <p className="text-slate-500 mt-1 text-sm font-medium max-w-2xl">
            Gestión integral de Centros de Trabajo, Recetas Convergentes, Sala de Desposte Cárnico (`1 → N`), Explosión FEFO y Liquidación al Kardex con Costo Promedio Ponderado.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-stretch lg:self-center">
          <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl border border-slate-800 flex items-center gap-3 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
              <i className="pi pi-dollar text-sm font-bold"></i>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-bold">
                Tasa BCV Activa
              </span>
              <span className="text-sm font-black text-emerald-400 font-mono">
                Bs. {rate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / USD
              </span>
            </div>
          </div>

          <Link
            href="/butchery"
            className="inline-flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold px-4 py-3 rounded-xl transition-all text-sm"
          >
            <i className="pi pi-percentage"></i>
            Sala de Desposte (NIC 2)
          </Link>

          <Link
            href="/orders"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold px-5 py-3 rounded-xl shadow-md shadow-orange-500/20 transition-all text-sm"
          >
            <i className="pi pi-cog"></i>
            Órdenes de Producción
          </Link>
        </div>
      </div>

      {/* TARJETAS KPI EN TIEMPO REAL */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href="/orders"
          className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-orange-300 transition-all group block"
        >
          <div className="flex justify-between items-start mb-3">
            <div className="w-11 h-11 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-colors">
              <i className="pi pi-cog text-xl"></i>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
              {kpis.in_progress_orders ?? 0} En Proceso
            </span>
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Órdenes de Producción
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-slate-800">{loading ? "..." : kpis.active_production_orders}</span>
            <span className="text-xs text-slate-500 font-medium">{kpis.completed_orders ?? 0} liquidadas en Kardex</span>
          </div>
        </Link>

        <Link
          href="/work-centers"
          className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-orange-300 transition-all group block"
        >
          <div className="flex justify-between items-start mb-3">
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition-colors">
              <i className="pi pi-sliders-h text-xl"></i>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
              {kpis.active_work_centers} Activas
            </span>
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Estaciones de Planta
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-slate-800">{loading ? "..." : kpis.total_work_centers}</span>
            <span className="text-xs text-slate-500 font-medium">centros configurados</span>
          </div>
        </Link>

        <Link
          href="/recipes"
          className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-orange-300 transition-all group block"
        >
          <div className="flex justify-between items-start mb-3">
            <div className="w-11 h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center group-hover:bg-red-600 group-hover:text-white transition-colors">
              <i className="pi pi-book text-xl"></i>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-red-50 text-red-700 border border-red-200">
              {kpis.convergent_recipes_count} Conv. / {kpis.divergent_butchery_count} Desp.
            </span>
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Fórmulas y Escandallos
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-slate-800">{loading ? "..." : kpis.total_boms}</span>
            <span className="text-xs text-slate-500 font-medium">fórmulas maestras</span>
          </div>
        </Link>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <i className="pi pi-chart-line text-xl"></i>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
              Merma Esp: {kpis.average_expected_shrinkage_pct}%
            </span>
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Margen Bruto Proyectado
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-3xl font-black ${kpis.average_projected_margin_pct >= 25 ? "text-emerald-600" : "text-amber-600"}`}>
              {loading ? "..." : `${kpis.average_projected_margin_pct}%`}
            </span>
            <span className="text-xs text-slate-500 font-medium">sobre PVP actual</span>
          </div>
        </div>
      </div>

      {/* PANEL FASE 3: RESUMEN DE SALA DE DESPOSTE CÁRNICO (1 CANAL -> N CORTES NIC 2) */}
      <div className="bg-gradient-to-r from-slate-900 via-red-950/90 to-slate-900 text-white rounded-2xl p-5 sm:p-6 border border-red-500/30 shadow-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
        <div className="space-y-1 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-500/20 border border-red-400/30 text-red-300 text-[11px] font-bold">
            <i className="pi pi-percentage text-[10px]"></i>
            FASE 3 • SALA DE DESPOSTE CÁRNICO (1 CANAL → N CORTES)
          </div>
          <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
            Balance de Masa al 100% y Costeo Conjunto por Valor Relativo de Mercado (NIC 2)
          </h2>
          <p className="text-xs text-slate-300">
            Control de riel frigorífico, crédito por subproductos (Hueso/Sebo a VRN fijo), absorción de merma natural por oreo y liquidación multi-corte al Kardex.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
              Órdenes Desposte
            </span>
            <div className="text-lg font-mono font-black text-white mt-0.5">
              {butcheryKpis.total_butchery_orders}
            </div>
            <span className="text-[10px] text-amber-400 font-semibold">
              {butcheryKpis.in_progress_butchery_orders} en riel • {butcheryKpis.completed_butchery_orders} liq.
            </span>
          </div>

          <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
              Canal Procesada
            </span>
            <div className="text-lg font-mono font-black text-white mt-0.5">
              {butcheryKpis.carcass_weight_processed_kg.toFixed(1)} Kg
            </div>
            <span className="text-[10px] text-slate-300">
              {butcheryKpis.good_cuts_weight_produced_kg.toFixed(1)} Kg cortes
            </span>
          </div>

          <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
              Yield Cárnico Prom.
            </span>
            <div className="text-lg font-mono font-black text-emerald-400 mt-0.5">
              {butcheryKpis.average_meat_yield_pct.toFixed(1)}%
            </div>
            <span className="text-[10px] text-slate-300">Cortes principales</span>
          </div>

          <Link
            href="/butchery"
            className="bg-gradient-to-br from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600 rounded-xl px-3.5 py-2.5 flex flex-col justify-between shadow-sm transition-all"
          >
            <span className="text-[10px] uppercase tracking-wider text-red-100 font-bold block">
              Capitalizado NIC 2
            </span>
            <div className="text-base font-mono font-black text-white">
              ${butcheryKpis.settled_cuts_value_usd.toFixed(2)}
            </div>
            <span className="text-[10px] font-bold text-white flex items-center gap-1">
              Abrir Sala <i className="pi pi-arrow-right text-[9px]"></i>
            </span>
          </Link>
        </div>
      </div>

      {/* TABLA DE ÓRDENES DE PRODUCCIÓN EN EJECUCIÓN Y LIQUIDADAS (FASE 2) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <i className="pi pi-cog text-orange-600"></i>
              Órdenes de Producción Recientes (Explosión FEFO & Liquidación NIC 2)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Control de piso de planta, descargo de materias primas (`MFG-OUT`), lotes sanitarios y cargo de producto terminado (`MFG-IN`).
            </p>
          </div>
          <Link
            href="/orders"
            className="text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 px-4 py-2 rounded-xl shadow-sm transition-all self-start sm:self-auto"
          >
            Gestionar Órdenes de Producción <i className="pi pi-arrow-right text-[10px] ml-1"></i>
          </Link>
        </div>

        <div tabIndex={0} role="region" aria-label="Órdenes de producción recientes" className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">Folio OP / Lote</th>
                <th className="py-3.5 px-4">Producto / Fórmula</th>
                <th className="py-3.5 px-4">Estación / Estado</th>
                <th className="py-3.5 px-4 text-right">Meta / Bueno</th>
                <th className="py-3.5 px-4 text-right">Costo Neto (USD / Bs)</th>
                <th className="py-3.5 px-4 text-right">Costo Unit. Real</th>
                <th className="py-3.5 px-4 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Cargando órdenes de producción...
                  </td>
                </tr>
              ) : !summary?.recent_orders || summary.recent_orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No hay órdenes de producción registradas.
                  </td>
                </tr>
              ) : (
                summary.recent_orders.map((op) => {
                  const st = STATE_BADGES[op.state] || STATE_BADGES.DRAFT;
                  return (
                    <tr key={op.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-xs font-black text-orange-600">{op.order_number}</div>
                        {op.generated_batch_number ? (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <i className="pi pi-qrcode text-[9px]"></i>
                            {op.generated_batch_number}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Lote al liquidar</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{op.primary_product_name}</div>
                        <div className="text-xs text-slate-400">
                          {op.bom_code} — SKU: {op.primary_product_sku}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${st.color}`}>
                          {st.label}
                        </span>
                        <div className="text-xs text-slate-500 mt-1">{op.work_center_name || "Planta Central"}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono">
                        <div className="font-bold text-slate-800">
                          {op.actual_good_qty} / {op.planned_base_qty} {op.uom_id}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Merma: {op.natural_shrinkage_qty} nat. {op.explicit_waste_qty > 0 ? `+ ${op.explicit_waste_qty} dañ.` : ""}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono">
                        <div className="font-bold text-slate-800">${op.net_production_cost_usd.toFixed(2)}</div>
                        <div className="text-xs text-slate-500">
                          Bs. {op.net_production_cost_ves.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono">
                        <div className="font-black text-orange-600">
                          ${op.calculated_unit_cost_usd.toFixed(4)} / {op.uom_id}
                        </div>
                        <div className="text-xs text-slate-500">
                          Bs. {op.calculated_unit_cost_ves.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <Link
                          href={op.order_type === "MEAT_DISASSEMBLY" ? `/butchery/${op.id}` : `/orders/${op.id}`}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-orange-600 bg-slate-100 hover:bg-orange-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <i className={`pi ${op.state === "COMPLETED" ? "pi-check-circle text-emerald-600" : "pi-play text-orange-600"} text-xs`}></i>
                          {op.order_type === "MEAT_DISASSEMBLY"
                            ? op.state === "COMPLETED"
                              ? "Ver Desposte"
                              : "Mesa Desposte"
                            : op.state === "COMPLETED"
                            ? "Ver Kardex"
                            : "Liquidar OP"}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* TABLA RESUMEN DE FÓRMULAS ACTIVAS Y COSTEO BIMONETARIO */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <i className="pi pi-list text-orange-600"></i>
              Fórmulas y Plantillas de Transformación Activas
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Valoración teórica en tiempo real a tasa oficial BCV (Bs. {rate.toFixed(2)} / USD).
            </p>
          </div>
          <Link
            href="/recipes"
            className="text-xs font-bold text-orange-700 bg-orange-50 hover:bg-orange-100 px-3.5 py-2 rounded-xl border border-orange-200 transition-colors self-start sm:self-auto"
          >
            Ver Todas las Fórmulas <i className="pi pi-arrow-right text-[10px] ml-1"></i>
          </Link>
        </div>

        <div tabIndex={0} role="region" aria-label="Fórmulas y plantillas de transformación activas" className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">Código / Fórmula</th>
                <th className="py-3.5 px-4">Sector / Tipo</th>
                <th className="py-3.5 px-4">Centro de Trabajo</th>
                <th className="py-3.5 px-4 text-right">Lote Base</th>
                <th className="py-3.5 px-4 text-right">Costo Lote (USD / Bs)</th>
                <th className="py-3.5 px-4 text-right">Costo Unitario</th>
                <th className="py-3.5 px-4 text-right">Margen Proy.</th>
                <th className="py-3.5 px-4 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    Cargando fórmulas de Neo Producción...
                  </td>
                </tr>
              ) : !summary?.recent_boms || summary.recent_boms.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    No hay fórmulas registradas aún. Crea tu primera receta en el Constructor.
                  </td>
                </tr>
              ) : (
                summary.recent_boms.map((b) => {
                  const sec = SECTOR_LABELS[b.sector] || {
                    label: b.sector,
                    color: "bg-slate-100 text-slate-700 border-slate-200",
                    icon: "pi-cog",
                  };
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-xs font-bold text-orange-600">{b.code}</div>
                        <div className="font-bold text-slate-800">{b.name}</div>
                        <div className="text-xs text-slate-400 truncate max-w-xs">
                          SKU Base: {b.primary_product_sku} — {b.primary_product_name}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border ${sec.color}`}>
                          <i className={`pi ${sec.icon} text-[11px]`}></i>
                          {sec.label}
                        </span>
                        <div className="text-[11px] text-slate-400 mt-1 font-medium">
                          {b.bom_type === "DIVERGENT_DISASSEMBLY" ? "1 → N Desposte (NIC 2)" : "N → 1 Receta Estándar"}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium text-xs">
                        {b.work_center_name || "Sin asignar"}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-700">
                        {b.base_qty} {b.uom_id}
                        <div className="text-[10px] text-slate-400 font-normal">
                          Merma: {b.expected_shrinkage_pct}%
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono">
                        <div className="font-bold text-slate-800">${b.estimated_batch_cost_usd.toFixed(2)}</div>
                        <div className="text-xs text-slate-500">
                          Bs. {b.estimated_batch_cost_ves.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono">
                        <div className="font-black text-orange-600">${b.estimated_unit_cost_usd.toFixed(4)} / {b.uom_id}</div>
                        <div className="text-xs text-slate-500">
                          Bs. {b.estimated_unit_cost_ves.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-black ${
                            b.estimated_margin_pct >= 30
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : b.estimated_margin_pct >= 15
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-red-50 text-red-700 border border-red-200"
                          }`}
                        >
                          {b.estimated_margin_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <Link
                          href={`/recipes/new?edit=${b.id}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-orange-600 bg-slate-100 hover:bg-orange-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <i className="pi pi-sliders-h text-xs"></i>
                          Simular / Editar
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
