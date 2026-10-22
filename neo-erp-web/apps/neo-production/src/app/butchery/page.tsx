"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { VariantCombobox, CatalogVariant } from "@/components/ui/VariantCombobox";

interface ButcheryOrderListItem {
  id: number;
  order_number: string;
  state: string;
  order_type: string;
  sector: string;
  facility_id: number;
  facility_name: string;
  work_center_id?: number | null;
  work_center_name?: string | null;
  bom_id?: number | null;
  bom_code?: string | null;
  bom_name?: string | null;
  uom_id: string;
  primary_product_variant_id?: number | null;
  primary_product_sku?: string | null;
  primary_product_name?: string | null;
  planned_base_qty: number;
  actual_input_weight_kg: number;
  actual_good_qty: number;
  actual_byproduct_qty: number;
  natural_shrinkage_qty: number;
  explicit_waste_qty: number;
  meat_yield_pct: number;
  total_recovery_yield_pct: number;
  outputs_count: number;
  net_production_cost_usd: number;
  net_production_cost_ves: number;
  total_byproduct_credit_usd: number;
  total_byproduct_credit_ves: number;
  total_commercial_value_usd: number;
  total_commercial_value_ves: number;
  calculated_unit_cost_usd: number;
  calculated_unit_cost_ves: number;
  total_explicit_waste_cost_usd: number;
  generated_batch_number?: string | null;
  generated_batch_expiry_date?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

interface BOMOption {
  id: number;
  code: string;
  name: string;
  bom_type: string;
  sector: string;
  work_center_id?: number | null;
  work_center_name?: string | null;
  base_qty: number;
  uom_id: string;
  expected_shrinkage_pct: number;
  primary_product_sku?: string;
  primary_product_name?: string;
}

interface AdHocButcheryOutputRow {
  output_variant_id: number;
  planned_qty: number;
  output_type: string;
  market_reference_price: number;
}

interface ExplodeInputItem {
  bom_input_id?: number | null;
  component_variant_id: number;
  component_sku: string;
  component_name: string;
  input_role: string;
  uom_base: string;
  is_discrete_uom: boolean;
  planned_base_qty: number;
  available_stock_qty: number;
  shortage_qty: number;
  availability_status: "AVAILABLE" | "PARTIAL" | "SHORTAGE";
  suggested_batch_id: number | null;
  suggested_batch_number: string | null;
  suggested_batch_expiry_date: string | null;
  unit_cost_usd: number;
  unit_cost_ves: number;
  total_cost_usd: number;
  total_cost_ves: number;
}

interface ExplodeOutputItem {
  bom_output_id?: number | null;
  output_variant_id: number;
  output_sku: string;
  output_name: string;
  output_type: string;
  cost_allocation_method: string;
  uom_base: string;
  expected_yield_pct: number;
  planned_qty: number;
  market_reference_price_usd: number;
  market_reference_price_ves: number;
  commercial_value_usd: number;
  commercial_value_ves: number;
  cost_allocation_pct: number;
  allocated_total_cost_usd: number;
  allocated_total_cost_ves: number;
  calculated_unit_cost_usd: number;
  calculated_unit_cost_ves: number;
  projected_wavg_cost_usd?: number;
  gross_margin_pct?: number;
  projected_margin_pct?: number;
}

interface ExplodePreviewResponse {
  bom_id?: number | null;
  bom_code: string;
  bom_name: string;
  bom_type: string;
  sector: string;
  work_center_name?: string | null;
  primary_product_sku?: string | null;
  primary_product_name?: string | null;
  exchange_rate: number;
  base_qty: number;
  planned_base_qty: number;
  scale_factor: number;
  uom_id: string;
  expected_shrinkage_pct: number;
  expected_natural_shrinkage_qty: number;
  expected_good_qty: number;
  expected_byproduct_qty?: number;
  standard_labor_hours: number;
  shelf_life_days: number;
  stock_semaphore: "AVAILABLE" | "PARTIAL" | "SHORTAGE";
  cost_projection: {
    direct_materials_usd: number;
    direct_materials_ves: number;
    packaging_usd: number;
    packaging_ves: number;
    direct_labor_mod_usd: number;
    direct_labor_mod_ves: number;
    indirect_overhead_cif_usd: number;
    indirect_overhead_cif_ves: number;
    gross_production_cost_usd?: number;
    gross_production_cost_ves?: number;
    byproduct_credit_usd?: number;
    byproduct_credit_ves?: number;
    net_joint_cost_to_distribute_usd?: number;
    net_joint_cost_to_distribute_ves?: number;
    total_batch_cost_usd: number;
    total_batch_cost_ves: number;
    projected_unit_cost_usd: number;
    projected_unit_cost_ves: number;
    projected_margin_pct: number;
  };
  inputs: ExplodeInputItem[];
  outputs?: ExplodeOutputItem[];
}

const STATE_BADGES: Record<string, { label: string; color: string; icon: string }> = {
  DRAFT: { label: "Borrador", color: "bg-slate-100 text-slate-700 border-slate-200", icon: "pi-file" },
  PLANNED: { label: "Planificada", color: "bg-blue-50 text-blue-700 border-blue-200", icon: "pi-calendar" },
  IN_PROGRESS: { label: "En Riel / Mesa de Corte", color: "bg-amber-50 text-amber-700 border-amber-200", icon: "pi-spin pi-cog" },
  COMPLETED: { label: "Liquidada NIC 2 (Kardex)", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "pi-check-circle" },
  CANCELLED: { label: "Cancelada", color: "bg-red-50 text-red-700 border-red-200", icon: "pi-times-circle" },
};

const OUTPUT_TYPE_BADGES: Record<string, { label: string; color: string }> = {
  PRIMARY_PRODUCT: { label: "Corte Noble Principal", color: "bg-red-50 text-red-700 border-red-200" },
  CO_PRODUCT: { label: "Co-Producto Comercial", color: "bg-orange-50 text-orange-700 border-orange-200" },
  BY_PRODUCT: { label: "Subproducto (VRN Fijo)", color: "bg-blue-50 text-blue-700 border-blue-200" },
};

export default function ButcheryDisassemblyDashboardPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<ButcheryOrderListItem[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number>(40.0);
  const [butcheryKpis, setButcheryKpis] = useState({
    total_butchery_orders: 0,
    in_progress_butchery_orders: 0,
    completed_butchery_orders: 0,
    carcass_weight_processed_kg: 0,
    good_cuts_weight_produced_kg: 0,
    average_meat_yield_pct: 88.0,
    settled_cuts_value_usd: 0,
    settled_cuts_value_ves: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [filterState, setFilterState] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  // Modal de Nueva Orden de Desposte (1 Canal -> N Cortes)
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const dialogRef = React.useRef<HTMLDialogElement | null>(null);
  const [createMode, setCreateMode] = useState<"BOM" | "ADHOC">("BOM");
  const [boms, setBoms] = useState<BOMOption[]>([]);
  const [selectedBomId, setSelectedBomId] = useState<number>(0);
  const [carcassWeightKg, setCarcassWeightKg] = useState<number>(100);
  const [sourceWarehouseId, setSourceWarehouseId] = useState<number>(1);
  const [destWarehouseId, setDestWarehouseId] = useState<number>(1);
  const [startImmediately, setStartImmediately] = useState<boolean>(true);
  const [orderNotes, setOrderNotes] = useState<string>("");
  const [explodePreview, setExplodePreview] = useState<ExplodePreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [creatingOrder, setCreatingOrder] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Estado para Desposte / Transformación Libre (Ad-Hoc 1 -> N sin plantilla)
  const [variants, setVariants] = useState<CatalogVariant[]>([]);
  const [adhocInputVariantId, setAdhocInputVariantId] = useState<number>(0);
  const [adhocInputWeightKg, setAdhocInputWeightKg] = useState<number>(50);
  const [adhocExpectedShrinkagePct, setAdhocExpectedShrinkagePct] = useState<number>(3.0);
  const [adhocOutputs, setAdhocOutputs] = useState<AdHocButcheryOutputRow[]>([
    {
      output_variant_id: 0,
      planned_qty: 25,
      output_type: "PRIMARY_PRODUCT",
      market_reference_price: 9.5,
    },
    {
      output_variant_id: 0,
      planned_qty: 20,
      output_type: "CO_PRODUCT",
      market_reference_price: 6.5,
    },
  ]);

  const searchCatalogVariants = useCallback(async (queryText: string) => {
    try {
      const res = await api.get("/mfg/catalog/variants", {
        params: { search: queryText, limit: 80 },
      });
      const fetched: CatalogVariant[] = res.data.items || [];
      setVariants((prev) => {
        const map = new Map<number, CatalogVariant>();
        for (const v of prev) map.set(v.id, v);
        for (const v of fetched) map.set(v.id, v);
        return Array.from(map.values());
      });
    } catch (err) {
      console.error("Error buscando variantes:", err);
    }
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (showCreateModal) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [showCreateModal]);

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
  }, [showCreateModal]);

  const fetchButcheryOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        order_type: "MEAT_DISASSEMBLY",
      };
      if (filterState) params.state = filterState;
      if (search.trim()) params.search = search.trim();

      const res = await api.get("/mfg/orders", { params });
      setOrders(res.data.items || []);
      if (res.data.exchange_rate) setExchangeRate(res.data.exchange_rate);
      if (res.data.butchery_kpis) setButcheryKpis(res.data.butchery_kpis);
    } catch (err) {
      console.error("Error cargando órdenes de Sala de Desposte:", err);
    } finally {
      setLoading(false);
    }
  }, [filterState, search]);

  useEffect(() => {
    fetchButcheryOrders();
  }, [fetchButcheryOrders]);

  const openNewButcheryModal = async () => {
    setActionError(null);
    setShowCreateModal(true);
    try {
      const promises: Promise<unknown>[] = [];
      if (boms.length === 0) {
        promises.push(
          api.get("/mfg/boms").then((res) => {
            const list: BOMOption[] = res.data || [];
            const divergentList = list.filter((b) => b.bom_type === "DIVERGENT_DISASSEMBLY");
            const finalBoms = divergentList.length > 0 ? divergentList : list;
            setBoms(finalBoms);
            const firstDes = finalBoms.find((b) => b.code === "DES-RES-001") || finalBoms[0];
            if (firstDes) {
              setSelectedBomId(firstDes.id);
              setCarcassWeightKg(firstDes.base_qty || 100);
            }
          })
        );
      }
      if (variants.length === 0) {
        promises.push(
          api.get("/mfg/catalog/variants", { params: { limit: 150 } }).then((res) => {
            const vList: CatalogVariant[] = res.data.items || [];
            setVariants(vList);
            if (vList.length > 0) {
              setAdhocInputVariantId((prev) => prev || vList[0].id);
              setAdhocOutputs((prev) =>
                prev[0]?.output_variant_id === 0
                  ? [
                      {
                        output_variant_id: vList[Math.min(1, vList.length - 1)].id,
                        planned_qty: 25,
                        output_type: "PRIMARY_PRODUCT",
                        market_reference_price: vList[Math.min(1, vList.length - 1)].sales_price_usd || 9.5,
                      },
                      {
                        output_variant_id: vList[Math.min(2, vList.length - 1)].id,
                        planned_qty: 20,
                        output_type: "CO_PRODUCT",
                        market_reference_price: vList[Math.min(2, vList.length - 1)].sales_price_usd || 6.5,
                      },
                    ]
                  : prev
              );
            }
          })
        );
      }
      await Promise.all(promises);
    } catch (err) {
      console.error("Error cargando plantillas de desposte:", err);
    }
  };

  useEffect(() => {
    if (!showCreateModal) return;
    let active = true;
    async function runExplode() {
      if (createMode === "BOM") {
        if (!selectedBomId || carcassWeightKg <= 0) {
          setExplodePreview(null);
          return;
        }
        setLoadingPreview(true);
        try {
          const res = await api.post("/mfg/orders/explode-preview", {
            bom_id: selectedBomId,
            planned_base_qty: carcassWeightKg,
            facility_id: 1,
            source_warehouse_id: sourceWarehouseId,
            dest_warehouse_id: destWarehouseId,
          });
          if (active) {
            setExplodePreview(res.data);
          }
        } catch (err) {
          console.error("Error en explosión/implosión de desposte:", err);
        } finally {
          if (active) setLoadingPreview(false);
        }
      } else {
        const validOutputs = adhocOutputs.filter(
          (o) => o.output_variant_id > 0 && o.planned_qty > 0
        );
        if (!adhocInputVariantId || adhocInputWeightKg <= 0 || validOutputs.length === 0) {
          setExplodePreview(null);
          return;
        }
        setLoadingPreview(true);
        try {
          const res = await api.post("/mfg/orders/explode-preview", {
            bom_id: null,
            planned_base_qty: adhocInputWeightKg,
            facility_id: 1,
            source_warehouse_id: sourceWarehouseId,
            dest_warehouse_id: destWarehouseId,
            sector: "MEAT_PROCESSING",
            order_type: "MEAT_DISASSEMBLY",
            expected_shrinkage_pct: adhocExpectedShrinkagePct,
            inputs: [
              {
                component_variant_id: adhocInputVariantId,
                planned_qty: adhocInputWeightKg,
                input_role: "PRIMARY_MATRIX",
              },
            ],
            outputs: validOutputs.map((out) => ({
              output_variant_id: out.output_variant_id,
              planned_qty: out.planned_qty,
              output_type: out.output_type,
              cost_allocation_method:
                out.output_type === "BY_PRODUCT" ? "FIXED_NRV" : "MARKET_VALUE_INDEX",
              market_reference_price: out.market_reference_price,
            })),
          });
          if (active) {
            setExplodePreview(res.data);
          }
        } catch (err) {
          console.error("Error en explosión/implosión Ad-Hoc de desposte:", err);
        } finally {
          if (active) setLoadingPreview(false);
        }
      }
    }
    const timer = setTimeout(runExplode, 160);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    showCreateModal,
    createMode,
    selectedBomId,
    carcassWeightKg,
    sourceWarehouseId,
    destWarehouseId,
    adhocInputVariantId,
    adhocInputWeightKg,
    adhocExpectedShrinkagePct,
    adhocOutputs,
  ]);

  const handleBomSelectChange = (bomId: number) => {
    setSelectedBomId(bomId);
    const found = boms.find((b) => b.id === bomId);
    if (found) {
      setCarcassWeightKg(found.base_qty || 100);
    }
  };

  const handleCreateButcheryOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingOrder(true);
    setActionError(null);
    try {
      if (createMode === "BOM") {
        if (!selectedBomId || carcassWeightKg <= 0) {
          setCreatingOrder(false);
          return;
        }
        const res = await api.post("/mfg/orders", {
          bom_id: selectedBomId,
          facility_id: 1,
          source_warehouse_id: sourceWarehouseId,
          dest_warehouse_id: destWarehouseId,
          planned_base_qty: carcassWeightKg,
          start_immediately: startImmediately,
          notes:
            orderNotes.trim() ||
            `Desposte cárnico en riel (${carcassWeightKg} Kg) — Liquidación NIC 2 por Valor Relativo de Mercado.`,
        });
        setShowCreateModal(false);
        router.push(`/butchery/${res.data.id}`);
      } else {
        const validOutputs = adhocOutputs.filter(
          (o) => o.output_variant_id > 0 && o.planned_qty > 0
        );
        if (!adhocInputVariantId || adhocInputWeightKg <= 0 || validOutputs.length === 0) {
          setActionError(
            "Seleccione la pieza/canal de entrada y al menos 1 corte o producto resultante."
          );
          setCreatingOrder(false);
          return;
        }
        const res = await api.post("/mfg/orders", {
          bom_id: null,
          facility_id: 1,
          source_warehouse_id: sourceWarehouseId,
          dest_warehouse_id: destWarehouseId,
          sector: "MEAT_PROCESSING",
          order_type: "MEAT_DISASSEMBLY",
          planned_base_qty: adhocInputWeightKg,
          expected_shrinkage_pct: adhocExpectedShrinkagePct,
          start_immediately: startImmediately,
          notes:
            orderNotes.trim() ||
            `Desposte / Transformación Libre (${adhocInputWeightKg} Kg) — Liquidación NIC 2 sin plantilla.`,
          inputs: [
            {
              component_variant_id: adhocInputVariantId,
              planned_qty: adhocInputWeightKg,
              input_role: "PRIMARY_MATRIX",
            },
          ],
          outputs: validOutputs.map((out) => ({
            output_variant_id: out.output_variant_id,
            planned_qty: out.planned_qty,
            output_type: out.output_type,
            cost_allocation_method:
              out.output_type === "BY_PRODUCT" ? "FIXED_NRV" : "MARKET_VALUE_INDEX",
            market_reference_price: out.market_reference_price,
          })),
        });
        setShowCreateModal(false);
        router.push(`/butchery/${res.data.id}`);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "No se pudo crear la Orden de Desposte.";
      setActionError(msg);
    } finally {
      setCreatingOrder(false);
    }
  };

  return (
    <div className="p-2 sm:p-6 w-full max-w-[1440px] mx-auto space-y-6">
      {/* CABECERA HERO DE SALA DE DESPOSTE */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-red-600 to-orange-500"></div>
        <div className="pl-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-bold mb-2">
            <i className="pi pi-percentage text-xs"></i>
            FASE 3 • SALA DE DESPOSTE CÁRNICO (1 CANAL → N CORTES) & COSTEO CONJUNTO NIC 2
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">
            Sala de Desposte Cárnico y Balance de Masa
          </h1>
          <p className="text-slate-500 mt-1 text-sm font-medium max-w-2xl">
            Transformación divergente de Media Canal en múltiples cortes comerciales, control estricto de Balance de Masa al 100%, crédito por subproductos (VRN) y prorrateo de costos conjuntos por Índice de Valor de Mercado (NIC 2 Párrafo 14).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl border border-slate-800 flex items-center gap-3 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
              <i className="pi pi-dollar text-sm font-bold"></i>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-bold">
                Tasa Oficial BCV
              </span>
              <span className="text-sm font-black text-emerald-400 font-mono">
                Bs. {exchangeRate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / USD
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={openNewButcheryModal}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600 text-white font-bold px-5 py-3 rounded-xl shadow-md shadow-red-500/20 transition-all text-sm cursor-pointer"
          >
            <i className="pi pi-plus-circle"></i>
            + Nueva Orden de Desposte
          </button>
        </div>
      </div>

      {/* TARJETAS KPI DE SALA DE DESPOSTE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
              <i className="pi pi-box text-lg"></i>
            </div>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
              {butcheryKpis.completed_butchery_orders} Liquidadas
            </span>
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Canales Procesadas
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-slate-800 font-mono">
              {butcheryKpis.carcass_weight_processed_kg.toFixed(1)} Kg
            </span>
            <span className="text-xs text-slate-500 font-medium">de canal despostada</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <i className="pi pi-cog text-lg"></i>
            </div>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
              Mesa de Corte Activa
            </span>
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Canales en Riel / Proceso
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-amber-600">{butcheryKpis.in_progress_butchery_orders}</span>
            <span className="text-xs text-slate-500 font-medium">
              de {butcheryKpis.total_butchery_orders} órdenes totales
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <i className="pi pi-percentage text-lg"></i>
            </div>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
              Merma Oreo Esp: 3.0%
            </span>
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Rendimiento Cárnico (Cortes)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black text-emerald-600 font-mono">
              {butcheryKpis.average_meat_yield_pct.toFixed(1)}%
            </span>
            <span className="text-xs text-slate-500 font-medium">
              ({butcheryKpis.good_cuts_weight_produced_kg.toFixed(1)} Kg cortes nobles)
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <i className="pi pi-dollar text-lg"></i>
            </div>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-orange-50 text-orange-700 border border-orange-200">
              NIC 2 Capitalizado
            </span>
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Valor Cortes + Subproductos
          </span>
          <div className="text-2xl font-black text-slate-800 mt-1 font-mono">
            ${butcheryKpis.settled_cuts_value_usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs font-bold text-slate-500 font-mono">
            Bs. {butcheryKpis.settled_cuts_value_ves.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { value: "", label: "Todas las Órdenes de Desposte" },
            { value: "IN_PROGRESS", label: "En Riel / Mesa de Corte" },
            { value: "PLANNED", label: "Planificadas" },
            { value: "COMPLETED", label: "Liquidadas en Kardex (NIC 2)" },
          ].map((st) => (
            <button
              key={st.value}
              type="button"
              onClick={() => setFilterState(st.value)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterState === st.value
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <i className="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar folio OP o plantilla DES-RES-001..."
            className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-red-500"
          />
        </div>
      </div>

      {/* TABLA DE ÓRDENES DE SALA DE DESPOSTE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div tabIndex={0} role="region" aria-label="Listado de órdenes de desposte cárnico" className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">Folio OP / Estado</th>
                <th className="py-3.5 px-4">Canal / Plantilla Desposte</th>
                <th className="py-3.5 px-4 text-right">Peso Entrada Canal</th>
                <th className="py-3.5 px-4 text-right">Cortes + Subproductos</th>
                <th className="py-3.5 px-4 text-right">Mermas (Oreo / Dañada)</th>
                <th className="py-3.5 px-4 text-right">Costo Neto Distribuido</th>
                <th className="py-3.5 px-4 text-right">Valor Comercial Cortes</th>
                <th className="py-3.5 px-4 text-center">Mesa de Desposte</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Cargando órdenes de Sala de Desposte Cárnico...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No se encontraron órdenes de desposte con los filtros actuales.
                  </td>
                </tr>
              ) : (
                orders.map((op) => {
                  const st = STATE_BADGES[op.state] || STATE_BADGES.DRAFT;
                  return (
                    <tr key={op.id} className="hover:bg-slate-50/90 transition-colors">
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/butchery/${op.id}`}
                          className="font-mono text-xs font-black text-red-600 hover:underline block"
                        >
                          {op.order_number}
                        </Link>
                        <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${st.color}`}>
                          <i className={`pi ${st.icon} text-[10px]`}></i>
                          {st.label}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{op.bom_name}</div>
                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                          {op.bom_id === null || op.bom_code === "TRANSF-LIBRE" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-bold text-[10px]">
                              ⚡ Transformación Libre
                            </span>
                          ) : (
                            <span className="font-mono font-semibold text-red-600">{op.bom_code}</span>
                          )}
                          <span>• {op.outputs_count} salidas conjuntas ({op.work_center_name || "Sala de Desposte"})</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono">
                        <div className="font-black text-slate-800 text-base">
                          {op.actual_input_weight_kg.toFixed(2)} {op.uom_id}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Plan: {op.planned_base_qty.toFixed(2)} {op.uom_id}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono">
                        <div className="font-bold text-emerald-700">
                          {op.actual_good_qty.toFixed(2)} Kg Cortes ({op.meat_yield_pct.toFixed(1)}%)
                        </div>
                        <div className="text-xs text-blue-600 font-semibold">
                          + {op.actual_byproduct_qty.toFixed(2)} Kg Subprod. (Total: {op.total_recovery_yield_pct.toFixed(1)}%)
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-xs">
                        <div className="text-amber-700 font-semibold">
                          Oreo: {op.natural_shrinkage_qty.toFixed(2)} Kg
                        </div>
                        {op.explicit_waste_qty > 0 ? (
                          <div className="text-red-600 font-bold">
                            Dañado: {op.explicit_waste_qty.toFixed(2)} Kg (${op.total_explicit_waste_cost_usd.toFixed(2)})
                          </div>
                        ) : (
                          <div className="text-emerald-600 text-[11px]">Sin daño anormal</div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono">
                        <div className="font-bold text-slate-800">${op.net_production_cost_usd.toFixed(2)}</div>
                        <div className="text-xs text-slate-500">
                          Bs. {op.net_production_cost_ves.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        {op.total_byproduct_credit_usd > 0 && (
                          <div className="text-[10px] text-blue-600 font-bold">
                            Créd. Subprod: -${op.total_byproduct_credit_usd.toFixed(2)}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono">
                        <div className="font-black text-emerald-700">${op.total_commercial_value_usd.toFixed(2)}</div>
                        <div className="text-xs text-slate-500">
                          Bs. {op.total_commercial_value_ves.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <Link
                          href={`/butchery/${op.id}`}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                            op.state === "COMPLETED"
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                              : "bg-gradient-to-r from-red-600 to-orange-500 text-white hover:from-red-700 hover:to-orange-600 shadow-sm"
                          }`}
                        >
                          <i className={`pi ${op.state === "COMPLETED" ? "pi-verified" : "pi-sliders-h"} text-xs`}></i>
                          {op.state === "COMPLETED" ? "Ver Liquidación NIC 2" : "Pesar y Liquidar"}
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

      {/* MODAL DE NUEVA ORDEN DE DESPOSTE CON EXPLOSIÓN FEFO + IMPLOSIÓN DE CORTES ESPERADOS */}
      <dialog
        ref={dialogRef}
        aria-labelledby="new-butchery-dialog-title"
        onClose={() => setShowCreateModal(false)}
        {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
        className="m-auto p-0 bg-transparent border-0 w-full max-w-6xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm"
      >
        {showCreateModal && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-h-[92vh] flex flex-col overflow-hidden text-left">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center">
                  <i className="pi pi-percentage text-white"></i>
                </div>
                <div>
                  <h2 id="new-butchery-dialog-title" className="text-lg font-black tracking-tight">
                    Nueva Orden de Desposte Cárnico • 1 Canal → N Cortes (NIC 2)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Explosión de Canal/Empaque bajo regla FEFO e Implosión proyectada de rendimientos y costos conjuntos por Valor Relativo de Mercado.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer"
              >
                <i className="pi pi-times text-sm"></i>
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateButcheryOrder} className="flex-1 overflow-y-auto p-6 space-y-6">
              {actionError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
                  <i className="pi pi-exclamation-triangle"></i>
                  {actionError}
                </div>
              )}

              {/* Selector de Modalidad: Con Plantilla vs Desposte / Transformación Libre */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setCreateMode("BOM")}
                  className={`py-2.5 px-4 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    createMode === "BOM"
                      ? "bg-white text-slate-900 shadow-sm border border-slate-200/80"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span>📋 Con Plantilla de Desposte</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreateMode("ADHOC")}
                  className={`py-2.5 px-4 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    createMode === "ADHOC"
                      ? "bg-gradient-to-r from-red-600 to-purple-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span>⚡ Desposte / Transformación Libre (Sin Plantilla)</span>
                </button>
              </div>

              {createMode === "BOM" ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Plantilla de Desposte Divergente (1 → N)
                    </label>
                    <select
                      value={selectedBomId}
                      onChange={(e) => handleBomSelectChange(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-red-500"
                    >
                      {boms.map((b) => (
                        <option key={b.id} value={b.id}>
                          [{b.code}] {b.name} — Base: {b.base_qty} {b.uom_id} (Merma Oreo Esp: {b.expected_shrinkage_pct}%)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Peso de Entrada de la Canal ({explodePreview?.uom_id || "KG"})
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      value={carcassWeightKg}
                      onChange={(e) => setCarcassWeightKg(Math.max(1, Number(e.target.value)))}
                      className="w-full bg-red-50/50 border border-red-300 rounded-xl px-3.5 py-2.5 text-base font-mono font-black text-red-700 focus:outline-none focus:border-red-600"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4 p-4 rounded-2xl bg-purple-50/40 border border-purple-200/80">
                  <div>
                    <span className="text-xs font-black text-purple-800 uppercase tracking-wider block">
                      ⚡ Desposte / Porcionado Libre 1 → N (Sin Plantilla Previa)
                    </span>
                    <span className="text-[11px] text-slate-600">
                      Selecciona cualquier pieza matriz (ej. Media Canal, Queso Entero, Pernil) y los cortes/porciones resultantes para prorratear costos bajo NIC 2.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-7">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Pieza Matriz / Canal de Entrada (`PRIMARY_MATRIX`)
                      </label>
                      <VariantCombobox
                        value={adhocInputVariantId}
                        variants={variants}
                        onChange={(vid) => setAdhocInputVariantId(vid)}
                        onSearchCatalog={searchCatalogVariants}
                        placeholder="Seleccionar canal o pieza matriz..."
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Peso de Entrada (Kg)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={adhocInputWeightKg}
                        onChange={(e) => setAdhocInputWeightKg(Math.max(0.1, Number(e.target.value)))}
                        className="w-full bg-white border border-red-300 rounded-xl px-3 py-2.5 text-sm font-mono font-black text-red-700"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Merma Oreo %
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="50"
                        value={adhocExpectedShrinkagePct}
                        onChange={(e) => setAdhocExpectedShrinkagePct(Math.max(0, Number(e.target.value)))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-slate-700"
                      />
                    </div>
                  </div>

                  {/* Lista dinámica de cortes / salidas Ad-Hoc */}
                  <div className="space-y-2 pt-2 border-t border-purple-200/60">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Cortes Comerciales y Subproductos Resultantes (1..N)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const defaultVar = variants[0];
                          setAdhocOutputs((prev) => [
                            ...prev,
                            {
                              output_variant_id: defaultVar?.id || 0,
                              planned_qty: 5,
                              output_type: "CO_PRODUCT",
                              market_reference_price: defaultVar?.sales_price_usd || 6.0,
                            },
                          ]);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                      >
                        <i className="pi pi-plus text-[10px]"></i>
                        Añadir Corte / Subproducto
                      </button>
                    </div>

                    <div className="space-y-2">
                      {adhocOutputs.map((row, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-xl border border-slate-200"
                        >
                          <div className="sm:col-span-5">
                            <VariantCombobox
                              value={row.output_variant_id}
                              variants={variants}
                              compact
                              onChange={(vid, vObj) =>
                                setAdhocOutputs((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? {
                                          ...r,
                                          output_variant_id: vid,
                                          market_reference_price:
                                            vObj && vObj.sales_price_usd > 0
                                              ? vObj.sales_price_usd
                                              : r.market_reference_price,
                                        }
                                      : r
                                  )
                                )
                              }
                              onSearchCatalog={searchCatalogVariants}
                              placeholder="Seleccionar corte o subproducto..."
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={row.planned_qty}
                              onChange={(e) =>
                                setAdhocOutputs((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? { ...r, planned_qty: Math.max(0.01, Number(e.target.value)) }
                                      : r
                                  )
                                )
                              }
                              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-slate-800 text-right"
                              placeholder="Peso Kg"
                              title="Peso esperado (Kg)"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <select
                              value={row.output_type}
                              onChange={(e) =>
                                setAdhocOutputs((prev) =>
                                  prev.map((r, i) =>
                                    i === idx ? { ...r, output_type: e.target.value } : r
                                  )
                                )
                              }
                              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700"
                            >
                              <option value="PRIMARY_PRODUCT">PRIMARY_PRODUCT</option>
                              <option value="CO_PRODUCT">CO_PRODUCT</option>
                              <option value="BY_PRODUCT">BY_PRODUCT (VRN)</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={row.market_reference_price}
                              onChange={(e) =>
                                setAdhocOutputs((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? {
                                          ...r,
                                          market_reference_price: Math.max(0.01, Number(e.target.value)),
                                        }
                                      : r
                                  )
                                )
                              }
                              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-700 text-right"
                              placeholder="PVP $/Kg"
                              title="Precio Ref. Mercado ($/Kg)"
                            />
                          </div>
                          <div className="sm:col-span-1 text-right">
                            <button
                              type="button"
                              disabled={adhocOutputs.length <= 1}
                              onClick={() =>
                                setAdhocOutputs((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 cursor-pointer"
                              title="Eliminar corte"
                            >
                              <i className="pi pi-trash text-xs"></i>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Cava / Almacén Origen Canal (MFG-OUT)
                  </label>
                  <select
                    value={sourceWarehouseId}
                    onChange={(e) => setSourceWarehouseId(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-700"
                  >
                    <option value={1}>WH01 — Cava Frigorífica / Piso WIP</option>
                    <option value={4}>MAIN_WH — Almacén Principal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Almacén Destino Cortes (MFG-IN)
                  </label>
                  <select
                    value={destWarehouseId}
                    onChange={(e) => setDestWarehouseId(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-700"
                  >
                    <option value={1}>WH01 — Cava de Cortes / Carnicería</option>
                    <option value={4}>MAIN_WH — Almacén Principal</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <label className="flex items-center gap-2.5 bg-red-50/70 border border-red-200 rounded-xl px-3.5 py-2.5 w-full cursor-pointer">
                    <input
                      type="checkbox"
                      checked={startImmediately}
                      onChange={(e) => setStartImmediately(e.target.checked)}
                      className="rounded text-red-600 focus:ring-red-500"
                    />
                    <span className="text-xs font-bold text-slate-800">
                      Pasar Canal a Riel Inmediatamente (`IN_PROGRESS`)
                    </span>
                  </label>
                </div>
              </div>

              {loadingPreview ? (
                <div className="p-8 text-center text-slate-400 text-sm bg-slate-50 rounded-2xl border border-slate-200">
                  Simulando explosión FEFO de canal e implosión de cortes NIC 2...
                </div>
              ) : explodePreview ? (
                <div className="space-y-5">
                  {/* Resumen Oscuro de Balance de Masa y Costo Conjunto */}
                  <div className="bg-slate-900 text-white p-4 rounded-xl flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                          explodePreview.stock_semaphore === "AVAILABLE"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : explodePreview.stock_semaphore === "PARTIAL"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            : "bg-red-500/20 text-red-300 border border-red-500/40"
                        }`}
                      >
                        Stock Canal: {explodePreview.stock_semaphore}
                      </span>
                      <div className="text-xs text-slate-300 font-mono">
                        Entrada: <strong className="text-white">{explodePreview.planned_base_qty} Kg</strong> → Cortes:{" "}
                        <strong className="text-emerald-400">{explodePreview.expected_good_qty} Kg</strong> + Subprod:{" "}
                        <strong className="text-blue-400">{explodePreview.expected_byproduct_qty ?? 0} Kg</strong> + Merma Oreo:{" "}
                        <strong className="text-amber-400">{explodePreview.expected_natural_shrinkage_qty} Kg</strong>
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <div className="text-xs text-slate-400">
                        Costo Bruto Tanda:{" "}
                        <strong className="text-white">
                          ${(explodePreview.cost_projection.gross_production_cost_usd ?? explodePreview.cost_projection.total_batch_cost_usd).toFixed(2)}
                        </strong>{" "}
                        • Créd. Subprod:{" "}
                        <strong className="text-blue-400">
                          -${(explodePreview.cost_projection.byproduct_credit_usd ?? 0).toFixed(2)}
                        </strong>
                      </div>
                      <div className="text-xs text-orange-400 font-bold">
                        Masa Neta a Distribuir (NIC 2): ${(explodePreview.cost_projection.net_joint_cost_to_distribute_usd ?? explodePreview.cost_projection.total_batch_cost_usd).toFixed(2)} (Bs.{" "}
                        {(explodePreview.cost_projection.net_joint_cost_to_distribute_ves ?? explodePreview.cost_projection.total_batch_cost_ves).toLocaleString("es-VE", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                        )
                      </div>
                    </div>
                  </div>

                  {/* 1. Explosión de Insumos FEFO */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                      <i className="pi pi-box text-orange-600"></i>
                      1. Explosión de Materia Prima y Material de Empaque (FEFO)
                    </h3>
                    <div
                      tabIndex={0}
                      role="region"
                      aria-label="Insumos explotados para desposte"
                      className="border border-slate-200 rounded-xl overflow-x-auto"
                    >
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                            <th className="py-2.5 px-3">Insumo / SKU</th>
                            <th className="py-2.5 px-3">Rol</th>
                            <th className="py-2.5 px-3 text-right">Cant. Requerida</th>
                            <th className="py-2.5 px-3 text-right">Stock Cava</th>
                            <th className="py-2.5 px-3">Lote FEFO Sugerido</th>
                            <th className="py-2.5 px-3 text-right">Costo Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {explodePreview.inputs.map((inp, idx) => (
                            <tr key={inp.bom_input_id ?? `adhoc-inp-${inp.component_variant_id}-${idx}`} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-800">{inp.component_name}</div>
                                <div className="font-mono text-[10px] text-slate-400">SKU: {inp.component_sku}</div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
                                  {inp.input_role}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                                {inp.planned_base_qty} {inp.uom_base}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                                {inp.available_stock_qty} {inp.uom_base}
                              </td>
                              <td className="py-2.5 px-3 font-mono">
                                {inp.suggested_batch_number ? (
                                  <span className="font-bold text-slate-800">
                                    {inp.suggested_batch_number} (Vence: {inp.suggested_batch_expiry_date || "N/A"})
                                  </span>
                                ) : (
                                  <span className="text-slate-400">Al liquidar</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                                ${inp.total_cost_usd.toFixed(2)} (Bs. {inp.total_cost_ves.toFixed(2)})
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 2. Implosión Proyectada de Cortes Esperados (1 -> N) */}
                  {explodePreview.outputs && explodePreview.outputs.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                        <i className="pi pi-percentage text-red-600"></i>
                        2. Implosión Proyectada de Cortes Esperados y Prorrateo NIC 2 (Valor Relativo de Mercado)
                      </h3>
                      <div
                        tabIndex={0}
                        role="region"
                        aria-label="Implosión proyectada de cortes esperados"
                        className="border border-slate-200 rounded-xl overflow-x-auto"
                      >
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="sticky top-0 z-10">
                            <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                              <th className="py-2.5 px-3">Corte / SKU</th>
                              <th className="py-2.5 px-3">Clasificación NIC 2</th>
                              <th className="py-2.5 px-3 text-right">% Yield Esp.</th>
                              <th className="py-2.5 px-3 text-right">Peso Esperado</th>
                              <th className="py-2.5 px-3 text-right">PVP Ref ($/Kg)</th>
                              <th className="py-2.5 px-3 text-right">% Absorción Costo</th>
                              <th className="py-2.5 px-3 text-right">Costo Unit. Proy.</th>
                              <th className="py-2.5 px-3 text-right">Margen %</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {explodePreview.outputs.map((out, idx) => {
                              const badge = OUTPUT_TYPE_BADGES[out.output_type] || OUTPUT_TYPE_BADGES.CO_PRODUCT;
                              const marginPct = out.gross_margin_pct ?? out.projected_margin_pct ?? 0;
                              return (
                                <tr key={`${out.output_variant_id}-${idx}`} className="hover:bg-slate-50">
                                  <td className="py-2.5 px-3">
                                    <div className="font-bold text-slate-800">{out.output_name}</div>
                                    <div className="font-mono text-[10px] text-slate-400">SKU: {out.output_sku}</div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${badge.color}`}>
                                      {badge.label}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700">
                                    {out.expected_yield_pct.toFixed(2)}%
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-black text-slate-800">
                                    {out.planned_qty.toFixed(2)} {out.uom_base}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                                    ${out.market_reference_price_usd.toFixed(2)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-orange-600">
                                    {out.output_type === "BY_PRODUCT" ? "VRN Fijo" : `${out.cost_allocation_pct.toFixed(2)}%`}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono">
                                    <div className="font-black text-slate-900">
                                      ${out.calculated_unit_cost_usd.toFixed(4)} / {out.uom_base}
                                    </div>
                                    <div className="text-[10px] text-slate-500">Bs. {out.calculated_unit_cost_ves.toFixed(2)}</div>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold">
                                    <span className={marginPct >= 25 ? "text-emerald-600" : "text-amber-600"}>
                                      {marginPct.toFixed(1)}%
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Observaciones de Tanda / Guía Sanitaria de Canal (Opcional)
                </label>
                <input
                  type="text"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Ej: Media Canal Bovina Lote Frigorífico #402 — Desposte en frío 4°C..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    creatingOrder ||
                    (createMode === "BOM" ? !selectedBomId : !adhocInputVariantId)
                  }
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600 text-white font-bold px-6 py-2.5 rounded-xl shadow-md text-xs cursor-pointer disabled:opacity-50"
                >
                  <i className="pi pi-check-circle"></i>
                  {creatingOrder ? "Creando Orden de Desposte..." : "Crear Orden y Abrir Mesa de Desposte"}
                </button>
              </div>
            </form>
          </div>
        )}
      </dialog>
    </div>
  );
}
