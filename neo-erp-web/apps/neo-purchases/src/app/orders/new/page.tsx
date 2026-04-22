"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Dropdown } from 'primereact/dropdown';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { SelectButton } from 'primereact/selectbutton';
import axios from 'axios';

export default function NewOrderPage() {
  const router = useRouter();
  const toast = useRef<Toast>(null);
  
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [globalVariants, setGlobalVariants] = useState<any[]>([]);
  
  const [searchMode, setSearchMode] = useState<'CATALOG' | 'GLOBAL'>('CATALOG');
  const searchModeOptions = [
      { label: 'Catálogo Privado', value: 'CATALOG' },
      { label: 'Maestro Global', value: 'GLOBAL' }
  ];
  
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  
  const [categories, setCategories] = useState<any[]>([]);
  const [currencies, setCurrencies] = useState<any[]>([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
      name: '',
      category_id: null,
      brand: '',
      currency_id: null,
      unit_cost: 0
  });
  
  const [lines, setLines] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get('http://localhost:8000/api/v1/suppliers/')
      .then(res => setSuppliers(res.data.filter((s: any) => s.is_active)))
      .catch(err => console.error(err));
      
    axios.get('http://localhost:8000/api/v1/products/')
      .then(res => {
          const variants: any[] = [];
          res.data.forEach((p: any) => {
              if (p.variants) {
                  p.variants.forEach((v: any) => {
                      variants.push({
                          variant_id: v.id,
                          variant_sku: v.sku,
                          product_name: p.name,
                          pack_id: null,
                          pack_name: 'Und. Base',
                          qty_per_unit: 1,
                          replacement_cost: v.replacement_cost || p.replacement_cost || 0,
                          display_name: `[GLOBAL] ${v.sku || ''} - ${p.name} - $${v.replacement_cost || p.replacement_cost || 0}`
                      });
                  });
              }
          });
          setGlobalVariants(variants);
      })
      .catch(err => console.error(err));
      
    axios.get('http://localhost:8000/api/v1/facilities/')
      .then(res => setFacilities(res.data))
      .catch(err => console.error(err));
      
    axios.get('http://localhost:8000/api/v1/categories/')
      .then(res => setCategories(res.data))
      .catch(err => console.error(err));
      
    axios.get('http://localhost:8000/api/v1/currencies/')
      .then(res => {
          setCurrencies(res.data);
          let usd = res.data.find((c: any) => c.code === 'USD');
          if (usd) {
              setNewProductForm(prev => ({ ...prev, currency_id: usd.id }));
          }
      })
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (selectedSupplierId) {
      axios.get(`http://localhost:8000/api/v1/suppliers/${selectedSupplierId}/catalog`)
        .then(res => {
            const mappedCatalog = res.data.map((opt: any) => ({
                ...opt,
                display_name: `${opt.variant_sku || ''} - ${opt.product_name} (${opt.pack_name || 'Und.'}) - $${opt.replacement_cost}`
            }));
            setCatalog(mappedCatalog);
        })
        .catch(err => {
             toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el catálogo del proveedor.' });
             setCatalog([]);
        });
        
      const supplier = suppliers.find(s => s.id === selectedSupplierId);
      if (supplier && supplier.default_facility_id) {
          setSelectedFacilityId(supplier.default_facility_id);
      } else {
          setSelectedFacilityId(null);
      }
      
      // Reseteamos las líneas porque son de otro proveedor
      setLines([]);
    } else {
      setCatalog([]);
      setLines([]);
    }
  }, [selectedSupplierId]); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadCatalog = async () => {
       if(!selectedSupplierId) return;
       try {
           const res = await axios.get(`http://localhost:8000/api/v1/suppliers/${selectedSupplierId}/catalog`);
           const mappedCatalog = res.data.map((opt: any) => ({
                ...opt,
                display_name: `${opt.variant_sku || ''} - ${opt.product_name} (${opt.pack_name || 'Und.'}) - $${opt.replacement_cost}`
           }));
           setCatalog(mappedCatalog);
           return mappedCatalog;
       } catch (e) {
           console.error(e);
       }
  };

  const handleCreateFastProduct = async () => {
      if (!newProductForm.name || !newProductForm.category_id || !newProductForm.currency_id) {
          toast.current?.show({ severity: 'warn', summary: 'Campos Obligatorios', detail: 'Nombre, Categoría y Moneda son requeridos.' });
          return;
      }
      setCreatingProduct(true);
      try {
          // 1. Crear Producto Raíz (Sin variantes anidadas formales para forzar Default)
          const productPayload = {
              name: newProductForm.name,
              category_id: newProductForm.category_id,
              brand: newProductForm.brand || 'Genérica',
              currency_id: newProductForm.currency_id,
              has_variants: false,
              is_active: true
          };
          const prodRes = await axios.post('http://localhost:8000/api/v1/products/', productPayload);
          const newProduct = prodRes.data;
          const defaultVariant = newProduct.variants && newProduct.variants.length > 0 ? newProduct.variants[0] : null;

          if (!defaultVariant) {
              throw new Error("No se generó la variante por defecto.");
          }

          // 2. Vincular al Catálogo del Proveedor
          const suppPayload = {
              supplier_id: selectedSupplierId,
              variant_id: defaultVariant.id,
              currency_id: newProductForm.currency_id,
              replacement_cost: newProductForm.unit_cost,
              min_order_qty: 1,
              is_active: true
          };
          // endpoint post de catalog individual
          await axios.post(`http://localhost:8000/api/v1/suppliers/${selectedSupplierId}/catalog`, suppPayload);

          toast.current?.show({ severity: 'success', summary: 'Magia', detail: 'Insumo creado y enlazado al proveedor.' });
          
          // 3. Recargar Catálogo
          const updatedCatalog = await reloadCatalog();
          
          // 4. Seleccionar el nuevo inmediatamente
          if (updatedCatalog) {
              const matched = updatedCatalog.find((c: any) => c.variant_id === defaultVariant.id);
              if (matched) setSelectedProduct(matched);
          }
          
          setShowProductModal(false);
          setNewProductForm({ name: '', category_id: null, brand: '', currency_id: newProductForm.currency_id, unit_cost: 0 });
      } catch (e: any) {
          toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo la creación rápida.' });
      }
      setCreatingProduct(false);
  };

  const addLine = () => {
    if (!selectedProduct) return;
    
    // Check if already in lines
    if (lines.some(l => l.variant_id === selectedProduct.variant_id && l.pack_id === selectedProduct.pack_id)) {
        toast.current?.show({ severity: 'warn', summary: 'Aviso', detail: 'Este producto ya está en la orden.' });
        return;
    }
    
    const qty_per_unit = selectedProduct.qty_per_unit || 1;
    const initial_qty = 1;
    const replacement_cost = selectedProduct.replacement_cost || 0;
    
    const newLine = {
        internal_id: Math.random().toString(),
        variant_id: selectedProduct.variant_id,
        sku: selectedProduct.variant_sku || 'N/A',
        product_name: selectedProduct.product_name,
        pack_id: selectedProduct.pack_id,
        pack_name: selectedProduct.pack_name || 'Unidad Base',
        qty_per_pack: qty_per_unit,
        qty_ordered: initial_qty,
        unit_cost: replacement_cost,
        expected_base_qty: qty_per_unit * initial_qty,
        subtotal: replacement_cost * qty_per_unit * initial_qty
    };
    
    setLines([...lines, newLine]);
    setSelectedProduct(null);
  };

  const removeLine = (rowIndex: number) => {
      setLines(prev => {
          const updated = [...prev];
          updated.splice(rowIndex, 1);
          return updated;
      });
  };

  const handleQtyChange = (rowIndex: number, newQty: number) => {
      setLines(prev => {
          const updatedLines = [...prev];
          if(!updatedLines[rowIndex]) return updatedLines;
          const row = { ...updatedLines[rowIndex] };
          
          const qty = isNaN(newQty) || newQty < 0 ? 0 : newQty;
          
          row.qty_ordered = qty;
          row.expected_base_qty = qty * row.qty_per_pack;
          row.subtotal = row.expected_base_qty * row.unit_cost;
          
          updatedLines[rowIndex] = row;
          return updatedLines;
      });
  };
  
  const handleCostChange = (rowIndex: number, newCost: number) => {
      setLines(prev => {
          const updatedLines = [...prev];
          if(!updatedLines[rowIndex]) return updatedLines;
          const row = { ...updatedLines[rowIndex] };
          
          const cost = isNaN(newCost) || newCost < 0 ? 0 : newCost;
          
          row.unit_cost = cost;
          row.subtotal = row.expected_base_qty * row.unit_cost;
          
          updatedLines[rowIndex] = row;
          return updatedLines;
      });
  };

  const calculateTotal = () => {
      return lines.reduce((acc, row) => acc + parseFloat(row.subtotal || 0), 0);
  };

  const createDraft = async () => {
      if (!selectedSupplierId) {
          toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Debe seleccionar un proveedor.' });
          return;
      }
      if (lines.length === 0) {
          toast.current?.show({ severity: 'error', summary: 'Error', detail: 'La orden debe tener al menos un renglón.' });
          return;
      }
      
      setSaving(true);
      try {
          const payload = {
              supplier_id: selectedSupplierId,
              dest_facility_id: selectedFacilityId,
              lines: lines.map(l => ({
                  variant_id: l.variant_id,
                  pack_id: l.pack_id,
                  qty_ordered: l.qty_ordered,
                  expected_base_qty: l.expected_base_qty,
                  unit_cost: l.unit_cost
              }))
          };
          const res = await axios.post('http://localhost:8000/api/v1/purchase-orders/', payload);
          toast.current?.show({ severity: 'success', summary: 'Draft Creado', detail: 'Se ha creado la Orden.', life: 3000 });
          
          setTimeout(() => {
              router.push('/orders/' + res.data.id);
          }, 1500);
      } catch(e) {
          toast.current?.show({ severity: 'error', summary: 'Fallo', detail: 'No se pudo crear el borrador.' });
          setSaving(false);
      }
  };

  return (
    <div className="p-4 sm:p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />
      
      {/* HEADER EJECUTIVO */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500"></div>
          <div>
              <div className="flex items-center gap-3 mb-1">
                 <Button icon="pi pi-arrow-left" rounded text aria-label="Volver" onClick={() => router.push('/orders')} />
                 <h1 className="text-3xl font-black text-slate-800 tracking-tight">Crear Orden Manual</h1>
              </div>
              <p className="text-slate-500 ml-12 text-sm mt-2">
                 Construya una Orden de Compra física (DRAFT) sin pasar por el simulador MRP.
              </p>
          </div>
          
          <div className="flex flex-col items-end bg-slate-50 p-4 rounded-xl border border-slate-100 min-w-[200px]">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Estimado</span>
              <span className="text-4xl font-black text-indigo-600 block leading-none">
                 <span className="text-xl text-indigo-400 mr-1">$</span>
                 {calculateTotal().toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </span>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-2">
             <label className="text-sm font-bold text-slate-700 uppercase tracking-wide">1. Proveedor Origen</label>
             <Dropdown 
                value={selectedSupplierId} 
                onChange={(e) => setSelectedSupplierId(e.value)} 
                options={suppliers} 
                optionLabel="name" 
                optionValue="id" 
                placeholder="Seleccione un Proveedor" 
                filter
                className="w-full border-2 border-slate-200 rounded-xl" 
             />
          </div>
          
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-2">
             <label className="text-sm font-bold text-slate-700 uppercase tracking-wide">2. Destino Logístico (Opcional)</label>
             <Dropdown 
                value={selectedFacilityId} 
                onChange={(e) => setSelectedFacilityId(e.value)} 
                options={facilities} 
                optionLabel="name" 
                optionValue="id" 
                placeholder="Centro de Despacho" 
                filter
                showClear
                className="w-full border-2 border-slate-200 rounded-xl" 
             />
          </div>
      </div>

      {/* Selector de Catálogo */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col items-start gap-4">
          <SelectButton value={searchMode} onChange={(e) => { if(e.value) setSearchMode(e.value) }} options={searchModeOptions} optionLabel="label" />
          
          <div className="w-full flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1 w-full flex items-center gap-2">
              <Dropdown 
                  value={selectedProduct} 
                  onChange={(e) => setSelectedProduct(e.value)} 
                  options={searchMode === 'CATALOG' ? catalog : globalVariants} 
                  optionLabel="display_name"
                  placeholder={
                      searchMode === 'CATALOG' 
                      ? (selectedSupplierId ? "Buscar en catálogo privado..." : "Seleccione primero un proveedor") 
                      : "Buscar en todo el Maestro de Inventario..."
                  }
                  filter
                  disabled={searchMode === 'CATALOG' && (!selectedSupplierId || catalog.length === 0)}
                  className="w-full border-2 rounded-xl"
                  emptyMessage="No hay productos disponibles."
                  emptyFilterMessage="No se encontraron productos."
              />
            {selectedSupplierId && (
                <Button 
                    icon="pi pi-bolt" 
                    tooltip="Alta Rápida de Insumo Cero-Fricción"
                    tooltipOptions={{ position: 'top' }}
                    className="p-button-rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none shrink-0 w-12 h-12" 
                    onClick={() => setShowProductModal(true)} 
                />
            )}
            </div>
            <Button label="Añadir a Orden" icon="pi pi-plus" onClick={addLine} disabled={!selectedProduct} className="font-bold shrink-0 bg-indigo-600 hover:bg-indigo-700 border-none rounded-xl" />
          </div>
      </div>

      <Dialog header={<div className="flex items-center gap-2 text-xl font-black text-slate-800"><i className="pi pi-bolt text-emerald-500"></i> Creador Fast-Track</div>} visible={showProductModal} style={{ width: '35vw' }} onHide={() => setShowProductModal(false)} className="rounded-2xl overflow-hidden">
         <div className="p-2 flex flex-col gap-4 mt-2">
            <p className="text-slate-500 text-sm mb-2">Crearás un producto real en el Maestro y se anclará automáticamente a este Proveedor.</p>
            
            <div className="flex flex-col gap-1">
                <label className="text-sm font-bold text-slate-700">Nombre del Insumo *</label>
                <InputText value={newProductForm.name} onChange={(e) => setNewProductForm({...newProductForm, name: e.target.value})} placeholder="Ej. Harina de Trigo 50kg" className="w-full p-3 border-2 rounded-xl" />
            </div>
            
            <div className="flex flex-col gap-1">
                <label className="text-sm font-bold text-slate-700">Categoría *</label>
                <Dropdown value={newProductForm.category_id} onChange={(e) => setNewProductForm({...newProductForm, category_id: e.value})} options={categories} optionLabel="name" optionValue="id" placeholder="Seleccione Categoría Maestra" filter className="w-full border-2 rounded-xl" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                    <label className="text-sm font-bold text-slate-700">Marca / Fabricante</label>
                    <InputText value={newProductForm.brand} onChange={(e) => setNewProductForm({...newProductForm, brand: e.target.value})} placeholder="Opcional" className="w-full p-3 border-2 rounded-xl" />
                </div>
                
                <div className="flex flex-col gap-1">
                    <label className="text-sm font-bold text-slate-700">Costo Base Negociado *</label>
                    <div className="p-inputgroup border-2 rounded-xl overflow-hidden">
                        <span className="p-inputgroup-addon bg-slate-50 border-none text-slate-500 font-bold">$</span>
                        <input type="number" step="0.01" value={newProductForm.unit_cost} onChange={(e) => setNewProductForm({...newProductForm, unit_cost: parseFloat(e.target.value)})} placeholder="0.00" className="w-full p-3 border-none outline-none" />
                    </div>
                </div>
            </div>
            
            <div className="mt-4 flex justify-end gap-3">
                <Button label="Cancelar" icon="pi pi-times" onClick={() => setShowProductModal(false)} className="p-button-text text-slate-500 font-bold" />
                <Button label="Crear y Cargar a ODC" icon="pi pi-check" loading={creatingProduct} onClick={handleCreateFastProduct} className="bg-emerald-600 hover:bg-emerald-700 border-none text-white font-bold rounded-xl px-6 shadow-lg shadow-emerald-500/30 text-sm" />
            </div>
         </div>
      </Dialog>

      {/* MATRIZ DE EDICIÓN */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden mb-6">
        <DataTable dataKey="internal_id" value={lines} emptyMessage="No has añadido productos a esta orden." size="small" stripedRows rowHover className="text-sm">
          <Column header="SKU" field="sku" body={r => <span className="font-mono text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500">{r.sku}</span>} />
          
          <Column header="Nomenclatura" field="product_name" body={r => <span className="font-bold text-slate-800">{r.product_name}</span>} />
          
          <Column header="Unidad Comercial" body={r => (
             <span className="text-xs font-bold text-slate-500 bg-slate-50 px-2 py-1.5 rounded border border-slate-200 uppercase tracking-wide">
                <i className="pi pi-box mr-1 text-slate-400 text-[10px]"></i>
                {r.pack_name} (x{r.qty_per_pack})
             </span>
          )} align="center" />
          
          <Column header="Cant. a Comprar" body={(r, options) => (
             <div className="flex justify-center">
                 <input 
                    type="number" 
                    value={r.qty_ordered} 
                    onChange={(e) => handleQtyChange(options.rowIndex, parseFloat(e.target.value))}
                    className="w-24 text-center text-lg font-black p-2 rounded-lg border-2 border-indigo-200 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 bg-indigo-50 transition-all text-indigo-700 shadow-inner" 
                 />
             </div>
          )} align="center" />
          
          <Column header="Costo Negociado" body={(r, options) => (
             <div className="flex justify-end items-center gap-1">
                 <span className="font-bold text-slate-400">$</span>
                 <input 
                    type="number" 
                    value={r.unit_cost} 
                    step="0.01"
                    onChange={(e) => handleCostChange(options.rowIndex, parseFloat(e.target.value))}
                    className="w-28 text-right font-bold p-2 rounded-lg border-2 border-slate-200 outline-none focus:border-emerald-500 bg-slate-50 text-slate-700" 
                 />
             </div>
          )} align="right" />
          
          <Column header="Subtotal" body={r => <span className="font-black text-emerald-700 text-base">${parseFloat(r.subtotal).toLocaleString('en-US', {minimumFractionDigits: 2})}</span>} align="right" />
          
          <Column body={(r, options) => (
             <Button type="button" icon="pi pi-trash" rounded text severity="danger" onClick={() => removeLine(options.rowIndex)} aria-label="Eliminar" />
          )} align="center" />
        </DataTable>
      </div>

      {/* CONSOLA DE ACCIONES */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
         <span className="text-slate-400 text-sm"><i className="pi pi-info-circle mr-2"></i>La orden creada iniciará como Borrador (Draft)</span>
         <Button label="Crear Borrador" icon="pi pi-arrow-right" iconPos="right" onClick={createDraft} disabled={saving || lines.length === 0} className="font-bold px-8 shadow-lg hover:shadow-xl transition-all shadow-indigo-500/30 text-lg bg-indigo-600 border-none text-white" />
      </div>

    </div>
  );
}
