'use client';
import { useState } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { useRouter } from 'next/navigation';
import { PricingService } from '@/services/pricing.service';
import { ProgressBar } from 'primereact/progressbar';

export default function NewPricingSessionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    source_type: 'CSV_UPLOAD',
    target_cost_type: 'REPLACEMENT'
  });

  const sourceTypes = [
    { label: 'Plantilla de Proveedor (CSV/Excel)', value: 'CSV_UPLOAD' },
    { label: 'Manual por Filtros en Lote', value: 'FILTER_BULK' }
  ];

  const targetCosts = [
    { label: 'Costo de Reposición (Afecta Compras)', value: 'REPLACEMENT' },
    { label: 'Costo Estándar (Contabilidad / Fijo)', value: 'STANDARD' }
  ];

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      setLoading(true);
      const res = await PricingService.createSession(form);
      if (res && res.id) {
          router.push(`/pricing/${res.id}`);
      }
    } catch (err) {
       console.error(err);
       setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-12">
       <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100">
          <div className="mb-8">
             <div className="inline-flex w-12 h-12 bg-teal-50 text-teal-600 rounded-2xl items-center justify-center mb-4">
                <i className="pi pi-bolt text-2xl"></i>
             </div>
             <h1 className="text-3xl font-extrabold text-slate-800">Nueva Auditoría de Precios</h1>
             <p className="text-slate-500 font-medium">Configura el origen y el nivel de impacto contable de esta sesión.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
             <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Motivo o Referencia (Obligatorio)</label>
                <InputText 
                  value={form.name} 
                  onChange={(e) => setForm({...form, name: e.target.value})} 
                  placeholder="Ej. Lista Polar Diciembre, Ajuste de Inflación 5%" 
                  className="w-full p-3 bg-slate-50 border-slate-200 rounded-xl focus:ring-4 focus:ring-teal-500/20 transition-all font-medium" 
                />
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Origen de Datos</label>
                    <Dropdown 
                       value={form.source_type} 
                       options={sourceTypes} 
                       onChange={(e) => setForm({...form, source_type: e.value})} 
                       className="w-full border-slate-200 bg-slate-50 rounded-xl" 
                    />
                 </div>
                 
                 <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Objetivo Contable (Costo)</label>
                    <Dropdown 
                       value={form.target_cost_type} 
                       options={targetCosts} 
                       onChange={(e) => setForm({...form, target_cost_type: e.value})} 
                       className="w-full border-slate-200 bg-slate-50 rounded-xl" 
                    />
                 </div>
             </div>

             {loading && <ProgressBar mode="indeterminate" style={{ height: '6px' }} color="#0d9488" className="mt-4" />}

             <div className="flex justify-end gap-3 mt-8">
                <Button label="Cancelar" type="button" text severity="secondary" onClick={() => router.push('/pricing')} className="px-6 rounded-xl font-bold" />
                <Button label="Crear Mesa de Trabajo" type="submit" disabled={!form.name.trim() || loading} className="!bg-slate-900 !border-slate-900 hover:!bg-slate-800 px-6 rounded-xl font-bold shadow-md" />
             </div>
          </form>
       </div>
    </div>
  );
}
