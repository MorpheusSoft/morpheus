"use client";

import { useEffect, useState } from "react";
import { getFacilities, createFacility, updateFacility } from "@/app/actions/facilities";
import { getCompanies } from "@/app/actions/companies";

export default function FacilitiesPage() {
  const [facilities, setFacilities] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [companyId, setCompanyId] = useState<number | "">("");
  const [isActive, setIsActive] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [facs, comps] = await Promise.all([getFacilities(), getCompanies()]);
      setFacilities(facs);
      setCompanies(comps);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openNewModal = () => {
    setEditingId(null);
    setName("");
    setCode("");
    setAddress("");
    setCompanyId(companies.length > 0 ? companies[0].id : "");
    setIsActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (fac: any) => {
    setEditingId(fac.id);
    setName(fac.name);
    setCode(fac.code);
    setAddress(fac.address || "");
    setCompanyId(fac.company_id || "");
    setIsActive(fac.is_active);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return alert("Debe seleccionar una empresa");
    
    const payload = { 
      name, 
      code, 
      address, 
      company_id: Number(companyId),
      is_active: isActive
    };
    
    try {
      if (editingId) {
        await updateFacility(editingId, payload);
      } else {
        await createFacility(payload);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      alert("Error guardando sucursal");
    }
  };

  const getCompanyName = (comp_id: number) => {
    const comp = companies.find(c => c.id === comp_id);
    return comp ? comp.name : "Sin Asignar";
  };

  return (
    <div className="w-full max-w-6xl mx-auto pb-10 fade-in-up">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Sucursales / Sedes</h1>
          <p className="text-slate-500 mt-2 text-sm">Organiza las ubicaciones físicas del Holding.</p>
        </div>
        <button 
          onClick={openNewModal}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
        >
          <i className="pi pi-plus"></i> Nueva Sucursal
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400">
             <i className="pi pi-spinner animate-spin text-3xl mb-3 text-indigo-500"></i>
             <p>Cargando nodos físicos...</p>
          </div>
        ) : facilities.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No hay sucursales registradas en el sistema.</div>
        ) : (
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 rounded-tl-2xl">Código</th>
                <th className="px-6 py-4">Nombre de la Sede</th>
                <th className="px-6 py-4">Empresa (Holding)</th>
                <th className="px-6 py-4">Estatus</th>
                <th className="px-6 py-4 text-right rounded-tr-2xl">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {facilities.map((fac) => (
                <tr key={fac.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-mono font-medium text-indigo-500">{fac.code}</td>
                  <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-3">
                     <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                       <i className="pi pi-sitemap text-sm"></i>
                     </div>
                     {fac.name}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-500">
                     {getCompanyName(fac.company_id)}
                  </td>
                  <td className="px-6 py-4">
                     {fac.is_active ? (
                        <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2.5 py-1 rounded-md text-[10px] uppercase font-black tracking-widest flex items-center inline-flex gap-1.5">
                           <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Activa
                        </span>
                     ) : (
                        <span className="bg-slate-100 text-slate-400 border border-slate-200 px-2.5 py-1 rounded-md text-[10px] uppercase font-black tracking-widest flex items-center inline-flex gap-1.5">
                           Inactiva
                        </span>
                     )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => openEditModal(fac)}
                      className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      title="Editar Sucursal"
                    >
                      <i className="pi pi-pencil"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                 <i className="pi pi-sitemap text-indigo-500"></i> 
                 {editingId ? "Editar Sucursal" : "Crear Nueva Sucursal"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                <i className="pi pi-times"></i>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Código (ID Sedes)</label>
                    <input 
                      type="text" 
                      required 
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400 font-mono text-indigo-600"
                      placeholder="Ej. SUC-01"
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Empresa Operadora</label>
                    <select 
                      required
                      value={companyId}
                      onChange={(e) => setCompanyId(Number(e.target.value))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    >
                      <option value="" disabled>-- Seleccionar Empresa --</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                 </div>
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Nombre de la Sucursal</label>
                  <input 
                    type="text" 
                    required 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
                    placeholder="Ej. Sede Principal Caracas"
                  />
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Dirección Física</label>
                  <textarea 
                    required 
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400 resize-none h-24 custom-scrollbar"
                    placeholder="Calle, Edificio, Zona..."
                  ></textarea>
               </div>

               <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="flex-1">
                     <p className="font-bold text-slate-700 text-sm">Sede Activa</p>
                     <p className="text-xs text-slate-400">Si desactiva esta sede, los sistemas no podrán facturar ni operar en ella.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
               </div>

               <div className="mt-4 flex gap-3">
                 <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                 >
                    Cancelar
                 </button>
                 <button 
                    type="submit" 
                    className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all"
                 >
                    {editingId ? "Actualizar Sede" : "Crear Nueva Sede"}
                 </button>
               </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
