"use client";

import React, { useState, useEffect } from 'react';
import Link from "next/link";
import api from "@/lib/api";

export default function WmsDashboard() {
  const [occupancySummary, setOccupancySummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await api.get('/wms/locations/occupancy');
        setOccupancySummary(res.data || []);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    }
    loadStats();
  }, []);

  const totalCapacity = occupancySummary.reduce((acc, curr) => acc + (curr.capacity_volume || 0), 0);
  const totalUsed = occupancySummary.reduce((acc, curr) => acc + (curr.used_volume || 0), 0);
  const globalPct = totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0;

  const criticalLocations = occupancySummary.filter(l => l.thermal_status === 'CRITICAL').length;
  const mediumLocations = occupancySummary.filter(l => l.thermal_status === 'MEDIUM').length;
  const lowLocations = occupancySummary.filter(l => l.thermal_status === 'LOW').length;

  return (
    <div className="p-4 sm:p-8 w-full max-w-[1400px] mx-auto fade-in">
      {/* HEADER EJECUTIVO WMS */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>
        <div className="pl-4">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
             <i className="pi pi-box mr-3 text-emerald-500"></i>
             Central de Almacén (WMS)
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Recepción, control de ubicaciones, lotes y despachos.</p>
        </div>
      </div>

      {/* RESUMEN DE OCUPACIÓN VOLUMÉTRICA (KPI WIDGET LIGHT THEME) */}
      <div className="bg-white rounded-2xl p-6 mb-6 border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <i className="pi pi-chart-bar text-emerald-600 text-xl"></i>
              <h2 className="text-xl font-black tracking-tight text-slate-800">Resumen de Ocupación Volumétrica del Almacén</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">Monitor global de saturación física de pasillos, estantes y zonas de almacenamiento.</p>
          </div>

          <Link href="/locations" className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 bg-emerald-50 px-3.5 py-2 rounded-xl border border-emerald-200 transition-colors">
            Ver Mapa Térmico Completo <i className="pi pi-arrow-right text-[10px]"></i>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-xs text-slate-500 font-bold block uppercase tracking-wider">Ocupación Global</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-slate-800">{globalPct}%</span>
              <span className="text-xs text-slate-500 font-medium">del volumen total</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 mt-3 overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${Math.min(100, globalPct)}%` }}></div>
            </div>
          </div>

          <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200">
            <span className="text-xs text-emerald-800 font-bold block uppercase tracking-wider">Estantes Despejados</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-emerald-700">{lowLocations}</span>
              <span className="text-xs text-emerald-600 font-medium">ubicaciones</span>
            </div>
            <p className="text-[11px] text-emerald-600 mt-2 font-medium">&lt; 70% de llenado</p>
          </div>

          <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200">
            <span className="text-xs text-amber-800 font-bold block uppercase tracking-wider">Estantes Ocupados</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-amber-700">{mediumLocations}</span>
              <span className="text-xs text-amber-600 font-medium">ubicaciones</span>
            </div>
            <p className="text-[11px] text-amber-600 mt-2 font-medium">70% - 90% de llenado</p>
          </div>

          <div className="bg-red-50/50 p-4 rounded-xl border border-red-200">
            <span className="text-xs text-red-800 font-bold block uppercase tracking-wider">Zonas en Saturación</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-red-700">{criticalLocations}</span>
              <span className="text-xs text-red-600 font-medium">ubicaciones</span>
            </div>
            <p className="text-[11px] text-red-600 mt-2 font-medium">&gt; 90% de llenado (Reubicación urgente)</p>
          </div>
        </div>
      </div>

      {/* MÓDULOS DEL MENÚ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href="/receipts" className="block">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all cursor-pointer relative overflow-hidden group">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4 text-slate-700 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                    <i className="pi pi-truck text-2xl"></i>
                  </div>
                  <h2 className="text-xl font-black tracking-tight text-slate-800">Muelle de Recepción</h2>
                  <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                      Escanea e ingresa físicamente la mercancía proveniente de las Órdenes de Compra.
                  </p>
              </div>
          </Link>

          <Link href="/shipments" className="block">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all cursor-pointer relative overflow-hidden group">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4 text-slate-700 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                    <i className="pi pi-send text-2xl"></i>
                  </div>
                  <h2 className="text-xl font-black tracking-tight text-slate-800">Despachos & Picking</h2>
                  <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                      Preparación de carga por pasillos y despacho de pedidos.
                  </p>
              </div>
          </Link>

          <Link href="/locations" className="block">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all cursor-pointer relative overflow-hidden group">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4 text-slate-700 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                    <i className="pi pi-sitemap text-2xl"></i>
                  </div>
                  <h2 className="text-xl font-black tracking-tight text-slate-800">Mapa de Almacén</h2>
                  <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                      Control jerárquico de pasillos, racks y movimientos Putaway.
                  </p>
              </div>
          </Link>

          <Link href="/lots" className="block">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all cursor-pointer relative overflow-hidden group">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4 text-slate-700 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                    <i className="pi pi-calendar-plus text-2xl"></i>
                  </div>
                  <h2 className="text-xl font-black tracking-tight text-slate-800">Control de Lotes & FEFO</h2>
                  <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                      Trazabilidad por lote y monitor de vencimientos.
                  </p>
              </div>
          </Link>

          <Link href="/adjustments" className="block">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all cursor-pointer relative overflow-hidden group">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4 text-slate-700 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                    <i className="pi pi-sort-alt text-2xl"></i>
                  </div>
                  <h2 className="text-xl font-black tracking-tight text-slate-800">Ajustes & Tomas Físicas</h2>
                  <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                      Auditoría ciega e inventarios por ubicación.
                  </p>
              </div>
          </Link>
      </div>
    </div>
  );
}
