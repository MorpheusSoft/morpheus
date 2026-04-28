"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Calendar } from 'primereact/calendar';
import api from '@/lib/api';
import { format } from 'date-fns';

export default function ReceiptExecutionPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id;
  
  const [order, setOrder] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useRef<Toast>(null);

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/purchase-orders/${orderId}/details`);
      setOrder(res.data);
      // Initialize receiving lines based on PO lines
      const initialLines = res.data.lines.map((l: any) => ({
          ...l,
          received_qty: l.expected_base_qty, // Start by suggesting the expected qty
          lot_number: '',
          expiration_date: null
      }));
      setLines(initialLines);
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar la orden.' });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (orderId) fetchOrder();
  }, [orderId]);

  const handleQtyChange = (rowIndex: number, val: any) => {
      setLines(prev => {
          const updated = [...prev];
          const parsed = isNaN(parseFloat(val)) ? '' : val;
          updated[rowIndex] = { ...updated[rowIndex], received_qty: parsed };
          return updated;
      });
  };

  const handleTextChange = (rowIndex: number, field: string, val: string) => {
      setLines(prev => {
          const updated = [...prev];
          updated[rowIndex] = { ...updated[rowIndex], [field]: val };
          return updated;
      });
  };

  const handleDateChange = (rowIndex: number, val: Date | null) => {
      setLines(prev => {
          const updated = [...prev];
          updated[rowIndex] = { ...updated[rowIndex], expiration_date: val };
          return updated;
      });
  };

  const confirmReceipt = async () => {
      setSaving(true);
      try {
          const payload = {
              lines: lines.map(l => ({
                  po_line_id: l.id,
                  variant_id: l.variant_id,
                  received_qty: l.received_qty,
                  lot_number: l.lot_number || null,
                  expiration_date: l.expiration_date ? format(l.expiration_date, 'yyyy-MM-dd') : null
              }))
          };
          await api.post(`/wms/receipts/${orderId}`, payload);
          toast.current?.show({ severity: 'success', summary: 'Recepción Exitosa', detail: 'Mercancía ingresada al inventario.' });
          setTimeout(() => router.push('/receipts'), 1500);
      } catch(e: any) {
          toast.current?.show({ severity: 'error', summary: 'Error de Recepción', detail: e.response?.data?.detail || 'Fallo de conexión WMS' });
      }
      setSaving(false);
  };

  if (loading && !order) return <div className="p-8 text-slate-500 font-bold flex items-center"><i className="pi pi-spin pi-spinner text-2xl mr-3 text-blue-500"></i> Localizando Manifiesto WMS...</div>;
  if (!order) return <div className="p-8 text-red-500 font-black text-2xl">ODC no encontrada en el Muelle.</div>;

  return (
    <div className="p-4 sm:p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />
      
      {/* HEADER EJECUTIVO CIEGO */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>
          <div>
              <div className="flex items-center gap-3 mb-1">
                 <Button icon="pi pi-arrow-left" rounded text aria-label="Volver" onClick={() => router.push('/receipts')} />
                 <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
                    <i className="pi pi-box mr-3 text-blue-500"></i>Recepcionando: {order.reference}
                 </h1>
              </div>
              <p className="text-slate-500 ml-12 text-sm mt-2 flex flex-col gap-1">
                  <span><i className="pi pi-building mr-2 text-slate-400"></i> Proveedor: <span className="font-bold text-slate-700">{order.supplier.name}</span></span>
                  <span><i className="pi pi-clock mr-2 text-slate-400"></i> Vencimiento ODC: <span className="font-bold text-slate-700">{order.expiration_date ? format(new Date(order.expiration_date + 'T00:00:00'), 'dd/MM/yyyy') : 'Sin Límite'}</span></span>
              </p>
          </div>
          
          {/* Info Logística */}
          <div className="flex flex-col items-end gap-2 bg-blue-50 p-4 rounded-xl border border-blue-100 min-w-[200px]">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-1">Condición de Recepción</span>
              <span className={`text-sm font-black ${order.allow_partial_deliveries ? 'text-emerald-600' : 'text-orange-600'}`}>
                 {order.allow_partial_deliveries ? 'Múltiples Despachos Permitidos' : 'Cierre Obligatorio al Recibir'}
              </span>
          </div>
      </div>

      {/* MATRIZ DE RECEPCIÓN (CIEGA) */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700 tracking-tight"><i className="pi pi-list mr-2 text-blue-500"></i>Manifiesto de Conteo Físico</h3>
        </div>
        <DataTable dataKey="id" value={lines} emptyMessage="No hay productos para recibir." size="small" stripedRows rowHover className="text-sm">
          <Column header="SKU" field="sku" body={r => <span className="font-mono text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500">{r.sku}</span>} />
          
          <Column header="Producto" field="product_name" body={r => <span className="font-bold text-slate-800">{r.product_name}</span>} />
          
          <Column header="Esperado (Base/UOM)" body={r => {
             const isWeight = ['KG', 'LBS', 'GR', 'L', 'LT', 'MT', 'KGS'].includes(r.uom_base?.toUpperCase());
             const dec = isWeight ? 3 : 0;
             const val = Number(r.expected_base_qty) || 0;
             return <span className="font-semibold text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-200">{val.toLocaleString('en-US', {minimumFractionDigits: dec, maximumFractionDigits: dec})} Unds</span>;
          }} align="right" />
          
          {/* CAMPOS INTERACTIVOS WMS */}
          <Column header="Físico Recibido" body={(r, options) => {
             const isWeight = ['KG', 'LBS', 'GR', 'L', 'LT', 'MT', 'KGS'].includes(r.uom_base?.toUpperCase());
             const dec = isWeight ? 3 : 0;
             return (
                 <div className="flex justify-end">
                     <InputNumber 
                        value={r.received_qty === '' ? null : r.received_qty} 
                        onValueChange={(e) => handleQtyChange(options.rowIndex, e.value === null ? '' : e.value)}
                        minFractionDigits={dec}
                        maxFractionDigits={dec}
                        inputClassName="w-24 text-right text-lg font-black p-2 rounded-lg border-2 border-blue-200 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 bg-blue-50/50 transition-all text-blue-700 shadow-inner" 
                     />
                 </div>
             )
          }} align="right" />

          <Column header="Trazabilidad (Lote)" body={(r, options) => (
             <InputText 
                 value={r.lot_number} 
                 onChange={(e) => handleTextChange(options.rowIndex, 'lot_number', e.target.value)} 
                 placeholder="Ej: L-204" 
                 className="w-28 text-xs font-bold text-center uppercase" 
             />
          )} align="center" />

          <Column header="Vencimiento (FEFO)" body={(r, options) => (
             <Calendar 
                 value={r.expiration_date} 
                 onChange={(e) => handleDateChange(options.rowIndex, e.value as Date)} 
                 dateFormat="dd/mm/yy" 
                 placeholder="Opcional" 
                 className="w-32 p-inputtext-sm text-xs" 
             />
          )} align="center" />
          
          {/* Nota: NO HAY COSTOS. Es Recepción Ciega. */}
        </DataTable>
      </div>

      <div className="flex justify-end gap-4 p-6 bg-white rounded-2xl shadow-sm border border-slate-200 mt-6">
         <Button label="Reportar Avería o Diferencia" icon="pi pi-exclamation-triangle" outlined severity="warning" className="font-bold border-2" />
         <Button label="Confirmar e Ingresar a Inventario" icon="pi pi-check-circle" severity="success" onClick={confirmReceipt} disabled={saving} className="font-bold px-8 shadow-lg hover:shadow-xl transition-all shadow-emerald-500/30 text-lg bg-emerald-600 border-none" />
      </div>
    </div>
  );
}
