"use client";

import React, { useState, useEffect, useRef } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import { InputText } from 'primereact/inputtext';
import api from '@/lib/api';

export default function WmsLotsPage() {
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const toast = useRef<Toast>(null);

  const fetchLots = async (queryStr = '') => {
    setLoading(true);
    try {
      const res = await api.get(`/wms/lots?query=${encodeURIComponent(queryStr)}`);
      setLots(res.data || []);
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar los lotes.' });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLots();
  }, []);

  const getStatusSeverity = (status: string) => {
    switch (status) {
      case 'EXPIRED': return 'danger';
      case 'WARNING': return 'warning';
      case 'OK': return 'success';
      default: return 'info';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'EXPIRED': return 'VENCIDO';
      case 'WARNING': return 'POR VENCER (< 30 DÍAS)';
      case 'OK': return 'VIGENTE (FEFO OK)';
      default: return status;
    }
  };

  return (
    <div className="p-6 bg-[#0f172a] min-h-screen text-slate-200">
      <Toast ref={toast} position="bottom-right" />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 pb-4 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <i className="pi pi-calendar-plus text-xl"></i>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Control de Lotes & Estrategia FEFO</h1>
              <p className="text-slate-400 text-sm">Trazabilidad por número de lote, priorización por vencimiento (First Expired, First Out) y estado de stock.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <InputText 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchLots(search)}
            placeholder="Buscar Lote, SKU o Producto..."
            className="text-sm p-inputtext-sm bg-slate-900 border-slate-700 text-white w-64"
          />
          <Button
            icon="pi pi-search"
            className="p-button-success bg-teal-500 hover:bg-teal-600 border-none px-3"
            onClick={() => fetchLots(search)}
          />
          <Button
            icon="pi pi-refresh"
            className="p-button-outlined p-button-secondary border-slate-700 text-slate-300 hover:bg-slate-800"
            onClick={() => fetchLots('')}
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-[#1e293b]/60 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-md p-4">
        <DataTable
          value={lots}
          loading={loading}
          paginator
          rows={12}
          emptyMessage="No hay lotes registrados o coincidentes."
          className="p-datatable-sm text-slate-300"
          stripedRows
          responsiveLayout="scroll"
        >
          <Column
            header="NÚMERO DE LOTE"
            field="batch_number"
            body={l => (
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs bg-slate-900 px-3 py-1 rounded text-teal-400 border border-teal-500/30">
                  {l.batch_number}
                </span>
                {l.is_fefo_recommended && (
                  <Tag value="FEFO RECOMENDADO" severity="success" className="text-[10px] px-2 py-0.5" />
                )}
              </div>
            )}
            sortable
          />

          <Column field="sku" header="SKU" body={l => <span className="font-mono text-xs text-slate-400 font-semibold">{l.sku}</span>} sortable />

          <Column field="product_name" header="PRODUCTO" body={l => <span className="font-medium text-slate-100">{l.product_name}</span>} sortable />

          <Column header="FECHA EXPIRACIÓN" body={l => (
            <span className="font-semibold text-slate-200">
              {l.expiry_date || 'Sin Vencimiento'}
            </span>
          )} sortable />

          <Column header="DÍAS RESTANTES" body={l => (
            <span className={`font-bold text-xs ${l.days_to_expire !== null && l.days_to_expire < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {l.days_to_expire !== null ? (l.days_to_expire < 0 ? `Vencido hace ${Math.abs(l.days_to_expire)} días` : `${l.days_to_expire} días`) : 'N/A'}
            </span>
          )} align="center" sortable />

          <Column header="ESTADO FEFO" body={l => (
            <Tag severity={getStatusSeverity(l.status)} value={getStatusText(l.status)} className="font-bold text-[10px] px-2 py-1" />
          )} align="center" />

          <Column header="STOCK DISPONIBLE" body={l => (
            <span className="font-bold text-emerald-400 text-sm bg-emerald-950/40 px-3 py-1 rounded border border-emerald-800/40">
              {l.total_stock?.toLocaleString('en-US') || 0} Unds
            </span>
          )} align="right" sortable />
        </DataTable>
      </div>
    </div>
  );
}
