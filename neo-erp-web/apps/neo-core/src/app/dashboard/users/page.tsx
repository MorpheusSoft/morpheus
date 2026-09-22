"use client";

import { useEffect, useState } from "react";
import { getUsers, createUser, updateUser, generateUserPairingLink } from "@/app/actions/users";
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
  const [telegramUsername, setTelegramUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);
  const [selectedFacilities, setSelectedFacilities] = useState<number[]>([]);

  // Invite Modal State
  const [inviteModalUser, setInviteModalUser] = useState<any | null>(null);
  const [inviteData, setInviteData] = useState<any | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
    setTelegramUsername("");
    setPhoneNumber("");
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
    setTelegramUsername(u.telegram_username ? `@${u.telegram_username.replace(/^@+/, "")}` : "");
    setPhoneNumber(u.phone_number || "");
    setIsActive(u.is_active);
    setIsSuperuser(u.is_superuser);
    setSelectedRoles(u.roles?.map((r:any) => r.id) || []);
    setSelectedFacilities(u.facilities?.map((f:any) => f.id) || []);
    setIsModalOpen(true);
  };

  const openInviteModal = async (u: any) => {
    setInviteModalUser(u);
    setInviteData(null);
    setLoadingInvite(true);
    setCopiedKey(null);
    try {
      const res = await generateUserPairingLink(u.id);
      setInviteData(res);
    } catch (err: any) {
      alert(err.message || "Error generando enlace de invitación");
      setInviteModalUser(null);
    } finally {
      setLoadingInvite(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
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
    const cleanTg = telegramUsername.trim().replace(/^@+/, "");
    const cleanPhone = phoneNumber.trim().replace(/[\s-]/g, "");

    const payload: any = { 
       email, 
       full_name: fullName, 
       is_active: isActive,
       is_superuser: isSuperuser,
       telegram_username: cleanTg || "",
       phone_number: cleanPhone || "",
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
                <th className="px-6 py-4">Canales Asistentes</th>
                <th className="px-6 py-4">Estatus</th>
                <th className="px-6 py-4 text-right rounded-tr-2xl">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-3">
                     <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${u.user_type === 'DIGITAL_WORKER' ? 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/20' : u.is_superuser ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-100 text-slate-500'}`}>
                        {u.user_type === 'DIGITAL_WORKER' ? <i className="pi pi-android text-xs"></i> : (u.full_name?.substring(0,2)?.toUpperCase() || 'US')}
                     </div>
                     <div>
                        <div className="flex items-center gap-2">
                           <span>{u.full_name}</span>
                           {u.user_type === 'DIGITAL_WORKER' && (
                              <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-purple-200 inline-flex items-center gap-1">
                                 <i className="pi pi-android text-[10px]"></i> Empleado Digital
                              </span>
                           )}
                        </div>
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
                     <div className="flex flex-col gap-1">
                        {u.telegram_username ? (
                           <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-lg w-fit">
                              <i className="pi pi-send text-[10px]"></i> @{u.telegram_username}
                           </span>
                        ) : u.telegram_chat_id ? (
                           <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-600 bg-sky-50/70 border border-sky-100 px-2 py-0.5 rounded-lg w-fit">
                              <i className="pi pi-check text-[10px]"></i> Telegram ID
                           </span>
                        ) : (
                           <span className="text-[11px] text-slate-400 italic">Sin Telegram</span>
                        )}
                        {u.phone_number ? (
                           <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg w-fit">
                              <i className="pi pi-whatsapp text-[10px]"></i> {u.phone_number}
                           </span>
                        ) : null}
                     </div>
                  </td>
                  <td className="px-6 py-4">
                     {u.is_active ? (
                        <span className="text-emerald-500 font-bold flex items-center gap-1 text-xs"><i className="pi pi-check-circle"></i> Activo</span>
                     ) : (
                        <span className="text-rose-500 font-bold flex items-center gap-1 text-xs bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200 w-fit"><i className="pi pi-lock"></i> Bloqueado</span>
                     )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {u.user_type !== "DIGITAL_WORKER" && (
                        <button 
                          onClick={() => openInviteModal(u)}
                          className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                          title="Generar enlace o invitar a Telegram"
                        >
                          <i className="pi pi-send text-xs"></i>
                          <span>Invitar</span>
                        </button>
                      )}
                      <button 
                        onClick={() => openEditModal(u)}
                        className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="Administrar"
                      >
                        <i className="pi pi-pencil"></i>
                      </button>
                    </div>
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

                  {/* Canales Digitales (Telegram & WhatsApp) */}
                  <div className="bg-sky-50/50 p-4 rounded-2xl border border-sky-100">
                    <h4 className="font-bold text-sky-950 text-sm mb-1 flex items-center gap-2">
                      <i className="pi pi-send text-sky-600"></i> Canales de Asistentes IA (Telegram & WhatsApp)
                    </h4>
                    <p className="text-xs text-sky-800/80 mb-4">
                      Al asignar su usuario de Telegram o teléfono, los asistentes digitales (Clara, Dante, Valeria y Arturo)
                      lo reconocerán y autorizarán de forma inmediata sin que tenga que ingresar a Neo.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                          <i className="pi pi-send text-sky-500 text-xs"></i> Usuario de Telegram
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 text-sm font-mono font-bold">
                            @
                          </span>
                          <input
                            type="text"
                            value={telegramUsername.replace(/^@+/, "")}
                            onChange={(e) => setTelegramUsername(e.target.value)}
                            className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition-all text-sm font-mono placeholder:text-slate-400"
                            placeholder="Alfiorp"
                          />
                        </div>
                        <span className="text-[11px] text-slate-400 mt-1 block">
                          Nombre de usuario en Telegram (sin espacios).
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                          <i className="pi pi-whatsapp text-emerald-600 text-xs"></i> Teléfono Móvil / WhatsApp
                        </label>
                        <input
                          type="text"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm placeholder:text-slate-400"
                          placeholder="+584141234567"
                        />
                        <span className="text-[11px] text-slate-400 mt-1 block">
                          Formato internacional con código de país.
                        </span>
                      </div>
                    </div>
                  </div>

                 {/* Privileges */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Roles Selector */}
                    <div>
                       <h4 className="font-bold text-slate-700 text-sm mb-3"><i className="pi pi-id-card mr-1 text-slate-400"></i> Asignación de Roles</h4>
                       <div className="border border-slate-200 rounded-xl overflow-hidden bg-white max-h-60 overflow-y-auto custom-scrollbar divide-y divide-slate-100">
                          {roles
                             .slice()
                             .sort((a, b) => {
                                const aIsDigital = a.name.toLowerCase().includes("digital");
                                const bIsDigital = b.name.toLowerCase().includes("digital");
                                if (aIsDigital && !bIsDigital) return 1;
                                if (!aIsDigital && bIsDigital) return -1;
                                return a.name.localeCompare(b.name);
                             })
                             .map(r => {
                                const isDigital = r.name.toLowerCase().includes("digital");
                                return (
                                   <label key={r.id} className="flex items-start gap-3 p-3 hover:bg-slate-50 cursor-pointer transition-colors">
                                      <input 
                                         type="checkbox" 
                                         checked={selectedRoles.includes(r.id)}
                                         onChange={() => toggleRole(r.id)}
                                         className="w-4 h-4 mt-0.5 text-indigo-600 rounded bg-slate-100 border-slate-300 focus:ring-indigo-500 focus:ring-2"
                                      />
                                      <div className="flex-1 min-w-0">
                                         <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-slate-800">{r.name}</span>
                                            {isDigital && (
                                               <span className="text-[10px] bg-purple-50 text-purple-700 font-bold px-1.5 py-0.5 rounded border border-purple-200">
                                                  Agente IA
                                               </span>
                                            )}
                                         </div>
                                         {r.description && (
                                            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1 leading-tight">{r.description}</p>
                                         )}
                                      </div>
                                   </label>
                                );
                             })}
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

      {/* Modal Invitar a Asistentes Digitales */}
      {inviteModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setInviteModalUser(null)}
          ></div>

          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 animate-slide-up relative z-10">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-500 text-white flex items-center justify-center font-bold shadow-md shadow-sky-500/20">
                  <i className="pi pi-send text-lg"></i>
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">
                    Invitar a {inviteModalUser.full_name}
                  </h3>
                  <p className="text-xs text-slate-400">Vinculación de Asistentes Digitales de Neo ERP</p>
                </div>
              </div>
              <button
                onClick={() => setInviteModalUser(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center"
              >
                <i className="pi pi-times"></i>
              </button>
            </div>

            {loadingInvite ? (
              <div className="py-12 text-center text-slate-400">
                <i className="pi pi-spinner animate-spin text-3xl mb-3 text-sky-500"></i>
                <p className="text-sm font-semibold">Generando enlaces de invitación seguros...</p>
              </div>
            ) : inviteData ? (
              <div className="space-y-4">
                {/* Auto-pair notification if username exists */}
                {inviteData.telegram_username ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5">
                    <i className="pi pi-check-circle text-emerald-600 mt-0.5"></i>
                    <div className="text-xs text-emerald-900 leading-relaxed">
                      <strong>Auto-vinculación activa:</strong> Este usuario ya está pre-autorizado como{" "}
                      <span className="font-bold font-mono">@{inviteData.telegram_username}</span>. Con solo abrir
                      cualquiera de los bots y escribir <code className="bg-emerald-100 px-1 py-0.5 rounded">/start</code>{" "}
                      quedará vinculado de inmediato.
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5">
                    <i className="pi pi-info-circle text-amber-600 mt-0.5"></i>
                    <div className="text-xs text-amber-900 leading-relaxed">
                      El usuario aún no tiene un <code>@usuario</code> de Telegram asignado en su ficha. Puedes enviarle el
                      siguiente PIN o enlace directo para que se vincule con un solo clic.
                    </div>
                  </div>
                )}

                {/* PIN Display */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    PIN de Vinculación de un solo uso
                  </span>
                  <span className="text-2xl font-black font-mono tracking-widest text-indigo-600">
                    {inviteData.pairing_pin}
                  </span>
                </div>

                {/* Direct Bot Links */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Enlaces Directos por Asistente (1 Clic):
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {Object.entries(inviteData.bot_links || {}).map(([code, bot]: any) => (
                      <div
                        key={code}
                        className="p-3 bg-white border border-slate-200 hover:border-sky-300 rounded-xl flex items-center justify-between gap-3 transition-colors shadow-2xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-slate-800 truncate">{bot.worker_name}</div>
                          <div className="text-[11px] text-sky-600 font-mono truncate">@{bot.bot_username}</div>
                        </div>
                        <button
                          onClick={() => copyToClipboard(bot.deep_link, code)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                            copiedKey === code
                              ? "bg-emerald-600 text-white"
                              : "bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200"
                          }`}
                        >
                          <i className={`pi ${copiedKey === code ? "pi-check" : "pi-copy"} text-xs`}></i>
                          <span>{copiedKey === code ? "Copiado!" : "Copiar Enlace"}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Share Full Message */}
                {inviteData.bot_links && Object.values(inviteData.bot_links)[0] && (
                  <button
                    onClick={() => {
                      const firstBot: any = Object.values(inviteData.bot_links)[0];
                      const msg = `Hola ${inviteModalUser.full_name}, te invito a interactuar con los Asistentes Digitales de Neo ERP. Haz clic aquí para comenzar de inmediato: ${firstBot.deep_link}`;
                      copyToClipboard(msg, "FULL_MESSAGE");
                    }}
                    className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                      copiedKey === "FULL_MESSAGE"
                        ? "bg-emerald-600 text-white"
                        : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20"
                    }`}
                  >
                    <i className={`pi ${copiedKey === "FULL_MESSAGE" ? "pi-check" : "pi-comment"}`}></i>
                    <span>{copiedKey === "FULL_MESSAGE" ? "¡Mensaje Copiado al Portapapeles!" : "Copiar Mensaje de Invitación"}</span>
                  </button>
                )}
              </div>
            ) : null}

            <div className="mt-4 pt-4 border-t border-slate-100 text-right">
              <button
                onClick={() => setInviteModalUser(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
