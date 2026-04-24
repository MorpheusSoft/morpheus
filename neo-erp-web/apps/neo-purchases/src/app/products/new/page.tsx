'use client';
import { useState, useEffect, Suspense, useRef } from 'react';
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';

import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { Checkbox } from 'primereact/checkbox';
import { InputNumber } from 'primereact/inputnumber';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputSwitch } from 'primereact/inputswitch';
import { Chips } from 'primereact/chips';
import ProductSuppliersTab from './ProductSuppliersTab';
import { ProductService } from '@/services/product.service';
import { useRouter, useSearchParams } from 'next/navigation';

const schema = yup.object().shape({
  name: yup.string().required('Requerido'),
  category_id: yup.number().required('Requerido'),
  brand: yup.string().nullable(),
  model: yup.string().nullable(),
  currency_id: yup.number().default(1),
  is_liquor: yup.boolean().default(false),
  is_active: yup.boolean().default(true),
  track_batches: yup.boolean().default(false),
  has_variants: yup.boolean().default(false),
  shrinkage_percent: yup.number().default(0),
  description: yup.string().nullable(),
  uom_base: yup.string().default('PZA'),
  tax_id: yup.number().nullable(),
  origin: yup.string().default('NACIONAL'),
  image_main: yup.string().nullable(),
  datasheet: yup.string().nullable(),
  packagings: yup.array().of(
    yup.object().shape({
      name: yup.string().required(),
      qty_per_unit: yup.number().required(),
      weight_kg: yup.number().default(0),
      volume_m3: yup.number().default(0)
    })
  ).default([]),
  barcodes: yup.array().of(
    yup.object().shape({
      barcode: yup.string().required(),
      code_type: yup.string().default('BARCODE'),
      uom: yup.string().required(),
      conversion_factor: yup.number().default(1)
    })
  ).default([]),
  
  standard_cost: yup.number().default(0),
  replacement_cost: yup.number().default(0),
  target_utility_pct: yup.number().default(30),
  price: yup.number().default(0),
  price_with_tax: yup.number().default(0),
  
  facility_prices: yup.array().of(
    yup.object().shape({
      facility_id: yup.number().required(),
      target_utility_pct: yup.number().default(0),
      sales_price: yup.number().default(0)
    })
  ).default([])
}).required();

const FacilityMarginCell = ({ index, control, cost }: { index: number, control: any, cost: number }) => {
    const rowPrice = useWatch({ control, name: `facility_prices.${index}.sales_price` }) || 0;
    const margin = (rowPrice > 0) ? ((rowPrice - cost) / rowPrice) * 100 : 0;
    return <span className="font-bold text-slate-500">{margin.toFixed(2)}%</span>;
};

const FacilityPVPCell = ({ index, control, tributes, taxId }: { index: number, control: any, tributes: any[], taxId: number }) => {
    const rowPrice = useWatch({ control, name: `facility_prices.${index}.sales_price` }) || 0;
    const taxRate = tributes.find(t => t.id === taxId)?.rate || 0;
    const withTax = rowPrice * (1 + (taxRate / 100));
    return <span className="font-extrabold text-emerald-700">${withTax.toFixed(2)}</span>;
};

const InstantNumberInput = ({ value, onChange, className, prefix = "", suffix = "", readOnly = false }: any) => {
    const [display, setDisplay] = useState(() => value ? Number(value).toFixed(2) : '0.00');
    const [isFocused, setIsFocused] = useState(false);
    
    useEffect(() => {
        if (!isFocused) setDisplay(value ? Number(value).toFixed(2) : '0.00');
    }, [value, isFocused]);

    return (
        <div className="relative w-full flex items-center">
            {prefix && <span className="absolute left-3 font-extrabold opacity-70 z-10">{prefix}</span>}
            <input 
                type="text"
                readOnly={readOnly}
                value={display}
                onFocus={() => setIsFocused(true)}
                onChange={(e) => {
                    if (readOnly) return;
                    let clean = e.target.value.replace(/[^0-9.]/g, '');
                    const parts = clean.split('.');
                    if (parts.length > 2) clean = parts[0] + '.' + parts.slice(1).join('');
                    setDisplay(clean);
                    if (onChange) onChange(parseFloat(clean) || 0);
                }}
                onBlur={() => {
                    setIsFocused(false);
                    if (readOnly) return;
                    const num = parseFloat(display) || 0;
                    setDisplay(num.toFixed(2));
                    if (onChange) onChange(num);
                }}
                className={`w-full relative outline-none bg-transparent ${prefix ? 'pl-8' : 'pl-4'} ${suffix ? 'pr-10' : 'pr-4'} ${className} ${readOnly ? 'cursor-not-allowed' : ''}`}
            />
            {suffix && <span className="absolute right-3 font-extrabold opacity-70 z-10">{suffix}</span>}
        </div>
    );
};

function ProductFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');
  const suppliersRef = useRef<any>(null);

  const [activeTab, setActiveTab] = useState(0);
  const [categories, setCategories] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [tributes, setTributes] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      name: '',
      category_id: undefined,
      brand: '',
      model: '',
      currency_id: 1,
      is_liquor: false,
      track_batches: false,
      has_variants: false,
      shrinkage_percent: 0,
      uom_base: 'PZA',
      origin: 'NACIONAL',
      image_main: '',
      datasheet: '',
      standard_cost: 0,
      replacement_cost: 0,
      target_utility_pct: 30,
      price: 0,
      price_with_tax: 0,
      packagings: [],
      barcodes: [],
      facility_prices: []
    }
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'facility_prices' });
  const { fields: packagingsFields, append: appendPackaging, remove: removePackaging } = useFieldArray({ control, name: 'packagings' });
  const { fields: barcodesFields, append: appendBarcode, remove: removeBarcode } = useFieldArray({ control, name: 'barcodes' });

  // Watches
  const shrink = watch('shrinkage_percent') || 0;
  const cost = watch('standard_cost') || 0;
  const targetUtility = watch('target_utility_pct') || 0;
  const price = watch('price') || 0;
  const taxId = watch('tax_id');
  const hasVariants = watch('has_variants') || false;
  
  const formValues = watch();
  const facilityPrices = formValues.facility_prices || fields;

  // Computed Main PVP
  const activeTaxRate = tributes.find(t => t.id === taxId)?.rate || 0;
  const computedPvp = price * (1 + (activeTaxRate / 100));

  const [grossUtility, setGrossUtility] = useState(0);
  const [netUtility, setNetUtility] = useState(0);
  
  // Real DB Costs (Locked array/display info)
  const [historicCosts, setHistoricCosts] = useState({ avg: 0, prev: 0, rep: 0 });

  // Tab 5: Cartesian Engine State
  const [dimensions, setDimensions] = useState<{name: string, values: string[]}[]>([
    { name: 'Talla', values: [] },
    { name: 'Color', values: [] }
  ]);
  const [generatedVariants, setGeneratedVariants] = useState<any[]>([]);
  const [isSavingVariants, setIsSavingVariants] = useState(false);

  
  const handleUpload = async (e: any, fieldName: string) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      
      try {
          const response = await fetch('http://localhost:8000/api/v1/utils/upload/', {
              method: 'POST',
              body: formData,
          });
          const data = await response.json();
          setValue(fieldName, data.url);
      } catch(err) {
          alert('Error uploading file');
      }
  };

  const generateCartesian = () => {
      const validDims = dimensions.filter(d => d.name.trim() && d.values.length > 0);
      if (validDims.length === 0) return;

      const cartesian = validDims.reduce((a, b) => 
          a.reduce((r: any[], v: any) => r.concat(b.values.map(w => ([] as any[]).concat(v, w))), [])
      , [[]]);

      const baseSku = `N-${(editId || '0').toString().padStart(5, '0')}`;
      const newVariants = cartesian.map((combo: any[], i: number) => {
          const attributes: any = {};
          combo.forEach((val: string, idx: number) => {
              attributes[validDims[idx].name] = val;
          });
          const attributesStr = Object.values(attributes).join('-');
          const autoSku = `${baseSku}-${attributesStr}`.toUpperCase().replace(/\s+/g, '');
          
          return {
             _cartesian_id: i,
             attributes,
             sku: autoSku,
             standard_cost: formValues.standard_cost || 0,
             sales_price: formValues.price || 0,
             replacement_cost: formValues.replacement_cost || 0,
             part_number: '',
             barcode: ''
          };
      });
      setGeneratedVariants(newVariants);
  };

  const saveVariantsBatch = async () => {
     if (!generatedVariants.length || !editId) return;
     setIsSavingVariants(true);
     try {
         await ProductService.createVariantBatch(editId, generatedVariants);
         alert("¡Matriz de variantes guardada satisfactoriamente en Neo ERP!");
     } catch(e) {
         console.error(e);
         alert("Error crítico sincronizando variantes.");
     } finally {
         setIsSavingVariants(false);
     }
  };

  // Compute Base Tabs based on Architectural Rules
    const _tabs = [
    { label: 'Información General', icon: 'pi pi-info-circle', requiresId: false },
    { label: 'Rentabilidad y Costos', icon: 'pi pi-dollar', requiresId: false },
    { label: 'Multimedia & Fichas', icon: 'pi pi-image', requiresId: false },
    { label: 'Empaques Logísticos', icon: 'pi pi-box', requiresId: true },
    { label: 'Códigos Multi-Unidad', icon: 'pi pi-barcode', requiresId: true }
  ];
  if (hasVariants) {
    _tabs.push({ label: 'Matriz de Variantes', icon: 'pi pi-th-large', requiresId: true });
  }
  _tabs.push({ label: 'Proveedores', icon: 'pi pi-truck', requiresId: true });

  useEffect(() => {
    ProductService.getCategories().then(setCategories);
    ProductService.getFacilities().then(setFacilities);
    ProductService.getTributes().then(data => {
      setTributes(data);
      if (data.length > 0 && !editId) setValue('tax_id', data[0].id);
    });

    if (editId) {
      ProductService.getProductById(editId).then(p => {
        if (p) {
          setValue('name', p.name);
          setValue('category_id', p.category_id);
          setValue('brand', p.brand);
          setValue('model', p.model);
          setValue('is_liquor', p.is_liquor);
          if (p.tax_id) setValue('tax_id', p.tax_id);
          
          setValue('is_active', p.is_active !== false);
          setValue('track_batches', p.track_batches || false);
          setValue('has_variants', p.has_variants || false);
          setValue('shrinkage_percent', p.shrinkage_percent || 0);
          setValue('uom_base', p.uom_base || 'PZA');
          setValue('origin', p.origin || 'NACIONAL');
          setValue('image_main', p.image_main || '');
          setValue('datasheet', p.datasheet || '');
          
          if (p.variants && p.variants.length > 0) {
            setValue('standard_cost', Number(p.variants[0].standard_cost) || 0);
            setValue('replacement_cost', Number(p.variants[0].replacement_cost) || 0);
            setValue('price', Number(p.variants[0].sales_price) || 0);
            setValue('currency_id', p.variants[0].currency_id || 1);
            setHistoricCosts({ 
                avg: Number(p.variants[0].average_cost) || 0, 
                prev: Number(p.variants[0].last_cost) || 0,
                rep: Number(p.variants[0].replacement_cost) || 0 
            });
            if (p.variants[0].facility_prices) {
                setValue('facility_prices', p.variants[0].facility_prices);
            }
            if (p.variants[0].barcodes) {
                setValue('barcodes', p.variants[0].barcodes);
            }
          }
          if (p.has_variants && p.variants) {
            setGeneratedVariants(p.variants.map((v:any, idx:number) => ({
                 ...v,
                 _cartesian_id: idx
            })));
          }
          
          if (p.packagings) {
              setValue('packagings', p.packagings);
          }
        }
      });
    }
  }, [setValue, editId]);

  // Reactive Mathematics for Prices and Utilities
  useEffect(() => {
    // Determine tax rate
    const taxRate = tributes.find(t => t.id === taxId)?.rate || 0;
    
    // Reverse calculation (Base Utility targets)
    if (cost > 0) {
       // Calculation
       const s = shrink / 100;
       const protectedCost = s < 1 ? cost / (1 - s) : cost;
       
       const currentPrc = price;
       if (currentPrc > 0) {
           // Mark-up over Sales Formula: (Price - Cost) / Price
           const gU = ((currentPrc - cost) / currentPrc) * 100;
           setGrossUtility(gU);
           const nU = ((currentPrc - protectedCost) / currentPrc) * 100;
           setNetUtility(nU);
           
           // Cascade tax
           const finalP = currentPrc * (1 + (taxRate/100));
           // Prevent infinite loop by not calling setValue blindly if it matches
           // Actually we need an onChange handler strategy to prevent loops.
           // For now, let's just display it securely.
       } else {
           setGrossUtility(0);
           setNetUtility(0);
       }
    }
  }, [cost, price, shrink, taxId, tributes]);

  const handlePriceSansTaxChange = (newBasePrice: number) => {
      setValue('price', newBasePrice);
      if (newBasePrice > 0) {
          const m = ((newBasePrice - cost) / newBasePrice) * 100;
          setValue('target_utility_pct', Number(m.toFixed(2)));
      }
  };

  const applyTargetUtility = () => {
      const s = shrink / 100;
      const protectedCost = s < 1 ? cost / (1 - s) : cost;
      const u = targetUtility / 100;
      // Mark-up over Sales Reverse Formula: Cost / (1 - Margin)
      const newPrice = u < 1 ? protectedCost / (1 - u) : protectedCost;
      handlePriceSansTaxChange(newPrice);
  };

  const onSubmit = async (data: any) => {
    setIsSaving(true);
    try {
      if (editId) {
        // Enriquecimiento (PUT updates children)
        await ProductService.updateProduct(editId, data);
        
        // Sync providers from RAM drafts
        const suppData = suppliersRef.current?.getSuppliers();
        if (suppData) {
            const variantsGrps = Array.from(new Set(suppData.map((s: any) => s.variant_id)));
            // To ensure deletions are synchronized as well, we fetch all native variants
            const productMaster = await ProductService.getProductById(editId);
            const baseVariants = productMaster?.variants || [];
            const allVariantIds = Array.from(new Set([...variantsGrps, ...baseVariants.map((v: any) => v.id)]));
            
            const promises = allVariantIds.filter((v: any) => v != null).map(vid => {
                 const variantSuppliers = suppData.filter((s: any) => s.variant_id === vid);
                 return ProductService.syncVariantSuppliers(vid, variantSuppliers);
            });
            await Promise.all(promises);
        }
        
        alert('Configuración Avanzada y Borradores Guardados Correctamente.');
      } else {
        // Creación Cabecera Master (POST)
        const res = await ProductService.createProduct(data);
        alert('Cabecera de Producto Creada Correctamente');
        // Redirigir al modo enriquecimiento
        router.replace('/products/new?id=' + (res.id || 999));
      }
    } catch (err: any) {
      console.error(err);
      alert('Error: ' + JSON.stringify(err.response?.data?.detail || err.message));
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = "w-full !rounded-xl !border-slate-200 !bg-slate-50 hover:!bg-white focus:!bg-white focus:!border-blue-500 focus:!ring-4 focus:!ring-blue-500/10 transition-all !py-3 !px-4 text-slate-800 font-medium";
  const labelClass = "text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2 mt-2";

  return (
    <div className="w-full max-w-[1800px] mx-auto animate-fade-in-up">
      <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden relative backdrop-blur-3xl">
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-90"></div>
        <div className="p-5 md:p-8">
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3">
                 <h2 className="text-3xl font-extrabold text-slate-900 m-0 tracking-tight">
                   {editId ? 'Configuración de Producto' : 'Crear Producto Maestro'}
                 </h2>
                 {editId && <span className="px-3 py-1 bg-blue-50 text-blue-700 font-mono text-sm font-bold border border-blue-200 rounded-lg">PRD-{editId.padStart(4, '0')}</span>}
              </div>
              <p className="text-slate-500 text-sm mt-1 font-medium">
                {editId ? 'Paso 2: Enriquecimiento de matrices logísticas y de código.' : 'Paso 1: Define el ADN y los costos base para obtener un Código de Sistema.'}
              </p>
            </div>
            <Button 
              label="Catálogo" 
              icon="pi pi-arrow-left" 
              onClick={() => router.push('/products')} 
              className="!bg-slate-100 !text-slate-600 !border-none !rounded-full !shadow-none hover:!bg-slate-200 transition-all !px-6 !py-2.5 font-bold text-sm shrink-0" 
            />
          </div>

          {/* Nav Segmented Control */}
          <div className="flex bg-slate-100/60 p-1.5 rounded-2xl w-full max-w-full overflow-x-auto shadow-inner border border-slate-200/60 mb-8 scrollbar-hide">
            {_tabs.map((tab, idx) => {
              const isDisabled = tab.requiresId && !editId;
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => setActiveTab(idx)}
                  className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap flex-1 sm:flex-none 
                    ${isDisabled ? 'opacity-40 cursor-not-allowed grayscale' : ''} 
                    ${activeTab === idx ? 'bg-white shadow-md text-blue-600' : (!isDisabled ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50' : '')}`}
                >
                  <i className={tab.icon}></i>
                  {tab.label}
                  {isDisabled && <i className="pi pi-lock text-[10px] ml-1"></i>}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>
            {/* TAB 1: GENERAL */}
            <div className={activeTab === _tabs.findIndex(t => t.label === 'Información General') ? 'block' : 'hidden animate-fade-in'}>
              <div className="flex flex-col md:flex-row gap-6 mb-6 w-full">
                <div className="flex flex-col md:w-[250px] shrink-0">
                  <label className={labelClass}>Código Maestro</label>
                  <InputText disabled value={editId ? `PRD-${editId.padStart(4, '0')}` : 'Automático'} className={`${inputClass} !bg-slate-200 !text-slate-500 !cursor-not-allowed uppercase font-mono tracking-widest`} />
                </div>
                <div className="flex flex-col flex-1 w-full relative">
                  <label className={labelClass}>Nombre del Artículo *</label>
                  <Controller name="name" control={control} render={({ field }) => (
                    <InputText autoComplete="off" {...field} value={field.value || ''} className={`${inputClass} w-full`} placeholder="Ej. Zapato Deportivo Pegasus" />
                  )} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div className="flex flex-col lg:col-span-2">
                  <label className={labelClass}>Categoría MAESTRA *</label>
                  <Controller name="category_id" control={control} render={({ field }) => (
                    <Dropdown 
                      value={field.value} 
                      onChange={(e) => field.onChange(e.value)} 
                      options={categories} 
                      optionLabel="name" 
                      optionValue="id" 
                      placeholder="Selecciona Categoría" 
                      className="w-full !rounded-xl !border-slate-200 !bg-slate-50 hover:!bg-white focus:!bg-white shadow-none"
                      pt={{ input: { className: '!py-3 !px-4 text-slate-800 font-medium' }, trigger: { className: 'text-slate-400' } }}
                    />
                  )} />
                </div>
                <div className="flex flex-col">
                  <label className={labelClass}>Fabricante / Marca</label>
                  <Controller name="brand" control={control} render={({ field }) => (
                    <InputText autoComplete="off" {...field} value={field.value || ''} className={inputClass} placeholder="Ej. Nike" />
                  )} />
                </div>
                <div className="flex flex-col">
                  <label className={labelClass}>Modelo / Referencia</label>
                  <Controller name="model" control={control} render={({ field }) => (
                    <InputText autoComplete="off" {...field} value={field.value || ''} className={inputClass} placeholder="Ej. Air Zoom 2024" />
                  )} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                 <div className="flex flex-col">
                  <label className={labelClass}>UOM (Unidad Logística Base) *</label>
                  <Controller name="uom_base" control={control} render={({ field }) => (
                    <Dropdown 
                      value={field.value} 
                      onChange={(e) => field.onChange(e.value)} 
                      options={[{label: 'PZA (Pieza)', value: 'PZA'}, {label: 'PAR (Pares)', value: 'PAR'}, {label: 'KG (Kilogramo)', value: 'KG'}]}
                      optionLabel="label" 
                      optionValue="value" 
                      className="w-full !rounded-xl !border-slate-200 !bg-slate-50 hover:!bg-white focus:!bg-white shadow-none"
                      pt={{ input: { className: '!py-3 !px-4 text-slate-800 font-medium' }, trigger: { className: 'text-slate-400' } }}
                    />
                  )} />
                 </div>
                 <div className="flex flex-col">
                  <label className={labelClass}>Mermas y Pérdidas Estimadas (%)</label>
                  <Controller name="shrinkage_percent" control={control} render={({ field }) => (
                    <InputNumber value={field.value} onValueChange={(e) => field.onChange(e.value)} suffix=" %" inputClassName={inputClass} pt={{ root: { className: 'w-full' } }} />
                  )} />
                 </div>
                 <div className="flex flex-col">
                  <label className={labelClass}>Procedencia *</label>
                  <Controller name="origin" control={control} render={({ field }) => (
                    <Dropdown 
                      value={field.value} 
                      onChange={(e) => field.onChange(e.value)} 
                      options={[{label: 'Nacional', value: 'NACIONAL'}, {label: 'Importado', value: 'IMPORTADO'}]}
                      optionLabel="label" 
                      optionValue="value" 
                      className="w-full !rounded-xl !border-slate-200 !bg-slate-50 hover:!bg-white focus:!bg-white shadow-none"
                      pt={{ input: { className: '!py-3 !px-4 text-slate-800 font-medium' }, trigger: { className: 'text-slate-400' } }}
                    />
                  )} />
                 </div>
              </div>

              <div className="flex flex-col md:flex-row items-stretch gap-6 mb-2">
                <Controller name="track_batches" control={control} render={({ field }) => (
                  <div className={`flex-1 rounded-xl p-4 border transition-all cursor-pointer flex gap-3 items-center select-none w-full shadow-sm hover:shadow-md ${field.value ? 'bg-amber-50/50 border-amber-400' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`} onClick={() => {
                      const next = !field.value;
                      field.onChange(next);
                      if (next) setValue('has_variants', false);
                  }}>
                    <Checkbox inputId="track_batches" checked={field.value} className={field.value ? '!border-amber-500' : ''} />
                    <div className="flex-1 mt-1">
                      <label className={`font-bold text-sm leading-tight cursor-pointer ${field.value ? 'text-amber-800' : 'text-slate-700'}`}>Trazabilidad (Lotes)</label>
                      <p className="text-[10px] text-slate-500 mt-1 font-medium leading-relaxed">Fuerza a solicitar Fecha Vto y Lote.</p>
                    </div>
                  </div>
                )} />

                <Controller name="has_variants" control={control} render={({ field }) => (
                  <div className={`flex-1 rounded-xl p-4 border transition-all cursor-pointer flex gap-3 items-center select-none w-full shadow-sm hover:shadow-md ${field.value ? 'bg-purple-50/50 border-purple-400 shadow-purple-200/50' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`} onClick={() => {
                      const next = !field.value;
                      field.onChange(next);
                      if (next) setValue('track_batches', false);
                  }}>
                    <Checkbox inputId="has_variants" checked={field.value} className={field.value ? '!border-purple-500' : ''} />
                    <div className="flex-1 mt-1">
                      <label className={`font-bold text-sm leading-tight cursor-pointer ${field.value ? 'text-purple-800' : 'text-slate-700'}`}>Motor Cartesiano</label>
                      <p className="text-[10px] text-slate-500 mt-1 font-medium leading-relaxed">Habilita subproductos dimensionales.</p>
                    </div>
                  </div>
                )} />

                <Controller name="is_active" control={control} render={({ field }) => (
                  <div className={`flex-1 rounded-xl p-4 border transition-all cursor-pointer flex gap-3 items-center select-none w-full shadow-sm hover:shadow-md ${field.value ? 'bg-emerald-50/50 border-emerald-400' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`} onClick={() => field.onChange(!field.value)}>
                    <InputSwitch inputId="is_active" checked={field.value} className={field.value ? '[&_.p-inputswitch-slider]:!bg-emerald-500' : ''} />
                    <div className="flex-1 mt-1">
                      <label className={`font-bold text-sm leading-tight cursor-pointer ${field.value ? 'text-emerald-800' : 'text-slate-700'}`}>Producto Activo</label>
                      <p className="text-[10px] text-slate-500 mt-1 font-medium leading-relaxed">Visible en ventas y catálogos.</p>
                    </div>
                  </div>
                )} />
              </div>
            </div>

            {/* TAB 2: COSTOS Y RENTABILIDAD */}
            <div className={activeTab === _tabs.findIndex(t => t.label === 'Rentabilidad y Costos') ? 'block' : 'hidden animate-fade-in'}>
              
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 border-b border-slate-100 pb-4">
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest">Métricas de Costeo de Valoración</h3>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Moneda Transaccional:</span>
                  <Controller name="currency_id" control={control} render={({ field }) => (
                    <Dropdown 
                       value={field.value} 
                       onChange={e => field.onChange(e.value)} 
                       options={[{id: 1, name: 'Dólar (USD)'}, {id: 2, name: 'Bolívares (VES)'}]} 
                       optionLabel="name" 
                       optionValue="id" 
                       className="p-inputtext-sm !rounded-lg border-slate-200 w-48 shadow-sm" 
                    />
                  )} />
                </div>
              </div>

              {/* Costos Kardex Dashboard */}
              <div className="mb-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-center items-center hover:shadow-md transition-all">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Costo Actual (Estándar)</span>
                    <Controller name="standard_cost" control={control} render={({ field }) => (
                       <InputNumber value={field.value} onValueChange={e => field.onChange(e.value)} mode="currency" currency="USD" inputClassName="p-inputtext-sm w-32 text-center font-bold text-blue-700 bg-white shadow-sm" />
                    )} />
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-center items-center hover:shadow-md transition-all">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cto. de Reposición</span>
                    <Controller name="replacement_cost" control={control} render={({ field }) => (
                       <InputNumber value={field.value} onValueChange={e => field.onChange(e.value)} mode="currency" currency="USD" inputClassName="p-inputtext-sm w-32 text-center font-bold text-rose-700 bg-white border-rose-200 focus:ring-rose-500 shadow-sm" />
                    )} />
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-center items-center opacity-70">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Último Costo Recibido</span>
                    <span className="text-xl font-extrabold text-slate-800">${Number(historicCosts.prev || 0).toFixed(2)}</span>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex flex-col justify-center items-center relative overflow-hidden shadow-inner">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500 rounded-bl-full opacity-10"></div>
                    <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1 z-10">Promedio Ponderado</span>
                    <span className="text-2xl font-black text-emerald-900 z-10">${Number(historicCosts.avg || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Fijacion de Precios */}
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest mb-4 border-t pt-6">Estructura de Venta Base</h3>
              <div className="flex flex-wrap items-end gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-8 mt-4">
                <div className="flex flex-col flex-shrink-0" style={{ width: '220px' }}>
                  <label className={labelClass}>Impuesto Aplicable *</label>
                  <Controller name="tax_id" control={control} render={({ field }) => (
                    <Dropdown 
                      value={field.value} 
                      onChange={e => field.onChange(e.value)} 
                      options={tributes} 
                      optionLabel="name" 
                      optionValue="id" 
                      className="w-full !rounded-xl !border-slate-200 !bg-white transition-all shadow-sm"
                      pt={{ input: { className: '!py-3 !px-4 text-slate-800 font-medium' }, trigger: { className: 'text-slate-400' } }}
                    />
                  )} />
                </div>
                <div className="flex flex-col relative flex-shrink-0" style={{ width: '160px' }}>
                  <label className={labelClass}>Deseo ganar (%)</label>
                  <div className="flex w-full">
                      <Controller name="target_utility_pct" control={control} render={({ field }) => (
                        <InstantNumberInput value={field.value} onChange={(v:any) => field.onChange(v)} suffix="%" className="w-full rounded-l-xl border border-slate-200 bg-white transition-all py-2.5 text-slate-800 font-medium shadow-sm border-r-0 text-center" />
                      )} />
                      <Button type="button" icon="pi pi-calculator" onClick={applyTargetUtility} className="!rounded-r-xl !rounded-l-none !bg-slate-200 !border-slate-200 !text-slate-700 hover:!bg-slate-300 shadow-sm shrink-0" title="Aplicar Fórmula Inversa" />
                  </div>
                </div>
                <div className="flex flex-col flex-shrink-0" style={{ width: '220px' }}>
                  <label className={labelClass}>Precio de Venta BASE (Sin IVA)</label>
                  <div className="relative w-full">
                    <InstantNumberInput 
                        value={price} 
                        onChange={(v:any) => handlePriceSansTaxChange(v)} 
                        prefix="$"
                        className="w-full rounded-xl border border-blue-300 bg-blue-50/50 hover:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all py-2.5 font-bold text-blue-900 shadow-sm" 
                    />
                  </div>
                </div>
                <div className="flex flex-col flex-shrink-0" style={{ width: '220px' }}>
                  <label className={labelClass}>P.V.P (Total c/ IVA)</label>
                  <div className="relative w-full">
                    <InstantNumberInput 
                        readOnly 
                        value={computedPvp} 
                        prefix="$"
                        className="w-full rounded-xl border border-emerald-300 bg-emerald-50 opacity-100 transition-all py-2.5 font-bold text-emerald-900 shadow-md cursor-not-allowed" 
                    />
                  </div>
                </div>
              </div>

              {/* Utility Result Dash */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5 flex items-center justify-between">
                     <div>
                       <span className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest block mb-1">Margen / Rentabilidad Bruta</span>
                       <span className="text-2xl font-extrabold text-indigo-900">{Number(grossUtility || 0).toFixed(2)}%</span>
                     </div>
                     <i className="pi pi-chart-line text-4xl text-indigo-200"></i>
                  </div>
                  <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-5 flex items-center justify-between">
                     <div>
                       <span className="text-[11px] font-bold text-rose-500 uppercase tracking-widest block mb-1">Margen Neto Real (Deduciendo Mermas)</span>
                       <span className="text-2xl font-extrabold text-rose-900">{Number(netUtility || 0).toFixed(2)}%</span>
                     </div>
                     <i className="pi pi-shield text-4xl text-rose-200"></i>
                  </div>
              </div>

              {/* Matriz de Precios por Localidad */}
              <div className="mt-8 border-t border-slate-100 pt-6">
                 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest">Matriz de Precios por Sucursal / Localidad</h3>
                      <p className="text-slate-500 text-xs mt-1">Configura sobrecargos o precios específicos si difieren del Precio de Venta BASE global.</p>
                    </div>
                    <Button type="button" label="Añadir Localidad" icon="pi pi-plus" onClick={() => append({ facility_id: undefined as any, sales_price: 0, target_utility_pct: 0 })} className="!bg-indigo-50 !text-indigo-700 hover:!bg-indigo-100 !border-indigo-200 !rounded-xl !px-4 !py-2 !shadow-none font-bold text-xs shrink-0" />
                 </div>
                 
                 {fields.length === 0 ? (
                   <div className="text-center p-8 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                     <i className="pi pi-building text-3xl mb-3 text-slate-300"></i>
                     <p className="text-slate-500 text-sm font-medium">Este producto usará el Precio Base global para todas las localidades. <br/>Añade una sucursal si deseas fijar una tarifa exclusiva.</p>
                   </div>
                 ) : (
                   <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mt-4 shadow-sm">
                     <DataTable value={fields} responsiveLayout="scroll">
                       <Column header="SUCURSAL / LOCALIDAD" body={(rowData, options) => (
                         <Controller name={`facility_prices.${options.rowIndex}.facility_id`} control={control} render={({ field }) => (
                           <Dropdown value={field.value} onChange={e => field.onChange(e.value)} options={facilities} optionLabel="name" optionValue="id" placeholder="Seleccionar Sucursal..." className="w-full !rounded-lg border-slate-200 shadow-sm p-inputtext-sm" />
                         )} />
                       )} className="w-[50%]" />
                       <Column header="PRECIO EXCLUSIVO (Sin IVA)" body={(rowData, options) => (
                         <Controller name={`facility_prices.${options.rowIndex}.sales_price`} control={control} render={({ field }) => (
                           <div className="relative w-full">
                             <InstantNumberInput 
                               value={field.value} 
                               onChange={(v:any) => field.onChange(v)} 
                               prefix="$"
                               className="w-full rounded-lg border border-indigo-200 bg-indigo-50/30 font-bold text-indigo-700 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 py-2" 
                             />
                           </div>
                         )} />
                       )} className="w-[30%]" />
                       <Column header="MARGEN (%)" body={(rowData, options) => (
                          <FacilityMarginCell index={options.rowIndex} control={control} cost={cost} />
                       )} className="w-[10%]" />
                       <Column header="P.V.P (Con IVA)" body={(rowData, options) => (
                          <FacilityPVPCell index={options.rowIndex} control={control} tributes={tributes} taxId={taxId || 0} />
                       )} className="w-[10%]" />
                       <Column body={(rowData, options) => (
                         <Button type="button" icon="pi pi-trash" onClick={() => remove(options.rowIndex)} className="p-button-rounded p-button-danger p-button-text hover:bg-rose-100 w-10 h-10 transition-colors" title="Eliminar Excepción" />
                       )} style={{ width: '10%' }} align="center" />
                     </DataTable>
                   </div>
                 )}
              </div>
            </div>

            
            {/* TAB MULTIMEDIA */}
            <div className={activeTab === _tabs.findIndex(t => t.label === 'Multimedia & Fichas') ? 'block' : 'hidden animate-fade-in'}>
               <div className="bg-slate-50 border border-slate-200 p-8 rounded-3xl grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* IMAGEN */}
                  <Controller name="image_main" control={control} render={({ field }) => (
                      <div className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl border border-dashed border-slate-300 shadow-sm relative overflow-hidden">
                         <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-4">Fotografía / Render Principal</h3>
                         
                         {field.value ? (
                             <div className="relative group rounded-xl overflow-hidden shadow-md">
                                 <img src={`http://localhost:8000${field.value}`} alt="Product" className="w-48 h-48 object-cover" />
                                 <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                                    <label className="cursor-pointer bg-white text-slate-800 py-2 px-4 rounded-full font-bold text-xs shadow-xl">
                                       <i className="pi pi-upload mr-2"></i> Cambiar
                                       <input type="file" className="hidden" accept="image/*" onChange={(e) => handleUpload(e, 'image_main')} />
                                    </label>
                                 </div>
                             </div>
                         ) : (
                             <label className="cursor-pointer flex flex-col items-center justify-center w-48 h-48 bg-slate-50 border border-slate-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-all">
                                 <i className="pi pi-image text-3xl text-slate-400 mb-2"></i>
                                 <span className="text-slate-500 font-medium text-xs">Cargar Imagen</span>
                                 <input type="file" className="hidden" accept="image/*" onChange={(e) => handleUpload(e, 'image_main')} />
                             </label>
                         )}
                         <p className="text-[10px] text-center text-slate-400 mt-4 leading-relaxed">Formato JPG, PNG, WEBP. <br/> Max 2MB, dimensión mínima recomendada 500x500.</p>
                      </div>
                  )} />

                  {/* FICHA TECNICA */}
                  <Controller name="datasheet" control={control} render={({ field }) => (
                      <div className="flex flex-col justify-center p-6 bg-white rounded-2xl border border-dashed border-slate-300 shadow-sm relative">
                         <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                             <i className="pi pi-file-pdf text-red-500"></i> Ficha Técnica / Manual
                         </h3>
                         
                         {field.value ? (
                             <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl flex items-center justify-between">
                                 <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xl shrink-0"><i className="pi pi-file-pdf"></i></div>
                                    <div className="truncate text-xs font-bold text-slate-700">Documento Adjunto</div>
                                 </div>
                                 <div className="flex items-center gap-2">
                                     <a href={`http://localhost:8000${field.value}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700 text-sm font-bold"><i className="pi pi-external-link"></i></a>
                                     <label className="cursor-pointer text-slate-500 hover:text-slate-700 font-bold ml-2">
                                         <i className="pi pi-sync"></i>
                                         <input type="file" className="hidden" accept="application/pdf" onChange={(e) => handleUpload(e, 'datasheet')} />
                                     </label>
                                 </div>
                             </div>
                         ) : (
                             <label className="cursor-pointer flex items-center justify-center py-6 px-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-red-50 hover:border-red-200 transition-all font-bold text-slate-500 text-sm w-full">
                                 <i className="pi pi-upload mr-3 text-lg"></i>
                                 Subir Archivo PDF
                                 <input type="file" className="hidden" accept="application/pdf" onChange={(e) => handleUpload(e, 'datasheet')} />
                             </label>
                         )}
                         <p className="text-[10px] text-slate-400 mt-4 leading-relaxed mt-auto">Recomendado PDF. Peso máximo 5MB. Este archivo será vital para los procesos de compras y MRP.</p>
                      </div>
                  )} />
               </div>
            </div>

            {/* TAB 3: EMPAQUES LOGISTICOS (REQUIRES ID) */}
            <div className={activeTab === _tabs.findIndex(t => t.label === 'Empaques Logísticos') ? 'block' : 'hidden animate-fade-in'}>
               {!editId ? (
                   <div className="text-center p-12 text-slate-500">
                     <i className="pi pi-lock text-4xl mb-4 opacity-50 block"></i>
                     Guarda el producto primero para asignar Empaques Logísticos
                   </div>
               ) : (
                <>
                  <div className="flex justify-between items-center mb-4 mt-2">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Cubicaje y Transformaciones</h3>
                      <p className="text-slate-500 text-sm">Ej. 1 Bulto contiene 24 Cajas. 1 Caja contiene 12 Unidades.</p>
                    </div>
                    <Button type="button" label="Añadir Esclavo Volumétrico" icon="pi pi-plus" onClick={() => appendPackaging({ name: '', qty_per_unit: 1, weight_kg: 0, volume_m3: 0 })} className="!bg-teal-50 !text-teal-700 hover:!bg-teal-100 !border-teal-200 !rounded-xl !px-4 !py-2 !shadow-none font-bold text-sm" />
                  </div>
                  <div className="bg-white border text-sm border-slate-200 rounded-2xl overflow-hidden">
                    <DataTable value={packagingsFields} responsiveLayout="scroll" emptyMessage={<span className="text-slate-400 p-6 block text-center font-medium">Bajo la unidad base configurada. Agrega empaques superiores.</span>}>
                      <Column header="NOMBRE DEL EMPAQUE" body={(rowData, options) => (
                        <Controller name={`packagings.${options.rowIndex}.name`} control={control} render={({ field }) => (
                          <InputText autoComplete="off" {...field} placeholder="Caja Maestra x12" className="w-full !rounded-lg border-slate-200 shadow-sm p-inputtext-sm focus:border-blue-400" />
                        )} />
                      )} />
                      <Column header="UNIDADES BASE CONTENIDAS" body={(rowData, options) => (
                        <Controller name={`packagings.${options.rowIndex}.qty_per_unit`} control={control} render={({ field }) => (
                          <InputNumber value={field.value} onValueChange={e => field.onChange(e.value)} inputClassName="p-inputtext-sm w-full font-bold !rounded-lg border-slate-200 shadow-sm" pt={{ root: { className: 'w-full' } }} />
                        )} />
                      )} />
                      <Column header="PESO (KG)" body={(rowData, options) => (
                        <Controller name={`packagings.${options.rowIndex}.weight_kg`} control={control} render={({ field }) => (
                          <InputNumber value={field.value} onValueChange={e => field.onChange(e.value)} maxFractionDigits={4} inputClassName="p-inputtext-sm w-full !rounded-lg border-slate-200 shadow-sm" pt={{ root: { className: 'w-full' } }} />
                        )} />
                      )} />
                      <Column header="VOLUMEN (M3)" body={(rowData, options) => (
                        <Controller name={`packagings.${options.rowIndex}.volume_m3`} control={control} render={({ field }) => (
                          <InputNumber value={field.value} onValueChange={e => field.onChange(e.value)} maxFractionDigits={4} inputClassName="p-inputtext-sm w-full !rounded-lg border-slate-200 shadow-sm" pt={{ root: { className: 'w-full' } }} />
                        )} />
                      )} />
                      <Column header="" body={(rowData, options) => (
                        <Button type="button" icon="pi pi-trash" rounded text severity="danger" onClick={() => removePackaging(options.rowIndex)} />
                      )} style={{ width: '4rem' }} />
                    </DataTable>
                  </div>
                </>
               )}
            </div>

            {/* TAB 4: CODIGOS ADICIONALES (REQUIRES ID) */}
            <div className={activeTab === _tabs.findIndex(t => t.label === 'Códigos Multi-Unidad') ? 'block' : 'hidden animate-fade-in'}>
               {!editId ? (
                   <div className="text-center p-12 text-slate-500">
                     <i className="pi pi-barcode text-4xl mb-4 opacity-50 block"></i>
                     Guarda el producto para asignar Códigos de Barras Universales
                   </div>
               ) : (
                <>
                  <div className="flex justify-between items-center mb-4 mt-2">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Lecturas de Punto de Venta / WMS</h3>
                      <p className="text-slate-500 text-sm">Escanea cada código EAN y atalo al nivel logístico correcto.</p>
                    </div>
                    <Button type="button" label="Pistolear Código" icon="pi pi-window-maximize" onClick={() => appendBarcode({ barcode: '', code_type: 'EAN', uom: 'PZA', conversion_factor: 1 })} className="!bg-indigo-50 !text-indigo-700 hover:!bg-indigo-100 !border-indigo-200 !rounded-xl !px-4 !py-2 !shadow-none font-bold text-sm" />
                  </div>
                  <div className="bg-white border text-sm border-slate-200 rounded-2xl overflow-hidden">
                    <DataTable value={barcodesFields} responsiveLayout="scroll" emptyMessage={<span className="text-slate-400 p-6 block text-center font-medium">No se han registrado códigos alternativos.</span>}>
                      <Column header="CÓDIGO ALFANUMÉRICO (EAN/UPC)" body={(rowData, options) => (
                        <Controller name={`barcodes.${options.rowIndex}.barcode`} control={control} render={({ field }) => (
                          <InputText autoComplete="off" {...field} placeholder="Escanea..." autoFocus={options.rowIndex === barcodesFields.length -1} className="w-full !rounded-lg font-mono tracking-widest border-slate-200 shadow-sm p-inputtext-sm focus:border-blue-400" />
                        )} />
                      )} />
                      <Column header="TIPO O DESCRIPCIÓN" body={(rowData, options) => (
                        <Controller name={`barcodes.${options.rowIndex}.code_type`} control={control} render={({ field }) => (
                          <InputText autoComplete="off" {...field} placeholder="Ej. EAN-13, Bulto, Interno" className="w-full !rounded-lg border-slate-200 shadow-sm p-inputtext-sm focus:border-blue-400" />
                        )} />
                      )} />
                      <Column header="TIPO DE CONTENIDO AL ESCANEAR" body={(rowData, options) => (
                        <div className="flex gap-2 items-center">
                          <Controller name={`barcodes.${options.rowIndex}.uom`} control={control} render={({ field }) => (
                            <Dropdown value={field.value} onChange={(e) => field.onChange(e.value)} options={[{label: 'PZA (Pieza)', value: 'PZA'}, {label: 'CAJA', value: 'CAJA'}]} className="w-full p-inputtext-sm !rounded-lg border-slate-200" />
                          )} />
                          <i className="pi pi-arrow-right text-slate-300 text-xs"></i>
                          <Controller name={`barcodes.${options.rowIndex}.conversion_factor`} control={control} render={({ field }) => (
                            <InputNumber value={field.value} onValueChange={(e) => field.onChange(e.value)} inputClassName="w-16 p-inputtext-sm !rounded-lg border-slate-200 text-center font-bold text-blue-700 bg-blue-50" />
                          )} />
                          <span className="text-xs text-slate-500 font-bold">Base</span>
                        </div>
                      )} />
                      <Column header="" body={(rowData, options) => (
                        <Button type="button" icon="pi pi-trash" rounded text severity="danger" onClick={() => removeBarcode(options.rowIndex)} />
                      )} style={{ width: '4rem' }} />
                    </DataTable>
                  </div>
                </>
               )}
            </div>

            {/* TAB 5: VARIANTES (Condicional Has Variants + Requires ID) */}
            {hasVariants && (
              <div className={activeTab === _tabs.findIndex(t => t.label === 'Matriz de Variantes') ? 'block' : 'hidden animate-fade-in'}>
                 {!editId ? (
                   <div className="text-center p-12 text-slate-500">
                     <i className="pi pi-table text-4xl mb-4 opacity-50 block"></i>
                     Guarda el producto estructural padre primero para habilitar el Motor Cartesiano de Variantes
                   </div>
                 ) : (
                    <div>
                     <div className="bg-white border text-sm border-slate-200 rounded-2xl overflow-hidden p-6 mb-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                           <i className="pi pi-box text-2xl text-purple-600"></i>
                           <div>
                             <h3 className="text-lg font-bold text-slate-800">Motor Cartesiano (Atributos Dimensionales)</h3>
                             <p className="text-slate-500 text-xs mt-1">Defina los ejes lógicos (Ej. Talla, Color). La matriz cruzará estadísticamente todas las variables generando SKUs atómicos únicos para que almacén pueda gestionar ubicaciones y precios exactos.</p>
                           </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {dimensions.map((dim, i) => (
                                <div key={i} className="flex flex-col gap-2 p-5 bg-slate-50 border border-slate-200 shadow-inner rounded-xl">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center justify-between">
                                        Eje Dimensional {i + 1}
                                        {i >= 2 && <i className="pi pi-times text-red-400 cursor-pointer hover:text-red-600" onClick={() => {
                                            const newD = [...dimensions];
                                            newD.splice(i, 1);
                                            setDimensions(newD);
                                        }}></i>}
                                    </label>
                                    <InputText value={dim.name} onChange={(e) => {
                                        const newD = [...dimensions];
                                        newD[i].name = e.target.value;
                                        setDimensions(newD);
                                    }} placeholder="Ej. Talla, Color, Sabor" className="!rounded-lg p-inputtext-sm font-bold text-slate-700" />
                                    
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-3">Valores Ramificados (Chips)</label>
                                    <Chips value={dim.values} onChange={(e) => {
                                        const newD = [...dimensions];
                                        newD[i].values = (e.value || []) as string[];
                                        setDimensions(newD);
                                    }} placeholder="Escriba y presione Enter..." className="w-full text-sm [&_.p-chips-token]:!bg-purple-100 [&_.p-chips-token]:!text-purple-800 [&_.p-chips-token]:!font-bold [&_.p-chips-token]:!text-xs" pt={{ container: { className: '!rounded-lg !border-slate-200 focus:!border-purple-400 shadow-sm' } }} />
                                </div>
                            ))}
                            
                            <div className="flex flex-col justify-center items-center gap-2 p-4 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 text-slate-400 hover:text-purple-500 hover:border-purple-200 transition-colors" onClick={() => {
                                setDimensions([...dimensions, { name: '', values: [] }]);
                            }}>
                                <i className="pi pi-plus-circle text-2xl mb-1"></i>
                                <span className="font-bold text-sm tracking-wide">Añadir Dimensión Extra</span>
                            </div>
                        </div>

                        <Button type="button" icon="pi pi-bolt" label="Generar Matriz Combinatoria Euclidiana" onClick={generateCartesian} className="mt-6 !bg-purple-600 hover:!bg-purple-700 !border-none !text-white !font-extrabold !rounded-xl !px-6 !py-3 w-full shadow-lg shadow-purple-500/30 text-sm tracking-wide" />
                     </div>
                     
                     {generatedVariants.length > 0 && (
                         <div className="bg-white border text-sm border-slate-200 rounded-2xl overflow-hidden shadow-md">
                             <div className="bg-gradient-to-r from-slate-100 to-slate-50 border-b border-slate-200 p-4 shrink-0 flex items-center justify-between">
                               <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                  <i className="pi pi-th-large text-slate-400 text-xl"></i>
                                  Explorador de Variantes SKUs ({generatedVariants.length})
                               </h3>
                               <Button type="button" label="Inyectar Matriz a PostgreSQL" icon="pi pi-cloud-upload" loading={isSavingVariants} onClick={saveVariantsBatch} className="!bg-emerald-600 hover:!bg-emerald-700 !border-none !text-white !font-bold !rounded-xl !px-6 !py-2 !text-sm shadow-md shadow-emerald-500/30" />
                             </div>
                             
                             <div className="max-h-[600px] overflow-auto">
                               <DataTable value={generatedVariants} responsiveLayout="scroll" className="text-sm p-datatable-sm" stripedRows>
                                  <Column header="ATRIBUTOS CRUZADOS" body={(r) => (
                                      <div className="flex gap-2 flex-wrap">
                                          {Object.entries(r.attributes || {}).map(([k, v]: any) => (
                                              <span key={k} className="bg-white shadow-sm border border-slate-200 text-slate-700 text-xs font-extrabold px-3 py-1 rounded-lg">
                                                 <span className="text-slate-400 font-normal mr-1">{k}:</span>{v}
                                              </span>
                                          ))}
                                      </div>
                                  )} style={{ width: '25%' }} />
                                  
                                  <Column header="SKU INMUTABLE" body={(r, opt) => (
                                      <InputText value={r.sku} onChange={(e) => {
                                          const nV = [...generatedVariants];
                                          nV[opt.rowIndex].sku = e.target.value;
                                          setGeneratedVariants(nV);
                                      }} className="w-full !rounded-lg font-mono text-xs tracking-widest text-indigo-800 !bg-indigo-50/50 !border-indigo-100" />
                                  )} style={{ width: '20%' }} />
                                  
                                  <Column header="COSTO BASE" body={(r, opt) => (
                                      <InputNumber value={r.standard_cost} onValueChange={(e) => {
                                          const nV = [...generatedVariants];
                                          nV[opt.rowIndex].standard_cost = e.value;
                                          setGeneratedVariants(nV);
                                      }} inputClassName="w-full !rounded-lg text-center font-mono" mode="currency" currency="USD" locale="en-US" />
                                  )} style={{ width: '15%' }} />
                                  
                                  <Column header="PRECIO FINAL" body={(r, opt) => (
                                      <InputNumber value={r.sales_price} onValueChange={(e) => {
                                          const nV = [...generatedVariants];
                                          nV[opt.rowIndex].sales_price = e.value;
                                          setGeneratedVariants(nV);
                                      }} inputClassName="w-full !rounded-lg text-center font-extrabold text-emerald-700 !bg-emerald-50/50 !border-emerald-200" mode="currency" currency="USD" locale="en-US" />
                                  )} style={{ width: '15%' }} />
                                  
                                  <Column header="CÓDIGO DE BARRAS C.P" body={(r, opt) => (
                                      <InputText value={r.barcode || ''} onChange={(e) => {
                                          const nV = [...generatedVariants];
                                          nV[opt.rowIndex].barcode = e.target.value;
                                          setGeneratedVariants(nV);
                                      }} className="w-full !rounded-lg font-mono text-xs" placeholder="Escanear..." />
                                  )} style={{ width: '20%' }} />
                                  
                                  <Column body={(r, opt) => (
                                      <Button type="button" icon="pi pi-trash" rounded text severity="danger" onClick={() => {
                                          const nV = [...generatedVariants];
                                          nV.splice(opt.rowIndex, 1);
                                          setGeneratedVariants(nV);
                                      }} className="hover:!bg-red-50" />
                                  )} style={{ width: '5%' }} />
                               </DataTable>
                             </div>
                         </div>
                     )}
                    </div>
                 )}
              </div>
            )}

            {/* TAB: PROVEEDORES */}
            <div className={activeTab === _tabs.findIndex(t => t.label === 'Proveedores') ? 'block' : 'hidden animate-fade-in'}>
               {!editId ? (
                   <div className="text-center p-12 text-slate-500">
                     <i className="pi pi-truck text-4xl mb-4 opacity-50 block"></i>
                     Guarda el producto estructural primero para visualizar y contactar proveedores.
                   </div>
               ) : (
                   <ProductSuppliersTab productId={Number(editId)} ref={suppliersRef} />
               )}
            </div>

            <div className={`flex justify-end gap-3 mt-10 border-t pt-6 ${!editId ? 'border-orange-100' : 'border-slate-100'}`}>
              <Button 
                type="button" 
                label="Descartar" 
                onClick={() => router.push('/products')} 
                className="!bg-white !text-slate-600 !border !border-slate-200 hover:!bg-slate-100 !rounded-xl !px-6 !py-3 font-bold transition-colors shadow-sm" 
              />
              <Button 
                type="submit" 
                label={editId ? "Guardar" : "Generar Producto Padre (Paso 1)"} 
                icon={editId ? "pi pi-check" : "pi pi-arrow-right"} 
                loading={isSaving}
                className={!editId 
                   ? "!bg-gradient-to-r !from-orange-500 !to-red-500 hover:!from-orange-600 hover:!to-red-600 !border-none !text-white !rounded-xl !px-8 !py-3 !shadow-lg shadow-orange-500/30 transition-all font-bold" 
                   : "!bg-gradient-to-r !from-blue-600 !to-indigo-600 hover:!from-blue-700 hover:!to-indigo-700 !border-none !text-white !rounded-xl !px-6 !py-2.5 !text-sm !shadow-lg !shadow-blue-500/30 transition-all font-bold"
                } 
              />
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function NewProductPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-400 animate-pulse font-bold">Compilando arquitectura maestra...</div>}>
      <ProductFormContent />
    </Suspense>
  );
}
