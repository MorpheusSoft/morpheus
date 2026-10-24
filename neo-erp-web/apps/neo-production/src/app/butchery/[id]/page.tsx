"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  cost_allocation_method?: string;
  uom_base: string;
  is_discrete_uom: boolean;
  planned_qty: number;
  actual_good_qty: number;
  explicit_damaged_qty: number;
  expected_yield_pct: number;
  actual_yield_pct: number;
  yield_variance_pct?: number;
  market_reference_price_usd: number;
  market_reference_price_ves?: number;
  commercial_value_usd?: number;
  commercial_value_ves?: number;
  current_sales_price_usd: number;
  current_sales_price_ves: number;
  cost_allocation_pct: number;
  allocated_total_cost_usd: number;
  allocated_total_cost_ves: number;
  calculated_unit_cost_usd: number;
  calculated_unit_cost_ves: number;
  gross_margin_pct?: number;
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
    joint_cost_before_waste_usd?: number;
    joint_cost_before_waste_ves?: number;
    explicit_waste_cost_usd: number;
    explicit_waste_cost_ves: number;
    net_joint_cost_to_distribute_usd?: number;
    net_joint_cost_to_distribute_ves?: number;
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

interface SimulatedOutputItem {
  output_id: number | null;
  output_variant_id: number;
  output_sku: string;
  output_name: string;
  output_type: string;
  cost_allocation_method: string;
  is_byproduct: boolean;
  uom_base: string;
  expected_yield_pct: number;
  actual_yield_pct: number;
  yield_variance_pct: number;
  planned_qty: number;
  actual_good_qty: number;
  explicit_damaged_qty: number;
  market_reference_price_usd: number;
  market_reference_price_ves: number;
  commercial_value_usd: number;
  commercial_value_ves: number;
  cost_allocation_pct: number;
  allocated_total_cost_usd: number;
  allocated_total_cost_ves: number;
  calculated_unit_cost_usd: number;
  calculated_unit_cost_ves: number;
  current_stock_qty: number;
  current_wavg_cost_usd: number;
  current_wavg_cost_ves: number;
  projected_wavg_cost_usd: number;
  projected_wavg_cost_ves: number;
  gross_margin_pct: number;
}

interface SimulationResponse {
  exchange_rate: number;
  actual_input_weight_kg: number;
  actual_labor_hours: number;
  mass_balance: {
    input_weight_kg: number;
    good_cuts_weight_kg: number;
    byproducts_weight_kg: number;
    natural_shrinkage_qty: number;
    explicit_waste_qty: number;
    accounted_weight_kg: number;
    unaccounted_weight_kg: number;
    suggested_natural_shrinkage_qty: number;
    is_balanced: boolean;
    mass_balance_pct: number;
    good_cuts_yield_pct: number;
    byproducts_yield_pct: number;
    total_meat_recovery_pct: number;
    natural_shrinkage_pct: number;
    explicit_waste_pct: number;
    expected_shrinkage_pct: number;
    max_allowed_shrinkage_pct: number;
    exceeds_max_shrinkage: boolean;
  };
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
    byproduct_credit_usd: number;
    byproduct_credit_ves: number;
    joint_cost_before_waste_usd: number;
    joint_cost_before_waste_ves: number;
    explicit_waste_cost_usd: number;
    explicit_waste_cost_ves: number;
    net_joint_cost_to_distribute_usd: number;
    net_joint_cost_to_distribute_ves: number;
    allocated_coproducts_cost_usd: number;
    allocated_coproducts_cost_ves: number;
    total_capitalized_inventory_cost_usd: number;
    total_capitalized_inventory_cost_ves: number;
    cost_allocation_delta_usd: number;
    total_coproducts_market_value_usd: number;
    total_coproducts_market_value_ves: number;
    total_commercial_value_usd: number;
    total_commercial_value_ves: number;
    projected_global_margin_pct: number;
  };
  outputs: SimulatedOutputItem[];
}

const FLOW_STEPS = [
  { key: "DRAFT", label: "1. Borrador" },
  { key: "PLANNED", label: "2. Planificada (FEFO)" },
  { key: "IN_PROGRESS", label: "3. En Mesa de Desposte" },
  { key: "COMPLETED", label: "4. Liquidada NIC 2 (Kardex)" },
];

const OUTPUT_TYPE_BADGES: Record<string, { label: string; color: string }> = {
  PRIMARY_PRODUCT: { label: "Corte Noble Principal", color: "bg-red-50 text-red-700 border-red-200" },
  CO_PRODUCT: { label: "Co-Producto Comercial", color: "bg-orange-50 text-orange-700 border-orange-200" },
  BY_PRODUCT: { label: "Subproducto (VRN Fijo)", color: "bg-blue-50 text-blue-700 border-blue-200" },
};

export default function ButcherySettlementConsolePage() {
  const params = useParams();
  const orderId = Number(params?.id);

  const [order, setOrder] = useState<OrderDetailResponse | null>(null);
  const [simulation, setSimulation] = useState<SimulationResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Estados interactivos de la consola de desposte
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
  const [editableOutputs, setEditableOutputs] = useState<
    Array<{
      output_id: number;
      output_variant_id: number;
      output_type: string;
      expected_yield_pct: number;
      actual_good_qty: number;
      explicit_damaged_qty: number;
      market_reference_price: number;
    }>
  >([]);
  const [naturalShrinkageQty, setNaturalShrinkageQty] = useState<number>(0);
  const [actualLaborHours, setActualLaborHours] = useState<number>(2.5);
  const [settlementNotes, setSettlementNotes] = useState<string>("");

  // Estados para añadir corte extra en ejecución y Guardar como Plantilla (BOM)
  const [variants, setVariants] = useState<CatalogVariant[]>([]);
  const [showAddOutputRow, setShowAddOutputRow] = useState<boolean>(false);
  const [newOutputVariantId, setNewOutputVariantId] = useState<number>(0);
  const [newOutputQty, setNewOutputQty] = useState<number>(5);
  const [newOutputType, setNewOutputType] = useState<string>("CO_PRODUCT");
  const [newOutputRefPrice, setNewOutputRefPrice] = useState<number>(6.5);
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
        setNewOutputVariantId((prev) => prev || vList[0].id);
        setNewOutputRefPrice(vList[0].sales_price_usd || 6.5);
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

    setEditableOutputs(
      data.outputs.map((out) => ({
        output_id: out.id,
        output_variant_id: out.output_variant_id,
        output_type: out.output_type,
        expected_yield_pct: out.expected_yield_pct,
        actual_good_qty: out.actual_good_qty > 0 ? out.actual_good_qty : out.planned_qty,
        explicit_damaged_qty: out.explicit_damaged_qty || 0,
        market_reference_price: out.market_reference_price_usd || out.current_sales_price_usd,
      }))
    );

    setNaturalShrinkageQty(data.natural_shrinkage_qty >= 0 ? data.natural_shrinkage_qty : 3.0);
    setActualLaborHours(data.actual_labor_hours || 2.5);
  }, []);

  const loadOrder = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.get(`/mfg/orders/${orderId}`);
      applyOrderData(res.data);
    } catch (err) {
      console.error("Error cargando Orden de Desposte:", err);
      setErrorMsg("No se pudo cargar la Orden de Desposte solicitada.");
    } finally {
      setLoading(false);
    }
  }, [orderId, applyOrderData]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handleAddOutputLine = async () => {
    if (!order || !newOutputVariantId || newOutputQty <= 0) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.post(`/mfg/orders/${order.id}/outputs`, {
        output_variant_id: newOutputVariantId,
        planned_qty: newOutputQty,
        output_type: newOutputType,
        cost_allocation_method:
          newOutputType === "BY_PRODUCT" ? "FIXED_NRV" : "MARKET_VALUE_INDEX",
        market_reference_price: newOutputRefPrice,
      });
      applyOrderData(res.data);
      setShowAddOutputRow(false);
      setSuccessMsg("Corte / Subproducto adicional incorporado a la Mesa de Desposte.");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "No se pudo agregar el corte a la orden.";
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
        `¡Plantilla de Desposte [${res.data.code}] "${res.data.name}" creada y vinculada a esta Orden!`
      );
      await loadOrder();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "No se pudo guardar la orden como Plantilla BOM.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Invocar simulador NIC 2 de Sala de Desposte en vivo cada vez que cambian los pesos o precios
  useEffect(() => {
    if (!order || editableOutputs.length === 0) return;
    let active = true;
    const carcassInput = editableInputs.find((i) => i.input_role !== "PACKAGING");
    const carcassWeight = carcassInput ? carcassInput.consumed_base_qty : order.actual_input_weight_kg || order.planned_base_qty;

    async function runSimulation() {
      try {
        const res = await api.post("/mfg/butchery/simulate-settlement", {
          order_id: order?.id,
          bom_id: order?.bom_id,
          facility_id: order?.facility_id || 1,
          dest_warehouse_id: order?.dest_warehouse_id || 1,
          actual_input_weight_kg: carcassWeight,
          actual_labor_hours: actualLaborHours,
          natural_shrinkage_qty: naturalShrinkageQty,
          inputs: editableInputs.map((i) => ({
            input_id: i.input_id,
            component_variant_id: i.component_variant_id,
            batch_id: i.batch_id,
            consumed_base_qty: i.consumed_base_qty,
          })),
          outputs: editableOutputs.map((o) => ({
            output_id: o.output_id,
            output_variant_id: o.output_variant_id,
            output_type: o.output_type,
            expected_yield_pct: o.expected_yield_pct,
            actual_good_qty: o.actual_good_qty,
            explicit_damaged_qty: o.explicit_damaged_qty,
            market_reference_price: o.market_reference_price,
          })),
        });
        if (active) {
          setSimulation(res.data);
        }
      } catch (err) {
        console.error("Error simulando liquidación NIC 2 en vivo:", err);
      }
    }

    const timer = setTimeout(runSimulation, 120);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [order, editableInputs, editableOutputs, naturalShrinkageQty, actualLaborHours]);

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

  const handleOutputFieldChange = (
    outputVariantId: number,
    field: "actual_good_qty" | "explicit_damaged_qty" | "market_reference_price",
    val: number
  ) => {
    const cleanVal = Math.max(0, val);
    setEditableOutputs((prev) =>
      prev.map((o) => (o.output_variant_id === outputVariantId ? { ...o, [field]: cleanVal } : o))
    );
  };

  // Nivelar automáticamente la diferencia sin asignar como Merma Natural por Oreo / Goteo
  const handleAutoBalanceOreoShrinkage = () => {
    if (!simulation) return;
    setNaturalShrinkageQty(simulation.mass_balance.suggested_natural_shrinkage_qty);
  };

  const handleStartOrder = async () => {
    if (!order) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.post(`/mfg/orders/${order.id}/start`);
      setOrder(res.data);
      setSuccessMsg("Canal ingresada en Riel / Mesa de Desposte (IN_PROGRESS).");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "No se pudo iniciar la orden de desposte.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteButcheryOrder = async () => {
    if (!order || !simulation) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const carcassInput = editableInputs.find((i) => i.input_role !== "PACKAGING");
      const carcassWeight = carcassInput ? carcassInput.consumed_base_qty : simulation.actual_input_weight_kg;

      const payload = {
        actual_input_weight_kg: carcassWeight,
        actual_labor_hours: actualLaborHours,
        natural_shrinkage_qty: naturalShrinkageQty,
        explicit_waste_qty: simulation.mass_balance.explicit_waste_qty,
        notes: settlementNotes.trim() || undefined,
        inputs: editableInputs.map((i) => ({
          input_id: i.input_id,
          component_variant_id: i.component_variant_id,
          batch_id: i.batch_id,
          consumed_base_qty: i.consumed_base_qty,
        })),
        outputs: editableOutputs.map((o) => ({
          output_id: o.output_id,
          output_variant_id: o.output_variant_id,
          output_type: o.output_type,
          expected_yield_pct: o.expected_yield_pct,
          actual_good_qty: o.actual_good_qty,
          explicit_damaged_qty: o.explicit_damaged_qty,
          market_reference_price: o.market_reference_price,
        })),
      };

      const res = await api.post(`/mfg/orders/${order.id}/complete`, payload);
      const settled: OrderDetailResponse = res.data;
      setOrder(settled);
      setSuccessMsg(
        "¡Desposte Liquidado Atómicamente al Kardex bajo NIC 2! Se descargó la canal (MFG-OUT), se crearon los lotes sanitarios individuales por corte (MFG-IN) y se actualizaron los Costos Promedio Ponderados (WAVG) diferenciales."
      );
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Error al liquidar la Orden de Desposte.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400">
        Cargando Consola Interactiva de Sala de Desposte y Costeo Conjunto NIC 2...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="text-red-600 font-bold">{errorMsg || "Orden de Desposte no encontrada"}</div>
        <Link href="/butchery" className="inline-flex items-center gap-2 text-xs font-bold text-red-600 underline">
          Volver a Sala de Desposte
        </Link>
      </div>
    );
  }

  const isCompleted = order.state === "COMPLETED";
  const isCancelled = order.state === "CANCELLED";
  const isEditable = !isCompleted && !isCancelled;
  const currentStepIdx = FLOW_STEPS.findIndex((s) => s.key === order.state);
  const rate = simulation?.exchange_rate || order.exchange_rate || 40.0;
  const isAdHoc = order.bom_id === null || order.bom_code === "TRANSF-LIBRE";

  const mb = simulation?.mass_balance || {
    input_weight_kg: order.actual_input_weight_kg || order.planned_base_qty,
    good_cuts_weight_kg: order.actual_good_output_weight_kg,
    byproducts_weight_kg: order.actual_byproduct_weight_kg || 0,
    natural_shrinkage_qty: naturalShrinkageQty,
    explicit_waste_qty: order.explicit_waste_qty,
    accounted_weight_kg:
      order.actual_good_output_weight_kg +
      (order.actual_byproduct_weight_kg || 0) +
      naturalShrinkageQty +
      order.explicit_waste_qty,
    unaccounted_weight_kg: 0,
    suggested_natural_shrinkage_qty: naturalShrinkageQty,
    is_balanced: true,
    mass_balance_pct: 100.0,
    good_cuts_yield_pct: 88.0,
    byproducts_yield_pct: 9.0,
    total_meat_recovery_pct: 97.0,
    natural_shrinkage_pct: 3.0,
    explicit_waste_pct: 0,
    expected_shrinkage_pct: order.expected_shrinkage_pct,
    max_allowed_shrinkage_pct: order.max_allowed_shrinkage_pct,
    exceeds_max_shrinkage: false,
  };

  const cs = simulation?.cost_summary || {
    direct_materials_usd: order.cost_summary.direct_materials_usd,
    direct_materials_ves: order.cost_summary.direct_materials_ves,
    packaging_usd: order.cost_summary.packaging_usd,
    packaging_ves: order.cost_summary.packaging_ves,
    direct_labor_mod_usd: order.cost_summary.direct_labor_mod_usd,
    direct_labor_mod_ves: order.cost_summary.direct_labor_mod_ves,
    indirect_overhead_cif_usd: order.cost_summary.indirect_overhead_cif_usd,
    indirect_overhead_cif_ves: order.cost_summary.indirect_overhead_cif_ves,
    gross_production_cost_usd: order.cost_summary.gross_production_cost_usd,
    gross_production_cost_ves: order.cost_summary.gross_production_cost_ves,
    byproduct_credit_usd: order.cost_summary.byproduct_credit_usd || 0,
    byproduct_credit_ves: order.cost_summary.byproduct_credit_ves || 0,
    joint_cost_before_waste_usd:
      order.cost_summary.joint_cost_before_waste_usd || order.cost_summary.gross_production_cost_usd,
    joint_cost_before_waste_ves:
      order.cost_summary.joint_cost_before_waste_ves || order.cost_summary.gross_production_cost_ves,
    explicit_waste_cost_usd: order.cost_summary.explicit_waste_cost_usd,
    explicit_waste_cost_ves: order.cost_summary.explicit_waste_cost_ves,
    net_joint_cost_to_distribute_usd: order.cost_summary.net_production_cost_usd,
    net_joint_cost_to_distribute_ves: order.cost_summary.net_production_cost_ves,
    allocated_coproducts_cost_usd: order.cost_summary.net_production_cost_usd,
    allocated_coproducts_cost_ves: order.cost_summary.net_production_cost_ves,
    total_capitalized_inventory_cost_usd:
      order.cost_summary.net_production_cost_usd + (order.cost_summary.byproduct_credit_usd || 0),
    total_capitalized_inventory_cost_ves:
      (order.cost_summary.net_production_cost_usd + (order.cost_summary.byproduct_credit_usd || 0)) * rate,
    cost_allocation_delta_usd: 0,
    total_coproducts_market_value_usd: 0,
    total_coproducts_market_value_ves: 0,
    total_commercial_value_usd: 0,
    total_commercial_value_ves: 0,
    projected_global_margin_pct: 0,
  };

  const inputBase = Math.max(0.01, mb.input_weight_kg);
  const pctGoodCuts = Math.min(100, Math.max(0, (mb.good_cuts_weight_kg / inputBase) * 100));
  const pctByprod = Math.min(100 - pctGoodCuts, Math.max(0, (mb.byproducts_weight_kg / inputBase) * 100));
  const pctOreo = Math.min(100 - pctGoodCuts - pctByprod, Math.max(0, (mb.natural_shrinkage_qty / inputBase) * 100));
  const pctWaste = Math.min(
    100 - pctGoodCuts - pctByprod - pctOreo,
    Math.max(0, (mb.explicit_waste_qty / inputBase) * 100)
  );

  return (
    <div className="p-2 sm:p-6 w-full max-w-[1440px] mx-auto space-y-6">
      {/* PANEL 1: CABECERA Y TRAZABILIDAD DE LA CANAL (INPUT 1) */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-red-600 to-orange-500"></div>
        <div className="pl-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-400 mb-1">
            <Link href="/butchery" className="hover:text-red-600 transition-colors flex items-center gap-1">
              <i className="pi pi-arrow-left text-[10px]"></i>
              Sala de Desposte Cárnico
            </Link>
            <span>/</span>
            <span className="font-mono text-red-600">{order.order_number}</span>
            <span>•</span>
            <span className="text-slate-600">{order.work_center_name || "Sala de Desposte y Cárnicos"}</span>
            {isAdHoc && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-black">
                ⚡ Transformación Libre (Sin Plantilla)
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex flex-wrap items-center gap-3">
            <span>{order.order_number}</span>
            <span className="text-slate-400 font-light">—</span>
            <span>{order.bom_name}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <p className="text-xs sm:text-sm text-slate-500">
              Plantilla: <strong className="font-mono text-red-600">{order.bom_code}</strong> • Cava Origen:{" "}
              <strong>{order.source_warehouse_name}</strong> → Destino Cortes: <strong>{order.dest_warehouse_name}</strong> • Tasa BCV:{" "}
              <strong className="font-mono text-emerald-700">Bs. {rate.toFixed(2)} / USD</strong>
            </p>
            {isAdHoc && (
              <button
                type="button"
                onClick={() => {
                  const mainInput = order.inputs[0];
                  setSaveBomName(
                    mainInput
                      ? `Plantilla Desposte - ${mainInput.component_name}`
                      : `Plantilla desde ${order.order_number}`
                  );
                  setShowSaveBomForm((prev) => !prev);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
              >
                <span>💾 Guardar como Plantilla</span>
              </button>
            )}
          </div>

          {showSaveBomForm && (
            <div className="mt-3 p-3 rounded-xl bg-purple-50 border border-purple-200 flex flex-wrap items-center gap-2 max-w-xl">
              <input
                type="text"
                value={saveBomName}
                onChange={(e) => setSaveBomName(e.target.value)}
                placeholder="Nombre de la nueva Plantilla de Desposte..."
                className="flex-1 min-w-[220px] bg-white border border-purple-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800"
              />
              <button
                type="button"
                disabled={submitting}
                onClick={handleSaveAsBom}
                className="px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold cursor-pointer"
              >
                {submitting ? "Guardando..." : "Crear Plantilla BOM"}
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
                    ? "bg-red-600 text-white border-red-700 shadow-sm"
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

      {/* SELLO DE LIQUIDACIÓN KARDEX CUANDO COMPLETED */}
      {isCompleted && (
        <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 text-white p-6 rounded-2xl border border-emerald-500/40 shadow-lg grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0">
              <i className="pi pi-verified text-2xl"></i>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block">
                Desposte Sellado en Kardex
              </span>
              <div className="text-base font-black text-white">Liquidación Conjunta NIC 2</div>
              <div className="text-xs text-slate-400">
                {order.completed_at ? new Date(order.completed_at).toLocaleString("es-VE") : "Liquidada"}
              </div>
            </div>
          </div>

          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
              Folios Kardex (`inv.stock_pickings`)
            </span>
            <div className="text-xs font-mono text-orange-300 font-bold mt-0.5">
              Salida Canal: {order.kardex_links.picking_consumption_folio || `MFG-OUT/${order.order_number}`}
            </div>
            <div className="text-xs font-mono text-emerald-300 font-bold mt-0.5">
              Entrada Cortes: {order.kardex_links.picking_output_folio || `MFG-IN/${order.order_number}`}
            </div>
          </div>

          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
              Lotes Sanitarios Generados (`inv.batches`)
            </span>
            <div className="font-mono text-xs font-black text-emerald-400 mt-0.5">
              {order.outputs.filter((o) => Boolean(o.generated_batch_number)).length} lotes trazables por corte
            </div>
            <div className="text-[11px] text-slate-300 mt-0.5 font-mono">
              Ej: {order.outputs.find((o) => Boolean(o.generated_batch_number))?.generated_batch_number || `L-${order.order_number}-${order.outputs[0]?.output_sku}`}
            </div>
          </div>

          <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
              Balance de Masa y Cuadre NIC 2
            </span>
            <div className="text-sm font-mono font-black text-white mt-0.5">
              {mb.input_weight_kg.toFixed(2)} Kg = 100.00% Contabilizado
            </div>
            <div className="text-[11px] text-emerald-400 font-mono font-bold">
              Diferencia Prorrateo (Δ): $0.0000
            </div>
          </div>
        </div>
      )}

      {/* PANEL 2: TERMÓMETRO INTERACTIVO DE BALANCE DE MASA AL 100% */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
              <i className="pi pi-sliders-h text-red-600"></i>
              Termómetro de Balance de Masa al 100% (Ecuación Física de Sala de Desposte)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              La suma de Cortes Buenos + Subproductos + Merma Natural por Oreo + Merma Dañada debe igualar exactamente los{" "}
              <strong className="font-mono text-slate-800">{mb.input_weight_kg.toFixed(2)} Kg</strong> de entrada de la canal.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black font-mono border flex items-center gap-1.5 ${
                mb.is_balanced
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : "bg-red-50 text-red-700 border-red-300 animate-pulse"
              }`}
            >
              <i className={`pi ${mb.is_balanced ? "pi-check-circle" : "pi-exclamation-circle"}`}></i>
              {mb.is_balanced
                ? `Balance Exacto: ${mb.accounted_weight_kg.toFixed(2)} / ${mb.input_weight_kg.toFixed(2)} Kg (100%)`
                : `Diferencia sin asignar (ΔW): ${mb.unaccounted_weight_kg > 0 ? "+" : ""}${mb.unaccounted_weight_kg.toFixed(2)} Kg`}
            </span>

            {isEditable && !mb.is_balanced && (
              <button
                type="button"
                onClick={handleAutoBalanceOreoShrinkage}
                className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black px-3.5 py-2 rounded-xl shadow-sm transition-all cursor-pointer"
              >
                <span>⚖️ Nivelar Diferencia como Merma por Oreo ({mb.suggested_natural_shrinkage_qty.toFixed(2)} Kg)</span>
              </button>
            )}
          </div>
        </div>

        {/* Barra Visual Segmentada de Balance de Masa */}
        <div className="w-full h-5 bg-slate-100 rounded-full overflow-hidden flex border border-slate-200 shadow-inner">
          <div
            style={{ width: `${pctGoodCuts}%` }}
            className="bg-emerald-500 h-full transition-all duration-300"
            title={`Cortes Nobles e Industriales: ${mb.good_cuts_weight_kg.toFixed(2)} Kg (${pctGoodCuts.toFixed(1)}%)`}
          />
          <div
            style={{ width: `${pctByprod}%` }}
            className="bg-blue-500 h-full transition-all duration-300"
            title={`Subproductos (Hueso/Sebo): ${mb.byproducts_weight_kg.toFixed(2)} Kg (${pctByprod.toFixed(1)}%)`}
          />
          <div
            style={{ width: `${pctOreo}%` }}
            className="bg-amber-400 h-full transition-all duration-300"
            title={`Merma Natural por Oreo / Goteo: ${mb.natural_shrinkage_qty.toFixed(2)} Kg (${pctOreo.toFixed(1)}%)`}
          />
          <div
            style={{ width: `${pctWaste}%` }}
            className="bg-red-500 h-full transition-all duration-300"
            title={`Merma Explícita / Dañada: ${mb.explicit_waste_qty.toFixed(2)} Kg (${pctWaste.toFixed(1)}%)`}
          />
        </div>

        {/* Tarjetas de la Ecuación de Masa + Control de Oreo y Horas MOD */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
              1. Entrada Canal (`W_in`)
            </label>
            {isEditable && editableInputs.find((i) => i.input_role !== "PACKAGING") ? (
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  value={editableInputs.find((i) => i.input_role !== "PACKAGING")?.consumed_base_qty ?? mb.input_weight_kg}
                  onChange={(e) => {
                    const primaryIn = editableInputs.find((i) => i.input_role !== "PACKAGING");
                    if (primaryIn) {
                      handleInputQtyChange(primaryIn.input_id, Math.max(0.1, Number(e.target.value)));
                    }
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-sm font-mono font-black text-slate-900 focus:outline-none focus:border-red-600"
                />
                <span className="text-xs font-bold text-slate-700">Kg</span>
              </div>
            ) : (
              <div className="text-lg font-mono font-black text-slate-900 mt-0.5">
                {mb.input_weight_kg.toFixed(2)} Kg
              </div>
            )}
            <span className="text-[10px] text-slate-500 mt-1 block">100.0% masa bruta</span>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">
              2. Cortes Principales Buenos
            </span>
            <div className="text-lg font-mono font-black text-emerald-700 mt-0.5">
              {mb.good_cuts_weight_kg.toFixed(2)} Kg
            </div>
            <span className="text-[11px] text-emerald-700 font-semibold">
              Yield Cárnico: {mb.good_cuts_yield_pct.toFixed(2)}%
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-800 block">
              3. Subproductos (Hueso/Sebo)
            </span>
            <div className="text-lg font-mono font-black text-blue-700 mt-0.5">
              {mb.byproducts_weight_kg.toFixed(2)} Kg
            </div>
            <span className="text-[11px] text-blue-700 font-semibold">
              Crédito VRN: -${cs.byproduct_credit_usd.toFixed(2)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
            <label className="text-[10px] font-black uppercase tracking-wider text-amber-800 block">
              4. Merma Natural por Oreo (Kg)
            </label>
            <div className="flex items-center gap-1.5 mt-1">
              <input
                type="number"
                step="0.05"
                min="0"
                disabled={!isEditable}
                value={naturalShrinkageQty}
                onChange={(e) => setNaturalShrinkageQty(Math.max(0, Number(e.target.value)))}
                className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1 text-sm font-mono font-black text-amber-800 focus:outline-none focus:border-amber-600 disabled:bg-amber-50"
              />
              <span className="text-xs font-bold text-amber-700">Kg</span>
            </div>
            <span className="text-[10px] text-amber-700 mt-1 block">
              {mb.natural_shrinkage_pct.toFixed(2)}% (Tope: {mb.max_allowed_shrinkage_pct}%)
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-red-50/70 border border-red-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-red-800 block">
              5. Merma Anormal / Dañada
            </span>
            <div className="text-lg font-mono font-black text-red-700 mt-0.5">
              {mb.explicit_waste_qty.toFixed(2)} Kg
            </div>
            <span className="text-[11px] text-red-700 font-semibold">
              Gasto VIRT_LOSS: ${cs.explicit_waste_cost_usd.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* LAYOUT PRINCIPAL: MATRIZ DE CORTES NIC 2 (8 COL) + CASCADA FINANCIERA (4 COL) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUMNA IZQUIERDA (8 COL): DESCARGO DE CANAL + MATRIZ INTERACTIVA 1 -> N */}
        <div className="lg:col-span-8 space-y-6">
          {/* Sub-tabla de Insumos de Entrada (Canal + Bandejas) y Horas MOD */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm sm:text-base font-black text-slate-800 flex items-center gap-2">
                  <i className="pi pi-box text-orange-600"></i>
                  1. Descargo de Materia Prima (Canal) y Empaque (`MFG-OUT` → `VIRT_PRODUCTION`)
                </h2>
                <p className="text-xs text-slate-500">
                  Verifica el peso real de la canal en balanza de riel, lote sanitario FEFO y horas hombre de cuadrilla.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                <label className="text-xs font-bold text-slate-600">Horas Reales MOD:</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  disabled={!isEditable}
                  value={actualLaborHours}
                  onChange={(e) => setActualLaborHours(Math.max(0, Number(e.target.value)))}
                  className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-1 text-right font-mono text-xs font-black text-slate-800"
                />
                <span className="text-xs font-mono text-slate-500">HRS</span>
              </div>
            </div>

            <div tabIndex={0} role="region" aria-label="Insumos de entrada de la canal y empaque" className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
                    <th className="py-2.5 px-4">Insumo / SKU</th>
                    <th className="py-2.5 px-3">Lote FEFO</th>
                    <th className="py-2.5 px-3 text-right">Stock Cava</th>
                    <th className="py-2.5 px-3 text-right">Consumo Real</th>
                    <th className="py-2.5 px-3 text-right">Costo Unit.</th>
                    <th className="py-2.5 px-4 text-right">Subtotal (USD / Bs)</th>
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
                    return (
                      <tr key={inp.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-4">
                          <div className="font-bold text-slate-800">{inp.component_name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            SKU: {inp.component_sku} • {inp.input_role}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          {isEditable && inp.available_batches.length > 0 ? (
                            <select
                              value={editItem.batch_id || ""}
                              onChange={(e) =>
                                handleInputBatchChange(inp.id, e.target.value ? Number(e.target.value) : null)
                              }
                              className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-800"
                            >
                              {inp.available_batches.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.batch_number} (Vence: {b.expiry_date || "N/A"})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                              {inp.batch_number || "SIN-LOTE"}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {inp.available_stock_qty} {inp.uom_base}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {isEditable ? (
                            <div className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                step={inp.is_discrete_uom ? "1" : "0.1"}
                                min="0"
                                value={editItem.consumed_base_qty}
                                onChange={(e) => handleInputQtyChange(inp.id, Number(e.target.value))}
                                className="w-24 text-right bg-orange-50/50 border border-orange-300 rounded-lg px-2 py-1 font-mono font-black text-slate-800"
                              />
                              <span className="font-mono text-[10px] text-slate-500">{inp.uom_base}</span>
                            </div>
                          ) : (
                            <span className="font-mono font-black text-slate-800">
                              {inp.consumed_base_qty} {inp.uom_base}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          ${editItem.unit_cost_usd.toFixed(4)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono">
                          <div className="font-bold text-slate-800">${lineUsd.toFixed(2)}</div>
                          <div className="text-[10px] text-slate-500">Bs. {(lineUsd * rate).toFixed(2)}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* PANEL 3: MATRIZ INTERACTIVA DE CORTES Y PRORRATEO NIC 2 EN VIVO (1 -> N) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm sm:text-base font-black text-slate-800 flex items-center gap-2">
                  <i className="pi pi-percentage text-red-600"></i>
                  2. Matriz Interactiva de Cortes y Prorrateo de Costos Conjuntos NIC 2 (`1 → N`)
                </h2>
                <p className="text-xs text-slate-500">
                  Los co-productos absorben el costo neto en proporción a su <strong>Valor Relativo de Mercado</strong> ($\alpha_i = V_i / \sum V_k$). Los subproductos acreditan su VRN fijo.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isEditable && (
                  <button
                    type="button"
                    onClick={async () => {
                      await ensureCatalogLoaded();
                      setShowAddOutputRow((prev) => !prev);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                  >
                    <i className="pi pi-plus text-[10px]"></i>
                    Añadir Corte / Subproducto
                  </button>
                )}
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200">
                  {order.outputs.length} salidas conjuntas
                </span>
              </div>
            </div>

            {showAddOutputRow && isEditable && (
              <div className="p-4 bg-red-50/50 border-b border-red-200 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                <div className="sm:col-span-5">
                  <VariantCombobox
                    value={newOutputVariantId}
                    variants={variants}
                    compact
                    onChange={(vid, vObj) => {
                      setNewOutputVariantId(vid);
                      if (vObj && vObj.sales_price_usd > 0) {
                        setNewOutputRefPrice(vObj.sales_price_usd);
                      }
                    }}
                    onSearchCatalog={searchCatalogVariants}
                    placeholder="Seleccionar nuevo corte o subproducto..."
                  />
                </div>
                <div className="sm:col-span-2">
                  <input
                    type="number"
                    step="0.05"
                    min="0.01"
                    value={newOutputQty}
                    onChange={(e) => setNewOutputQty(Math.max(0.01, Number(e.target.value)))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-slate-800 text-right"
                    placeholder="Peso Kg"
                    title="Peso real obtenido (Kg)"
                  />
                </div>
                <div className="sm:col-span-2">
                  <select
                    value={newOutputType}
                    onChange={(e) => setNewOutputType(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700"
                  >
                    <option value="CO_PRODUCT">CO_PRODUCT</option>
                    <option value="PRIMARY_PRODUCT">PRIMARY_PRODUCT</option>
                    <option value="BY_PRODUCT">BY_PRODUCT (VRN)</option>
                  </select>
                </div>
                <div className="sm:col-span-1">
                  <input
                    type="number"
                    step="0.1"
                    min="0.01"
                    value={newOutputRefPrice}
                    onChange={(e) => setNewOutputRefPrice(Math.max(0.01, Number(e.target.value)))}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-700 text-right"
                    placeholder="$/Kg"
                    title="Precio Ref. Mercado ($/Kg)"
                  />
                </div>
                <div className="sm:col-span-2 flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    disabled={submitting || !newOutputVariantId}
                    onClick={handleAddOutputLine}
                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Agregar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddOutputRow(false)}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
                  >
                    <i className="pi pi-times text-xs"></i>
                  </button>
                </div>
              </div>
            )}

            <div
              tabIndex={0}
              role="region"
              aria-label="Matriz de cortes y prorrateo de costos conjuntos NIC 2"
              className="overflow-x-auto"
            >
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-3">Corte / Lote Sanitario</th>
                    <th className="py-3 px-2 text-right">Meta Esp.</th>
                    <th className="py-3 px-2 text-right">Peso Real Bueno</th>
                    <th className="py-3 px-2 text-right">Dañado (Kg)</th>
                    <th className="py-3 px-2 text-right">PVP Ref ($/Kg)</th>
                    <th className="py-3 px-2 text-right">Valor Comercial</th>
                    <th className="py-3 px-2 text-right">% Absorción α_i</th>
                    <th className="py-3 px-3 text-right">Costo Unit. Liquidado</th>
                    <th className="py-3 px-3 text-right">Nuevo WAVG / Margen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.outputs.map((out) => {
                    const editOut = editableOutputs.find((e) => e.output_variant_id === out.output_variant_id) || {
                      output_id: out.id,
                      output_variant_id: out.output_variant_id,
                      output_type: out.output_type,
                      expected_yield_pct: out.expected_yield_pct,
                      actual_good_qty: out.actual_good_qty,
                      explicit_damaged_qty: out.explicit_damaged_qty,
                      market_reference_price: out.market_reference_price_usd,
                    };
                    const simOut = simulation?.outputs.find((s) => s.output_variant_id === out.output_variant_id);
                    const badge = OUTPUT_TYPE_BADGES[out.output_type] || OUTPUT_TYPE_BADGES.CO_PRODUCT;

                    const actualYieldPct = simOut ? simOut.actual_yield_pct : out.actual_yield_pct;
                    const yieldVarPct = simOut
                      ? simOut.yield_variance_pct
                      : out.yield_variance_pct ?? actualYieldPct - out.expected_yield_pct;
                    const commValUsd = simOut
                      ? simOut.commercial_value_usd
                      : editOut.actual_good_qty * editOut.market_reference_price;
                    const allocPct = simOut ? simOut.cost_allocation_pct : out.cost_allocation_pct;
                    const allocTotalUsd = simOut ? simOut.allocated_total_cost_usd : out.allocated_total_cost_usd;
                    const unitCostUsd = simOut ? simOut.calculated_unit_cost_usd : out.calculated_unit_cost_usd;
                    const unitCostVes = simOut ? simOut.calculated_unit_cost_ves : out.calculated_unit_cost_ves;
                    const projWavgUsd = isCompleted
                      ? out.current_inventory_wavg_usd
                      : simOut
                      ? simOut.projected_wavg_cost_usd
                      : out.current_inventory_wavg_usd;
                    const marginPct = simOut ? simOut.gross_margin_pct : out.gross_margin_pct || 0;
                    const batchLabel = isCompleted
                      ? out.generated_batch_number || "Sin lote (0 Kg)"
                      : out.generated_batch_number || `L-${order.order_number}-${out.output_sku}`;

                    return (
                      <tr key={out.id} className="hover:bg-slate-50/90 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-800">{out.output_name}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[10px] text-slate-400">SKU: {out.output_sku}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${badge.color}`}>
                              {badge.label}
                            </span>
                          </div>
                          <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                            <i className="pi pi-qrcode text-[9px] text-emerald-600"></i>
                            {batchLabel}
                          </div>
                        </td>

                        <td className="py-3 px-2 text-right font-mono">
                          <div className="font-bold text-slate-700">
                            {out.planned_qty.toFixed(2)} {out.uom_base}
                          </div>
                          <div className="text-[10px] text-slate-400">{out.expected_yield_pct.toFixed(1)}%</div>
                        </td>

                        <td className="py-3 px-2 text-right">
                          {isEditable ? (
                            <div>
                              <input
                                type="number"
                                step="0.05"
                                min="0"
                                value={editOut.actual_good_qty}
                                onChange={(e) =>
                                  handleOutputFieldChange(
                                    out.output_variant_id,
                                    "actual_good_qty",
                                    Number(e.target.value)
                                  )
                                }
                                className="w-20 text-right bg-emerald-50/70 border border-emerald-300 rounded-lg px-2 py-1 font-mono font-black text-emerald-800 focus:outline-none focus:border-emerald-600"
                              />
                              <div className="flex items-center justify-end gap-1 mt-0.5 font-mono text-[10px]">
                                <span className="text-emerald-700 font-bold">{actualYieldPct.toFixed(2)}%</span>
                                <span
                                  className={`px-1 py-0.2 rounded font-bold ${
                                    Math.abs(yieldVarPct) <= 0.05
                                      ? "bg-slate-100 text-slate-600"
                                      : yieldVarPct > 0
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-amber-100 text-amber-800"
                                  }`}
                                  title="Desviación de rendimiento real vs esperado"
                                >
                                  {yieldVarPct > 0 ? "+" : ""}
                                  {yieldVarPct.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="font-mono">
                              <div className="font-black text-emerald-700">
                                {out.actual_good_qty.toFixed(2)} {out.uom_base}
                              </div>
                              <div className="flex items-center justify-end gap-1 mt-0.5 text-[10px]">
                                <span className="text-slate-500">{actualYieldPct.toFixed(2)}%</span>
                                <span
                                  className={`px-1 py-0.2 rounded font-bold ${
                                    Math.abs(yieldVarPct) <= 0.05
                                      ? "bg-slate-100 text-slate-600"
                                      : yieldVarPct > 0
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-amber-100 text-amber-800"
                                  }`}
                                >
                                  {yieldVarPct > 0 ? "+" : ""}
                                  {yieldVarPct.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-2 text-right">
                          {isEditable ? (
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              value={editOut.explicit_damaged_qty}
                              onChange={(e) =>
                                handleOutputFieldChange(
                                  out.output_variant_id,
                                  "explicit_damaged_qty",
                                  Number(e.target.value)
                                )
                              }
                              className="w-16 text-right bg-red-50/50 border border-red-200 rounded-lg px-1.5 py-1 font-mono font-bold text-red-700 focus:outline-none focus:border-red-500"
                            />
                          ) : (
                            <span className="font-mono text-red-600 font-bold">
                              {out.explicit_damaged_qty.toFixed(2)}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-2 text-right">
                          {isEditable ? (
                            <input
                              type="number"
                              step="0.1"
                              min="0.01"
                              value={editOut.market_reference_price}
                              onChange={(e) =>
                                handleOutputFieldChange(
                                  out.output_variant_id,
                                  "market_reference_price",
                                  Number(e.target.value)
                                )
                              }
                              className="w-18 text-right bg-slate-50 border border-slate-300 rounded-lg px-1.5 py-1 font-mono font-bold text-slate-800 focus:outline-none focus:border-orange-500"
                            />
                          ) : (
                            <span className="font-mono font-bold text-slate-700">
                              ${out.market_reference_price_usd.toFixed(2)}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-2 text-right font-mono">
                          <div className="font-bold text-slate-800">${commValUsd.toFixed(2)}</div>
                          <div className="text-[10px] text-slate-400">Bs. {(commValUsd * rate).toFixed(2)}</div>
                        </td>

                        <td className="py-3 px-2 text-right font-mono">
                          {out.output_type === "BY_PRODUCT" ? (
                            <div>
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px]">
                                Crédito VRN
                              </span>
                              <div className="text-[10px] text-blue-600 font-bold mt-0.5">
                                -${allocTotalUsd.toFixed(2)}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-black text-orange-600">{allocPct.toFixed(2)}%</div>
                              <div className="text-[10px] text-slate-500">${allocTotalUsd.toFixed(2)}</div>
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right font-mono">
                          <div className="font-black text-slate-900 text-sm">
                            ${unitCostUsd.toFixed(4)} / {out.uom_base}
                          </div>
                          <div className="text-[10px] text-slate-500">Bs. {unitCostVes.toFixed(2)}</div>
                        </td>

                        <td className="py-3 px-3 text-right font-mono">
                          <div className="font-bold text-emerald-700">WAVG: ${projWavgUsd.toFixed(4)}</div>
                          <span
                            className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-black ${
                              marginPct >= 25
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : marginPct > 0
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            Margen: {marginPct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* PANEL 4: CASCADA FINANCIERA NIC 2 (PANEL LATERAL OSCURO) Y ACCIÓN ATÓMICA (4 COL) */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-20">
          <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-xl p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-red-400 block">
                  Motor Financiero NIC 2 Párrafo 14
                </span>
                <h3 className="text-lg font-black text-white">Cascada de Costos Conjuntos</h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
                <i className="pi pi-calculator text-lg"></i>
              </div>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="flex justify-between items-center text-slate-300">
                <span>+ Materia Prima Directa (Canal)</span>
                <span className="font-bold text-white">${cs.direct_materials_usd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>+ Material de Empaque (Bandejas)</span>
                <span className="font-bold text-white">${cs.packaging_usd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>+ Mano de Obra Directa (MOD)</span>
                <span className="font-bold text-white">${cs.direct_labor_mod_usd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>+ Costos Indirectos (CIF Frío)</span>
                <span className="font-bold text-white">${cs.indirect_overhead_cif_usd.toFixed(2)}</span>
              </div>

              <div className="border-t border-slate-800 pt-2.5 flex justify-between items-center text-sm">
                <span className="font-bold text-slate-200">= Costo Bruto de la Tanda</span>
                <div className="text-right">
                  <div className="font-black text-white">${cs.gross_production_cost_usd.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-400">Bs. {cs.gross_production_cost_ves.toFixed(2)}</div>
                </div>
              </div>

              <div className="flex justify-between items-center text-blue-400 pt-1">
                <span>- Crédito Subproductos (VRN Fijo)</span>
                <span className="font-bold">-${cs.byproduct_credit_usd.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center text-red-400">
                <span>- Merma Anormal (`VIRT_LOSS`)</span>
                <span className="font-bold">-${cs.explicit_waste_cost_usd.toFixed(2)}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-gradient-to-r from-red-950/80 to-slate-800 border border-red-500/40 mt-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-[11px] font-black uppercase tracking-wider text-orange-300">
                    = Masa Neta a Distribuir
                  </span>
                  <span className="text-xl font-black text-white">
                    ${cs.net_joint_cost_to_distribute_usd.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-300 mt-1">
                  <span>Equivalente BCV:</span>
                  <span>
                    Bs.{" "}
                    {cs.net_joint_cost_to_distribute_ves.toLocaleString("es-VE", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/90 border border-slate-700 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">∑ Costo Asignado a Cortes:</span>
                  <span className="font-bold text-emerald-400">${cs.allocated_coproducts_cost_usd.toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Diferencia de Cuadre (Δ):</span>
                  <span className="font-black text-emerald-400">
                    ${Math.abs(cs.cost_allocation_delta_usd).toFixed(4)}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-700 pt-1.5">
                  <span className="text-slate-400">Valor Comercial Total Cortes:</span>
                  <span className="font-bold text-white">${cs.total_commercial_value_usd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Margen Bruto Global Tanda:</span>
                  <span className="font-black text-emerald-400">{cs.projected_global_margin_pct.toFixed(2)}%</span>
                </div>
              </div>
            </div>

            {isEditable && (
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Notas de Liquidación / Auditoría de Sala
                  </label>
                  <input
                    type="text"
                    value={settlementNotes}
                    onChange={(e) => setSettlementNotes(e.target.value)}
                    placeholder="Ej: Liquidación validada en balanza de riel..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
                  />
                </div>

                {!mb.is_balanced && (
                  <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-[11px] font-bold">
                    ⚠️ El Balance de Masa presenta una diferencia de {mb.unaccounted_weight_kg.toFixed(2)} Kg. Nivela la Merma por Oreo o ajusta los pesos de los cortes antes de liquidar al Kardex.
                  </div>
                )}

                {order.state === "PLANNED" || order.state === "DRAFT" ? (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleStartOrder}
                    className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase tracking-wider shadow-lg transition-all cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? "Iniciando..." : "▶️ Iniciar Desposte en Riel (IN_PROGRESS)"}
                  </button>
                ) : null}

                <button
                  type="button"
                  disabled={submitting || !mb.is_balanced}
                  onClick={handleCompleteButcheryOrder}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-xs sm:text-sm shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting
                    ? "Liquidando Desposte y Kardex..."
                    : "✅ Liquidar Desposte y Afectar Kardex"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
