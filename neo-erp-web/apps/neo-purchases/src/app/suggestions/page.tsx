"use client";

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import api from '@/lib/api';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { Dropdown } from 'primereact/dropdown';

function SuggestionsContent() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<string | null>(null);

  const toast = useRef<Toast>(null);
  const router = useRouter();

  const fetchOrders = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/purchase-orders/');
      const data = res.data || [];
      // Solo órdenes en estado draft o pending_approval (Sugeridos de Reposición)
      const suggestions = data.filter((o: any) => ['draft', 'pending_approval'].includes(o.status));
      setOrders(suggestions);
    } catch (e) {
      if (!silent) {
        toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar los sugeridos de reposición.' });
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const approveOrder = async (id: number) => {
    try {
      await api.put(`/purchase-orders/${id}/status`, { status: 'approved' });
      toast.current?.show({ severity: 'success', summary: 'Aprobada', detail: 'La Orden fue autorizada oficialmente.', life: 3000 });
      fetchOrders(true);
    } catch (e: any) {
      const msg = e.response?.data?.detail || 'Fallo al autorizar la orden.';
      toast.current?.show({ severity: 'info', summary: 'Aviso', detail: msg, life: 5000 });
      fetchOrders(true);
    }
  };

  const deleteOrder = async (id: number) => {
    if (!window.confirm("¿Está seguro de descartar esta propuesta de reposición?")) return;
    try {
      await api.delete(`/purchase-orders/${id}`);
      toast.current?.show({ severity: 'success', summary: 'Descartada', detail: 'La propuesta fue eliminada.', life: 3000 });
      fetchOrders(true);
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al eliminar.' });
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

  const filteredOrders = React.useMemo(() => {
    return orders.filter((o: any) => {
      const matchSupplier = !selectedSupplier || o.supplier?.name === selectedSupplier;
      const matchFacility = !selectedFacility || o.dest_facility?.name === selectedFacility;
      return matchSupplier && matchFacility;
    });
  }, [orders, selectedSupplier, selectedFacility]);

  return (
    <div className="p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />
      
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛍️</span>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Sugeridos de Reposición (MRP)</h1>
          </div>
          <p className="text-slate-500 text-sm mt-1">Propuestas automáticas de compra generadas por el bot y borradores pendientes por autorizar</p>
        </div>
        <div className="flex gap-3">
          <Button label="Nueva Orden Manual" icon="pi pi-plus" className="bg-emerald-600 hover:bg-emerald-700 border-none font-bold px-5 shadow-md shadow-emerald-500/20" onClick={() => router.push('/orders/new')} />
          <Button icon="pi pi-refresh" rounded outlined aria-label="Actualizar" onClick={() => fetchOrders(false)} />
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-wrap gap-4 items-center">
        <div className="flex flex-col gap-1 w-full md:w-80">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filtrar por Proveedor</span>
          <Dropdown 
            value={selectedSupplier} 
            onChange={e => setSelectedSupplier(e.value)} 
            options={supplierOptions} 
            placeholder="Todos los Proveedores" 
            showClear
            filter
            className="w-full text-sm !rounded-xl border-slate-200" 
          />
        </div>
        <div className="flex flex-col gap-1 w-full md:w-80">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filtrar por Tienda Destino</span>
          <Dropdown 
            value={selectedFacility} 
            onChange={e => setSelectedFacility(e.value)} 
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
            onClick={() => { setSelectedSupplier(null); setSelectedFacility(null); }} 
            className="p-button-text p-button-sm text-slate-500 font-bold mt-4" 
          />
        )}
      </div>

      {/* Tabla de Sugerencias */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden p-4">
        <div className="flex justify-between items-center mb-4 px-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            Propuestas Pendientes: <strong className="text-emerald-600">{filteredOrders.length}</strong>
          </span>
        </div>

        <DataTable value={filteredOrders} loading={loading} emptyMessage="No hay propuestas de reposición pendientes por autorizar." size="small" stripedRows rowHover className="text-sm">
          <Column header="NÚMERO PROPUESTA" field="reference" body={r => (
            <span className="font-black tracking-widest text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded text-xs border border-emerald-200">{r.reference}</span>
          )} style={{ width: '12rem' }} />
          
          <Column header="FECHA SUGERIDO" field="created_at" body={r => (
            <span className="text-slate-500 font-bold bg-slate-50 px-2 py-1 rounded text-xs">
              <i className="pi pi-calendar text-[10px] mr-1 text-slate-400"></i> 
              {format(new Date(r.created_at), 'dd/MM/yyyy')} <span className="text-slate-400 font-normal ml-1">{format(new Date(r.created_at), 'HH:mm')}</span>
            </span>
          )} />
          
          <Column header="PROVEEDOR" body={(r: any) => (
            <span className="font-bold text-slate-800">{r.supplier ? r.supplier.name : 'S/N'}</span>
          )} style={{ minWidth: '15rem' }} />
          
          <Column header="TIENDA DESTINO" body={(r: any) => (
            <span className="text-slate-600 font-medium">
              <i className="pi pi-building text-[10px] mr-1 text-slate-400"></i>
              {r.dest_facility ? r.dest_facility.name : 'General (Libre)'}
            </span>
          )} style={{ minWidth: '12rem' }} />
          
          <Column header="ESTADO" body={r => (
            <Tag severity={r.status === 'pending_approval' ? 'danger' : 'warning'} value={r.status === 'pending_approval' ? 'Por Autorizar' : 'Borrador'} className="font-extrabold tracking-wide uppercase text-[9px] px-2 py-1" />
          )} align="center" />
          
          <Column header="MONTO ESTIMADO" body={r => (
            <span className="font-black text-lg text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100/50 block w-fit ml-auto">
              <span className="text-sm font-bold text-emerald-500 mr-1">$</span>
              {parseFloat(r.total_amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </span>
          )} align="right" />
          
          <Column header="ACCIONES" body={r => (
            <div className="flex justify-end gap-2">
              <Button onClick={() => router.push('/orders/' + r.id)} icon="pi pi-eye" rounded severity="secondary" text aria-label="Revisar" tooltip="Examinar Productos" tooltipOptions={{position: 'top'}} />
              <Button onClick={() => deleteOrder(r.id)} icon="pi pi-trash" rounded severity="danger" text aria-label="Descartar" tooltip="Descartar Propuesta" tooltipOptions={{position: 'top'}} />
              <Button onClick={() => approveOrder(r.id)} icon="pi pi-check" rounded severity="success" aria-label="Aprobar" tooltip="Aprobar ODC" tooltipOptions={{position: 'top'}} className="shadow-md shadow-emerald-500/20" />
            </div>
          )} align="center" style={{ width: '10rem' }} />
        </DataTable>
      </div>
    </div>
  );
}

export default function SuggestionsPage() {
  return (
    <Suspense fallback={<div className="p-8"><i className="pi pi-spin pi-spinner text-emerald-600 mr-2"></i> Cargando sugeridos...</div>}>
      <SuggestionsContent />
    </Suspense>
  );
}
