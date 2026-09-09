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
import api from '@/lib/api';

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
  const [selectedPackId, setSelectedPackId] = useState<number | null>(null);

  const mapPackagings = (packagings: any[]) => [
      { id: null, name: 'Und. Base', qty_per_unit: 1, label: 'Unidad Base (x1)' },
      ...(packagings || []).map((pk: any) => ({
          id: pk.id,
          name: pk.name,
          qty_per_unit: Number(pk.qty_per_unit),
          label: `${pk.name} (x${pk.qty_per_unit})`
      }))
  ];
  
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
    api.get('/suppliers/?limit=5000')
      .then(res => setSuppliers((res.data.data || res.data.items || res.data || []).filter((s: any) => s.is_active)))
      .catch(err => console.error(err));
      
    api.get('/products/?limit=50')
      .then(res => {
          const variants: any[] = [];
          const productsList = res.data.data || res.data.items || (Array.isArray(res.data) ? res.data : []);
          productsList.forEach((p: any) => {
              if (p.variants) {
                  const pPacks = mapPackagings(p.packagings);
                  p.variants.forEach((v: any) => {
                      variants.push({
                          variant_id: v.id,
                          variant_sku: v.sku,
                          product_name: p.name,
                          pack_id: null,
                          pack_name: 'Und. Base',
                          qty_per_unit: 1,
                          replacement_cost: v.replacement_cost || p.replacement_cost || 0,
                          display_name: `[GLOBAL] ${v.sku || ''} - ${p.name} - $${v.replacement_cost || p.replacement_cost || 0}`,
                          available_packagings: pPacks
                      });
                  });
              }
          });
          setGlobalVariants(variants);
      })
      .catch(err => console.error(err));
      
    api.get('/facilities/?limit=1000')
      .then(res => setFacilities(res.data.data || res.data.items || (Array.isArray(res.data) ? res.data : [])))
      .catch(err => console.error(err));
      
    api.get('/categories/?limit=1000')
      .then(res => setCategories(res.data.data || res.data.items || (Array.isArray(res.data) ? res.data : [])))
      .catch(err => console.error(err));
      
    api.get('/currencies/')
      .then(res => {
          const list = res.data.data || res.data.items || (Array.isArray(res.data) ? res.data : []);
          setCurrencies(list);
          let usd = list.find((c: any) => c.code === 'USD');
          if (usd) {
              setNewProductForm(prev => ({ ...prev, currency_id: usd.id }));
          }
      })
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (selectedSupplierId) {
      api.get(`/suppliers/${selectedSupplierId}/catalog`)
        .then(res => {
            const mappedCatalog = res.data.map((opt: any) => ({
                ...opt,
                display_name: `${opt.variant_sku || ''} - ${opt.product_name} - $${opt.replacement_cost}`,
                available_packagings: mapPackagings(opt.packagings)
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
           const res = await api.get(`/suppliers/${selectedSupplierId}/catalog`);
           const mappedCatalog = res.data.map((opt: any) => ({
                ...opt,
                display_name: `${opt.variant_sku || ''} - ${opt.product_name} - $${opt.replacement_cost}`,
                available_packagings: mapPackagings(opt.packagings)
           }));
           setCatalog(mappedCatalog);
           return mappedCatalog;
       } catch (e) {
           console.error(e);
       }
   };
  const filterTimeoutRef = useRef<any>(null);
  const handleDropdownFilter = (e: any) => {
      const filterText = e.filter || '';
      if (searchMode === 'GLOBAL') {
          if (filterTimeoutRef.current) clearTimeout(filterTimeoutRef.current);
          filterTimeoutRef.current = setTimeout(() => {
              const query = filterText.trim();
              const url = query.length >= 2 ? `/products/?q=${encodeURIComponent(query)}&limit=50` : '/products/?limit=50';
              api.get(url)
                  .then(res => {
                      const variants: any[] = [];
                      const productsList = res.data.data || res.data.items || (Array.isArray(res.data) ? res.data : []);
                      productsList.forEach((p: any) => {
                          if (p.variants) {
                              const pPacks = mapPackagings(p.packagings);
                              p.variants.forEach((v: any) => {
                                  variants.push({
                                      variant_id: v.id,
                                      variant_sku: v.sku,
                                      product_name: p.name,
                                      pack_id: null,
                                      pack_name: 'Und. Base',
                                      qty_per_unit: 1,
                                      replacement_cost: v.replacement_cost || p.replacement_cost || 0,
                                      display_name: `[GLOBAL] ${v.sku || ''} - ${p.name} - $${v.replacement_cost || p.replacement_cost || 0}`,
                                      available_packagings: pPacks
                                  });
                              });
                          }
                      });
                      setGlobalVariants(variants);
                  })
                  .catch(err => console.error(err));
          }, 300);
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
          const prodRes = await api.post('/products/', productPayload);
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
          await api.post(`/suppliers/${selectedSupplierId}/catalog`, suppPayload);

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
    
    const chosenPack = (selectedProduct.available_packagings || []).find((p: any) => p.id === selectedPackId) 
        || { id: null, name: 'Und. Base', qty_per_unit: 1, label: 'Unidad Base (x1)' };
        
    // Check if already in lines with this packaging
    if (lines.some(l => l.variant_id === selectedProduct.variant_id && l.pack_id === chosenPack.id)) {
        toast.current?.show({ severity: 'warn', summary: 'Aviso', detail: 'Este insumo con esta presentación ya está en la orden.' });
        return;
    }
    
    const qty_per_unit = Number(chosenPack.qty_per_unit) || 1;
    const initial_qty = 1;
    const replacement_cost = parseFloat(selectedProduct.replacement_cost) || 0;
    const initial_pack_cost = Number((replacement_cost * qty_per_unit).toFixed(4));
    
    const newLine = {
        internal_id: Math.random().toString(),
        variant_id: selectedProduct.variant_id,
        sku: selectedProduct.variant_sku || 'N/A',
        product_name: selectedProduct.product_name,
        pack_id: chosenPack.id,
        pack_name: chosenPack.name || 'Und. Base',
        qty_per_pack: qty_per_unit,
        qty_ordered: initial_qty,
        unit_cost: replacement_cost,
        pack_cost: initial_pack_cost,
        expected_base_qty: qty_per_unit * initial_qty,
        subtotal: replacement_cost * qty_per_unit * initial_qty,
        available_packagings: selectedProduct.available_packagings || [chosenPack]
    };
    
    setLines([...lines, newLine]);
    setSelectedProduct(null);
    setSelectedPackId(null);
  };

  const handlePresentationChange = (rowIndex: number, newPackId: number | null) => {
      setLines(prev => {
          const updatedLines = [...prev];
          if(!updatedLines[rowIndex]) return updatedLines;
          const row = { ...updatedLines[rowIndex] };
          
          const pack = (row.available_packagings || []).find((p: any) => p.id === newPackId)
              || { id: null, name: 'Und. Base', qty_per_unit: 1 };
          const factor = Number(pack.qty_per_unit) || 1;
          
          row.pack_id = newPackId;
          row.pack_name = pack.name || 'Und. Base';
          row.qty_per_pack = factor;
          
          row.expected_base_qty = (row.qty_ordered || 1) * factor;
          row.pack_cost = Number(((row.unit_cost || 0) * factor).toFixed(4));
          row.subtotal = (row.expected_base_qty || 0) * (row.unit_cost || 0);
          
          updatedLines[rowIndex] = row;
          return updatedLines;
      });
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
          const factor = (row.qty_per_pack && row.qty_per_pack > 0) ? row.qty_per_pack : 1;
          
          row.qty_ordered = qty;
          row.expected_base_qty = qty * factor;
          row.subtotal = row.expected_base_qty * (row.unit_cost || 0);
          
          updatedLines[rowIndex] = row;
          return updatedLines;
      });
  };
  
  const handlePackCostChange = (rowIndex: number, newPackCost: number) => {
      setLines(prev => {
          const updatedLines = [...prev];
          if(!updatedLines[rowIndex]) return updatedLines;
          const row = { ...updatedLines[rowIndex] };
          
          const pCost = isNaN(newPackCost) || newPackCost < 0 ? 0 : newPackCost;
          const factor = (row.qty_per_pack && row.qty_per_pack > 0) ? row.qty_per_pack : 1;
          
          row.pack_cost = pCost;
          row.unit_cost = pCost / factor;
          row.subtotal = (row.expected_base_qty || (row.qty_ordered * factor)) * row.unit_cost;
          
          updatedLines[rowIndex] = row;
          return updatedLines;
      });
  };

  const handleUnitCostChange = (rowIndex: number, newUnitCost: number) => {
      setLines(prev => {
          const updatedLines = [...prev];
          if(!updatedLines[rowIndex]) return updatedLines;
          const row = { ...updatedLines[rowIndex] };
          
          const uCost = isNaN(newUnitCost) || newUnitCost < 0 ? 0 : newUnitCost;
          const factor = (row.qty_per_pack && row.qty_per_pack > 0) ? row.qty_per_pack : 1;
          
          row.unit_cost = uCost;
          row.pack_cost = uCost * factor;
          row.subtotal = (row.expected_base_qty || (row.qty_ordered * factor)) * uCost;
          
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
          const res = await api.post('/purchase-orders/', payload);
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
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500"></div>
          <div>
              <div className="flex items-center gap-3 mb-1">
                 <Button icon="pi pi-arrow-left" rounded text aria-label="Volver" onClick={() => router.push('/orders')} />
                 <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">Crear Orden Manual</h1>
              </div>
              <p className="text-slate-500 ml-12 text-xs sm:text-sm mt-1 sm:mt-2">
                 Construya una Orden de Compra física (DRAFT) sin pasar por el simulador MRP.
              </p>
          </div>
          
          <div className="flex flex-col items-start sm:items-end bg-slate-50 p-4 rounded-xl border border-slate-100 w-full lg:w-auto shrink-0 min-w-[200px]">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Estimado</span>
              <span className="text-3xl sm:text-4xl font-black text-indigo-600 block leading-none">
                 <span className="text-xl text-indigo-400 mr-1">$</span>
                 {calculateTotal().toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </span>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
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
                virtualScrollerOptions={{ itemSize: 38 }}
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
      <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col items-start gap-4">
          <div className="w-full overflow-x-auto pb-1">
             <SelectButton value={searchMode} onChange={(e) => { if(e.value) setSearchMode(e.value) }} options={searchModeOptions} optionLabel="label" />
          </div>
          
          <div className="w-full flex flex-col xl:flex-row items-stretch xl:items-center gap-3">
            <div className="flex-1 w-full flex items-center gap-2 min-w-0">
              <Dropdown 
                  value={selectedProduct} 
                  onChange={(e) => {
                      setSelectedProduct(e.value);
                      setSelectedPackId(null);
                  }} 
                  options={searchMode === 'CATALOG' ? catalog : globalVariants} 
                  optionLabel="display_name"
                  placeholder={
                      searchMode === 'CATALOG' 
                      ? (selectedSupplierId ? "Buscar en catálogo privado..." : "Seleccione primero un proveedor") 
                      : "Buscar en todo el Maestro de Inventario..."
                  }
                  filter
                  onFilter={handleDropdownFilter}
                  virtualScrollerOptions={{ itemSize: 38 }}
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
                    className="p-button-rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none shrink-0 w-11 h-11" 
                    onClick={() => setShowProductModal(true)} 
                />
            )}
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full xl:w-auto shrink-0 justify-end">
            {selectedProduct && selectedProduct.available_packagings && selectedProduct.available_packagings.length > 1 && (
               <div className="flex items-center gap-2 bg-indigo-50/70 px-3 py-2 rounded-xl border border-indigo-200 w-full sm:w-auto justify-between sm:justify-start">
                  <span className="text-xs font-bold text-indigo-700 uppercase whitespace-nowrap">Presentación:</span>
                  <Dropdown
                     value={selectedPackId}
                     onChange={(e) => setSelectedPackId(e.value)}
                     options={selectedProduct.available_packagings}
                     optionLabel="label"
                     optionValue="id"
                     placeholder="Presentación"
                     className="w-full sm:w-48 p-inputtext-sm text-xs font-bold border-indigo-300 bg-white text-indigo-900 rounded-lg shadow-sm"
                  />
               </div>
            )}

            <Button label="Añadir a Orden" icon="pi pi-plus" onClick={addLine} disabled={!selectedProduct} className="w-full sm:w-auto font-bold bg-indigo-600 hover:bg-indigo-700 border-none rounded-xl px-5 py-3 text-sm justify-center whitespace-nowrap shadow-md shadow-indigo-500/20" />
            </div>
          </div>
      </div>

      <Dialog 
         header={<div className="flex items-center gap-2 text-xl font-black text-slate-800"><i className="pi pi-bolt text-emerald-500"></i> Creador Fast-Track</div>} 
         visible={showProductModal} 
         style={{ width: '40vw', minWidth: '320px' }} 
         breakpoints={{ '1200px': '55vw', '960px': '75vw', '640px': '95vw' }}
         onHide={() => setShowProductModal(false)} 
         className="rounded-2xl overflow-hidden"
      >
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
        <div className="overflow-x-auto w-full">
          <DataTable 
            dataKey="internal_id" 
            value={lines} 
            emptyMessage="No has añadido productos a esta orden." 
            size="small" 
            stripedRows 
            rowHover 
            responsiveLayout="scroll"
            className="text-sm min-w-[780px]"
          >
          <Column header="SKU" field="sku" style={{ width: '90px', minWidth: '80px' }} body={r => <span className="font-mono text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500">{r.sku}</span>} />
          
          <Column header="Nomenclatura" field="product_name" style={{ minWidth: '160px' }} body={r => <span className="font-bold text-slate-800">{r.product_name}</span>} />
          
          <Column header="Presentación" style={{ minWidth: '160px' }} body={(r, options) => (
             <div className="flex items-center justify-center">
                {r.available_packagings && r.available_packagings.length > 1 ? (
                    <Dropdown
                       value={r.pack_id ?? null}
                       options={r.available_packagings}
                       optionLabel="label"
                       optionValue="id"
                       onChange={(e) => handlePresentationChange(options.rowIndex, e.value)}
                       className="p-inputtext-sm text-xs font-bold border-indigo-200 bg-indigo-50/50 text-indigo-800 rounded-lg shadow-sm"
                    />
                ) : (
                    <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                       <i className="pi pi-box text-slate-400 text-xs"></i>
                       {r.pack_name || 'Und. Base'} (x{r.qty_per_pack || 1})
                    </span>
                )}
             </div>
          )} align="center" />
          
          <Column header="Cant. a Comprar" style={{ minWidth: '120px' }} body={(r, options) => {
             const isPack = r.qty_per_pack > 1;
             return (
                 <div className="flex flex-col items-center gap-1">
                     <input 
                        type="number" 
                        value={r.qty_ordered} 
                        min="1"
                        onChange={(e) => handleQtyChange(options.rowIndex, parseFloat(e.target.value))}
                        className="w-20 text-center text-base font-black p-1.5 rounded-lg border-2 border-indigo-200 outline-none focus:border-indigo-500 bg-indigo-50/70 text-indigo-700 shadow-inner" 
                     />
                     {isPack ? (
                         <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                            = {r.expected_base_qty} Unds Base
                         </span>
                     ) : (
                         <span className="text-[10px] font-semibold text-slate-400">
                            {r.qty_ordered} Unds
                         </span>
                     )}
                 </div>
             );
          }} align="center" />
          
          <Column header="Costo x Bulto" style={{ minWidth: '130px' }} body={(r, options) => {
             const isPack = r.qty_per_pack > 1;
             const packCostVal = r.pack_cost != null ? Number(r.pack_cost) : Number(((Number(r.unit_cost) || 0) * (r.qty_per_pack || 1)).toFixed(2));
             
             if (!isPack) {
                 return (
                     <div className="flex justify-end items-center gap-1 pr-2">
                         <span className="text-xs text-slate-400 font-semibold italic">N/A (Unidad)</span>
                     </div>
                 );
             }
             
             return (
                 <div className="flex justify-end items-center gap-1">
                     <span className="font-bold text-slate-400 text-xs">$</span>
                     <input 
                        type="number" 
                        value={packCostVal} 
                        step="0.01"
                        onChange={(e) => handlePackCostChange(options.rowIndex, parseFloat(e.target.value))}
                        className="w-24 text-right font-bold p-1.5 text-sm rounded-lg border-2 border-sky-200 outline-none focus:border-sky-500 bg-sky-50/50 text-sky-900 shadow-inner" 
                        placeholder="0.00"
                     />
                 </div>
             );
          }} align="right" />

          <Column header="Costo x Unidad" style={{ minWidth: '130px' }} body={(r, options) => (
             <div className="flex justify-end items-center gap-1">
                 <span className="font-bold text-slate-400 text-xs">$</span>
                 <input 
                    type="number" 
                    value={r.unit_cost != null ? Number(Number(r.unit_cost).toFixed(4)) : 0} 
                    step="0.0001"
                    onChange={(e) => handleUnitCostChange(options.rowIndex, parseFloat(e.target.value))}
                    className="w-24 text-right font-bold p-1.5 text-sm rounded-lg border-2 border-slate-200 outline-none focus:border-emerald-500 bg-slate-50 text-slate-700" 
                    placeholder="0.00"
                 />
             </div>
          )} align="right" />
          
          <Column header="Subtotal" style={{ minWidth: '110px' }} body={r => <span className="font-black text-emerald-700 text-base">${parseFloat(r.subtotal).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>} align="right" />
          
          <Column style={{ width: '60px', minWidth: '60px' }} body={(r, options) => (
             <Button type="button" icon="pi pi-trash" rounded text severity="danger" onClick={() => removeLine(options.rowIndex)} aria-label="Eliminar" />
          )} align="center" />
          </DataTable>
        </div>
      </div>

      {/* CONSOLA DE ACCIONES */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
         <span className="text-slate-400 text-sm"><i className="pi pi-info-circle mr-2"></i>La orden creada iniciará como Borrador (Draft)</span>
         <Button label="Crear Borrador" icon="pi pi-arrow-right" iconPos="right" onClick={createDraft} disabled={saving || lines.length === 0} className="w-full sm:w-auto font-bold px-8 shadow-lg hover:shadow-xl transition-all shadow-indigo-500/30 text-lg bg-indigo-600 border-none text-white justify-center" />
      </div>

    </div>
  );
}
