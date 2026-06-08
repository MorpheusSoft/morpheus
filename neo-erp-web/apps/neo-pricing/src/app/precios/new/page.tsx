'use client';
import { useState, useEffect } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { useRouter } from 'next/navigation';
import { PricingService } from '@/services/pricing.service';
import { ProductService } from '@/services/product.service';
import { ProgressBar } from 'primereact/progressbar';

export default function NewPriceSessionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    source_type: 'FILTER_BULK',
    scope: 'GENERAL', // GENERAL or BRANCH
    facility_ids: [] as number[]
  });

  const [facilityOptions, setFacilityOptions] = useState<any[]>([]);

  useEffect(() => {
    const loadMetadata = async () => {
      // 1. Load Facilities
      try {
        const facs = await ProductService.getFacilities();
        console.log('Loaded facilities:', facs);
        setFacilityOptions(facs?.data || facs?.items || (Array.isArray(facs) ? facs : []));
      } catch (err) {
        console.error('Error loading facilities:', err);
      }
    };
    loadMetadata();
  }, []);

  const scopes = [
    { label: 'General (Toda la Cadena)', value: 'GENERAL' },
    { label: 'Localidad Específica (Sucursal)', value: 'BRANCH' }
  ];

  const sourceTypes = [
    {
      value: 'FILTER_BULK',
      label: 'Asistente en Lote (Manual)',
      description: 'Define incrementos o disminuciones por marcas, proveedores o variantes.',
      icon: 'pi-sparkles',
      color: 'border-emerald-200 hover:border-emerald-400 bg-emerald-50/20 text-emerald-700'
    },
    {
      value: 'CSV_UPLOAD',
      label: 'Plantilla de Precios (CSV)',
      description: 'Carga una lista de nuevos PVPs directamente desde un archivo plano CSV.',
      icon: 'pi-file-excel',
      color: 'border-blue-200 hover:border-blue-400 bg-blue-50/20 text-blue-700'
    }
  ];

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    try {
      setLoading(true);
      // We append the scope details to the name for clear auditing
      const selectedNames = form.scope === 'BRANCH' && form.facility_ids.length > 0
        ? form.facility_ids.map(id => facilityOptions.find(f => f.id === id)?.name || 'Desconocida').join(', ')
        : '';
      const finalName = selectedNames
        ? `${form.name} - [Sucursales: ${selectedNames}]`
        : form.name;

      const res = await PricingService.createSession({
        name: finalName,
        source_type: form.source_type,
        target_cost_type: 'REPLACEMENT', // Default cost context for prices
        update_type: 'PRICE'
      });

      if (res && res.id) {
        router.push(`/${res.id}`);
      }
    } catch (err) {
      console.error('Error creating price session:', err);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-12 px-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100">
        
        {/* Header */}
        <div className="mb-8 flex items-start gap-4">
          <div className="inline-flex w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl items-center justify-center">
            <i className="pi pi-tags text-xl"></i>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Nueva Actualización de Precios</h1>
            <p className="text-slate-500 font-medium mt-1">Crea un borrador para auditar, simular y aplicar nuevos precios de venta al público.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Motivo */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Motivo o Referencia (Obligatorio)</label>
            <InputText 
              value={form.name} 
              onChange={(e) => setForm({...form, name: e.target.value})} 
              placeholder="Ej. Ajuste de Precios del 5% Categoría Víveres, Campaña de Verano..." 
              className="w-full p-3 bg-slate-50 border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 transition-all font-semibold text-slate-700" 
            />
          </div>

          {/* Scope selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Alcance del Ajuste</label>
              <Dropdown 
                value={form.scope} 
                options={scopes} 
                onChange={(e) => setForm({...form, scope: e.value, facility_ids: e.value === 'GENERAL' ? [] : form.facility_ids})} 
                className="w-full border-slate-200 bg-slate-50 rounded-xl text-sm" 
              />
            </div>

            {form.scope === 'BRANCH' && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Sucursales Afectadas</label>
                <MultiSelect 
                  value={form.facility_ids} 
                  options={facilityOptions} 
                  onChange={(e) => setForm({...form, facility_ids: e.value})} 
                  optionLabel="name"
                  optionValue="id"
                  placeholder="Selecciona las sucursales..." 
                  className="w-full border-slate-200 bg-slate-50 rounded-xl text-sm" 
                  filter
                  display="chip"
                />
              </div>
            )}
          </div>

          {/* Source Type Cards */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Método de Carga</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sourceTypes.map((type) => {
                const isSelected = form.source_type === type.value;
                return (
                  <div 
                    key={type.value}
                    onClick={() => setForm({...form, source_type: type.value})}
                    className={`border-2 rounded-2xl p-5 cursor-pointer transition-all duration-200 flex flex-col gap-3 relative overflow-hidden ${
                      isSelected 
                        ? 'border-emerald-600 bg-emerald-50/10 shadow-sm' 
                        : 'border-slate-100 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <i className={`pi ${type.icon} text-sm`}></i>
                      </div>
                      <span className="font-bold text-sm text-slate-700">{type.label}</span>
                    </div>
                    <p className="text-slate-400 text-xs leading-relaxed font-medium">{type.description}</p>
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-3 h-3 bg-emerald-600 rounded-full border-2 border-white"></div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {loading && <ProgressBar mode="indeterminate" style={{ height: '6px' }} color="#10b981" className="mt-4 rounded-full" />}

          <div className="flex justify-end gap-3 mt-6 border-t border-slate-100 pt-6">
            <Button 
              label="Cancelar" 
              type="button" 
              text 
              severity="secondary" 
              onClick={() => router.push('/precios')} 
              className="px-6 rounded-xl font-bold" 
            />
            <Button 
              label="Crear Mesa de Trabajo" 
              type="submit" 
              disabled={!form.name.trim() || (form.scope === 'BRANCH' && form.facility_ids.length === 0) || loading} 
              className="!bg-emerald-600 hover:!bg-emerald-700 border-none px-6 py-3 rounded-xl font-bold shadow-md shadow-emerald-100" 
            />
          </div>
        </form>
      </div>
    </div>
  );
}
