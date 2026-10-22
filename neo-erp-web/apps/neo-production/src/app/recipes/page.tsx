"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";

interface BOMItem {
  id: number;
  code: string;
  name: string;
  bom_type: string;
  sector: string;
  work_center_id?: number;
  work_center_name?: string;
  primary_product_variant_id: number;
  primary_product_sku?: string;
  primary_product_name?: string;
  primary_product_price_usd: number;
  total_commercial_value_usd?: number;
  effective_good_qty?: number;
  base_qty: number;
  uom_id: string;
  expected_shrinkage_pct: number;
  max_allowed_shrinkage_pct: number;
  standard_labor_hours: number;
  shelf_life_days: number;
  instructions?: string;
  is_active: boolean;
  estimated_batch_cost_usd: number;
  estimated_batch_cost_ves: number;
  estimated_unit_cost_usd: number;
  estimated_unit_cost_ves: number;
  estimated_margin_pct: number;
  inputs: Array<{
    id: number;
    component_variant_id: number;
    component_sku?: string;
    component_name?: string;
    input_role: string;
    quantity: number;
    recipe_uom: string;
    bakers_percentage?: number | null;
    scrap_tolerance_pct: number;
    gross_qty_base: number;
    unit_cost_usd: number;
    line_cost_usd: number;
    line_cost_ves: number;
  }>;
  outputs: Array<{
    id: number;
    output_variant_id: number;
    output_sku?: string;
    output_name?: string;
    output_type: string;
    expected_qty: number;
    uom_id: string;
    expected_yield_pct: number;
    current_sales_price_usd: number;
    calculated_unit_cost_usd?: number;
    calculated_unit_cost_ves?: number;
    cost_allocation_pct?: number;
    projected_margin_pct?: number;
  }>;
}

const SECTOR_CONFIG: Record<string, { label: string; badge: string; icon: string }> = {
  BAKERY: { label: "Panadería & Pastelería", badge: "bg-amber-50 text-amber-700 border-amber-200", icon: "pi-sun" },
  GASTRONOMY: { label: "Cocina & Gastronomía", badge: "bg-orange-50 text-orange-700 border-orange-200", icon: "pi-sparkles" },
  MEAT_PROCESSING: { label: "Sala de Desposte Cárnico", badge: "bg-red-50 text-red-700 border-red-200", icon: "pi-percentage" },
};

function RecipesCatalogContent() {
  const searchParams = useSearchParams();
  const paramSector = searchParams.get("sector") || "ALL";
  const paramType = searchParams.get("bom_type") || "ALL";

  const [boms, setBoms] = useState<BOMItem[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number>(40.0);
  const [loading, setLoading] = useState(true);
  const [sectorFilter, setSectorFilter] = useState<string>(paramSector);
  const [typeFilter, setTypeFilter] = useState<string>(paramType);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [expandedBomId, setExpandedBomId] = useState<number | null>(null);

  useEffect(() => {
    setSectorFilter(paramSector);
    setTypeFilter(paramType);
  }, [paramSector, paramType]);

  const loadBoms = React.useCallback(async () => {
    setLoading(true);
    try {
      const [bomsRes, sumRes] = await Promise.all([
        api.get("/mfg/boms"),
        api.get("/mfg/dashboard-summary").catch(() => ({ data: { exchange_rate: 40.0 } })),
      ]);
      const list = Array.isArray(bomsRes.data) ? bomsRes.data : [];
      setBoms(list);
      setExpandedBomId((prev) => (prev === null && list.length > 0 ? list[0].id : prev));
      if (sumRes.data?.exchange_rate) {
        setExchangeRate(Number(sumRes.data.exchange_rate));
      }
    } catch (err) {
      console.error("Error cargando catálogo de fórmulas:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoms();
  }, [loadBoms]);

  async function handleDelete(bom: BOMItem) {
    if (!window.confirm(`¿Deseas eliminar la fórmula "${bom.code} - ${bom.name}"?`)) return;
    try {
      await api.delete(`/mfg/boms/${bom.id}`);
      await loadBoms();
    } catch (err) {
      console.error("Error eliminando fórmula:", err);
    }
  }

  const filteredBoms = boms.filter((b) => {
    if (sectorFilter !== "ALL" && b.sector !== sectorFilter) return false;
    if (typeFilter !== "ALL" && b.bom_type !== typeFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchName = b.name.toLowerCase().includes(q);
      const matchCode = b.code.toLowerCase().includes(q);
      const matchSku = (b.primary_product_sku || "").toLowerCase().includes(q);
      const matchProd = (b.primary_product_name || "").toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchSku && !matchProd) return false;
    }
    return true;
  });

  return (
    <div className="p-2 sm:p-6 w-full max-w-[1440px] mx-auto space-y-6">
      {/* HEADER */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-orange-500 to-red-600"></div>
        <div className="pl-3">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <i className="pi pi-book text-orange-600"></i>
            Catálogo Maestro de Recetas, Escandallos y Desposte
          </h1>
          <p className="text-slate-500 mt-1 text-sm font-medium">
            Fórmulas Convergentes (Panadería/Gastronomía con % Panadero y Sub-recetas) y Plantillas Divergentes (Desposte Cárnico NIC 2).
          </p>
        </div>

        <Link
          href="/recipes/new"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold px-5 py-3 rounded-xl shadow-md shadow-orange-500/20 transition-all text-sm"
        >
          <i className="pi pi-plus-circle"></i>
          Crear Nueva Fórmula / Simulador
        </Link>
      </div>

      {/* BARRA DE BÚSQUEDA Y FILTROS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSectorFilter("ALL");
              setTypeFilter("ALL");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              sectorFilter === "ALL" && typeFilter === "ALL"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Todas ({boms.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setSectorFilter("BAKERY");
              setTypeFilter("ALL");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              sectorFilter === "BAKERY"
                ? "bg-amber-600 text-white"
                : "bg-amber-50 text-amber-800 hover:bg-amber-100"
            }`}
          >
            🥖 Panadería (% Panadero)
          </button>
          <button
            type="button"
            onClick={() => {
              setSectorFilter("GASTRONOMY");
              setTypeFilter("ALL");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              sectorFilter === "GASTRONOMY"
                ? "bg-orange-600 text-white"
                : "bg-orange-50 text-orange-800 hover:bg-orange-100"
            }`}
          >
            🍲 Cocina & Gastronomía
          </button>
          <button
            type="button"
            onClick={() => {
              setSectorFilter("MEAT_PROCESSING");
              setTypeFilter("DIVERGENT_DISASSEMBLY");
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              sectorFilter === "MEAT_PROCESSING" || typeFilter === "DIVERGENT_DISASSEMBLY"
                ? "bg-red-600 text-white"
                : "bg-red-50 text-red-800 hover:bg-red-100"
            }`}
          >
            🥩 Desposte Cárnico (1 → N)
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-72">
            <i className="pi pi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input
              type="text"
              placeholder="Buscar por código, receta o SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-orange-500"
            />
          </div>
          <div className="hidden sm:block text-xs font-mono font-bold text-slate-600 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            BCV: Bs. {exchangeRate.toFixed(2)}/$
          </div>
        </div>
      </div>

      {/* LISTA DE FÓRMULAS CON DESGLOSE EXPANDIBLE */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-slate-400 border border-slate-200">
          Calculando escandallos y costos bimonetarios en vivo...
        </div>
      ) : filteredBoms.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-slate-400 border border-slate-200">
          No se encontraron fórmulas que coincidan con tu búsqueda.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBoms.map((bom) => {
            const sec = SECTOR_CONFIG[bom.sector] || SECTOR_CONFIG.BAKERY;
            const isExpanded = expandedBomId === bom.id;
            const isDivergent = bom.bom_type === "DIVERGENT_DISASSEMBLY";

            return (
              <div
                key={bom.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all"
              >
                {/* CABECERA DE LA TARJETA */}
                <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-slate-900 text-orange-400">
                        {bom.code}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border ${sec.badge}`}>
                        <i className={`pi ${sec.icon} text-[11px]`}></i>
                        {sec.label}
                      </span>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">
                        {isDivergent ? "1 → N Desposte Cárnico (NIC 2)" : "N → 1 Receta Convergente"}
                      </span>
                      {bom.work_center_name && (
                        <span className="text-xs font-medium text-slate-500">
                          • Estación: <strong className="text-slate-700">{bom.work_center_name}</strong>
                        </span>
                      )}
                    </div>

                    <h3 className="text-lg font-black text-slate-800">{bom.name}</h3>
                    <p className="text-xs text-slate-500">
                      {isDivergent ? "Insumo Matriz:" : "Producto Terminado:"}{" "}
                      <strong className="text-slate-700">
                        [{bom.primary_product_sku}] {bom.primary_product_name}
                      </strong>{" "}
                      • Lote Base: <strong className="font-mono">{bom.base_qty} {bom.uom_id}</strong> • Merma Estándar:{" "}
                      <strong className="text-orange-600">{bom.expected_shrinkage_pct}%</strong> • Vida Útil:{" "}
                      <strong>{bom.shelf_life_days} días</strong>
                    </p>
                  </div>

                  {/* MÉTRICAS BIMONETARIAS RESUMIDAS */}
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Costo Total Lote
                      </span>
                      <span className="text-base font-black text-slate-800 font-mono">
                        ${bom.estimated_batch_cost_usd.toFixed(2)}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono block">
                        Bs. {bom.estimated_batch_cost_ves.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="px-4 py-2.5 rounded-xl bg-orange-50/70 border border-orange-200 text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-orange-700 block">
                        Costo Unitario ({bom.uom_id})
                      </span>
                      <span className="text-base font-black text-orange-600 font-mono">
                        ${bom.estimated_unit_cost_usd.toFixed(4)}
                      </span>
                      <span className="text-[11px] text-orange-700 font-mono block">
                        Bs. {bom.estimated_unit_cost_ves.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="px-4 py-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                        Margen Bruto Est.
                      </span>
                      <span className="text-base font-black text-emerald-700 font-mono">
                        {bom.estimated_margin_pct.toFixed(1)}%
                      </span>
                      <span className="text-[11px] text-emerald-600 block">
                        {isDivergent
                          ? `Valor Cortes: $${(bom.total_commercial_value_usd || 0).toFixed(2)}`
                          : `PVP: $${bom.primary_product_price_usd.toFixed(2)}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedBomId(isExpanded ? null : bom.id)}
                        className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer transition-colors"
                      >
                        <i className={`pi ${isExpanded ? "pi-chevron-up" : "pi-chevron-down"} mr-1`}></i>
                        {isExpanded ? "Ocultar Escandallo" : "Ver Escandallo"}
                      </button>
                      <Link
                        href={`/recipes/new?edit=${bom.id}`}
                        className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-white text-xs font-bold shadow-sm hover:from-orange-600 hover:to-red-700 transition-all"
                      >
                        <i className="pi pi-calculator mr-1"></i>
                        Simular / Editar
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(bom)}
                        className="p-2.5 rounded-xl border border-slate-200 text-red-500 hover:bg-red-50 cursor-pointer"
                        title="Eliminar fórmula"
                      >
                        <i className="pi pi-trash text-xs"></i>
                      </button>
                    </div>
                  </div>
                </div>

                {/* DETALLE EXPANDIBLE DE INGREDIENTES Y RENDIMIENTO DE CORTES */}
                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50/60 p-5 sm:p-6 space-y-6">
                    {/* TABLA DE INSUMOS / INGREDIENTES */}
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 mb-3 flex items-center gap-2">
                        <i className="pi pi-box text-orange-600"></i>
                        Insumos, Sub-recetas y Empaques Requeridos ({bom.inputs.length} componentes)
                      </h4>
                      <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100 text-slate-500 font-bold uppercase text-[10px]">
                              <th className="py-2.5 px-3">Insumo / Componente</th>
                              <th className="py-2.5 px-3">Rol</th>
                              <th className="py-2.5 px-3 text-right">Cant. Receta</th>
                              <th className="py-2.5 px-3 text-right">% Panadero</th>
                              <th className="py-2.5 px-3 text-right">Merma Limpieza</th>
                              <th className="py-2.5 px-3 text-right">Cant. Bruta (Base)</th>
                              <th className="py-2.5 px-3 text-right">Costo Unit. ($)</th>
                              <th className="py-2.5 px-3 text-right">Subtotal ($ / Bs)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {bom.inputs.map((inp) => (
                              <tr key={inp.id}>
                                <td className="py-2.5 px-3">
                                  <span className="font-mono font-bold text-orange-600 mr-1.5">{inp.component_sku}</span>
                                  <span className="font-semibold text-slate-800">{inp.component_name}</span>
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold text-[10px]">
                                    {inp.input_role}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold">
                                  {inp.quantity} {inp.recipe_uom}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono">
                                  {inp.bakers_percentage ? (
                                    <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-bold border border-amber-200">
                                      {inp.bakers_percentage}%
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                                  {inp.scrap_tolerance_pct}%
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-700">
                                  {inp.gross_qty_base.toFixed(3)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                                  ${inp.unit_cost_usd.toFixed(4)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono">
                                  <span className="font-bold text-slate-800">${inp.line_cost_usd.toFixed(2)}</span>
                                  <span className="text-slate-400 ml-1.5">(Bs. {inp.line_cost_ves.toFixed(2)})</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* SI ES DESPOSTE CÁRNICO O TIENE MÚLTIPLES SALIDAS, MOSTRAR DISTRIBUCIÓN NIC 2 */}
                    {bom.outputs && bom.outputs.length > 0 && (
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 mb-3 flex items-center gap-2">
                          <i className="pi pi-percentage text-red-600"></i>
                          {isDivergent
                            ? "Rendimiento de Cortes y Distribución de Costo Conjunto por Valor de Mercado (NIC 2)"
                            : "Productos Terminados Esperados"}
                        </h4>
                        <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-100 text-slate-500 font-bold uppercase text-[10px]">
                                <th className="py-2.5 px-3">Corte / Producto Obtenido</th>
                                <th className="py-2.5 px-3">Clasificación</th>
                                <th className="py-2.5 px-3 text-right">Peso / Cant. Esp.</th>
                                <th className="py-2.5 px-3 text-right">Índice Yield (%)</th>
                                <th className="py-2.5 px-3 text-right">PVP Ref. ($/Kg)</th>
                                <th className="py-2.5 px-3 text-right">% Absorción Costo</th>
                                <th className="py-2.5 px-3 text-right">Costo Unit. Liquidado</th>
                                <th className="py-2.5 px-3 text-right">Margen Proy.</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {bom.outputs.map((out) => (
                                <tr key={out.id}>
                                  <td className="py-2.5 px-3">
                                    <span className="font-mono font-bold text-red-600 mr-1.5">{out.output_sku}</span>
                                    <span className="font-semibold text-slate-800">{out.output_name}</span>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span
                                      className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                        out.output_type === "BY_PRODUCT"
                                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      }`}
                                    >
                                      {out.output_type}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold">
                                    {out.expected_qty} {out.uom_id}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700">
                                    {out.expected_yield_pct.toFixed(2)}%
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono">
                                    ${(out.current_sales_price_usd || 0).toFixed(2)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                                    {out.output_type === "BY_PRODUCT" ? "Crédito Fijo VNR" : `${(out.cost_allocation_pct || 0).toFixed(2)}%`}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono">
                                    <span className="font-black text-orange-600">
                                      ${(out.calculated_unit_cost_usd || 0).toFixed(2)}/{out.uom_id}
                                    </span>
                                    <span className="text-slate-400 ml-1">
                                      (Bs. {(out.calculated_unit_cost_ves || 0).toFixed(2)})
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                                    {(out.projected_margin_pct || 0).toFixed(1)}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RecipesCatalogPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando catálogo de recetas...</div>}>
      <RecipesCatalogContent />
    </Suspense>
  );
}
