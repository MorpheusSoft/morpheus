"use client";

import { useEffect, useState } from "react";
import { getUsers, createUser, updateUser } from "@/app/actions/users";
import { getRoles } from "@/app/actions/roles";
import { getFacilities } from "@/app/actions/facilities";

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Form state
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);
  const [selectedFacilities, setSelectedFacilities] = useState<number[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [u, r, f] = await Promise.all([getUsers(), getRoles(), getFacilities()]);
      setUsers(u);
      setRoles(r);
      setFacilities(f);
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
    setEmail("");
    setFullName("");
    setPassword("");
    setIsActive(true);
    setIsSuperuser(false);
    setSelectedRoles([]);
    setSelectedFacilities([]);
    setIsModalOpen(true);
  };

  const openEditModal = (u: any) => {
    setEditingId(u.id);
    setEmail(u.email);
    setFullName(u.full_name || "");
    setPassword(""); // Leave empty for update unless changing
    setIsActive(u.is_active);
    setIsSuperuser(u.is_superuser);
    setSelectedRoles(u.roles?.map((r:any) => r.id) || []);
    setSelectedFacilities(u.facilities?.map((f:any) => f.id) || []);
    setIsModalOpen(true);
  };

  const toggleRole = (rid: number) => {
    setSelectedRoles(prev => 
      prev.includes(rid) ? prev.filter(r => r !== rid) : [...prev, rid]
    );
  };

  const toggleFacility = (fid: number) => {
    setSelectedFacilities(prev => 
      prev.includes(fid) ? prev.filter(f => f !== fid) : [...prev, fid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { 
       email, 
       full_name: fullName, 
       is_active: isActive,
       is_superuser: isSuperuser,
       role_ids: selectedRoles,
       facility_ids: selectedFacilities
    };
    
    // Only send password if it's new user or password is provided
    if (!editingId && !password) {
       return alert("Debe asignar una contraseña al nuevo usuario.");
    }
    if (password) payload.password = password;

    try {
      if (editingId) {
        await updateUser(editingId, payload);
      } else {
        await createUser(payload);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error: any) {
      alert(error.message || "Error al procesar el usuario");
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto pb-10 fade-in-up">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Usuarios del Sistema</h1>
          <p className="text-slate-500 mt-2 text-sm">Gestiona credenciales, roles de acceso y asignaciones físicas.</p>
        </div>
        <button 
          onClick={openNewModal}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
        >
           <i className="pi pi-user-plus"></i> Nuevo Usuario
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400">
             <i className="pi pi-spinner animate-spin text-3xl mb-3 text-indigo-500"></i>
             <p>Descargando directorio...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No hay usuarios en la base de datos.</div>
        ) : (
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 rounded-tl-2xl">Usuario</th>
                <th className="px-6 py-4">Correo (Login)</th>
                <th className="px-6 py-4">Roles Principales</th>
                <th className="px-6 py-4">Estatus</th>
                <th className="px-6 py-4 text-right rounded-tr-2xl">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-3">
                     <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${u.is_superuser ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-100 text-slate-500'}`}>
                        {u.full_name?.substring(0,2)?.toUpperCase() || 'US'}
                     </div>
                     <div>
                        <div>{u.full_name}</div>
                        {u.is_superuser && <span className="text-[10px] text-indigo-500 uppercase tracking-widest block">Root Admin</span>}
                     </div>
                  </td>
                  <td className="px-6 py-4 font-medium">{u.email}</td>
                  <td className="px-6 py-4">
                     <div className="flex gap-1 flex-wrap">
                        {u.roles?.map((r:any) => (
                           <span key={r.id} className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[10px] uppercase font-bold border border-slate-200">
                              {r.name}
                           </span>
                        ))}
                        {(!u.roles || u.roles.length === 0) && <span className="text-slate-400 italic text-xs">Sin roles</span>}
                     </div>
                  </td>
                  <td className="px-6 py-4">
                     {u.is_active ? (
                        <span className="text-emerald-500 font-bold"><i className="pi pi-check-circle mr-1"></i> Activo</span>
                     ) : (
                        <span className="text-slate-400"><i className="pi pi-lock mr-1"></i> Bloqueado</span>
                     )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => openEditModal(u)}
                      className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      title="Administrar"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center py-6 px-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={() => setIsModalOpen(false)}></div>
          
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-slide-up relative flex flex-col max-h-full">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                 <i className="pi pi-user text-indigo-500"></i> 
                 {editingId ? "Editar Cuenta de Usuario" : "Apertura de Cuenta"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                <i className="pi pi-times"></i>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              <form id="userForm" onSubmit={handleSubmit} className="flex flex-col gap-6">
                 
                 {/* Basic Info */}
                 <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Nombre Completo</label>
                        <input 
                          type="text" 
                          required 
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
                          placeholder="Ej. Juan Pérez"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Correo Electrónico (Login)</label>
                        <input 
                          type="email" 
                          required 
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
                          placeholder="juan@neo.com"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                           Contraseña {editingId && <span className="text-slate-400 font-normal normal-case">(Déjalo en blanco para mantener actual)</span>}
                        </label>
                        <input 
                          type="password" 
                          required={!editingId}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
                          placeholder="********"
                        />
                    </div>
                 </div>

                 {/* Privileges */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Roles Selector */}
                    <div>
                       <h4 className="font-bold text-slate-700 text-sm mb-3"><i className="pi pi-id-card mr-1 text-slate-400"></i> Asignación de Roles</h4>
                       <div className="border border-slate-200 rounded-xl overflow-hidden bg-white max-h-48 overflow-y-auto custom-scrollbar">
                          {roles.map(r => (
                             <label key={r.id} className="flex items-center gap-3 p-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors last:border-0">
                                <input 
                                   type="checkbox" 
                                   checked={selectedRoles.includes(r.id)}
                                   onChange={() => toggleRole(r.id)}
                                   className="w-4 h-4 text-indigo-600 rounded bg-slate-100 border-slate-300 focus:ring-indigo-500 focus:ring-2"
                                />
                                <span className="text-sm font-medium text-slate-700">{r.name}</span>
                             </label>
                          ))}
                          {roles.length === 0 && <div className="p-4 text-xs text-slate-400 text-center">No hay roles disponibles.</div>}
                       </div>
                    </div>

                    {/* Facilities Selector */}
                    <div>
                       <h4 className="font-bold text-slate-700 text-sm mb-3"><i className="pi pi-sitemap mr-1 text-slate-400"></i> Accesos a Sedes</h4>
                       <div className="border border-slate-200 rounded-xl overflow-hidden bg-white max-h-48 overflow-y-auto custom-scrollbar">
                          {facilities.map(f => (
                             <label key={f.id} className="flex items-center gap-3 p-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors last:border-0">
                                <input 
                                   type="checkbox" 
                                   checked={selectedFacilities.includes(f.id)}
                                   onChange={() => toggleFacility(f.id)}
                                   className="w-4 h-4 text-emerald-600 rounded bg-slate-100 border-slate-300 focus:ring-emerald-500 focus:ring-2"
                                />
                                <span className="text-sm font-medium text-slate-700 flex flex-col">
                                   <span>{f.name}</span>
                                   <span className="text-[10px] text-slate-400">{f.code}</span>
                                </span>
                             </label>
                          ))}
                          {facilities.length === 0 && <div className="p-4 text-xs text-slate-400 text-center">No hay sedes disponibles.</div>}
                       </div>
                    </div>
                 </div>

                 {/* Switches */}
                 <div className="flex gap-4">
                    <label className="flex-1 flex items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors">
                       <input type="checkbox" className="sr-only peer" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                       <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                       <div>
                          <p className="font-bold text-slate-700 text-sm">Cuenta Activa</p>
                       </div>
                    </label>
                    <label className="flex-1 flex items-center gap-3 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 cursor-pointer hover:bg-indigo-50 transition-colors title='Otorga permisos absolutos'">
                       <input type="checkbox" className="sr-only peer" checked={isSuperuser} onChange={(e) => setIsSuperuser(e.target.checked)} />
                       <div className="w-11 h-6 bg-indigo-100 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-indigo-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                       <div>
                          <p className="font-bold text-indigo-900 text-sm flex items-center gap-1"><i className="pi pi-shield"></i> Root Admin</p>
                       </div>
                    </label>
                 </div>

              </form>
            </div>
            
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0 flex gap-3">
               <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-200/50 hover:bg-slate-200 transition-colors"
               >
                  Cancelar
               </button>
               <button 
                  type="submit"
                  form="userForm"
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all"
               >
                  {editingId ? "Actualizar Usuario" : "Crear Usuario"}
               </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
