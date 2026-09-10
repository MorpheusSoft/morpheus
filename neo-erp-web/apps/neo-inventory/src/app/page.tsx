'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ValuationService } from '@/services/valuation.service';
import { PhysicalCountService } from '@/services/physical-count.service';

export default function InventoryDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<any>(null);

  // KPIs
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [totalValUsd, setTotalValUsd] = useState<number>(0);
  const [totalValVes, setTotalValVes] = useState<number>(0);
  const [totalValActualUsd, setTotalValActualUsd] = useState<number>(0);
  const [totalQty, setTotalQty] = useState<number>(0);
  const [totalSkus, setTotalSkus] = useState<number>(0);
  const [activeSessionsCount, setActiveSessionsCount] = useState<number>(0);
  const [topValuedItems, setTopValuedItems] = useState<any[]>([]);

  useEffect(() => {
    loadFacilities();
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [selectedFacility]);

  const loadFacilities = async () => {
    try {
      const data = await ValuationService.getFacilities();
      setFacilities(data || []);
    } catch (err) {
      console.error('Error cargando sucursales:', err);
    }
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const facilityId = selectedFacility ? selectedFacility.id : undefined;

      // Parallel fetch of valuation data and physical count sessions
      const [valData, sessionsData] = await Promise.all([
        ValuationService.getValuation({ facility_id: facilityId }),
        PhysicalCountService.getSessions(0, 100).catch(() => []),
      ]);

      if (valData) {
        setExchangeRate(valData.rate || 0);
        setTotalValUsd(valData.total_val_avg_usd || 0);
        setTotalValVes(valData.total_val_avg_ves || 0);
        setTotalValActualUsd(valData.total_val_actual_usd || 0);
        setTotalQty(valData.total_qty || 0);
        
        const items = valData.items || [];
        setTotalSkus(items.length);

        // Sort by total valuation USD descending for top 5
        const sorted = [...items].sort((a, b) => (b.val_total_avg_usd || 0) - (a.val_total_avg_usd || 0));
        setTopValuedItems(sorted.slice(0, 5));
      }

      if (Array.isArray(sessionsData)) {
        const active = sessionsData.filter(
          (s: any) => s.state === 'IN_PROGRESS' || s.state === 'DRAFT'
        );
        setActiveSessionsCount(active.length);
      }
    } catch (err) {
      console.error('Error cargando métricas del dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number, currency: 'USD' | 'VES' = 'USD') => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: currency === 'USD' ? 'USD' : 'VES',
      minimumFractionDigits: 2,
    }).format(val || 0);
  };

  const formatNumber = (val: number) => {
    return new Intl.NumberFormat('es-VE', {
      maximumFractionDigits: 2,
    }).format(val || 0);
  };

  const modules = [
    {
      title: 'Reporte Kardex',
      description: 'Trazabilidad cronológica de entradas, salidas y saldos con filtro por localidad y almacén.',
      icon: 'pi pi-table',
      href: '/kardex',
      color: 'from-cyan-500 to-blue-600',
      badge: 'Auditoría',
      badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    },
    {
      title: 'Valoración de Stock',
      description: 'Valuación oficial de existencias por costo promedio y costo actual en multidivisa (USD / VES).',
      icon: 'pi pi-chart-bar',
      href: '/valuation',
      color: 'from-emerald-500 to-teal-600',
      badge: 'Finanzas',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      title: 'Tomas Físicas',
      description: 'Conteos cíclicos, tomas a ciegas, importación por archivo plano y ajuste de faltantes/sobrantes.',
      icon: 'pi pi-check-square',
      href: '/physical-counts',
      color: 'from-violet-500 to-purple-600',
      badge: `${activeSessionsCount} activas`,
      badgeColor: activeSessionsCount > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200',
    },
    {
      title: 'Libro de Inventarios',
      description: 'Reporte fiscal formal mensual de entradas, despachos y saldos consolidado para entidades tributarias.',
      icon: 'pi pi-book',
      href: '/book',
      color: 'from-amber-500 to-orange-600',
      badge: 'Fiscal',
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    {
      title: 'Impresión de Etiquetas',
      description: 'Generación térmica de códigos de barras, QR y rotulado de estantes y productos.',
      icon: 'pi pi-print',
      href: '/labels',
      color: 'from-indigo-500 to-blue-700',
      badge: 'Almacén',
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    },
    {
      title: 'Asistente IA Inventario',
      description: 'Consultas en lenguaje natural, predicción de rotación y detección de desabastecimiento.',
      icon: 'pi pi-sparkles',
      href: '/asistente-ia',
      color: 'from-pink-500 to-rose-600',
      badge: 'Copilot',
      badgeColor: 'bg-pink-50 text-pink-700 border-pink-200',
    },
  ];

  return (
    <div className="w-full max-w-[1800px] mx-auto flex flex-col gap-6">
      
      {/* Top Header */}
      <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-cyan-100/40 rounded-full blur-3xl pointer-events-none"></div>
        
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25">
              <i className="pi pi-box text-2xl"></i>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 m-0 tracking-tight">
                Central de Inventarios & Valoración
              </h1>
              <p className="text-slate-500 text-sm mt-0.5 font-medium">
                Visión ejecutiva de existencias, valuación financiera y control de operaciones
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 z-10 w-full md:w-auto">
          {exchangeRate > 0 && (
            <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2 text-xs font-bold text-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Tasa BCV: <strong className="text-slate-900">{formatCurrency(exchangeRate, 'VES')}</strong></span>
            </div>
          )}

          <Dropdown
            value={selectedFacility}
            options={facilities}
            optionLabel="name"
            placeholder="Todas las Sucursales"
            onChange={(e) => setSelectedFacility(e.value)}
            showClear={!!selectedFacility}
            className="w-full md:w-56 !rounded-xl !bg-white border-slate-200 shadow-sm"
          />

          <Button
            icon="pi pi-refresh"
            rounded
            text
            severity="secondary"
            onClick={loadDashboardData}
            loading={loading}
            tooltip="Actualizar métricas"
          />
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Card 1: Valoración USD */}
        <div className="bg-white rounded-[1.75rem] p-5 border border-slate-100 shadow-lg shadow-slate-200/30 flex flex-col justify-between relative overflow-hidden group hover:shadow-xl transition-all duration-300">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Valoración Total</span>
              <h2 className="text-2xl lg:text-3xl font-black text-slate-900 mt-2 mb-0 tabular-nums">
                {loading ? '---' : formatCurrency(totalValUsd, 'USD')}
              </h2>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
              <i className="pi pi-dollar text-xl"></i>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Costo Actual:</span>
            <span className="font-bold text-slate-700">{loading ? '---' : formatCurrency(totalValActualUsd, 'USD')}</span>
          </div>
        </div>

        {/* Card 2: Valoración VES */}
        <div className="bg-white rounded-[1.75rem] p-5 border border-slate-100 shadow-lg shadow-slate-200/30 flex flex-col justify-between relative overflow-hidden group hover:shadow-xl transition-all duration-300">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Valoración Local</span>
              <h2 className="text-2xl lg:text-3xl font-black text-blue-700 mt-2 mb-0 tabular-nums">
                {loading ? '---' : formatCurrency(totalValVes, 'VES')}
              </h2>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
              <i className="pi pi-wallet text-xl"></i>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Tasa de Cambio:</span>
            <span className="font-bold text-blue-600">Bs. {exchangeRate.toFixed(2)} / $</span>
          </div>
        </div>

        {/* Card 3: Unidades & SKUs */}
        <div className="bg-white rounded-[1.75rem] p-5 border border-slate-100 shadow-lg shadow-slate-200/30 flex flex-col justify-between relative overflow-hidden group hover:shadow-xl transition-all duration-300">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Existencia Física</span>
              <h2 className="text-2xl lg:text-3xl font-black text-slate-900 mt-2 mb-0 tabular-nums">
                {loading ? '---' : `${formatNumber(totalQty)} U`}
              </h2>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-600 group-hover:scale-110 transition-transform">
              <i className="pi pi-box text-xl"></i>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>SKUs Activos en Stock:</span>
            <span className="font-bold text-cyan-700">{loading ? '---' : `${totalSkus} ítems`}</span>
          </div>
        </div>

        {/* Card 4: Tomas Físicas Activas */}
        <div className="bg-white rounded-[1.75rem] p-5 border border-slate-100 shadow-lg shadow-slate-200/30 flex flex-col justify-between relative overflow-hidden group hover:shadow-xl transition-all duration-300">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tomas Físicas</span>
              <h2 className="text-2xl lg:text-3xl font-black text-violet-700 mt-2 mb-0 tabular-nums">
                {loading ? '---' : activeSessionsCount}
              </h2>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 group-hover:scale-110 transition-transform">
              <i className="pi pi-check-square text-xl"></i>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Estado Operativo:</span>
            <Link href="/physical-counts" className="font-bold text-violet-600 hover:underline flex items-center gap-1">
              Ver sesiones <i className="pi pi-arrow-right text-[10px]"></i>
            </Link>
          </div>
        </div>

      </div>

      {/* Modules Quick Access Grid */}
      <div>
        <div className="flex justify-between items-center mb-4 px-1">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 m-0">Módulos de Inventario</h2>
            <p className="text-slate-500 text-xs mt-0.5">Acceso rápido a las herramientas operativas y contables</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {modules.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="bg-white rounded-[1.75rem] p-6 border border-slate-100 shadow-lg shadow-slate-200/30 hover:shadow-xl hover:border-slate-200 transition-all duration-300 group flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-center mb-4">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${m.color} flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform`}>
                    <i className={`${m.icon} text-xl`}></i>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${m.badgeColor}`}>
                    {m.badge}
                  </span>
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 group-hover:text-cyan-600 transition-colors m-0">
                  {m.title}
                </h3>
                <p className="text-slate-500 text-xs mt-2 leading-relaxed font-medium">
                  {m.description}
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-600 group-hover:text-cyan-600">
                <span>Ingresar al módulo</span>
                <i className="pi pi-arrow-right transform group-hover:translate-x-1 transition-transform"></i>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Top Valued Items Table */}
      {topValuedItems.length > 0 && (
        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 m-0">Productos con Mayor Valoración en Stock</h3>
              <p className="text-slate-500 text-xs mt-0.5">Top 5 referencias de inventario con mayor concentración de capital</p>
            </div>
            <Link href="/valuation">
              <Button label="Ver Valoración Completa" icon="pi pi-arrow-right" iconPos="right" text size="small" className="!font-bold !text-cyan-600" />
            </Link>
          </div>

          <DataTable
            value={topValuedItems}
            className="p-datatable-sm"
            responsiveLayout="scroll"
          >
            <Column field="sku" header="SKU" className="font-bold text-slate-700 text-xs" style={{ width: '15%' }}></Column>
            <Column field="name" header="PRODUCTO" className="font-semibold text-slate-800 text-xs" style={{ width: '35%' }}></Column>
            <Column field="category" header="CATEGORÍA" className="text-slate-500 text-xs" style={{ width: '20%' }}></Column>
            <Column
              field="qty"
              header="CANTIDAD"
              body={(r) => `${formatNumber(r.qty)} U`}
              className="font-bold text-slate-800 tabular-nums text-xs"
              style={{ width: '15%' }}
            ></Column>
            <Column
              field="val_total_avg_usd"
              header="VALORACIÓN USD"
              body={(r) => formatCurrency(r.val_total_avg_usd, 'USD')}
              className="font-black text-emerald-600 tabular-nums text-xs text-right"
              style={{ width: '15%' }}
            ></Column>
          </DataTable>
        </div>
      )}

    </div>
  );
}
