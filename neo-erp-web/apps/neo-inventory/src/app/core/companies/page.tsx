'use client';
import { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { useForm, Controller } from 'react-hook-form';
import { CoreService } from '@/services/core.service';

export default function CompaniesPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const { control, handleSubmit, reset } = useForm({
    defaultValues: { name: '', tax_id: '', currency_code: 'USD' }
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await CoreService.getCompanies();
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
      await CoreService.createCompany(form);
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
           <h1 className="text-2xl font-extrabold text-slate-800">Compañías Base</h1>
           <p className="text-slate-500 text-sm">Organiza las empresas operativas del ERP</p>
         </div>
         <Button label="Nueva Compañía" icon="pi pi-plus" onClick={() => setVisible(true)} className="!bg-indigo-600 hover:!bg-indigo-700 !border-none !rounded-xl !shadow-md" />
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <DataTable value={data} loading={loading} emptyMessage={<p className="p-8 text-center text-slate-400">Sin datos registrados.</p>}>
          <Column field="id" header="ID" className="font-bold text-slate-400 w-16 px-4"></Column>
          <Column field="name" header="NOMBRE DE EMPRESA" className="font-bold text-slate-800 px-4"></Column>
          <Column field="tax_id" header="RIF/TAX ID" className="px-4"></Column>
          <Column field="currency_code" header="MONEDA BASE" className="px-4"></Column>
        </DataTable>
      </div>

      <Dialog header="Registrar Compañía" visible={visible} style={{ width: '400px' }} onHide={() => setVisible(false)} pt={{ root: { className: '!rounded-2xl shadow-xl border border-slate-100' }}}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 mt-2 p-2">
           <div>
             <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Nombre o Razón Social</label>
             <Controller name="name" control={control} render={({ field }) => (
               <InputText {...field} required autoComplete="off" className="w-full !rounded-xl border-slate-200 !py-3 !px-4" placeholder="Ej. Inversiones Neo ERP, C.A." />
             )} />
           </div>
           <div>
             <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Tax ID / RIF</label>
             <Controller name="tax_id" control={control} render={({ field }) => (
               <InputText {...field} autoComplete="off" className="w-full !rounded-xl border-slate-200 !py-3 !px-4" placeholder="J-12345678-9" />
             )} />
           </div>
           <Button type="submit" label="Guardar Registro" icon="pi pi-check" className="mt-4 !rounded-xl !bg-indigo-600 hover:!bg-indigo-700 !border-none !py-3 font-bold" />
        </form>
      </Dialog>
    </div>
  );
}
