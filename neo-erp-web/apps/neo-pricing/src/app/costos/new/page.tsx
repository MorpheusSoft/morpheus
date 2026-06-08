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
import { Dialog } from 'primereact/dialog';
import api from '@/lib/api';

export default function NewCostSessionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    source_type: 'CSV_UPLOAD',
    target_cost_type: 'REPLACEMENT',
    update_type: 'COST'
  });

  const [supplierOptions, setSupplierOptions] = useState<any[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [selectedSuppliers, setSelectedSuppliers] = useState<number[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);

  // Quick Supplier Creator states
  const [showQuickSupplier, setShowQuickSupplier] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState('');
  const [quickSupplierTaxId, setQuickSupplierTaxId] = useState('');
  const [savingSupplier, setSavingSupplier] = useState(false);

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [cats, sups] = await Promise.all([
          ProductService.getCategories(),
          ProductService.getSuppliers()
        ]);
        setCategoryOptions(cats?.data || cats?.items || (Array.isArray(cats) ? cats : []));
        setSupplierOptions(sups?.data || sups?.items || (Array.isArray(sups) ? sups : []));
      } catch (err) {
        console.error('Error loading metadata:', err);
      }
    };
    loadMetadata();
  }, []);

  const targetCosts = [
    { label: 'Costo de Reposición (Recomendado)', value: 'REPLACEMENT' },
    { label: 'Costo Estándar', value: 'STANDARD' }
  ];

  const sourceTypes = [
    {
      value: 'AI_PDF_PARSER',
      label: 'Subida de PDF / Imagen (IA)',
      description: 'Extrae costos automáticamente de fotos de facturas o PDFs usando Inteligencia Artificial.',
      icon: 'pi-file-pdf',
      color: 'border-violet-200 hover:border-violet-400 bg-violet-50/20 text-violet-700'
    },
    {
      value: 'CSV_UPLOAD',
      label: 'Plantilla de Proveedor (CSV)',
      description: 'Carga una lista de costos desde un archivo CSV con formato de columnas.',
      icon: 'pi-file-excel',
      color: 'border-blue-200 hover:border-blue-400 bg-blue-50/20 text-blue-700'
    },
    {
      value: 'FILTER_BULK',
      label: 'Asistente en Lote',
      description: 'Selecciona múltiples productos por proveedor o categoría para cargarlos de forma masiva.',
      icon: 'pi-sparkles',
      color: 'border-emerald-200 hover:border-emerald-400 bg-emerald-50/20 text-emerald-700'
    }
  ];

  const handleCreateSupplier = async () => {
    if (!quickSupplierName.trim() || !quickSupplierTaxId.trim()) return;
    try {
      setSavingSupplier(true);
      const res = await api.post('/suppliers/', {
        name: quickSupplierName,
        tax_id: quickSupplierTaxId,
        is_active: true
      });
      if (res && res.data) {
        const newSup = res.data;
        setSupplierOptions(prev => [...prev, newSup]);
        
        if (form.source_type === 'CSV_UPLOAD' || form.source_type === 'AI_PDF_PARSER') {
          setSelectedSupplier(newSup);
        } else {
          setSelectedSuppliers(prev => [...prev, newSup.id]);
        }
        
        setQuickSupplierName('');
        setQuickSupplierTaxId('');
        setShowQuickSupplier(false);
        alert(`Proveedor "${newSup.name}" creado exitosamente.`);
      }
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.detail || 'Error al crear el proveedor. Por favor, valida que el RIF/Tax ID sea único.';
      alert(msg);
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    try {
      setLoading(true);
      const res = await PricingService.createSession({
        name: form.name,
        source_type: form.source_type,
        target_cost_type: form.target_cost_type,
        update_type: 'COST',
        supplier_id: selectedSupplier?.id || null
      });

      if (res && res.id) {
        // If Batch/Lote mode is selected, populate the session automatically
        if (form.source_type === 'FILTER_BULK') {
          await PricingService.bulkFilterLines(res.id, {
            filters: {
              supplier_ids: selectedSuppliers,
              category_ids: selectedCategories,
              search_term: null
            },
            cost_rule: { action: 'KEEP', value: 0, base_target: 'CURRENT_COST', include_tax: false },
            price_rule: { action: 'KEEP', value: 0, base_target: 'CURRENT_PRICE', include_tax: false }
          });
        }
        router.push(`/${res.id}`);
      }
    } catch (err) {
      console.error('Error creating cost session:', err);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-12 px-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100">
        
        {/* Header */}
        <div className="mb-8 flex items-start gap-4">
          <div className="inline-flex w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl items-center justify-center">
            <i className="pi pi-percentage text-xl"></i>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Nueva Actualización de Costos</h1>
            <p className="text-slate-500 font-medium mt-1">Crea un borrador para auditar, simular y aplicar nuevos costos de adquisición.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Motivo */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Motivo o Referencia (Obligatorio)</label>
            <InputText 
              value={form.name} 
              onChange={(e) => setForm({...form, name: e.target.value})} 
              placeholder="Ej. Nueva Lista de Precios Polar Mayo, Aumento de Harinas..." 
              className="w-full p-3 bg-slate-50 border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 transition-all font-semibold text-slate-700" 
            />
          </div>

          {/* Source Type Cards */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Método de Carga</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {sourceTypes.map((type) => {
                const isSelected = form.source_type === type.value;
                return (
                  <div 
                    key={type.value}
                    onClick={() => setForm({...form, source_type: type.value})}
                    className={`border-2 rounded-2xl p-5 cursor-pointer transition-all duration-200 flex flex-col gap-3 relative overflow-hidden ${
                      isSelected 
                        ? 'border-indigo-600 bg-indigo-50/10 shadow-sm' 
                        : 'border-slate-100 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <i className={`pi ${type.icon} text-sm`}></i>
                      </div>
                      <span className="font-bold text-sm text-slate-700">{type.label}</span>
                    </div>
                    <p className="text-slate-400 text-xs leading-relaxed font-medium">{type.description}</p>
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-3 h-3 bg-indigo-600 rounded-full border-2 border-white"></div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Conditional Filters */}
          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Parámetros Adicionales</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Afectar en Inventario</label>
                <Dropdown 
                  value={form.target_cost_type} 
                  options={targetCosts} 
                  onChange={(e) => setForm({...form, target_cost_type: e.value})} 
                  className="w-full border-slate-200 bg-white rounded-xl text-sm" 
                />
              </div>

              {/* Single Supplier for CSV/PDF */}
              {(form.source_type === 'CSV_UPLOAD' || form.source_type === 'AI_PDF_PARSER') && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase flex justify-between items-center">
                    <span>Proveedor</span>
                    <button type="button" onClick={() => setShowQuickSupplier(true)} className="text-indigo-600 hover:text-indigo-800 text-[10px] font-extrabold uppercase tracking-wide bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 transition-colors">+ Proveedor Rápido</button>
                  </label>
                  <Dropdown 
                    value={selectedSupplier} 
                    options={supplierOptions} 
                    onChange={(e) => setSelectedSupplier(e.value)} 
                    optionLabel="name" 
                    placeholder="Selecciona el proveedor..." 
                    className="w-full border-slate-200 bg-white rounded-xl text-sm" 
                    filter
                    virtualScrollerOptions={{ itemSize: 38 }}
                  />
                </div>
              )}

              {/* Multiple Options for Batch/Lote */}
              {form.source_type === 'FILTER_BULK' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase flex justify-between items-center">
                      <span>Proveedores (Opcional)</span>
                      <button type="button" onClick={() => setShowQuickSupplier(true)} className="text-indigo-600 hover:text-indigo-800 text-[10px] font-extrabold uppercase tracking-wide bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 transition-colors">+ Proveedor Rápido</button>
                    </label>
                    <MultiSelect 
                      value={selectedSuppliers} 
                      options={supplierOptions} 
                      onChange={(e) => setSelectedSuppliers(e.value)} 
                      optionLabel="name" 
                      optionValue="id" 
                      placeholder="Todos los proveedores..." 
                      className="w-full border-slate-200 bg-white rounded-xl text-sm" 
                      filter 
                      display="chip"
                      virtualScrollerOptions={{ itemSize: 38 }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Categorías (Opcional)</label>
                    <MultiSelect 
                      value={selectedCategories} 
                      options={categoryOptions} 
                      onChange={(e) => setSelectedCategories(e.value)} 
                      optionLabel="name" 
                      optionValue="id" 
                      placeholder="Todas las categorías..." 
                      className="w-full border-slate-200 bg-white rounded-xl text-sm" 
                      filter 
                      display="chip"
                      virtualScrollerOptions={{ itemSize: 38 }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {loading && <ProgressBar mode="indeterminate" style={{ height: '6px' }} color="#4f46e5" className="mt-4 rounded-full" />}

          <div className="flex justify-end gap-3 mt-6 border-t border-slate-100 pt-6">
            <Button 
              label="Cancelar" 
              type="button" 
              text 
              severity="secondary" 
              onClick={() => router.push('/costos')} 
              className="px-6 rounded-xl font-bold" 
            />
            <Button 
              label="Crear Mesa de Trabajo" 
              type="submit" 
              disabled={!form.name.trim() || loading} 
              className="!bg-indigo-600 hover:!bg-indigo-700 border-none px-6 py-3 rounded-xl font-bold shadow-md shadow-indigo-100" 
            />
          </div>
        </form>
      </div>

      {/* Quick Supplier Dialog */}
      <Dialog 
        visible={showQuickSupplier} 
        onHide={() => setShowQuickSupplier(false)} 
        header="✨ Creación Rápida de Proveedor" 
        style={{ width: '25vw', minWidth: '350px' }}
        footer={
          <div className="flex justify-end gap-2">
            <Button label="Cancelar" text severity="secondary" onClick={() => setShowQuickSupplier(false)} />
            <Button label="Guardar" icon="pi pi-check" loading={savingSupplier} disabled={!quickSupplierName.trim() || !quickSupplierTaxId.trim()} onClick={handleCreateSupplier} className="!bg-indigo-600 border-none" />
          </div>
        }
      >
        <div className="flex flex-col gap-4 mt-2">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Razón Social / Nombre</label>
            <InputText value={quickSupplierName} onChange={(e) => setQuickSupplierName(e.target.value)} placeholder="Ej. Distribuidora Morpheus C.A." className="w-full p-2 text-sm border border-slate-200 rounded" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Identificación Fiscal / RIF</label>
            <InputText value={quickSupplierTaxId} onChange={(e) => setQuickSupplierTaxId(e.target.value)} placeholder="Ej. J-98765432-1" className="w-full p-2 text-sm border border-slate-200 rounded" />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
