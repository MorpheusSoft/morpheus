"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { VariantCombobox, CatalogVariant } from "@/components/ui/VariantCombobox";

interface BatchOption {
  id: number;
  batch_number: string;
  expiry_date: string | null;
  days_to_expiry: number | null;
}

interface OrderInputDetail {
  id: number;
  component_variant_id: number;
  component_sku: string;
  component_name: string;
  input_role: string;
  uom_base: string;
  is_discrete_uom: boolean;
  planned_base_qty: number;
  consumed_base_qty: number;
  available_stock_qty: number;
  batch_id: number | null;
  batch_number: string | null;
  batch_expiry_date: string | null;
  available_batches: BatchOption[];
  unit_cost_usd: number;
  unit_cost_ves: number;
  total_cost_usd: number;
  total_cost_ves: number;
  stock_move_id: number | null;
}

interface OrderOutputDetail {
  id: number;
  output_variant_id: number;
  output_sku: string;
  output_name: string;
  output_type: string;
  uom_base: string;
  is_discrete_uom: boolean;
  planned_qty: number;
  actual_good_qty: number;
  explicit_damaged_qty: number;
  expected_yield_pct: number;
  actual_yield_pct: number;
  market_reference_price_usd: number;
  current_sales_price_usd: number;
  current_sales_price_ves: number;
  cost_allocation_pct: number;
  allocated_total_cost_usd: number;
  allocated_total_cost_ves: number;
  calculated_unit_cost_usd: number;
  calculated_unit_cost_ves: number;
  current_inventory_stock_qty: number;
  current_inventory_wavg_usd: number;
  current_inventory_wavg_ves: number;
  generated_batch_id: number | null;
  generated_batch_number: string | null;
  generated_batch_manufacturing_date: string | null;
  generated_batch_expiry_date: string | null;
  stock_move_id: number | null;
}

interface OrderDetailResponse {
  id: number;
  order_number: string;
  state: string;
  order_type: string;
  sector: string;
  facility_id: number;
  facility_name: string;
  source_warehouse_id: number;
  source_warehouse_name: string;
  dest_warehouse_id: number;
  dest_warehouse_name: string;
  work_center_id: number | null;
  work_center_name: string | null;
  work_center_rates: {
    hourly_labor_rate: number;
    hourly_overhead_rate: number;
    overhead_per_kg: number;
  };
  bom_id: number | null;
  bom_code: string;
  bom_name: string;
  bom_type: string;
  uom_id: string;
  expected_shrinkage_pct: number;
  max_allowed_shrinkage_pct: number;
  shelf_life_days: number;
  exchange_rate: number;
  planned_base_qty: number;
  actual_input_weight_kg: number;
  actual_good_output_weight_kg: number;
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
    explicit_waste_cost_usd: number;
    explicit_waste_cost_ves: number;
    net_production_cost_usd: number;
    net_production_cost_ves: number;
  };
  kardex_links: {
    picking_consumption_id: number | null;
    picking_consumption_folio: string | null;
    picking_output_id: number | null;
    picking_output_folio: string | null;
    waste_move_id: number | null;
    waste_move_reference: string | null;
  };
  scheduled_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  notes: string | null;
  inputs: OrderInputDetail[];
  outputs: OrderOutputDetail[];
}

const FLOW_STEPS = [
  { key: "DRAFT", label: "1. Borrador" },
  { key: "PLANNED", label: "2. Planificada (FEFO)" },
  { key: "IN_PROGRESS", label: "3. En Piso de Planta" },
  { key: "COMPLETED", label: "4. Liquidada en Kardex" },
];

export default function ProductionOrderExecutionConsole() {
  const params = useParams();
  const orderId = Number(params?.id);

  const [order, setOrder] = useState<OrderDetailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Estados editables para liquidación en vivo
  const [editableInputs, setEditableInputs] = useState<
    Array<{
      input_id: number;
      component_variant_id: number;
      batch_id: number | null;
      consumed_base_qty: number;
      unit_cost_usd: number;
      input_role: string;
      is_discrete_uom: boolean;
    }>
  >([]);
  const [actualGoodQty, setActualGoodQty] = useState<number>(0);
  const [explicitDamagedQty, setExplicitDamagedQty] = useState<number>(0);
  const [naturalShrinkageQty, setNaturalShrinkageQty] = useState<number>(0);
  const [actualLaborHours, setActualLaborHours] = useState<number>(1.0);
  const [settlementNotes, setSettlementNotes] = useState<string>("");

  // Estados para añadir insumo extra en ejecución y Guardar como Fórmula (BOM)
  const [variants, setVariants] = useState<CatalogVariant[]>([]);
  const [showAddInputRow, setShowAddInputRow] = useState<boolean>(false);
  const [newInputVariantId, setNewInputVariantId] = useState<number>(0);
  const [newInputQty, setNewInputQty] = useState<number>(1);
  const [newInputRole, setNewInputRole] = useState<string>("INGREDIENT");
  const [showSaveBomForm, setShowSaveBomForm] = useState<boolean>(false);
  const [saveBomName, setSaveBomName] = useState<string>("");

  const searchCatalogVariants = useCallback(
    async (queryText: string) => {
      try {
        const res = await api.get("/mfg/catalog/variants", {
          params: { search: queryText, facility_id: order?.facility_id, limit: 80 },
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
    },
    [order?.facility_id]
  );

  const ensureCatalogLoaded = useCallback(async () => {
    if (variants.length > 0) return;
    try {
      const res = await api.get("/mfg/catalog/variants", {
        params: { facility_id: order?.facility_id, limit: 150 },
      });
      const vList: CatalogVariant[] = res.data.items || [];
      setVariants(vList);
      if (vList.length > 0) {
        setNewInputVariantId((prev) => prev || vList[0].id);
      }
    } catch (err) {
      console.error("Error cargando variantes del catálogo:", err);
    }
  }, [variants.length, order?.facility_id]);

  const applyOrderData = useCallback((data: OrderDetailResponse) => {
    setOrder(data);
    setEditableInputs(
      data.inputs.map((inp) => ({
        input_id: inp.id,
        component_variant_id: inp.component_variant_id,
        batch_id: inp.batch_id,
        consumed_base_qty: inp.consumed_base_qty > 0 ? inp.consumed_base_qty : inp.planned_base_qty,
        unit_cost_usd: inp.unit_cost_usd,
        input_role: inp.input_role,
        is_discrete_uom: inp.is_discrete_uom,
      }))
    );

    const primaryOut = data.outputs[0];
    const initGood =
      primaryOut && primaryOut.actual_good_qty > 0
        ? primaryOut.actual_good_qty
        : data.actual_good_output_weight_kg > 0
        ? data.actual_good_output_weight_kg
        : data.planned_base_qty;
    const initDamaged =
      primaryOut && primaryOut.explicit_damaged_qty > 0
        ? primaryOut.explicit_damaged_qty
        : data.explicit_waste_qty;
    const initNatural =
      data.natural_shrinkage_qty >= 0
        ? data.natural_shrinkage_qty
        : Math.max(0, data.planned_base_qty - initGood - initDamaged);

    setActualGoodQty(initGood);
    setExplicitDamagedQty(initDamaged);
    setNaturalShrinkageQty(initNatural);
    setActualLaborHours(data.actual_labor_hours || 1.0);
  }, []);

  const loadOrder = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.get(`/mfg/orders/${orderId}`);
      applyOrderData(res.data);
    } catch (err) {
      console.error("Error cargando detalle de Orden de Producción:", err);
      setErrorMsg("No se pudo cargar la Orden de Producción solicitada.");
    } finally {
      setLoading(false);
    }
  }, [orderId, applyOrderData]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handleAddInputLine = async () => {
    if (!order || !newInputVariantId || newInputQty <= 0) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.post(`/mfg/orders/${order.id}/inputs`, {
        component_variant_id: newInputVariantId,
        planned_qty: newInputQty,
        input_role: newInputRole,
      });
      applyOrderData(res.data);
      setShowAddInputRow(false);
      setSuccessMsg("Insumo adicional incorporado a la Orden de Producción.");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "No se pudo agregar el insumo a la orden.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveAsBom = async () => {
    if (!order) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.post(`/mfg/orders/${order.id}/save-as-bom`, {
        name: saveBomName.trim() || undefined,
      });
      setShowSaveBomForm(false);
      setSuccessMsg(
        `¡Fórmula Maestra [${res.data.code}] "${res.data.name}" creada y vinculada a esta Orden!`
      );
      await loadOrder();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "No se pudo guardar la orden como Fórmula BOM.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoodQtyChange = (val: number) => {
    const cleanVal = Math.max(0, val);
    setActualGoodQty(cleanVal);
    if (order) {
      const autoNat = Math.max(0, Number((order.planned_base_qty - cleanVal - explicitDamagedQty).toFixed(4)));
      setNaturalShrinkageQty(autoNat);
    }
  };

  const handleDamagedQtyChange = (val: number) => {
    const cleanVal = Math.max(0, val);
    setExplicitDamagedQty(cleanVal);
    if (order) {
      const autoNat = Math.max(0, Number((order.planned_base_qty - actualGoodQty - cleanVal).toFixed(4)));
      setNaturalShrinkageQty(autoNat);
    }
  };

  const handleInputQtyChange = (inputId: number, val: number) => {
    setEditableInputs((prev) =>
      prev.map((item) => {
        if (item.input_id !== inputId) return item;
        const clean = item.is_discrete_uom ? Math.ceil(Math.max(0, val)) : Math.max(0, val);
        return { ...item, consumed_base_qty: clean };
      })
    );
  };

  const handleInputBatchChange = (inputId: number, batchId: number | null) => {
    setEditableInputs((prev) =>
      prev.map((item) => (item.input_id === inputId ? { ...item, batch_id: batchId } : item))
    );
  };

  // Cálculo NIC 2 en Vivo en el cliente
  const liveNic2 = useMemo(() => {
    if (!order) return null;
    const rate = order.exchange_rate || 40.0;

    let matUsd = 0;
    let pkgUsd = 0;
    let inputMassKg = 0;

    for (const item of editableInputs) {
      const lineCost = item.consumed_base_qty * item.unit_cost_usd;
      if (item.input_role === "PACKAGING") {
        pkgUsd += lineCost;
      } else {
        matUsd += lineCost;
        inputMassKg += item.consumed_base_qty;
      }
    }

    const rates = order.work_center_rates || {
      hourly_labor_rate: 0,
      hourly_overhead_rate: 0,
      overhead_per_kg: 0,
    };
    const modUsd = actualLaborHours * rates.hourly_labor_rate;
    const massForCif = inputMassKg > 0 ? inputMassKg : order.planned_base_qty;
    const cifUsd = actualLaborHours * rates.hourly_overhead_rate + massForCif * rates.overhead_per_kg;
    const grossCostUsd = matUsd + pkgUsd + modUsd + cifUsd;

    const totalProducedBeforeExplicitDamage = Math.max(0.0001, actualGoodQty + explicitDamagedQty);
    const unitCostAfterNaturalShrinkageUsd = grossCostUsd / totalProducedBeforeExplicitDamage;
    const explicitWasteCostUsd = explicitDamagedQty * unitCostAfterNaturalShrinkageUsd;
    const netCapitalizableCostUsd = Math.max(0, grossCostUsd - explicitWasteCostUsd);
    const finalUnitCostUsd = actualGoodQty > 0 ? netCapitalizableCostUsd / actualGoodQty : 0;

    // Impacto de merma térmica por unidad vs. lote base sin merma
    const baseUnitCostWithoutShrinkageUsd =
      order.planned_base_qty > 0 ? grossCostUsd / order.planned_base_qty : finalUnitCostUsd;
    const thermalAbsorptionPerUnitUsd = Math.max(0, finalUnitCostUsd - baseUnitCostWithoutShrinkageUsd);

    const primaryOut = order.outputs[0];
    const currentStock = primaryOut ? primaryOut.current_inventory_stock_qty : 0;
    const currentWavg = primaryOut ? primaryOut.current_inventory_wavg_usd : 0;
    const pvpUsd = primaryOut ? primaryOut.current_sales_price_usd : 0;

    let projectedNewWavgUsd = finalUnitCostUsd;
    if (order.state === "COMPLETED") {
      projectedNewWavgUsd = currentWavg;
    } else if (currentStock + actualGoodQty > 0 && actualGoodQty > 0) {
      projectedNewWavgUsd =
        (currentStock * currentWavg + actualGoodQty * finalUnitCostUsd) / (currentStock + actualGoodQty);
    }

    const marginPct = pvpUsd > 0 ? ((pvpUsd - finalUnitCostUsd) / pvpUsd) * 100 : 0;

    return {
      rate,
      matUsd,
      pkgUsd,
      modUsd,
      cifUsd,
      grossCostUsd,
      explicitWasteCostUsd,
      netCapitalizableCostUsd,
      finalUnitCostUsd,
      baseUnitCostWithoutShrinkageUsd,
      thermalAbsorptionPerUnitUsd,
      currentStock,
      currentWavg,
      projectedNewWavgUsd,
      pvpUsd,
      marginPct,
    };
  }, [order, editableInputs, actualGoodQty, explicitDamagedQty, actualLaborHours]);

  const handleStartOrder = async () => {
    if (!order) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.post(`/mfg/orders/${order.id}/start`);
      setOrder(res.data);
      setSuccessMsg("Orden de Producción iniciada en Piso de Planta (IN_PROGRESS).");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "No se pudo iniciar la orden.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteOrder = async () => {
    if (!order) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const payload = {
        actual_labor_hours: actualLaborHours,
        actual_good_qty: actualGoodQty,
        explicit_damaged_qty: explicitDamagedQty,
        natural_shrinkage_qty: naturalShrinkageQty,
        notes: settlementNotes.trim() || undefined,
        inputs: editableInputs.map((i) => ({
          input_id: i.input_id,
          component_variant_id: i.component_variant_id,
          batch_id: i.batch_id,
          consumed_base_qty: i.consumed_base_qty,
        })),
      };
      const res = await api.post(`/mfg/orders/${order.id}/complete`, payload);
      const settled: OrderDetailResponse = res.data;
      setOrder(settled);
      setEditableInputs(
        settled.inputs.map((inp) => ({
          input_id: inp.id,
          component_variant_id: inp.component_variant_id,
          batch_id: inp.batch_id,
          consumed_base_qty: inp.consumed_base_qty,
          unit_cost_usd: inp.unit_cost_usd,
          input_role: inp.input_role,
          is_discrete_uom: inp.is_discrete_uom,
        }))
      );
      if (settled.outputs[0]) {
        setActualGoodQty(settled.outputs[0].actual_good_qty);
        setExplicitDamagedQty(settled.outputs[0].explicit_damaged_qty);
      }
      setNaturalShrinkageQty(settled.natural_shrinkage_qty);
      setActualLaborHours(settled.actual_labor_hours || actualLaborHours);
      setSuccessMsg(
        "¡Orden Liquidada Atómicamente al Kardex! Se generaron los movimientos MFG-OUT / MFG-IN, el Lote Sanitario y se actualizó el Costo Promedio Ponderado (WAVG)."
      );
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Error al liquidar la Orden de Producción.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await api.post(`/mfg/orders/${order.id}/cancel`);
      setOrder(res.data);
      setSuccessMsg("Orden de Producción cancelada.");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "No se pudo cancelar la orden.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400">
        Cargando consola de ejecución de Orden de Producción...
      </div>
    );
  }

  if (!order || !liveNic2) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="text-red-600 font-bold">{errorMsg || "Orden de Producción no encontrada"}</div>
        <Link href="/orders" className="inline-flex items-center gap-2 text-xs font-bold text-orange-600 underline">
          Volver al Tablero de Órdenes
        </Link>
      </div>
    );
  }

  const isCompleted = order.state === "COMPLETED";
  const isCancelled = order.state === "CANCELLED";
  const isEditable = !isCompleted && !isCancelled;
  const primaryOut = order.outputs[0];
  const currentStepIdx = FLOW_STEPS.findIndex((s) => s.key === order.state);
  const isAdHoc = order.bom_id === null || order.bom_code === "TRANSF-LIBRE";

  return (
    <div className="p-2 sm:p-6 w-full max-w-[1440px] mx-auto space-y-6">
      {/* BARRA SUPERIOR Y BREADCRUMB */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-orange-500 to-red-600"></div>
        <div className="pl-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-400 mb-1">
            <Link href="/orders" className="hover:text-orange-600 transition-colors flex items-center gap-1">
              <i className="pi pi-arrow-left text-[10px]"></i>
              Órdenes de Producción
            </Link>
            <span>/</span>
            <span className="font-mono text-orange-600">{order.order_number}</span>
            <span>•</span>
            <span className="text-slate-600">{order.work_center_name || "Planta Central"}</span>
            {isAdHoc && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-black">
                ⚡ Transformación Libre (Sin Fórmula)
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex flex-wrap items-center gap-3">
            <span>{order.order_number}</span>
            <span className="text-slate-400 font-light">—</span>
            <span>{primaryOut?.output_name || order.bom_name}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <p className="text-xs sm:text-sm text-slate-500">
              Fórmula: <strong className="font-mono text-slate-700">{order.bom_code}</strong> • Almacén Origen:{" "}
              <strong>{order.source_warehouse_name}</strong> → Destino PT: <strong>{order.dest_warehouse_name}</strong>
            </p>
            {isAdHoc && (
              <button
                type="button"
                onClick={() => {
                  setSaveBomName(
                    primaryOut
                      ? `Receta Estándar - ${primaryOut.output_name}`
                      : `Receta desde ${order.order_number}`
                  );
                  setShowSaveBomForm((prev) => !prev);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
              >
                <span>💾 Guardar como Fórmula</span>
              </button>
            )}
          </div>

          {showSaveBomForm && (
            <div className="mt-3 p-3 rounded-xl bg-purple-50 border border-purple-200 flex flex-wrap items-center gap-2 max-w-xl">
              <input
                type="text"
                value={saveBomName}
                onChange={(e) => setSaveBomName(e.target.value)}
                placeholder="Nombre de la nueva Receta / Fórmula BOM..."
                className="flex-1 min-w-[220px] bg-white border border-purple-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800"
              />
              <button
                type="button"
                disabled={submitting}
                onClick={handleSaveAsBom}
                className="px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold cursor-pointer"
              >
                {submitting ? "Guardando..." : "Crear Receta BOM"}
              </button>
              <button
                type="button"
                onClick={() => setShowSaveBomForm(false)}
                className="px-2.5 py-1.5 rounded-lg border border-purple-200 text-xs font-bold text-slate-600 hover:bg-white cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        {/* Stepper de Estado del Flujo */}
        <div className="flex flex-wrap items-center gap-2">
          {FLOW_STEPS.map((st, idx) => {
            const active = st.key === order.state;
            const passed = currentStepIdx > idx || isCompleted;
            return (
              <div
                key={st.key}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                  active
                    ? "bg-orange-500 text-white border-orange-600 shadow-sm"
                    : passed
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-slate-100 text-slate-400 border-slate-200"
                }`}
              >
                <i className={`pi ${passed ? "pi-check-circle" : active ? "pi-cog" : "pi-circle"} text-[11px]`}></i>
                {st.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* ALERTAS DE RESPUESTA */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2.5">
          <i className="pi pi-exclamation-triangle text-base"></i>
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2.5">
          <i className="pi pi-check-circle text-base text-emerald-600"></i>
          <span>{successMsg}</span>
        </div>
      )}

      {/* SELLO DE LIQUIDACIÓN KARDEX Y LOTE SANITARIO (CUANDO COMPLETED) */}
      {isCompleted && primaryOut && (
        <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 text-white p-6 rounded-2xl border border-emerald-500/40 shadow-lg grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0">
              <i className="pi pi-verified text-2xl"></i>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block">
                Liquidación Kardex Sellada
              </span>
              <div className="text-base font-black text-white">Transacción NIC 2 Completada</div>
              <div className="text-xs text-slate-400">
                {order.completed_at ? new Date(order.completed_at).toLocaleString("es-VE") : "Hoy"}
              </div>
            </div>
          </div>

          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
              Lote Sanitario Generado (`inv.batches`)
            </span>
            <div className="font-mono text-sm font-black text-emerald-400 mt-0.5 flex items-center gap-1.5">
              <i className="pi pi-qrcode text-xs"></i>
              {primaryOut.generated_batch_number || `L-${order.order_number}`}
            </div>
            <div className="text-[11px] text-slate-300 mt-0.5">
              Elab: {primaryOut.generated_batch_manufacturing_date} • Vence:{" "}
              <strong>{primaryOut.generated_batch_expiry_date}</strong>
            </div>
          </div>

          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
              Folios Kardex (`inv.stock_pickings`)
            </span>
            <div className="text-xs font-mono text-orange-300 font-bold mt-0.5">
              Salida MP: {order.kardex_links.picking_consumption_folio || `MFG-OUT/${order.order_number}`}
            </div>
            <div className="text-xs font-mono text-emerald-300 font-bold mt-0.5">
              Entrada PT: {order.kardex_links.picking_output_folio || `MFG-IN/${order.order_number}`}
            </div>
          </div>

          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
              Nuevo Costo Promedio Ponderado (`WAVG`)
            </span>
            <div className="text-base font-mono font-black text-white mt-0.5">
              ${primaryOut.current_inventory_wavg_usd.toFixed(4)} / {primaryOut.uom_base}
            </div>
            <div className="text-[11px] text-slate-300 font-mono">
              Stock Actual PT: <strong>{primaryOut.current_inventory_stock_qty}</strong> {primaryOut.uom_base}
            </div>
          </div>
        </div>
      )}

      {/* LAYOUT PRINCIPAL DE 2 COLUMNAS: EJECUCIÓN (IZQUIERDA) + LIQUIDACIÓN NIC 2 EN VIVO (DERECHA) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUMNA IZQUIERDA (8 COL): DESCARGO DE MATERIALES FEFO Y RENDIMIENTO DE PLANTA */}
        <div className="lg:col-span-8 space-y-6">
          {/* 1. TABLA DE DESCARGO DE INSUMOS (MFG-OUT -> VIRT_PRODUCTION) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <i className="pi pi-box text-orange-600"></i>
                  1. Descargo de Materiales e Insumos (`MFG_CONSUME` / `MFG-OUT`)
                </h2>
                <p className="text-xs text-slate-500">
                  Salida desde <strong>{order.source_warehouse_name}</strong> hacia ubicación puente{" "}
                  <code className="font-mono text-orange-600">VIRT_PRODUCTION</code> con asignación de lote FEFO.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isEditable && (
                  <button
                    type="button"
                    onClick={async () => {
                      await ensureCatalogLoaded();
                      setShowAddInputRow((prev) => !prev);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                  >
                    <i className="pi pi-plus text-[10px]"></i>
                    Añadir Insumo
                  </button>
                )}
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                  {order.inputs.length} insumos
                </span>
              </div>
            </div>

            {showAddInputRow && isEditable && (
              <div className="p-4 bg-orange-50/50 border-b border-orange-200 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                <div className="sm:col-span-6">
                  <VariantCombobox
                    value={newInputVariantId}
                    variants={variants}
                    compact
                    onChange={(vid) => setNewInputVariantId(vid)}
                    onSearchCatalog={searchCatalogVariants}
                    placeholder="Seleccionar insumo extra..."
                  />
                </div>
                <div className="sm:col-span-2">
                  <input
                    type="number"
                    step="any"
                    min="0.0001"
                    value={newInputQty}
                    onChange={(e) => setNewInputQty(Math.max(0.0001, Number(e.target.value)))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 text-right"
                    placeholder="Cant."
                  />
                </div>
                <div className="sm:col-span-2">
                  <select
                    value={newInputRole}
                    onChange={(e) => setNewInputRole(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700"
                  >
                    <option value="INGREDIENT">INGREDIENT</option>
                    <option value="PACKAGING">PACKAGING</option>
                  </select>
                </div>
                <div className="sm:col-span-2 flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    disabled={submitting || !newInputVariantId}
                    onClick={handleAddInputLine}
                    className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Agregar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddInputRow(false)}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
                  >
                    <i className="pi pi-times text-xs"></i>
                  </button>
                </div>
              </div>
            )}

            <div tabIndex={0} role="region" aria-label="Tabla de Descargo de Materiales MFG-OUT" className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Insumo / Rol</th>
                    <th className="py-3 px-3">Lote FEFO Asignado</th>
                    <th className="py-3 px-3 text-right">Stock Almacén</th>
                    <th className="py-3 px-3 text-right">Planificado</th>
                    <th className="py-3 px-3 text-right">Consumo Real</th>
                    <th className="py-3 px-4 text-right">Costo Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.inputs.map((inp, idx) => {
                    const editItem = editableInputs[idx] || {
                      input_id: inp.id,
                      consumed_base_qty: inp.consumed_base_qty,
                      batch_id: inp.batch_id,
                      unit_cost_usd: inp.unit_cost_usd,
                    };
                    const lineUsd = editItem.consumed_base_qty * editItem.unit_cost_usd;
                    const lineVes = lineUsd * liveNic2.rate;

                    return (
                      <tr key={inp.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800 text-sm">{inp.component_name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {inp.component_sku} • {inp.input_role}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          {isEditable && inp.available_batches.length > 0 ? (
                            <select
                              value={editItem.batch_id || ""}
                              onChange={(e) =>
                                handleInputBatchChange(inp.id, e.target.value ? Number(e.target.value) : null)
                              }
                              className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-orange-500"
                            >
                              {inp.available_batches.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.batch_number} (Vence: {b.expiry_date || "N/A"})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div>
                              <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                {inp.batch_number || "SIN-LOTE"}
                              </span>
                              {inp.batch_expiry_date && (
                                <span className="block text-[10px] text-slate-400 mt-0.5">
                                  Vence: {inp.batch_expiry_date}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {inp.available_stock_qty} {inp.uom_base}
                        </td>

                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {inp.planned_base_qty} {inp.uom_base}
                        </td>

                        <td className="py-3 px-3 text-right">
                          {isEditable ? (
                            <div className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                step={inp.is_discrete_uom ? "1" : "0.01"}
                                min="0"
                                value={editItem.consumed_base_qty}
                                onChange={(e) => handleInputQtyChange(inp.id, Number(e.target.value))}
                                className="w-24 text-right bg-orange-50/50 border border-orange-300 rounded-lg px-2 py-1 font-mono font-black text-slate-800 focus:outline-none focus:border-orange-500"
                              />
                              <span className="font-mono text-[11px] text-slate-500">{inp.uom_base}</span>
                            </div>
                          ) : (
                            <span className="font-mono font-black text-slate-800">
                              {inp.consumed_base_qty} {inp.uom_base}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right font-mono">
                          <div className="font-bold text-slate-800">${lineUsd.toFixed(2)}</div>
                          <div className="text-[10px] text-slate-500">Bs. {lineVes.toFixed(2)}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. RENDIMIENTO REAL, MERMAS (NATURAL VS. EXPLÍCITA NIC 2) Y HORAS MOD */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <i className="pi pi-sliders-h text-orange-600"></i>
                  2. Rendimiento de Tanda, Mermas (NIC 2 Párrafo 16) y Horas MOD
                </h2>
                <p className="text-xs text-slate-500">
                  La <strong>Merma Natural/Térmica</strong> es absorbida por las unidades buenas; la{" "}
                  <strong>Merma Explícita/Dañada</strong> se segrega a gasto (`MERMA_PROD_ANORMAL`) sin inflar el producto.
                </p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-orange-50 text-orange-700 border border-orange-200">
                Meta Base: {order.planned_base_qty} {order.uom_id} (Merma Esp: {order.expected_shrinkage_pct}%)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Cantidad Buena */}
              <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200">
                <label className="block text-[11px] font-black text-emerald-800 uppercase tracking-wider mb-1">
                  Salida Buena (`MFG-IN`)
                </label>
                <div className="flex items-baseline gap-2">
                  <input
                    type="number"
                    step={primaryOut?.is_discrete_uom ? "1" : "0.01"}
                    min="0.01"
                    disabled={!isEditable}
                    value={actualGoodQty}
                    onChange={(e) => handleGoodQtyChange(Number(e.target.value))}
                    className="w-full bg-white border border-emerald-300 rounded-xl px-3 py-2 text-lg font-mono font-black text-emerald-700 focus:outline-none focus:border-emerald-600 disabled:bg-emerald-50"
                  />
                  <span className="text-xs font-bold text-emerald-700">{order.uom_id}</span>
                </div>
                <span className="text-[11px] text-emerald-700 mt-1.5 block">
                  Ingresa a stock con lote sanitario
                </span>
              </div>

              {/* Merma Natural / Térmica */}
              <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200">
                <label className="block text-[11px] font-black text-amber-800 uppercase tracking-wider mb-1">
                  Merma Natural / Térmica
                </label>
                <div className="flex items-baseline gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={!isEditable}
                    value={naturalShrinkageQty}
                    onChange={(e) => setNaturalShrinkageQty(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-lg font-mono font-black text-amber-700 focus:outline-none focus:border-amber-600 disabled:bg-amber-50"
                  />
                  <span className="text-xs font-bold text-amber-700">{order.uom_id}</span>
                </div>
                <span className="text-[11px] text-amber-700 mt-1.5 block">
                  Evaporación/horneado (Absorbida)
                </span>
              </div>

              {/* Merma Explícita / Anormal */}
              <div className="p-4 rounded-xl bg-red-50/60 border border-red-200">
                <label className="block text-[11px] font-black text-red-800 uppercase tracking-wider mb-1">
                  Merma Explícita / Dañada
                </label>
                <div className="flex items-baseline gap-2">
                  <input
                    type="number"
                    step={primaryOut?.is_discrete_uom ? "1" : "0.01"}
                    min="0"
                    disabled={!isEditable}
                    value={explicitDamagedQty}
                    onChange={(e) => handleDamagedQtyChange(Number(e.target.value))}
                    className="w-full bg-white border border-red-300 rounded-xl px-3 py-2 text-lg font-mono font-black text-red-700 focus:outline-none focus:border-red-600 disabled:bg-red-50"
                  />
                  <span className="text-xs font-bold text-red-700">{order.uom_id}</span>
                </div>
                <span className="text-[11px] text-red-700 mt-1.5 block">
                  Va a `VIRT_LOSS` (${liveNic2.explicitWasteCostUsd.toFixed(2)} USD)
                </span>
              </div>

              {/* Horas MOD Reales */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                  Horas Reales MOD
                </label>
                <div className="flex items-baseline gap-2">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    disabled={!isEditable}
                    value={actualLaborHours}
                    onChange={(e) => setActualLaborHours(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-lg font-mono font-black text-slate-800 focus:outline-none focus:border-orange-500 disabled:bg-slate-100"
                  />
                  <span className="text-xs font-bold text-slate-600">HRS</span>
                </div>
                <span className="text-[11px] text-slate-500 mt-1.5 block">
                  MOD: ${liveNic2.modUsd.toFixed(2)} + CIF: ${liveNic2.cifUsd.toFixed(2)}
                </span>
              </div>
            </div>

            {isEditable && (
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Nota de Cierre / Auditoría de Piso
                </label>
                <input
                  type="text"
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                  placeholder="Ej. Liquidación conforme a control de calidad de lote..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                />
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA (4 COL): PANEL OSCURO DE LIQUIDACIÓN NIC 2 EN VIVO Y WAVG */}
        <div className="lg:col-span-4 space-y-6 sticky top-20">
          <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
            <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                  Motor Contable NIC 2 Párrafo 16
                </span>
                <span className="text-[11px] font-mono text-emerald-400 font-bold">
                  BCV: Bs. {liveNic2.rate.toFixed(2)}
                </span>
              </div>
              <h3 className="text-lg font-black mt-1">Liquidación Bimonetaria en Vivo</h3>
              <p className="text-xs text-slate-400">
                Cálculo de absorción térmica, segregación de merma anormal y nuevo Costo Promedio Ponderado (`WAVG`).
              </p>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Acumuladores de Costo */}
              <div className="space-y-2 pb-3 border-b border-slate-800">
                <div className="flex justify-between text-slate-300">
                  <span>Materia Prima e Ingredientes:</span>
                  <span className="font-mono font-bold text-white">
                    ${liveNic2.matUsd.toFixed(2)} / Bs. {(liveNic2.matUsd * liveNic2.rate).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Material de Empaque:</span>
                  <span className="font-mono font-bold text-white">
                    ${liveNic2.pkgUsd.toFixed(2)} / Bs. {(liveNic2.pkgUsd * liveNic2.rate).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Mano de Obra Directa (MOD):</span>
                  <span className="font-mono font-bold text-white">
                    ${liveNic2.modUsd.toFixed(2)} / Bs. {(liveNic2.modUsd * liveNic2.rate).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Costos Indirectos (CIF Planta):</span>
                  <span className="font-mono font-bold text-white">
                    ${liveNic2.cifUsd.toFixed(2)} / Bs. {(liveNic2.cifUsd * liveNic2.rate).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-200 font-bold pt-1">
                  <span>Costo Bruto de la Orden:</span>
                  <span className="font-mono text-white">${liveNic2.grossCostUsd.toFixed(2)}</span>
                </div>
              </div>

              {/* Segregación de Merma Anormal */}
              <div className="space-y-2 pb-3 border-b border-slate-800">
                <div className="flex justify-between items-center text-red-400">
                  <span>(-) Gasto Merma Explícita (`VIRT_LOSS`):</span>
                  <span className="font-mono font-bold">
                    -${liveNic2.explicitWasteCostUsd.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-amber-300">
                  <span>Impacto Merma Térmica Absorbida:</span>
                  <span className="font-mono font-bold">
                    +${liveNic2.thermalAbsorptionPerUnitUsd.toFixed(4)} / {order.uom_id}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm font-black text-emerald-400 pt-1">
                  <span>Costo Neto Capitalizable:</span>
                  <span className="font-mono">
                    ${liveNic2.netCapitalizableCostUsd.toFixed(2)}
                  </span>
                </div>
                <div className="text-right font-mono text-[11px] text-slate-400">
                  Bs.{" "}
                  {(liveNic2.netCapitalizableCostUsd * liveNic2.rate).toLocaleString("es-VE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>

              {/* Costo Unitario Liquidado del Lote */}
              <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700 space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-orange-400 block">
                  Costo Unitario Real del Lote ({actualGoodQty} {order.uom_id} buenas)
                </span>
                <div className="text-2xl font-mono font-black text-white">
                  ${liveNic2.finalUnitCostUsd.toFixed(4)}{" "}
                  <span className="text-xs font-normal text-slate-400">/ {order.uom_id}</span>
                </div>
                <div className="text-xs font-mono text-emerald-400 font-bold">
                  Bs.{" "}
                  {(liveNic2.finalUnitCostUsd * liveNic2.rate).toLocaleString("es-VE", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  / {order.uom_id}
                </div>
              </div>

              {/* Simulación de Nuevo Costo Promedio Ponderado (WAVG) */}
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-300 flex items-center justify-between">
                  <span>Impacto en Inventario (`WAVG`)</span>
                  <span className="text-emerald-400">Sin Doble Conteo</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Stock Actual en Sede:</span>
                  <span className="font-mono text-slate-200">
                    {liveNic2.currentStock} {order.uom_id}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Costo Promedio Actual:</span>
                  <span className="font-mono text-slate-200">${liveNic2.currentWavg.toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-white font-bold pt-1 border-t border-slate-700">
                  <span>Nuevo Costo Promedio (`WAVG`):</span>
                  <span className="font-mono text-amber-400">
                    ${liveNic2.projectedNewWavgUsd.toFixed(4)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>PVP Actual / Margen Resultante:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    ${liveNic2.pvpUsd.toFixed(2)} ({liveNic2.marginPct.toFixed(1)}%)
                  </span>
                </div>
              </div>

              {/* Botones de Acción Transaccional */}
              {isEditable && (
                <div className="space-y-2.5 pt-2">
                  {order.state === "PLANNED" || order.state === "DRAFT" ? (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleStartOrder}
                      className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
                    >
                      <i className="pi pi-play mr-1.5"></i>
                      Iniciar Ejecución en Piso (`IN_PROGRESS`)
                    </button>
                  ) : null}

                  <button
                    type="button"
                    disabled={submitting || actualGoodQty <= 0}
                    onClick={handleCompleteOrder}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-orange-500/25 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <i className="pi pi-check-circle mr-1.5"></i>
                    {submitting
                      ? "Liquidando en Kardex..."
                      : "Liquidar Orden al Kardex y Generar Lote"}
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleCancelOrder}
                    className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-300 border border-slate-700 text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancelar Orden de Producción
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
