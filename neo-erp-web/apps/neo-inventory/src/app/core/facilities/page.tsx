'use client';
import { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { useForm, Controller } from 'react-hook-form';
import { CoreService } from '@/services/core.service';

export default function FacilitiesPage() {
  const [data, setData] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const { control, handleSubmit, reset } = useForm({
    defaultValues: { company_id: null, name: '', code: '', address: '', is_active: true }
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [facs, comps] = await Promise.all([
         CoreService.getFacilities(),
         CoreService.getCompanies()
      ]);
      setData(facs);
      setCompanies(comps);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const onSubmit = async (form: any) => {
    try {
      await CoreService.createFacility(form);
      setVisible(false);
      reset();
      loadData();
    } catch (e) {
      alert("Error: " + e);
    }
  };

  const getCompanyName = (companyId: number) => {
      const comp = companies.find((c: any) => c.id === companyId);
      return comp ? (comp as any).name : '---';
  };

  return (
    <div className="p-4 md:p-8 w-full max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
         <div>
           <h1 className="text-2xl font-extrabold text-slate-800">Sucursales y Localidades</h1>
           <p className="text-slate-500 text-sm">Centros de costo físicos, tiendas o sucursales</p>
         </div>
         <Button label="Nueva Localidad" icon="pi pi-plus" onClick={() => setVisible(true)} className="!bg-teal-600 hover:!bg-teal-700 !border-none !rounded-xl !shadow-md" />
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <DataTable value={data} loading={loading} emptyMessage={<p className="p-8 text-center text-slate-400">Sin datos registrados.</p>}>
          <Column field="id" header="ID" className="font-bold text-slate-400 w-16 px-4"></Column>
          <Column header="COMPAÑÍA" body={(rowData: any) => getCompanyName(rowData.company_id)} className="font-bold text-indigo-700 px-4"></Column>
          <Column field="code" header="CÓDIGO (COCO)" className="font-bold text-slate-500 px-4"></Column>
          <Column field="name" header="NOMBRE DE SUCURSAL" className="font-bold text-slate-800 px-4"></Column>
          <Column field="address" header="DIRECCIÓN FÍSICA" className="px-4 text-sm text-slate-500 truncate max-w-xs"></Column>
        </DataTable>
      </div>

      <Dialog header="Registrar Sucursal Múltiple" visible={visible} style={{ width: '450px' }} onHide={() => setVisible(false)} pt={{ root: { className: '!rounded-2xl shadow-xl border border-slate-100' }}}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 mt-2 p-2">
           <div>
             <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Compañía Operadora *</label>
             <Controller name="company_id" control={control} render={({ field }) => (
               <Dropdown value={field.value} onChange={(e) => field.onChange(e.value)} options={companies} optionLabel="name" optionValue="id" placeholder="Seleccione..." className="w-full !rounded-xl border-slate-200 shadow-sm" pt={{ input: { className: '!py-3 !px-4' } }}/>
             )} />
           </div>
           <div className="grid grid-cols-3 gap-4">
               <div className="col-span-1">
                 <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Código</label>
                 <Controller name="code" control={control} render={({ field }) => (
                   <InputText {...field} required autoComplete="off" className="w-full !rounded-xl border-slate-200 !py-3 !px-4" placeholder="CCS-01" />
                 )} />
               </div>
               <div className="col-span-2">
                 <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Nombre Comercial</label>
                 <Controller name="name" control={control} render={({ field }) => (
                   <InputText {...field} required autoComplete="off" className="w-full !rounded-xl border-slate-200 !py-3 !px-4" placeholder="Tienda Caracas Principal" />
                 )} />
               </div>
           </div>
           <div>
             <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Dirección Física Completa</label>
             <Controller name="address" control={control} render={({ field }) => (
               <InputText {...field} required autoComplete="off" className="w-full !rounded-xl border-slate-200 !py-3 !px-4" placeholder="" />
             )} />
           </div>
           <Button type="submit" label="Crear Sucursal" icon="pi pi-check" className="mt-4 !rounded-xl !bg-teal-600 hover:!bg-teal-700 !border-none !py-3 font-bold" />
        </form>
      </Dialog>
    </div>
  );
}
