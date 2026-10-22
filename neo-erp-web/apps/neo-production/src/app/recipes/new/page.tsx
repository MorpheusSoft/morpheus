"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { VariantCombobox, CatalogVariant } from "@/components/ui/VariantCombobox";

interface WorkCenterOption {
  id: number;
  code: string;
  name: string;
  sector: string;
  hourly_labor_rate: number;
  hourly_overhead_rate: number;
  overhead_per_kg: number;
}

interface InputRow {
  component_variant_id: number;
  input_role: string;
  quantity: number;
  recipe_uom: string;
  conversion_factor_to_base: number;
  bakers_percentage: number | null;
  scrap_tolerance_pct: number;
}

interface OutputRow {
  output_variant_id: number;
  output_type: string;
  expected_qty: number;
  uom_id: string;
  expected_yield_pct: number;
  cost_allocation_method: string;
  standard_reference_price: number | null;
}

interface SimulationResult {
  exchange_rate: number;
  cost_buckets: {
    direct_materials_usd: number;
    direct_materials_ves: number;
    semi_finished_usd: number;
    semi_finished_ves: number;
    scrap_cleaning_usd: number;
    scrap_cleaning_ves: number;
    packaging_usd: number;
    packaging_ves: number;
    direct_labor_mod_usd: number;
    direct_labor_mod_ves: number;
    indirect_overhead_cif_usd: number;
    indirect_overhead_cif_ves: number;
  };
  totals: {
    batch_cost_usd: number;
    batch_cost_ves: number;
    effective_good_qty?: number;
    cost_before_thermal_shrinkage_unit_usd?: number;
    thermal_shrinkage_impact_unit_usd?: number;
    unit_cost_usd: number;
    unit_cost_ves: number;
    current_pvp_usd: number;
    current_pvp_ves: number;
    gross_margin_pct: number;
    total_commercial_value_usd?: number;
    total_output_yield_pct: number;
  };
  inputs_breakdown?: Array<{
    line_cost_usd: number;
    line_cost_ves: number;
  }>;
  outputs_breakdown?: Array<{
    cost_allocation_pct: number;
    calculated_unit_cost_usd: number;
    calculated_unit_cost_ves: number;
  }>;
}

function RecipeBuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");

  const [workCenters, setWorkCenters] = useState<WorkCenterOption[]>([]);
  const [variants, setVariants] = useState<CatalogVariant[]>([]);

  const [code, setCode] = useState("BOM-PAN-002");
  const [name, setName] = useState("");
  const [bomType, setBomType] = useState<"CONVERGENT_RECIPE" | "DIVERGENT_DISASSEMBLY">("CONVERGENT_RECIPE");
  const [sector, setSector] = useState("BAKERY");
  const [workCenterId, setWorkCenterId] = useState<number | undefined>(undefined);
  const [primaryVariantId, setPrimaryVariantId] = useState<number>(0);
  const [baseQty, setBaseQty] = useState<number>(100);
  const [uomId, setUomId] = useState<string>("UND");
  const [expectedShrinkagePct, setExpectedShrinkagePct] = useState<number>(10.0);
  const [maxAllowedShrinkagePct, setMaxAllowedShrinkagePct] = useState<number>(12.0);
  const [standardLaborHours, setStandardLaborHours] = useState<number>(1.5);
  const [shelfLifeDays, setShelfLifeDays] = useState<number>(3);
  const [instructions, setInstructions] = useState<string>("");

  const [inputs, setInputs] = useState<InputRow[]>([]);
  const [outputs, setOutputs] = useState<OutputRow[]>([]);

  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Cargar centros de trabajo, variantes iniciales y (si aplica) la fórmula a editar
  useEffect(() => {
    async function initBuilder() {
      try {
        const [wcRes, varRes] = await Promise.all([
          api.get("/mfg/work-centers"),
          api.get("/mfg/catalog-variants?limit=100"),
        ]);
        const wcList: WorkCenterOption[] = wcRes.data || [];
        const varList: CatalogVariant[] = varRes.data || [];
        setWorkCenters(wcList);

        const varMap = new Map<number, CatalogVariant>();
        varList.forEach((v) => varMap.set(v.id, v));

        if (editId) {
          const bomRes = await api.get(`/mfg/boms/${editId}`);
          const b = bomRes.data;
          const rateVal = b.cost_simulation?.exchange_rate || 40.0;

          // Asegurar que todas las variantes referenciadas por el BOM existan en el selector
          const neededIds = new Set<number>();
          if (b.primary_product_variant_id) {
            neededIds.add(b.primary_product_variant_id);
            if (!varMap.has(b.primary_product_variant_id)) {
              varMap.set(b.primary_product_variant_id, {
                id: b.primary_product_variant_id,
                sku: b.primary_product_sku || `VAR-${b.primary_product_variant_id}`,
                name: b.primary_product_name || "Producto Principal",
                category_name: b.sector || "General",
                uom_base: b.uom_id || "UND",
                unit_cost_usd: b.estimated_unit_cost_usd || 0,
                unit_cost_ves: b.estimated_unit_cost_ves || 0,
                sales_price_usd: b.primary_product_price_usd || 0,
                sales_price_ves: (b.primary_product_price_usd || 0) * rateVal,
              });
            }
          }
          for (const inp of b.inputs || []) {
            neededIds.add(inp.component_variant_id);
            if (!varMap.has(inp.component_variant_id)) {
              varMap.set(inp.component_variant_id, {
                id: inp.component_variant_id,
                sku: inp.component_sku || `VAR-${inp.component_variant_id}`,
                name: inp.component_name || "Insumo",
                category_name: "Insumo",
                uom_base: inp.component_uom_base || inp.recipe_uom || "KG",
                unit_cost_usd: inp.unit_cost_usd || 0,
                unit_cost_ves: inp.unit_cost_ves || 0,
                sales_price_usd: 0,
                sales_price_ves: 0,
              });
            }
          }
          for (const out of b.outputs || []) {
            neededIds.add(out.output_variant_id);
            if (!varMap.has(out.output_variant_id)) {
              varMap.set(out.output_variant_id, {
                id: out.output_variant_id,
                sku: out.output_sku || `VAR-${out.output_variant_id}`,
                name: out.output_name || "Corte / Producto",
                category_name: "Corte",
                uom_base: out.uom_id || "KG",
                unit_cost_usd: out.calculated_unit_cost_usd || 0,
                unit_cost_ves: out.calculated_unit_cost_ves || 0,
                sales_price_usd: out.current_sales_price_usd || 0,
                sales_price_ves: (out.current_sales_price_usd || 0) * rateVal,
              });
            }
          }

          if (neededIds.size > 0) {
            try {
              const idsParam = Array.from(neededIds).join(",");
              const specificRes = await api.get(`/mfg/catalog-variants?ids=${idsParam}&limit=100`);
              if (Array.isArray(specificRes.data)) {
                specificRes.data.forEach((v: CatalogVariant) => varMap.set(v.id, v));
              }
            } catch {
              // Fallback ya cubierto por los datos embebidos en el BOM
            }
          }

          setVariants(Array.from(varMap.values()));

          setCode(b.code);
          setName(b.name);
          setBomType(b.bom_type);
          setSector(b.sector);
          setWorkCenterId(b.work_center_id || undefined);
          setPrimaryVariantId(b.primary_product_variant_id);
          setBaseQty(b.base_qty);
          setUomId(b.uom_id);
          setExpectedShrinkagePct(b.expected_shrinkage_pct);
          setMaxAllowedShrinkagePct(b.max_allowed_shrinkage_pct);
          setStandardLaborHours(b.standard_labor_hours);
          setShelfLifeDays(b.shelf_life_days);
          setInstructions(b.instructions || "");
          setInputs(
            (b.inputs || []).map((i: InputRow) => ({
              component_variant_id: i.component_variant_id,
              input_role: i.input_role,
              quantity: i.quantity,
              recipe_uom: i.recipe_uom,
              conversion_factor_to_base: i.conversion_factor_to_base || 1.0,
              bakers_percentage: i.bakers_percentage,
              scrap_tolerance_pct: i.scrap_tolerance_pct || 0,
            }))
          );
          setOutputs(
            (b.outputs || []).map((o: OutputRow & { current_sales_price_usd?: number }) => ({
              output_variant_id: o.output_variant_id,
              output_type: o.output_type,
              expected_qty: o.expected_qty,
              uom_id: o.uom_id,
              expected_yield_pct: o.expected_yield_pct,
              cost_allocation_method: o.cost_allocation_method,
              standard_reference_price: o.standard_reference_price ?? o.current_sales_price_usd ?? null,
            }))
          );
        } else {
          setVariants(Array.from(varMap.values()));
          if (wcList.length > 0) setWorkCenterId(wcList[0].id);
          if (varList.length > 0) {
            setPrimaryVariantId(varList[0].id);
            setInputs([
              {
                component_variant_id: varList[Math.min(1, varList.length - 1)].id,
                input_role: "PRIMARY_RAW_MATERIAL",
                quantity: 25,
                recipe_uom: "KG",
                conversion_factor_to_base: 1.0,
                bakers_percentage: 100,
                scrap_tolerance_pct: 2.0,
              },
            ]);
          }
        }
      } catch (err) {
        console.error("Error inicializando constructor de recetas:", err);
      }
    }
    initBuilder();
  }, [editId]);

  // Buscador de variantes en el catálogo (integrado en los Combobox)
  const handleSearchVariants = React.useCallback(async (q: string) => {
    try {
      const res = await api.get(`/mfg/catalog-variants?search=${encodeURIComponent(q)}&limit=80`);
      if (Array.isArray(res.data) && res.data.length > 0) {
        setVariants((prev) => {
          const map = new Map<number, CatalogVariant>();
          prev.forEach((v) => map.set(v.id, v));
          let changed = false;
          for (const v of res.data as CatalogVariant[]) {
            if (!map.has(v.id)) {
              changed = true;
            }
            map.set(v.id, v);
          }
          return changed ? Array.from(map.values()) : prev;
        });
      }
    } catch (err) {
      console.error("Error buscando variantes:", err);
    }
  }, []);

  // Ejecutar simulación de costos bimonetarios en vivo cada vez que cambian los parámetros
  useEffect(() => {
    if (!primaryVariantId && inputs.length === 0) return;

    const timer = setTimeout(async () => {
      setSimulating(true);
      try {
        const payload = {
          bom_type: bomType,
          work_center_id: workCenterId || null,
          primary_product_variant_id: primaryVariantId || null,
          base_qty: baseQty || 1,
          uom_id: uomId,
          expected_shrinkage_pct: expectedShrinkagePct || 0,
          standard_labor_hours: standardLaborHours || 0,
          inputs: inputs.filter((i) => i.component_variant_id > 0),
          outputs: bomType === "DIVERGENT_DISASSEMBLY" ? outputs.filter((o) => o.output_variant_id > 0) : [],
        };
        const res = await api.post("/mfg/boms/simulate-cost", payload);
        setSimResult(res.data);
      } catch (err) {
        console.error("Error en simulador bimonetario en vivo:", err);
      } finally {
        setSimulating(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [
    bomType,
    workCenterId,
    primaryVariantId,
    baseQty,
    uomId,
    expectedShrinkagePct,
    standardLaborHours,
    inputs,
    outputs,
  ]);

  function addInputRow() {
    const defaultVar = variants[0]?.id || 0;
    setInputs([
      ...inputs,
      {
        component_variant_id: defaultVar,
        input_role: "INGREDIENT",
        quantity: 1.0,
        recipe_uom: "KG",
        conversion_factor_to_base: 1.0,
        bakers_percentage: sector === "BAKERY" ? 10.0 : null,
        scrap_tolerance_pct: 0.0,
      },
    ]);
  }

  function updateInputRow(idx: number, patch: Partial<InputRow>) {
    const next = [...inputs];
    next[idx] = { ...next[idx], ...patch };
    setInputs(next);
  }

  function removeInputRow(idx: number) {
    setInputs(inputs.filter((_, i) => i !== idx));
  }

  function addOutputRow() {
    const defaultVar = variants[0]?.id || 0;
    setOutputs([
      ...outputs,
      {
        output_variant_id: defaultVar,
        output_type: "CO_PRODUCT",
        expected_qty: 10.0,
        uom_id: "KG",
        expected_yield_pct: 10.0,
        cost_allocation_method: "MARKET_VALUE_INDEX",
        standard_reference_price: 8.5,
      },
    ]);
  }

  function updateOutputRow(idx: number, patch: Partial<OutputRow>) {
    const next = [...outputs];
    next[idx] = { ...next[idx], ...patch };
    setOutputs(next);
  }

  function removeOutputRow(idx: number) {
    setOutputs(outputs.filter((_, i) => i !== idx));
  }

  // Escalar por Porcentaje Panadero cuando se cambia la cantidad de Harina Base (100%)
  function applyBakersScaling(newFlourQtyKg: number) {
    const flourRow = inputs.find(
      (i) => i.bakers_percentage && Math.abs(i.bakers_percentage - 100) < 0.01
    );
    const oldFlourQtyKg = flourRow
      ? flourRow.recipe_uom === "G" || flourRow.recipe_uom === "ML"
        ? flourRow.quantity * 0.001
        : flourRow.quantity
      : 0;

    if (oldFlourQtyKg > 0) {
      setBaseQty((prev) => Math.max(1, Math.round(prev * (newFlourQtyKg / oldFlourQtyKg))));
    }

    const updated = inputs.map((inp) => {
      const isGramOrMl = inp.recipe_uom === "G" || inp.recipe_uom === "ML";
      if (inp.bakers_percentage && Math.abs(inp.bakers_percentage - 100) < 0.01) {
        return {
          ...inp,
          quantity: isGramOrMl ? Number((newFlourQtyKg * 1000).toFixed(2)) : newFlourQtyKg,
        };
      }
      if (inp.bakers_percentage && inp.bakers_percentage > 0 && inp.input_role !== "PACKAGING") {
        const targetWeightKg = newFlourQtyKg * (inp.bakers_percentage / 100.0);
        const scaledRecipeQty = isGramOrMl
          ? Number((targetWeightKg * 1000).toFixed(2))
          : Number(targetWeightKg.toFixed(3));
        return { ...inp, quantity: scaledRecipeQty };
      }
      return inp;
    });
    setInputs(updated);
  }

  async function handleSaveBOM(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!name.trim() || !code.trim() || !primaryVariantId) {
      setErrorMsg("Completa el código, el nombre de la fórmula y el producto principal.");
      return;
    }
    if (inputs.length === 0) {
      setErrorMsg("Debes agregar al menos un insumo o materia prima a la fórmula.");
      return;
    }
    if (bomType === "DIVERGENT_DISASSEMBLY" && outputs.length === 0) {
      setErrorMsg("Una plantilla de desposte divergente debe tener al menos un corte o producto de salida.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        bom_type: bomType,
        sector,
        work_center_id: workCenterId || null,
        primary_product_variant_id: primaryVariantId,
        base_qty: baseQty,
        uom_id: uomId,
        expected_shrinkage_pct: expectedShrinkagePct,
        max_allowed_shrinkage_pct: maxAllowedShrinkagePct,
        standard_labor_hours: standardLaborHours,
        shelf_life_days: shelfLifeDays,
        instructions,
        is_active: true,
        inputs,
        outputs: bomType === "DIVERGENT_DISASSEMBLY" ? outputs : [],
      };

      if (editId) {
        await api.put(`/mfg/boms/${editId}`, payload);
        setSuccessMsg("Fórmula actualizada exitosamente.");
      } else {
        await api.post("/mfg/boms", payload);
        setSuccessMsg("Fórmula creada exitosamente.");
        setTimeout(() => router.push("/recipes"), 900);
      }
    } catch (err: unknown) {
      const respErr = err as { response?: { data?: { detail?: unknown } } };
      const detail = respErr?.response?.data?.detail || "Error al guardar la fórmula.";
      setErrorMsg(typeof detail === "string" ? detail : JSON.stringify(detail));
    } finally {
      setSaving(false);
    }
  }

  const rate = simResult?.exchange_rate ?? 40.0;
  const buckets = simResult?.cost_buckets ?? {
    direct_materials_usd: 0,
    direct_materials_ves: 0,
    semi_finished_usd: 0,
    semi_finished_ves: 0,
    scrap_cleaning_usd: 0,
    scrap_cleaning_ves: 0,
    packaging_usd: 0,
    packaging_ves: 0,
    direct_labor_mod_usd: 0,
    direct_labor_mod_ves: 0,
    indirect_overhead_cif_usd: 0,
    indirect_overhead_cif_ves: 0,
  };
  const totals = simResult?.totals ?? {
    batch_cost_usd: 0,
    batch_cost_ves: 0,
    unit_cost_usd: 0,
    unit_cost_ves: 0,
    current_pvp_usd: 0,
    current_pvp_ves: 0,
    gross_margin_pct: 0,
    total_output_yield_pct: 100,
  };

  return (
    <div className="p-2 sm:p-6 w-full max-w-[1480px] mx-auto space-y-6">
      {/* BARRA SUPERIOR DE TÍTULO Y ACCIONES */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-orange-500 to-red-600"></div>
        <div className="pl-3">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <i className="pi pi-calculator text-orange-600"></i>
            {editId ? "Editor y Simulador de Fórmula / Escandallo" : "Ingeniería de Receta y Simulador Bimonetario en Vivo"}
          </h1>
          <p className="text-slate-500 mt-1 text-sm font-medium">
            Define ingredientes, sub-recetas, porcentaje panadero, mermas de cocción o cortes de desposte y simula el costo estándar en USD y Bs. en vivo.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/recipes"
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancelar / Volver
          </Link>
          <button
            type="button"
            onClick={handleSaveBOM}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-md shadow-orange-500/20 transition-all text-xs cursor-pointer disabled:opacity-50"
          >
            <i className="pi pi-save"></i>
            {saving ? "Guardando..." : "Guardar Fórmula"}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
          <i className="pi pi-exclamation-triangle"></i>
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-2">
          <i className="pi pi-check-circle"></i>
          {successMsg}
        </div>
      )}

      {/* LAYOUT 2 COLUMNAS: IZQUIERDA (FICHA TÉCNICA + INGREDIENTES) | DERECHA (SIMULADOR BIMONETARIO EN VIVO) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUMNA IZQUIERDA (8 COLS) */}
        <div className="lg:col-span-8 space-y-6">
          {/* FICHA TÉCNICA DE LA FÓRMULA */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <h2 className="text-base font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                <i className="pi pi-sliders-h text-orange-600"></i>
                Ficha Técnica de la Fórmula
              </h2>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBomType("CONVERGENT_RECIPE");
                    if (sector === "MEAT_PROCESSING") setSector("BAKERY");
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    bomType === "CONVERGENT_RECIPE"
                      ? "bg-orange-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  🥖 Receta Convergente (N → 1)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBomType("DIVERGENT_DISASSEMBLY");
                    setSector("MEAT_PROCESSING");
                    setUomId("KG");
                    if (outputs.length === 0 && variants.length > 0) {
                      setOutputs([
                        {
                          output_variant_id: variants[0].id,
                          output_type: "PRIMARY_PRODUCT",
                          expected_qty: Number((baseQty * 0.4).toFixed(2)),
                          uom_id: "KG",
                          expected_yield_pct: 40.0,
                          cost_allocation_method: "MARKET_VALUE_INDEX",
                          standard_reference_price: variants[0].sales_price_usd || 10.0,
                        },
                        {
                          output_variant_id: variants[Math.min(1, variants.length - 1)].id,
                          output_type: "CO_PRODUCT",
                          expected_qty: Number((baseQty * 0.48).toFixed(2)),
                          uom_id: "KG",
                          expected_yield_pct: 48.0,
                          cost_allocation_method: "MARKET_VALUE_INDEX",
                          standard_reference_price:
                            variants[Math.min(1, variants.length - 1)].sales_price_usd || 7.5,
                        },
                        {
                          output_variant_id: variants[Math.min(2, variants.length - 1)].id,
                          output_type: "BY_PRODUCT",
                          expected_qty: Number((baseQty * 0.09).toFixed(2)),
                          uom_id: "KG",
                          expected_yield_pct: 9.0,
                          cost_allocation_method: "FIXED_NRV",
                          standard_reference_price: 1.0,
                        },
                      ]);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                    bomType === "DIVERGENT_DISASSEMBLY"
                      ? "bg-red-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  🥩 Desposte Divergente (1 → N)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Código BOM *</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre de la Receta / Plantilla *</label>
                <input
                  type="text"
                  placeholder="Ej: Pan Campesino Artesanal 500g (Lote 100 UND)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Sector Industrial</label>
                <select
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-orange-500"
                >
                  <option value="BAKERY">Panadería & Pastelería</option>
                  <option value="GASTRONOMY">Cocina & Gastronomía</option>
                  <option value="MEAT_PROCESSING">Sala de Desposte Cárnico</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Centro de Trabajo (Tarifas MOD/CIF)</label>
                <select
                  value={workCenterId || ""}
                  onChange={(e) => setWorkCenterId(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-orange-500"
                >
                  <option value="">-- Seleccionar Estación --</option>
                  {workCenters.map((wc) => (
                    <option key={wc.id} value={wc.id}>
                      [{wc.code}] {wc.name} (MOD: ${wc.hourly_labor_rate}/h | CIF: ${wc.hourly_overhead_rate}/h)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selector de Producto Principal con buscador integrado en el Combobox */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                {bomType === "DIVERGENT_DISASSEMBLY"
                  ? "SKU Insumo Matriz (Ej: Canal Bovina / Pollo Beneficiado) *"
                  : "SKU Producto Terminado o Sub-receta Obtenida *"}
              </label>

              <VariantCombobox
                value={primaryVariantId}
                variants={variants}
                onChange={(variantId) => setPrimaryVariantId(variantId)}
                onSearchCatalog={handleSearchVariants}
                placeholder="Buscar y seleccionar producto principal..."
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Lote Base *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={baseQty}
                  onChange={(e) => setBaseQty(parseFloat(e.target.value) || 1)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Unidad (UoM)</label>
                <select
                  value={uomId}
                  onChange={(e) => setUomId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white font-mono"
                >
                  <option value="UND">UND</option>
                  <option value="KG">KG</option>
                  <option value="LT">LT</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Merma Horno/Oreo (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="90"
                  value={expectedShrinkagePct}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setExpectedShrinkagePct(val);
                    if (maxAllowedShrinkagePct < val) {
                      setMaxAllowedShrinkagePct(Number((val + 2).toFixed(1)));
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Merma Máx. (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="95"
                  value={maxAllowedShrinkagePct}
                  onChange={(e) => setMaxAllowedShrinkagePct(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Horas MOD Lote</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={standardLaborHours}
                  onChange={(e) => setStandardLaborHours(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Vida Útil (Días)</label>
                <input
                  type="number"
                  min="1"
                  value={shelfLifeDays}
                  onChange={(e) => setShelfLifeDays(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>
            </div>
          </div>

          {/* SECCIÓN DE INGREDIENTES, SUB-RECETAS Y EMPAQUES */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                  <i className="pi pi-box text-orange-600"></i>
                  Ingredientes, Sub-recetas y Empaques
                </h2>
                <p className="text-xs text-slate-500">
                  Soporta conversión de UoM (G/ML a KG/LT), Porcentaje Panadero (Harina = 100%) y Factor de Limpieza/Pelado.
                </p>
              </div>

              <button
                type="button"
                onClick={addInputRow}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-xs font-bold cursor-pointer self-start sm:self-auto"
              >
                <i className="pi pi-plus text-xs"></i>
                Añadir Insumo
              </button>
            </div>

            {sector === "BAKERY" && (
              <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="text-amber-900">
                  <strong>🥖 Escalador por % Pan (Porcentaje Panadero):</strong> La Harina Base representa el <strong>100%</strong> y cada ingrediente se expresa en proporción a ella (ej. 60% agua, 2% sal). Ajusta los kilos de harina para escalar toda la masa automáticamente.
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => applyBakersScaling(25)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 font-bold text-amber-800 hover:bg-amber-100 cursor-pointer"
                  >
                    Saco 25 Kg
                  </button>
                  <button
                    type="button"
                    onClick={() => applyBakersScaling(45)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 font-bold text-amber-800 hover:bg-amber-100 cursor-pointer"
                  >
                    Saco 45 Kg
                  </button>
                  <button
                    type="button"
                    onClick={() => applyBakersScaling(80)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 font-bold text-amber-800 hover:bg-amber-100 cursor-pointer"
                  >
                    Amasadora 80 Kg
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-visible">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-2">Insumo / Sub-receta</th>
                    <th className="py-2.5 px-2">Rol</th>
                    <th className="py-2.5 px-2 text-right">Cant.</th>
                    <th className="py-2.5 px-2">UoM</th>
                    <th className="py-2.5 px-2 text-right">Factor Base</th>
                    <th
                      className="py-2.5 px-2 text-right cursor-help group relative"
                      title="Porcentaje Panadero (Baker's %): Expresa el peso de cada ingrediente como proporción de la Harina Base, la cual siempre se define como 100%."
                    >
                      <span className="inline-flex items-center gap-1">
                        % Pan <i className="pi pi-question-circle text-[9px] text-orange-500" />
                      </span>
                      <div className="hidden group-hover:block group-focus-within:block absolute right-0 top-full mt-1 w-64 p-2.5 rounded-xl bg-slate-900 text-white text-[11px] font-normal normal-case text-left shadow-xl z-50 pointer-events-none leading-relaxed">
                        <strong className="text-amber-300 block mb-0.5">
                          ¿Qué significa % Pan (Porcentaje Panadero)?
                        </strong>
                        La <strong>Harina Base</strong> siempre equivale al <strong>100%</strong> y el resto de los ingredientes se expresan en proporción a su peso (ej: 60% agua = 600g por cada 1 Kg de harina).
                      </div>
                    </th>
                    <th className="py-2.5 px-2 text-right">Merma %</th>
                    <th className="py-2.5 px-2 text-right">Subtotal ($)</th>
                    <th className="py-2.5 px-2 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inputs.map((inp, idx) => {
                    const simLine = simResult?.inputs_breakdown?.[idx];
                    return (
                      <tr key={idx} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-2 min-w-[220px]">
                          <VariantCombobox
                            compact
                            value={inp.component_variant_id}
                            variants={variants}
                            onChange={(variantId) =>
                              updateInputRow(idx, { component_variant_id: variantId })
                            }
                            onSearchCatalog={handleSearchVariants}
                            placeholder="Buscar materia prima o insumo..."
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <select
                            value={inp.input_role}
                            onChange={(e) => updateInputRow(idx, { input_role: e.target.value })}
                            className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-[11px] font-semibold"
                          >
                            <option value="PRIMARY_RAW_MATERIAL">MP Primaria</option>
                            <option value="INGREDIENT">Ingrediente</option>
                            <option value="SEMI_FINISHED">[SUB] Base</option>
                            <option value="PACKAGING">Empaque</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={inp.quantity}
                            onChange={(e) =>
                              updateInputRow(idx, { quantity: parseFloat(e.target.value) || 0 })
                            }
                            className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 text-right font-mono"
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <select
                            value={inp.recipe_uom}
                            onChange={(e) => {
                              const newUom = e.target.value;
                              const autoFactor = newUom === "G" || newUom === "ML" ? 0.001 : 1.0;
                              updateInputRow(idx, {
                                recipe_uom: newUom,
                                conversion_factor_to_base: autoFactor,
                              });
                            }}
                            className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-xs"
                          >
                            <option value="KG">KG</option>
                            <option value="G">G</option>
                            <option value="LT">LT</option>
                            <option value="ML">ML</option>
                            <option value="UND">UND</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <input
                            type="number"
                            step="0.0001"
                            min="0.0001"
                            value={inp.conversion_factor_to_base}
                            onChange={(e) =>
                              updateInputRow(idx, {
                                conversion_factor_to_base: parseFloat(e.target.value) || 1.0,
                              })
                            }
                            className="w-16 px-2 py-1.5 rounded-lg border border-slate-300 text-right font-mono"
                          />
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <input
                            type="number"
                            step="0.1"
                            placeholder="—"
                            value={inp.bakers_percentage ?? ""}
                            onChange={(e) =>
                              updateInputRow(idx, {
                                bakers_percentage:
                                  e.target.value === "" ? null : parseFloat(e.target.value),
                              })
                            }
                            className="w-16 px-2 py-1.5 rounded-lg border border-slate-300 text-right font-mono"
                          />
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max="90"
                            value={inp.scrap_tolerance_pct}
                            onChange={(e) =>
                              updateInputRow(idx, {
                                scrap_tolerance_pct: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-16 px-2 py-1.5 rounded-lg border border-slate-300 text-right font-mono"
                          />
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono">
                          <div className="font-bold text-slate-800">
                            ${(simLine?.line_cost_usd ?? 0).toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Bs. {(simLine?.line_cost_ves ?? 0).toFixed(2)}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeInputRow(idx)}
                            className="text-red-400 hover:text-red-600 cursor-pointer"
                          >
                            <i className="pi pi-trash text-xs"></i>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* SI ES DESPOSTE DIVERGENTE (1 -> N), MOSTRAR MATRIZ DE CORTES Y VALOR DE MERCADO */}
          {bomType === "DIVERGENT_DISASSEMBLY" && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-red-100">
                <div>
                  <h2 className="text-base font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                    <i className="pi pi-percentage text-red-600"></i>
                    Matriz de Cortes Obtenidos y Prorrateo NIC 2 (Market Value Index)
                  </h2>
                  <p className="text-xs text-slate-500">
                    El costo conjunto se distribuye proporcionalmente al Índice de Producción (% Yield) y al Precio de Venta de Referencia de cada corte.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={addOutputRow}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold cursor-pointer"
                >
                  <i className="pi pi-plus text-xs"></i>
                  Añadir Corte / Subproducto
                </button>
              </div>

              <div className="overflow-visible">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-red-50/60 border-b border-red-200 text-slate-600 font-bold uppercase text-[10px]">
                      <th className="py-2.5 px-2">Corte / Producto Obtenido</th>
                      <th className="py-2.5 px-2">Clasificación</th>
                      <th className="py-2.5 px-2 text-right">Kg Esp.</th>
                      <th className="py-2.5 px-2 text-right">Yield %</th>
                      <th className="py-2.5 px-2 text-right">PVP Ref ($/Kg)</th>
                      <th className="py-2.5 px-2 text-right">% Absorción</th>
                      <th className="py-2.5 px-2 text-right">Costo Asig. ($/Kg)</th>
                      <th className="py-2.5 px-2 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {outputs.map((out, idx) => {
                      const simOut = simResult?.outputs_breakdown?.[idx];
                      return (
                        <tr key={idx}>
                          <td className="py-2.5 px-2 min-w-[220px]">
                            <VariantCombobox
                              compact
                              value={out.output_variant_id}
                              variants={variants}
                              onChange={(variantId, variant) =>
                                updateOutputRow(idx, {
                                  output_variant_id: variantId,
                                  ...(variant && variant.sales_price_usd > 0
                                    ? { standard_reference_price: variant.sales_price_usd }
                                    : {}),
                                })
                              }
                              onSearchCatalog={handleSearchVariants}
                              placeholder="Buscar corte o subproducto..."
                            />
                          </td>
                          <td className="py-2.5 px-2">
                            <select
                              value={out.output_type}
                              onChange={(e) =>
                                updateOutputRow(idx, {
                                  output_type: e.target.value,
                                  cost_allocation_method:
                                    e.target.value === "BY_PRODUCT" ? "FIXED_NRV" : "MARKET_VALUE_INDEX",
                                })
                              }
                              className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-[11px] font-bold"
                            >
                              <option value="PRIMARY_PRODUCT">🟢 Corte 1ra Extra</option>
                              <option value="CO_PRODUCT">🔵 Co-Producto (1ra/2da)</option>
                              <option value="BY_PRODUCT">🟡 Subproducto (VNR)</option>
                            </select>
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            <input
                              type="number"
                              step="0.1"
                              value={out.expected_qty}
                              onChange={(e) => {
                                const q = parseFloat(e.target.value) || 0;
                                const yPct = baseQty > 0 ? Number(((q / baseQty) * 100).toFixed(2)) : 0;
                                updateOutputRow(idx, { expected_qty: q, expected_yield_pct: yPct });
                              }}
                              className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 text-right font-mono"
                            />
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-700">
                            {out.expected_yield_pct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            <input
                              type="number"
                              step="0.1"
                              value={out.standard_reference_price ?? 0}
                              onChange={(e) =>
                                updateOutputRow(idx, {
                                  standard_reference_price: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 text-right font-mono"
                            />
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-slate-600">
                            {out.output_type === "BY_PRODUCT"
                              ? "Crédito VNR"
                              : `${(simOut?.cost_allocation_pct ?? 0).toFixed(2)}%`}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono">
                            <div className="font-black text-orange-600">
                              ${(simOut?.calculated_unit_cost_usd ?? 0).toFixed(2)}/Kg
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Bs. {(simOut?.calculated_unit_cost_ves ?? 0).toFixed(2)}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeOutputRow(idx)}
                              className="text-red-400 hover:text-red-600 cursor-pointer"
                            >
                              <i className="pi pi-trash text-xs"></i>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* INSTRUCCIONES TÉCNICAS DE PLANTA */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2">
              Instrucciones Operativas de Elaboración / Corte
            </label>
            <textarea
              rows={3}
              placeholder="Describe los pasos de amasado, tiempos de fermentación, temperatura de horneado o protocolo de desposte..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        {/* COLUMNA DERECHA (4 COLS): SIMULADOR DE COSTO BIMONETARIO EN VIVO */}
        <div className="lg:col-span-4 lg:sticky lg:top-20 space-y-4">
          <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-2xl border border-slate-800 space-y-5 relative overflow-hidden">
            <div className="absolute -top-16 -right-16 w-48 h-48 bg-orange-500/15 rounded-full blur-2xl pointer-events-none"></div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-orange-400 block">
                  NEO PRODUCCIÓN • LIVE ENGINE
                </span>
                <h3 className="text-lg font-black text-white flex items-center gap-2 mt-0.5">
                  📊 Simulador de Costo en Vivo
                </h3>
              </div>
              {simulating && (
                <span className="text-[11px] font-semibold text-orange-300 animate-pulse">
                  Calculando...
                </span>
              )}
            </div>

            {/* TASA BCV ACTIVA */}
            <div className="p-3.5 rounded-2xl bg-slate-800/90 border border-slate-700 flex items-center justify-between">
              <span className="text-xs text-slate-300 font-medium">Tasa BCV Activa:</span>
              <span className="text-sm font-black text-emerald-400 font-mono">
                Bs. {rate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / USD
              </span>
            </div>

            {/* DESGLOSE DE CAPAS DE COSTO (COST BUCKETS) */}
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
                <span className="text-slate-300">Costo Insumos Directos:</span>
                <div className="text-right font-mono">
                  <span className="font-bold text-white">${buckets.direct_materials_usd.toFixed(2)}</span>
                  <span className="text-slate-400 ml-1.5">(Bs. {buckets.direct_materials_ves.toFixed(2)})</span>
                </div>
              </div>

              {buckets.semi_finished_usd > 0 && (
                <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
                  <span className="text-slate-300">Sub-recetas / Bases Culinarias:</span>
                  <div className="text-right font-mono">
                    <span className="font-bold text-white">${buckets.semi_finished_usd.toFixed(2)}</span>
                    <span className="text-slate-400 ml-1.5">(Bs. {buckets.semi_finished_ves.toFixed(2)})</span>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
                <span className="text-amber-300">Merma Limpieza Insumos:</span>
                <div className="text-right font-mono">
                  <span className="font-bold text-amber-300">${buckets.scrap_cleaning_usd.toFixed(2)}</span>
                  <span className="text-slate-400 ml-1.5">(Bs. {buckets.scrap_cleaning_ves.toFixed(2)})</span>
                </div>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
                <span className="text-slate-300">Material de Empaque:</span>
                <div className="text-right font-mono">
                  <span className="font-bold text-white">${buckets.packaging_usd.toFixed(2)}</span>
                  <span className="text-slate-400 ml-1.5">(Bs. {buckets.packaging_ves.toFixed(2)})</span>
                </div>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
                <span className="text-slate-300">Mano de Obra Directa ({standardLaborHours}h):</span>
                <div className="text-right font-mono">
                  <span className="font-bold text-white">${buckets.direct_labor_mod_usd.toFixed(2)}</span>
                  <span className="text-slate-400 ml-1.5">(Bs. {buckets.direct_labor_mod_ves.toFixed(2)})</span>
                </div>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-slate-800">
                <span className="text-slate-300">Energía / CIF Planta:</span>
                <div className="text-right font-mono">
                  <span className="font-bold text-white">${buckets.indirect_overhead_cif_usd.toFixed(2)}</span>
                  <span className="text-slate-400 ml-1.5">(Bs. {buckets.indirect_overhead_cif_ves.toFixed(2)})</span>
                </div>
              </div>
            </div>

            {/* COSTO TOTAL DEL LOTE */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-orange-500/20 to-red-600/20 border border-orange-500/40 space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-black uppercase tracking-wider text-orange-300">
                  COSTO TOTAL LOTE ({baseQty} {uomId}):
                </span>
                <span className="text-2xl font-black text-white font-mono">
                  ${totals.batch_cost_usd.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs font-mono text-orange-200">
                <span>Equivalente Bolívares:</span>
                <span className="font-bold">
                  Bs. {totals.batch_cost_ves.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* COSTO UNITARIO ESTÁNDAR */}
            <div className="p-4 rounded-2xl bg-slate-800 border border-slate-700 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  🎯 Costo Unitario Estándar ({uomId})
                </span>
                {bomType === "CONVERGENT_RECIPE" && expectedShrinkagePct > 0 && (
                  <span className="text-[10px] font-mono font-bold text-amber-300">
                    Rend. Neto: {(totals.effective_good_qty ?? baseQty).toFixed(2)} {uomId}
                  </span>
                )}
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-orange-400 font-mono">
                  ${totals.unit_cost_usd.toFixed(4)} / {uomId}
                </span>
                <span className="text-sm font-bold text-slate-300 font-mono">
                  Bs. {totals.unit_cost_ves.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {bomType === "CONVERGENT_RECIPE" && (totals.thermal_shrinkage_impact_unit_usd ?? 0) > 0 && (
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-700/70 text-[11px] font-mono text-amber-300">
                  <span>Absorción Merma Térmica ({expectedShrinkagePct}%):</span>
                  <span>+${(totals.thermal_shrinkage_impact_unit_usd ?? 0).toFixed(4)} / {uomId}</span>
                </div>
              )}
            </div>

            {/* COMPARATIVA CONTRA PVP ACTUAL EN NEO PRICING */}
            <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/80 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">
                  {bomType === "DIVERGENT_DISASSEMBLY"
                    ? "Valor Comercial Total Cortes:"
                    : "PVP Actual (Neo Pricing):"}
                </span>
                <span className="font-mono font-bold text-white">
                  $
                  {bomType === "DIVERGENT_DISASSEMBLY"
                    ? (totals.total_commercial_value_usd || 0).toFixed(2)
                    : totals.current_pvp_usd.toFixed(2)}{" "}
                  <span className="text-slate-400">
                    (Bs.{" "}
                    {(
                      (bomType === "DIVERGENT_DISASSEMBLY"
                        ? totals.total_commercial_value_usd || 0
                        : totals.current_pvp_usd) * rate
                    ).toFixed(2)}
                    )
                  </span>
                </span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                <span className="text-xs font-bold text-slate-300">Margen Bruto Estimado:</span>
                <span
                  className={`px-3 py-1 rounded-xl font-mono text-sm font-black ${
                    totals.gross_margin_pct >= 30
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : totals.gross_margin_pct >= 15
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      : "bg-red-500/20 text-red-300 border border-red-500/40"
                  }`}
                >
                  {totals.gross_margin_pct.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewRecipePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando constructor y simulador...</div>}>
      <RecipeBuilderContent />
    </Suspense>
  );
}
