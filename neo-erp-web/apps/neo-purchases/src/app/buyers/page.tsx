'use client';

import React, { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { MultiSelect } from 'primereact/multiselect';
import { InputText } from 'primereact/inputtext';
import { Checkbox } from 'primereact/checkbox';
import axios from 'axios';

export default function BuyersPage() {
  const [buyers, setBuyers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Dialog State
  const [showDialog, setShowDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Form State
  const [buyerId, setBuyerId] = useState<number | null>(null);
  const [userId, setUserId] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [assignedCategories, setAssignedCategories] = useState<number[]>([]);
  
  // Mocking users (in a real app, fetch from IAM/core.users)
  const [users] = useState<any[]>([
      { id: 1, name: 'Admin Principal' },
      { id: 2, name: 'Alejandro Zambrano (Compras)' },
      { id: 3, name: 'María García (Alimentos)' },
      { id: 4, name: 'Pedro Pérez (Ferretería)' }
  ]);

  const loadData = async () => {
      setLoading(true);
      try {
          const [bRes, cRes] = await Promise.all([
              axios.get('http://localhost:8000/api/v1/buyers/'),
              axios.get('http://localhost:8000/api/v1/categories/')
          ]);
          setBuyers(bRes.data);
          setCategories(cRes.data);
      } catch (e) {
          console.error(e);
      }
      setLoading(false);
  };

  useEffect(() => {
      loadData();
  }, []);

  const openNew = () => {
      setBuyerId(null);
      setUserId(0);
      setIsActive(true);
      setAssignedCategories([]);
      setIsEditing(false);
      setShowDialog(true);
  };

  const openEdit = (buyer: any) => {
      setBuyerId(buyer.id);
      setUserId(buyer.user_id);
      setIsActive(buyer.is_active);
      setAssignedCategories(buyer.assigned_categories || []);
      setIsEditing(true);
      setShowDialog(true);
  };

  const saveBuyer = async () => {
      if (userId === 0) return alert("Debe seleccionar un usuario válido.");
      
      const payload = {
          user_id: userId,
          is_active: isActive,
          assigned_categories: assignedCategories,
          assigned_facilities: [],
          assigned_suppliers: []
      };

      try {
          if (isEditing && buyerId) {
              await axios.put(`http://localhost:8000/api/v1/buyers/${buyerId}`, payload);
          } else {
              await axios.post('http://localhost:8000/api/v1/buyers/', payload);
          }
          setShowDialog(false);
          loadData();
      } catch (e: any) {
          alert('Error: ' + (e.response?.data?.detail || e.message));
      }
  };

  const deleteBuyer = async (id: number) => {
      if (!confirm("¿Deshabilitar o eliminar este perfil de compras?")) return;
      try {
          await axios.delete(`http://localhost:8000/api/v1/buyers/${id}`);
          loadData();
      } catch (e) {
          console.error(e);
      }
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-8">
      <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden relative">
         <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500"></div>
         <div className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
               <div>
                 <h2 className="text-3xl font-extrabold text-slate-900 m-0 tracking-tight">Perfiles de Compradores</h2>
                 <p className="text-slate-500 text-sm mt-1 font-medium">Asigne ramas, almacenes y permisos operativos a cada usuario de compras.</p>
               </div>
               <Button label="Crear Comprador" icon="pi pi-user-plus" onClick={openNew} className="!bg-emerald-600 !border-none !rounded-full !shadow-md hover:!bg-emerald-700 hover:!shadow-lg transition-all !px-6 !py-2.5 font-bold" />
            </div>

            <DataTable value={buyers} loading={loading} className="border border-slate-200 rounded-2xl overflow-hidden text-sm" emptyMessage="No hay compradores registrados.">
               <Column field="id" header="ID" className="font-bold text-slate-500 w-16" />
               <Column header="USUARIO SISTEMA" body={(r) => {
                   const u = users.find(x => x.id === r.user_id);
                   return <span className="font-bold text-slate-800">{u ? u.name : `User ID ${r.user_id}`}</span>;
               }} />
               <Column header="NIVEL DE ACCESO Y CATEGORÍAS" body={(r) => (
                   <div className="flex flex-wrap gap-1">
                      {(r.assigned_categories && r.assigned_categories.length > 0) ? r.assigned_categories.map((cId: number) => {
                          const cat = categories.find(c => c.id === cId);
                          return <span key={cId} className="bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-extrabold uppercase px-2 py-1 rounded-md">{cat ? cat.name : cId}</span>;
                      }) : <span className="text-slate-400 italic font-medium text-xs">Acceso Global Remoto</span>}
                   </div>
               )} />
               <Column header="ESTADO" body={(r) => (
                   r.is_active 
                     ? <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">Activo</span>
                     : <span className="bg-rose-50 text-rose-600 px-3 py-1 rounded-full text-xs font-bold border border-rose-200">Inactivo</span>
               )} className="w-24 text-center" />
               <Column header="ACCIONES" body={(r) => (
                   <div className="flex justify-end gap-1">
                      <Button icon="pi pi-pencil" text rounded onClick={() => openEdit(r)} className="text-blue-500 hover:bg-blue-50" />
                      <Button icon="pi pi-trash" text rounded severity="danger" onClick={() => deleteBuyer(r.id)} className="hover:bg-rose-50" />
                   </div>
               )} className="w-28" />
            </DataTable>
         </div>
      </div>

      <Dialog header={isEditing ? "Editar Comprador" : "Nuevo Rol de Comprador"} visible={showDialog} style={{ width: '35vw' }} onHide={() => setShowDialog(false)} className="rounded-2xl">
         <div className="flex flex-col gap-6 pt-4">
             <div className="flex flex-col gap-2">
                 <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Usuario IAM del Sistema</label>
                 <select 
                     value={userId} 
                     onChange={(e) => setUserId(Number(e.target.value))}
                     className="p-3 bg-slate-50 border border-slate-200 rounded-xl w-full text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                     disabled={isEditing}
                 >
                     <option value={0}>Seleccione Usuario...</option>
                     {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                 </select>
             </div>

             <div className="flex flex-col gap-2">
                 <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ramas de Inventario Permitidas</label>
                 <MultiSelect 
                     value={assignedCategories} 
                     onChange={(e) => setAssignedCategories(e.value)} 
                     options={categories} 
                     optionLabel="name" 
                     optionValue="id" 
                     placeholder="Acceso Global (Todas)"
                     display="chip"
                     filter
                     className="w-full !rounded-xl !border-slate-200 p-inputtext-sm" 
                 />
                 <small className="text-slate-400 font-medium">Dejar en blanco para otorgar permisos a todas las familias de insumos.</small>
             </div>

             <div className="flex gap-3 items-center bg-slate-50 p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setIsActive(!isActive)}>
                 <Checkbox inputId="active" checked={isActive} />
                 <div className="flex flex-col">
                    <span className="font-bold text-slate-700 text-sm">Perfil Operativo Activo</span>
                    <span className="text-xs text-slate-500">El comprador podrá emitir y autorizar sugerencias MRP.</span>
                 </div>
             </div>

             <Button label={isEditing ? "Actualizar Rol" : "Registrar Comprador"} icon="pi pi-check" onClick={saveBuyer} className="mt-4 !bg-emerald-600 hover:!bg-emerald-700 !text-white !font-bold !border-none !rounded-xl py-3 w-full shadow-lg shadow-emerald-500/30" />
         </div>
      </Dialog>
    </div>
  );
}
