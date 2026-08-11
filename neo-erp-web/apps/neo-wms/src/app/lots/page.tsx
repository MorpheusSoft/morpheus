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

  const toggleQuarantine = async (batchId: number) => {
    try {
      const res = await api.post(`/wms/lots/${batchId}/toggle-quarantine`);
      toast.current?.show({ severity: 'info', summary: 'Estado de Lote', detail: res.data.message });
      fetchLots(search);
    } catch(e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo cambiar el estado del lote.' });
    }
  };

  const getStatusSeverity = (status: string) => {
    switch (status) {
      case 'BLOCKED': return 'danger';
      case 'EXPIRED': return 'danger';
      case 'WARNING': return 'warning';
      case 'OK': return 'success';
      default: return 'info';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'BLOCKED': return 'RETENIDO (CUARENTENA)';
      case 'EXPIRED': return 'VENCIDO';
      case 'WARNING': return 'POR VENCER (< 30 DÍAS)';
      case 'OK': return 'VIGENTE (FEFO OK)';
      default: return status;
    }
  };

  return (
    <div className="p-4 sm:p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />

      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-teal-500"></div>
        <div className="pl-4">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
            <i className="pi pi-calendar-plus text-teal-500 mr-3"></i>Control de Lotes & Estrategia FEFO
          </h1>
          <p className="text-slate-500 text-sm mt-1">Trazabilidad por número de lote, priorización por vencimiento (First Expired, First Out) y estado de stock.</p>
        </div>

        <div className="flex items-center gap-3">
          <InputText 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchLots(search)}
            placeholder="Buscar Lote, SKU o Producto..."
            className="text-sm p-inputtext-sm w-64 font-bold"
          />
          <Button
            icon="pi pi-search"
            severity="info"
            className="font-bold bg-teal-600 border-teal-600 text-white"
            onClick={() => fetchLots(search)}
          />
          <Button
            icon="pi pi-refresh"
            rounded
            outlined
            className="font-bold text-slate-600 border-slate-300 hover:bg-slate-50"
            onClick={() => fetchLots('')}
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <DataTable
          value={lots}
          loading={loading}
          paginator
          rows={12}
          emptyMessage="No hay lotes registrados o coincidentes."
          className="p-datatable-sm text-slate-700"
          stripedRows
          responsiveLayout="scroll"
        >
          <Column
            header="NÚMERO DE LOTE"
            field="batch_number"
            body={l => (
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs bg-slate-100 px-3 py-1 rounded text-slate-800 border border-slate-200">
                  {l.batch_number}
                </span>
                {l.is_fefo_recommended && (
                  <Tag value="FEFO RECOMENDADO" severity="success" className="text-[10px] px-2 py-0.5 font-bold" />
                )}
              </div>
            )}
            sortable
          />

          <Column field="sku" header="SKU" body={l => <span className="font-mono text-xs text-slate-500 font-bold">{l.sku}</span>} sortable />

          <Column field="product_name" header="PRODUCTO" body={l => <span className="font-bold text-slate-800">{l.product_name}</span>} sortable />

          <Column header="FECHA EXPIRACIÓN" body={l => (
            <span className="font-bold text-slate-700">
              {l.expiry_date || 'Sin Vencimiento'}
            </span>
          )} sortable />

          <Column header="DÍAS RESTANTES" body={l => (
            <span className={`font-bold text-xs ${l.days_to_expire !== null && l.days_to_expire < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {l.days_to_expire !== null ? (l.days_to_expire < 0 ? `Vencido hace ${Math.abs(l.days_to_expire)} días` : `${l.days_to_expire} días`) : 'N/A'}
            </span>
          )} align="center" sortable />

          <Column header="ESTADO FEFO" body={l => (
            <Tag severity={getStatusSeverity(l.status)} value={getStatusText(l.status)} className="font-bold text-[10px] px-2 py-1" />
          )} align="center" />

          <Column header="STOCK DISPONIBLE" body={l => (
            <span className="font-bold text-emerald-700 text-sm bg-emerald-50 px-3 py-1 rounded border border-emerald-200">
              {l.total_stock?.toLocaleString('en-US') || 0} Unds
            </span>
          )} align="right" sortable />

          <Column header="ACCIONES / CONTROL" body={l => (
            <Button
              label={l.is_quarantined ? "Liberar Stock" : "Retener (Cuarentena)"}
              icon={l.is_quarantined ? "pi pi-unlock" : "pi pi-lock"}
              severity={l.is_quarantined ? "success" : "danger"}
              size="small"
              onClick={() => toggleQuarantine(l.id)}
              className="font-bold text-xs shadow-sm"
            />
          )} align="center" style={{ width: '13rem' }} />
        </DataTable>
      </div>
    </div>
  );
}
