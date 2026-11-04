"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import api from "@/lib/api";
import {
  ProductionPrintModal,
  PrintableBatchRunData,
  PrintableOrderData,
} from "@/components/print/ProductionPrintModal";

interface FacilityOption {
  id: number;
  code: string;
  name: string;
  is_active?: boolean;
}

interface WarehouseOption {
  id: number;
  facility_id: number;
  facility_name?: string;
  code: string;
  name: string;
  is_scrap?: boolean;
  is_scrap_warehouse?: boolean;
}

interface WorkCenterOption {
  id: number;
  facility_id: number;
  facility_name?: string;
  warehouse_wip_id?: number | null;
  warehouse_wip_name?: string | null;
  code: string;
  name: string;
  sector: string;
  capacity_per_batch?: number;
  capacity_uom?: string;
  hourly_labor_rate: number;
  hourly_overhead_rate: number;
  overhead_per_kg: number;
  is_active?: boolean;
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
  standard_labor_hours?: number;
  primary_product_sku?: string;
  primary_product_name?: string;
  is_active?: boolean;
}

interface BatchRunRow {
  rowKey: string;
  bom_id: number;
  work_center_id: number;
  scale_factor: number;
  planned_base_qty: number;
  actual_good_qty: number;
  natural_shrinkage_qty: number;
  explicit_damaged_qty: number;
  actual_labor_hours: number;
  uom_id: string;
  expected_shrinkage_pct: number;
  base_qty: number;
}

interface RecipePreviewItem {
  line_index: number;
  bom_id: number;
  bom_code: string;
  bom_name: string;
  bom_type: string;
  sector: string;
  work_center_id?: number | null;
  work_center_code?: string | null;
  work_center_name?: string | null;
  primary_product_variant_id: number;
  primary_product_sku?: string | null;
  primary_product_name?: string | null;
  base_qty: number;
  scale_factor: number;
  planned_base_qty: number;
  uom_id: string;
  expected_shrinkage_pct: number;
  actual_good_qty: number;
  natural_shrinkage_qty: number;
  explicit_damaged_qty: number;
  actual_labor_hours: number;
  direct_materials_usd: number;
  packaging_usd: number;
  direct_labor_mod_usd: number;
  indirect_overhead_cif_usd: number;
  explicit_waste_cost_usd: number;
  estimated_batch_cost_usd: number;
  estimated_batch_cost_ves: number;
  net_production_cost_usd: number;
  net_production_cost_ves: number;
  estimated_unit_cost_usd: number;
  estimated_unit_cost_ves: number;
  current_stock_qty: number;
  current_wavg_cost_usd: number;
  projected_new_wavg_cost_usd: number;
  projected_new_wavg_cost_ves: number;
  current_pvp_usd: number;
  projected_margin_pct: number;
  stock_semaphore: "AVAILABLE" | "PARTIAL" | "SHORTAGE";
}

interface ConsolidatedInputItem {
  component_variant_id: number;
  component_sku: string;
  component_name: string;
  input_role: string;
  uom_base: string;
  is_discrete_uom: boolean;
  recipes_count: number;
  recipe_codes: string[];
  used_in_recipes: Array<{
    line_index: number;
    bom_id: number;
    bom_code: string;
    bom_name: string;
    required_base_qty: number;
    uom_base: string;
  }>;
  total_required_base_qty: number;
  available_stock_qty: number;
  balance_after_batch_qty: number;
  shortage_qty: number;
  availability_status: "AVAILABLE" | "PARTIAL" | "SHORTAGE";
  suggested_batch_id?: number | null;
  suggested_batch_number?: string | null;
  suggested_batch_expiry_date?: string | null;
  days_to_expiry?: number | null;
  unit_cost_usd: number;
  unit_cost_ves: number;
  total_cost_usd: number;
  total_cost_ves: number;
}

interface BatchExplodePreviewResponse {
  facility_id: number;
  facility_name: string;
  source_warehouse_id: number;
  source_warehouse_name: string;
  dest_warehouse_id: number;
  dest_warehouse_name: string;
  exchange_rate: number;
  overall_stock_status: "AVAILABLE" | "PARTIAL" | "SHORTAGE";
  total_recipes_count: number;
  total_consolidated_inputs_count: number;
  total_direct_materials_usd: number;
  total_direct_materials_ves: number;
  total_packaging_usd: number;
  total_packaging_ves: number;
  total_direct_labor_mod_usd: number;
  total_direct_labor_mod_ves: number;
  total_indirect_overhead_cif_usd: number;
  total_indirect_overhead_cif_ves: number;
  total_explicit_waste_cost_usd: number;
  total_explicit_waste_cost_ves: number;
  total_batch_cost_usd: number;
  total_batch_cost_ves: number;
  net_batch_cost_usd: number;
  net_batch_cost_ves: number;
  recipe_previews: RecipePreviewItem[];
  consolidated_inputs: ConsolidatedInputItem[];
}

interface ExecutedOrderResult {
  id: number;
  order_number: string;
  state: string;
  order_type?: string;
  sector?: string;
  work_center_name?: string | null;
  bom_id?: number;
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
  new_wavg_cost_ves?: number;
  generated_batch_number?: string | null;
  picking_consumption_name?: string | null;
  picking_output_name?: string | null;
}

interface BatchRunExecuteResult {
  plan_id: number;
  plan_number: string;
  plan_date: string;
  shift: string;
  sector: string;
  state: string;
  execution_mode: "LEAVE_IN_PROGRESS" | "COMPLETE_AND_SETTLE";
  facility_id: number;
  facility_name: string;
  source_warehouse_id: number;
  source_warehouse_name: string;
  dest_warehouse_id: number;
  dest_warehouse_name: string;
  exchange_rate: number;
  orders_count: number;
  completed_orders_count: number;
  total_cost_usd: number;
  total_cost_ves: number;
  orders_created: ExecutedOrderResult[];
}

interface BatchRunHistoryItem {
  id: number;
  plan_number: string;
  plan_date: string;
  shift: string;
  sector: string;
  state: string;
  facility_id: number;
  facility_name: string;
  source_warehouse_name?: string;
  dest_warehouse_name?: string;
  exchange_rate?: number;
  notes?: string | null;
  created_at?: string | null;
  lines_count: number;
  orders_count: number;
  completed_orders_count: number;
  in_progress_orders_count: number;
  total_direct_materials_usd?: number;
  total_packaging_usd?: number;
  total_direct_labor_mod_usd?: number;
  total_indirect_overhead_cif_usd?: number;
  total_explicit_waste_cost_usd?: number;
  total_cost_usd: number;
  total_cost_ves: number;
  orders: ExecutedOrderResult[];
  consolidated_inputs?: ConsolidatedInputItem[];
}

const SEMAPHORE_BADGES: Record<
  "AVAILABLE" | "PARTIAL" | "SHORTAGE",
  { label: string; color: string; icon: string }
> = {
  AVAILABLE: {
    label: "Stock Completo",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: "pi-check-circle",
  },
  PARTIAL: {
    label: "Stock Parcial",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    icon: "pi-exclamation-triangle",
  },
  SHORTAGE: {
    label: "Faltante Stock",
    color: "bg-red-50 text-red-700 border-red-200",
    icon: "pi-times-circle",
  },
};

const SHIFT_LABELS: Record<string, string> = {
  MORNING: "Mañana (Matutino)",
  AFTERNOON: "Tarde (Vespertino)",
  NIGHT: "Noche (Nocturno)",
  FULL_DAY: "Jornada Completa",
};

function isDiscreteUom(uom: string): boolean {
  const u = (uom || "UND").trim().toUpperCase();
  return !["KG", "G", "GR", "LT", "L", "ML"].includes(u);
}

function buildRowFromBom(
  bom: BOMOption,
  scaleFactor: number,
  facilityWorkCenters: WorkCenterOption[]
): BatchRunRow {
  const baseQty = Math.max(0.0001, Number(bom.base_qty || 1));
  const plannedQty = Number((baseQty * scaleFactor).toFixed(4));
  const shrinkPct = Math.max(0, Math.min(95, Number(bom.expected_shrinkage_pct || 0)));
  const rawGood = plannedQty * (1 - shrinkPct / 100);
  const discrete = isDiscreteUom(bom.uom_id || "UND");
  const goodQty = discrete ? Math.max(1, Math.round(rawGood)) : Number(rawGood.toFixed(4));
  const natShrinkQty = Math.max(0, Number((plannedQty - goodQty).toFixed(4)));
  const stdHours = Number(((Number(bom.standard_labor_hours || 2.0) || 2.0) * scaleFactor).toFixed(2));

  const matchWc =
    (bom.work_center_id
      ? facilityWorkCenters.find((w) => w.id === bom.work_center_id)
      : undefined) ||
    facilityWorkCenters.find((w) => w.sector === bom.sector) ||
    facilityWorkCenters[0];

  return {
    rowKey: `${bom.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    bom_id: bom.id,
    work_center_id: matchWc ? matchWc.id : Number(bom.work_center_id || 0),
    scale_factor: scaleFactor,
    planned_base_qty: plannedQty,
    actual_good_qty: goodQty,
    natural_shrinkage_qty: natShrinkQty,
    explicit_damaged_qty: 0,
    actual_labor_hours: stdHours,
    uom_id: bom.uom_id || "UND",
    expected_shrinkage_pct: shrinkPct,
    base_qty: baseQty,
  };
}

export default function BatchRunProductionPage() {
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenterOption[]>([]);
  const [boms, setBoms] = useState<BOMOption[]>([]);
  const [loadingInit, setLoadingInit] = useState<boolean>(true);

  // Bloque 1: Ubicación Operativa y Turno
  const [selectedFacilityId, setSelectedFacilityId] = useState<number>(1);
  const [sourceWarehouseId, setSourceWarehouseId] = useState<number>(1);
  const [destWarehouseId, setDestWarehouseId] = useState<number>(1);
  const [shift, setShift] = useState<string>("MORNING");
  const [sectorFilter, setSectorFilter] = useState<string>("ALL");
  const [batchNotes, setBatchNotes] = useState<string>("");

  // Bloque 2: Grilla de Recetas a Producir
  const [rows, setRows] = useState<BatchRunRow[]>([]);

  // Bloque 3: Explosión Consolidada en Vivo
  const [preview, setPreview] = useState<BatchExplodePreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);

  // Bloque 4 & 5: Ejecución Masiva e Historial
  const [executingMode, setExecutingMode] = useState<
    "LEAVE_IN_PROGRESS" | "COMPLETE_AND_SETTLE" | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<BatchRunExecuteResult | null>(null);
  const [historyItems, setHistoryItems] = useState<BatchRunHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [printingBatchRun, setPrintingBatchRun] = useState<PrintableBatchRunData | null>(null);
  const [printingOrder, setPrintingOrder] = useState<PrintableOrderData | null>(null);
  const [loadingPrintPlanId, setLoadingPrintPlanId] = useState<number | null>(null);
  const [loadingPrintOrderId, setLoadingPrintOrderId] = useState<number | null>(null);

  const loadBatchHistory = useCallback(async (facId?: number) => {
    setLoadingHistory(true);
    try {
      const qs = facId ? `?facility_id=${facId}&limit=15` : "?limit=15";
      const res = await api.get(`/mfg/batch-runs${qs}`);
      setHistoryItems(res.data?.items || []);
    } catch (err) {
      console.error("Error cargando historial de corridas masivas:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    async function initBatchScreen() {
      setLoadingInit(true);
      try {
        const [infraRes, bomsRes] = await Promise.all([
          api.get("/mfg/facilities-and-warehouses"),
          api.get("/mfg/boms"),
        ]);

        const facList: FacilityOption[] = infraRes.data?.facilities || [];
        const whList: WarehouseOption[] = infraRes.data?.warehouses || [];
        const wcList: WorkCenterOption[] = infraRes.data?.work_centers || [];
        const allBoms: BOMOption[] = bomsRes.data || [];

        const convergentBoms = allBoms.filter(
          (b) => b.bom_type === "CONVERGENT_RECIPE" && b.is_active !== false
        );

        setFacilities(facList);
        setWarehouses(whList);
        setWorkCenters(wcList);
        setBoms(convergentBoms);

        const defFac = facList.find((f) => f.is_active !== false) || facList[0];
        const facId = defFac ? defFac.id : 1;
        setSelectedFacilityId(facId);

        const facWhs = whList.filter(
          (w) => w.facility_id === facId && !w.is_scrap && !w.is_scrap_warehouse
        );
        const defWh = facWhs[0] || whList[0];
        if (defWh) {
          setSourceWarehouseId(defWh.id);
          setDestWarehouseId(defWh.id);
        }

        const facWcs = wcList.filter((w) => w.facility_id === facId && w.is_active !== false);
        if (convergentBoms.length > 0) {
          const initialBoms = convergentBoms.slice(0, Math.min(2, convergentBoms.length));
          setRows(initialBoms.map((b) => buildRowFromBom(b, 1, facWcs)));
        }

        await loadBatchHistory(facId);
      } catch (err) {
        console.error("Error inicializando pantalla de Producción Masiva:", err);
      } finally {
        setLoadingInit(false);
      }
    }
    initBatchScreen();
  }, [loadBatchHistory]);

  const facilityWarehouses = warehouses.filter(
    (w) => w.facility_id === selectedFacilityId && !w.is_scrap && !w.is_scrap_warehouse
  );
  const facilityWorkCenters = workCenters.filter(
    (wc) => wc.facility_id === selectedFacilityId && wc.is_active !== false
  );
  const filteredBoms =
    sectorFilter === "ALL" ? boms : boms.filter((b) => b.sector === sectorFilter);

  const handleFacilityChange = (newFacId: number) => {
    setSelectedFacilityId(newFacId);
    const facWhs = warehouses.filter(
      (w) => w.facility_id === newFacId && !w.is_scrap && !w.is_scrap_warehouse
    );
    const defWh = facWhs[0] || warehouses[0];
    if (defWh) {
      setSourceWarehouseId(defWh.id);
      setDestWarehouseId(defWh.id);
    }

    const facWcs = workCenters.filter((w) => w.facility_id === newFacId && w.is_active !== false);
    setRows((prev) =>
      prev.map((r) => {
        const bomObj = boms.find((b) => b.id === r.bom_id);
        const matchWc =
          (bomObj?.work_center_id
            ? facWcs.find((w) => w.id === bomObj.work_center_id)
            : undefined) ||
          (bomObj ? facWcs.find((w) => w.sector === bomObj.sector) : undefined) ||
          facWcs[0];
        return {
          ...r,
          work_center_id: matchWc ? matchWc.id : 0,
        };
      })
    );
    loadBatchHistory(newFacId);
  };

  // Explosión consolidada FEFO en vivo cada vez que cambian las filas o la sede/almacén
  useEffect(() => {
    const validRows = rows.filter((r) => r.bom_id > 0 && r.planned_base_qty > 0);
    if (validRows.length === 0) {
      setPreview(null);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setLoadingPreview(true);
      try {
        const res = await api.post("/mfg/batch-runs/explode-preview", {
          facility_id: selectedFacilityId,
          source_warehouse_id: sourceWarehouseId,
          dest_warehouse_id: destWarehouseId,
          lines: validRows.map((r) => ({
            bom_id: r.bom_id,
            work_center_id: r.work_center_id > 0 ? r.work_center_id : undefined,
            scale_factor: r.scale_factor,
            planned_base_qty: r.planned_base_qty,
            actual_good_qty: r.actual_good_qty,
            natural_shrinkage_qty: r.natural_shrinkage_qty,
            explicit_damaged_qty: r.explicit_damaged_qty,
            actual_labor_hours: r.actual_labor_hours,
          })),
        });
        if (active) {
          setPreview(res.data);
        }
      } catch (err) {
        console.error("Error en explosión consolidada multi-receta:", err);
      } finally {
        if (active) setLoadingPreview(false);
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [rows, selectedFacilityId, sourceWarehouseId, destWarehouseId]);

  const handleAddRecipeRow = () => {
    const pool = filteredBoms.length > 0 ? filteredBoms : boms;
    if (pool.length === 0) return;
    // Preferir una receta que aún no esté en la grilla, o la primera disponible
    const usedIds = new Set(rows.map((r) => r.bom_id));
    const candidate = pool.find((b) => !usedIds.has(b.id)) || pool[0];
    setRows((prev) => [...prev, buildRowFromBom(candidate, 1, facilityWorkCenters)]);
  };

  const handleLoadAllSectorRecipes = () => {
    const pool = filteredBoms.length > 0 ? filteredBoms : boms;
    if (pool.length === 0) return;
    setRows(pool.map((b) => buildRowFromBom(b, 1, facilityWorkCenters)));
  };

  const handleRemoveRow = (rowKey: string) => {
    setRows((prev) => prev.filter((r) => r.rowKey !== rowKey));
  };

  const handleRowBomChange = (rowKey: string, newBomId: number) => {
    const found = boms.find((b) => b.id === newBomId);
    if (!found) return;
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowKey !== rowKey) return r;
        const rebuilt = buildRowFromBom(found, 1, facilityWorkCenters);
        return { ...rebuilt, rowKey: r.rowKey };
      })
    );
  };

  const handleRowWorkCenterChange = (rowKey: string, newWcId: number) => {
    setRows((prev) =>
      prev.map((r) => (r.rowKey === rowKey ? { ...r, work_center_id: newWcId } : r))
    );
  };

  const handleRowScaleChange = (rowKey: string, newScale: number) => {
    if (!Number.isFinite(newScale)) return;
    const validScale = Math.max(0.01, Number(newScale.toFixed(4)));
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowKey !== rowKey) return r;
        const bomObj = boms.find((b) => b.id === r.bom_id);
        const baseQty = Math.max(0.0001, Number(bomObj?.base_qty || r.base_qty || 1));
        const planned = Number((baseQty * validScale).toFixed(4));
        const shrinkPct = Number(bomObj?.expected_shrinkage_pct ?? r.expected_shrinkage_pct ?? 0);
        const discrete = isDiscreteUom(r.uom_id);
        const rawGood = Math.max(0.0001, planned * (1 - shrinkPct / 100) - r.explicit_damaged_qty);
        const goodQty = discrete ? Math.max(1, Math.round(rawGood)) : Number(rawGood.toFixed(4));
        const natShrink = Math.max(
          0,
          Number((planned - goodQty - r.explicit_damaged_qty).toFixed(4))
        );
        const stdHours = Number(
          ((Number(bomObj?.standard_labor_hours || 2.0) || 2.0) * validScale).toFixed(2)
        );
        return {
          ...r,
          scale_factor: validScale,
          planned_base_qty: planned,
          actual_good_qty: goodQty,
          natural_shrinkage_qty: natShrink,
          actual_labor_hours: stdHours,
        };
      })
    );
  };

  const handleRowPlannedQtyChange = (rowKey: string, newPlannedQty: number) => {
    if (!Number.isFinite(newPlannedQty)) return;
    const validPlanned = Math.max(0.01, Number(newPlannedQty));
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowKey !== rowKey) return r;
        const bomObj = boms.find((b) => b.id === r.bom_id);
        const baseQty = Math.max(0.0001, Number(bomObj?.base_qty || r.base_qty || 1));
        const newScale = Number((validPlanned / baseQty).toFixed(4));
        const shrinkPct = Number(bomObj?.expected_shrinkage_pct ?? r.expected_shrinkage_pct ?? 0);
        const discrete = isDiscreteUom(r.uom_id);
        const rawGood = Math.max(
          0.0001,
          validPlanned * (1 - shrinkPct / 100) - r.explicit_damaged_qty
        );
        const goodQty = discrete ? Math.max(1, Math.round(rawGood)) : Number(rawGood.toFixed(4));
        const natShrink = Math.max(
          0,
          Number((validPlanned - goodQty - r.explicit_damaged_qty).toFixed(4))
        );
        const stdHours = Number(
          ((Number(bomObj?.standard_labor_hours || 2.0) || 2.0) * newScale).toFixed(2)
        );
        return {
          ...r,
          scale_factor: newScale,
          planned_base_qty: validPlanned,
          actual_good_qty: goodQty,
          natural_shrinkage_qty: natShrink,
          actual_labor_hours: stdHours,
        };
      })
    );
  };

  const handleRowGoodQtyChange = (rowKey: string, newGoodQty: number) => {
    if (!Number.isFinite(newGoodQty)) return;
    const validGood = Math.max(0.01, Number(newGoodQty));
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowKey !== rowKey) return r;
        const natShrink = Math.max(
          0,
          Number((r.planned_base_qty - validGood - r.explicit_damaged_qty).toFixed(4))
        );
        return {
          ...r,
          actual_good_qty: validGood,
          natural_shrinkage_qty: natShrink,
        };
      })
    );
  };

  const handleRowDamagedQtyChange = (rowKey: string, newDamagedQty: number) => {
    if (!Number.isFinite(newDamagedQty)) return;
    const validDamaged = Math.max(0, Number(newDamagedQty));
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowKey !== rowKey) return r;
        const shrinkPct = Number(r.expected_shrinkage_pct || 0);
        const discrete = isDiscreteUom(r.uom_id);
        const expectedGoodBeforeDamage = r.planned_base_qty * (1 - shrinkPct / 100);
        const rawGood = Math.max(0.01, expectedGoodBeforeDamage - validDamaged);
        const goodQty = discrete ? Math.max(1, Math.round(rawGood)) : Number(rawGood.toFixed(4));
        const natShrink = Math.max(
          0,
          Number((r.planned_base_qty - goodQty - validDamaged).toFixed(4))
        );
        return {
          ...r,
          explicit_damaged_qty: validDamaged,
          actual_good_qty: goodQty,
          natural_shrinkage_qty: natShrink,
        };
      })
    );
  };

  const handleRowLaborHoursChange = (rowKey: string, newHours: number) => {
    if (!Number.isFinite(newHours)) return;
    const validHours = Math.max(0, Number(newHours.toFixed(2)));
    setRows((prev) =>
      prev.map((r) => (r.rowKey === rowKey ? { ...r, actual_labor_hours: validHours } : r))
    );
  };

  const handleExecuteBatchRun = async (
    mode: "LEAVE_IN_PROGRESS" | "COMPLETE_AND_SETTLE"
  ) => {
    const validRows = rows.filter((r) => r.bom_id > 0 && r.planned_base_qty > 0);
    if (validRows.length === 0) {
      setActionError("Agregue al menos una receta con cantidad planificada mayor a cero.");
      return;
    }

    setExecutingMode(mode);
    setActionError(null);
    try {
      const res = await api.post("/mfg/batch-runs/execute", {
        facility_id: selectedFacilityId,
        source_warehouse_id: sourceWarehouseId,
        dest_warehouse_id: destWarehouseId,
        shift,
        sector: sectorFilter,
        execution_mode: mode,
        notes:
          batchNotes.trim() ||
          `Corrida de Producción Masiva (${validRows.length} recetas — ${SHIFT_LABELS[shift] || shift})`,
        lines: validRows.map((r) => ({
          bom_id: r.bom_id,
          work_center_id: r.work_center_id > 0 ? r.work_center_id : undefined,
          scale_factor: r.scale_factor,
          planned_base_qty: r.planned_base_qty,
          actual_good_qty: r.actual_good_qty,
          natural_shrinkage_qty: r.natural_shrinkage_qty,
          explicit_damaged_qty: r.explicit_damaged_qty,
          actual_labor_hours: r.actual_labor_hours,
        })),
      });

      setExecutionResult(res.data);
      await loadBatchHistory(selectedFacilityId);
      // Re-run explode preview so updated stock is immediately reflected
      const prevRes = await api.post("/mfg/batch-runs/explode-preview", {
        facility_id: selectedFacilityId,
        source_warehouse_id: sourceWarehouseId,
        dest_warehouse_id: destWarehouseId,
        lines: validRows.map((r) => ({
          bom_id: r.bom_id,
          work_center_id: r.work_center_id > 0 ? r.work_center_id : undefined,
          scale_factor: r.scale_factor,
          planned_base_qty: r.planned_base_qty,
          actual_good_qty: r.actual_good_qty,
          natural_shrinkage_qty: r.natural_shrinkage_qty,
          explicit_damaged_qty: r.explicit_damaged_qty,
          actual_labor_hours: r.actual_labor_hours,
        })),
      });
      setPreview(prevRes.data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "No se pudo ejecutar la corrida de producción masiva.";
      setActionError(msg);
    } finally {
      setExecutingMode(null);
    }
  };

  const handlePrintActiveBatchPreview = () => {
    const activeFac = facilities.find((f) => f.id === selectedFacilityId);
    const srcWh = warehouses.find((w) => w.id === sourceWarehouseId);
    const dstWh = warehouses.find((w) => w.id === destWarehouseId);
    const rate = preview?.exchange_rate ?? 40.0;

    const ordersList = rows.map((r, idx) => {
      const bomObj = boms.find((b) => b.id === r.bom_id);
      const wcObj = workCenters.find((w) => w.id === r.work_center_id);
      const rowPrev =
        preview?.recipe_previews?.[idx]?.bom_id === r.bom_id
          ? preview.recipe_previews[idx]
          : preview?.recipe_previews?.find((p) => p.bom_id === r.bom_id);
      return {
        order_number: `PRE-OP-${String(idx + 1).padStart(2, "0")}`,
        state: "IN_PROGRESS",
        sector: bomObj?.sector || sectorFilter,
        work_center_name: rowPrev?.work_center_name || wcObj?.name || bomObj?.work_center_name || "Estación Planta",
        bom_code: rowPrev?.bom_code || bomObj?.code || "BOM",
        bom_name: rowPrev?.bom_name || bomObj?.name || "Receta",
        product_sku: rowPrev?.primary_product_sku || bomObj?.primary_product_sku || "",
        product_name:
          rowPrev?.primary_product_name ||
          bomObj?.primary_product_name ||
          bomObj?.name ||
          "Producto",
        uom_id: r.uom_id,
        scale_factor: r.scale_factor,
        planned_base_qty: r.planned_base_qty,
        actual_good_qty: r.actual_good_qty,
        natural_shrinkage_qty: r.natural_shrinkage_qty,
        explicit_damaged_qty: r.explicit_damaged_qty,
        net_production_cost_usd: rowPrev?.net_production_cost_usd || 0,
        net_production_cost_ves: rowPrev?.net_production_cost_ves || 0,
        unit_cost_usd: rowPrev?.estimated_unit_cost_usd || 0,
        unit_cost_ves: rowPrev?.estimated_unit_cost_ves || 0,
        new_wavg_cost_usd: rowPrev?.projected_new_wavg_cost_usd,
      };
    });

    setPrintingBatchRun({
      plan_number: `BORRADOR-TURNO-${new Date().toISOString().slice(0, 10)}`,
      plan_date: new Date().toISOString().slice(0, 10),
      shift,
      sector: sectorFilter,
      state: "IN_PROGRESS",
      facility_name: preview?.facility_name || activeFac?.name || `Sede #${selectedFacilityId}`,
      source_warehouse_name: preview?.source_warehouse_name || srcWh?.name || "Almacén Insumos",
      dest_warehouse_name: preview?.dest_warehouse_name || dstWh?.name || "Almacén PT",
      exchange_rate: rate,
      notes:
        batchNotes.trim() ||
        `Hoja de Consolidado de Turno (${rows.length} recetas — ${SHIFT_LABELS[shift] || shift})`,
      orders_count: ordersList.length,
      completed_orders_count: 0,
      total_direct_materials_usd: preview?.total_direct_materials_usd || 0,
      total_packaging_usd: preview?.total_packaging_usd || 0,
      total_direct_labor_mod_usd: preview?.total_direct_labor_mod_usd || 0,
      total_indirect_overhead_cif_usd: preview?.total_indirect_overhead_cif_usd || 0,
      total_explicit_waste_cost_usd: preview?.total_explicit_waste_cost_usd || 0,
      total_cost_usd: preview?.net_batch_cost_usd || 0,
      total_cost_ves: preview?.net_batch_cost_ves || 0,
      orders: ordersList,
      consolidated_inputs: (preview?.consolidated_inputs || []).map((inp) => ({
        component_variant_id: inp.component_variant_id,
        component_sku: inp.component_sku,
        component_name: inp.component_name,
        input_role: inp.input_role,
        uom_base: inp.uom_base,
        recipes_count: inp.recipes_count,
        recipe_codes: inp.recipe_codes,
        used_in_recipes: inp.used_in_recipes,
        total_required_base_qty: inp.total_required_base_qty,
        available_stock_qty: inp.available_stock_qty,
        suggested_batch_number: inp.suggested_batch_number,
        suggested_batch_expiry_date: inp.suggested_batch_expiry_date,
        unit_cost_usd: inp.unit_cost_usd,
        unit_cost_ves: inp.unit_cost_ves,
        total_cost_usd: inp.total_cost_usd,
        total_cost_ves: inp.total_cost_ves,
      })),
    });
  };

  const handlePrintExecutedBatchResult = async (execRes: BatchRunExecuteResult) => {
    setLoadingPrintPlanId(execRes.plan_id);
    try {
      const res = await api.get(`/mfg/batch-runs/${execRes.plan_id}`);
      setPrintingBatchRun(res.data);
    } catch {
      // Fallback con los datos en memoria
      setPrintingBatchRun({
        id: execRes.plan_id,
        plan_number: execRes.plan_number,
        plan_date: execRes.plan_date,
        shift: execRes.shift,
        sector: execRes.sector,
        state: execRes.state,
        execution_mode: execRes.execution_mode,
        facility_name: execRes.facility_name,
        source_warehouse_name: execRes.source_warehouse_name,
        dest_warehouse_name: execRes.dest_warehouse_name,
        exchange_rate: execRes.exchange_rate,
        orders_count: execRes.orders_count,
        completed_orders_count: execRes.completed_orders_count,
        total_direct_materials_usd: preview?.total_direct_materials_usd || 0,
        total_packaging_usd: preview?.total_packaging_usd || 0,
        total_direct_labor_mod_usd: preview?.total_direct_labor_mod_usd || 0,
        total_indirect_overhead_cif_usd: preview?.total_indirect_overhead_cif_usd || 0,
        total_explicit_waste_cost_usd: preview?.total_explicit_waste_cost_usd || 0,
        total_cost_usd: execRes.total_cost_usd,
        total_cost_ves: execRes.total_cost_ves,
        orders: execRes.orders_created,
        consolidated_inputs: preview?.consolidated_inputs || [],
      });
    } finally {
      setLoadingPrintPlanId(null);
    }
  };

  const handlePrintHistoryPlan = async (plan: BatchRunHistoryItem) => {
    if (plan.consolidated_inputs && plan.consolidated_inputs.length > 0) {
      setPrintingBatchRun(plan as unknown as PrintableBatchRunData);
      return;
    }
    setLoadingPrintPlanId(plan.id);
    try {
      const res = await api.get(`/mfg/batch-runs/${plan.id}`);
      setPrintingBatchRun(res.data);
    } catch {
      setPrintingBatchRun(plan as unknown as PrintableBatchRunData);
    } finally {
      setLoadingPrintPlanId(null);
    }
  };

  const handlePrintSingleOrder = async (orderId: number) => {
    setLoadingPrintOrderId(orderId);
    try {
      const res = await api.get(`/mfg/orders/${orderId}`);
      setPrintingOrder(res.data);
    } catch (err) {
      console.error("Error cargando detalle de orden para imprimir:", err);
    } finally {
      setLoadingPrintOrderId(null);
    }
  };

  const exchangeRate = preview?.exchange_rate ?? 40.0;
  const overallStatus = preview?.overall_stock_status ?? "AVAILABLE";
  const overallBadge = SEMAPHORE_BADGES[overallStatus] || SEMAPHORE_BADGES.AVAILABLE;

  return (
    <div className="p-2 sm:p-6 w-full max-w-[1440px] mx-auto space-y-6">
      {/* CABECERA HERO */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-orange-500 to-red-600"></div>
        <div className="pl-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold mb-2">
            <i className="pi pi-bolt text-xs"></i>
            NEO PRODUCCIÓN • CORRIDA MASIVA POR LOTES & EXPLOSIÓN CONSOLIDADA FEFO
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">
            Producción Masiva / Corrida por Lotes (Multi-Receta)
          </h1>
          <p className="text-slate-500 mt-1 text-sm font-medium max-w-3xl">
            Planifica múltiples fórmulas (`BOM`) en simultáneo, verifica la explosión consolidada de materia prima bajo regla FEFO sin sobre-asignar stock y ejecuta el lote completo dejándolo **En Proceso (`IN_PROGRESS`)** o **Liquidándolo Masivamente en Kardex (`COMPLETED`)**.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-stretch lg:self-center">
          <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl border border-slate-800 flex items-center gap-3 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
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
            disabled={rows.length === 0}
            onClick={handlePrintActiveBatchPreview}
            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white border border-slate-800 font-black px-4 py-3 rounded-xl transition-all text-sm shadow-sm cursor-pointer disabled:opacity-50"
          >
            <i className="pi pi-print text-orange-400"></i>
            🖨️ Imprimir Consolidado / Hoja de Turno
          </button>

          <Link
            href="/orders"
            className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold px-4 py-3 rounded-xl transition-all text-sm"
          >
            <i className="pi pi-cog"></i>
            Ver Órdenes de Producción
          </Link>
        </div>
      </div>

      {actionError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <i className="pi pi-exclamation-triangle text-base"></i>
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-xs font-bold px-2.5 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* BANNER / MODAL DE RESULTADO EXITOSO POST-EJECUCIÓN */}
      {executionResult && (
        <div className="bg-emerald-950 text-white rounded-2xl border-2 border-emerald-500/70 shadow-xl p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-emerald-800/80 pb-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0 shadow-md">
                <i className="pi pi-check-circle text-xl font-black"></i>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-mono">
                    {executionResult.plan_number}
                  </span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-400/40">
                    {executionResult.execution_mode === "COMPLETE_AND_SETTLE"
                      ? "⚡ Liquidado Masivamente en Kardex (COMPLETED)"
                      : "🛠️ Creado en Piso de Planta (IN_PROGRESS)"}
                  </span>
                  <span className="text-xs text-emerald-200 font-medium">
                    🏢 {executionResult.facility_name} • {SHIFT_LABELS[executionResult.shift] || executionResult.shift}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-white mt-1">
                  Corrida Masiva Ejecutada Exitosamente ({executionResult.orders_count}{" "}
                  {executionResult.orders_count === 1 ? "Orden Generada" : "Órdenes Generadas"})
                </h2>
                <p className="text-xs text-emerald-200/90 mt-0.5">
                  {executionResult.execution_mode === "COMPLETE_AND_SETTLE"
                    ? "Se descargaron los insumos hacia VIRT_PRODUCTION (MFG-OUT), se generaron los lotes sanitarios y se ingresaron los productos terminados (MFG-IN) actualizando el Costo Promedio Ponderado (WAVG)."
                    : "Las órdenes fueron abiertas en estado IN_PROGRESS vinculadas al Plan Masivo. Puede ajustar insumos/mermas y liquidar cada una desde la consola de Órdenes de Producción."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <div className="bg-emerald-900/70 border border-emerald-700 rounded-xl px-4 py-2 text-right font-mono">
                <span className="text-[10px] uppercase tracking-wider text-emerald-300 block font-bold">
                  Costo Neto Total Corrida
                </span>
                <span className="text-base font-black text-white">
                  ${executionResult.total_cost_usd.toFixed(2)}
                </span>
                <span className="text-xs text-emerald-300 block">
                  Bs. {executionResult.total_cost_ves.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <button
                type="button"
                disabled={loadingPrintPlanId === executionResult.plan_id}
                onClick={() => handlePrintExecutedBatchResult(executionResult)}
                className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white border border-emerald-400/50 font-black px-4 py-3 rounded-xl shadow-md transition-all text-xs cursor-pointer"
              >
                <i className="pi pi-print text-orange-400"></i>
                🖨️ Imprimir Acta de Corrida Masiva
              </button>

              <Link
                href="/orders"
                className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-black px-4 py-3 rounded-xl shadow-md transition-all text-xs"
              >
                <i className="pi pi-external-link text-xs"></i>
                Ir a Órdenes de Producción (/orders)
              </Link>

              <button
                type="button"
                onClick={() => setExecutionResult(null)}
                className="px-3 py-3 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-emerald-200 text-xs font-bold cursor-pointer"
                title="Ocultar resumen"
              >
                <i className="pi pi-times"></i>
              </button>
            </div>
          </div>

          <div
            tabIndex={0}
            role="region"
            aria-label="Órdenes generadas en la corrida masiva"
            className="overflow-x-auto rounded-xl border border-emerald-800 bg-slate-900/90"
          >
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-950 text-slate-300 uppercase text-[10px] font-bold tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Folio OP</th>
                  <th className="py-2.5 px-3">Receta / Producto</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3 text-right">Planificado vs. Bueno</th>
                  <th className="py-2.5 px-3">Lote Sanitario / Kardex</th>
                  <th className="py-2.5 px-3 text-right">Costo Neto Lote</th>
                  <th className="py-2.5 px-3 text-right">Costo Unit. / Nuevo WAVG</th>
                  <th className="py-2.5 px-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {executionResult.orders_created.map((op) => (
                  <tr key={op.id} className="hover:bg-slate-800/60">
                    <td className="py-2.5 px-3 font-mono font-black text-orange-400">
                      <Link href={`/orders/${op.id}`} className="hover:underline">
                        {op.order_number}
                      </Link>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-white">{op.product_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        [{op.bom_code}] {op.bom_name}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          op.state === "COMPLETED"
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        }`}
                      >
                        {op.state === "COMPLETED" ? "COMPLETED (Kardex)" : "IN_PROGRESS (Planta)"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      <span className="font-bold text-white">{op.actual_good_qty}</span> /{" "}
                      {op.planned_base_qty} {op.uom_id}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px]">
                      {op.generated_batch_number ? (
                        <div className="text-emerald-300 font-bold">
                          🏷️ {op.generated_batch_number}
                        </div>
                      ) : (
                        <div className="text-slate-400">Pendiente al liquidar</div>
                      )}
                      {op.picking_consumption_name && (
                        <div className="text-[10px] text-slate-400">
                          {op.picking_consumption_name} • {op.picking_output_name}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                      ${op.net_production_cost_usd.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      <div className="font-bold text-orange-300">
                        ${op.unit_cost_usd.toFixed(4)} / {op.uom_id}
                      </div>
                      {op.new_wavg_cost_usd !== undefined && (
                        <div className="text-[10px] text-emerald-300">
                          WAVG: ${op.new_wavg_cost_usd.toFixed(4)}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="inline-flex items-center justify-center gap-1.5">
                        <Link
                          href={`/orders/${op.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold"
                        >
                          <i className="pi pi-arrow-right text-[10px]"></i>
                          Abrir OP
                        </Link>
                        <button
                          type="button"
                          disabled={loadingPrintOrderId === op.id}
                          onClick={() => handlePrintSingleOrder(op.id)}
                          title={`Imprimir orden ${op.order_number}`}
                          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-orange-400 flex items-center justify-center cursor-pointer"
                        >
                          <i
                            className={`pi ${
                              loadingPrintOrderId === op.id ? "pi-spin pi-spinner" : "pi-print"
                            } text-[11px]`}
                          ></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BLOQUE 1: UBICACIÓN OPERATIVA Y TURNO DEL LOTE MASIVO */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <i className="pi pi-building text-orange-600"></i>
              1. Ubicación Operativa, Almacenes y Turno de la Corrida Masiva
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Selecciona la sucursal, almacén de descargo de materia prima (`MFG-OUT`), almacén de entrada de producto terminado (`MFG-IN`) y el turno operativo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={handlePrintActiveBatchPreview}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-black transition-all cursor-pointer disabled:opacity-50"
            >
              <i className="pi pi-print text-orange-600 text-xs"></i>
              🖨️ Imprimir Consolidado / Hoja de Turno
            </button>

            <button
              type="button"
              onClick={handleLoadAllSectorRecipes}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-black transition-all cursor-pointer"
            >
              <i className="pi pi-list text-xs"></i>
              ➕ Cargar Todas las Recetas del Sector ({filteredBoms.length})
            </button>

            <button
              type="button"
              onClick={handleAddRecipeRow}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all cursor-pointer shadow-xs"
            >
              <i className="pi pi-plus text-xs"></i>
              + Agregar Fila de Receta
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div className="flex flex-col justify-end">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 whitespace-nowrap truncate">
              🏢 Sucursal / Sede *
            </label>
            <select
              value={selectedFacilityId}
              onChange={(e) => handleFacilityChange(Number(e.target.value))}
              className="w-full h-[42px] bg-slate-50 border border-slate-300 rounded-xl px-3.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500"
            >
              {facilities.map((fac) => (
                <option key={fac.id} value={fac.id}>
                  [{fac.code}] {fac.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col justify-end">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 whitespace-nowrap truncate">
              📦 Almacén Origen Insumos (MFG-OUT) *
            </label>
            <select
              value={sourceWarehouseId}
              onChange={(e) => setSourceWarehouseId(Number(e.target.value))}
              className="w-full h-[42px] bg-slate-50 border border-slate-300 rounded-xl px-3.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500"
            >
              {(facilityWarehouses.length > 0 ? facilityWarehouses : warehouses).map((w) => (
                <option key={w.id} value={w.id}>
                  [{w.code}] {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col justify-end">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 whitespace-nowrap truncate">
              🏪 Almacén Destino PT (MFG-IN) *
            </label>
            <select
              value={destWarehouseId}
              onChange={(e) => setDestWarehouseId(Number(e.target.value))}
              className="w-full h-[42px] bg-slate-50 border border-slate-300 rounded-xl px-3.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500"
            >
              {(facilityWarehouses.length > 0 ? facilityWarehouses : warehouses).map((w) => (
                <option key={w.id} value={w.id}>
                  [{w.code}] {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col justify-end">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 whitespace-nowrap truncate">
              🕐 Turno Operativo
            </label>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              className="w-full h-[42px] bg-slate-50 border border-slate-300 rounded-xl px-3.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500"
            >
              <option value="MORNING">🌅 Mañana (Matutino)</option>
              <option value="AFTERNOON">☀️ Tarde (Vespertino)</option>
              <option value="NIGHT">🌙 Noche (Nocturno)</option>
              <option value="FULL_DAY">📅 Jornada Completa</option>
            </select>
          </div>

          <div className="flex flex-col justify-end">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 whitespace-nowrap truncate">
              🏷️ Filtro / Carga Rápida por Sector
            </label>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="w-full h-[42px] bg-slate-50 border border-slate-300 rounded-xl px-3.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500"
            >
              <option value="ALL">Todos los Sectores Convergentes</option>
              <option value="BAKERY">🥖 Panadería & Pastelería</option>
              <option value="GASTRONOMY">🍲 Cocina & Gastronomía</option>
            </select>
          </div>
        </div>

        <div className="pt-1">
          <input
            type="text"
            value={batchNotes}
            onChange={(e) => setBatchNotes(e.target.value)}
            placeholder="Notas u observaciones del Plan / Corrida Masiva (ej. Producción matutina hornos rotativos y cocina central)..."
            className="w-full h-[38px] bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-medium text-slate-700 focus:outline-none focus:border-orange-500"
          />
        </div>
      </div>

      {/* BLOQUE 2: GRILLA INTERACTIVA DE RECETAS A PRODUCIR */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="batch-recipes-grid-heading"
              className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2"
            >
              <i className="pi pi-sliders-h text-orange-600"></i>
              2. Grilla Interactiva de Recetas a Producir ({rows.length}{" "}
              {rows.length === 1 ? "Fórmula" : "Fórmulas"})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ajusta el multiplicador (`0.5x..5x`) o la cantidad total planificada. Si vas a usar **Liquidación Masiva Directa**, también puedes ajustar la cantidad buena real o merma explícita en cada fila.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {loadingPreview && (
              <span className="text-xs font-bold text-orange-600 flex items-center gap-1.5">
                <i className="pi pi-spin pi-spinner text-xs"></i>
                Recalculando explosión FEFO...
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${overallBadge.color}`}
            >
              <i className={`pi ${overallBadge.icon} text-xs`}></i>
              Semáforo Global Lote: {overallBadge.label}
            </span>
          </div>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="batch-recipes-grid-heading"
          className="overflow-x-auto"
        >
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3 min-w-[240px]">Fórmula / Receta (BOM) & Estación</th>
                <th className="py-3 px-3 min-w-[270px]">Multiplicador (`x` Receta)</th>
                <th className="py-3 px-3 text-right min-w-[130px]">Cant. Planificada</th>
                <th className="py-3 px-3 text-right min-w-[130px]">Cant. Buena Real</th>
                <th className="py-3 px-3 text-right min-w-[140px]">Merma (Térm / Dañada)</th>
                <th className="py-3 px-3 text-right min-w-[150px]">Costo Lote & Unitario</th>
                <th className="py-3 px-3 text-right min-w-[130px]">Nuevo WAVG ($)</th>
                <th className="py-3 px-3 text-center min-w-[120px]">Stock Insumos</th>
                <th className="py-3 px-3 text-center w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loadingInit ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    Cargando catálogo de recetas y estaciones...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500 space-y-3">
                    <div>
                      No hay recetas en la corrida actual. Agrega una receta para configurar la tanda.
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={handleAddRecipeRow}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                      >
                        <i className="pi pi-plus text-xs"></i>
                        + Agregar Receta a la Lista
                      </button>
                      <button
                        type="button"
                        onClick={handleLoadAllSectorRecipes}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 transition-all cursor-pointer"
                      >
                        ➕ Cargar Todas las Recetas del Sector
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const rowPrev =
                    preview?.recipe_previews?.[idx]?.bom_id === row.bom_id
                      ? preview.recipe_previews[idx]
                      : preview?.recipe_previews?.find((p) => p.bom_id === row.bom_id);
                  const rowBomOptions = filteredBoms.some((b) => b.id === row.bom_id)
                    ? filteredBoms
                    : boms.filter(
                        (b) =>
                          b.id === row.bom_id ||
                          filteredBoms.some((fb) => fb.id === b.id)
                      );
                  const sem =
                    SEMAPHORE_BADGES[rowPrev?.stock_semaphore || "AVAILABLE"] ||
                    SEMAPHORE_BADGES.AVAILABLE;
                  return (
                    <tr key={row.rowKey} className="hover:bg-slate-50/80 transition-colors align-top">
                      {/* Receta y Estación */}
                      <td className="py-3 px-3 space-y-1.5">
                        <select
                          value={row.bom_id}
                          onChange={(e) => handleRowBomChange(row.rowKey, Number(e.target.value))}
                          className="w-full h-[38px] bg-white border border-slate-300 rounded-xl px-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500"
                        >
                          {rowBomOptions.map((b) => (
                            <option key={b.id} value={b.id}>
                              [{b.code}] {b.name} (Base: {b.base_qty} {b.uom_id})
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center gap-1.5">
                          <select
                            value={row.work_center_id}
                            onChange={(e) =>
                              handleRowWorkCenterChange(row.rowKey, Number(e.target.value))
                            }
                            className="flex-1 min-w-0 h-[34px] bg-slate-50 border border-slate-200 rounded-lg px-2 text-[11px] font-semibold text-slate-600 focus:outline-none focus:border-orange-500"
                          >
                            <option value={0}>-- Estación por defecto de Receta --</option>
                            {facilityWorkCenters.map((wc) => (
                              <option key={wc.id} value={wc.id}>
                                ⚙️ [{wc.code}] {wc.name} (${wc.hourly_labor_rate.toFixed(2)}/h)
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-1 shrink-0" title="Horas de Mano de Obra Directa (MOD) para esta receta">
                            <input
                              type="number"
                              step="0.25"
                              min="0"
                              value={row.actual_labor_hours}
                              onChange={(e) =>
                                handleRowLaborHoursChange(
                                  row.rowKey,
                                  Math.max(0, Number(e.target.value))
                                )
                              }
                              className="w-16 h-[34px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 text-right text-[11px] font-mono font-bold text-slate-700 focus:outline-none focus:border-orange-500"
                            />
                            <span className="text-[10px] font-bold text-slate-400">h MOD</span>
                          </div>
                        </div>
                      </td>

                      {/* Multiplicador + Botones Rápidos grid-cols-6 */}
                      <td className="py-3 px-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 h-[38px]">
                          <div className="relative w-20 shrink-0 h-full">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-orange-600 pointer-events-none">
                              ×
                            </span>
                            <input
                              type="number"
                              step="any"
                              min="0.01"
                              value={row.scale_factor}
                              onChange={(e) =>
                                handleRowScaleChange(
                                  row.rowKey,
                                  Math.max(0.01, Number(e.target.value))
                                )
                              }
                              className="w-full h-full pl-5 pr-1.5 bg-orange-50/70 border border-orange-300 rounded-xl text-xs font-mono font-black text-orange-700 focus:outline-none focus:border-orange-500"
                            />
                          </div>
                          <div className="grid grid-cols-6 gap-1 flex-1 h-full">
                            {[0.5, 1, 1.5, 2, 3, 5].map((mult) => (
                              <button
                                key={mult}
                                type="button"
                                onClick={() => handleRowScaleChange(row.rowKey, mult)}
                                className={`h-full px-1 rounded-lg text-[10px] font-mono font-black transition-all cursor-pointer border flex items-center justify-center whitespace-nowrap ${
                                  Math.abs(row.scale_factor - mult) < 0.001
                                    ? "bg-orange-600 text-white border-orange-600 shadow-xs"
                                    : "bg-white text-slate-700 border-slate-300 hover:bg-orange-50 hover:border-orange-300"
                                }`}
                              >
                                {mult}x
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Base receta: {row.base_qty} {row.uom_id} • Merma esp: {row.expected_shrinkage_pct}%
                        </div>
                      </td>

                      {/* Cantidad Total Planificada */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            value={row.planned_base_qty}
                            onChange={(e) =>
                              handleRowPlannedQtyChange(
                                row.rowKey,
                                Math.max(0.01, Number(e.target.value))
                              )
                            }
                            className="w-24 h-[38px] bg-slate-50 border border-slate-300 rounded-xl px-2.5 text-right text-xs font-mono font-black text-slate-800 focus:outline-none focus:border-orange-500"
                          />
                          <span className="text-[10px] font-bold text-slate-500 w-8 text-left">
                            {row.uom_id}
                          </span>
                        </div>
                      </td>

                      {/* Cantidad Buena Real a Obtener */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            value={row.actual_good_qty}
                            onChange={(e) =>
                              handleRowGoodQtyChange(
                                row.rowKey,
                                Math.max(0.01, Number(e.target.value))
                              )
                            }
                            className="w-24 h-[38px] bg-emerald-50/60 border border-emerald-300 rounded-xl px-2.5 text-right text-xs font-mono font-black text-emerald-800 focus:outline-none focus:border-emerald-600"
                          />
                          <span className="text-[10px] font-bold text-slate-500 w-8 text-left">
                            {row.uom_id}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">
                          Rend:{" "}
                          {row.planned_base_qty > 0
                            ? ((row.actual_good_qty / row.planned_base_qty) * 100).toFixed(1)
                            : "100.0"}
                          %
                        </div>
                      </td>

                      {/* Merma Térmica y Merma Explícita/Dañada */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1" title="Unidades / Kg con daño explícito anormal (NIC 2 p.16)">
                          <span className="text-[10px] font-bold text-red-600">Dañ:</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={row.explicit_damaged_qty}
                            onChange={(e) =>
                              handleRowDamagedQtyChange(
                                row.rowKey,
                                Math.max(0, Number(e.target.value))
                              )
                            }
                            className="w-20 h-[34px] bg-red-50/50 border border-red-200 rounded-lg px-2 text-right text-xs font-mono font-bold text-red-700 focus:outline-none focus:border-red-500"
                          />
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 font-mono">
                          Nat/Térm: <strong>{row.natural_shrinkage_qty}</strong> {row.uom_id}
                        </div>
                      </td>

                      {/* Costo Lote & Costo Unitario */}
                      <td className="py-3 px-3 text-right font-mono">
                        {rowPrev ? (
                          <>
                            <div className="font-black text-slate-800 text-xs">
                              ${rowPrev.net_production_cost_usd.toFixed(2)}
                            </div>
                            <div className="text-[11px] font-bold text-orange-600">
                              ${rowPrev.estimated_unit_cost_usd.toFixed(4)} / {rowPrev.uom_id}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Bs.{" "}
                              {rowPrev.net_production_cost_ves.toLocaleString("es-VE", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-400">...</span>
                        )}
                      </td>

                      {/* Nuevo WAVG Proyectado */}
                      <td className="py-3 px-3 text-right font-mono">
                        {rowPrev ? (
                          <>
                            <div className="font-black text-emerald-700 text-xs">
                              ${rowPrev.projected_new_wavg_cost_usd.toFixed(4)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Actual: ${rowPrev.current_wavg_cost_usd.toFixed(4)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Stock PT: {rowPrev.current_stock_qty} {rowPrev.uom_id}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-400">...</span>
                        )}
                      </td>

                      {/* Semáforo de Stock por Fila */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${sem.color}`}
                        >
                          <i className={`pi ${sem.icon} text-[10px]`}></i>
                          {sem.label}
                        </span>
                      </td>

                      {/* Eliminar Fila */}
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(row.rowKey)}
                          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer"
                          title="Quitar receta del lote"
                        >
                          <i className="pi pi-trash text-xs"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* BLOQUE 3: EXPLOSIÓN CONSOLIDADA DE MATERIA PRIMA (FEFO GLOBAL) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="consolidated-inputs-heading"
              className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2"
            >
              <i className="pi pi-box text-orange-600"></i>
              3. Explosión Consolidada de Materia Prima y Empaque (FEFO Global)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Demanda acumulada de ingredientes sumada a través de las{" "}
              <strong>{preview?.total_recipes_count ?? rows.length}</strong> recetas seleccionadas, contrastada contra el stock disponible en{" "}
              <strong>{preview?.facility_name || "la sucursal"}</strong> con sugerencia de lote FEFO.
            </p>
          </div>

          {preview && (
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
              <div className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700">
                Mat. Directos: <strong>${preview.total_direct_materials_usd.toFixed(2)}</strong>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700">
                Empaque: <strong>${preview.total_packaging_usd.toFixed(2)}</strong>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700">
                MOD + CIF:{" "}
                <strong>
                  $
                  {(
                    preview.total_direct_labor_mod_usd +
                    preview.total_indirect_overhead_cif_usd
                  ).toFixed(2)}
                </strong>
              </div>
              <div className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white font-black">
                Total Lote Masivo: ${preview.total_batch_cost_usd.toFixed(2)} (Bs.{" "}
                {preview.total_batch_cost_ves.toLocaleString("es-VE", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                )
              </div>
            </div>
          )}
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="consolidated-inputs-heading"
          className="overflow-x-auto"
        >
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">[SKU] Insumo / Materia Prima</th>
                <th className="py-3 px-4">Recetas que lo Usan</th>
                <th className="py-3 px-4 text-right">Cant. Total Requerida</th>
                <th className="py-3 px-4 text-right">Stock Disponible Sede</th>
                <th className="py-3 px-4 text-right">Diferencia / Holgura</th>
                <th className="py-3 px-4">Lote FEFO Sugerido</th>
                <th className="py-3 px-4 text-right">Costo Subtotal ($ / Bs)</th>
                <th className="py-3 px-4 text-center">Semáforo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {!preview || preview.consolidated_inputs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    Seleccione al menos una receta para visualizar la explosión consolidada de insumos.
                  </td>
                </tr>
              ) : (
                preview.consolidated_inputs.map((inp) => {
                  const sem =
                    SEMAPHORE_BADGES[inp.availability_status] || SEMAPHORE_BADGES.AVAILABLE;
                  return (
                    <tr
                      key={inp.component_variant_id}
                      className="hover:bg-slate-50/90 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">{inp.component_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                          <span>SKU: {inp.component_sku}</span>
                          <span>•</span>
                          <span className="uppercase">{inp.input_role}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black border ${
                              inp.recipes_count > 1
                                ? "bg-purple-50 text-purple-700 border-purple-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            {inp.recipes_count}{" "}
                            {inp.recipes_count === 1 ? "receta" : "recetas comparten"}
                          </span>
                          {inp.used_in_recipes.map((u, uIdx) => (
                            <span
                              key={`${u.bom_id}-${uIdx}`}
                              className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]"
                              title={`${u.bom_name}: ${u.required_base_qty} ${u.uom_base}`}
                            >
                              {u.bom_code} ({u.required_base_qty} {u.uom_base})
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-black text-slate-800">
                        {inp.total_required_base_qty} {inp.uom_base}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-700">
                        {inp.available_stock_qty} {inp.uom_base}
                      </td>

                      <td className="py-3 px-4 text-right font-mono">
                        {inp.balance_after_batch_qty >= 0 ? (
                          <span className="text-emerald-700 font-bold">
                            +{inp.balance_after_batch_qty} {inp.uom_base}
                          </span>
                        ) : (
                          <span className="text-red-600 font-black">
                            {inp.balance_after_batch_qty} {inp.uom_base} (Faltan {inp.shortage_qty})
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px]">
                        {inp.suggested_batch_number ? (
                          <div>
                            <span className="font-bold text-slate-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                              🏷️ {inp.suggested_batch_number}
                            </span>
                            {inp.suggested_batch_expiry_date && (
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                Vence: {inp.suggested_batch_expiry_date}{" "}
                                {inp.days_to_expiry !== null && inp.days_to_expiry !== undefined
                                  ? `(${inp.days_to_expiry}d)`
                                  : ""}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">Sin lote FEFO</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-mono">
                        <div className="font-bold text-slate-800">
                          ${inp.total_cost_usd.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Bs.{" "}
                          {inp.total_cost_ves.toLocaleString("es-VE", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${sem.color}`}
                        >
                          <i className={`pi ${sem.icon} text-[10px]`}></i>
                          {sem.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* BLOQUE 4: BARRA DE ACCIÓN CON LAS 2 OPCIONES DE EJECUCIÓN MASIVA */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-black tracking-tight flex items-center gap-2 text-white">
              <i className="pi pi-bolt text-orange-400"></i>
              4. Modalidad de Ejecución de la Corrida Masiva ({rows.length}{" "}
              {rows.length === 1 ? "Fórmula" : "Fórmulas"})
            </h2>
            <p className="text-xs text-slate-400">
              Elige cómo deseas procesar las órdenes de producción de esta corrida por lotes:
            </p>
          </div>

          {preview && (
            <div className="text-right font-mono">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-bold">
                Costo Neto Proyectado ({preview.total_recipes_count} Órdenes)
              </span>
              <span className="text-lg font-black text-emerald-400">
                ${preview.net_batch_cost_usd.toFixed(2)} USD
              </span>{" "}
              <span className="text-xs text-slate-300">
                (Bs.{" "}
                {preview.net_batch_cost_ves.toLocaleString("es-VE", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                )
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* OPCIÓN 1: DEJAR EN PROGRESO Y LIQUIDAR EN ÓRDENES (IN_PROGRESS) */}
          <button
            type="button"
            disabled={executingMode !== null || rows.length === 0}
            onClick={() => handleExecuteBatchRun("LEAVE_IN_PROGRESS")}
            className="text-left p-5 rounded-2xl bg-slate-800/90 hover:bg-slate-800 border-2 border-amber-500/50 hover:border-amber-400 transition-all cursor-pointer disabled:opacity-50 flex flex-col justify-between gap-3 group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <i className="pi pi-wrench text-lg"></i>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Opción 1 • Piso de Planta (IN_PROGRESS)
                  </span>
                  <h3 className="text-sm sm:text-base font-black text-white mt-1">
                    🛠️ Dejar en Progreso y Liquidar en Órdenes (IN_PROGRESS)
                  </h3>
                </div>
              </div>
              {executingMode === "LEAVE_IN_PROGRESS" && (
                <i className="pi pi-spin pi-spinner text-amber-400 text-lg"></i>
              )}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Crea las <strong>{rows.length}</strong> órdenes abiertas en piso sin descontar Kardex todavía, para ajustar consumos/mermas y liquidar cada una desde la ventana de <strong>Órdenes de Producción</strong>.
            </p>
          </button>

          {/* OPCIÓN 2: EJECUTAR Y LIQUIDAR MASIVAMENTE EN KARDEX (COMPLETED) */}
          <button
            type="button"
            disabled={executingMode !== null || rows.length === 0}
            onClick={() => handleExecuteBatchRun("COMPLETE_AND_SETTLE")}
            className="text-left p-5 rounded-2xl bg-gradient-to-br from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 border-2 border-orange-400/80 shadow-lg shadow-orange-600/20 transition-all cursor-pointer disabled:opacity-50 flex flex-col justify-between gap-3 group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/30 text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <i className="pi pi-bolt text-lg"></i>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-400/40">
                    Opción 2 • Liquidación Directa Kardex (COMPLETED)
                  </span>
                  <h3 className="text-sm sm:text-base font-black text-white mt-1">
                    ⚡ Ejecutar y Liquidar Masivamente en Kardex (COMPLETED)
                  </h3>
                </div>
              </div>
              {executingMode === "COMPLETE_AND_SETTLE" && (
                <i className="pi pi-spin pi-spinner text-white text-lg"></i>
              )}
            </div>
            <p className="text-xs text-orange-50 leading-relaxed">
              Ejecuta las <strong>{rows.length}</strong> fórmulas de inmediato: descarga insumos (<strong>MFG-OUT</strong>), genera lotes sanitarios, ingresa productos terminados (<strong>MFG-IN</strong>) y actualiza costos <strong>WAVG</strong> bajo NIC 2.
            </p>
          </button>
        </div>
      </div>

      {/* BLOQUE 5: HISTORIAL DE CORRIDAS / PLANES MASIVOS EJECUTADOS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h2
              id="batch-history-heading"
              className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2"
            >
              <i className="pi pi-history text-orange-600"></i>
              5. Historial Reciente de Corridas / Planes Masivos (`PLAN-YYYY-XXXX`)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Registro auditable de planes masivos ejecutados en la sucursal y acceso rápido a sus órdenes asociadas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadBatchHistory(selectedFacilityId)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
          >
            <i className={`pi pi-refresh text-xs ${loadingHistory ? "pi-spin" : ""}`}></i>
            Actualizar
          </button>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="batch-history-heading"
          className="overflow-x-auto"
        >
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Folio Plan / Fecha</th>
                <th className="py-3 px-4">Sucursal / Turno</th>
                <th className="py-3 px-4">Estado del Plan</th>
                <th className="py-3 px-4">Órdenes Vinculadas (OP)</th>
                <th className="py-3 px-4 text-right">Costo Total Plan</th>
                <th className="py-3 px-4 text-center">Impresión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loadingHistory ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Cargando historial de corridas masivas...
                  </td>
                </tr>
              ) : historyItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Aún no se han ejecutado corridas masivas en esta sucursal.
                  </td>
                </tr>
              ) : (
                historyItems.map((plan) => (
                  <tr key={plan.id} className="hover:bg-slate-50/90 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-mono font-black text-slate-800">{plan.plan_number}</div>
                      <div className="text-[11px] text-slate-400">{plan.plan_date}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-700">🏢 {plan.facility_name}</div>
                      <div className="text-[11px] text-slate-500">
                        {SHIFT_LABELS[plan.shift] || plan.shift} • Sector: {plan.sector}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          plan.state === "CLOSED"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {plan.state === "CLOSED"
                          ? `Liquidado (${plan.completed_orders_count}/${plan.orders_count} OP)`
                          : `En Piso (${plan.in_progress_orders_count} en progreso)`}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {plan.orders.map((op) => (
                          <Link
                            key={op.id}
                            href={`/orders/${op.id}`}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold border ${
                              op.state === "COMPLETED"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                            }`}
                            title={`${op.product_name} (${op.actual_good_qty} ${op.uom_id})`}
                          >
                            <span>{op.order_number}</span>
                            <span className="text-slate-400">•</span>
                            <span>{op.bom_code}</span>
                          </Link>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      <div className="font-bold text-slate-800">
                        ${plan.total_cost_usd.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Bs.{" "}
                        {plan.total_cost_ves.toLocaleString("es-VE", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        disabled={loadingPrintPlanId === plan.id}
                        onClick={() => handlePrintHistoryPlan(plan)}
                        title={
                          plan.state === "CLOSED"
                            ? `Imprimir Acta de Corrida Masiva (${plan.plan_number})`
                            : `Imprimir Hoja de Consolidado de Turno (${plan.plan_number})`
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold border border-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <i
                          className={`pi ${
                            loadingPrintPlanId === plan.id
                              ? "pi-spin pi-spinner"
                              : "pi-print text-orange-400"
                          } text-xs`}
                        ></i>
                        <span>Imprimir</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE IMPRESIÓN DE CORRIDA MASIVA / CONSOLIDADO DE TURNO */}
      <ProductionPrintModal
        open={Boolean(printingBatchRun)}
        onClose={() => setPrintingBatchRun(null)}
        mode="BATCH_RUN"
        batchRun={printingBatchRun}
      />

      {/* MODAL DE IMPRESIÓN DE ORDEN INDIVIDUAL DESDE EL BANNER */}
      <ProductionPrintModal
        open={Boolean(printingOrder)}
        onClose={() => setPrintingOrder(null)}
        mode="ORDER"
        order={printingOrder}
      />
    </div>
  );
}
