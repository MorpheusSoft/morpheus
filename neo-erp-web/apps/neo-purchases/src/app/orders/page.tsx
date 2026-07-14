"use client";

import React, { useState, useEffect, useRef } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import api from '@/lib/api';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { Dropdown } from 'primereact/dropdown';

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<string | null>(null);
  const toast = useRef<Toast>(null);
  const router = useRouter();

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

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await api.get('/purchase-orders/');
      setOrders(res.data);
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las órdenes de compra.' });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const approveOrder = async (id: number) => {
    try {
        await api.put(`/purchase-orders/${id}/status`, { status: 'approved' });
        toast.current?.show({ severity: 'success', summary: 'Aprobada', detail: 'La Autorización Oficial fue registrada.', life: 3000 });
        fetchOrders();
    } catch(e) {
        toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Fallo al autorizar la orden transaccional.' });
    }
  };

  const deleteOrder = async (id: number) => {
    if (!window.confirm("¿Está seguro de eliminar esta orden en borrador? Esta acción no se puede deshacer.")) return;
    try {
        await api.delete(`/purchase-orders/${id}`);
        toast.current?.show({ severity: 'success', summary: 'Eliminada', detail: 'La orden fue eliminada.', life: 3000 });
        fetchOrders();
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
  
  const pendingApprovalCount = orders.filter((o: any) => o.status === 'draft' || o.status === 'pending_approval').length;
  const pendingSendCount = orders.filter((o: any) => o.status === 'approved').length;
  const pendingReceiptCount = orders.filter((o: any) => o.status === 'sent').length;

  return (
    <div className="p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Autorización de Compras</h1>
          <p className="text-slate-500 text-sm mt-1">Inbox de Órdenes (Drafts, Aprobadas, Enviadas)</p>
        </div>
        <div className="flex gap-4">
          <Button label="Nueva Orden" icon="pi pi-plus" className="bg-indigo-600 hover:bg-indigo-700 border-none font-bold px-6 shadow-md shadow-indigo-500/20" onClick={() => router.push('/orders/new')} />
          <Button icon="pi pi-refresh" rounded outlined aria-label="Actualizar" onClick={fetchOrders} />
        </div>
      </div>
      
      {/* Filtros de Proveedor y Tienda Destino */}
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
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filtrar por Destino (Tienda)</span>
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
      
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <DataTable value={filteredOrders} loading={loading} emptyMessage="No tienes órdenes de compra pendientes en el radar." size="small" stripedRows rowHover className="text-sm border-t border-slate-100">
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
          
          <Column header="SELLO" body={r => (
             <div className="flex justify-end gap-2">
                 <Button onClick={() => router.push('/orders/' + r.id)} icon="pi pi-eye" rounded severity="secondary" text aria-label="Ver Detalles" tooltip="Examinar Productos" tooltipOptions={{position: 'top', showDelay: 400}} />
                 {r.status === 'draft' && (
                     <>
                        <Button onClick={() => deleteOrder(r.id)} icon="pi pi-trash" rounded severity="danger" text aria-label="Eliminar" tooltip="Eliminar Borrador" tooltipOptions={{position: 'top', showDelay: 400}} />
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
