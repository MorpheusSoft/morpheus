"use client";

import React, { useState, useEffect, useRef } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import api from '@/lib/api';

export default function WmsAdjustmentsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useRef<Toast>(null);

  // New Session state
  const [newDialogVisible, setNewDialogVisible] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [facilities, setFacilities] = useState<any[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory-session/');
      setSessions(res.data || []);
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar los recuentos físicos.' });
    }
    setLoading(false);
  };

  const fetchFacilities = async () => {
    try {
      const res = await api.get('/facilities/');
      setFacilities(res.data || []);
      if (res.data && res.data.length > 0) {
        setSelectedFacilityId(res.data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchFacilities();
  }, []);

  const createSession = async () => {
    if (!sessionName.trim() || !selectedFacilityId) {
      toast.current?.show({ severity: 'warn', summary: 'Incompleto', detail: 'Ingrese nombre y sucursal.' });
      return;
    }

    setCreating(true);
    try {
      await api.post('/inventory-session/', {
        name: sessionName,
        facility_id: selectedFacilityId,
        scope_type: 'GENERAL'
      });
      toast.current?.show({ severity: 'success', summary: 'Toma Física Creada', detail: 'Sesión de recuento lista.' });
      setNewDialogVisible(false);
      setSessionName('');
      fetchSessions();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al crear sesión.' });
    }
    setCreating(false);
  };

  const getStatusSeverity = (state: string) => {
    switch (state) {
      case 'DRAFT': return 'warning';
      case 'IN_PROGRESS': return 'info';
      case 'VALIDATED': return 'success';
      case 'CANCELLED': return 'danger';
      default: return 'secondary';
    }
  };

  return (
    <div className="p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex justify-between items-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500"></div>
        <div className="pl-4">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
            <i className="pi pi-sort-alt text-indigo-500 mr-3"></i>Ajustes Físicos y Tomas de Inventario
          </h1>
          <p className="text-slate-500 text-sm mt-1">Conteo ciego por ubicación, detección de anomalías y ajuste automático de Kardex.</p>
        </div>

        <div className="flex gap-3">
          <Button label="Nueva Toma Física" icon="pi pi-plus" severity="info" onClick={() => setNewDialogVisible(true)} className="font-bold bg-indigo-600 border-none shadow-md" />
          <Button icon="pi pi-refresh" rounded outlined onClick={fetchSessions} />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <DataTable value={sessions} loading={loading} emptyMessage="No hay recuentos físicos registrados." size="small" stripedRows rowHover className="text-sm">
          <Column header="ID SESIÓN" field="id" body={s => <span className="font-mono font-bold text-xs bg-slate-100 px-2 py-1 rounded">#{s.id}</span>} style={{ width: '6rem' }} />
          <Column header="NOMBRE DE LA TOMA" field="name" body={s => <span className="font-bold text-slate-800">{s.name}</span>} />
          <Column header="SUCURSAL" field="facility_id" body={s => {
            const fac = facilities.find(f => f.id === s.facility_id);
            return <span className="font-semibold text-slate-600">{fac ? fac.name : `Sucursal #${s.facility_id}`}</span>;
          }} />
          <Column header="ESTADO" body={s => <Tag severity={getStatusSeverity(s.state)} value={s.state} className="font-extrabold text-[9px]" />} align="center" />
          <Column header="LÍNEAS CONTADAS" body={s => <span className="font-bold">{s.lines?.length || 0} ítems</span>} align="center" />
        </DataTable>
      </div>

      {/* DIÁLOGO NUEVA TOMA FÍSICA */}
      <Dialog header="Crear Nueva Toma Física de Inventario" visible={newDialogVisible} onHide={() => setNewDialogVisible(false)} style={{ width: '400px' }}>
        <div className="flex flex-col gap-4 py-2">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nombre de la Toma / Auditoría:</label>
            <InputText 
              value={sessionName} 
              onChange={(e) => setSessionName(e.target.value)} 
              placeholder="Ej: Auditoría Pasillo 1 - Agosto" 
              className="w-full text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Sucursal:</label>
            <Dropdown 
              value={selectedFacilityId} 
              options={facilities.map(f => ({ label: f.name, value: f.id }))} 
              onChange={(e) => setSelectedFacilityId(e.value)} 
              className="w-full text-xs font-bold"
            />
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button label="Cancelar" text severity="secondary" onClick={() => setNewDialogVisible(false)} />
            <Button label="Crear Toma Física" severity="info" loading={creating} onClick={createSession} className="font-bold bg-indigo-600 border-none" />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
