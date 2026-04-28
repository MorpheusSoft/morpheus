'use client';
import { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { AutoComplete } from 'primereact/autocomplete';
import { InputNumber } from 'primereact/inputnumber';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Checkbox } from 'primereact/checkbox';
import { useRouter, useParams } from 'next/navigation';
import api from '@/lib/api';
import { PricingService } from '@/services/pricing.service';
import { ProductService } from '@/services/product.service';

export default function PricingValidationBoardPage() {
  const router = useRouter();
  const params = useParams();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [newCost, setNewCost] = useState<number | null>(null);
  const [newPrice, setNewPrice] = useState<number | null>(null);

  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardSuppliers, setWizardSuppliers] = useState<number[]>([]);
  const [wizardCategories, setWizardCategories] = useState<number[]>([]);
  const [wizardSearchTerm, setWizardSearchTerm] = useState<string>('');
  
  const [wizardSupplierOptions, setWizardSupplierOptions] = useState<any[]>([]);
  const [wizardCategoryOptions, setWizardCategoryOptions] = useState<any[]>([]);
  
  const [costRuleAction, setCostRuleAction] = useState('KEEP');
  const [costRuleValue, setCostRuleValue] = useState<number>(0);
  
  const [priceRuleAction, setPriceRuleAction] = useState('ADD_PERCENTAGE');
  const [priceRuleValue, setPriceRuleValue] = useState<number>(5.0);
  const [priceRuleBaseTarget, setPriceRuleBaseTarget] = useState('CURRENT_PRICE');
  const [priceRuleIncludeTax, setPriceRuleIncludeTax] = useState(false);

  const ruleOptions = [
    { label: 'Mantiene', value: 'KEEP' },
    { label: 'Suma (%)', value: 'ADD_PERCENTAGE' },
    { label: 'Suma Fija ($)', value: 'ADD_FIXED' },
    { label: 'Fijar Precio ($)', value: 'SET_FIXED' }
  ];

  const baseTargetOptions = [
    { label: 'Precio Actual', value: 'CURRENT_PRICE' },
    { label: 'Costo Actual', value: 'CURRENT_COST' },
    { label: 'Nuevo Costo', value: 'NEW_COST' }
  ];

  const fetchWizardData = async () => {
    try {
      const [sup, cat] = await Promise.all([
        api.get('/suppliers/?limit=1000'),
        ProductService.getCategories()
      ]);
      
      const supData = sup.data?.data || sup.data?.items || (Array.isArray(sup.data) ? sup.data : []);
      const catData = cat?.data || cat?.items || (Array.isArray(cat) ? cat : []);
      
      setWizardSupplierOptions(supData);
      setWizardCategoryOptions(catData);
    } catch(e) { console.error(e); }
  };

  useEffect(() => {
    if (showWizard && (wizardSupplierOptions.length === 0 && wizardCategoryOptions.length === 0)) {
       fetchWizardData();
    }
  }, [showWizard]);

  const searchProduct = async (event: any) => {
    try {
      const res = await ProductService.getProducts(0, 20, event.query);
      const variants = res?.data?.flatMap((p: any) => p.variants.map((v: any) => ({...v, product: p}))) || [];
      setSearchResults(variants);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddLine = async () => {
    if (!selectedProduct) return;
    try {
      setLoading(true);
      await PricingService.addSessionLine(params.id as string, {
        variant_id: selectedProduct.id,
        external_reference_name: selectedProduct.sku,
        proposed_cost: newCost || 0,
        proposed_price: newPrice || 0,
        action: 'UPDATE_COST'
      });
      setSelectedProduct(null);
      setNewCost(null);
      setNewPrice(null);
      fetchSession();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleWizardSubmit = async () => {
    try {
        setLoading(true);
        const payload = {
            filters: {
               supplier_ids: wizardSuppliers,
               category_ids: wizardCategories,
               search_term: wizardSearchTerm || null
            },
            cost_rule: { action: costRuleAction, value: costRuleValue, base_target: 'CURRENT_COST', include_tax: false },
            price_rule: { action: priceRuleAction, value: priceRuleValue, base_target: priceRuleBaseTarget, include_tax: priceRuleIncludeTax }
        };
        await PricingService.bulkFilterLines(params.id as string, payload);
        setShowWizard(false);
        setWizardStep(1);
        fetchSession();
    } catch(err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  const fetchSession = async () => {
    try {
      setLoading(true);
      const data = await PricingService.getSessionById(params.id as string);
      setSession(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, [params.id]);

  const onCellEditComplete = async (e: any) => {
    let { rowData, newValue, field } = e;
    if (newValue === rowData[field] || newValue === null) return;

    // Optimistic update
    const newLines = [...(session?.lines || [])];
    const index = newLines.findIndex(l => l.id === rowData.id);
    if (index !== -1) {
       newLines[index] = { ...newLines[index], [field]: newValue };
       setSession({ ...session, lines: newLines });
    }

    try {
       await PricingService.updateSessionLine(params.id as string, rowData.id, { [field]: newValue });
    } catch (err) {
       console.error("Error updating line", err);
       fetchSession(); // Revert on failure
    }
  };

  const priceEditor = (options: any) => {
    return <InputNumber value={options.value} onValueChange={(e) => options.editorCallback(e.value)} mode="currency" currency="USD" autoFocus inputClassName="p-1 w-24 text-sm" />;
  };

  const handleApply = async () => {
    try {
      setApplying(true);
      await PricingService.applySession(params.id as string);
      fetchSession();
    } catch (err) {
      console.error(err);
    } finally {
      setApplying(false);
    }
  };

  const handleUploadCsv = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setLoading(true);
      await PricingService.uploadCsv(params.id as string, file);
      fetchSession();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const statusTemplate = (rowData: any) => {
    const s = rowData.action;
    return <span className="font-mono text-xs px-2 py-1 bg-slate-100 rounded text-slate-500">{s}</span>;
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto py-6">
       <div className="flex justify-between items-center mb-6">
         <div>
            <div className="flex items-center gap-3">
               <Button icon="pi pi-arrow-left" rounded text severity="secondary" onClick={() => router.push('/pricing')} />
               <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{session?.name || 'Cargando...'}</h1>
            </div>
            <p className="text-slate-500 mt-1 ml-12">Origen: <span className="font-bold">{session?.source_type}</span> | Afectará: <span className="font-bold">{session?.target_cost_type}</span></p>
         </div>
         <div className="flex gap-3">
            {session?.status === 'DRAFT' && session?.source_type === 'CSV_UPLOAD' && (
              <div className="relative overflow-hidden inline-block">
                 <Button label="Importar CSV" icon="pi pi-upload" severity="secondary" className="border-slate-300" />
                 <input type="file" accept=".csv" onChange={handleUploadCsv} className="absolute left-0 top-0 opacity-0 cursor-pointer w-full h-full" />
              </div>
            )}
            {session?.status === 'DRAFT' && (
               <Button label="Aplicar Cambios Atómicamente" icon="pi pi-check-circle" loading={applying || loading} className="!bg-emerald-600 border-none rounded-full px-6 shadow-md" onClick={handleApply} />
            )}
         </div>
       </div>

       <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {session?.status === 'DRAFT' && session?.source_type === 'FILTER_BULK' && (
            <div className="bg-slate-50 border-b border-slate-200 p-4 flex flex-wrap items-end gap-4 relative z-10">
               <div className="flex-1 min-w-[250px]">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Línea Manual: Buscar Producto</label>
                  <AutoComplete 
                    field="sku" 
                    value={selectedProduct} 
                    suggestions={searchResults} 
                    completeMethod={searchProduct} 
                    onChange={(e) => setSelectedProduct(e.value)} 
                    itemTemplate={(item) => (<div><span className="font-bold text-slate-800">{item.sku}</span><div className="text-xs text-slate-500 mt-1">{item.product?.name || 'Variante'}</div></div>)} 
                    placeholder="Escribe el código o nombre..." 
                    className="w-full" 
                    inputClassName="w-full p-2 border-slate-300 rounded-md" 
                  />
               </div>
               <div className="w-32">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Nvo. Costo</label>
                  <InputNumber value={newCost} onValueChange={(e) => setNewCost(e.value ?? null)} mode="currency" currency="USD" locale="en-US" placeholder="0.00" inputClassName="p-2 border-slate-300 rounded-md w-full" />
               </div>
               <div className="w-32">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Nvo. Precio</label>
                  <InputNumber value={newPrice} onValueChange={(e) => setNewPrice(e.value ?? null)} mode="currency" currency="USD" locale="en-US" placeholder="0.00" inputClassName="p-2 border-slate-300 rounded-md w-full" />
               </div>
               <Button icon="pi pi-plus" label="Añadir a Mesa" className="h-[40px] px-6 !bg-teal-600 hover:!bg-teal-700 border-none font-bold" disabled={!selectedProduct} onClick={handleAddLine} />
            </div>
          )}
          {session?.status === 'DRAFT' && session?.source_type === 'FILTER_BULK' && (
            <div className="bg-slate-100 border-b border-slate-200 p-4 flex flex-col justify-center items-center py-8">
               <h3 className="text-lg font-bold text-slate-700 mb-2">Explora y Multiplica Rápidamente</h3>
               <p className="text-slate-500 text-sm mb-4">Usa el Motor de Cálculo para afectar a decenas de productos de golpe desde proveedores selectos.</p>
               <Button icon="pi pi-sparkles" label="Asistente de Carga Masiva" className="!bg-purple-600 hover:!bg-purple-700 border-none px-6 py-2 shadow-lg hover:scale-105 transition-transform" onClick={() => setShowWizard(true)} />
            </div>
          )}
          {session?.status === 'APPLIED' && (
             <div className="bg-emerald-50 text-emerald-800 p-4 border-b border-emerald-100 flex items-center gap-3 font-medium">
                <i className="pi pi-check-circle text-xl text-emerald-500"></i>
                Esta sesión ya ha sido aplicada a la base de datos y es de solo lectura.
             </div>
          )}
          <DataTable value={session?.lines || []} loading={loading} emptyMessage="No hay lineas cargadas en este borrador." scrollable scrollHeight="60vh" editMode="cell">
             <Column field="external_reference_name" header="REFERENCIA / PRODUCTO" className="font-bold"></Column>
             <Column field="old_cost" header="COSTO ACTUAL" body={(r) => <span className="text-slate-500">${Number(r.old_cost).toFixed(2)}</span>}></Column>
             <Column field="proposed_cost" header="NUEVO COSTO" body={(r) => <span className="text-blue-600 font-extrabold">${Number(r.proposed_cost).toFixed(2)}</span>} editor={session?.status === 'DRAFT' ? priceEditor : undefined} onCellEditComplete={onCellEditComplete} className={session?.status === 'DRAFT' ? 'cursor-pointer hover:bg-slate-50' : ''}></Column>
             <Column field="old_price" header="PVP ACTUAL" body={(r) => <span className="text-slate-500">${Number(r.old_price).toFixed(2)}</span>}></Column>
             <Column field="proposed_price" header="NUEVO PVP" body={(r) => <span className="text-emerald-600 font-extrabold">${Number(r.proposed_price).toFixed(2)}</span>} editor={session?.status === 'DRAFT' ? priceEditor : undefined} onCellEditComplete={onCellEditComplete} className={session?.status === 'DRAFT' ? 'cursor-pointer hover:bg-slate-50' : ''}></Column>
             <Column header="ACCIÓN" body={statusTemplate} align="center"></Column>
          </DataTable>
       </div>

      <Dialog visible={showWizard} style={{ width: '40vw', minWidth: '500px' }} header="✨ Asistente de Carga Masiva" onHide={() => { setShowWizard(false); setWizardStep(1); }} footer={
         <div className="flex justify-between w-full">
            <Button label="Cancelar" icon="pi pi-times" className="p-button-text" onClick={() => { setShowWizard(false); setWizardStep(1); }} />
            <div>
               {wizardStep > 1 && <Button label="Atrás" icon="pi pi-arrow-left" className="p-button-text mr-2" onClick={() => setWizardStep(wizardStep - 1)} />}
               {wizardStep < 2 ? (
                 <Button label="Siguiente" icon="pi pi-arrow-right" iconPos="right" onClick={() => setWizardStep(wizardStep + 1)} />
               ) : (
                 <Button label="Generar Lote" icon="pi pi-check" iconPos="right" loading={loading} onClick={handleWizardSubmit} className="!bg-teal-600 border-none" />
               )}
            </div>
         </div>
      }>
        {wizardStep === 1 && (
            <div className="flex flex-col gap-4 mt-2">
               <p className="text-sm text-slate-500 mb-2">Paso 1: ¿A qué productos les aplicaremos la regla matemática? Puedes combinar múltiples filtros (AND).</p>
               
               <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Proveedores</label>
                  <MultiSelect value={wizardSuppliers} options={wizardSupplierOptions} onChange={(e) => setWizardSuppliers(e.value)} optionLabel="name" optionValue="id" placeholder="Cualquier proveedor..." filter className="w-full" display="chip" />
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Categorías Principales</label>
                  <MultiSelect value={wizardCategories} options={wizardCategoryOptions} onChange={(e) => setWizardCategories(e.value)} optionLabel="name" optionValue="id" placeholder="Cualquier categoría..." filter className="w-full" display="chip" />
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Término de Búsqueda (Opcional)</label>
                  <InputText value={wizardSearchTerm} onChange={(e) => setWizardSearchTerm(e.currentTarget.value)} placeholder="Ej. Lata, Caja..." className="w-full" />
               </div>
            </div>
        )}
        {wizardStep === 2 && (
            <div className="flex flex-col gap-4 mt-2">
               <p className="text-sm text-slate-500 mb-2">Paso 2: ¿Qué matemática aplicamos al lote resultante?</p>
               <div className="flex gap-4">
                  <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase text-rose-600 border-b border-slate-100 pb-1">Regla para el COSTO</label>
                      <Dropdown value={costRuleAction} options={ruleOptions} onChange={(e) => setCostRuleAction(e.value)} className="w-full mb-2" />
                      <InputNumber value={costRuleValue} onValueChange={(e) => setCostRuleValue(e.value ?? 0)} disabled={costRuleAction === 'KEEP'} minFractionDigits={2} className="w-full" placeholder="Valor numérico..." />
                  </div>
                  <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase text-emerald-600 border-b border-slate-100 pb-1">Regla para el PRECIO</label>
                      <Dropdown value={priceRuleBaseTarget} options={baseTargetOptions} onChange={(e) => setPriceRuleBaseTarget(e.value)} className="w-full mb-2" placeholder="Base de Cálculo" />
                      <Dropdown value={priceRuleAction} options={ruleOptions} onChange={(e) => setPriceRuleAction(e.value)} className="w-full mb-2" />
                      <InputNumber value={priceRuleValue} onValueChange={(e) => setPriceRuleValue(e.value ?? 0)} disabled={priceRuleAction === 'KEEP'} minFractionDigits={2} className="w-full" placeholder="Valor numérico..." />
                      
                      <div className="flex items-center mt-3 gap-2">
                         <Checkbox inputId="cbTax" checked={priceRuleIncludeTax} onChange={(e) => setPriceRuleIncludeTax(e.checked ?? false)} />
                         <label htmlFor="cbTax" className="text-sm text-slate-700 cursor-pointer select-none">Sumar Impuesto (IVA)</label>
                      </div>
                  </div>
               </div>
               
               <div className="bg-blue-50 text-blue-800 p-4 rounded-md mt-4 text-sm border border-blue-100 flex items-start gap-3">
                   <i className="pi pi-info-circle text-xl mt-0.5"></i>
                   <div>
                     <span className="font-bold block mb-1">Impacto Seguro en la Base de Datos</span>
                     <p>Esto cruzará y calculará las líneas solicitadas. Las líneas resultantes se inyectarán en la sesión borrador actual de forma temporal para tu revisión visual.</p>
                   </div>
               </div>
            </div>
        )}
      </Dialog>
    </div>
  );
}
