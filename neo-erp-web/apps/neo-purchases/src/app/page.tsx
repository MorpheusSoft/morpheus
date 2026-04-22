"use client";

import React, { useState, useEffect, useRef } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { useRouter } from 'next/navigation';
import axios from 'axios';

export default function MRPDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useRef<Toast>(null);

  const [ordersSummary, setOrdersSummary] = useState({ pendingApproval: 0, pendingSend: 0, pendingRead: 0, pendingReceipt: 0 });
  const [ceoMetrics, setCeoMetrics] = useState({ pending_approval_usd: 0, pending_float_usd: 0 });

  const fetchSuppliers = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/v1/suppliers/');
      setSuppliers(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchOrdersSummary = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/v1/purchase-orders/');
      const orders = res.data;
      setOrdersSummary({
        pendingApproval: orders.filter((o: any) => o.status === 'draft' || o.status === 'pending_approval').length,
        pendingSend: orders.filter((o: any) => o.status === 'approved').length,
        pendingRead: orders.filter((o: any) => o.status === 'sent').length,
        pendingReceipt: orders.filter((o: any) => o.status === 'viewed').length
      });
      
      const ceoRes = await axios.get('http://localhost:8000/api/v1/dashboard/ceo-inbox');
      setCeoMetrics(ceoRes.data);
    } catch(e) {}
  };

  const fetchMRP = async () => {
    setLoading(true);
    try {
      const url = selectedSupplier 
        ? `http://localhost:8000/api/v1/mrp/simulator?supplier_id=${selectedSupplier}&facility_id=1`
        : `http://localhost:8000/api/v1/mrp/simulator?facility_id=1`;
      const res = await axios.get(url);
      setData(res.data);
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Fallo al cargar simulador MRP' });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSuppliers();
    fetchOrdersSummary();
    fetchMRP();
  }, [selectedSupplier]);

  const updateMetric = async (rowData: any, field: string, value: number) => {
    toast.current?.show({ severity: 'info', summary: 'Guardando', detail: 'Calculando nueva proyección...', life: 1500 });
    const payload = {
        variant_id: rowData.variant_id,
        facility_id: 1, // MVP
        run_rate: field === 'run_rate' ? value : rowData.run_rate,
        safety_stock: field === 'safety_stock' ? value : rowData.safety_stock
    };
    try {
       await axios.put('http://localhost:8000/api/v1/mrp/sync-metrics', payload);
       toast.current?.show({ severity: 'success', summary: 'Guardado', detail: 'Métricas recalibradas exitosamente', life: 2000 });
       fetchMRP(); // Refresh full MRP simulation
    } catch (e) {
       toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo actualizar métrica' });
    }
  };

  const generateOrders = async () => {
    // Fraccionamiento humano: Manda a comprar solo lo seleccionado, si nada está checkeado asume TODA la pantalla disponible.
    const baseList = selectedProducts && selectedProducts.length > 0 ? selectedProducts : data;
    const toOrder = baseList.filter((r: any) => r.suggested_qty > 0);
    if (toOrder.length === 0) {
       toast.current?.show({ severity: 'warn', summary: 'Atención', detail: 'No hay quiebres sugeridos para el grupo seleccionado.' });
       return;
    }
    setLoading(true);
    try {
        toast.current?.show({ severity: 'info', summary: 'Procesando', detail: 'Consolidando órdenes y enrutando...', life: 2000 });
        const payload = {
            lines: toOrder,
            facility_id: 1, // MVP
            buyer_id: 2 // MVP (Admin/Compras)
        };
        const res = await axios.post('http://localhost:8000/api/v1/mrp/generate-orders', payload);
        toast.current?.show({ severity: 'success', summary: '¡Éxito Fricción-Cero!', detail: `Se fabricaron ${res.data.orders_created} Órdenes de Compra (Borrador)`, life: 5000 });
        fetchMRP();
    } catch(e) {
        toast.current?.show({ severity: 'error', summary: 'Error Fatal', detail: 'Fallo al inyectar las órdenes transaccionales' });
    }
    setLoading(false);
  };


  return (
    <div className="p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />
      {/* DASHBOARD EJECUTIVO */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 cursor-pointer group" onClick={() => router.push('/orders')}>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-orange-200 border-l-4 border-l-orange-500 relative overflow-hidden transition-all hover:shadow-md hover:bg-orange-50/30">
             <div className="flex justify-between items-start">
                <div>
                   <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Autorización</p>
                   <h3 className="text-3xl font-black text-slate-800">{ordersSummary.pendingApproval}</h3>
                   <span className="text-sm font-black text-orange-600">${ceoMetrics.pending_approval_usd.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                </div>
                <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center border border-orange-100 group-hover:bg-orange-100 transition-colors">
                   <i className="pi pi-lock text-orange-500 text-lg"></i>
                </div>
             </div>
             <div className="mt-3 text-[10px] font-bold text-slate-500 bg-slate-50 w-fit px-2 py-1 rounded hidden sm:block">Total Retenido (Estancado)</div>
          </div>
          
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-sky-200 border-l-4 border-l-sky-500 relative overflow-hidden transition-all hover:shadow-md hover:bg-sky-50/30">
             <div className="flex justify-between items-start">
                <div>
                   <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Por Enviar</p>
                   <h3 className="text-3xl font-black text-slate-800">{ordersSummary.pendingSend}</h3>
                   <span className="text-sm font-black text-sky-600">${ceoMetrics.pending_float_usd.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                </div>
                <div className="w-10 h-10 rounded-full bg-sky-50 flex items-center justify-center border border-sky-100 group-hover:bg-sky-100 transition-colors">
                   <i className="pi pi-envelope text-sky-500 text-lg"></i>
                </div>
             </div>
             <div className="mt-3 text-[10px] font-bold text-slate-500 bg-slate-50 w-fit px-2 py-1 rounded hidden sm:block">Deuda Circulante (Pasivo Flotante)</div>
          </div>
          
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-yellow-200 border-l-4 border-l-yellow-500 relative overflow-hidden transition-all hover:shadow-md hover:bg-yellow-50/30">
             <div className="flex justify-between items-start">
                <div>
                   <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Por Leer</p>
                   <h3 className="text-3xl font-black text-slate-800">{ordersSummary.pendingRead}</h3>
                </div>
                <div className="w-10 h-10 rounded-full bg-yellow-50 flex items-center justify-center border border-yellow-100 group-hover:bg-yellow-100 transition-colors">
                   <i className="pi pi-eye-slash text-yellow-500 text-lg"></i>
                </div>
             </div>
             <div className="mt-3 text-[10px] font-bold text-yellow-600 bg-yellow-50 w-fit px-2 py-1 rounded hidden sm:block">Link no abierto</div>
          </div>
          
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-200 border-l-4 border-l-emerald-500 relative overflow-hidden transition-all hover:shadow-md hover:bg-emerald-50/30">
             <div className="flex justify-between items-start">
                <div>
                   <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">En Tránsito</p>
                   <h3 className="text-3xl font-black text-slate-800">{ordersSummary.pendingReceipt}</h3>
                </div>
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-100 group-hover:bg-emerald-100 transition-colors">
                   <i className="pi pi-truck text-emerald-500 text-lg"></i>
                </div>
             </div>
             <div className="mt-3 text-[10px] font-bold text-emerald-600 bg-emerald-50 w-fit px-2 py-1 rounded hidden sm:block">Leída, viene en camino</div>
          </div>
      </div>

      <div className="flex justify-between items-center mb-6 mt-4">
         <div>
            <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3 tracking-tight">
               <i className="pi pi-bolt text-yellow-500 text-3xl filter drop-shadow-md"></i> 
               Tablero MRP <span className="text-slate-300 font-light mx-2">|</span> <span className="text-xl font-bold text-indigo-600">Proyección Inteligente</span>
            </h1>
            <p className="text-slate-500 text-sm mt-2 max-w-2xl font-medium">Asistente automatizado de necesidades. El sistema calcula Matemáticamente tus sugeridos cruzando Consumos, Empaques Logísticos de venta y Tiempos de Entrega históricos.</p>
         </div>
         <div className="flex gap-3">
             <Dropdown 
               value={selectedSupplier} 
               onChange={(e) => setSelectedSupplier(e.value)} 
               options={suppliers} 
               optionLabel="name" 
               optionValue="id" 
               placeholder="Todos los Proveedores" 
               showClear 
               filter
               className="w-72 font-semibold shadow-sm border-slate-200"
             />
             <Button onClick={generateOrders} label="Generar ODCs [Borradores]" icon="pi pi-send" severity="success" disabled={data.length === 0 || loading} className="font-bold shadow-md hover:shadow-lg transition-all" />
         </div>
      </div>
      
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <DataTable 
          value={data} 
          selectionMode="checkbox" 
          selection={selectedProducts} 
          onSelectionChange={(e) => setSelectedProducts(e.value)} 
          dataKey="variant_id"
          loading={loading} 
          emptyMessage="No hay quiebres de stock ni alertas detectadas." 
          size="small" 
          stripedRows 
          rowHover 
          className="text-sm"
        >
          <Column selectionMode="multiple" headerStyle={{ width: '3rem' }}></Column>
          <Column header="SKU" field="sku" body={r => <span className="font-mono text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-600">{r.sku}</span>} />
          
          <Column header="Insumo Comercial" field="product_name" body={r => (
              <div className="flex flex-col">
                  <span className="font-bold text-slate-800">{r.product_name}</span>
                  <span className="text-slate-400 text-[10px] uppercase font-semibold">{r.supplier_name}</span>
              </div>
          )} />
          
          <Column header="Stock Físico" body={r => {
             const weightUOMs = ['KG', 'LBS', 'GR', 'L', 'LT', 'MT', 'KGS'];
             const isWeight = weightUOMs.includes(r.uom_base?.toUpperCase());
             const dec = isWeight ? 3 : 0;
             const displayStock = Number(r.current_stock).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
             return (
                 <div className="flex justify-end pr-2">
                     <span className={`font-black text-lg ${r.current_stock <= r.safety_stock ? 'text-rose-600' : 'text-slate-700'}`}>
                        {displayStock}
                     </span>
                 </div>
             );
          }} align="right" />
          
          <Column header="Lead Time" body={r => (
             <span className="text-slate-500 font-medium bg-slate-50 border border-slate-200 px-2 py-1 rounded-md text-xs">
                <i className="pi pi-clock text-[10px] mr-1 text-indigo-400"></i> {r.lead_time} d
             </span>
          )} align="right" />
          
          <Column header="Run Rate (Diario)" body={r => {
             const isWeight = ['KG', 'LBS', 'GR', 'L', 'LT', 'MT', 'KGS'].includes(r.uom_base?.toUpperCase());
             const dec = isWeight ? 3 : 0;
             return (
                 <div className="flex justify-end">
                     <input type="number" step={isWeight ? "0.001" : "1"} defaultValue={Number(r.run_rate).toFixed(dec)} onBlur={(e) => {
                         const val = parseFloat(e.target.value);
                         if (!isNaN(val) && val !== parseFloat(r.run_rate)) updateMetric(r, 'run_rate', val);
                     }} className="w-16 text-right text-xs font-bold p-1 rounded-lg border border-slate-300 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-slate-50 transition-all text-slate-700" />
                 </div>
             );
          }} align="right" />

          <Column header="Safety Stock" body={r => {
             const isWeight = ['KG', 'LBS', 'GR', 'L', 'LT', 'MT', 'KGS'].includes(r.uom_base?.toUpperCase());
             const dec = isWeight ? 3 : 0;
             return (
                 <div className="flex justify-end">
                     <input type="number" step={isWeight ? "0.001" : "1"} defaultValue={Number(r.safety_stock).toFixed(dec)} onBlur={(e) => {
                         const val = parseFloat(e.target.value);
                         if (!isNaN(val) && val !== parseFloat(r.safety_stock)) updateMetric(r, 'safety_stock', val);
                     }} className="w-16 text-right text-xs font-bold p-1 rounded-lg border border-slate-300 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-slate-50 transition-all text-amber-700" />
                 </div>
             );
          }} align="right" />
          
          <Column header="MOQ" body={r => {
             const isPack = r.qty_per_pack > 1;
             const isWeight = ['KG', 'LBS', 'GR', 'L', 'LT', 'MT', 'KGS'].includes(r.uom_base?.toUpperCase());
             const dec = isPack ? 0 : (isWeight ? 3 : 0);
             return <div className="flex justify-end"><span className="text-slate-500 font-bold bg-slate-100 px-2 py-1 rounded text-xs">{Number(r.moq).toFixed(dec)}</span></div>;
          }} align="right" />
          
          <Column header="SUGERIDO" body={r => {
             const isWarning = r.suggested_qty > 0;
             const isPack = r.qty_per_pack > 1;
             const isWeight = ['KG', 'LBS', 'GR', 'L', 'LT', 'MT', 'KGS'].includes(r.uom_base?.toUpperCase());
             const dec = isPack ? 0 : (isWeight ? 3 : 0);
             const displaySuggested = Number(r.suggested_qty).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
             
             return (
                 <div className={`flex flex-col items-end justify-center rounded-xl p-2 border ${isWarning ? 'bg-green-50 text-green-700 border-green-200 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                    <span className="font-black text-xl">{displaySuggested}</span>
                    <div className="flex items-center justify-end gap-1 mt-1 opacity-80">
                        <i className="pi pi-box text-[9px]"></i>
                        <span className="text-[9px] uppercase font-bold tracking-widest text-right">{r.pack_name}</span>
                    </div>
                 </div>
             );
          }} align="right" style={{ width: '120px' }} />
        </DataTable>
      </div>
    </div>
  );
}
