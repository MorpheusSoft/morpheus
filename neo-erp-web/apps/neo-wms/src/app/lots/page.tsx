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
    <div className="p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-teal-500"></div>
        <div className="pl-4">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
            <i className="pi pi-calendar-plus text-teal-500 mr-3"></i>Control de Lotes y FEFO
          </h1>
          <p className="text-slate-500 text-sm mt-1">Trazabilidad por número de lote, semáforos de expiración y stock disponible.</p>
        </div>

        <div className="flex items-center gap-3">
          <InputText 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchLots(search)}
            placeholder="Buscar Lote, SKU o Producto..."
            className="text-xs p-inputtext-sm font-bold w-64"
          />
          <Button icon="pi pi-search" size="small" onClick={() => fetchLots(search)} />
          <Button icon="pi pi-refresh" rounded outlined onClick={() => fetchLots('')} />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <DataTable value={lots} loading={loading} emptyMessage="No hay lotes registrados o coincidentes." size="small" stripedRows rowHover className="text-sm">
          <Column header="NÚMERO DE LOTE" field="batch_number" body={l => (
            <span className="font-mono font-black text-xs bg-slate-100 px-3 py-1.5 rounded text-slate-800 border border-slate-200">
              {l.batch_number}
            </span>
          )} style={{ width: '12rem' }} />

          <Column header="SKU" field="sku" body={l => <span className="font-mono text-xs text-slate-500 font-bold">{l.sku}</span>} />

          <Column header="PRODUCTO" field="product_name" body={l => <span className="font-bold text-slate-800">{l.product_name}</span>} />

          <Column header="FECHA EXPIRACIÓN (FEFO)" body={l => (
            <span className="font-bold text-slate-700">
              {l.expiry_date || 'Sin Fecha de Caducidad'}
            </span>
          )} />

          <Column header="DÍAS RESTANTES" body={l => (
            <span className={`font-black ${l.days_to_expire !== null && l.days_to_expire < 0 ? 'text-red-600' : 'text-slate-700'}`}>
              {l.days_to_expire !== null ? `${l.days_to_expire} días` : 'N/A'}
            </span>
          )} align="center" />

          <Column header="ESTADO FEFO" body={l => (
            <Tag severity={getStatusSeverity(l.status)} value={getStatusText(l.status)} className="font-extrabold text-[9px] px-2 py-1" />
          )} align="center" />

          <Column header="STOCK DISPONIBLE" body={l => (
            <span className="font-black text-emerald-600 text-sm bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
              {l.total_stock?.toLocaleString('en-US')} Unds
            </span>
          )} align="right" />
        </DataTable>
      </div>
    </div>
  );
}
