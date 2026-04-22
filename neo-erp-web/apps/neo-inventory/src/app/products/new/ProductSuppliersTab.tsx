import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import axios from 'axios';

const ProductSuppliersTab = forwardRef(({ productId }: { productId: number }, ref) => {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [packagings, setPackagings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<number | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);
  const [selectedPack, setSelectedPack] = useState<number | null>(null);
  const [replacementCost, setReplacementCost] = useState(0);
  const [minOrderQty, setMinOrderQty] = useState(1);

  useImperativeHandle(ref, () => ({
      getSuppliers: () => suppliers
  }));

  const fetchProductData = async () => {
      setLoading(true);
      try {
          const [pRes, sRes] = await Promise.all([
             axios.get(`http://localhost:8000/api/v1/products/${productId}`),
             axios.get('http://localhost:8000/api/v1/suppliers/')
          ]);
          const pData = pRes.data;
          setAllSuppliers(sRes.data);
          
          const v = pData.variants || [];
          setVariants(v);
          setPackagings(pData.packagings || []);
          
          if (v.length > 0) {
              setSelectedVariant(v[0].id);
              // Fetch suppliers for ALL variants concurrently
              const reqs = v.map((variant: any) => axios.get(`http://localhost:8000/api/v1/products/variants/${variant.id}/suppliers`).then(r => r.data).catch(() => []));
              const resps = await Promise.all(reqs);
              const allSupps = resps.flat();
              setSuppliers(allSupps);
          }
      } catch (e) {
          console.error(e);
      }
      setLoading(false);
  };

  useEffect(() => {
    if (productId) {
       fetchProductData();
    }
  }, [productId]);

  const onAdd = () => {
      if (!selectedSupplier || !selectedVariant) return alert("Seleccione proveedor y variante");
      if (suppliers.some(s => s.supplier_id === selectedSupplier && s.variant_id === selectedVariant)) {
          return alert("Este proveedor ya está vinculado a esta variante. No se admiten duplicados.");
      }

      const pack = packagings.find(p => p.id === selectedPack);
      const newEntry = {
          id: Date.now(), // Ghost ID
          supplier_id: selectedSupplier,
          variant_id: selectedVariant,
          currency_id: 1, // USD default
          replacement_cost: replacementCost,
          min_order_qty: minOrderQty,
          pack_id: selectedPack || null,
          pack_name: pack ? pack.name : null,
          is_primary: false
      };

      setSuppliers([...suppliers, newEntry]);
      setShowAdd(false);
  };

  const onDelete = (ghostId: number, variantId: number, supplierId: number) => {
      if (!confirm("¿Desvincular este proveedor en el borrador actual?")) return;
      setSuppliers(suppliers.filter(s => !(s.supplier_id === supplierId && s.variant_id === variantId)));
  };

  return (
    <div className="pt-4 animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <div className="flex flex-col">
          <h3 className="text-lg font-bold text-slate-800">Catálogo Transaccional de Suministro</h3>
          <p className="text-slate-500 text-sm">Borrador en memoria: Los vínculos se grabarán con el botón principal "Guardar" arriba.</p>
        </div>
        <Button type="button" label="Añadir Proveedor" icon="pi pi-plus" onClick={() => setShowAdd(true)} className="!bg-teal-50 hover:!bg-teal-100 !text-teal-700 !border-teal-200 !rounded-xl !px-4 shrink-0 font-bold shadow-sm" />
      </div>
      
      <DataTable value={suppliers} loading={loading} className="border border-slate-200 rounded-xl overflow-hidden text-sm" emptyMessage="Ningún proveedor ofrece este insumo actualmente en borrador.">
        <Column header="VARIANTE (SKU)" body={(r) => {
            const v = variants.find(x => x.id === r.variant_id);
            return <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">{v ? v.sku : `Var ${r.variant_id}`}</span>;
        }} />
        <Column header="PROVEEDOR" body={(r) => {
            const s = allSuppliers.find(x => x.id === r.supplier_id);
            return <span className="font-bold text-slate-800">{s ? s.name : `Proveedor ID ${r.supplier_id}`}</span>;
        }} />
        <Column header="COSTO PACTADO" body={(rowData, options) => (
            <InputNumber 
               value={rowData.replacement_cost} 
               onValueChange={(e) => {
                   const arr = [...suppliers];
                   arr[options.rowIndex].replacement_cost = e.value || 0;
                   setSuppliers(arr);
               }} 
               mode="currency" currency="USD" 
               inputClassName="w-24 text-xs font-bold text-rose-700 bg-rose-50 border-rose-200 py-1 px-2 rounded-md" 
            />
        )} />
        <Column header="M.O.Q" body={(rowData, options) => (
            <InputNumber 
               value={rowData.min_order_qty} 
               onValueChange={(e) => {
                   const arr = [...suppliers];
                   arr[options.rowIndex].min_order_qty = e.value || 1;
                   setSuppliers(arr);
               }} 
               inputClassName="w-16 text-xs text-slate-700 font-extrabold border-slate-200 py-1 px-2 rounded-md" 
            />
        )} />
        <Column header="VIGENCIA DE TARIFA" body={(r) => {
            const dateStr = r.updated_at || r.created_at;
            if (!dateStr) return <span className="text-slate-400 italic text-[10px]">Aún no guardado</span>;
            const d = new Date(dateStr);
            return <div className="flex flex-col"><span className="text-slate-700 font-bold text-xs uppercase">{d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric'})}</span><span className="text-slate-400 text-[10px]">{d.toLocaleTimeString('es-ES', { hour: '2-digit', minute:'2-digit' })}</span></div>;
        }} />
        <Column header="VOLUMEN LOGÍSTICO" body={(r, options) => (
            <Dropdown 
               value={r.pack_id} 
               onChange={(e) => {
                   const pack = packagings.find(p => p.id === e.value);
                   const arr = [...suppliers];
                   arr[options.rowIndex] = { ...arr[options.rowIndex], pack_id: e.value || null, pack_name: pack ? pack.name : null };
                   setSuppliers(arr);
               }} 
               options={packagings} 
               optionLabel="name" 
               optionValue="id" 
               showClear
               placeholder="Unidad Min" 
               className="w-full text-xs font-bold !rounded-lg border-slate-200" 
            />
        )} />
        <Column header="PRINCIPAL" align="center" body={(r, options) => (
            <div className="flex justify-center">
              <span className="cursor-pointer transition-all hover:scale-125" onClick={() => {
                  const arr = suppliers.map((item, idx) => {
                      if (item.variant_id === r.variant_id) {
                          return { ...item, is_primary: idx === options.rowIndex };
                      }
                      return item;
                  });
                  setSuppliers(arr);
              }}>
                <i className={`pi ${r.is_primary ? 'pi-star-fill text-yellow-500' : 'pi-star text-slate-200'} text-xl`}></i>
              </span>
            </div>
        )} />
        <Column body={(r, opt) => (
            <div className="flex justify-end gap-1">
               <Button type="button" icon="pi pi-trash" rounded text severity="danger" onClick={() => onDelete(r.id, r.variant_id, r.supplier_id)} className="w-10 h-10 hover:bg-rose-50" />
            </div>
        )} style={{ width: '4rem' }} />
      </DataTable>

      <Dialog header="Vincular Contrato de Proveedor (Borrador)" visible={showAdd} style={{ width: '38vw' }} className="!rounded-3xl" onHide={() => setShowAdd(false)}>
        <div className="flex flex-col gap-5 mt-4">
          <div className="flex flex-col gap-2">
            <label className="font-semibold text-[11px] text-slate-500 uppercase tracking-widest">Organización Proveedora *</label>
            <Dropdown value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.value)} options={allSuppliers} optionLabel="name" optionValue="id" placeholder="Cadenas, Distribuidores..." filter className="w-full !rounded-xl border-slate-200" />
          </div>
          
          <div className="flex gap-4">
             <div className="flex flex-col gap-2 flex-1">
               <label className="font-semibold text-[11px] text-slate-500 uppercase tracking-widest">Variante (SKU Interno)</label>
               <Dropdown value={selectedVariant} onChange={(e) => setSelectedVariant(e.value)} options={variants} optionLabel="sku" optionValue="id" className="w-full !rounded-xl border-slate-200" disabled={variants.length <= 1} />
               <small className="text-slate-400 text-xs leading-tight">Mapeo al identificador atómico del inventario.</small>
             </div>
             <div className="flex flex-col gap-2 flex-1">
               <label className="font-semibold text-[11px] text-slate-500 uppercase tracking-widest">Empaque Logístico</label>
               <Dropdown value={selectedPack} onChange={(e) => setSelectedPack(e.value)} options={packagings} optionLabel="name" optionValue="id" placeholder="Por Defecto (Unidad)" showClear className="w-full !rounded-xl border-slate-200" />
               <small className="text-slate-400 text-xs leading-tight">¿Vende en Bultos o Cajas?</small>
             </div>
          </div>

          <div className="flex gap-4">
            <div className="flex flex-col gap-2 flex-1">
              <label className="font-semibold text-[11px] text-slate-500 uppercase tracking-widest">Costo Base de Reposición</label>
              <InputNumber value={replacementCost} onValueChange={(e) => setReplacementCost(e.value || 0)} mode="currency" currency="USD" inputClassName="!rounded-xl border-slate-200 text-rose-700 font-bold w-full" className="w-full" />
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <label className="font-semibold text-[11px] text-slate-500 uppercase tracking-widest">MOQ (Cant. Mínima)</label>
              <InputNumber value={minOrderQty} onValueChange={(e) => setMinOrderQty(e.value || 1)} inputClassName="!rounded-xl border-slate-200 font-bold w-full" className="w-full" />
            </div>
          </div>
          
          <Button type="button" label="Agrupar en Borrador" icon="pi pi-plus" onClick={onAdd} className="mt-4 !bg-gradient-to-r !from-emerald-500 !to-teal-500 hover:!from-emerald-600 hover:!to-teal-600 !text-white !border-none !rounded-xl py-3 shadow-lg shadow-emerald-500/30 tracking-wide font-extrabold text-sm" />
        </div>
      </Dialog>
    </div>
  );
});

ProductSuppliersTab.displayName = 'ProductSuppliersTab';
export default ProductSuppliersTab;
