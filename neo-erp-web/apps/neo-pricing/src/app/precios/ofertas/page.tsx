'use client';
import { useState, useEffect } from 'react';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { ProgressBar } from 'primereact/progressbar';
import { Checkbox } from 'primereact/checkbox';
import { AutoComplete } from 'primereact/autocomplete';
import { TabView, TabPanel } from 'primereact/tabview';
import { ProductService } from '@/services/product.service';
import { useRouter } from 'next/navigation';

export default function PlanificarOfertasPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Tab control
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  // Step 1: Scope
  const [selectedSuppliers, setSelectedSuppliers] = useState<number[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<any[]>([]); // Array of variant objects
  const [selectedFacilities, setSelectedFacilities] = useState<number[]>([]);
  const [applyAllFacilities, setApplyAllFacilities] = useState(true);

  // Step 2: Details
  const [campaignName, setCampaignName] = useState<string>('');
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [discountPct, setDiscountPct] = useState<string>('');
  const [fixedPrice, setFixedPrice] = useState<string>('');
  const [startAt, setStartAt] = useState<string>('');
  const [endAt, setEndAt] = useState<string>('');

  // Step 3: Preview
  const [products, setProducts] = useState<any[]>([]);
  const [simulatedRows, setSimulatedRows] = useState<any[]>([]);
  const [selectedSimulationRows, setSelectedSimulationRows] = useState<any[]>([]);

  // Metadata
  const [categoryOptions, setCategoryOptions] = useState<any[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<any[]>([]);
  const [facilityOptions, setFacilityOptions] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const loadCampaigns = async () => {
    try {
      const list = await ProductService.getPromotionCampaigns();
      setCampaigns(list || []);
    } catch (err) {
      console.error('Error loading campaigns:', err);
    }
  };

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        setLoading(true);
        const [cats, sups, facs] = await Promise.all([
          ProductService.getCategories(),
          ProductService.getSuppliers(),
          ProductService.getFacilities()
        ]);
        setCategoryOptions(cats?.data || cats || []);
        setSupplierOptions(sups?.data || sups || []);
        setFacilityOptions(facs?.data || facs || []);
        
        await loadCampaigns();
      } catch (err) {
        console.error('Error loading metadata:', err);
      } finally {
        setLoading(false);
      }
    };
    loadMetadata();
  }, []);

  const searchVariants = async (event: { query: string }) => {
    try {
      const res = await ProductService.getProducts(0, 50, event.query);
      const list = res?.data || [];
      const vars: any[] = [];
      list.forEach((p: any) => {
        const vList = p.variants || [];
        vList.forEach((v: any) => {
          const sku = v.sku || p.sku || 'N/A';
          const name = `${p.name} - [${sku}]`;
          if (name.toLowerCase().includes(event.query.toLowerCase()) || sku.toLowerCase().includes(event.query.toLowerCase())) {
            vars.push({
              id: v.id,
              sku: sku,
              name: name,
              regular_price: Number(v.sales_price || p.sales_price || 0),
              replacement_cost: Number(v.replacement_cost || p.replacement_cost || 0),
              product_name: p.name,
              category_id: p.category_id
            });
          }
        });
      });
      setSuggestions(vars);
    } catch (err) {
      console.error('Error searching variants:', err);
    }
  };

  // Sync apply all facilities
  useEffect(() => {
    if (applyAllFacilities && facilityOptions.length > 0) {
      setSelectedFacilities(facilityOptions.map(f => f.id));
    }
  }, [applyAllFacilities, facilityOptions]);

  const handleNextStep1 = () => {
    if (selectedSuppliers.length === 0 && selectedCategories.length === 0 && selectedVariants.length === 0) {
      setErrorMessage('Debe seleccionar al menos un Proveedor, una Categoría o Producto(s) específico(s) para definir el alcance.');
      return;
    }
    if (selectedFacilities.length === 0) {
      setErrorMessage('Debe seleccionar al menos una Sucursal.');
      return;
    }
    setErrorMessage('');
    setStep(2);
  };

  const handleNextStep2 = async () => {
    if (!campaignName.trim()) {
      setErrorMessage('Debe ingresar un nombre o descripción para identificar esta planificación de ofertas.');
      return;
    }
    if (!startAt || !endAt) {
      setErrorMessage('Debe definir la fecha de inicio y fin de vigencia para la promoción.');
      return;
    }
    if (new Date(startAt) >= new Date(endAt)) {
      setErrorMessage('La fecha de fin debe ser posterior a la fecha de inicio.');
      return;
    }
    if (discountType === 'PERCENT' && (!discountPct || Number(discountPct) <= 0 || Number(discountPct) > 100)) {
      setErrorMessage('Debe ingresar un porcentaje de descuento válido (entre 1% y 100%).');
      return;
    }
    if (discountType === 'FIXED' && (!fixedPrice || Number(fixedPrice) <= 0)) {
      setErrorMessage('Debe ingresar un precio fijo de oferta válido mayor a 0.');
      return;
    }

    setErrorMessage('');
    setStep(3);
    await loadSimulation();
  };

  const loadSimulation = async () => {
    try {
      setLoading(true);
      const rows: any[] = [];
      
      if (selectedVariants.length > 0) {
        // Map from pre-selected variant details directly (no extra API calls!)
        selectedVariants.forEach((v: any) => {
          const regularPrice = v.regular_price;
          const repCost = v.replacement_cost;

          let simulatedPromoPrice = 0;
          if (discountType === 'FIXED') {
            simulatedPromoPrice = Number(fixedPrice);
          } else {
            simulatedPromoPrice = regularPrice * (1 - Number(discountPct) / 100);
          }

          let simulatedUtility = 0;
          if (simulatedPromoPrice > 0) {
            simulatedUtility = ((simulatedPromoPrice - repCost) / simulatedPromoPrice) * 100;
          }

          rows.push({
            variant_id: v.id,
            sku: v.sku,
            product_name: v.product_name,
            category: categoryOptions.find(c => c.id === v.category_id)?.name || 'Sin Categoría',
            category_id: v.category_id,
            regular_price: regularPrice,
            replacement_cost: repCost,
            promo_price: simulatedPromoPrice.toFixed(2),
            promo_utility: simulatedUtility
          });
        });
      } else {
        const res = await ProductService.getProducts(0, 2000, '', selectedCategories, selectedSuppliers);
        const list = res?.data || [];
        list.forEach((p: any) => {
          const vars = p.variants || [];
          vars.forEach((v: any) => {
            const regularPrice = Number(v.sales_price || p.sales_price || 0);
            const repCost = Number(v.replacement_cost || p.replacement_cost || 0);

            let simulatedPromoPrice = 0;
            if (discountType === 'FIXED') {
              simulatedPromoPrice = Number(fixedPrice);
            } else {
              simulatedPromoPrice = regularPrice * (1 - Number(discountPct) / 100);
            }

            let simulatedUtility = 0;
            if (simulatedPromoPrice > 0) {
              simulatedUtility = ((simulatedPromoPrice - repCost) / simulatedPromoPrice) * 100;
            }

            rows.push({
              variant_id: v.id,
              sku: v.sku || p.sku || 'N/A',
              product_name: p.name,
              category: categoryOptions.find(c => c.id === p.category_id)?.name || 'Sin Categoría',
              category_id: p.category_id,
              regular_price: regularPrice,
              replacement_cost: repCost,
              promo_price: simulatedPromoPrice.toFixed(2),
              promo_utility: simulatedUtility
            });
          });
        });
      }
      setSimulatedRows(rows);
      setSelectedSimulationRows(rows); // Select all by default
    } catch (err) {
      console.error('Error loading simulation:', err);
      setErrorMessage('Error al cargar la simulación de precios.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPromotion = async () => {
    if (selectedSimulationRows.length === 0) {
      setErrorMessage('Debe seleccionar al menos un producto en la tabla de simulación.');
      return;
    }
    
    try {
      setSaving(true);
      setErrorMessage('');
      setSuccessMessage('');

      const payload = {
        name: campaignName.trim(),
        supplier_ids: selectedSuppliers,
        category_ids: selectedCategories,
        facility_ids: selectedFacilities,
        variant_ids: selectedSimulationRows.map(r => r.variant_id),
        discount_pct: discountType === 'PERCENT' ? Number(discountPct) : null,
        fixed_price: discountType === 'FIXED' ? Number(fixedPrice) : null,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        custom_prices: selectedSimulationRows.map(r => ({
          variant_id: r.variant_id,
          promo_price: Number(r.promo_price)
        }))
      };

      const result = await ProductService.applyBulkPromotion(payload);
      setSuccessMessage(`¡Oferta masiva "${campaignName}" aplicada con éxito! Se actualizaron precios para ${result.updated_count || 0} combinaciones.`);
      await loadCampaigns();
      setStep(4); // completion step
    } catch (err: any) {
      console.error('Error applying bulk promotion:', err);
      setErrorMessage(err?.response?.data?.detail || 'Error crítico al aplicar la promoción en lote.');
    } finally {
      setSaving(false);
    }
  };

  const handleVoidCampaign = async (id: number) => {
    try {
      setLoading(true);
      setErrorMessage('');
      await ProductService.voidPromotionCampaign(id);
      setSuccessMessage('¡Campaña de ofertas anulada con éxito!');
      await loadCampaigns();
    } catch (err: any) {
      console.error('Error voiding campaign:', err);
      setErrorMessage(err?.response?.data?.detail || 'Error al intentar anular la campaña.');
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateCampaign = (campaign: any) => {
    const scope = campaign.scope || {};
    setSelectedSuppliers(scope.supplier_ids || []);
    setSelectedCategories(scope.category_ids || []);
    
    // Attempt mapping preselected variants if any exist
    if (scope.variant_ids && scope.variant_ids.length > 0) {
      // Map variants array objects from database details or dummy mappings
      const dummyMapped = (scope.variant_ids || []).map((vid: number) => ({
        id: vid,
        sku: 'Cargado',
        name: `ID Variante: ${vid}`,
        regular_price: 0,
        replacement_cost: 0,
        product_name: `Variante ID ${vid}`,
        category_id: 0
      }));
      setSelectedVariants(dummyMapped);
    } else {
      setSelectedVariants([]);
    }

    setApplyAllFacilities(false);
    setSelectedFacilities(scope.facility_ids || []);
    setDiscountType(scope.fixed_price !== null ? 'FIXED' : 'PERCENT');
    setDiscountPct(scope.discount_pct !== null ? scope.discount_pct.toString() : '');
    setFixedPrice(scope.fixed_price !== null ? scope.fixed_price.toString() : '');
    
    const formatDateForInput = (dateStr: string) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      // local ISO format slice
      const tzOffset = d.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
      return localISOTime;
    };

    if (scope.start_at) setStartAt(formatDateForInput(scope.start_at));
    if (scope.end_at) setEndAt(formatDateForInput(scope.end_at));
    
    setCampaignName(`Copia de ${campaign.name}`);
    
    // Go to step 1 of wizard
    setStep(1);
    setActiveTabIndex(0);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const resetWizard = () => {
    setStep(1);
    setSelectedSuppliers([]);
    setSelectedCategories([]);
    setSelectedVariants([]);
    setSelectedSimulationRows([]);
    setApplyAllFacilities(true);
    setCampaignName('');
    setDiscountPct('');
    setFixedPrice('');
    setStartAt('');
    setEndAt('');
    setProducts([]);
    setSimulatedRows([]);
    setSuccessMessage('');
    setErrorMessage('');
  };

  return (
    <div className="w-full max-w-[1200px] mx-auto py-6 px-4">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
          <span className="text-2xl">🏷️</span> Planificar Ofertas Masivas
        </h1>
        <p className="text-slate-500 mt-1 font-medium">Asistente de configuración para aplicar precios de oferta a múltiples productos por proveedor, categoría y tienda.</p>
      </div>

      {errorMessage && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl font-medium text-sm flex items-center gap-3">
          <i className="pi pi-exclamation-circle text-lg"></i>
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && step !== 4 && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-medium text-sm flex items-center gap-3">
          <i className="pi pi-check-circle text-lg"></i>
          <span>{successMessage}</span>
        </div>
      )}

      {loading && (
        <div className="mb-6">
          <ProgressBar mode="indeterminate" style={{ height: '6px' }} color="#f43f5e" className="rounded-full" />
        </div>
      )}

      <TabView activeIndex={activeTabIndex} onTabChange={(e) => setActiveTabIndex(e.index)} className="mt-4">
        <TabPanel header="⚡ Crear Nueva Oferta" leftIcon="pi pi-plus-circle mr-2">
          {/* Progress Wizard Header */}
          {step < 4 && (
            <div className="flex justify-between items-center mb-8 bg-slate-50 p-4 rounded-2xl border border-slate-100 max-w-xl mx-auto mt-4">
              <div className="flex items-center gap-2">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= 1 ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-500'}`}>1</span>
                <span className={`text-xs font-bold ${step >= 1 ? 'text-slate-800' : 'text-slate-400'}`}>Alcance</span>
              </div>
              <div className="h-0.5 w-12 bg-slate-200 flex-1 mx-2"></div>
              <div className="flex items-center gap-2">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= 2 ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
                <span className={`text-xs font-bold ${step >= 2 ? 'text-slate-800' : 'text-slate-400'}`}>Detalles</span>
              </div>
              <div className="h-0.5 w-12 bg-slate-200 flex-1 mx-2"></div>
              <div className="flex items-center gap-2">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= 3 ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-500'}`}>3</span>
                <span className={`text-xs font-bold ${step >= 3 ? 'text-slate-800' : 'text-slate-400'}`}>Vista Previa</span>
              </div>
            </div>
          )}

          {/* STEP 1: SCOPE */}
          {step === 1 && (
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-6">
              <h2 className="text-xl font-extrabold text-slate-800">1. Seleccionar Alcance de la Oferta</h2>
              <p className="text-slate-500 text-sm">Filtre los productos a los que se aplicará la promoción seleccionando proveedores, departamentos o categorías específicas.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Proveedores (Opcional si elige categorías)</label>
                  <MultiSelect
                    value={selectedSuppliers}
                    options={supplierOptions}
                    onChange={(e) => setSelectedSuppliers(e.value)}
                    optionLabel="name"
                    optionValue="id"
                    placeholder="Todos los proveedores..."
                    filter
                    className="w-full border-slate-200 bg-slate-50 rounded-xl text-sm"
                    display="chip"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Categorías / Departamentos (Opcional si elige proveedores)</label>
                  <MultiSelect
                    value={selectedCategories}
                    options={categoryOptions}
                    onChange={(e) => setSelectedCategories(e.value)}
                    optionLabel="name"
                    optionValue="id"
                    placeholder="Todas las categorías..."
                    filter
                    className="w-full border-slate-200 bg-slate-50 rounded-xl text-sm"
                    display="chip"
                  />
                </div>
              </div>

              {/* Direct Variant Selection (AutoComplete for high performance) */}
              <div className="flex flex-col gap-2 border-t border-slate-100 pt-6">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Productos Específicos (Opcional - Omite filtros masivos si se seleccionan productos aquí)</label>
                <AutoComplete
                  value={selectedVariants}
                  suggestions={suggestions}
                  completeMethod={searchVariants}
                  field="name"
                  multiple
                  placeholder="Escribe el nombre o SKU para buscar y seleccionar productos específicos (agrega múltiples de cualquier marca)..."
                  className="w-full text-sm"
                  inputClassName="bg-slate-50 border-slate-200 w-full p-3 rounded-xl"
                  onChange={(e) => setSelectedVariants(e.value)}
                />
              </div>

              <div className="border-t border-slate-100 pt-6 flex flex-col gap-4">
                <h3 className="font-bold text-slate-700">Sucursales / Tiendas Destino</h3>

                <div className="flex items-center gap-2 select-none">
                  <Checkbox
                    inputId="applyAll"
                    checked={applyAllFacilities}
                    onChange={(e) => setApplyAllFacilities(e.checked || false)}
                  />
                  <label htmlFor="applyAll" className="text-sm font-bold text-slate-700 cursor-pointer">Aplicar a todas las sucursales activas</label>
                </div>

                {!applyAllFacilities && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Seleccionar Tiendas</label>
                    <MultiSelect
                      value={selectedFacilities}
                      options={facilityOptions}
                      onChange={(e) => setSelectedFacilities(e.value)}
                      optionLabel="name"
                      optionValue="id"
                      placeholder="Seleccione sucursales..."
                      className="w-full border-slate-200 bg-slate-50 rounded-xl text-sm"
                      display="chip"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-6">
                <Button
                  label="Siguiente (Definir Descuentos)"
                  icon="pi pi-arrow-right"
                  iconPos="right"
                  className="!bg-rose-500 hover:!bg-rose-600 border-none px-6 py-3 rounded-xl font-bold shadow-md shadow-rose-100"
                  onClick={handleNextStep1}
                />
              </div>
            </div>
          )}

          {/* STEP 2: DETAILS */}
          {step === 2 && (
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-6">
              <h2 className="text-xl font-extrabold text-slate-800">2. Detalles y Nombre de la Oferta</h2>
              <p className="text-slate-500 text-sm">Configure el porcentaje de descuento o precio fijo, vigencia y asigne un nombre identificador a esta campaña.</p>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre / Descripción de la Planificación</label>
                <InputText
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="Ej: Oferta Día de la Madre 15% Descuento"
                  className="w-full bg-slate-50 border-slate-200 rounded-xl p-3"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-100 pt-6">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vigencia: Desde</label>
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-rose-500 text-slate-700 font-medium"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vigencia: Hasta</label>
                  <input
                    type="datetime-local"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-rose-500 text-slate-700 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-100 pt-6">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Esquema de Descuento</label>
                  <Dropdown
                    value={discountType}
                    options={[
                      { label: 'Porcentaje de Descuento (Neto)', value: 'PERCENT' },
                      { label: 'Precio Neto Fijo Oferta', value: 'FIXED' }
                    ]}
                    onChange={(e) => setDiscountType(e.value)}
                    className="w-full bg-slate-50 border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  {discountType === 'PERCENT' ? (
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Porcentaje Descuento (1% al 100%)</label>
                      <InputText
                        value={discountPct}
                        onChange={(e) => setDiscountPct(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="Ej. 15"
                        className="w-full bg-slate-50 border-slate-200 rounded-xl"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Precio Oferta Neto Fijo (USD sin IVA)</label>
                      <InputText
                        value={fixedPrice}
                        onChange={(e) => setFixedPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                        placeholder="Ej. 9.99"
                        className="w-full bg-slate-50 border-slate-200 rounded-xl"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between gap-3 border-t border-slate-100 pt-6">
                <Button
                  label="Atrás"
                  icon="pi pi-arrow-left"
                  severity="secondary"
                  text
                  onClick={() => setStep(1)}
                  className="rounded-xl font-bold"
                />
                <Button
                  label="Siguiente (Vista Previa)"
                  icon="pi pi-arrow-right"
                  iconPos="right"
                  className="!bg-rose-500 hover:!bg-rose-600 border-none px-6 py-3 rounded-xl font-bold shadow-md shadow-rose-100"
                  onClick={handleNextStep2}
                />
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW */}
          {step === 3 && (
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-6">
              <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-800">3. Vista Previa y Edición Manual de Precios</h2>
                  <p className="text-slate-500 text-sm mt-1">Modifique los precios directamente en la grilla y desmarque los productos que no desee ofertar.</p>
                </div>
                <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-2 text-right">
                  <span className="text-[10px] font-bold text-rose-500 uppercase block leading-none">Promoción Planificada</span>
                  <span className="text-lg font-black text-rose-700">
                    {discountType === 'PERCENT' ? `${discountPct}% de desc.` : `$${fixedPrice} fijo`}
                  </span>
                </div>
              </div>

              {/* Details list */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
                <div>
                  <span className="font-semibold text-slate-400 uppercase tracking-wider block">Campaña:</span>
                  <span className="font-bold text-slate-700">{campaignName}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-400 uppercase tracking-wider block">Vigencia:</span>
                  <span className="font-bold text-slate-700">{new Date(startAt).toLocaleString()} - {new Date(endAt).toLocaleString()}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-400 uppercase tracking-wider block">Tiendas Afectadas:</span>
                  <span className="font-bold text-slate-700">
                    {applyAllFacilities
                      ? 'Todas las sucursales'
                      : selectedFacilities.map(id => facilityOptions.find(f => f.id === id)?.name).join(', ')}
                  </span>
                </div>
              </div>

              <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                <DataTable
                  value={simulatedRows}
                  selection={selectedSimulationRows}
                  onSelectionChange={(e) => setSelectedSimulationRows(e.value)}
                  paginator
                  rows={10}
                  className="p-datatable-sm text-xs"
                  emptyMessage="No hay productos que coincidan con la selección."
                  rowHover
                  dataKey="variant_id"
                >
                  <Column selectionMode="multiple" headerStyle={{ width: '3rem' }}></Column>
                  <Column field="sku" header="SKU" className="font-mono font-bold text-slate-600"></Column>
                  <Column field="product_name" header="PRODUCTO" className="font-semibold text-slate-800"></Column>
                  <Column field="category" header="CATEGORÍA" className="text-slate-500"></Column>
                  <Column
                    header="REGULAR (NETO)"
                    body={(r) => <span className="font-semibold text-slate-600">${Number(r.regular_price).toFixed(2)}</span>}
                  ></Column>
                  <Column
                    header="OFERTA SIMULADA (NETO) ✏️"
                    body={(r) => (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">$</span>
                        <input
                          type="text"
                          value={r.promo_price}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            
                            // Reactively update simulated price and utility in rows!
                            const updated = simulatedRows.map(row => {
                              if (row.variant_id === r.variant_id) {
                                const price = Number(val) || 0;
                                const cost = Number(row.replacement_cost);
                                const utility = price > 0 ? ((price - cost) / price) * 100 : 0;
                                return { ...row, promo_price: val, promo_utility: utility };
                              }
                              return row;
                            });
                            setSimulatedRows(updated);

                            const updatedSel = selectedSimulationRows.map(row => {
                              if (row.variant_id === r.variant_id) {
                                const price = Number(val) || 0;
                                const cost = Number(row.replacement_cost);
                                const utility = price > 0 ? ((price - cost) / price) * 100 : 0;
                                return { ...row, promo_price: val, promo_utility: utility };
                              }
                              return row;
                            });
                            setSelectedSimulationRows(updatedSel);
                          }}
                          className="w-24 p-1 text-xs border border-slate-200 rounded font-bold text-rose-600 bg-rose-50/50 focus:bg-white text-center focus:outline-none focus:ring-1 focus:ring-rose-500"
                        />
                      </div>
                    )}
                  ></Column>
                  <Column
                    header="UTILIDAD SIMULADA"
                    body={(r) => {
                      const color = r.promo_utility >= 25 ? 'text-emerald-600' : 'text-amber-600';
                      return <span className={`font-bold ${color}`}>{Number(r.promo_utility).toFixed(2)}%</span>;
                    }}
                  ></Column>
                </DataTable>
              </div>

              <div className="flex justify-between gap-3 border-t border-slate-100 pt-6">
                <Button
                  label="Atrás"
                  icon="pi pi-arrow-left"
                  severity="secondary"
                  text
                  disabled={saving}
                  onClick={() => setStep(2)}
                  className="rounded-xl font-bold"
                />
                <Button
                  label={saving ? "Aplicando..." : "Confirmar y Aplicar Promoción"}
                  icon="pi pi-check-circle"
                  loading={saving}
                  className="!bg-emerald-600 hover:!bg-emerald-700 border-none px-6 py-3 rounded-xl font-bold shadow-md shadow-emerald-100"
                  onClick={handleApplyPromotion}
                />
              </div>
            </div>
          )}

          {/* STEP 4: SUCCESS/COMPLETION */}
          {step === 4 && (
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center gap-6 max-w-lg mx-auto py-12">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl">
                <i className="pi pi-check-circle"></i>
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800">¡Promoción Masiva Exitosa!</h2>
                <p className="text-slate-500 text-sm mt-2">{successMessage}</p>
              </div>
              <div className="flex gap-3 w-full">
                <Button
                  label="Planificar Nueva Oferta"
                  onClick={resetWizard}
                  className="w-full rounded-xl font-bold bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100/50"
                />
                <Button
                  label="Ver Productos"
                  onClick={() => router.push('/productos')}
                  className="w-full rounded-xl font-bold !bg-rose-500 hover:!bg-rose-600 border-none"
                />
              </div>
            </div>
          )}
        </TabPanel>

        <TabPanel header="📁 Historial de Campañas" leftIcon="pi pi-folder-open mr-2">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-6 mt-4">
            <div>
              <h2 className="text-xl font-extrabold text-slate-800">Historial de Campañas Planificadas</h2>
              <p className="text-slate-500 text-sm mt-1">Consulte las ofertas masivas aplicadas en el sistema, duplíquelas para reedición o anúlelas para restablecer precios.</p>
            </div>

            <DataTable
              value={campaigns}
              paginator
              rows={10}
              className="p-datatable-sm text-xs"
              emptyMessage="No hay campañas registradas en el historial."
              rowHover
              sortField="created_at"
              sortOrder={-1}
            >
              <Column field="name" header="CAMPAÑA" className="font-bold text-slate-800"></Column>
              <Column
                header="DESCUENTO/PRECIO"
                body={(r) => {
                  if (r.fixed_price !== null) return <span className="font-semibold text-slate-700">${Number(r.fixed_price).toFixed(2)} fijo</span>;
                  if (r.discount_pct !== null) return <span className="font-semibold text-rose-600">{Number(r.discount_pct).toFixed(0)}% desc.</span>;
                  return <span className="text-slate-400">Personalizado</span>;
                }}
              ></Column>
              <Column
                header="INICIO"
                body={(r) => <span>{new Date(r.start_at).toLocaleString()}</span>}
              ></Column>
              <Column
                header="FIN"
                body={(r) => <span>{new Date(r.end_at).toLocaleString()}</span>}
              ></Column>
              <Column
                header="ESTADO"
                body={(r) => (
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    r.status === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      : 'bg-slate-50 text-slate-400 border border-slate-100 line-through'
                  }`}>
                    {r.status === 'ACTIVE' ? 'Aprobada / Activa' : 'Anulada'}
                  </span>
                )}
              ></Column>
              <Column
                header="CREACIÓN"
                body={(r) => <span className="text-slate-400">{new Date(r.created_at).toLocaleString()}</span>}
              ></Column>
              <Column
                header="ACCIONES"
                align="center"
                body={(r) => (
                  <div className="flex gap-2 justify-center">
                    <Button
                      icon="pi pi-copy"
                      tooltip="Duplicar y Editar"
                      className="p-button-text p-button-sm text-indigo-600 hover:bg-indigo-50 rounded-lg"
                      onClick={() => handleDuplicateCampaign(r)}
                    />
                    {r.status === 'ACTIVE' && (
                      <Button
                        icon="pi pi-ban"
                        tooltip="Anular Oferta"
                        className="p-button-text p-button-sm text-rose-600 hover:bg-rose-50 rounded-lg"
                        onClick={() => handleVoidCampaign(r.id)}
                      />
                    )}
                  </div>
                )}
              ></Column>
            </DataTable>
          </div>
        </TabPanel>
      </TabView>
    </div>
  );
}
