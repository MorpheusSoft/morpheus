"use client";

import React, { useState, useEffect, useRef } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import api from '@/lib/api';

export default function PurchasesDashboardPage() {
  const router = useRouter();
  const toast = useRef<Toast>(null);

  const [loading, setLoading] = useState(true);
  const [ceoMetrics, setCeoMetrics] = useState({
    pending_approval_usd: 0,
    pending_float_usd: 0,
    total_active_orders: 0,
    counts: {
      pending_approval: 0,
      pending_send: 0,
      pending_read: 0,
      pending_receipt: 0,
    }
  });

  const [claraDiagnosis, setClaraDiagnosis] = useState<{
    suppliers_immediate_stockout: number;
    suppliers_potential_stockout: number;
    total_projected_cost_usd: number;
    total_suppliers_analyzed: number;
    critical_suppliers: any[];
  }>({
    suppliers_immediate_stockout: 0,
    suppliers_potential_stockout: 0,
    total_projected_cost_usd: 0,
    total_suppliers_analyzed: 0,
    critical_suppliers: [],
  });

  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [ceoRes, diagRes, ordersRes] = await Promise.allSettled([
        api.get('/dashboard/ceo-inbox'),
        api.get('/mrp/diagnosis?facility_id=1'),
        api.get('/purchase-orders/?limit=8'),
      ]);

      if (ceoRes.status === 'fulfilled' && ceoRes.value?.data) {
        const data = ceoRes.value.data;
        setCeoMetrics({
          pending_approval_usd: data.pending_approval_usd || 0,
          pending_float_usd: data.pending_float_usd || 0,
          total_active_orders: data.total_active_orders || 0,
          counts: data.counts || {
            pending_approval: 0,
            pending_send: 0,
            pending_read: 0,
            pending_receipt: 0,
          },
        });
      }

      if (diagRes.status === 'fulfilled' && diagRes.value?.data) {
        const diag = diagRes.value.data;
        const critical = (diag.suppliers || [])
          .filter((s: any) => s.immediate_stockout_count > 0)
          .slice(0, 4);

        setClaraDiagnosis({
          suppliers_immediate_stockout: diag.suppliers_immediate_stockout || 0,
          suppliers_potential_stockout: diag.suppliers_potential_stockout || 0,
          total_projected_cost_usd: diag.total_projected_cost_usd || 0,
          total_suppliers_analyzed: diag.total_suppliers_analyzed || 0,
          critical_suppliers: critical,
        });
      }

      if (ordersRes.status === 'fulfilled' && ordersRes.value?.data) {
        setRecentOrders(ordersRes.value.data || []);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const getStatusSeverity = (status: string): "info" | "warning" | "success" | "secondary" | "danger" => {
    switch (status) {
      case 'approved': return 'info';
      case 'sent': return 'warning';
      case 'viewed': return 'info';
      case 'received': return 'success';
      case 'draft':
      case 'pending_approval': return 'secondary';
      case 'cancelled': return 'danger';
      default: return 'info';
    }
  };

  const getStatusName = (status: string) => {
    switch (status) {
      case 'approved': return 'Aprobada';
      case 'sent': return 'Enviada';
      case 'viewed': return 'En Tránsito';
      case 'received': return 'Recibida';
      case 'draft': return 'Borrador';
      case 'pending_approval': return 'Por Autorizar';
      case 'cancelled': return 'Cancelada';
      default: return status;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full max-w-[1400px] mx-auto flex flex-col gap-6 animate-fade-in">
      <Toast ref={toast} position="bottom-right" />

      {/* ENCABEZADO DE LA VISIÓN GENERAL */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-xs border border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-bold text-emerald-700 tracking-wider uppercase">Centro de Operaciones</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Visión General de Compras
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">
            Monitoreo en tiempo real, auditoría preventiva de quiebres con Clara y flujo transaccional.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            label="Actualizar"
            icon="pi pi-refresh"
            outlined
            severity="secondary"
            className="text-xs font-bold px-3 py-2 rounded-xl"
            onClick={fetchDashboardData}
            loading={loading}
          />
          <Button
            label="Nueva Orden"
            icon="pi pi-plus"
            className="!bg-emerald-600 hover:!bg-emerald-700 !border-none text-white text-xs font-bold px-4 py-2 rounded-xl shadow-md shadow-emerald-600/20"
            onClick={() => router.push('/orders/new')}
          />
        </div>
      </div>

      {/* TARJETAS KPI DE ESTADO DEL CICLO DE COMPRAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Autorización */}
        <div
          onClick={() => router.push('/orders?status=draft')}
          className="bg-white p-5 rounded-2xl shadow-xs border border-amber-200/80 border-l-4 border-l-amber-500 cursor-pointer hover:shadow-md hover:bg-amber-50/20 transition-all group"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Por Autorizar</p>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-800">
                {ceoMetrics.counts.pending_approval}
              </h3>
              <span className="text-xs sm:text-sm font-black text-amber-600">
                ${ceoMetrics.pending_approval_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <i className="pi pi-lock text-lg"></i>
            </div>
          </div>
          <div className="mt-3 text-[10px] font-bold text-slate-500 bg-slate-100/80 w-fit px-2 py-0.5 rounded">
            Total Retenido (Estancado)
          </div>
        </div>

        {/* Por Enviar */}
        <div
          onClick={() => router.push('/orders?status=transit')}
          className="bg-white p-5 rounded-2xl shadow-xs border border-sky-200/80 border-l-4 border-l-sky-500 cursor-pointer hover:shadow-md hover:bg-sky-50/20 transition-all group"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Por Enviar</p>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-800">
                {ceoMetrics.counts.pending_send}
              </h3>
              <span className="text-xs sm:text-sm font-black text-sky-600">
                ${ceoMetrics.pending_float_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <i className="pi pi-envelope text-lg"></i>
            </div>
          </div>
          <div className="mt-3 text-[10px] font-bold text-slate-500 bg-slate-100/80 w-fit px-2 py-0.5 rounded">
            Pasivo Flotante Aprobado
          </div>
        </div>

        {/* Por Leer */}
        <div
          onClick={() => router.push('/orders?status=transit')}
          className="bg-white p-5 rounded-2xl shadow-xs border border-yellow-200/80 border-l-4 border-l-yellow-500 cursor-pointer hover:shadow-md hover:bg-yellow-50/20 transition-all group"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Por Leer</p>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-800">
                {ceoMetrics.counts.pending_read}
              </h3>
              <span className="text-xs font-bold text-yellow-600">Pendiente de apertura</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-yellow-50 text-yellow-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <i className="pi pi-eye-slash text-lg"></i>
            </div>
          </div>
          <div className="mt-3 text-[10px] font-bold text-yellow-700 bg-yellow-50 w-fit px-2 py-0.5 rounded">
            Enviadas a Proveedor
          </div>
        </div>

        {/* En Tránsito */}
        <div
          onClick={() => router.push('/orders?status=transit')}
          className="bg-white p-5 rounded-2xl shadow-xs border border-emerald-200/80 border-l-4 border-l-emerald-500 cursor-pointer hover:shadow-md hover:bg-emerald-50/20 transition-all group"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">En Tránsito</p>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-800">
                {ceoMetrics.counts.pending_receipt}
              </h3>
              <span className="text-xs font-bold text-emerald-600">Vienen en camino</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <i className="pi pi-truck text-lg"></i>
            </div>
          </div>
          <div className="mt-3 text-[10px] font-bold text-emerald-700 bg-emerald-50 w-fit px-2 py-0.5 rounded">
            Confirmadas por WMS
          </div>
        </div>
      </div>

      {/* WIDGET HERO: DIAGNÓSTICO EJECUTIVO DE CLARA COMPRAS */}
      <div className="bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] text-white p-6 rounded-3xl shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Diagnóstico en Memoria Activo (0.72s)
              </span>
              <span className="text-slate-400 text-xs hidden sm:inline">• Clara Digital Worker</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
              <i className="pi pi-sparkles text-emerald-400 text-xl"></i>
              Diagnóstico Autónomo de Catálogo y Quiebres
            </h2>
            <p className="text-slate-400 text-xs mt-1 max-w-2xl leading-relaxed">
              Clara audita en tiempo real {claraDiagnosis.total_suppliers_analyzed || 435} proveedores y su inventario, identificando quiebres inminentes sin generar órdenes ciegas masivas ni saturar la base de datos.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Button
              label="Abrir Consola Clara"
              icon="pi pi-external-link"
              className="!bg-emerald-600 hover:!bg-emerald-500 !border-none text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30"
              onClick={() => router.push('/settings/bot')}
            />
            <Button
              label="Consultar con Copilot"
              icon="pi pi-comments"
              outlined
              className="!border-slate-600 hover:!border-slate-500 !text-slate-200 text-xs font-bold px-4 py-2.5 rounded-xl"
              onClick={() => window.dispatchEvent(new CustomEvent('open-digital-copilot'))}
            />
          </div>
        </div>

        {/* METRICAS DE CLARA */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative z-10">
          <div className="bg-slate-800/60 backdrop-blur-xs p-4 rounded-2xl border border-slate-700/60">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-400">Quiebre Inmediato</span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-rose-300">
              {claraDiagnosis.suppliers_immediate_stockout}
            </p>
            <span className="text-[10px] text-slate-400">Proveedores en stock cero</span>
          </div>

          <div className="bg-slate-800/60 backdrop-blur-xs p-4 rounded-2xl border border-slate-700/60">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">En Riesgo</span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-amber-300">
              {claraDiagnosis.suppliers_potential_stockout}
            </p>
            <span className="text-[10px] text-slate-400">Menos de 7 días de stock</span>
          </div>

          <div className="bg-slate-800/60 backdrop-blur-xs p-4 rounded-2xl border border-slate-700/60">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">Inversión Sugerida</span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-300">
              ${Number(claraDiagnosis.total_projected_cost_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
            <span className="text-[10px] text-slate-400">Reposición óptima en USD</span>
          </div>

          <div className="bg-slate-800/60 backdrop-blur-xs p-4 rounded-2xl border border-slate-700/60">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-400">Catálogo Auditado</span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-cyan-300">
              {claraDiagnosis.total_suppliers_analyzed}
            </p>
            <span className="text-[10px] text-slate-400">Proveedores en tiempo real</span>
          </div>
        </div>

        {/* ALERTA RÁPIDA DE PROVEEDORES CRÍTICOS */}
        {claraDiagnosis.critical_suppliers.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Proveedores de alta urgencia:</span>
            {claraDiagnosis.critical_suppliers.map((supp, idx) => (
              <span
                key={idx}
                onClick={() => router.push('/settings/bot')}
                className="bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors flex items-center gap-1.5 text-[11px]"
              >
                <i className="pi pi-exclamation-circle text-rose-400 text-[10px]"></i>
                {supp.supplier_name}
                <span className="text-slate-400 font-normal">({supp.immediate_stockout_count} SKUs)</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* TABLA DE ÓRDENES DE COMPRA RECIENTES */}
      <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <i className="pi pi-file text-slate-400 text-base"></i>
              Órdenes de Compra Recientes
            </h2>
            <p className="text-slate-500 text-xs mt-0.5">
              Últimas transacciones generadas en el sistema por compradores y asistentes.
            </p>
          </div>

          <Button
            label="Ver Todas las Órdenes"
            icon="pi pi-arrow-right"
            iconPos="right"
            text
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800"
            onClick={() => router.push('/orders')}
          />
        </div>

        <DataTable
          value={recentOrders}
          loading={loading}
          emptyMessage="No hay órdenes de compra registradas recientemente."
          size="small"
          stripedRows
          rowHover
          className="text-xs"
        >
          <Column
            header="NÚMERO ODC"
            field="reference"
            body={(r: any) => (
              <span
                onClick={() => router.push(`/orders/${r.id}`)}
                className="font-mono font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg border border-slate-200/80 cursor-pointer transition-colors"
              >
                {r.reference || `ODC-${r.id}`}
              </span>
            )}
            style={{ width: '11rem' }}
          />

          <Column
            header="PROVEEDOR"
            body={(r: any) => (
              <span className="font-bold text-slate-800">
                {r.supplier?.name || 'Proveedor no especificado'}
              </span>
            )}
            style={{ minWidth: '14rem' }}
          />

          <Column
            header="DESTINO"
            body={(r: any) => (
              <span className="text-slate-600 bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded text-[11px] font-medium">
                <i className="pi pi-building text-[10px] mr-1 text-slate-400"></i>
                {r.dest_facility?.name || 'Almacén Central'}
              </span>
            )}
          />

          <Column
            header="FECHA"
            field="created_at"
            body={(r: any) => (
              <span className="text-slate-500 text-[11px]">
                {r.created_at ? format(new Date(r.created_at), 'dd/MM/yyyy HH:mm') : '—'}
              </span>
            )}
          />

          <Column
            header="ESTADO"
            body={(r: any) => (
              <Tag
                severity={getStatusSeverity(r.status)}
                value={getStatusName(r.status)}
                className="font-extrabold uppercase text-[9px] px-2 py-0.5"
              />
            )}
            align="center"
          />

          <Column
            header="TOTAL USD"
            body={(r: any) => (
              <span className="font-mono font-extrabold text-slate-900">
                ${Number(r.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
            align="right"
          />

          <Column
            header="ACCIÓN"
            body={(r: any) => (
              <Button
                icon="pi pi-eye"
                rounded
                text
                severity="secondary"
                aria-label="Ver ODC"
                onClick={() => router.push(`/orders/${r.id}`)}
                className="w-8 h-8"
              />
            )}
            align="center"
            style={{ width: '4rem' }}
          />
        </DataTable>
      </div>
    </div>
  );
}
