"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import axios from 'axios';
import { format } from 'date-fns';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputText } from 'primereact/inputtext';
import { InputSwitch } from 'primereact/inputswitch';
import { Calendar } from 'primereact/calendar';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { Checkbox } from 'primereact/checkbox';
import ConciliationPanel from './components/ConciliationPanel';

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id;
  
  const [order, setOrder] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useRef<Toast>(null);

  // Phase 6.7 State
  const [invoiceDiscountStr, setInvoiceDiscountStr] = useState("");
  const [conditionDiscountStr, setConditionDiscountStr] = useState("");
  const [notes, setNotes] = useState("");
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [allowPartial, setAllowPartial] = useState(false);

  // Bimonetary State
  const [currencyId, setCurrencyId] = useState<number | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(1.0);
  const [systemLocalRate, setSystemLocalRate] = useState<number>(1.0); // For bidirectional mirror
  const [currencies, setCurrencies] = useState<any[]>([]);

  // Regalias Dialog
  const [showRegaliaModal, setShowRegaliaModal] = useState(false);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [selectedRegalia, setSelectedRegalia] = useState<any>(null);
  const [regaliaInBaseUnit, setRegaliaInBaseUnit] = useState(false);

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`http://localhost:8000/api/v1/purchase-orders/${orderId}/details`);
      setOrder(res.data);
      setLines(res.data.lines);
      
      setInvoiceDiscountStr(res.data.invoice_discount_str || "");
      setConditionDiscountStr(res.data.condition_discount_str || "");
      setNotes(res.data.notes || "");
      setExpirationDate(res.data.expiration_date ? new Date(res.data.expiration_date + 'T00:00:00') : null);
      setAllowPartial(res.data.allow_partial_deliveries || false);
      
      const cid = res.data.currency_id || 1;
      const erate = res.data.exchange_rate ? parseFloat(res.data.exchange_rate) : 1.0;
      setCurrencyId(cid);
      setExchangeRate(erate);
      
      if (cid !== 1) {
          setSystemLocalRate(erate);
      } else {
          axios.get('http://localhost:8000/api/v1/currencies/exchange-rates/latest?currency_id=2')
               .then(r => setSystemLocalRate(parseFloat(r.data.rate)))
               .catch(() => setSystemLocalRate(1));
      }
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar la orden.' });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (orderId) fetchOrder();
    axios.get('http://localhost:8000/api/v1/currencies/').then(res => setCurrencies(res.data)).catch(console.error);
  }, [orderId]);

  const calcDiscountCascade = (base: number, str: string) => {
      if (!str) return base;
      let net = base;
      const parts = str.replace(/\s/g, '').split('+');
      for (const p of parts) {
          const pct = parseFloat(p);
          if (!isNaN(pct)) net = net * (1 - (pct / 100));
      }
      return net;
  };

  const handleCurrencyChange = async (newCurrencyId: number) => {
      const selectedCur = currencies.find(c => c.id === newCurrencyId);
      if (!selectedCur) return;
      try {
          const res = await axios.get(`http://localhost:8000/api/v1/currencies/exchange-rates/latest?currency_id=${newCurrencyId}`);
          const newRate = parseFloat(res.data.rate);
          const ratio = newRate / exchangeRate;
          
          setLines(prev => prev.map(l => {
              const row = {...l};
              row.unit_cost = (parseFloat(row.unit_cost) * ratio).toFixed(6);
              const gross = row.expected_base_qty * row.unit_cost;
              row.subtotal = calcDiscountCascade(gross, row.line_discount_str);
              return row;
          }));
          
          setCurrencyId(newCurrencyId);
          setExchangeRate(newRate);
          if (newCurrencyId !== 1) setSystemLocalRate(newRate);
          
          toast.current?.show({severity:'info', summary:'Moneda Cambiada', detail:`Tasa de Cambio Oficial: ${newRate} ${selectedCur.code}`});
      } catch(e) {
          toast.current?.show({severity:'error', summary:'Error', detail:'Fallo al obtener tasa de cambio oficial.'});
      }
  };

  const openRegaliaModal = async () => {
      try {
          const res = await axios.get(`http://localhost:8000/api/v1/suppliers/${order.supplier.id}/catalog`);
          const mapped = res.data.map((opt: any) => ({
              ...opt,
              display_name: `${opt.product_name} (${opt.variant_sku}) - Empaque: ${opt.pack_name}`
          }));
          setCatalog(mapped);
          setShowRegaliaModal(true);
      } catch(e) {
          toast.current?.show({severity:'error', summary:'Error', detail:'No se pudo cargar el catálogo del proveedor.'});
      }
  };

  const addRegalia = () => {
      if (!selectedRegalia) return;
      
      const qty_per_pack = regaliaInBaseUnit ? 1 : (selectedRegalia.qty_per_pack || 1);
      const pack_id = regaliaInBaseUnit ? null : selectedRegalia.pack_id;
      const pack_name = regaliaInBaseUnit ? "UND. BASE (X1)" : (selectedRegalia.pack_name || "UND. BASE (X1)");
      
      const newRow = {
          id: null,
          variant_id: selectedRegalia.variant_id,
          sku: selectedRegalia.variant_sku,
          product_name: selectedRegalia.product_name,
          pack_id: pack_id,
          pack_name: pack_name,
          qty_per_pack: qty_per_pack,
          qty_ordered: 1,
          expected_base_qty: 1 * qty_per_pack,
          unit_cost: 0,
          line_discount_str: '',
          subtotal: 0
      };
      setLines(prev => [...prev, newRow]);
      setShowRegaliaModal(false);
      setSelectedRegalia(null);
      setRegaliaInBaseUnit(false);
      toast.current?.show({severity:'success', summary:'Regalía Agregada', detail:'Fila insertada mágicamente a Costo 0'});
  };

  const handleQtyChange = (rowIndex: number, newQty: number) => {
      setLines(prev => {
          const updatedLines = [...prev];
          if(!updatedLines[rowIndex]) return updatedLines;
          const row = { ...updatedLines[rowIndex] };
          
          const qty = isNaN(newQty) || newQty < 0 ? 0 : newQty;
          
          row.qty_ordered = qty;
          row.expected_base_qty = qty * row.qty_per_pack;
          const gross = row.expected_base_qty * row.unit_cost;
          row.subtotal = calcDiscountCascade(gross, row.line_discount_str);
          
          updatedLines[rowIndex] = row;
          return updatedLines;
      });
  };

  const handleLineDiscountChange = (rowIndex: number, str: string) => {
      setLines(prev => {
          const updatedLines = [...prev];
          if(!updatedLines[rowIndex]) return updatedLines;
          const row = { ...updatedLines[rowIndex] };
          row.line_discount_str = str;
          const gross = row.expected_base_qty * row.unit_cost;
          row.subtotal = calcDiscountCascade(gross, str);
          updatedLines[rowIndex] = row;
          return updatedLines;
      });
  };

  const calculateTotal = () => {
      const gross = lines.reduce((acc, row) => acc + parseFloat(row.subtotal || 0), 0);
      const afterInv = calcDiscountCascade(gross, invoiceDiscountStr);
      return calcDiscountCascade(afterInv, conditionDiscountStr);
  };

  const saveChanges = async () => {
      setSaving(true);
      try {
          const payload = {
              invoice_discount_str: invoiceDiscountStr,
              condition_discount_str: conditionDiscountStr,
              notes: notes,
              expiration_date: expirationDate ? format(expirationDate, 'yyyy-MM-dd') : null,
              allow_partial_deliveries: allowPartial,
              currency_id: currencyId,
              exchange_rate: exchangeRate,
              lines: lines.map(l => ({
                  id: l.id,
                  variant_id: l.variant_id,
                  pack_id: l.pack_id,
                  qty_ordered: l.qty_ordered,
                  expected_base_qty: l.expected_base_qty,
                  unit_cost: l.unit_cost,
                  line_discount_str: l.line_discount_str || ""
              }))
          };
          await axios.put(`http://localhost:8000/api/v1/purchase-orders/${orderId}`, payload);
          toast.current?.show({ severity: 'success', summary: 'Guardado', detail: 'Orden actualizada correctamente' });
          fetchOrder();
      } catch(e) {
          toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Fallo al guardar cambios' });
      }
      setSaving(false);
  };

  const approveOrder = async () => {
      setSaving(true);
      try {
          // Primero guardamos por si hay cambios sin guardar en la grilla
          const payload = {
              invoice_discount_str: invoiceDiscountStr,
              condition_discount_str: conditionDiscountStr,
              notes: notes,
              expiration_date: expirationDate ? format(expirationDate, 'yyyy-MM-dd') : null,
              allow_partial_deliveries: allowPartial,
              currency_id: currencyId,
              exchange_rate: exchangeRate,
              lines: lines.map(l => ({
                  id: l.id,
                  variant_id: l.variant_id,
                  pack_id: l.pack_id,
                  qty_ordered: l.qty_ordered,
                  expected_base_qty: l.expected_base_qty,
                  unit_cost: l.unit_cost,
                  line_discount_str: l.line_discount_str || ""
              }))
          };
          await axios.put(`http://localhost:8000/api/v1/purchase-orders/${orderId}`, payload);
          
          // Luego aprobamos autoritativamente
          await axios.put(`http://localhost:8000/api/v1/purchase-orders/${orderId}/status`, { status: 'approved' });
          toast.current?.show({ severity: 'success', summary: '¡APROBADA!', detail: 'La orden ha sido autorizada y sellada.', life: 4000 });
          fetchOrder();
      } catch(e: any) {
          if (e.response && e.response.status === 403) {
              toast.current?.show({ severity: 'warn', summary: 'Requiere Autorización', detail: e.response.data.detail, life: 6000 });
              fetchOrder(); // Refrescar para ver el state "pending_approval"
          } else {
              toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Fallo al aprobar orden' });
          }
      }
      setSaving(false);
  };
  
  const triggerMailer = async () => {
      setSaving(true);
      try {
          await axios.post(`http://localhost:8000/api/v1/purchase-orders/${orderId}/send`);
          toast.current?.show({ severity: 'success', summary: '¡Enviada!', detail: 'Se dispararon los correos al proveedor.', life: 4000 });
          fetchOrder(); // Pasará a status=sent
      } catch(e) {
          toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo contactar al proveedor' });
      }
      setSaving(false);
  };

  if (loading && !order) return <div className="p-8 text-slate-500 font-bold flex items-center gap-3"><i className="pi pi-spin pi-spinner text-indigo-500 text-2xl"></i> Leyendo pergaminos corporativos...</div>;
  if (!order) return <div className="p-8 text-red-500 font-black text-2xl">Orden 404: Extraviada en el ciberespacio.</div>;

  const isDraft = order.status === 'draft';

  return (
    <div className="p-4 sm:p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />
      
      {/* HEADER EJECUTIVO */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>
          <div>
              <div className="flex items-center gap-3 mb-1">
                 <Button icon="pi pi-arrow-left" rounded text aria-label="Volver" onClick={() => router.push('/orders')} />
                 <h1 className="text-3xl font-black text-slate-800 tracking-tight">{order.reference}</h1>
                 {order.status === 'draft' && <Tag severity="warning" value="BORRADOR" className="ml-2 font-bold tracking-widest px-3 py-1" />}
                 {order.status === 'pending_approval' && <Tag severity="info" value="ESPERANDO GERENCIA" className="ml-2 font-bold tracking-widest px-3 py-1 bg-orange-500" />}
                 {order.status === 'approved' && <Tag severity="success" value="APROBADA" className="ml-2 font-bold tracking-widest px-3 py-1" />}
                 {order.status === 'sent' && <Tag severity="success" value="ENVIADA (SIN LEER)" className="ml-2 font-bold tracking-widest px-3 py-1 bg-sky-500 border-none" icon="pi pi-send" />}
                 {order.status === 'viewed' && <Tag severity="success" value="LEÍDA (DOBLE CHECK)" className="ml-2 font-bold tracking-widest px-3 py-1 bg-indigo-600 border-none" icon="pi pi-check-circle" />}
              </div>
              <p className="text-slate-500 ml-12 text-sm mt-2">
                  <i className="pi pi-building mr-2 text-indigo-400"></i> Proveedor: <span className="font-bold text-slate-700">{order.supplier.name}</span>
                  <span className="mx-3 text-slate-200">|</span>
                  <i className="pi pi-calendar mr-2 text-indigo-400"></i> {format(new Date(order.created_at), 'dd de MMM yyyy - HH:mm')}
              </p>
          </div>
          
          <div className="flex flex-col items-end gap-2 bg-slate-50 p-4 rounded-xl border border-slate-100 min-w-[200px]">
              <div className="flex flex-col w-full">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Moneda Transaccional</label>
                  <Dropdown value={currencyId} options={currencies} onChange={(e) => handleCurrencyChange(e.value)} optionLabel="code" optionValue="id" disabled={!isDraft} className="w-full font-black text-slate-800 bg-white border-slate-200" />
              </div>
              <div className="flex flex-col items-end mt-3 border-t border-slate-100 pt-3 w-full">
                  <span className="text-4xl font-black text-emerald-600 block leading-none">
                     <span className="text-xl text-emerald-400 mr-1">{currencies.find(c => c.id === currencyId)?.symbol || '$'}</span>
                     {calculateTotal().toLocaleString('en-US', {minimumFractionDigits: currencies.find(c => c.id === currencyId)?.decimal_places ?? 2, maximumFractionDigits: currencies.find(c => c.id === currencyId)?.decimal_places ?? 2})}
                  </span>
                  {currencyId !== 1 && exchangeRate > 0 && (
                      <div className="mt-1 text-right">
                          <span className="text-sm font-bold text-slate-400">
                              ≈ $ {(calculateTotal() / exchangeRate).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD
                          </span>
                          <span className="block text-[10px] text-slate-400 font-semibold mt-0.5">
                              Tasa Aplicada: {exchangeRate}
                          </span>
                      </div>
                  )}
                  {currencyId === 1 && systemLocalRate > 0 && (
                      <div className="mt-1 text-right">
                          <span className="text-sm font-bold text-slate-400">
                              ≈ Bs. {(calculateTotal() * systemLocalRate).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} VES
                          </span>
                          <span className="block text-[10px] text-slate-400 font-semibold mt-0.5">
                              Tasa Referencial: {systemLocalRate}
                          </span>
                      </div>
                  )}
              </div>
          </div>
      </div>

      {/* MATRIZ DE EDICIÓN */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700 tracking-tight"><i className="pi pi-shopping-cart mr-2 text-indigo-500"></i>Desglose de Renglones</h3>
            <div className="flex gap-3">
                {isDraft && <Button icon="pi pi-gift" label="Añadir Regalía (Bonif.)" severity="warning" outlined size="small" onClick={openRegaliaModal} />}
                {isDraft && <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 shadow-sm"><i className="pi pi-pencil text-[10px] mr-2"></i>Edición Abierta</span>}
            </div>
        </div>
        <DataTable dataKey="id" value={lines} emptyMessage="Esta orden está vacía como el desierto." size="small" stripedRows rowHover className="text-sm">
          <Column header="SKU" field="sku" body={r => <span className="font-mono text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500">{r.sku}</span>} />
          
          <Column header="Nomenclatura" field="product_name" body={r => <span className="font-bold text-slate-800">{r.product_name}</span>} />
          
          <Column header="Unidad de Compra" body={r => (
             <div className="flex justify-end">
                 <span className="text-xs font-bold text-slate-500 bg-slate-50 px-2 py-1.5 rounded border border-slate-200 uppercase tracking-wide">
                    {r.pack_name || 'UND. BASE'} {r.qty_per_pack && r.qty_per_pack > 1 ? `(x${r.qty_per_pack})` : '(x1)'} <i className="pi pi-box ml-1 text-slate-400 text-[10px]"></i>
                 </span>
             </div>
          )} align="right" />
          
          <Column header="Cant. a Facturar" body={(r, options) => {
             const isPack = r.qty_per_pack > 1;
             const isWeight = ['KG', 'LBS', 'GR', 'L', 'LT', 'MT', 'KGS'].includes(r.uom_base?.toUpperCase());
             const dec = isPack ? 0 : (isWeight ? 3 : 0);
             
             if (!isDraft) return <div className="flex justify-end pr-2"><span className="font-black text-xl text-slate-800">{Number(r.qty_ordered).toLocaleString('en-US', {minimumFractionDigits: dec, maximumFractionDigits: dec})}</span></div>;
             
             return (
                 <div className="flex justify-end">
                     <input 
                        type="number" 
                        step={isPack ? "1" : (isWeight ? "0.001" : "1")}
                        defaultValue={Number(r.qty_ordered).toFixed(dec)} 
                        onBlur={(e) => handleQtyChange(options.rowIndex, parseFloat(e.target.value))}
                        className="w-24 text-right text-lg font-black p-2 rounded-lg border-2 border-indigo-200 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 bg-indigo-50/50 transition-all text-indigo-700 shadow-inner" 
                     />
                 </div>
             )
          }} align="right" />
          
          <Column header="Equivalencia Neta" field="expected_base_qty" body={r => {
             const isWeight = ['KG', 'LBS', 'GR', 'L', 'LT', 'MT', 'KGS'].includes(r.uom_base?.toUpperCase());
             const dec = isWeight ? 3 : 0;
             const val = Number(r.expected_base_qty) || 0;
             return <div className="flex justify-end pr-2"><span className="font-semibold text-slate-400">{val.toLocaleString('en-US', {minimumFractionDigits: dec, maximumFractionDigits: dec})} Unds</span></div>;
          }} align="right" />
          
          <Column header="Costo Unitario" body={r => {
              if (parseFloat(r.unit_cost) === 0) return <span className="font-bold text-amber-500 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 text-xs shadow-sm"><i className="pi pi-gift mr-1"></i>REGALÍA</span>;
              return <span className="text-slate-600 font-bold">{currencies.find(c => c.id === currencyId)?.symbol || '$'}{parseFloat(r.unit_cost).toLocaleString('en-US', {minimumFractionDigits: currencies.find(c => c.id === currencyId)?.decimal_places ?? 2, maximumFractionDigits: currencies.find(c => c.id === currencyId)?.decimal_places ?? 2})}</span>;
          }} align="right" />
          
          <Column header="% Dscto (Renglón)" body={(r, options) => {
              if (parseFloat(r.unit_cost) === 0) return null;
              if (!isDraft) return <div className="flex justify-end pr-2"><span className="font-bold text-amber-600">{r.line_discount_str ? `-${r.line_discount_str}%` : ''}</span></div>;
              return (
                  <div className="flex justify-end pr-2">
                       <InputText value={r.line_discount_str || ''} onChange={(e) => handleLineDiscountChange(options.rowIndex, e.target.value)} placeholder="Ej: 10+5" className="w-20 text-right p-1 text-xs font-bold border-amber-300 text-amber-700" />
                  </div>
              );
          }} align="right" />
          
          <Column header="Subtotal" body={r => <span className="font-black text-emerald-700 text-base">{currencies.find(c => c.id === currencyId)?.symbol || '$'}{parseFloat(r.subtotal).toLocaleString('en-US', {minimumFractionDigits: currencies.find(c => c.id === currencyId)?.decimal_places ?? 2, maximumFractionDigits: currencies.find(c => c.id === currencyId)?.decimal_places ?? 2})}</span>} align="right" />
          
        </DataTable>
      </div>

      {/* PANEL DE NEGOCIACIÓN LOGÍSTICA (FASE 6.7) */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 mb-6">
          <h3 className="font-black text-slate-800 text-lg mb-4 flex items-center gap-2"><i className="pi pi-briefcase text-indigo-500"></i> Negociación de Condiciones y Logística</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Columna Izquierda: Logística y Notas */}
              <div className="flex flex-col gap-4 border-r border-slate-100 pr-4">
                  <div className="flex gap-4">
                      <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Vencimiento ODC</label>
                          <Calendar value={expirationDate} onChange={(e) => setExpirationDate(e.value as Date)} dateFormat="dd/mm/yy" disabled={!isDraft} showIcon className="w-full" placeholder="Límite Máximo" />
                      </div>
                      <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Entregas Parciales (Backorder)</label>
                          <div className={`flex items-center gap-3 p-2 rounded-lg border ${allowPartial ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                              <InputSwitch checked={allowPartial} onChange={(e) => setAllowPartial(e.value)} disabled={!isDraft} />
                              <span className={`text-sm font-bold ${allowPartial ? 'text-emerald-700' : 'text-slate-500'}`}>{allowPartial ? 'Permitido (No Cierra)' : 'No Permitido (Cierra 1er Despacho)'}</span>
                          </div>
                      </div>
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Observaciones Legales / Notas</label>
                      <InputTextarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!isDraft} rows={3} className="w-full border-slate-300 rounded-lg p-2" placeholder="Ej: Mercancía consignada sujeta a control de calidad..." autoResize />
                  </div>
              </div>
              
              {/* Columna Derecha: Descuentos Globales */}
              <div className="flex flex-col gap-6 justify-center">
                  <div className="flex items-center gap-4 bg-amber-50 p-4 rounded-xl border border-amber-100 shadow-inner">
                      <div className="flex-1">
                          <label className="block text-xs font-bold text-amber-700 uppercase tracking-widest mb-1">Dcto. Factura Global (%)</label>
                          <InputText value={invoiceDiscountStr} onChange={(e) => setInvoiceDiscountStr(e.target.value)} disabled={!isDraft} placeholder="Ej: 15+5" className="w-full font-bold text-amber-900 border-amber-300 p-2" />
                      </div>
                      <div className="flex-1">
                          <label className="block text-xs font-bold text-emerald-700 uppercase tracking-widest mb-1">Dcto. Pronto Pago (%)</label>
                          <InputText value={conditionDiscountStr} onChange={(e) => setConditionDiscountStr(e.target.value)} disabled={!isDraft} placeholder="Ej: 2" className="w-full font-bold text-emerald-900 border-emerald-300 p-2" />
                      </div>
                  </div>
                  <div className="flex justify-between items-center px-4 pt-2">
                      <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">Gran Total a Pagar (Neto)</span>
                      <div className="flex flex-col items-end">
                          <span className="text-4xl font-black text-emerald-600">{currencies.find(c => c.id === currencyId)?.symbol || '$'}{calculateTotal().toLocaleString('en-US', {minimumFractionDigits: currencies.find(c => c.id === currencyId)?.decimal_places ?? 2, maximumFractionDigits: currencies.find(c => c.id === currencyId)?.decimal_places ?? 2})}</span>
                          {currencyId !== 1 && exchangeRate > 0 && (
                              <span className="text-sm font-bold text-slate-400 mt-1">
                                  ≈ $ {(calculateTotal() / exchangeRate).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD <span className="text-[11px] font-normal opacity-80">(Tasa Aplicada: {exchangeRate})</span>
                              </span>
                          )}
                          {currencyId === 1 && systemLocalRate > 0 && (
                              <span className="text-sm font-bold text-slate-400 mt-1">
                                  ≈ Bs. {(calculateTotal() * systemLocalRate).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} VES <span className="text-[11px] font-normal opacity-80">(Tasa Referencial: {systemLocalRate})</span>
                              </span>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      </div>

      {/* CONSOLA DE ACCIONES */}
      {isDraft && (
          <div className="flex justify-end gap-4 p-6 bg-white rounded-2xl shadow-sm border border-slate-200 mt-6">
             <Button label="Guardar Progreso" icon="pi pi-save" outlined severity="secondary" onClick={saveChanges} disabled={saving} className="font-bold border-2" />
             <Button label="Aprobar Oficialmente" icon="pi pi-check-circle" severity="success" onClick={approveOrder} disabled={saving} className="font-bold px-8 shadow-lg hover:shadow-xl transition-all shadow-emerald-500/30 text-lg" />
          </div>
      )}
      {order.status === 'pending_approval' && (
          <div className="flex justify-end gap-4 p-6 bg-white rounded-2xl shadow-sm border border-orange-200 bg-orange-50 mt-6">
             <span className="flex items-center text-orange-600 font-bold mr-4"><i className="pi pi-lock mr-2"></i> Límite de Compra Excedido. Esperando liberación de Gerencia.</span>
             <Button label="Liberar Orden (Gerencia)" icon="pi pi-key" severity="warning" onClick={() => {
                 axios.put(`http://localhost:8000/api/v1/purchase-orders/${orderId}/status`, { status: 'approved' })
                     .then(() => fetchOrder())
                     .catch(() => toast.current?.show({severity:'error', summary:'Aviso', detail:'Acceso Denegado'}));
             }} className="font-bold px-8 shadow-lg text-lg bg-orange-600 border-none" />
          </div>
      )}
      {!isDraft && order.status !== 'pending_approval' && (
          <div className="flex justify-end gap-4 p-6 bg-slate-50 rounded-2xl shadow-inner border border-slate-200 mt-6">
             <Button label="Visor PDF Corporativo" icon="pi pi-file-pdf" severity="danger" outlined onClick={() => window.open(`http://localhost:8000/api/v1/purchase-orders/${orderId}/pdf`, '_blank')} className="font-bold bg-white" />
             {(order.status === 'approved' || order.status === 'sent' || order.status === 'viewed') && (
                 <Button label="Disparar a Proveedor" icon="pi pi-whatsapp" severity="success" onClick={triggerMailer} disabled={saving} className="font-bold px-8 shadow-md" />
             )}
          </div>
      )}
      
      {/* PANEL DE CONCILIACIÓN 3-WAY MATCH (FASE 8) */}
      {order.status === 'received' && (
          <ConciliationPanel order={order} currencies={currencies} currencyId={currencyId} onConciliated={fetchOrder} />
      )}
      
      {/* DIÁLOGO DE REGALÍA */}
      <Dialog header="Añadir Regalía / Bonificación" visible={showRegaliaModal} style={{ width: '400px' }} onHide={() => { setShowRegaliaModal(false); setRegaliaInBaseUnit(false); }}>
          <div className="flex flex-col gap-4 py-2">
              <span className="text-sm text-slate-500 bg-amber-50 p-2 rounded border border-amber-100 text-amber-800">
                  <i className="pi pi-info-circle mr-2"></i>
                  El insumo seleccionado quedará atado a la orden por un Costo de $0.00, logrando diluir matemáticamente tu Costo Promedio sin generar rechazos WMS.
              </span>
              <Dropdown value={selectedRegalia} options={catalog} onChange={(e) => setSelectedRegalia(e.value)} optionLabel="display_name" filter filterBy="display_name" placeholder="Selecciona la Bonificación..." className="w-full" />
              
              <div className="flex items-center mt-2 bg-slate-50 p-3 rounded-lg border border-slate-200 cursor-pointer transition-colors hover:bg-slate-100" onClick={() => setRegaliaInBaseUnit(!regaliaInBaseUnit)}>
                  <Checkbox inputId="cb_baseunit" checked={regaliaInBaseUnit} onChange={(e) => setRegaliaInBaseUnit(e.checked || false)} />
                  <label htmlFor="cb_baseunit" className="ml-3 text-sm font-bold text-slate-700 cursor-pointer flex-1">
                      Recibir como Unidades Sueltas
                      <span className="block text-xs font-normal text-slate-500 mt-1">Ignora el empaque maestro del proveedor y contabiliza unidad por unidad al Almacén.</span>
                  </label>
              </div>

              <Button label="Insertar Fila Gratuita" icon="pi pi-plus" severity="success" onClick={addRegalia} disabled={!selectedRegalia} className="mt-4 w-full font-bold" />
          </div>
      </Dialog>
    </div>
  );
}
