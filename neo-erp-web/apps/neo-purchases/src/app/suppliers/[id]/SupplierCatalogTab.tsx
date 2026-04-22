import React, { useState, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import axios from 'axios';

const SupplierCatalogTab = forwardRef(({ supplierId }: { supplierId: number }, ref) => {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [showAdd, setShowAdd] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedPack, setSelectedPack] = useState(null);
  const [replacementCost, setReplacementCost] = useState(0);
  const [minOrderQty, setMinOrderQty] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [packagings, setPackagings] = useState<any[]>([]);

  useImperativeHandle(ref, () => ({
      getCatalog: () => catalog
  }));

  const allVariants = useMemo(() => {
     return products.flatMap(p => (p.variants || []).map((v: any) => {
         let attrStr = "";
         if (p.has_variants && v.attributes) {
             const vals = Object.values(v.attributes).filter(Boolean);
             if (vals.length > 0) attrStr = ` (${vals.join(', ')})`;
         }
         return {
             ...v,
             displayName: p.name + attrStr,
             productName: p.name
         };
     }));
  }, [products]);

  useEffect(() => {
     if (selectedVariant && products.length > 0) {
         const parentProd = products.find(p => p.variants?.some((v: any) => v.id === selectedVariant));
         if (parentProd) {
             // Inyectar fetch en vivo para obtener los empaques reales del producto
             axios.get(`http://localhost:8000/api/v1/products/${parentProd.id}`).then(res => {
                 setPackagings(res.data.packagings || []);
             }).catch(() => setPackagings([]));
         } else {
             setPackagings([]);
         }
         setSelectedPack(null);
     }
  }, [selectedVariant, products]);

  const loadAllData = async () => {
      setLoading(true);
      try {
          const url = selectedCategory 
            ? `http://localhost:8000/api/v1/suppliers/${supplierId}/catalog?category_id=${selectedCategory}`
            : `http://localhost:8000/api/v1/suppliers/${supplierId}/catalog`;
            
          const [prodRes, catRes, catResponse] = await Promise.all([
            axios.get('http://localhost:8000/api/v1/products/?limit=500'),
            axios.get('http://localhost:8000/api/v1/categories/'),
            axios.get(url)
          ]);
          
          setProducts(prodRes.data);
          setCategories(catRes.data);
          setCatalog(catResponse.data);
      } catch (e) {
          console.error(e);
      }
      setLoading(false);
  };

  useEffect(() => {
    loadAllData();
  }, [supplierId, selectedCategory]);

  const onAdd = () => {
      if (!selectedVariant) return alert("Seleccione un insumo");
      if (catalog.some(c => c.variant_id === selectedVariant)) {
          return alert("Ese insumo ya ha sido seleccionado en el catálogo. No se admiten duplicados.");
      }

      const pack = packagings.find(p => p.id === selectedPack);
      const newEntry = {
          id: Date.now(), // Ghost ID para React
          supplier_id: supplierId,
          variant_id: selectedVariant,
          currency_id: 1, // USD default para MVP
          replacement_cost: replacementCost,
          min_order_qty: minOrderQty,
          pack_id: selectedPack || null,
          pack_name: pack ? pack.name : null,
          is_primary: false
      };

      setCatalog([...catalog, newEntry]);
      setShowAdd(false);
  };

  const onDelete = (variantId: number) => {
    if (!confirm("¿Quitar Insumo del borrador actual?")) return;
    setCatalog(catalog.filter(c => c.variant_id !== variantId));
  };

  return (
    <div className="pt-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-4 items-center w-2/3">
          <p className="text-slate-600 w-1/2">Catálogo en Memoria (Se guardará al aprobar todo el formulario).</p>
          <Dropdown 
            value={selectedCategory} 
            onChange={(e) => setSelectedCategory(e.value)} 
            options={categories} 
            optionLabel="name" 
            optionValue="id" 
            placeholder="Filtrar por Categoría (Jerárquico)" 
            showClear 
            className="w-1/2 border rounded-md" 
          />
        </div>
        <Button type="button" label="Vincular Insumo" icon="pi pi-plus" onClick={() => setShowAdd(true)} className="p-button-outlined p-button-sm p-button-success" />
      </div>

      <DataTable value={catalog} loading={loading} className="border border-slate-200 rounded-xl overflow-hidden text-sm" emptyMessage="Sin insumos vinculados en este borrador.">
        <Column header="Insumo Vinculado" body={(r) => {
            const v = allVariants.find(x => x.id === r.variant_id);
            if (v) return <span className="font-bold text-slate-800">{v.displayName}</span>;
            const fallback = products.find(p => p.id === r.variant_id);
            if (fallback) return <span className="font-bold text-slate-500 line-through">{fallback.name} (Inválido)</span>;
            return <span className="font-bold text-slate-400">ID {r.variant_id}</span>;
        }} />
        <Column header="Costo Reposición (Editable)" body={(rowData, options) => (
            <InputNumber 
               value={rowData.replacement_cost} 
               onValueChange={(e) => {
                   const newCat = [...catalog];
                   newCat[options.rowIndex].replacement_cost = e.value || 0;
                   setCatalog(newCat);
               }} 
               mode="currency" currency="USD" 
               inputClassName="w-24 text-xs font-bold text-rose-700 bg-rose-50 border-rose-200 py-1 px-2 rounded-md" 
            />
        )} />
        <Column header="MOQ (Editable)" body={(rowData, options) => (
            <InputNumber 
               value={rowData.min_order_qty} 
               onValueChange={(e) => {
                   const newCat = [...catalog];
                   newCat[options.rowIndex].min_order_qty = e.value || 1;
                   setCatalog(newCat);
               }} 
               inputClassName="w-16 text-xs text-slate-700 font-extrabold border-slate-200 py-1 px-2 rounded-md" 
            />
        )} />
        <Column header="Vigencia de Tarifa" body={(r) => {
            const dateStr = r.updated_at || r.created_at;
            if (!dateStr) return <span className="text-slate-400 italic text-[10px]">Aún no guardado</span>;
            const d = new Date(dateStr);
            return <div className="flex flex-col"><span className="text-slate-700 font-bold text-xs uppercase">{d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric'})}</span><span className="text-slate-400 text-[10px]">{d.toLocaleTimeString('es-ES', { hour: '2-digit', minute:'2-digit' })}</span></div>;
        }} />
        <Column header="Volumen Logístico" body={(r) => {
            if (!r.pack_id) return <span className="text-slate-500 italic font-medium">Unidad Min (Base)</span>;
            
            const parentProduct = products.find(p => p.variants && p.variants.some((v: any) => v.id === r.variant_id));
            const packObj = parentProduct?.packagings?.find((pk: any) => pk.id === r.pack_id);
            let pName = packObj ? packObj.name : (r.pack_name || `Empaque ID ${r.pack_id}`);
            
            return <span className="font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-md border border-blue-200 shadow-sm"><i className="pi pi-box mr-1 text-xs"></i> {pName}</span>;
        }} />
        <Column header="PRINCIPAL" align="center" body={(r, options) => (
            <div className="flex justify-center">
              <span className="cursor-pointer transition-all hover:scale-125" onClick={() => {
                  const arr = [...catalog];
                  arr.forEach(item => { if (item.variant_id === r.variant_id) item.is_primary = false; });
                  arr[options.rowIndex].is_primary = true;
                  setCatalog(arr);
              }}>
                <i className={`pi ${r.is_primary ? 'pi-star-fill text-yellow-500' : 'pi-star text-slate-200'} text-xl`}></i>
              </span>
            </div>
        )} />
        <Column body={(rowData) => (
          <Button type="button" icon="pi pi-trash" className="p-button-rounded p-button-danger p-button-text p-button-sm" onClick={() => onDelete(rowData.variant_id)} />
        )} />
      </DataTable>

      <Dialog header="Vincular Insumo al Catálogo" visible={showAdd} style={{ width: '38vw' }} className="!rounded-3xl" onHide={() => setShowAdd(false)}>
        <div className="flex flex-col gap-5 mt-4">
          <div className="flex gap-4">
            <div className="flex flex-col gap-2 flex-1">
              <label className="font-semibold text-[11px] text-slate-500 uppercase tracking-widest">Insumo del Inventario *</label>
              <Dropdown value={selectedVariant} onChange={(e) => setSelectedVariant(e.value)} options={allVariants} optionLabel="displayName" optionValue="id" placeholder="Buscar producto..." filter className="w-full !rounded-xl border-slate-200" />
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <label className="font-semibold text-[11px] text-slate-500 uppercase tracking-widest">Empaque de Compra (Op)</label>
              <Dropdown value={selectedPack} onChange={(e) => setSelectedPack(e.value)} options={packagings} optionLabel="name" optionValue="id" placeholder="Por Defecto (Unidad)" showClear disabled={!selectedVariant || packagings.length === 0} className="w-full !rounded-xl border-slate-200" />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex flex-col gap-2 flex-1">
              <label className="font-semibold text-[11px] text-slate-500 uppercase tracking-widest">Costo Base Reposición</label>
              <InputNumber value={replacementCost} onValueChange={(e) => setReplacementCost(e.value || 0)} mode="currency" currency="USD" className="w-full" inputClassName="w-full !rounded-xl border-slate-200 text-rose-700 font-bold" />
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <label className="font-semibold text-[11px] text-slate-500 uppercase tracking-widest">MOQ (Cant. Mínima)</label>
              <InputNumber value={minOrderQty} onValueChange={(e) => setMinOrderQty(e.value || 1)} className="w-full" inputClassName="w-full !rounded-xl border-slate-200 font-bold" />
            </div>
          </div>
          <Button type="button" label="Agrupar en Borrador" icon="pi pi-plus" onClick={onAdd} className="mt-4 !bg-gradient-to-r !from-emerald-500 !to-teal-500 hover:!from-emerald-600 hover:!to-teal-600 !text-white !border-none !rounded-xl py-3 shadow-lg shadow-emerald-500/30 tracking-wide font-extrabold text-sm" />
        </div>
      </Dialog>
    </div>
  );
});

SupplierCatalogTab.displayName = 'SupplierCatalogTab';
export default SupplierCatalogTab;
