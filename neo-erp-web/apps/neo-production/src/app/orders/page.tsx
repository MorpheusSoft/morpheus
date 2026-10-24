"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { VariantCombobox, CatalogVariant } from "@/components/ui/VariantCombobox";

interface OrderListItem {
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
  actual_good_qty: number;
  natural_shrinkage_qty: number;
  explicit_waste_qty: number;
  net_production_cost_usd: number;
  net_production_cost_ves: number;
  calculated_unit_cost_usd: number;
  calculated_unit_cost_ves: number;
  total_explicit_waste_cost_usd: number;
  generated_batch_number?: string | null;
  generated_batch_expiry_date?: string | null;
  picking_consumption_id?: number | null;
  picking_output_id?: number | null;
  scheduled_date?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
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
  hourly_labor_rate: number;
  hourly_overhead_rate: number;
  overhead_per_kg: number;
  is_active?: boolean;
}

interface AdHocInputRow {
  component_variant_id: number;
  planned_qty: number;
  input_role: string;
}

interface ExplodeInputItem {
  bom_input_id?: number | null;
  component_variant_id: number;
  component_sku: string;
  component_name: string;
  input_role: string;
  recipe_qty: number;
  recipe_uom: string;
  conversion_factor_to_base: number;
  scrap_tolerance_pct: number;
  uom_base: string;
  is_discrete_uom: boolean;
  net_qty_base: number;
  raw_gross_qty_base: number;
  planned_base_qty: number;
  available_stock_qty: number;
  shortage_qty: number;
  availability_status: "AVAILABLE" | "PARTIAL" | "SHORTAGE";
  suggested_batch_id: number | null;
  suggested_batch_number: string | null;
  suggested_batch_expiry_date: string | null;
  days_to_expiry: number | null;
  unit_cost_usd: number;
  unit_cost_ves: number;
  total_cost_usd: number;
  total_cost_ves: number;
}

interface ExplodePreviewResponse {
  bom_id?: number | null;
  bom_code: string;
  bom_name: string;
  bom_type: string;
  sector: string;
  facility_id?: number;
  facility_name?: string;
  source_warehouse_id?: number;
  source_warehouse_name?: string;
  dest_warehouse_id?: number;
  dest_warehouse_name?: string;
  work_center_id?: number | null;
  work_center_code?: string | null;
  work_center_name?: string | null;
  hourly_labor_rate?: number;
  hourly_overhead_rate?: number;
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
    total_batch_cost_usd: number;
    total_batch_cost_ves: number;
    projected_unit_cost_usd: number;
    projected_unit_cost_ves: number;
    current_stock_qty: number;
    current_wavg_cost_usd: number;
    projected_new_wavg_cost_usd: number;
    projected_new_wavg_cost_ves: number;
    current_pvp_usd: number;
    current_pvp_ves: number;
    projected_margin_pct: number;
  };
  inputs: ExplodeInputItem[];
}

const STATE_BADGES: Record<string, { label: string; color: string; icon: string }> = {
  DRAFT: { label: "Borrador", color: "bg-slate-100 text-slate-700 border-slate-200", icon: "pi-file" },
  PLANNED: { label: "Planificada", color: "bg-blue-50 text-blue-700 border-blue-200", icon: "pi-calendar" },
  IN_PROGRESS: { label: "En Proceso (Planta)", color: "bg-amber-50 text-amber-700 border-amber-200", icon: "pi-spin pi-cog" },
  COMPLETED: { label: "Liquidada (Kardex)", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "pi-check-circle" },
  CANCELLED: { label: "Cancelada", color: "bg-red-50 text-red-700 border-red-200", icon: "pi-times-circle" },
};

const SECTOR_BADGES: Record<string, { label: string; color: string }> = {
  BAKERY: { label: "Panadería & Pastelería", color: "bg-amber-50 text-amber-700 border-amber-200" },
  GASTRONOMY: { label: "Cocina & Gastronomía", color: "bg-orange-50 text-orange-700 border-orange-200" },
  MEAT_PROCESSING: { label: "Cárnicos & Desposte", color: "bg-red-50 text-red-700 border-red-200" },
};

export default function ProductionOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number>(40.0);
  const [kpis, setKpis] = useState({
    total_orders: 0,
    in_progress_count: 0,
    completed_count: 0,
    cancelled_count: 0,
    completed_value_usd: 0,
    completed_value_ves: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [filterState, setFilterState] = useState<string>("");
  const [filterSector, setFilterSector] = useState<string>("");
  const [filterFacility, setFilterFacility] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  // Infraestructura Multi-Sede, Multi-Almacén y Multi-Estación (1..N por Sede)
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenterOption[]>([]);

  // Modal de Nueva Orden + Explosión FEFO
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const dialogRef = React.useRef<HTMLDialogElement | null>(null);
  const [createMode, setCreateMode] = useState<"BOM" | "ADHOC">("BOM");
  const [boms, setBoms] = useState<BOMOption[]>([]);
  const [selectedBomId, setSelectedBomId] = useState<number>(0);
  const [plannedQty, setPlannedQty] = useState<number>(100);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number>(1);
  const [selectedWorkCenterId, setSelectedWorkCenterId] = useState<number>(0);
  const [sourceWarehouseId, setSourceWarehouseId] = useState<number>(1);
  const [destWarehouseId, setDestWarehouseId] = useState<number>(1);
  const [startImmediately, setStartImmediately] = useState<boolean>(true);
  const [orderNotes, setOrderNotes] = useState<string>("");
  const [explodePreview, setExplodePreview] = useState<ExplodePreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [creatingOrder, setCreatingOrder] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Estado para modo Transformación Libre (Ad-Hoc sin fórmula)
  const [variants, setVariants] = useState<CatalogVariant[]>([]);
  const [adhocOutputVariantId, setAdhocOutputVariantId] = useState<number>(0);
  const [adhocOutputQty, setAdhocOutputQty] = useState<number>(10);
  const [adhocSector, setAdhocSector] = useState<string>("GASTRONOMY");
  const [adhocInputs, setAdhocInputs] = useState<AdHocInputRow[]>([
    { component_variant_id: 0, planned_qty: 5, input_role: "INGREDIENT" },
  ]);

  const loadInfrastructure = useCallback(async () => {
    try {
      const res = await api.get("/mfg/facilities-and-warehouses");
      const facList: FacilityOption[] = res.data?.facilities || [];
      const whList: WarehouseOption[] = res.data?.warehouses || [];
      const wcList: WorkCenterOption[] = res.data?.work_centers || [];
      setFacilities(facList);
      setWarehouses(whList);
      setWorkCenters(wcList);
      return { facList, whList, wcList };
    } catch (err) {
      console.error("Error cargando infraestructura de sedes y almacenes:", err);
      return { facList: facilities, whList: warehouses, wcList: workCenters };
    }
  }, [facilities, warehouses, workCenters]);

  useEffect(() => {
    loadInfrastructure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchCatalogVariants = useCallback(
    async (queryText: string) => {
      try {
        const res = await api.get("/mfg/catalog/variants", {
          params: { search: queryText, facility_id: selectedFacilityId, limit: 80 },
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
    [selectedFacilityId]
  );

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

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterState) params.state = filterState;
      if (filterSector) params.sector = filterSector;
      if (filterFacility) params.facility_id = filterFacility;
      if (search.trim()) params.search = search.trim();

      const res = await api.get("/mfg/orders", { params });
      setOrders(res.data.items || []);
      if (res.data.exchange_rate) setExchangeRate(res.data.exchange_rate);
      if (res.data.kpis) setKpis(res.data.kpis);
    } catch (err) {
      console.error("Error cargando órdenes de producción:", err);
    } finally {
      setLoading(false);
    }
  }, [filterState, filterSector, filterFacility, search]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const syncFacilityDependencies = useCallback(
    (
      newFacId: number,
      whList: WarehouseOption[],
      wcList: WorkCenterOption[],
      currentBom?: BOMOption | null
    ) => {
      setSelectedFacilityId(newFacId);
      const facWarehouses = whList.filter(
        (w) => w.facility_id === newFacId && !w.is_scrap && !w.is_scrap_warehouse
      );
      const facStations = wcList.filter(
        (wc) => wc.facility_id === newFacId && wc.is_active !== false
      );

      let chosenWc: WorkCenterOption | undefined;
      if (currentBom) {
        if (currentBom.work_center_id) {
          chosenWc = facStations.find((wc) => wc.id === currentBom.work_center_id);
        }
        if (!chosenWc) {
          chosenWc = facStations.find((wc) => wc.sector === currentBom.sector);
        }
      }
      if (!chosenWc && facStations.length > 0) {
        chosenWc = facStations[0];
      }

      const nextWcId = chosenWc ? chosenWc.id : 0;
      setSelectedWorkCenterId(nextWcId);

      const wipWh =
        chosenWc?.warehouse_wip_id != null
          ? facWarehouses.find((w) => w.id === chosenWc.warehouse_wip_id)
          : undefined;
      const defaultWhId = wipWh?.id || facWarehouses[0]?.id || whList[0]?.id || 1;
      setSourceWarehouseId(defaultWhId);
      setDestWarehouseId(defaultWhId);
    },
    []
  );

  const openNewOrderModal = async () => {
    setActionError(null);
    setShowCreateModal(true);
    try {
      const infraPromise =
        facilities.length === 0 || warehouses.length === 0 || workCenters.length === 0
          ? loadInfrastructure()
          : Promise.resolve({ facList: facilities, whList: warehouses, wcList: workCenters });

      const bomsPromise =
        boms.length === 0
          ? api.get("/mfg/boms").then((res) => (res.data || []) as BOMOption[])
          : Promise.resolve(boms);

      const [{ facList, whList, wcList }, loadedBoms] = await Promise.all([
        infraPromise,
        bomsPromise,
      ]);

      if (boms.length === 0 && loadedBoms.length > 0) {
        setBoms(loadedBoms);
      }

      const defaultFacId =
        filterFacility && Number(filterFacility) > 0
          ? Number(filterFacility)
          : facList[0]?.id || 1;

      const activeBom =
        loadedBoms.find((b) => b.id === selectedBomId) ||
        loadedBoms.find((b) => b.bom_type === "CONVERGENT_RECIPE") ||
        loadedBoms[0] ||
        null;

      if (activeBom && !selectedBomId) {
        setSelectedBomId(activeBom.id);
        setPlannedQty(activeBom.base_qty || 100);
      }

      syncFacilityDependencies(defaultFacId, whList, wcList, activeBom);

      const vRes = await api.get("/mfg/catalog/variants", {
        params: { facility_id: defaultFacId, limit: 150 },
      });
      const vList: CatalogVariant[] = vRes.data.items || [];
      setVariants(vList);
      if (vList.length > 0) {
        setAdhocOutputVariantId((prev) => prev || vList[0].id);
        setAdhocInputs((prev) =>
          prev.length === 1 && prev[0].component_variant_id === 0
            ? [
                {
                  component_variant_id: vList[Math.min(1, vList.length - 1)].id,
                  planned_qty: 5,
                  input_role: "INGREDIENT",
                },
              ]
            : prev
        );
      }
    } catch (err) {
      console.error("Error inicializando catálogo de Nueva Orden:", err);
    }
  };

  const handleFacilitySelectChange = async (newFacId: number) => {
    const currentBom = boms.find((b) => b.id === selectedBomId) || null;
    syncFacilityDependencies(newFacId, warehouses, workCenters, currentBom);
    try {
      const selectedIds = Array.from(
        new Set(
          [adhocOutputVariantId, ...adhocInputs.map((i) => i.component_variant_id)].filter(
            (id) => id > 0
          )
        )
      );
      const [baseRes, extraRes] = await Promise.all([
        api.get("/mfg/catalog/variants", {
          params: { facility_id: newFacId, limit: 150 },
        }),
        selectedIds.length > 0
          ? api.get("/mfg/catalog/variants", {
              params: { facility_id: newFacId, ids: selectedIds.join(","), limit: 150 },
            })
          : Promise.resolve({ data: { items: [] } }),
      ]);
      const fetched: CatalogVariant[] = baseRes.data.items || [];
      const extraFetched: CatalogVariant[] = extraRes.data.items || [];
      if (fetched.length > 0 || extraFetched.length > 0) {
        const map = new Map<number, CatalogVariant>();
        for (const v of fetched) map.set(v.id, v);
        for (const v of extraFetched) map.set(v.id, v);
        setVariants(Array.from(map.values()));
      }
    } catch (err) {
      console.error("Error actualizando catálogo por sucursal:", err);
    }
  };

  const handleWorkCenterSelectChange = (newWcId: number) => {
    setSelectedWorkCenterId(newWcId);
    if (newWcId > 0) {
      const wcObj = workCenters.find((w) => w.id === newWcId);
      if (wcObj?.warehouse_wip_id) {
        const whMatchesFac = warehouses.some(
          (w) => w.id === wcObj.warehouse_wip_id && w.facility_id === selectedFacilityId
        );
        if (whMatchesFac) {
          setSourceWarehouseId(wcObj.warehouse_wip_id);
        }
      }
    }
  };

  useEffect(() => {
    if (!showCreateModal) return;
    let active = true;
    async function runExplode() {
      if (createMode === "BOM") {
        if (!selectedBomId || plannedQty <= 0) {
          setExplodePreview(null);
          return;
        }
        setLoadingPreview(true);
        try {
          const res = await api.post("/mfg/orders/explode-preview", {
            bom_id: selectedBomId,
            planned_base_qty: plannedQty,
            facility_id: selectedFacilityId,
            work_center_id: selectedWorkCenterId > 0 ? selectedWorkCenterId : undefined,
            source_warehouse_id: sourceWarehouseId,
            dest_warehouse_id: destWarehouseId,
          });
          if (active) {
            setExplodePreview(res.data);
          }
        } catch (err) {
          console.error("Error en explosión FEFO:", err);
        } finally {
          if (active) setLoadingPreview(false);
        }
      } else {
        const validInputs = adhocInputs.filter(
          (i) => i.component_variant_id > 0 && i.planned_qty > 0
        );
        if (!adhocOutputVariantId || adhocOutputQty <= 0 || validInputs.length === 0) {
          setExplodePreview(null);
          return;
        }
        setLoadingPreview(true);
        try {
          const res = await api.post("/mfg/orders/explode-preview", {
            bom_id: null,
            planned_base_qty: adhocOutputQty,
            facility_id: selectedFacilityId,
            source_warehouse_id: sourceWarehouseId,
            dest_warehouse_id: destWarehouseId,
            work_center_id: selectedWorkCenterId > 0 ? selectedWorkCenterId : undefined,
            sector: adhocSector,
            order_type: "CONVERGENT_BATCH",
            inputs: validInputs.map((inp) => ({
              component_variant_id: inp.component_variant_id,
              planned_qty: inp.planned_qty,
              input_role: inp.input_role,
            })),
            outputs: [
              {
                output_variant_id: adhocOutputVariantId,
                planned_qty: adhocOutputQty,
                output_type: "PRIMARY_PRODUCT",
                cost_allocation_method: "PERCENTAGE",
                cost_allocation_pct: 100,
              },
            ],
          });
          if (active) {
            setExplodePreview(res.data);
          }
        } catch (err) {
          console.error("Error en explosión FEFO Ad-Hoc:", err);
        } finally {
          if (active) setLoadingPreview(false);
        }
      }
    }
    const timer = setTimeout(runExplode, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    showCreateModal,
    createMode,
    selectedBomId,
    plannedQty,
    selectedFacilityId,
    selectedWorkCenterId,
    sourceWarehouseId,
    destWarehouseId,
    adhocOutputVariantId,
    adhocOutputQty,
    adhocSector,
    adhocInputs,
  ]);

  const handleBomSelectChange = (bomId: number) => {
    setSelectedBomId(bomId);
    const found = boms.find((b) => b.id === bomId);
    if (found) {
      setPlannedQty(found.base_qty || 100);
      const facStations = workCenters.filter(
        (wc) => wc.facility_id === selectedFacilityId && wc.is_active !== false
      );
      const matchWc =
        (found.work_center_id
          ? facStations.find((wc) => wc.id === found.work_center_id)
          : undefined) || facStations.find((wc) => wc.sector === found.sector);
      if (matchWc) {
        setSelectedWorkCenterId(matchWc.id);
        if (matchWc.warehouse_wip_id) {
          const whOk = warehouses.some(
            (w) => w.id === matchWc.warehouse_wip_id && w.facility_id === selectedFacilityId
          );
          if (whOk) {
            setSourceWarehouseId(matchWc.warehouse_wip_id);
          }
        }
      }
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingOrder(true);
    setActionError(null);
    try {
      if (createMode === "BOM") {
        if (!selectedBomId || plannedQty <= 0) {
          setCreatingOrder(false);
          return;
        }
        const res = await api.post("/mfg/orders", {
          bom_id: selectedBomId,
          facility_id: selectedFacilityId,
          work_center_id: selectedWorkCenterId > 0 ? selectedWorkCenterId : undefined,
          source_warehouse_id: sourceWarehouseId,
          dest_warehouse_id: destWarehouseId,
          planned_base_qty: plannedQty,
          start_immediately: startImmediately,
          notes: orderNotes.trim() || undefined,
        });
        setShowCreateModal(false);
        if (res.data.order_type === "MEAT_DISASSEMBLY") {
          router.push(`/butchery/${res.data.id}`);
        } else {
          router.push(`/orders/${res.data.id}`);
        }
      } else {
        const validInputs = adhocInputs.filter(
          (i) => i.component_variant_id > 0 && i.planned_qty > 0
        );
        if (!adhocOutputVariantId || adhocOutputQty <= 0 || validInputs.length === 0) {
          setActionError(
            "Seleccione el producto resultante y al menos 1 insumo a consumir con cantidad mayor a cero."
          );
          setCreatingOrder(false);
          return;
        }
        const res = await api.post("/mfg/orders", {
          bom_id: null,
          facility_id: selectedFacilityId,
          source_warehouse_id: sourceWarehouseId,
          dest_warehouse_id: destWarehouseId,
          work_center_id: selectedWorkCenterId > 0 ? selectedWorkCenterId : undefined,
          sector: adhocSector,
          order_type: "CONVERGENT_BATCH",
          planned_base_qty: adhocOutputQty,
          start_immediately: startImmediately,
          notes: orderNotes.trim() || "Transformación Libre de Materiales (Ad-Hoc)",
          inputs: validInputs.map((inp) => ({
            component_variant_id: inp.component_variant_id,
            planned_qty: inp.planned_qty,
            input_role: inp.input_role,
          })),
          outputs: [
            {
              output_variant_id: adhocOutputVariantId,
              planned_qty: adhocOutputQty,
              output_type: "PRIMARY_PRODUCT",
              cost_allocation_method: "PERCENTAGE",
              cost_allocation_pct: 100,
            },
          ],
        });
        setShowCreateModal(false);
        router.push(`/orders/${res.data.id}`);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "No se pudo crear la Orden de Producción.";
      setActionError(msg);
    } finally {
      setCreatingOrder(false);
    }
  };

  const facilityWarehouses = warehouses.filter(
    (w) => w.facility_id === selectedFacilityId && !w.is_scrap && !w.is_scrap_warehouse
  );
  const facilityWorkCenters = workCenters.filter(
    (wc) => wc.facility_id === selectedFacilityId && wc.is_active !== false
  );

  return (
    <div className="p-2 sm:p-6 w-full max-w-[1440px] mx-auto space-y-6">
      {/* CABECERA */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-orange-500 to-red-600"></div>
        <div className="pl-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold mb-2">
            <i className="pi pi-cog text-xs"></i>
            FASE 2 & 3 • EJECUCIÓN DE PLANTA, LOTES FEFO Y LIQUIDACIÓN NIC 2
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">
            Órdenes de Producción y Transformación
          </h1>
          <p className="text-slate-500 mt-1 text-sm font-medium max-w-2xl">
            Explosión de materiales bajo regla FEFO, descargo a piso (`VIRT_PRODUCTION`), control de merma térmica vs. merma anormal y cargo de producto terminado con actualización de Costo Promedio Ponderado (`WAVG`).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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

          <Link
            href="/butchery"
            className="inline-flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold px-4 py-3 rounded-xl transition-all text-sm"
          >
            <i className="pi pi-percentage"></i>
            Sala de Desposte
          </Link>

          <button
            type="button"
            onClick={openNewOrderModal}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold px-5 py-3 rounded-xl shadow-md shadow-orange-500/20 transition-all text-sm cursor-pointer"
          >
            <i className="pi pi-plus-circle"></i>
            Nueva Orden de Producción (FEFO)
          </button>
        </div>
      </div>

      {/* TARJETAS KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <i className="pi pi-list text-lg"></i>
            </div>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
              Histórico Activo
            </span>
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Total Órdenes (OP)
          </span>
          <div className="text-3xl font-black text-slate-800 mt-1">{kpis.total_orders}</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <i className="pi pi-cog text-lg"></i>
            </div>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
              Piso de Planta
            </span>
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            En Proceso / Planificadas
          </span>
          <div className="text-3xl font-black text-amber-600 mt-1">{kpis.in_progress_count}</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <i className="pi pi-check-circle text-lg"></i>
            </div>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
              Kardex Sellado
            </span>
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Órdenes Liquidadas
          </span>
          <div className="text-3xl font-black text-emerald-600 mt-1">{kpis.completed_count}</div>
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
            Valor Liquidado a Inventario
          </span>
          <div className="text-2xl font-black text-slate-800 mt-1 font-mono">
            ${kpis.completed_value_usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs font-bold text-slate-500 font-mono">
            Bs. {kpis.completed_value_ves.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { value: "", label: "Todos los Estados" },
            { value: "IN_PROGRESS", label: "En Proceso" },
            { value: "PLANNED", label: "Planificadas" },
            { value: "COMPLETED", label: "Liquidadas (Kardex)" },
            { value: "CANCELLED", label: "Canceladas" },
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

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterFacility}
            onChange={(e) => setFilterFacility(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-orange-500"
          >
            <option value="">🏢 Todas las Sucursales / Sedes</option>
            {facilities.map((fac) => (
              <option key={fac.id} value={String(fac.id)}>
                🏢 [{fac.code}] {fac.name}
              </option>
            ))}
          </select>

          <select
            value={filterSector}
            onChange={(e) => setFilterSector(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-orange-500"
          >
            <option value="">Todos los Sectores</option>
            <option value="BAKERY">Panadería & Pastelería</option>
            <option value="GASTRONOMY">Cocina & Gastronomía</option>
            <option value="MEAT_PROCESSING">Cárnicos & Desposte</option>
          </select>

          <div className="relative flex-1 sm:w-64">
            <i className="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar OP, receta o código..."
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>
      </div>

      {/* TABLA PRINCIPAL DE ÓRDENES DE PRODUCCIÓN */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div tabIndex={0} role="region" aria-label="Listado de Órdenes de Producción" className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">Folio OP / Lote</th>
                <th className="py-3.5 px-4">Producto / Fórmula</th>
                <th className="py-3.5 px-4">Sucursal / Estación</th>
                <th className="py-3.5 px-4">Estado</th>
                <th className="py-3.5 px-4 text-right">Meta vs. Bueno</th>
                <th className="py-3.5 px-4 text-right">Mermas (Nat / Anorm)</th>
                <th className="py-3.5 px-4 text-right">Costo Neto (USD / Bs)</th>
                <th className="py-3.5 px-4 text-right">Costo Unit. Liquidado</th>
                <th className="py-3.5 px-4 text-center">Consola</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Cargando órdenes de producción...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No se encontraron órdenes de producción con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                orders.map((op) => {
                  const st = STATE_BADGES[op.state] || STATE_BADGES.DRAFT;
                  const sec = SECTOR_BADGES[op.sector] || {
                    label: op.sector,
                    color: "bg-slate-100 text-slate-700 border-slate-200",
                  };
                  const consoleHref = op.order_type === "MEAT_DISASSEMBLY" ? `/butchery/${op.id}` : `/orders/${op.id}`;
                  return (
                    <tr key={op.id} className="hover:bg-slate-50/90 transition-colors">
                      <td className="py-3.5 px-4">
                        <Link
                          href={consoleHref}
                          className="font-mono text-xs font-black text-orange-600 hover:underline block"
                        >
                          {op.order_number}
                        </Link>
                        {op.generated_batch_number ? (
                          <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <i className="pi pi-qrcode text-[9px]"></i>
                            {op.generated_batch_number}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 mt-0.5">Pendiente de lote</div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{op.primary_product_name}</div>
                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                          {op.bom_id === null || op.bom_code === "TRANSF-LIBRE" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-bold text-[10px]">
                              ⚡ Transformación Libre
                            </span>
                          ) : (
                            <span className="font-mono font-semibold">{op.bom_code}</span>
                          )}
                          <span>• SKU: {op.primary_product_sku}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            🏢 {op.facility_name || `Sede #${op.facility_id}`}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${sec.color}`}>
                            {sec.label}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 mt-1 font-semibold">
                          ⚙️ {op.work_center_name || "Estación General"}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${st.color}`}>
                          <i className={`pi ${st.icon} text-[11px]`}></i>
                          {st.label}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono">
                        <div className="font-bold text-slate-800">
                          {op.actual_good_qty} / {op.planned_base_qty} {op.uom_id}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Rend: {op.planned_base_qty > 0 ? ((op.actual_good_qty / op.planned_base_qty) * 100).toFixed(1) : "100.0"}%
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-xs">
                        <div className="text-slate-600">
                          Nat: <span className="font-bold">{op.natural_shrinkage_qty}</span> {op.uom_id}
                        </div>
                        {op.explicit_waste_qty > 0 ? (
                          <div className="text-red-600 font-bold">
                            Anorm: {op.explicit_waste_qty} {op.uom_id} (${op.total_explicit_waste_cost_usd.toFixed(2)})
                          </div>
                        ) : (
                          <div className="text-emerald-600 text-[11px]">Sin daño explícito</div>
                        )}
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
                          href={consoleHref}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                            op.state === "COMPLETED"
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                              : "bg-gradient-to-r from-orange-500 to-red-600 text-white hover:from-orange-600 hover:to-red-700 shadow-sm"
                          }`}
                        >
                          <i className={`pi ${op.state === "COMPLETED" ? "pi-eye" : "pi-bolt"} text-xs`}></i>
                          {op.order_type === "MEAT_DISASSEMBLY"
                            ? op.state === "COMPLETED"
                              ? "Ver Desposte NIC 2"
                              : "Liquidar Desposte"
                            : op.state === "COMPLETED"
                            ? "Ver Liquidación"
                            : "Ejecutar / Liquidar"}
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

      {/* MODAL DE NUEVA ORDEN CON EXPLOSIÓN DE MATERIALES FEFO EN VIVO */}
      <dialog
        ref={dialogRef}
        aria-labelledby="new-order-dialog-title"
        onClose={() => setShowCreateModal(false)}
        {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
        className="m-auto p-0 bg-transparent border-0 w-full max-w-5xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm"
      >
        {showCreateModal && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-h-[92vh] flex flex-col overflow-hidden text-left">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                  <i className="pi pi-bolt text-white"></i>
                </div>
                <div>
                  <h2 id="new-order-dialog-title" className="text-lg font-black tracking-tight">
                    Nueva Orden de Producción • Explosión FEFO en Vivo
                  </h2>
                  <p className="text-xs text-slate-400">
                    Verifica disponibilidad de stock en almacén, asignación de lotes FEFO y proyección de costo promedio ponderado (NIC 2).
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
            <form onSubmit={handleCreateOrder} className="flex-1 overflow-y-auto p-6 space-y-6">
              {actionError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
                  <i className="pi pi-exclamation-triangle"></i>
                  {actionError}
                </div>
              )}

              {/* BLOQUE DESTACADO: UBICACIÓN OPERATIVA EN PLANTA (SUCURSAL, ESTACIÓN 1..N Y ALMACENES) */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <i className="pi pi-building text-orange-600 text-xs"></i>
                    Ubicación Operativa en Planta (Sucursal, Estación 1..N y Almacenes)
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {facilityWorkCenters.length} {facilityWorkCenters.length === 1 ? "estación disponible" : "estaciones disponibles"} •{" "}
                    {facilityWarehouses.length} {facilityWarehouses.length === 1 ? "almacén" : "almacenes"} en la sucursal
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      🏢 Sucursal / Sede *
                    </label>
                    <select
                      value={selectedFacilityId}
                      onChange={(e) => handleFacilitySelectChange(Number(e.target.value))}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500"
                    >
                      {facilities.map((fac) => (
                        <option key={fac.id} value={fac.id}>
                          [{fac.code}] {fac.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      ⚙️ Estación / Centro ({facilityWorkCenters.length} en Sede)
                    </label>
                    <select
                      value={selectedWorkCenterId}
                      onChange={(e) => handleWorkCenterSelectChange(Number(e.target.value))}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500"
                    >
                      <option value={0}>
                        {createMode === "BOM"
                          ? "-- Estación por defecto de Receta / Sede --"
                          : "-- Sin MOD/CIF Fijo ($0.00/h) --"}
                      </option>
                      {facilityWorkCenters.map((wc) => (
                        <option key={wc.id} value={wc.id}>
                          [{wc.code}] {wc.name} — MOD ${wc.hourly_labor_rate.toFixed(2)}/h | CIF ${wc.hourly_overhead_rate.toFixed(2)}/h
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      📦 Almacén Origen Insumos (MFG-OUT) *
                    </label>
                    <select
                      value={sourceWarehouseId}
                      onChange={(e) => setSourceWarehouseId(Number(e.target.value))}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500"
                    >
                      {(facilityWarehouses.length > 0 ? facilityWarehouses : warehouses).map((w) => (
                        <option key={w.id} value={w.id}>
                          [{w.code}] {w.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      🏪 Almacén Destino PT (MFG-IN) *
                    </label>
                    <select
                      value={destWarehouseId}
                      onChange={(e) => setDestWarehouseId(Number(e.target.value))}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500"
                    >
                      {(facilityWarehouses.length > 0 ? facilityWarehouses : warehouses).map((w) => (
                        <option key={w.id} value={w.id}>
                          [{w.code}] {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Selector de Modalidad: Con Fórmula BOM vs Transformación Libre (Ad-Hoc) */}
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
                  <span>📋 Con Fórmula / Receta (BOM)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreateMode("ADHOC")}
                  className={`py-2.5 px-4 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    createMode === "ADHOC"
                      ? "bg-gradient-to-r from-purple-600 to-orange-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span>⚡ Transformación Libre (Sin Fórmula)</span>
                </button>
              </div>

              {createMode === "BOM" ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Fórmula / Receta Maestra (BOM)
                    </label>
                    <select
                      value={selectedBomId}
                      onChange={(e) => handleBomSelectChange(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-orange-500"
                    >
                      {boms.map((b) => (
                        <option key={b.id} value={b.id}>
                          [{b.code}] {b.name} — Base: {b.base_qty} {b.uom_id} ({b.sector})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Cantidad Meta a Producir ({explodePreview?.uom_id || "UND/KG"})
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={plannedQty}
                      onChange={(e) => setPlannedQty(Math.max(0.01, Number(e.target.value)))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono font-black text-orange-600 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4 p-4 rounded-2xl bg-purple-50/40 border border-purple-200/80">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-black text-purple-800 uppercase tracking-wider block">
                        ⚡ Transformación Libre de Materiales (Sin Receta Previa)
                      </span>
                      <span className="text-[11px] text-slate-600">
                        Selecciona cualquier producto resultante del catálogo y los insumos reales a descargar por Kardex (`VIRT_PRODUCTION`).
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-7">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Producto Resultante a Obtener (Salida PT)
                      </label>
                      <VariantCombobox
                        value={adhocOutputVariantId}
                        variants={variants}
                        onChange={(vid) => setAdhocOutputVariantId(vid)}
                        onSearchCatalog={searchCatalogVariants}
                        placeholder="Buscar producto resultante..."
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Cant. Meta ({explodePreview?.uom_id || "UND/KG"})
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        value={adhocOutputQty}
                        onChange={(e) => setAdhocOutputQty(Math.max(0.01, Number(e.target.value)))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-mono font-black text-orange-600"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Sector Operativo
                      </label>
                      <select
                        value={adhocSector}
                        onChange={(e) => setAdhocSector(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-2.5 text-xs font-bold text-slate-700"
                      >
                        <option value="GASTRONOMY">Cocina & Gastronomía</option>
                        <option value="BAKERY">Panadería & Pastelería</option>
                        <option value="MEAT_PROCESSING">Cárnicos & Porcionado</option>
                      </select>
                    </div>
                  </div>

                  {/* Lista dinámica de insumos Ad-Hoc */}
                  <div className="space-y-2 pt-2 border-t border-purple-200/60">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Insumos / Materias Primas a Consumir (1..N)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAdhocInputs((prev) => [
                            ...prev,
                            {
                              component_variant_id: variants[0]?.id || 0,
                              planned_qty: 1,
                              input_role: "INGREDIENT",
                            },
                          ])
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                      >
                        <i className="pi pi-plus text-[10px]"></i>
                        Añadir Insumo
                      </button>
                    </div>

                    <div className="space-y-2">
                      {adhocInputs.map((row, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-xl border border-slate-200"
                        >
                          <div className="sm:col-span-7">
                            <VariantCombobox
                              value={row.component_variant_id}
                              variants={variants}
                              compact
                              onChange={(vid) =>
                                setAdhocInputs((prev) =>
                                  prev.map((r, i) =>
                                    i === idx ? { ...r, component_variant_id: vid } : r
                                  )
                                )
                              }
                              onSearchCatalog={searchCatalogVariants}
                              placeholder="Seleccionar insumo o empaque..."
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <input
                              type="number"
                              step="any"
                              min="0.0001"
                              value={row.planned_qty}
                              onChange={(e) =>
                                setAdhocInputs((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? { ...r, planned_qty: Math.max(0.0001, Number(e.target.value)) }
                                      : r
                                  )
                                )
                              }
                              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 text-right"
                              placeholder="Cant."
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <select
                              value={row.input_role}
                              onChange={(e) =>
                                setAdhocInputs((prev) =>
                                  prev.map((r, i) =>
                                    i === idx ? { ...r, input_role: e.target.value } : r
                                  )
                                )
                              }
                              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700"
                            >
                              <option value="INGREDIENT">INGREDIENT</option>
                              <option value="PACKAGING">PACKAGING</option>
                            </select>
                          </div>
                          <div className="sm:col-span-1 text-right">
                            <button
                              type="button"
                              disabled={adhocInputs.length <= 1}
                              onClick={() =>
                                setAdhocInputs((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 cursor-pointer"
                              title="Eliminar insumo"
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

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2.5 bg-orange-50/70 border border-orange-200 rounded-xl px-3.5 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={startImmediately}
                    onChange={(e) => setStartImmediately(e.target.checked)}
                    className="rounded text-orange-600 focus:ring-orange-500"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    Iniciar en Piso Inmediatamente (`IN_PROGRESS`)
                  </span>
                </label>

                {explodePreview?.work_center_name && (
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                    ⚙️ Estación Activa:{" "}
                    <strong className="text-slate-900">{explodePreview.work_center_name}</strong>{" "}
                    (MOD ${(explodePreview.hourly_labor_rate ?? 0).toFixed(2)}/h | CIF $
                    {(explodePreview.hourly_overhead_rate ?? 0).toFixed(2)}/h)
                  </span>
                )}
              </div>

              {/* SEMÁFORO Y RESUMEN DE EXPLOSIÓN FEFO */}
              {loadingPreview ? (
                <div className="p-8 text-center text-slate-400 text-sm bg-slate-50 rounded-2xl border border-slate-200">
                  Calculando explosión de materiales y lotes FEFO...
                </div>
              ) : explodePreview ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 text-white p-4 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                          explodePreview.stock_semaphore === "AVAILABLE"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : explodePreview.stock_semaphore === "PARTIAL"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            : "bg-red-500/20 text-red-300 border border-red-500/40"
                        }`}
                      >
                        Semáforo Stock: {explodePreview.stock_semaphore}
                      </span>
                      <span className="text-xs text-slate-300">
                        Factor Escala: <strong className="text-white">{explodePreview.scale_factor}x</strong> • Salida Buena Esp:{" "}
                        <strong className="text-emerald-400">
                          {explodePreview.expected_good_qty} {explodePreview.uom_id}
                        </strong>{" "}
                        (Merma Térmica: {explodePreview.expected_natural_shrinkage_qty} {explodePreview.uom_id})
                      </span>
                    </div>

                    <div className="text-right font-mono">
                      <div className="text-xs text-slate-400">
                        Costo Proyectado Lote:{" "}
                        <strong className="text-white">${explodePreview.cost_projection.total_batch_cost_usd.toFixed(2)}</strong> (Bs.{" "}
                        {explodePreview.cost_projection.total_batch_cost_ves.toLocaleString("es-VE", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                        )
                      </div>
                      <div className="text-xs text-orange-400 font-bold">
                        Unitario: ${explodePreview.cost_projection.projected_unit_cost_usd.toFixed(4)} / {explodePreview.uom_id} • Nuevo WAVG: $
                        {explodePreview.cost_projection.projected_new_wavg_cost_usd.toFixed(4)}
                      </div>
                    </div>
                  </div>

                  {/* Tabla de Insumos Explotados con FEFO */}
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label="Tabla de insumos explotados con lotes FEFO"
                    className="border border-slate-200 rounded-xl overflow-x-auto"
                  >
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                          <th className="py-2.5 px-3">Insumo / SKU</th>
                          <th className="py-2.5 px-3 text-right">Cant. Bruta Requerida</th>
                          <th className="py-2.5 px-3 text-right">Stock Almacén</th>
                          <th className="py-2.5 px-3">Lote FEFO Sugerido</th>
                          <th className="py-2.5 px-3 text-center">Disponibilidad</th>
                          <th className="py-2.5 px-3 text-right">Subtotal (USD / Bs)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {explodePreview.inputs.map((inp, idx) => (
                          <tr key={inp.bom_input_id ?? `adhoc-${inp.component_variant_id}-${idx}`} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-800">{inp.component_name}</div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                {inp.component_sku} • {inp.input_role}
                                {inp.scrap_tolerance_pct > 0 ? ` • Merma Limpieza: ${inp.scrap_tolerance_pct}%` : ""}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                              {inp.planned_base_qty} {inp.uom_base}
                              {inp.is_discrete_uom && (
                                <span className="block text-[10px] text-orange-600 font-normal">
                                  CEIL({inp.raw_gross_qty_base.toFixed(2)})
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                              {inp.available_stock_qty} {inp.uom_base}
                            </td>
                            <td className="py-2.5 px-3">
                              {inp.suggested_batch_number ? (
                                <div>
                                  <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                    {inp.suggested_batch_number}
                                  </span>
                                  <span className="block text-[10px] text-slate-500 mt-0.5">
                                    Vence: {inp.suggested_batch_expiry_date} ({inp.days_to_expiry} días)
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400">Sin lote</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black ${
                                  inp.availability_status === "AVAILABLE"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : inp.availability_status === "PARTIAL"
                                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                                    : "bg-red-50 text-red-700 border border-red-500/40"
                                }`}
                              >
                                {inp.availability_status === "AVAILABLE"
                                  ? "DISPONIBLE"
                                  : inp.availability_status === "PARTIAL"
                                  ? `PARCIAL (Faltan ${inp.shortage_qty})`
                                  : "SIN STOCK"}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              <div className="font-bold text-slate-800">${inp.total_cost_usd.toFixed(2)}</div>
                              <div className="text-[10px] text-slate-500">Bs. {inp.total_cost_ves.toFixed(2)}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Observaciones de Piso / Instrucciones de Tanda
                </label>
                <input
                  type="text"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Ej. Tanda matutina hornos rotativos..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    creatingOrder ||
                    (createMode === "BOM" ? !selectedBomId : !adhocOutputVariantId)
                  }
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-md transition-all text-xs cursor-pointer disabled:opacity-50"
                >
                  <i className="pi pi-check-circle"></i>
                  {creatingOrder ? "Generando OP..." : "Emitir Orden y Abrir Consola"}
                </button>
              </div>
            </form>
          </div>
        )}
      </dialog>
    </div>
  );
}
