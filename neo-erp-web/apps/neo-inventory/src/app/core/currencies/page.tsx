'use client';
import { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { useForm, Controller } from 'react-hook-form';
import { CoreService } from '@/services/core.service';

export default function CurrenciesPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const { control, handleSubmit, reset } = useForm({
    defaultValues: { name: '', code: '', symbol: '', exchange_rate: 1.0, is_active: true }
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await CoreService.getCurrencies();
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const onSubmit = async (form: any) => {
    try {
      await CoreService.createCurrency(form);
      setVisible(false);
      reset();
      loadData();
    } catch (e) {
      alert("Error: " + e);
    }
  };

  return (
    <div className="p-4 md:p-8 w-full max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
         <div>
           <h1 className="text-2xl font-extrabold text-slate-800">Monedas y Divisas</h1>
           <p className="text-slate-500 text-sm">Gestiona la contabilidad multi-moneda de Neo ERP</p>
         </div>
         <Button label="Nueva Moneda" icon="pi pi-plus" onClick={() => setVisible(true)} className="!bg-emerald-600 hover:!bg-emerald-700 !border-none !rounded-xl !shadow-md" />
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <DataTable value={data} loading={loading} emptyMessage={<p className="p-8 text-center text-slate-400">Sin datos registrados.</p>}>
          <Column field="id" header="ID" className="font-bold text-slate-400 w-16 px-4"></Column>
          <Column field="name" header="NOMBRE DE MONEDA" className="font-bold text-slate-800 px-4"></Column>
          <Column field="code" header="CÓDIGO (ISO)" className="font-bold text-slate-500 px-4"></Column>
          <Column field="symbol" header="SÍMBOLO" className="px-4 text-emerald-600 font-extrabold"></Column>
          <Column field="exchange_rate" header="TASA DE CAMBIO" className="px-4 font-mono"></Column>
        </DataTable>
      </div>

      <Dialog header="Registrar Moneda" visible={visible} style={{ width: '400px' }} onHide={() => setVisible(false)} pt={{ root: { className: '!rounded-2xl shadow-xl border border-slate-100' }}}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 mt-2 p-2">
           <div>
             <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Nombre</label>
             <Controller name="name" control={control} render={({ field }) => (
               <InputText {...field} required autoComplete="off" className="w-full !rounded-xl border-slate-200 !py-3 !px-4" placeholder="Dólar Estadounidense" />
             )} />
           </div>
           <div className="grid grid-cols-2 gap-4">
               <div>
                 <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Código ISO</label>
                 <Controller name="code" control={control} render={({ field }) => (
                   <InputText {...field} required autoComplete="off" className="w-full !rounded-xl border-slate-200 !py-3 !px-4" placeholder="USD" />
                 )} />
               </div>
               <div>
                 <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Símbolo</label>
                 <Controller name="symbol" control={control} render={({ field }) => (
                   <InputText {...field} autoComplete="off" className="w-full !rounded-xl border-slate-200 !py-3 !px-4" placeholder="$" />
                 )} />
               </div>
           </div>
           <div>
             <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Tasa de Cambio Base</label>
             <Controller name="exchange_rate" control={control} render={({ field }) => (
               <InputNumber value={field.value} onValueChange={(e) => field.onChange(e.value)} maxFractionDigits={4} className="w-full" inputClassName="w-full !rounded-xl border-slate-200 !py-3 !px-4 font-mono" />
             )} />
           </div>
           <Button type="submit" label="Guardar Registro" icon="pi pi-check" className="mt-4 !rounded-xl !bg-emerald-600 hover:!bg-emerald-700 !border-none !py-3 font-bold" />
        </form>
      </Dialog>
    </div>
  );
}
