"use client";

import React, { useState, useEffect, useRef } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import axios from 'axios';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

export default function WmsReceiptsPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const toast = useRef<Toast>(null);
  const router = useRouter();

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await axios.get('http://localhost:8000/api/v1/purchase-orders/');
      // Solo ODCs que pueden recibirse físicamente (Que ya pasaron el filtro financiero)
      const recibibles = res.data.filter((o: any) => ['approved', 'sent', 'viewed', 'partial'].includes(o.status));
      setOrders(recibibles);
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Fallo al conectar con la base de logística.' });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const getStatusSeverity = (status: string) => {
      switch(status) {
          case 'approved': return 'info';
          case 'sent': return 'warning';
          case 'viewed': return 'success';
          case 'partial': return 'danger';
          default: return 'info';
      }
  };

  const getStatusName = (status: string) => {
      switch(status) {
          case 'approved': return 'Lista p/ Recibir';
          case 'sent': return 'En Tránsito (Email Emitido)';
          case 'viewed': return 'En Tránsito (Proveedor Confirmó)';
          case 'partial': return 'Recepción Parcial (Backorder)';
          default: return status.toUpperCase();
      }
  };

  return (
    <div className="p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex justify-between items-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-slate-800"></div>
        <div className="pl-4">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight"><i className="pi pi-truck text-slate-500 mr-3"></i>Muelle de Recepción (Inbound)</h1>
          <p className="text-slate-500 text-sm mt-1">Bandeja Ciega: Órdenes de Compra en Tránsito esperando ingreso físico.</p>
        </div>
        <div className="flex gap-4">
          <Button icon="pi pi-refresh" rounded outlined aria-label="Actualizar" onClick={fetchOrders} className="text-slate-600 border-slate-300 hover:bg-slate-50 font-bold" />
        </div>
      </div>
      
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <DataTable value={orders} loading={loading} emptyMessage="Muelle despejado. No hay camiones en cola ni ODCs válidas en tránsito." size="small" stripedRows rowHover className="text-sm border-t border-slate-100">
          <Column header="NÚMERO DE ODC" field="reference" body={r => (
              <span className="font-black tracking-widest text-slate-700 bg-slate-100 px-3 py-1.5 rounded text-xs border border-slate-200">{r.reference}</span>
          )} style={{ width: '12rem' }} />
          
          <Column header="FECHA DE EMISIÓN" field="created_at" body={r => (
             <span className="text-slate-500 font-bold bg-slate-50 px-2 py-1 rounded text-xs">
                <i className="pi pi-calendar text-[10px] mr-1 text-slate-400"></i> 
                {format(new Date(r.created_at), 'dd/MM/yyyy')} <span className="text-slate-400 font-normal ml-1">{format(new Date(r.created_at), 'HH:mm')}</span>
             </span>
          )} />

          <Column header="PROVEEDOR ORIGEN" field="supplier.name" body={r => (
              <span className="font-bold text-slate-800 flex items-center">
                  <i className="pi pi-building text-slate-400 mr-2"></i>{r.supplier.name}
              </span>
          )} />
          
          <Column header="ESTADO LOGÍSTICO" body={r => (
             <Tag severity={getStatusSeverity(r.status)} value={getStatusName(r.status)} className="font-extrabold tracking-wide uppercase text-[9px] px-2 py-1 shadow-sm border border-black/5" />
          )} align="center" />
          
          <Column header="ACCIÓN" body={r => (
             <div className="flex justify-end gap-2 pr-4">
                 <Button onClick={() => router.push('/receipts/' + r.id)} icon="pi pi-box" rounded severity="info" aria-label="Recibir" tooltip="Iniciar Conteo Físico" tooltipOptions={{position: 'top', showDelay: 400}} className="shadow-md hover:shadow-lg transition-all shadow-blue-500/30 font-bold" />
             </div>
          )} align="right" style={{ width: '8rem' }} />
        </DataTable>
      </div>
    </div>
  );
}
