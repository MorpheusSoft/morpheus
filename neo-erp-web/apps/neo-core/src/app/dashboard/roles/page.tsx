"use client";

import { useEffect, useState } from "react";
import { getRoles, createRole, updateRole } from "@/app/actions/roles";

export default function RolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [canUseOracle, setCanUseOracle] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const data = await getRoles();
      setRoles(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const openNewModal = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setCanUseOracle(false);
    setIsActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (role: any) => {
    setEditingId(role.id);
    setName(role.name);
    setDescription(role.description || "");
    setCanUseOracle(role.can_use_oracle);
    setIsActive(role.is_active);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { 
       name, 
       description, 
       can_use_oracle: canUseOracle,
       is_active: isActive
    };
    try {
      if (editingId) {
        await updateRole(editingId, payload);
      } else {
        await createRole(payload);
      }
      setIsModalOpen(false);
      fetchRoles();
    } catch (error) {
      alert("Error guardando rol");
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto pb-10 fade-in-up">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Roles y Privilegios</h1>
          <p className="text-slate-500 mt-2 text-sm">Gestiona los perfiles de acceso y permisos del sistema.</p>
        </div>
        <button 
          onClick={openNewModal}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
        >
          <i className="pi pi-plus"></i> Nuevo Rol
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400">
             <i className="pi pi-spinner animate-spin text-3xl mb-3 text-indigo-500"></i>
             <p>Cargando roles...</p>
          </div>
        ) : roles.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No hay roles registrados en el sistema.</div>
        ) : (
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 rounded-tl-2xl">Perfiles</th>
                <th className="px-6 py-4">Descripción</th>
                <th className="px-6 py-4 text-center">Oráculo AI</th>
                <th className="px-6 py-4 text-center">Estatus</th>
                <th className="px-6 py-4 text-right rounded-tr-2xl">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roles.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-3">
                     <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                       <i className="pi pi-id-card text-sm"></i>
                     </div>
                     {r.name}
                  </td>
                  <td className="px-6 py-4">{r.description || <span className="text-slate-400 italic">Sin descripción</span>}</td>
                  <td className="px-6 py-4 text-center">
                     {r.can_use_oracle ? (
                        <span className="text-purple-600 bg-purple-50 p-1.5 rounded-full inline-flex"><i className="pi pi-sparkles"></i></span>
                     ) : (
                        <span className="text-slate-300"><i className="pi pi-times-circle"></i></span>
                     )}
                  </td>
                  <td className="px-6 py-4 text-center">
                     {r.is_active ? (
                        <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2.5 py-1 rounded-md text-[10px] uppercase font-black tracking-widest inline-block">Activo</span>
                     ) : (
                        <span className="bg-slate-100 text-slate-400 border border-slate-200 px-2.5 py-1 rounded-md text-[10px] uppercase font-black tracking-widest inline-block">Inactivo</span>
                     )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => openEditModal(r)}
                      className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      title="Editar Rol"
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
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                 <i className="pi pi-id-card text-indigo-500"></i> 
                 {editingId ? "Editar Rol" : "Crear Nuevo Rol"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                <i className="pi pi-times"></i>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Nombre del Rol</label>
                  <input 
                    type="text" 
                    required 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400 font-medium text-slate-800"
                    placeholder="Ej. Gerente Comercial"
                  />
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Descripción (Opcional)</label>
                  <textarea 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400 resize-none h-20"
                    placeholder="Acceso total a ventas..."
                  ></textarea>
               </div>

               <div className="flex flex-col gap-3">
                 <div className="flex items-center gap-3 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-xl border border-purple-100">
                    <div className="flex-1">
                       <p className="font-bold text-slate-800 text-sm flex items-center gap-1"><i className="pi pi-sparkles text-purple-500"></i> Oráculo AI</p>
                       <p className="text-xs text-slate-500">Habilita acceso al asistente virtual.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={canUseOracle} onChange={(e) => setCanUseOracle(e.target.checked)} />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                    </label>
                 </div>

                 <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="flex-1">
                       <p className="font-bold text-slate-700 text-sm">Rol Activo</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                 </div>
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
                    {editingId ? "Actualizar Rol" : "Guardar Rol"}
                 </button>
               </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
