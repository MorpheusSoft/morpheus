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
import { Dropdown } from 'primereact/dropdown';

// Global in-memory cache for instant zero-latency page transitions
let globalOrdersCache: any[] | null = null;
let globalCacheTimestamp: number = 0;

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<any[]>(() => globalOrdersCache || []);
  const [loading, setLoading] = useState<boolean>(!globalOrdersCache);
  
  // Persistir estado de filtros en sessionStorage para que no se pierdan al entrar/salir de una orden
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('pur_selectedSupplier') || null;
    }
    return null;
  });

  const [selectedFacility, setSelectedFacility] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('pur_selectedFacility') || null;
    }
    return null;
  });

  const [activeIndex, setActiveIndex] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const savedTab = sessionStorage.getItem('pur_activeIndex');
      return savedTab ? parseInt(savedTab, 10) : 0;
    }
    return 0;
  });

  const toast = useRef<Toast>(null);
  const router = useRouter();

  // Guardar en sessionStorage al cambiar filtros
  const handleSupplierChange = (val: string | null) => {
    setSelectedSupplier(val);
    if (typeof window !== 'undefined') {
      if (val) sessionStorage.setItem('pur_selectedSupplier', val);
      else sessionStorage.removeItem('pur_selectedSupplier');
    }
  };

  const handleFacilityChange = (val: string | null) => {
    setSelectedFacility(val);
    if (typeof window !== 'undefined') {
      if (val) sessionStorage.setItem('pur_selectedFacility', val);
      else sessionStorage.removeItem('pur_selectedFacility');
    }
  };

  const handleTabChange = (index: number) => {
    setActiveIndex(index);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pur_activeIndex', index.toString());
    }
  };

  const clearAllFilters = () => {
    setSelectedSupplier(null);
    setSelectedFacility(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('pur_selectedSupplier');
      sessionStorage.removeItem('pur_selectedFacility');
    }
  };

  const supplierOptions = React.useMemo(() => {
    const names = Array.from(new Set(orders.map((o: any) => o.supplier?.name).filter(Boolean)));
    return names.sort().map(name => ({ label: name, value: name }));
  }, [orders]);

  const facilityOptions = React.useMemo(() => {
    const names = Array.from(new Set(orders.map((o: any) => o.dest_facility?.name).filter(Boolean)));
    return names.sort().map(name => ({ label: name, value: name }));
  }, [orders]);

  // 1. Filtrar por Proveedor y Tienda Destino primero
  const baseFilteredOrders = React.useMemo(() => {
    return orders.filter((o: any) => {
      const matchSupplier = !selectedSupplier || o.supplier?.name === selectedSupplier;
      const matchFacility = !selectedFacility || o.dest_facility?.name === selectedFacility;
      return matchSupplier && matchFacility;
    });
  }, [orders, selectedSupplier, selectedFacility]);

  // 2. Contadores dinámicos que cambian en tiempo real al aplicar filtros
  const allCount = baseFilteredOrders.length;
  const draftCount = baseFilteredOrders.filter((o: any) => ['draft', 'pending_approval'].includes(o.status)).length;
  const transitCount = baseFilteredOrders.filter((o: any) => ['approved', 'sent', 'viewed', 'partial'].includes(o.status)).length;
  const receivedCount = baseFilteredOrders.filter((o: any) => o.status === 'received').length;

  // 3. Filtrar por la Pestaña activa
  const filteredOrders = React.useMemo(() => {
    return baseFilteredOrders.filter((o: any) => {
      if (activeIndex === 1) return ['draft', 'pending_approval'].includes(o.status);
      if (activeIndex === 2) return ['approved', 'sent', 'viewed', 'partial'].includes(o.status);
      if (activeIndex === 3) return o.status === 'received';
      return true; // Tab 0: Todas
    });
  }, [baseFilteredOrders, activeIndex]);

  const fetchOrders = async (silent: boolean = false) => {
    if (!silent && !globalOrdersCache) setLoading(true);
    try {
      const res = await api.get('/purchase-orders/');
      const data = res.data || [];
      setOrders(data);
      globalOrdersCache = data;
      globalCacheTimestamp = Date.now();
    } catch (e) {
      if (!silent) {
        toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las órdenes de compra.' });
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    // Si la caché tiene menos de 30 segundos, usar caché e invocar revalidación silenciosa
    const isFresh = (Date.now() - globalCacheTimestamp) < 30000;
    if (globalOrdersCache && isFresh) {
      setLoading(false);
      fetchOrders(true); // Revalidar en segundo plano sin pantalla de carga
    } else {
      fetchOrders(false);
    }
  }, []);

  const approveOrder = async (id: number) => {
    try {
        await api.put(`/purchase-orders/${id}/status`, { status: 'approved' });
        toast.current?.show({ severity: 'success', summary: 'Aprobada', detail: 'La Autorización Oficial fue registrada.', life: 3000 });
        fetchOrders(true);
    } catch(e: any) {
        const msg = e.response?.data?.detail || 'Fallo al autorizar la orden transaccional.';
        toast.current?.show({ severity: 'info', summary: 'Aviso de Autorización', detail: msg, life: 5000 });
        fetchOrders(true);
    }
  };

  const deleteOrder = async (id: number) => {
    if (!window.confirm("¿Está seguro de eliminar esta orden en borrador? Esta acción no se puede deshacer.")) return;
    try {
        await api.delete(`/purchase-orders/${id}`);
        toast.current?.show({ severity: 'success', summary: 'Eliminada', detail: 'La orden fue eliminada.', life: 3000 });
        fetchOrders(true);
    } catch(e: any) {
        toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al eliminar la orden.' });
    }
  };

  const getStatusSeverity = (status: string) => {
      switch(status) {
          case 'draft': return 'warning';
          case 'pending_approval': return 'danger';
          case 'approved': return 'info';
          case 'sent': return 'success';
          case 'received': return 'success';
          default: return 'info';
      }
  };

  const getStatusName = (status: string) => {
      switch(status) {
          case 'draft': return 'Borrador (Analista)';
          case 'pending_approval': return 'Autorización Gerencial';
          case 'approved': return 'Aprobada (Lista p/ Enviar)';
          case 'sent': return 'Enviada al Proveedor';
          case 'received': return 'Recibida en WMS';
          default: return status.toUpperCase();
      }
  };

  return (
    <div className="p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Autorización de Compras</h1>
          <p className="text-slate-500 text-sm mt-1">Gestión integral de Órdenes de Compra (Borradores, Aprobaciones, En Tránsito y Recibidas)</p>
        </div>
        <div className="flex gap-4">
          <Button label="Nueva Orden" icon="pi pi-plus" className="bg-indigo-600 hover:bg-indigo-700 border-none font-bold px-6 shadow-md shadow-indigo-500/20" onClick={() => router.push('/orders/new')} />
          <Button icon="pi pi-refresh" rounded outlined aria-label="Actualizar" onClick={() => fetchOrders(false)} />
        </div>
      </div>
      
      {/* Filtros de Proveedor y Tienda Destino */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-wrap gap-4 items-center">
         <div className="flex flex-col gap-1 w-full md:w-80">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filtrar por Proveedor</span>
            <Dropdown 
               value={selectedSupplier} 
               onChange={e => handleSupplierChange(e.value)} 
               options={supplierOptions} 
               placeholder="Todos los Proveedores" 
               showClear
               filter
               className="w-full text-sm !rounded-xl border-slate-200" 
            />
         </div>
         <div className="flex flex-col gap-1 w-full md:w-80">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filtrar por Destino (Tienda)</span>
            <Dropdown 
               value={selectedFacility} 
               onChange={e => handleFacilityChange(e.value)} 
               options={facilityOptions} 
               placeholder="Todas las Tiendas" 
               showClear
               filter
               className="w-full text-sm !rounded-xl border-slate-200" 
            />
         </div>
         {(selectedSupplier || selectedFacility) && (
            <Button 
               label="Limpiar Filtros" 
               icon="pi pi-filter-slash" 
               onClick={clearAllFilters} 
               className="p-button-text p-button-sm text-slate-500 font-bold mt-4" 
            />
         )}
      </div>
      
      {/* BANNER DE FILTROS ACTIVOS */}
      {(selectedSupplier || selectedFacility) && (
          <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between text-xs text-indigo-900 font-bold shadow-sm">
              <div className="flex items-center gap-2">
                  <i className="pi pi-filter-fill text-indigo-600"></i>
                  <span>
                      Filtro Conservado: {selectedFacility ? `Tienda "${selectedFacility}" ` : ''} 
                      {selectedSupplier ? `| Proveedor "${selectedSupplier}" ` : ''} 
                      — Mostrando {filteredOrders.length} de {orders.length} órdenes totales
                  </span>
              </div>
              <Button label="Quitar Filtros" icon="pi pi-times" text size="small" className="p-0 text-indigo-700 font-black hover:underline" onClick={clearAllFilters} />
          </div>
      )}

      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden p-2">
        <TabView activeIndex={activeIndex} onTabChange={(e) => handleTabChange(e.index)}>
          <TabPanel header={`Todas (${allCount})`} leftIcon="pi pi-list mr-2" />
          <TabPanel header={`Por Autorizar (${draftCount})`} leftIcon="pi pi-clock mr-2" />
          <TabPanel header={`Aprobadas / En Tránsito (${transitCount})`} leftIcon="pi pi-send mr-2" />
          <TabPanel header={`Recibidas WMS (${receivedCount})`} leftIcon="pi pi-check-circle mr-2" />
        </TabView>

        <DataTable value={filteredOrders} loading={loading} emptyMessage="No hay órdenes de compra que coincidan con el filtro seleccionado." size="small" stripedRows rowHover className="text-sm border-t border-slate-100 mt-2">
          <Column header="NÚMERO DE ODC" field="reference" body={r => (
              <span className="font-black tracking-widest text-slate-700 bg-slate-100 px-3 py-1.5 rounded text-xs border border-slate-200">{r.reference}</span>
          )} style={{ width: '12rem' }} />
          
          <Column header="FECHA DE CREACIÓN" field="created_at" body={r => (
             <span className="text-slate-500 font-bold bg-slate-50 px-2 py-1 rounded text-xs">
                <i className="pi pi-calendar text-[10px] mr-1 text-slate-400"></i> 
                {format(new Date(r.created_at), 'dd/MM/yyyy')} <span className="text-slate-400 font-normal ml-1">{format(new Date(r.created_at), 'HH:mm')}</span>
             </span>
          )} />
          
          <Column header="PROVEEDOR" body={(r: any) => (
             <span className="font-bold text-slate-800">{r.supplier ? r.supplier.name : 'S/N'}</span>
          )} style={{ minWidth: '15rem' }} />

          <Column header="DESTINO" body={(r: any) => (
             <span className="font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-1 rounded text-xs">
                <i className="pi pi-building text-[10px] mr-1 text-slate-400"></i>
                {r.dest_facility ? r.dest_facility.name : 'General (Libre)'}
             </span>
          )} style={{ minWidth: '12rem' }} />
          
          <Column header="ESTADO OPERATIVO" body={r => (
             <Tag severity={getStatusSeverity(r.status)} value={getStatusName(r.status)} className="font-extrabold tracking-wide uppercase text-[9px] px-2 py-1 shadow-sm border border-black/5" />
          )} align="center" />
          
          <Column header="IMPORTE TOTAL (NETO USD)" body={r => (
             <span className="font-black text-lg text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100/50 block w-fit ml-auto">
                <span className="text-sm font-bold text-emerald-500 mr-1">$</span>
                {parseFloat(r.total_amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
             </span>
          )} align="right" />
          
          <Column header="SELLO / ACCIONES" body={r => (
             <div className="flex justify-end gap-2">
                 <Button onClick={() => router.push('/orders/' + r.id)} icon="pi pi-eye" rounded severity="secondary" text aria-label="Ver Detalles" tooltip="Examinar Productos" tooltipOptions={{position: 'top', showDelay: 400}} />
                 {(r.status === 'draft' || r.status === 'pending_approval') && (
                     <>
                        {r.status === 'draft' && (
                            <Button onClick={() => deleteOrder(r.id)} icon="pi pi-trash" rounded severity="danger" text aria-label="Eliminar" tooltip="Eliminar Borrador" tooltipOptions={{position: 'top', showDelay: 400}} />
                        )}
                        <Button onClick={() => approveOrder(r.id)} icon="pi pi-check" rounded severity="success" aria-label="Aprobar" tooltip="Aprobar Oficialmente" tooltipOptions={{position: 'top', showDelay: 400}} className="shadow-md hover:shadow-lg transition-all shadow-emerald-500/30" />
                     </>
                 )}
             </div>
          )} align="center" style={{ width: '8rem' }} />
        </DataTable>
      </div>
    </div>
  );
}
