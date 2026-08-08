"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Calendar } from 'primereact/calendar';
import { Dropdown } from 'primereact/dropdown';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Toast } from 'primereact/toast';
import { Dialog } from 'primereact/dialog';
import { Tag } from 'primereact/tag';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

export default function DirectReceiptPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [allWarehouses, setAllWarehouses] = useState<any[]>([]);
  const [filteredWarehouses, setFilteredWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Table Lines
  const [lines, setLines] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [receiptVoucher, setReceiptVoucher] = useState<any | null>(null);

  // Modal: Agregar Producto
  const [addProductModalVisible, setAddProductModalVisible] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [inputExpectedQty, setInputExpectedQty] = useState<number>(1);
  const [inputQty, setInputQty] = useState<number>(1);
  const [inputCost, setInputCost] = useState<number>(0);
  const [inputLotNumber, setInputLotNumber] = useState<string>('');
  const [inputExpirationDate, setInputExpirationDate] = useState<Date | null>(null);

  // Modal: Reportar Avería / Devolución por Calidad (Idéntico a ODC)
  const [discrepancyDialogVisible, setDiscrepancyDialogVisible] = useState(false);
  const [discrepancyIndex, setDiscrepancyIndex] = useState<number | null>(null);
  const [discrepancyDamagedQty, setDiscrepancyDamagedQty] = useState<number>(0);
  const [discrepancyReason, setDiscrepancyReason] = useState<string>('');

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

  // Dynamically load warehouses whenever selected facility changes
  useEffect(() => {
    const fetchWarehouses = async () => {
      if (!selectedFacilityId) {
        setFilteredWarehouses([]);
        setSelectedWarehouseId(null);
        return;
      }

      try {
        const res = await api.get(`/warehouses/?facility_id=${selectedFacilityId}`);
        const whList = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        let whOptions = whList.map((w: any) => ({
          label: `${w.name} ${w.code ? `(${w.code})` : ''}`,
          value: w.id
        }));

        if (whOptions.length === 0) {
          const facName = facilities.find(f => Number(f.value) === Number(selectedFacilityId))?.label || '';
          whOptions = [{ label: `Almacén Principal ${facName} (Predeterminado)`, value: null }];
        }

        setFilteredWarehouses(whOptions);
        setSelectedWarehouseId(whOptions[0].value);
      } catch (e) {
        console.error("Error fetching facility warehouses:", e);
        setFilteredWarehouses([]);
        setSelectedWarehouseId(null);
      }
    };

    fetchWarehouses();
  }, [selectedFacilityId, facilities]);

  const handleSelectVariant = (variantId: number) => {
    const item = products.find(p => p.value === variantId);
    if (item) {
      setSelectedVariant(item);
      setInputCost(item.cost);
    }
  };

  const handleAddProductFromModal = () => {
    if (!selectedVariant) {
      toast.current?.show({ severity: 'warn', summary: 'Atención', detail: 'Seleccione un producto.' });
      return;
    }
    if (inputExpectedQty <= 0 || inputQty < 0) {
      toast.current?.show({ severity: 'warn', summary: 'Atención', detail: 'Verifique las cantidades ingresadas.' });
      return;
    }

    const existingIndex = lines.findIndex(l => l.variant_id === selectedVariant.value);
    if (existingIndex >= 0) {
      const updated = [...lines];
      updated[existingIndex].expected_qty += inputExpectedQty;
      updated[existingIndex].received_qty += inputQty;
      if (inputCost > 0) updated[existingIndex].unit_cost = inputCost;
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
          damaged_qty: 0,
          unit_cost: inputCost,
          lot_number: inputLotNumber || '',
          expiration_date: inputExpirationDate,
          rejection_reason: ''
        }
      ]);
    }

    // Reset modal fields
    setSelectedVariant(null);
    setInputExpectedQty(1);
    setInputQty(1);
    setInputCost(0);
    setInputLotNumber('');
    setInputExpirationDate(null);
    setAddProductModalVisible(false);

    toast.current?.show({ severity: 'success', summary: 'Producto Añadido', detail: 'Producto ingresado al manifiesto directo.' });
  };

  // Row inline edits
  const handleQtyChange = (index: number, val: any) => {
    setLines(prev => {
      const updated = [...prev];
      const parsed = isNaN(parseFloat(val)) ? 0 : parseFloat(val);
      updated[index] = { ...updated[index], received_qty: parsed };
      return updated;
    });
  };

  const handleExpectedQtyChange = (index: number, val: any) => {
    setLines(prev => {
      const updated = [...prev];
      const parsed = isNaN(parseFloat(val)) ? 0 : parseFloat(val);
      updated[index] = { ...updated[index], expected_qty: parsed };
      return updated;
    });
  };

  const handleCostChange = (index: number, val: any) => {
    setLines(prev => {
      const updated = [...prev];
      const parsed = isNaN(parseFloat(val)) ? 0 : parseFloat(val);
      updated[index] = { ...updated[index], unit_cost: parsed };
      return updated;
    });
  };

  const handleTextChange = (index: number, field: string, val: string) => {
    setLines(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };
      return updated;
    });
  };

  const handleDateChange = (index: number, val: Date | null) => {
    setLines(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], expiration_date: val };
      return updated;
    });
  };

  const removeLine = (index: number) => {
    const copy = [...lines];
    copy.splice(index, 1);
    setLines(copy);
  };

  // Discrepancy Dialog (Idéntico a Recepción ODC)
  const openDiscrepancyDialog = (line: any, index: number) => {
    setDiscrepancyIndex(index);
    setDiscrepancyDamagedQty(line.damaged_qty || 0);
    setDiscrepancyReason(line.rejection_reason || '');
    setDiscrepancyDialogVisible(true);
  };

  const saveDiscrepancy = () => {
    if (discrepancyIndex === null) return;
    setLines(prev => {
      const updated = [...prev];
      updated[discrepancyIndex] = {
        ...updated[discrepancyIndex],
        damaged_qty: discrepancyDamagedQty,
        rejection_reason: discrepancyReason || 'Avería / Devolución por calidad reportada en muelle'
      };
      return updated;
    });
    setDiscrepancyDialogVisible(false);
    toast.current?.show({ severity: 'info', summary: 'Avería / Devolución Guardada', detail: 'Registro actualizado en el manifiesto.' });
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
        warehouse_id: selectedWarehouseId,
        invoice_number: invoiceNumber,
        notes: notes,
        lines: lines.map(l => ({
          variant_id: l.variant_id,
          expected_qty: l.expected_qty,
          received_qty: l.received_qty,
          unit_cost: l.unit_cost,
          damaged_qty: l.damaged_qty,
          rejection_reason: l.rejection_reason,
          lot_number: l.lot_number || null,
          expiration_date: l.expiration_date ? format(l.expiration_date, 'yyyy-MM-dd') : null
        }))
      };

      const res = await api.post('/wms/receipts/direct', payload);
      toast.current?.show({ severity: 'success', summary: 'Procesado', detail: res.data.message });
      
      const supplierName = suppliers.find(s => s.value === selectedSupplierId)?.label || 'S/N';
      const facilityName = facilities.find(f => f.value === selectedFacilityId)?.label || 'S/N';
      const warehouseName = filteredWarehouses.find(w => w.value === selectedWarehouseId)?.label || 'Almacén Principal';

      setReceiptVoucher({
        reference: res.data.reference,
        supplierName,
        facilityName,
        warehouseName,
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
    <div className="p-4 sm:p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />

      {/* ENCABEZADO IDÉNTICO A RECEPCIÓN ODC CON SELECCIÓN DE DEPÓSITO Y DATOS DE CABECERA */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-emerald-600"></div>
        
        <div>
          <div className="flex items-center gap-3 mb-1">
             <Button icon="pi pi-arrow-left" rounded text aria-label="Volver" onClick={() => router.push('/receipts')} />
             <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
                <i className="pi pi-plus-circle text-emerald-600 mr-3"></i>Recepción Directa (Sin ODC)
             </h1>
          </div>
          <p className="text-slate-500 ml-12 text-xs mt-1">Ingreso de mercancía no planificada por entregas directas o compras locales en muelle.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button label="Volver al Muelle" icon="pi pi-arrow-left" outlined severity="secondary" onClick={() => router.push('/receipts')} className="font-bold text-xs" />
        </div>
      </div>

      {/* BLOQUE DE DATOS DE CABECERA (PROVEEDOR, SUCURSAL, DEPÓSITO, FACTURA) */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="flex flex-col gap-1 relative">
           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">1. Proveedor Origen (*)</label>
           <Dropdown 
              value={selectedSupplierId} 
              onChange={e => setSelectedSupplierId(e.value)} 
              options={suppliers} 
              placeholder="Seleccione Proveedor" 
              filter
              appendTo="self"
              panelClassName="!w-full !min-w-[320px] shadow-2xl rounded-xl border border-slate-200"
              className="w-full text-xs font-bold border-slate-200" 
           />
        </div>

        <div className="flex flex-col gap-1 relative">
           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">2. Sucursal Destino (*)</label>
           <Dropdown 
              value={selectedFacilityId} 
              onChange={e => setSelectedFacilityId(e.value)} 
              options={facilities} 
              placeholder="Seleccione Sucursal" 
              filter
              appendTo="self"
              panelClassName="!w-full !min-w-[280px] shadow-2xl rounded-xl border border-slate-200"
              className="w-full text-xs font-bold border-slate-200" 
           />
        </div>

        <div className="flex flex-col gap-1 relative">
           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">3. Depósito de Ingreso (*)</label>
           <Dropdown 
              value={selectedWarehouseId} 
              onChange={e => setSelectedWarehouseId(e.value)} 
              options={filteredWarehouses} 
              placeholder={selectedFacilityId ? "Seleccione Depósito" : "Primero seleccione Sucursal"} 
              disabled={!selectedFacilityId}
              filter
              appendTo="self"
              panelClassName="!w-full !min-w-[280px] shadow-2xl rounded-xl border border-slate-200"
              className="w-full text-xs font-bold border-slate-200" 
           />
        </div>

        <div className="flex flex-col gap-1">
           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">4. N° Factura / Guía de Despacho</label>
           <InputText 
              value={invoiceNumber} 
              onChange={e => setInvoiceNumber(e.target.value)} 
              placeholder="Ej: FACT-99012" 
              className="w-full text-xs font-bold border-slate-200" 
           />
        </div>
      </div>

      {/* MANIFIESTO DE CONTEO FÍSICO (TABLA IDÉNTICA A RECEPCIÓN ODC) */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700 tracking-tight flex items-center text-sm">
                <i className="pi pi-list mr-2 text-emerald-600"></i>Manifiesto de Conteo Físico Directo ({lines.length} Productos)
            </h3>

            <Button 
                label="Agregar Producto a Recepción" 
                icon="pi pi-plus-circle" 
                severity="success" 
                text 
                className="font-bold text-xs" 
                onClick={() => setAddProductModalVisible(true)} 
            />
        </div>
        
        <DataTable dataKey="variant_id" value={lines} emptyMessage="No ha agregado productos a esta recepción directa." size="small" stripedRows rowHover className="text-sm">
          <Column header="SKU" field="sku" body={r => (
              <div className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-600 font-bold border border-slate-200">{r.sku}</span>
              </div>
          )} style={{ width: '8rem' }} />
          
          <Column header="Producto" field="product_name" body={r => <span className="font-bold text-slate-800">{r.product_name}</span>} />
          
          <Column header="Cant. Factura" body={(r, options) => (
             <InputNumber 
                value={r.expected_qty} 
                onValueChange={e => handleExpectedQtyChange(options.rowIndex, e.value)} 
                min={1} 
                className="w-20 text-center font-bold" 
                inputClassName="w-20 text-center text-xs font-bold border-slate-200"
             />
          )} align="center" style={{ width: '7rem' }} />

          {/* FÍSICO RECIBIDO BUENO (ESTILO IDÉNTICO A ODC) */}
          <Column header="Físico Recibido" body={(r, options) => (
             <div className="flex justify-end">
                 <InputNumber 
                    value={r.received_qty} 
                    onValueChange={e => handleQtyChange(options.rowIndex, e.value)} 
                    min={0} 
                    inputClassName="w-24 text-right text-base font-black p-2 rounded-lg border-2 border-emerald-200 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 bg-emerald-50/50 transition-all text-emerald-700 shadow-inner" 
                 />
             </div>
          )} align="right" style={{ width: '8rem' }} />

          {/* ESTADO CONTEO */}
          <Column header="Estado Conteo" body={r => {
              const exp = Number(r.expected_qty) || 0;
              const rec = Number(r.received_qty) || 0;
              const dam = Number(r.damaged_qty) || 0;
              const diff = (rec + dam) - exp;

              if (diff === 0 && dam === 0) return <Tag value="COMPLETO (OK)" severity="success" className="font-extrabold text-[9px]" />;
              if (dam > 0) return <Tag value={`CON DEVOLUCIÓN (${dam})`} severity="warning" className="font-extrabold text-[9px]" />;
              if (diff > 0) return <Tag value={`SOBRANTE (+${diff})`} severity="info" className="font-extrabold text-[9px]" />;
              return <Tag value={`FALTANTE (${diff})`} severity="danger" className="font-extrabold text-[9px]" />;
          }} align="center" style={{ width: '10rem' }} />

          <Column header="Trazabilidad (Lote)" body={(r, options) => (
             <InputText 
                 value={r.lot_number || ''} 
                 onChange={(e) => handleTextChange(options.rowIndex, 'lot_number', e.target.value)} 
                 placeholder="Ej: L-204" 
                 className="w-24 text-xs font-bold text-center uppercase" 
             />
          )} align="center" style={{ width: '8rem' }} />

          <Column header="Vencimiento (FEFO)" body={(r, options) => (
             <Calendar 
                 value={r.expiration_date} 
                 onChange={(e) => handleDateChange(options.rowIndex, e.value as Date)} 
                 dateFormat="dd/mm/yy" 
                 placeholder="Opcional" 
                 className="w-28 p-inputtext-sm text-xs" 
             />
          )} align="center" style={{ width: '9rem' }} />

          {/* AVERÍA Y DEVOLUCIÓN POR CALIDAD (BOTÓN TRIÁNGULO IDÉNTICO A ODC) */}
          <Column header="Avería / Calidad" body={(r, options) => (
             <Button 
                 icon="pi pi-exclamation-triangle" 
                 rounded 
                 text 
                 severity={r.damaged_qty > 0 ? "danger" : "secondary"} 
                 title={r.damaged_qty > 0 ? `${r.damaged_qty} unds devueltas por calidad: ${r.rejection_reason || ''}` : "Reportar Avería o Devolución"}
                 onClick={() => openDiscrepancyDialog(r, options.rowIndex)} 
             />
          )} align="center" style={{ width: '6rem' }} />

          <Column header="Costo Unit ($)" body={(r, options) => (
             <InputNumber 
                value={r.unit_cost} 
                onValueChange={e => handleCostChange(options.rowIndex, e.value)} 
                minFractionDigits={2} 
                maxFractionDigits={4} 
                inputClassName="w-24 text-right text-xs font-bold border-slate-200"
             />
          )} align="right" style={{ width: '8rem' }} />

          <Column header="Subtotal ($)" align="right" body={r => (
             <span className="font-black text-slate-800 text-xs">${(r.received_qty * r.unit_cost).toFixed(2)}</span>
          )} style={{ width: '7rem' }} />

          <Column header="" align="center" body={(r, options) => (
             <Button icon="pi pi-trash" rounded severity="danger" text onClick={() => removeLine(options.rowIndex)} title="Quitar" />
          )} style={{ width: '3rem' }} />
        </DataTable>
      </div>

      {/* BARRA INFERIOR DE TOTAL Y CONFIRMACIÓN */}
      <div className="flex justify-between items-center p-6 bg-white rounded-2xl shadow-sm border border-slate-200 mt-6">
         <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Monto Total Recibido ($)</span>
            <h2 className="text-3xl font-black text-emerald-600">${totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</h2>
         </div>

         <Button 
            label="Confirmar e Ingresar a Inventario" 
            icon="pi pi-check-circle" 
            severity="success" 
            loading={submitting} 
            onClick={handleSubmitDirectReceipt} 
            className="font-bold px-8 shadow-lg hover:shadow-xl transition-all shadow-emerald-500/30 text-lg bg-emerald-600 border-none rounded-xl py-3" 
         />
      </div>

      {/* MODAL: AGREGAR PRODUCTO A RECEPCIÓN DIRECTA */}
      <Dialog 
         header="Agregar Producto a Recepción Directa" 
         visible={addProductModalVisible} 
         onHide={() => setAddProductModalVisible(false)} 
         style={{ width: '550px' }} 
         modal
      >
         <div className="flex flex-col gap-4 p-2 text-slate-800">
            <div className="flex flex-col gap-1 relative">
               <label className="text-xs font-bold text-slate-600 uppercase">Buscar Producto (SKU o Nombre) (*)</label>
               <Dropdown 
                  value={selectedVariant?.value} 
                  onChange={e => handleSelectVariant(e.value)} 
                  options={products} 
                  placeholder="Escriba o busque un producto..." 
                  filter
                  appendTo="self"
                  panelClassName="!w-full shadow-2xl rounded-xl border border-slate-200"
                  className="w-full text-sm font-bold border-slate-200" 
               />
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Cant. según Factura (*)</label>
                  <InputNumber 
                     value={inputExpectedQty} 
                     onValueChange={e => setInputExpectedQty(e.value || 1)} 
                     min={1} 
                     className="w-full font-bold" 
                  />
               </div>

               <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-emerald-700 uppercase">Cant. Física Recibida (*)</label>
                  <InputNumber 
                     value={inputQty} 
                     onValueChange={e => setInputQty(e.value ?? 0)} 
                     min={0} 
                     className="w-full font-bold text-emerald-700" 
                  />
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Costo Unit. ($)</label>
                  <InputNumber 
                     value={inputCost} 
                     onValueChange={e => setInputCost(e.value || 0)} 
                     minFractionDigits={2} 
                     maxFractionDigits={4} 
                     className="w-full font-bold" 
                  />
               </div>

               <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Trazabilidad (Lote)</label>
                  <InputText 
                     value={inputLotNumber} 
                     onChange={e => setInputLotNumber(e.target.value)} 
                     placeholder="Ej: L-204" 
                     className="w-full text-sm font-bold uppercase" 
                  />
               </div>
            </div>

            <div className="flex flex-col gap-1">
               <label className="text-xs font-bold text-slate-600 uppercase">Fecha Vencimiento (FEFO)</label>
               <Calendar 
                  value={inputExpirationDate} 
                  onChange={e => setInputExpirationDate(e.value as Date)} 
                  dateFormat="dd/mm/yy" 
                  placeholder="Opcional" 
                  className="w-full p-inputtext-sm text-sm" 
               />
            </div>

            <div className="mt-4 flex justify-end gap-2">
               <Button label="Cancelar" outlined severity="secondary" onClick={() => setAddProductModalVisible(false)} className="font-bold text-xs" />
               <Button label="Añadir a Recepción" icon="pi pi-plus" severity="success" onClick={handleAddProductFromModal} className="font-bold text-xs bg-emerald-600 border-none" />
            </div>
         </div>
      </Dialog>

      {/* MODAL: REGISTRO DE AVERÍA / DEVOLUCIÓN POR CALIDAD (IDÉNTICO A RECEPCIÓN ODC) */}
      <Dialog 
         header="Registro de Avería o Devolución por Calidad" 
         visible={discrepancyDialogVisible} 
         onHide={() => setDiscrepancyDialogVisible(false)} 
         style={{ width: '450px' }} 
         modal
      >
         <div className="flex flex-col gap-4 p-2 text-slate-800">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-xs text-amber-900 font-bold">
               <i className="pi pi-exclamation-triangle text-amber-600 text-xl"></i>
               <span>Desvío de mercancía no conforme o dañada durante la descarga en muelle.</span>
            </div>

            <div className="flex flex-col gap-1">
               <label className="text-xs font-bold text-slate-600 uppercase">Cantidad Devuelta / Dañada (*)</label>
               <InputNumber 
                  value={discrepancyDamagedQty} 
                  onValueChange={e => setDiscrepancyDamagedQty(e.value || 0)} 
                  min={0} 
                  className="w-full font-bold text-red-700" 
               />
            </div>

            <div className="flex flex-col gap-1">
               <label className="text-xs font-bold text-slate-600 uppercase">Motivo de Devolución / Avería</label>
               <InputText 
                  value={discrepancyReason} 
                  onChange={e => setDiscrepancyReason(e.target.value)} 
                  placeholder="Ej: Empaque roto, No conforme por calidad, Vencido..." 
                  className="w-full text-xs font-bold" 
               />
            </div>

            <div className="mt-4 flex justify-end gap-2">
               <Button label="Cancelar" outlined severity="secondary" onClick={() => setDiscrepancyDialogVisible(false)} className="font-bold text-xs" />
               <Button label="Guardar Avería / Devolución" icon="pi pi-check" severity="danger" onClick={saveDiscrepancy} className="font-bold text-xs bg-red-600 border-none" />
            </div>
         </div>
      </Dialog>

      {/* DIÁLOGO VOUCHER ACTA DEFINITIVA CON DEVOLUCIONES Y ALMACÉN DE DESTINO */}
      <Dialog 
         visible={!!receiptVoucher} 
         onHide={() => { setReceiptVoucher(null); router.push('/receipts'); }} 
         header="ACTA DEFINITIVA DE RECEPCIÓN DIRECTA Y CONTROL DE CALIDAD" 
         modal 
         className="w-full max-w-4xl"
      >
        {receiptVoucher && (
           <div className="p-4 bg-white font-sans text-slate-800">
              <div className="border-b-2 border-slate-800 pb-4 mb-4 flex justify-between items-center">
                 <div>
                    <h2 className="text-xl font-black tracking-tight text-slate-900">ACTA DE RECEPCIÓN DIRECTA, ALMACÉN Y DEVOLUCIONES</h2>
                    <p className="text-xs font-bold text-slate-500">CORRELATIVO: {receiptVoucher.reference}</p>
                 </div>
                 <Button label="Imprimir 🖨️" icon="pi pi-print" onClick={() => window.print()} className="bg-slate-900 font-bold" />
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs font-bold mb-4 bg-slate-50 p-3 rounded border border-slate-200">
                 <div>PROVEEDOR: <span className="font-normal">{receiptVoucher.supplierName}</span></div>
                 <div>SUCURSAL DESTINO: <span className="font-normal">{receiptVoucher.facilityName}</span></div>
                 <div>ALMACÉN / DEPÓSITO: <span className="font-normal text-emerald-700 font-bold">{receiptVoucher.warehouseName}</span></div>
                 <div>FACTURA / GUÍA: <span className="font-normal">{receiptVoucher.invoiceNumber || 'S/N'}</span></div>
                 <div>FECHA ENTRADA: <span className="font-normal">{format(receiptVoucher.date, 'dd/MM/yyyy HH:mm')}</span></div>
              </div>

              <table className="w-full text-xs text-left border-collapse border border-slate-300 mb-6">
                 <thead>
                    <tr className="bg-slate-100 font-bold text-slate-700">
                       <th className="border p-2">SKU</th>
                       <th className="border p-2">PRODUCTO</th>
                       <th className="border p-2 text-center">CANT. FACTURA</th>
                       <th className="border p-2 text-center">RECIBIDO BUENO</th>
                       <th className="border p-2 text-center">DEVUELTO / DAÑADO</th>
                       <th className="border p-2">MOTIVO DEVOLUCIÓN</th>
                       <th className="border p-2 text-right">COSTO UNIT ($)</th>
                       <th className="border p-2 text-right">SUBTOTAL ($)</th>
                    </tr>
                 </thead>
                 <tbody>
                    {receiptVoucher.lines.map((l: any, i: number) => {
                       return (
                          <tr key={i} className={l.damaged_qty > 0 ? "bg-red-50/50" : ""}>
                             <td className="border p-2 font-mono">{l.sku}</td>
                             <td className="border p-2 font-bold">{l.product_name}</td>
                             <td className="border p-2 text-center font-bold">{l.expected_qty}</td>
                             <td className="border p-2 text-center font-bold text-emerald-700">{l.received_qty}</td>
                             <td className="border p-2 text-center font-bold text-red-600">
                                {l.damaged_qty > 0 ? `-${l.damaged_qty}` : '0'}
                             </td>
                             <td className="border p-2 italic text-slate-600">{l.rejection_reason || '-'}</td>
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
