"use client";

import { useEffect, useState } from "react";
import { getRoles, createRole, updateRole } from "@/app/actions/roles";

const initialPermissions: any = {
  neo_core: {
      companies: { read: false, write: false, delete: false, approve: false },
      users: { read: false, write: false, delete: false, approve: false },
      roles: { read: false, write: false, delete: false, approve: false },
      facilities: { read: false, write: false, delete: false, approve: false },
      currencies: { read: false, write: false, delete: false, approve: false },
      jobs: { read: false, write: false, delete: false, approve: false },
  },
  neo_inventory: {
      products: { read: false, write: false, delete: false, approve: false },
      categories: { read: false, write: false, delete: false, approve: false },
      warehouses: { read: false, write: false, delete: false, approve: false },
  },
  neo_purchases: {
      suppliers: { read: false, write: false, delete: false, approve: false },
      orders: { read: false, write: false, delete: false, approve: false },
      prices: { read: false, write: false, delete: false, approve: false },
  },
  neo_logistics: {
      routes: { read: false, write: false, delete: false, approve: false },
      vehicles: { read: false, write: false, delete: false, approve: false },
  }
};

const moduleNames: any = {
  neo_core: "Control Maestro (Neo Core)",
  neo_inventory: "Bodegas e Inventario",
  neo_purchases: "Compras y Adquisiciones",
  neo_logistics: "CENDI y Logística",
};

const featureNames: any = {
  companies: "Holding y Empresas", users: "Usuarios", roles: "Roles y Seguridad", facilities: "Sucursales", currencies: "Mercado de Divisas", jobs: "Tareas en Segundo Plano (Jobs)",
  products: "Maestro de Productos", categories: "Categorías", warehouses: "Almacenes",
  suppliers: "Directorio de Proveedores", orders: "Gestor de Órdenes", prices: "Tarifas de Compra",
  routes: "Rutas", vehicles: "Flota de Vehículos"
};


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
  const [permissions, setPermissions] = useState<any>(JSON.parse(JSON.stringify(initialPermissions)));

  const handlePermissionChange = (modKey: string, featKey: string, permKey: string, val: boolean) => {
    setPermissions((prev: any) => {
      const copy = { ...prev };
      copy[modKey][featKey][permKey] = val;

      // Smart interlocking rules
      if (permKey === "read" && !val) {
         // Auto toggle off everything if read is stripped
         copy[modKey][featKey].write = false;
         copy[modKey][featKey].delete = false;
         copy[modKey][featKey].approve = false;
      }
      if (["write","delete","approve"].includes(permKey) && val) {
         // Auto toggle on read if any sub-permission is granted
         copy[modKey][featKey].read = true;
      }

      return copy;
    });
  };

  const mergePermissions = (savedPerms: any) => {
    const base = JSON.parse(JSON.stringify(initialPermissions));
    if (!savedPerms) return base;
    for (const modKey in savedPerms) {
      if (base[modKey]) {
        for (const featKey in savedPerms[modKey]) {
           if (base[modKey][featKey]) {
             base[modKey][featKey] = { ...base[modKey][featKey], ...savedPerms[modKey][featKey] };
           }
        }
      }
    }
    return base;
  };

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
    setPermissions(JSON.parse(JSON.stringify(initialPermissions)));
    setIsModalOpen(true);
  };

  const openEditModal = (role: any) => {
    setEditingId(role.id);
    setName(role.name);
    setDescription(role.description || "");
    setCanUseOracle(role.can_use_oracle);
    setIsActive(role.is_active);
    setPermissions(mergePermissions(role.permissions));
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { 
       name, 
       description, 
       can_use_oracle: canUseOracle,
       permissions,
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                 <i className="pi pi-id-card text-indigo-500"></i> 
                 {editingId ? "Editar Permisos Dinámicos del Rol" : "Definir Nueva Matriz de Privilegios"}
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                <i className="pi pi-times"></i>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
               <div className="flex-1 overflow-y-auto p-6">
                 <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                   
                   {/* Left Col: Basics */}
                   <div className="lg:col-span-4 flex flex-col gap-5">
                       <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Nombre del Rol</label>
                          <input 
                            type="text" 
                            required 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400 font-bold text-slate-800"
                            placeholder="Ej. Oficial de Logística"
                          />
                       </div>

                       <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Misión / Descripción</label>
                          <textarea 
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400 resize-none h-24 text-sm"
                            placeholder="Supervisión de depósitos y traslados CENDI..."
                          ></textarea>
                       </div>

                       <div className="flex items-center gap-3 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-xl border border-purple-100">
                          <div className="flex-1">
                             <p className="font-bold text-slate-800 text-sm flex items-center gap-1"><i className="pi pi-sparkles text-purple-500"></i> IA Oráculo</p>
                             <p className="text-xs text-slate-500 leading-tight mt-1">Concede token para uso del asistente LLM.</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={canUseOracle} onChange={(e) => setCanUseOracle(e.target.checked)} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                          </label>
                       </div>

                       <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                          <div className="flex-1">
                             <p className="font-bold text-slate-700 text-sm">Estatus Operativo</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                          </label>
                       </div>
                   </div>

                   {/* Right Col: RBAC Matrix */}
                   <div className="lg:col-span-8">
                      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                         <div className="bg-slate-800 px-5 py-3.5 flex items-center justify-between">
                            <h4 className="font-bold text-white text-sm tracking-wide flex items-center gap-2">
                               <i className="pi pi-sitemap text-indigo-400"></i> Matriz de Capacidades y Alcances (RBAC)
                            </h4>
                         </div>
                         
                         <div className="max-h-[500px] overflow-y-auto bg-slate-50">
                            {Object.keys(permissions).map((modKey) => (
                               <div key={modKey} className="border-b border-slate-200 last:border-0 bg-white">
                                  <div className="px-5 py-2.5 bg-slate-100/80 border-b border-slate-200">
                                     <h5 className="font-bold text-slate-700 text-xs uppercase tracking-widest">{moduleNames[modKey] || modKey}</h5>
                                  </div>
                                  <table className="w-full text-left text-sm text-slate-600">
                                     <thead className="bg-white border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400">
                                        <tr>
                                           <th className="px-5 py-3 w-1/3">Sub-módulo / Feature</th>
                                           <th className="px-3 py-3 text-center">Ver</th>
                                           <th className="px-3 py-3 text-center">Escribir</th>
                                           <th className="px-3 py-3 text-center">Eliminar</th>
                                           <th className="px-3 py-3 text-center">Aprobar</th>
                                        </tr>
                                     </thead>
                                     <tbody className="divide-y divide-slate-50">
                                        {Object.keys(permissions[modKey]).map((featKey) => {
                                           const perms = permissions[modKey][featKey];
                                           const hasRead = perms.read;
                                           return (
                                              <tr key={featKey} className="hover:bg-indigo-50/30 transition-colors">
                                                 <td className="px-5 py-3.5 font-semibold text-slate-700 text-xs">
                                                    {featureNames[featKey] || featKey}
                                                 </td>
                                                 <td className="px-3 py-3 text-center">
                                                    <input 
                                                       type="checkbox" 
                                                       className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                       checked={hasRead}
                                                       onChange={(e) => handlePermissionChange(modKey, featKey, "read", e.target.checked)}
                                                    />
                                                 </td>
                                                 <td className="px-3 py-3 text-center">
                                                    <input 
                                                       type="checkbox" 
                                                       className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                                       checked={perms.write}
                                                       disabled={!hasRead}
                                                       onChange={(e) => handlePermissionChange(modKey, featKey, "write", e.target.checked)}
                                                    />
                                                 </td>
                                                 <td className="px-3 py-3 text-center">
                                                    <input 
                                                       type="checkbox" 
                                                       className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                                       checked={perms.delete}
                                                       disabled={!hasRead}
                                                       onChange={(e) => handlePermissionChange(modKey, featKey, "delete", e.target.checked)}
                                                    />
                                                 </td>
                                                 <td className="px-3 py-3 text-center">
                                                    <input 
                                                       type="checkbox" 
                                                       className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                                       checked={perms.approve}
                                                       disabled={!hasRead}
                                                       onChange={(e) => handlePermissionChange(modKey, featKey, "approve", e.target.checked)}
                                                    />
                                                 </td>
                                              </tr>
                                           );
                                        })}
                                     </tbody>
                                  </table>
                               </div>
                            ))}
                         </div>
                      </div>
                   </div>
                 </div>
               </div>

               <div className="shrink-0 p-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 rounded-b-3xl">
                 <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 rounded-xl font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 transition-colors"
                 >
                    Descartar Edición
                 </button>
                 <button 
                    type="submit" 
                    className="px-8 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
                 >
                    <i className="pi pi-check" />
                    {editingId ? "Actualizar Rol con Permisos" : "Crear y Guardar Matriz"}
                 </button>
               </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
