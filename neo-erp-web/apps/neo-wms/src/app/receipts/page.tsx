"use client";

import React, { useState, useEffect, useRef } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import { TabView, TabPanel } from 'primereact/tabview';
import { Dropdown } from 'primereact/dropdown';
import api from '@/lib/api';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

// Global in-memory cache for instant zero-latency page transitions
let globalWmsOrdersCache: any[] | null = null;
let globalWmsCacheTimestamp: number = 0;

export default function WmsReceiptsPage() {
  const [allOrdersList, setAllOrdersList] = useState<any[]>(() => globalWmsOrdersCache || []);
  const [loading, setLoading] = useState<boolean>(!globalWmsOrdersCache);
  
  // Persistir filtros por Sucursal y Proveedor en sessionStorage para el fiscal del muelle
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('wms_selectedSupplier') || null;
    }
    return null;
  });

  const [selectedFacility, setSelectedFacility] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('wms_selectedFacility') || null;
    }
    return null;
  });

  const [activeIndex, setActiveIndex] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const savedTab = sessionStorage.getItem('wms_activeIndex');
      return savedTab ? parseInt(savedTab, 10) : 0;
    }
    return 0;
  });

  const toast = useRef<Toast>(null);
  const router = useRouter();

  const handleSupplierChange = (val: string | null) => {
    setSelectedSupplier(val);
    if (typeof window !== 'undefined') {
      if (val) sessionStorage.setItem('wms_selectedSupplier', val);
      else sessionStorage.removeItem('wms_selectedSupplier');
    }
  };

  const handleFacilityChange = (val: string | null) => {
    setSelectedFacility(val);
    if (typeof window !== 'undefined') {
      if (val) sessionStorage.setItem('wms_selectedFacility', val);
      else sessionStorage.removeItem('wms_selectedFacility');
    }
  };

  const handleTabChange = (index: number) => {
    setActiveIndex(index);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('wms_activeIndex', index.toString());
    }
  };

  const clearAllFilters = () => {
    setSelectedSupplier(null);
    setSelectedFacility(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('wms_selectedSupplier');
      sessionStorage.removeItem('wms_selectedFacility');
    }
  };

  const supplierOptions = React.useMemo(() => {
    const names = Array.from(new Set(allOrdersList.map((o: any) => o.supplier?.name).filter(Boolean)));
    return names.sort().map(name => ({ label: name, value: name }));
  }, [allOrdersList]);

  const facilityOptions = React.useMemo(() => {
    const names = Array.from(new Set(allOrdersList.map((o: any) => o.dest_facility?.name).filter(Boolean)));
    return names.sort().map(name => ({ label: name, value: name }));
  }, [allOrdersList]);

  // 1. Filtrar globalmente por Sucursal Destino y Proveedor Origen
  const baseFilteredOrders = React.useMemo(() => {
    return allOrdersList.filter((o: any) => {
      const matchSupplier = !selectedSupplier || o.supplier?.name === selectedSupplier;
      const matchFacility = !selectedFacility || o.dest_facility?.name === selectedFacility;
      return matchSupplier && matchFacility;
    });
  }, [allOrdersList, selectedSupplier, selectedFacility]);

  // 2. Separar por Estado Logístico tras aplicar filtros de sucursal
  const pendingOrders = React.useMemo(() => {
    return baseFilteredOrders.filter((o: any) => ['approved', 'sent', 'viewed', 'partial'].includes(o.status));
  }, [baseFilteredOrders]);

  const completedOrders = React.useMemo(() => {
    return baseFilteredOrders.filter((o: any) => o.status === 'received');
  }, [baseFilteredOrders]);

  const fetchOrders = async (silent: boolean = false) => {
    if (!silent && !globalWmsOrdersCache) setLoading(true);
    try {
      const res = await api.get('/purchase-orders/');
      const data = res.data || [];
      globalWmsOrdersCache = data;
      globalWmsCacheTimestamp = Date.now();
      setAllOrdersList(data);
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
      setAllOrdersList(globalWmsOrdersCache);
      setLoading(false);
      fetchOrders(true); // Revalidación en segundo plano
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
      
      {/* CABECERA PRINCIPAL */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex justify-between items-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-slate-800"></div>
        <div className="pl-4">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
             <i className="pi pi-truck text-slate-500 mr-3"></i>Muelle de Recepción (Inbound WMS)
          </h1>
          <p className="text-slate-500 text-sm mt-1">Inspección de camiones en muelle y descarga por Sucursal / Tienda de Destino.</p>
        </div>
        <div className="flex gap-4">
          <Button icon="pi pi-refresh" rounded outlined aria-label="Actualizar" onClick={() => fetchOrders(false)} className="text-slate-600 border-slate-300 hover:bg-slate-50 font-bold" />
        </div>
      </div>
      
      {/* FILTROS DE MUELLE (SUCURSAL DESTINO Y PROVEEDOR) */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-wrap gap-4 items-center">
         <div className="flex flex-col gap-1 w-full md:w-80 relative">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center">
                <i className="pi pi-building mr-1 text-slate-400"></i>Sucursal / Tienda de Destino:
            </span>
            <Dropdown 
               value={selectedFacility} 
               onChange={e => handleFacilityChange(e.value)} 
               options={facilityOptions} 
               placeholder="Todas las Sucursales" 
               showClear
               filter
               appendTo="self"
               panelClassName="!w-full !min-w-[280px] shadow-2xl rounded-xl border border-slate-200"
               className="w-full text-sm !rounded-xl border-slate-200 font-bold" 
            />
         </div>

         <div className="flex flex-col gap-1 w-full md:w-80 relative">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center">
                <i className="pi pi-users mr-1 text-slate-400"></i>Proveedor Origen:
            </span>
            <Dropdown 
               value={selectedSupplier} 
               onChange={e => handleSupplierChange(e.value)} 
               options={supplierOptions} 
               placeholder="Todos los Proveedores" 
               showClear
               filter
               appendTo="self"
               panelClassName="!w-full !min-w-[280px] shadow-2xl rounded-xl border border-slate-200"
               className="w-full text-sm !rounded-xl border-slate-200 font-bold" 
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

      {/* BANNER DE MUELLE FILTRADO */}
      {(selectedSupplier || selectedFacility) && (
          <div className="mb-4 p-3 bg-slate-800 text-white rounded-xl flex items-center justify-between text-xs font-bold shadow-md">
              <div className="flex items-center gap-2">
                  <i className="pi pi-filter-fill text-blue-400"></i>
                  <span>
                      Muelle Filtrado: {selectedFacility ? `Sucursal "${selectedFacility}" ` : ''} 
                      {selectedSupplier ? `| Proveedor "${selectedSupplier}" ` : ''} 
                      — {pendingOrders.length} camiones por recibir | {completedOrders.length} recepciones históricas
                  </span>
              </div>
              <Button label="Quitar Filtro" icon="pi pi-times" text size="small" className="p-0 text-slate-300 hover:text-white font-black" onClick={clearAllFilters} />
          </div>
      )}

      {/* BANDEJA CON PESTAÑAS */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden p-2">
        <TabView activeIndex={activeIndex} onTabChange={(e) => handleTabChange(e.index)}>
          
          {/* PESTAÑA: POR RECIBIR */}
          <TabPanel header={`Por Recibir en Muelle (${pendingOrders.length})`} leftIcon="pi pi-inbox mr-2">
            <DataTable value={pendingOrders} loading={loading} emptyMessage="Muelle despejado. No hay camiones pendientes para la sucursal seleccionada." size="small" stripedRows rowHover className="text-sm border-t border-slate-100 mt-2">
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
                      <i className="pi pi-building text-slate-400 mr-2"></i>{r.supplier?.name || 'S/N'}
                  </span>
              )} />

              <Column header="SUCURSAL DESTINO" field="dest_facility.name" body={r => (
                  <span className="font-extrabold text-slate-700 bg-slate-100 px-2.5 py-1 rounded border border-slate-200 text-xs inline-flex items-center">
                      <i className="pi pi-map-marker text-blue-500 mr-1.5"></i>
                      {r.dest_facility?.name || 'General'}
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

          {/* PESTAÑA: HISTÓRICO COMPLETADAS */}
          <TabPanel header={`Histórico Completadas (${completedOrders.length})`} leftIcon="pi pi-history mr-2">
            <DataTable value={completedOrders} loading={loading} emptyMessage="No hay historial de recepciones completadas para la sucursal seleccionada." size="small" stripedRows rowHover className="text-sm border-t border-slate-100 mt-2">
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
                      <i className="pi pi-building text-slate-400 mr-2"></i>{r.supplier?.name || 'S/N'}
                  </span>
              )} />

              <Column header="SUCURSAL DESTINO" field="dest_facility.name" body={r => (
                  <span className="font-extrabold text-slate-700 bg-slate-100 px-2.5 py-1 rounded border border-slate-200 text-xs inline-flex items-center">
                      <i className="pi pi-map-marker text-emerald-600 mr-1.5"></i>
                      {r.dest_facility?.name || 'General'}
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
