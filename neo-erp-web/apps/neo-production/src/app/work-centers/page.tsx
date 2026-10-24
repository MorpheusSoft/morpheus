"use client";

import React, { useState, useEffect } from "react";
import api from "@/lib/api";

interface WorkCenter {
  id: number;
  facility_id: number;
  facility_name?: string;
  warehouse_wip_id?: number | null;
  warehouse_wip_name?: string | null;
  code: string;
  name: string;
  sector: string;
  capacity_per_batch: number;
  capacity_uom: string;
  hourly_labor_rate: number;
  hourly_overhead_rate: number;
  overhead_per_kg: number;
  is_active: boolean;
  boms_count: number;
}

interface FacilityItem {
  id: number;
  code: string;
  name: string;
}

interface WarehouseItem {
  id: number;
  code: string;
  name: string;
  facility_id: number;
}

const SECTORS = [
  { value: "BAKERY", label: "Panadería & Pastelería", badge: "bg-amber-50 text-amber-700 border-amber-200", icon: "pi-sun" },
  { value: "GASTRONOMY", label: "Cocina & Gastronomía", badge: "bg-orange-50 text-orange-700 border-orange-200", icon: "pi-sparkles" },
  { value: "MEAT_PROCESSING", label: "Sala de Desposte Cárnico", badge: "bg-red-50 text-red-700 border-red-200", icon: "pi-percentage" },
];

export default function WorkCentersPage() {
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [facilities, setFacilities] = useState<FacilityItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number>(40.0);
  const [loading, setLoading] = useState(true);
  const [sectorFilter, setSectorFilter] = useState<string>("ALL");
  const [facilityFilter, setFacilityFilter] = useState<string>("ALL");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWc, setEditingWc] = useState<WorkCenter | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    facility_id: 1,
    warehouse_wip_id: null as number | null,
    code: "",
    name: "",
    sector: "BAKERY",
    capacity_per_batch: 80,
    capacity_uom: "KG",
    hourly_labor_rate: 4.5,
    hourly_overhead_rate: 2.8,
    overhead_per_kg: 0.04,
    is_active: true,
  });

  async function loadData() {
    setLoading(true);
    try {
      const [wcRes, infraRes, sumRes] = await Promise.all([
        api.get("/mfg/work-centers"),
        api.get("/mfg/facilities-and-warehouses").catch(() => ({
          data: {
            facilities: [{ id: 1, code: "CAT-11", name: "PATIO TRIGAL" }],
            warehouses: [],
          },
        })),
        api.get("/mfg/dashboard-summary").catch(() => ({ data: { exchange_rate: 40.0 } })),
      ]);
      setWorkCenters(wcRes.data || []);
      const facList = Array.isArray(infraRes.data?.facilities) ? infraRes.data.facilities : [];
      setFacilities(facList);
      const whList = Array.isArray(infraRes.data?.warehouses) ? infraRes.data.warehouses : [];
      setWarehouses(whList);
      if (sumRes.data?.exchange_rate) {
        setExchangeRate(Number(sumRes.data.exchange_rate));
      }
    } catch (err) {
      console.error("Error cargando centros de trabajo:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function openNewModal() {
    setEditingWc(null);
    setErrorMsg(null);
    const defaultFacId =
      facilityFilter !== "ALL" ? Number(facilityFilter) : facilities[0]?.id || 1;
    const defaultWh =
      warehouses.find((w) => w.facility_id === defaultFacId) || warehouses[0];
    setForm({
      facility_id: defaultFacId,
      warehouse_wip_id: defaultWh ? defaultWh.id : null,
      code: "",
      name: "",
      sector: "BAKERY",
      capacity_per_batch: 80,
      capacity_uom: "KG",
      hourly_labor_rate: 4.5,
      hourly_overhead_rate: 2.8,
      overhead_per_kg: 0.04,
      is_active: true,
    });
    setIsModalOpen(true);
  }

  function openEditModal(wc: WorkCenter) {
    setEditingWc(wc);
    setErrorMsg(null);
    setForm({
      facility_id: wc.facility_id,
      warehouse_wip_id: wc.warehouse_wip_id ?? null,
      code: wc.code,
      name: wc.name,
      sector: wc.sector,
      capacity_per_batch: wc.capacity_per_batch,
      capacity_uom: wc.capacity_uom,
      hourly_labor_rate: wc.hourly_labor_rate,
      hourly_overhead_rate: wc.hourly_overhead_rate,
      overhead_per_kg: wc.overhead_per_kg,
      is_active: wc.is_active,
    });
    setIsModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      if (editingWc) {
        await api.put(`/mfg/work-centers/${editingWc.id}`, form);
      } else {
        await api.post("/mfg/work-centers", form);
      }
      setIsModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      const respErr = err as { response?: { data?: { detail?: unknown } } };
      const msg = respErr?.response?.data?.detail || "Error guardando el Centro de Trabajo";
      setErrorMsg(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(wc: WorkCenter) {
    if (!window.confirm(`¿Deseas eliminar o desactivar la estación "${wc.name}"?`)) return;
    try {
      await api.delete(`/mfg/work-centers/${wc.id}`);
      await loadData();
    } catch (err) {
      console.error("Error eliminando estación:", err);
    }
  }

  const filteredCenters = workCenters.filter((wc) => {
    const matchSector = sectorFilter === "ALL" ? true : wc.sector === sectorFilter;
    const matchFacility =
      facilityFilter === "ALL" ? true : wc.facility_id === Number(facilityFilter);
    return matchSector && matchFacility;
  });

  const modalWarehouses = warehouses.filter((w) => w.facility_id === form.facility_id);

  return (
    <div className="p-2 sm:p-6 w-full max-w-[1440px] mx-auto space-y-6">
      {/* HEADER */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-orange-500 to-red-600"></div>
        <div className="pl-3">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <i className="pi pi-sliders-h text-orange-600"></i>
            Centros de Trabajo y Tarifas de Planta
          </h1>
          <p className="text-slate-500 mt-1 text-sm font-medium">
            Configura Hornos, Cocina Caliente y Salas de Desposte (1..N estaciones por Sucursal) con sus capacidades por tanda y tarifas bimonetarias de Mano de Obra (MOD) y Costos Indirectos (CIF).
          </p>
        </div>

        <button
          onClick={openNewModal}
          type="button"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold px-5 py-3 rounded-xl shadow-md shadow-orange-500/20 transition-all text-sm cursor-pointer"
        >
          <i className="pi pi-plus"></i>
          Nuevo Centro de Trabajo
        </button>
      </div>

      {/* FILTROS POR SECTOR Y SUCURSAL */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSectorFilter("ALL")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              sectorFilter === "ALL"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Todos los Sectores ({workCenters.length})
          </button>
          {SECTORS.map((sec) => {
            const count = workCenters.filter(
              (w) =>
                w.sector === sec.value &&
                (facilityFilter === "ALL" || w.facility_id === Number(facilityFilter))
            ).length;
            return (
              <button
                key={sec.value}
                type="button"
                onClick={() => setSectorFilter(sec.value)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  sectorFilter === sec.value
                    ? "bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <i className={`pi ${sec.icon}`}></i>
                {sec.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600">Sucursal / Sede:</label>
            <select
              value={facilityFilter}
              onChange={(e) => setFacilityFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50 focus:outline-none focus:border-orange-500"
            >
              <option value="ALL">🏢 Todas las Sucursales / Sedes ({workCenters.length} estaciones)</option>
              {facilities.map((f) => {
                const facStationCount = workCenters.filter((w) => w.facility_id === f.id).length;
                return (
                  <option key={f.id} value={String(f.id)}>
                    🏢 [{f.code}] {f.name} ({facStationCount} {facStationCount === 1 ? "estación" : "estaciones"})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="text-xs font-semibold text-slate-500 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200">
            Tasa de Conversión Activa: <strong className="text-slate-800 font-mono">Bs. {exchangeRate.toFixed(2)} / USD</strong>
          </div>
        </div>
      </div>

      {/* TARJETAS DE CENTROS DE TRABAJO */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-slate-400 border border-slate-200">
          Cargando estaciones de planta...
        </div>
      ) : filteredCenters.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-slate-400 border border-slate-200">
          No se encontraron Centros de Trabajo para este filtro.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCenters.map((wc) => {
            const sec = SECTORS.find((s) => s.value === wc.sector) || SECTORS[0];
            const totalHourlyUsd = wc.hourly_labor_rate + wc.hourly_overhead_rate;
            const totalHourlyVes = totalHourlyUsd * exchangeRate;

            return (
              <div
                key={wc.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border ${sec.badge}`}>
                      <i className={`pi ${sec.icon} text-xs`}></i>
                      {sec.label}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                        wc.is_active
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                      }`}
                    >
                      {wc.is_active ? "Operativo" : "Inactivo"}
                    </span>
                  </div>

                  <div className="font-mono text-xs font-bold text-orange-600">{wc.code}</div>
                  <h3 className="text-lg font-black text-slate-800 mt-0.5">{wc.name}</h3>
                  <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      <i className="pi pi-building text-[11px]"></i>
                      Sede: <strong className="text-slate-600">{wc.facility_name || `ID #${wc.facility_id}`}</strong>
                    </span>
                    {wc.warehouse_wip_name && (
                      <span className="inline-flex items-center gap-1">
                        <i className="pi pi-box text-[11px] text-orange-500"></i>
                        WIP: <strong className="text-slate-600">{wc.warehouse_wip_name}</strong>
                      </span>
                    )}
                  </div>

                  {/* Capacidad por Lote/Tanda */}
                  <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Capacidad por Tanda
                      </span>
                      <span className="text-lg font-black text-slate-800 font-mono">
                        {wc.capacity_per_batch.toLocaleString("es-VE")} {wc.capacity_uom}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Fórmulas Vinculadas
                      </span>
                      <span className="text-sm font-black text-orange-600">
                        {wc.boms_count} recetas
                      </span>
                    </div>
                  </div>

                  {/* Desglose de Tarifas MOD y CIF */}
                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">Mano de Obra Directa (MOD / Hora):</span>
                      <span className="font-mono font-bold text-slate-800">
                        ${wc.hourly_labor_rate.toFixed(2)} <span className="text-slate-400 font-normal">(Bs. {(wc.hourly_labor_rate * exchangeRate).toFixed(2)})</span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">Energía / CIF Fijo (USD / Hora):</span>
                      <span className="font-mono font-bold text-slate-800">
                        ${wc.hourly_overhead_rate.toFixed(2)} <span className="text-slate-400 font-normal">(Bs. {(wc.hourly_overhead_rate * exchangeRate).toFixed(2)})</span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">CIF Variable por Unidad/Kg:</span>
                      <span className="font-mono font-bold text-slate-800">
                        ${wc.overhead_per_kg.toFixed(4)} / {wc.capacity_uom}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5">
                      <span className="font-bold text-slate-700">Tarifa Horaria Combinada:</span>
                      <span className="font-mono font-black text-orange-600">
                        ${totalHourlyUsd.toFixed(2)}/h (Bs. {totalHourlyVes.toFixed(2)})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => openEditModal(wc)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-orange-600 cursor-pointer transition-colors"
                  >
                    <i className="pi pi-pencil text-xs"></i>
                    Editar Tarifas y Capacidad
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(wc)}
                    className="text-xs font-semibold text-red-500 hover:text-red-700 cursor-pointer transition-colors"
                  >
                    <i className="pi pi-trash text-xs"></i>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL CREAR / EDITAR CENTRO DE TRABAJO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                  <i className="pi pi-sliders-h text-white"></i>
                </div>
                <div>
                  <h3 className="font-black text-base">
                    {editingWc ? "Editar Centro de Trabajo" : "Nuevo Centro de Trabajo"}
                  </h3>
                  <p className="text-xs text-slate-400">Estación de transformación y tasas horarias MOD/CIF</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <i className="pi pi-times"></i>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Código Estación *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: PANADERIA_HORNOS"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sector Industrial *</label>
                  <select
                    value={form.sector}
                    onChange={(e) => setForm({ ...form, sector: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-orange-500"
                  >
                    {SECTORS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Descriptivo de la Estación *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Hornos Rotativos Panadería Central"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">🏢 Sede / Sucursal *</label>
                  <select
                    value={form.facility_id}
                    onChange={(e) => {
                      const newFacId = Number(e.target.value);
                      const whForFac = warehouses.find((w) => w.facility_id === newFacId);
                      setForm({
                        ...form,
                        facility_id: newFacId,
                        warehouse_wip_id: whForFac ? whForFac.id : null,
                      });
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-orange-500"
                  >
                    {facilities.map((f) => (
                      <option key={f.id} value={f.id}>
                        [{f.code}] {f.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    📦 Almacén Piso / WIP ({modalWarehouses.length} en la sede)
                  </label>
                  <select
                    value={form.warehouse_wip_id ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        warehouse_wip_id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="">-- Sin Almacén WIP fijo --</option>
                    {(modalWarehouses.length > 0 ? modalWarehouses : warehouses).map((w) => (
                      <option key={w.id} value={w.id}>
                        [{w.code}] {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Capacidad por Tanda</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.capacity_per_batch}
                    onChange={(e) => setForm({ ...form, capacity_per_batch: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Unidad (UoM)</label>
                  <select
                    value={form.capacity_uom}
                    onChange={(e) => setForm({ ...form, capacity_uom: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm bg-white font-mono focus:outline-none focus:border-orange-500"
                  >
                    <option value="KG">KG</option>
                    <option value="UND">UND</option>
                    <option value="LT">LT</option>
                  </select>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-orange-50/60 border border-orange-200/80 space-y-3">
                <div className="text-xs font-black text-orange-800 uppercase tracking-wider">
                  Tarifas Estándar de Costeo de Planta (USD)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">MOD (USD / Hora)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.hourly_labor_rate}
                      onChange={(e) => setForm({ ...form, hourly_labor_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">CIF Fijo (USD / Hora)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.hourly_overhead_rate}
                      onChange={(e) => setForm({ ...form, hourly_overhead_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">CIF / Kg o Und ($)</label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={form.overhead_per_kg}
                      onChange={(e) => setForm({ ...form, overhead_per_kg: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="rounded accent-orange-600 w-4 h-4"
                  />
                  Estación Activa para Planificación y Recetas
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-white text-xs font-bold shadow-md shadow-orange-500/20 hover:from-orange-600 hover:to-red-700 cursor-pointer disabled:opacity-50"
                  >
                    {saving ? "Guardando..." : "Guardar Estación"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
