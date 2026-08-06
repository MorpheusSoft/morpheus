"use client";

import React, { useState, useEffect, useRef } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import { TabView, TabPanel } from 'primereact/tabview';
import api from '@/lib/api';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

// Global in-memory cache for instant zero-latency page transitions
let globalWmsOrdersCache: any[] | null = null;
let globalWmsCacheTimestamp: number = 0;

export default function WmsReceiptsPage() {
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [completedOrders, setCompletedOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(!globalWmsOrdersCache);
  
  const [activeIndex, setActiveIndex] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const savedTab = sessionStorage.getItem('wms_activeIndex');
      return savedTab ? parseInt(savedTab, 10) : 0;
    }
    return 0;
  });

  const toast = useRef<Toast>(null);
  const router = useRouter();

  const handleTabChange = (index: number) => {
    setActiveIndex(index);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('wms_activeIndex', index.toString());
    }
  };

  const processAndSetOrders = (allOrders: any[]) => {
    const pending = allOrders.filter((o: any) => ['approved', 'sent', 'viewed', 'partial'].includes(o.status));
    const completed = allOrders.filter((o: any) => o.status === 'received');
    setPendingOrders(pending);
    setCompletedOrders(completed);
  };

  const fetchOrders = async (silent: boolean = false) => {
    if (!silent && !globalWmsOrdersCache) setLoading(true);
    try {
      const res = await api.get('/purchase-orders/');
      const allOrders = res.data || [];
      globalWmsOrdersCache = allOrders;
      globalWmsCacheTimestamp = Date.now();
      processAndSetOrders(allOrders);
    } catch (e) {
      if (!silent) {
        toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Fallo al conectar con la base de logística.' });
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    const isFresh = (Date.now() - globalWmsCacheTimestamp) < 30000;
    if (globalWmsOrdersCache && isFresh) {
      processAndSetOrders(globalWmsOrdersCache);
      setLoading(false);
      fetchOrders(true); // Revalidar en segundo plano
    } else {
      fetchOrders(false);
    }
  }, []);

  const getStatusSeverity = (status: string) => {
      switch(status) {
          case 'approved': return 'info';
          case 'sent': return 'warning';
          case 'viewed': return 'success';
          case 'partial': return 'danger';
          case 'received': return 'success';
          default: return 'info';
      }
  };

  const getStatusName = (status: string) => {
      switch(status) {
          case 'approved': return 'Lista p/ Recibir';
          case 'sent': return 'En Tránsito (Email Emitido)';
          case 'viewed': return 'En Tránsito (Proveedor Confirmó)';
          case 'partial': return 'Recepción Parcial (Backorder)';
          case 'received': return 'Recepción Completada';
          default: return status.toUpperCase();
      }
  };

  return (
    <div className="p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex justify-between items-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-slate-800"></div>
        <div className="pl-4">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
             <i className="pi pi-truck text-slate-500 mr-3"></i>Muelle de Recepción (Inbound)
          </h1>
          <p className="text-slate-500 text-sm mt-1">Gestión de recepciones en tránsito y consulta de actas históricas.</p>
        </div>
        <div className="flex gap-4">
          <Button icon="pi pi-refresh" rounded outlined aria-label="Actualizar" onClick={() => fetchOrders(false)} className="text-slate-600 border-slate-300 hover:bg-slate-50 font-bold" />
        </div>
      </div>
      
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden p-2">
        <TabView activeIndex={activeIndex} onTabChange={(e) => handleTabChange(e.index)}>
          <TabPanel header={`Por Recibir (${pendingOrders.length})`} leftIcon="pi pi-inbox mr-2">
            <DataTable value={pendingOrders} loading={loading} emptyMessage="Muelle despejado. No hay camiones en cola ni ODCs pendientes." size="small" stripedRows rowHover className="text-sm border-t border-slate-100 mt-2">
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
                     <Button onClick={() => router.push('/receipts/' + r.id)} label="Recibir" icon="pi pi-box" rounded severity="info" size="small" className="shadow-md hover:shadow-lg transition-all font-bold px-4" />
                 </div>
              )} align="right" style={{ width: '10rem' }} />
            </DataTable>
          </TabPanel>

          <TabPanel header={`Histórico Completadas (${completedOrders.length})`} leftIcon="pi pi-history mr-2">
            <DataTable value={completedOrders} loading={loading} emptyMessage="No hay historial de recepciones completadas." size="small" stripedRows rowHover className="text-sm border-t border-slate-100 mt-2">
              <Column header="NÚMERO DE ODC" field="reference" body={r => (
                  <span className="font-black tracking-widest text-slate-700 bg-slate-100 px-3 py-1.5 rounded text-xs border border-slate-200">{r.reference}</span>
              )} style={{ width: '12rem' }} />
              
              <Column header="FECHA CIERRE" field="updated_at" body={r => (
                 <span className="text-slate-500 font-bold bg-slate-50 px-2 py-1 rounded text-xs">
                    <i className="pi pi-check-circle text-[10px] mr-1 text-emerald-500"></i> 
                    {r.updated_at ? format(new Date(r.updated_at), 'dd/MM/yyyy HH:mm') : format(new Date(r.created_at), 'dd/MM/yyyy')}
                 </span>
              )} />

              <Column header="PROVEEDOR ORIGEN" field="supplier.name" body={r => (
                  <span className="font-bold text-slate-800 flex items-center">
                      <i className="pi pi-building text-slate-400 mr-2"></i>{r.supplier.name}
                  </span>
              )} />
              
              <Column header="ESTADO" body={r => (
                 <Tag severity="success" value="COMPLETADO (INGRESADO)" className="font-extrabold tracking-wide uppercase text-[9px] px-2 py-1 shadow-sm border border-emerald-500/20" />
              )} align="center" />
              
              <Column header="CONSULTA Y ACTA" body={r => (
                 <div className="flex justify-end gap-2 pr-4">
                     <Button onClick={() => router.push('/receipts/' + r.id)} label="Ver Acta 🖨️" icon="pi pi-file" rounded severity="secondary" outlined size="small" className="font-bold px-3 border-slate-300 text-slate-700 hover:bg-slate-100" />
                 </div>
              )} align="right" style={{ width: '12rem' }} />
            </DataTable>
          </TabPanel>
        </TabView>
      </div>
    </div>
  );
}
