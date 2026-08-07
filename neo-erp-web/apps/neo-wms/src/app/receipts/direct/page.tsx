"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Dropdown } from 'primereact/dropdown';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Toast } from 'primereact/toast';
import { Dialog } from 'primereact/dialog';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

export default function DirectReceiptPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Line item drafting
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [inputExpectedQty, setInputExpectedQty] = useState<number>(1);
  const [inputQty, setInputQty] = useState<number>(1);
  const [inputCost, setInputCost] = useState<number>(0);
  const [rejectionReason, setRejectionReason] = useState('');

  const [lines, setLines] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [receiptVoucher, setReceiptVoucher] = useState<any | null>(null);

  const toast = useRef<Toast>(null);
  const router = useRouter();

  const loadFormData = async () => {
    // 1. Fetch Suppliers
    try {
      const supRes = await api.get('/suppliers/?limit=5000');
      const suppliersList = Array.isArray(supRes.data) ? supRes.data : (supRes.data?.data || supRes.data?.items || []);
      setSuppliers(suppliersList.map((s: any) => ({ label: `${s.name} ${s.tax_id ? `(${s.tax_id})` : ''}`, value: s.id })));
    } catch(e) {
      console.error("Error loading suppliers:", e);
    }

    // 2. Fetch Facilities
    try {
      const facRes = await api.get('/facilities/');
      const facilitiesList = Array.isArray(facRes.data) ? facRes.data : (facRes.data?.data || facRes.data?.items || []);
      setFacilities(facilitiesList.map((f: any) => ({ label: f.name, value: f.id })));
    } catch(e) {
      console.error("Error loading facilities:", e);
    }

    // 3. Fetch Products
    try {
      const prodRes = await api.get('/products/?limit=1000');
      const productsList = Array.isArray(prodRes.data) ? prodRes.data : (prodRes.data?.data || prodRes.data?.items || []);
      const variantList: any[] = [];
      productsList.forEach((p: any) => {
        if (p.variants && p.variants.length > 0) {
          p.variants.forEach((v: any) => {
            variantList.push({
              label: `${p.name} (SKU: ${v.sku})`,
              value: v.id,
              sku: v.sku,
              product_name: p.name,
              cost: parseFloat(v.average_cost || v.standard_cost || 0)
            });
          });
        }
      });
      setProducts(variantList);
    } catch(e) {
      console.error("Error loading products:", e);
    }
  };

  useEffect(() => {
    loadFormData();
  }, []);

  const handleSelectVariant = (variantId: number) => {
    const item = products.find(p => p.value === variantId);
    if (item) {
      setSelectedVariant(item);
      setInputCost(item.cost);
    }
  };

  const addLine = () => {
    if (!selectedVariant) {
      toast.current?.show({ severity: 'warn', summary: 'Atención', detail: 'Seleccione un producto para ingresar.' });
      return;
    }
    if (inputExpectedQty <= 0 || inputQty < 0) {
      toast.current?.show({ severity: 'warn', summary: 'Atención', detail: 'Verifique las cantidades ingresadas.' });
      return;
    }

    const diff = inputExpectedQty - inputQty;

    const existingIndex = lines.findIndex(l => l.variant_id === selectedVariant.value);
    if (existingIndex >= 0) {
      const updated = [...lines];
      updated[existingIndex].expected_qty += inputExpectedQty;
      updated[existingIndex].received_qty += inputQty;
      updated[existingIndex].damaged_qty += (diff > 0 ? diff : 0);
      setLines(updated);
    } else {
      setLines([
        ...lines,
        {
          variant_id: selectedVariant.value,
          sku: selectedVariant.sku,
          product_name: selectedVariant.product_name,
          expected_qty: inputExpectedQty,
          received_qty: inputQty,
          unit_cost: inputCost,
          damaged_qty: diff > 0 ? diff : 0,
          rejection_reason: diff > 0 ? (rejectionReason || 'Faltante de origen respecto a factura') : ''
        }
      ]);
    }

    // Reset line fields
    setSelectedVariant(null);
    setInputExpectedQty(1);
    setInputQty(1);
    setInputCost(0);
    setRejectionReason('');
  };

  const removeLine = (index: number) => {
    const copy = [...lines];
    copy.splice(index, 1);
    setLines(copy);
  };

  const handleSubmitDirectReceipt = async () => {
    if (!selectedSupplierId) {
      toast.current?.show({ severity: 'warn', summary: 'Requerido', detail: 'Seleccione el proveedor de origen.' });
      return;
    }
    if (!selectedFacilityId) {
      toast.current?.show({ severity: 'warn', summary: 'Requerido', detail: 'Seleccione la sucursal de destino.' });
      return;
    }
    if (lines.length === 0) {
      toast.current?.show({ severity: 'warn', summary: 'Requerido', detail: 'Ingrese al menos un producto a recibir.' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        supplier_id: selectedSupplierId,
        facility_id: selectedFacilityId,
        invoice_number: invoiceNumber,
        notes: notes,
        lines: lines.map(l => ({
          variant_id: l.variant_id,
          expected_qty: l.expected_qty,
          received_qty: l.received_qty,
          unit_cost: l.unit_cost,
          damaged_qty: l.damaged_qty,
          rejection_reason: l.rejection_reason
        }))
      };

      const res = await api.post('/wms/receipts/direct', payload);
      toast.current?.show({ severity: 'success', summary: 'Procesado', detail: res.data.message });
      
      // Armar voucher para impresión
      const supplierName = suppliers.find(s => s.value === selectedSupplierId)?.label || 'S/N';
      const facilityName = facilities.find(f => f.value === selectedFacilityId)?.label || 'S/N';
      
      setReceiptVoucher({
        reference: res.data.reference,
        supplierName,
        facilityName,
        invoiceNumber,
        notes,
        date: new Date(),
        lines: [...lines]
      });

    } catch (e: any) {
      const msg = e.response?.data?.detail || 'Fallo al registrar recepción directa.';
      toast.current?.show({ severity: 'error', summary: 'Error de Autorización', detail: msg });
    }
    setSubmitting(false);
  };

  const totalAmount = lines.reduce((acc, l) => acc + (l.received_qty * l.unit_cost), 0);

  return (
    <div className="p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />

      {/* ENCABEZADO */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex justify-between items-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-emerald-600"></div>
        <div className="pl-4">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
             <i className="pi pi-plus-circle text-emerald-600 mr-3"></i>Recepción Directa de Mercancía (Sin ODC)
          </h1>
          <p className="text-slate-500 text-sm mt-1">Entrada no planificada de productos al inventario por entregas directas o compras locales.</p>
        </div>
        <div className="flex gap-4">
          <Button label="Volver al Muelle" icon="pi pi-arrow-left" outlined severity="secondary" onClick={() => router.push('/receipts')} className="font-bold" />
        </div>
      </div>

      {/* FORMULARIO PRINCIPAL */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-2 relative">
           <label className="text-xs font-bold text-slate-500 uppercase">1. Proveedor Origen (*)</label>
           <Dropdown 
              value={selectedSupplierId} 
              onChange={e => setSelectedSupplierId(e.value)} 
              options={suppliers} 
              placeholder="Seleccione Proveedor" 
              filter
              appendTo="self"
              panelClassName="!w-full !min-w-[320px] shadow-2xl rounded-xl border border-slate-200"
              className="w-full text-sm font-bold border-slate-200" 
           />
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-2 relative">
           <label className="text-xs font-bold text-slate-500 uppercase">2. Sucursal / Almacén Destino (*)</label>
           <Dropdown 
              value={selectedFacilityId} 
              onChange={e => setSelectedFacilityId(e.value)} 
              options={facilities} 
              placeholder="Seleccione Sucursal" 
              filter
              appendTo="self"
              panelClassName="!w-full !min-w-[280px] shadow-2xl rounded-xl border border-slate-200"
              className="w-full text-sm font-bold border-slate-200" 
           />
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-2">
           <label className="text-xs font-bold text-slate-500 uppercase">3. N° Factura / Guía de Despacho</label>
           <InputText 
              value={invoiceNumber} 
              onChange={e => setInvoiceNumber(e.target.value)} 
              placeholder="Ej: FACT-99012" 
              className="w-full text-sm font-bold border-slate-200" 
           />
        </div>
      </div>

      {/* AGREGAR PRODUCTOS CON COMPARACIÓN FACTURA VS FÍSICO */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
            <i className="pi pi-box text-emerald-600 mr-2"></i>Ingreso de Productos al Conteo
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
           <div className="md:col-span-4 flex flex-col gap-1 relative">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Buscar Producto (SKU o Nombre)</label>
              <Dropdown 
                 value={selectedVariant?.value} 
                 onChange={e => handleSelectVariant(e.value)} 
                 options={products} 
                 placeholder="Escriba o seleccione un producto..." 
                 filter
                 appendTo="self"
                 panelClassName="!w-full !min-w-[350px] shadow-2xl rounded-xl border border-slate-200"
                 className="w-full text-sm font-bold border-slate-200" 
              />
           </div>

           <div className="md:col-span-2 flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-600 uppercase bg-slate-100 px-2 py-0.5 rounded w-fit">Cant. según Factura</label>
              <InputNumber 
                 value={inputExpectedQty} 
                 onValueChange={e => {
                   const val = e.value || 1;
                   setInputExpectedQty(val);
                   if (inputQty > val) setInputQty(val);
                 }} 
                 min={1} 
                 className="w-full font-bold" 
              />
           </div>

           <div className="md:col-span-2 flex flex-col gap-1">
              <label className="text-[10px] font-bold text-emerald-700 uppercase bg-emerald-50 px-2 py-0.5 rounded w-fit">Cant. Física Recibida</label>
              <InputNumber 
                 value={inputQty} 
                 onValueChange={e => setInputQty(e.value ?? 0)} 
                 min={0} 
                 className="w-full font-bold text-emerald-700" 
              />
           </div>

           <div className="md:col-span-2 flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Costo Unit. ($)</label>
              <InputNumber 
                 value={inputCost} 
                 onValueChange={e => setInputCost(e.value || 0)} 
                 minFractionDigits={2} 
                 maxFractionDigits={4} 
                 className="w-full font-bold" 
              />
           </div>

           <div className="md:col-span-2">
              <Button 
                 label="Agregar Renglón" 
                 icon="pi pi-plus" 
                 onClick={addLine} 
                 className="w-full bg-slate-800 hover:bg-slate-900 border-none font-bold shadow" 
              />
           </div>
        </div>

        {/* ALERTA DE DISCREPANCIA AL DIGITAR */}
        {inputExpectedQty > inputQty && (
           <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-xs text-amber-900 font-bold">
              <i className="pi pi-exclamation-triangle text-amber-600 text-lg"></i>
              <div className="flex-1">
                 <span>Faltante detectado: La factura indica {inputExpectedQty} unids. pero se están recibiendo {inputQty} unids. (Diferencia de {inputExpectedQty - inputQty} faltantes).</span>
              </div>
              <InputText 
                 value={rejectionReason} 
                 onChange={e => setRejectionReason(e.target.value)} 
                 placeholder="Motivo de la diferencia / observación..." 
                 className="text-xs p-1.5 w-64 border-amber-300" 
              />
           </div>
        )}
      </div>

      {/* TABLA DE RENGLONES DRAFT CON COMPARACIÓN FACTURA VS FÍSICO */}
      <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 mb-6">
        <h3 className="text-md font-bold text-slate-700 mb-3">Detalle de Renglones Entrantes ({lines.length})</h3>

        <DataTable value={lines} emptyMessage="No ha agregado productos a esta recepción directa." stripedRows size="small">
          <Column header="SKU" field="sku" body={r => <span className="font-mono font-bold bg-slate-100 px-2 py-1 rounded text-xs">{r.sku}</span>} style={{ width: '10rem' }} />
          <Column header="PRODUCTO" field="product_name" body={r => <span className="font-bold text-slate-800">{r.product_name}</span>} />
          
          <Column header="CANT. FACTURA" field="expected_qty" align="center" body={r => <span className="font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full text-xs">{r.expected_qty}</span>} style={{ width: '9rem' }} />
          <Column header="CANT. RECIBIDA" field="received_qty" align="center" body={r => <span className="font-extrabold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full text-xs">{r.received_qty}</span>} style={{ width: '9rem' }} />
          
          <Column header="DIFERENCIA / FALTANTE" align="center" body={r => {
             const diff = (r.expected_qty || r.received_qty) - r.received_qty;
             if (diff > 0) {
                return (
                   <span className="font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full text-xs" title={r.rejection_reason}>
                      -{diff} Faltantes
                   </span>
                );
             }
             return <span className="text-slate-400 text-xs font-semibold">Completo (0)</span>;
          }} style={{ width: '11rem' }} />

          <Column header="COSTO UNIT ($)" field="unit_cost" align="right" body={r => <span>${parseFloat(r.unit_cost).toFixed(2)}</span>} style={{ width: '9rem' }} />
          <Column header="SUBTOTAL ($)" align="right" body={r => <span className="font-black text-slate-800">${(r.received_qty * r.unit_cost).toFixed(2)}</span>} style={{ width: '9rem' }} />
          
          <Column header="ACCIÓN" align="center" body={(r, options) => (
             <Button icon="pi pi-trash" rounded severity="danger" text onClick={() => removeLine(options.rowIndex)} tooltip="Quitar" />
          )} style={{ width: '5rem' }} />
        </DataTable>

        <div className="mt-6 flex justify-between items-center border-t border-slate-200 pt-4">
           <div>
              <span className="text-xs font-bold text-slate-400 uppercase">Monto Total Recibido ($)</span>
              <h2 className="text-3xl font-black text-emerald-600">${totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</h2>
           </div>

           <Button 
              label="Confirmar e Ingresar a Inventario" 
              icon="pi pi-check-circle" 
              loading={submitting} 
              onClick={handleSubmitDirectReceipt} 
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-8 py-3 rounded-xl shadow-lg shadow-emerald-500/20 text-lg border-none" 
           />
        </div>
      </div>

      {/* DIÁLOGO VOUCHER ACTA DEFINITIVA CON CUADRO DE DISCREPANCIAS */}
      <Dialog 
         visible={!!receiptVoucher} 
         onHide={() => { setReceiptVoucher(null); router.push('/receipts'); }} 
         header="ACTA DEFINITIVA DE RECEPCIÓN DIRECTA" 
         modal 
         className="w-full max-w-4xl"
      >
        {receiptVoucher && (
           <div className="p-4 bg-white font-sans text-slate-800">
              <div className="border-b-2 border-slate-800 pb-4 mb-4 flex justify-between items-center">
                 <div>
                    <h2 className="text-xl font-black tracking-tight text-slate-900">ACTA DE RECEPCIÓN DIRECTA Y DISCREPANCIAS</h2>
                    <p className="text-xs font-bold text-slate-500">CORRELATIVO: {receiptVoucher.reference}</p>
                 </div>
                 <Button label="Imprimir 🖨️" icon="pi pi-print" onClick={() => window.print()} className="bg-slate-900 font-bold" />
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs font-bold mb-4 bg-slate-50 p-3 rounded border border-slate-200">
                 <div>PROVEEDOR: <span className="font-normal">{receiptVoucher.supplierName}</span></div>
                 <div>SUCURSAL DESTINO: <span className="font-normal">{receiptVoucher.facilityName}</span></div>
                 <div>FACTURA / GUÍA: <span className="font-normal">{receiptVoucher.invoiceNumber || 'S/N'}</span></div>
                 <div>FECHA ENTRADA: <span className="font-normal">{format(receiptVoucher.date, 'dd/MM/yyyy HH:mm')}</span></div>
              </div>

              <table className="w-full text-xs text-left border-collapse border border-slate-300 mb-6">
                 <thead>
                    <tr className="bg-slate-100 font-bold text-slate-700">
                       <th className="border p-2">SKU</th>
                       <th className="border p-2">PRODUCTO</th>
                       <th className="border p-2 text-center">CANT. FACTURA</th>
                       <th className="border p-2 text-center">RECIBIDO REAL</th>
                       <th className="border p-2 text-center">FALTANTE</th>
                       <th className="border p-2 text-right">COSTO UNIT ($)</th>
                       <th className="border p-2 text-right">SUBTOTAL ($)</th>
                    </tr>
                 </thead>
                 <tbody>
                    {receiptVoucher.lines.map((l: any, i: number) => {
                       const diff = (l.expected_qty || l.received_qty) - l.received_qty;
                       return (
                          <tr key={i} className={diff > 0 ? "bg-red-50/50" : ""}>
                             <td className="border p-2 font-mono">{l.sku}</td>
                             <td className="border p-2 font-bold">{l.product_name}</td>
                             <td className="border p-2 text-center font-bold">{l.expected_qty || l.received_qty}</td>
                             <td className="border p-2 text-center font-bold text-emerald-700">{l.received_qty}</td>
                             <td className="border p-2 text-center font-bold text-red-600">
                                {diff > 0 ? `-${diff}` : '0'}
                             </td>
                             <td className="border p-2 text-right">${parseFloat(l.unit_cost).toFixed(2)}</td>
                             <td className="border p-2 text-right font-black">${(l.received_qty * l.unit_cost).toFixed(2)}</td>
                          </tr>
                       );
                    })}
                 </tbody>
              </table>

              <div className="grid grid-cols-2 gap-8 mt-12 pt-8 border-t border-slate-300 text-center text-xs font-bold">
                 <div>
                    <div className="border-b border-slate-400 mb-1 pb-8"></div>
                    ENTREGADO POR (CHOFER / PROVEEDOR)
                 </div>
                 <div>
                    <div className="border-b border-slate-400 mb-1 pb-8"></div>
                    RECIBIDO WMS (FISCAL DE ALMACÉN)
                 </div>
              </div>
           </div>
        )}
      </Dialog>
    </div>
  );
}
