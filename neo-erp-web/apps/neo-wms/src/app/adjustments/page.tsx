"use client";

import React, { useState, useEffect, useRef } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Dropdown } from 'primereact/dropdown';
import api from '@/lib/api';

export default function WmsAdjustmentsPage() {
  const toast = useRef<Toast>(null);

  // Active Tab: 0 = Ajustes Directos, 1 = Tomas Físicas Masivas
  const [activeTab, setActiveTab] = useState(0);

  // DATA STATES
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [locationsTree, setLocationsTree] = useState<any[]>([]);
  const [reasons, setReasons] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // NEW DIRECT ADJUSTMENT DIALOG STATE
  const [newAdjDialogVisible, setNewAdjDialogVisible] = useState(false);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [selectedReasonId, setSelectedReasonId] = useState<number | null>(null);
  const [movementType, setMovementType] = useState<string>('OUT'); // 'OUT' Descargo, 'IN' Cargo
  const [notes, setNotes] = useState('');
  const [adjLines, setAdjLines] = useState<any[]>([]);
  const [savingAdj, setSavingAdj] = useState(false);

  // VIEW/APPROVE ADJUSTMENT DIALOG STATE
  const [viewAdjDialogVisible, setViewAdjDialogVisible] = useState(false);
  const [selectedAdj, setSelectedAdj] = useState<any | null>(null);
  const [processingApprove, setProcessingApprove] = useState(false);

  // REASONS MANAGEMENT DIALOG STATE
  const [reasonsDialogVisible, setReasonsDialogVisible] = useState(false);
  const [newReasonCode, setNewReasonCode] = useState('');
  const [newReasonName, setNewReasonName] = useState('');
  const [newReasonType, setNewReasonType] = useState('OUT');
  const [newReasonAccount, setNewReasonAccount] = useState('');

  // PHYSICAL INVENTORY SESSION STATE
  const [newSessionDialogVisible, setNewSessionDialogVisible] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [sessionFacilityId, setSessionFacilityId] = useState<number | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);

  // LOAD DATA
  const fetchAdjustments = async () => {
    try {
      const res = await api.get('/wms/adjustments');
      setAdjustments(res.data || []);
    } catch (e) {
      console.error(e);
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar los ajustes directos.' });
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await api.get('/inventory-session/');
      setSessions(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchFacilities = async () => {
    try {
      const res = await api.get('/facilities/');
      setFacilities(res.data || []);
      if (res.data && res.data.length > 0) {
        setSelectedFacilityId(res.data[0].id);
        setSessionFacilityId(res.data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const res = await api.get('/warehouses/');
      setWarehouses(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLocationsTree = async () => {
    try {
      const res = await api.get('/wms/locations/tree');
      setLocationsTree(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchReasons = async () => {
    try {
      const res = await api.get('/wms/adjustment-reasons');
      setReasons(res.data || []);
      if (res.data && res.data.length > 0) {
        setSelectedReasonId(res.data[0].id);
        setMovementType(res.data[0].default_type || 'OUT');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products/?limit=1000');
      const list = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.items || []);
      const formatted = list.map((p: any) => ({
        label: `${p.sku || 'SKU'} - ${p.name || p.product_name} (${p.uom_base || 'PZA'})`,
        value: p.variant_id || p.id,
        sku: p.sku,
        name: p.name || p.product_name,
        cost: p.cost_usd || p.cost || 0.0
      }));
      setProducts(formatted);
    } catch (e) {
      console.error(e);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([
      fetchAdjustments(),
      fetchSessions(),
      fetchFacilities(),
      fetchWarehouses(),
      fetchLocationsTree(),
      fetchReasons(),
      fetchProducts()
    ]);
    setLoading(false);
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Filter Warehouses by Facility
  const filteredWarehouses = React.useMemo(() => {
    if (!selectedFacilityId) return warehouses;
    return warehouses.filter((w: any) => w.facility_id === selectedFacilityId);
  }, [warehouses, selectedFacilityId]);

  // Set default warehouse when facility changes
  useEffect(() => {
    if (filteredWarehouses.length > 0) {
      setSelectedWarehouseId(filteredWarehouses[0].id);
    } else {
      setSelectedWarehouseId(null);
    }
  }, [filteredWarehouses]);

  // Filter Locations by Selected Warehouse
  const availableLocations = React.useMemo(() => {
    if (!selectedWarehouseId) return [];
    const wh = locationsTree.find((w: any) => w.id === selectedWarehouseId);
    return (wh?.locations || []).map((l: any) => ({
      label: `${l.name} (${l.code})`,
      value: l.id
    }));
  }, [locationsTree, selectedWarehouseId]);

  // Handle Reason Change
  const handleReasonChange = (reasonId: number) => {
    setSelectedReasonId(reasonId);
    const r = reasons.find(item => item.id === reasonId);
    if (r) {
      setMovementType(r.default_type || 'OUT');
    }
  };

  // ADD LINE TO ADJUSTMENT
  const addLine = () => {
    setAdjLines(prev => [
      ...prev,
      {
        product_variant_id: products[0]?.value || 0,
        batch_id: null,
        quantity: 1,
        unit_cost: products[0]?.cost || 0.0,
        total_value: products[0]?.cost || 0.0
      }
    ]);
  };

  const updateLine = (index: number, field: string, val: any) => {
    setAdjLines(prev => {
      const copy = [...prev];
      const line = { ...copy[index], [field]: val };

      if (field === 'product_variant_id') {
        const prod = products.find(p => p.value === val);
        if (prod) {
          line.unit_cost = prod.cost || 0.0;
        }
      }

      const q = parseFloat(line.quantity || 0);
      const c = parseFloat(line.unit_cost || 0);
      line.total_value = roundVal(q * c);
      copy[index] = line;
      return copy;
    });
  };

  const removeLine = (index: number) => {
    setAdjLines(prev => prev.filter((_, i) => i !== index));
  };

  const roundVal = (num: number) => Math.round(num * 10000) / 10000;

  // Calculate Total General for New Adjustment Draft
  const calcDraftTotal = React.useMemo(() => {
    return adjLines.reduce((acc, l) => acc + (l.total_value || 0), 0);
  }, [adjLines]);

  // SAVE DIRECT ADJUSTMENT (PENDING)
  const saveDirectAdjustment = async () => {
    if (!selectedFacilityId || !selectedWarehouseId || !selectedReasonId) {
      toast.current?.show({ severity: 'warn', summary: 'Campos Incompletos', detail: 'Seleccione sucursal, almacén y motivo de ajuste.' });
      return;
    }
    if (adjLines.length === 0) {
      toast.current?.show({ severity: 'warn', summary: 'Sin Productos', detail: 'Agregue al menos un producto al ajuste.' });
      return;
    }

    setSavingAdj(true);
    try {
      const payload = {
        facility_id: selectedFacilityId,
        warehouse_id: selectedWarehouseId,
        location_id: selectedLocationId,
        reason_id: selectedReasonId,
        movement_type: movementType,
        notes: notes.trim(),
        lines: adjLines.map(l => ({
          product_variant_id: l.product_variant_id,
          batch_id: l.batch_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost
        }))
      };

      const res = await api.post('/wms/adjustments', payload);
      toast.current?.show({ severity: 'success', summary: 'Ajuste Creado', detail: res.data.message });
      setNewAdjDialogVisible(false);
      setAdjLines([]);
      setNotes('');
      fetchAdjustments();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'No se pudo guardar el ajuste.' });
    }
    setSavingAdj(false);
  };

  // APPROVE ADJUSTMENT
  const handleApproveAdj = async (id: number) => {
    setProcessingApprove(true);
    try {
      const res = await api.post(`/wms/adjustments/${id}/approve`);
      toast.current?.show({ severity: 'success', summary: 'Ajuste Aprobado', detail: res.data.message });
      setViewAdjDialogVisible(false);
      fetchAdjustments();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error de Aprobación', detail: e.response?.data?.detail || 'Fallo al aprobar ajuste.' });
    }
    setProcessingApprove(false);
  };

  // REJECT ADJUSTMENT
  const handleRejectAdj = async (id: number) => {
    setProcessingApprove(true);
    try {
      const res = await api.post(`/wms/adjustments/${id}/reject`);
      toast.current?.show({ severity: 'info', summary: 'Ajuste Rechazado', detail: res.data.message });
      setViewAdjDialogVisible(false);
      fetchAdjustments();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al rechazar.' });
    }
    setProcessingApprove(false);
  };

  // CREATE REASON
  const handleCreateReason = async () => {
    if (!newReasonCode.trim() || !newReasonName.trim()) {
      toast.current?.show({ severity: 'warn', summary: 'Campos Requeridos', detail: 'Ingrese código y nombre del motivo.' });
      return;
    }
    try {
      await api.post('/wms/adjustment-reasons', {
        code: newReasonCode.trim(),
        name: newReasonName.trim(),
        default_type: newReasonType,
        account_code: newReasonAccount.trim()
      });
      toast.current?.show({ severity: 'success', summary: 'Motivo Guardado', detail: 'Motivo de ajuste registrado correctamente.' });
      setNewReasonCode('');
      setNewReasonName('');
      setNewReasonAccount('');
      fetchReasons();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'No se pudo guardar el motivo.' });
    }
  };

  // CREATE PHYSICAL SESSION
  const createSession = async () => {
    if (!sessionName.trim() || !sessionFacilityId) {
      toast.current?.show({ severity: 'warn', summary: 'Incompleto', detail: 'Ingrese nombre y sucursal.' });
      return;
    }
    setCreatingSession(true);
    try {
      await api.post('/inventory-session/', {
        name: sessionName,
        facility_id: sessionFacilityId,
        scope_type: 'GENERAL'
      });
      toast.current?.show({ severity: 'success', summary: 'Toma Física Creada', detail: 'Sesión de recuento lista.' });
      setNewSessionDialogVisible(false);
      setSessionName('');
      fetchSessions();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al crear sesión.' });
    }
    setCreatingSession(false);
  };

  const getAdjStateSeverity = (state: string) => {
    switch (state) {
      case 'PENDING': return 'warning';
      case 'APPROVED': return 'success';
      case 'REJECTED': return 'danger';
      default: return 'info';
    }
  };

  const getAdjStateText = (state: string) => {
    switch (state) {
      case 'PENDING': return 'PENDIENTE APROBACIÓN';
      case 'APPROVED': return 'APROBADO & EJECUTADO';
      case 'REJECTED': return 'RECHAZADO';
      default: return state;
    }
  };

  // Stats calculation
  const totalAdjustedAmount = React.useMemo(() => {
    return adjustments.filter(a => a.state === 'APPROVED').reduce((acc, a) => acc + (a.total_amount || 0), 0);
  }, [adjustments]);

  const pendingCount = React.useMemo(() => {
    return adjustments.filter(a => a.state === 'PENDING').length;
  }, [adjustments]);

  return (
    <div className="p-4 sm:p-8 w-full max-w-[1500px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />

      {/* HEADER BAR */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-indigo-500 to-purple-600"></div>
        <div className="pl-4">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
            <i className="pi pi-sort-alt text-indigo-600 mr-3"></i>Gestión de Ajustes e Inventario Físico
          </h1>
          <p className="text-slate-500 text-sm mt-1">Ajustes directos por mermas, daños y consumos con flujo de aprobación por supervisión y tomas físicas masivas.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            label="⚙️ Catálogo Motivos"
            outlined
            className="font-bold text-slate-700 border-slate-300 hover:bg-slate-50 text-xs"
            onClick={() => setReasonsDialogVisible(true)}
          />
          <Button
            label="+ Nuevo Ajuste Directo"
            icon="pi pi-plus"
            className="font-bold text-xs bg-indigo-600 border-indigo-600 text-white shadow-md hover:bg-indigo-700"
            onClick={() => {
              setAdjLines([{
                product_variant_id: products[0]?.value || 0,
                batch_id: null,
                quantity: 1,
                unit_cost: products[0]?.cost || 0.0,
                total_value: products[0]?.cost || 0.0
              }]);
              setNewAdjDialogVisible(true);
            }}
          />
          <Button
            icon="pi pi-refresh"
            rounded
            outlined
            className="font-bold text-slate-600 border-slate-300 hover:bg-slate-50"
            onClick={loadAllData}
          />
        </div>
      </div>

      {/* TABS SEGMENTED CONTROL */}
      <div className="flex bg-slate-200/70 p-1.5 rounded-2xl w-full max-w-md shadow-inner border border-slate-300/60 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab(0)}
          className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex-1 ${activeTab === 0 ? 'bg-white shadow-md text-indigo-700' : 'text-slate-600 hover:text-slate-800'}`}
        >
          <i className="pi pi-exclamation-triangle"></i>
          Ajustes Directos Puntuales
          {pendingCount > 0 && (
            <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black ml-1">{pendingCount}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab(1)}
          className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex-1 ${activeTab === 1 ? 'bg-white shadow-md text-indigo-700' : 'text-slate-600 hover:text-slate-800'}`}
        >
          <i className="pi pi-check-square"></i>
          Tomas Físicas (Conteos)
        </button>
      </div>

      {/* TAB 0: AJUSTES DIRECTOS */}
      {activeTab === 0 && (
        <div className="space-y-6">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Ajustes Aprobados ($)</span>
                <span className="text-2xl font-black text-slate-800 mt-1 block">${totalAdjustedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl font-bold">
                <i className="pi pi-dollar"></i>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Pendientes por Aprobación</span>
                <span className="text-2xl font-black text-amber-600 mt-1 block">{pendingCount} Solicitudes</span>
              </div>
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-xl font-bold">
                <i className="pi pi-clock"></i>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Registros</span>
                <span className="text-2xl font-black text-slate-800 mt-1 block">{adjustments.length} Movimientos</span>
              </div>
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-xl font-bold">
                <i className="pi pi-list"></i>
              </div>
            </div>
          </div>

          {/* DataTable */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
            <DataTable
              value={adjustments}
              loading={loading}
              paginator
              rows={10}
              emptyMessage="No hay ajustes directos registrados."
              className="p-datatable-sm text-slate-700 text-xs"
              stripedRows
              responsiveLayout="scroll"
            >
              <Column field="number" header="NÚMERO" body={a => <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{a.number}</span>} sortable />
              <Column field="facility_name" header="SUCURSAL" body={a => <span className="font-semibold text-slate-700">{a.facility_name}</span>} sortable />
              <Column field="warehouse_name" header="ALMACÉN" body={a => <span className="font-semibold text-slate-700">{a.warehouse_name}</span>} sortable />
              <Column field="location_name" header="UBICACIÓN" body={a => <span className="font-mono text-slate-600">{a.location_name}</span>} sortable />
              <Column field="reason_name" header="MOTIVO DE AJUSTE" body={a => <span className="font-bold text-slate-800">{a.reason_name}</span>} sortable />
              <Column header="TIPO" body={a => (
                <Tag 
                  value={a.movement_type === 'IN' ? 'CARGO (+)' : 'DESCARGO (-)'} 
                  severity={a.movement_type === 'IN' ? 'success' : 'danger'} 
                  className="font-bold text-[9px] px-2 py-0.5" 
                />
              )} align="center" sortable />
              <Column header="TOTAL GENERAL ($)" body={a => (
                <span className="font-mono font-bold text-slate-900 text-sm">
                  ${(a.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              )} align="right" sortable />
              <Column header="ESTADO" body={a => (
                <Tag severity={getAdjStateSeverity(a.state)} value={getAdjStateText(a.state)} className="font-bold text-[9px] px-2 py-1" />
              )} align="center" sortable />
              <Column field="created_by_name" header="SOLICITADO POR" body={a => <span className="text-slate-600 font-medium">{a.created_by_name}</span>} sortable />
              <Column header="ACCIONES / CONTROL" body={a => (
                <div className="flex items-center justify-center gap-2">
                  <Button
                    label="Ver Detalle"
                    icon="pi pi-eye"
                    severity="secondary"
                    size="small"
                    className="font-bold text-xs"
                    onClick={() => {
                      setSelectedAdj(a);
                      setViewAdjDialogVisible(true);
                    }}
                  />
                  {a.state === 'PENDING' && (
                    <Button
                      label="Aprobar"
                      icon="pi pi-check"
                      severity="success"
                      size="small"
                      className="font-bold text-xs"
                      onClick={() => {
                        setSelectedAdj(a);
                        setViewAdjDialogVisible(true);
                      }}
                    />
                  )}
                </div>
              )} align="center" style={{ width: '13rem' }} />
            </DataTable>
          </div>
        </div>
      )}

      {/* TAB 1: TOMAS FÍSICAS MASIVAS */}
      {activeTab === 1 && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h3 className="text-lg font-bold text-slate-800">Tomas Físicas y Recuentos por Pasillo</h3>
              <p className="text-slate-500 text-xs mt-0.5">Genera una captura masiva teórica e ingresa conteos ciegos para conciliar inventario.</p>
            </div>
            <Button
              label="+ Nueva Toma Física"
              icon="pi pi-plus"
              severity="info"
              className="font-bold text-xs bg-indigo-600 border-indigo-600 text-white"
              onClick={() => setNewSessionDialogVisible(true)}
            />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
            <DataTable
              value={sessions}
              loading={loading}
              paginator
              rows={10}
              emptyMessage="No hay recuentos físicos registrados."
              className="p-datatable-sm text-slate-700 text-xs"
              stripedRows
            >
              <Column field="id" header="ID SESIÓN" body={s => <span className="font-mono font-bold text-slate-700">SES-{s.id}</span>} sortable />
              <Column field="name" header="NOMBRE DE LA TOMA" body={s => <span className="font-bold text-slate-800">{s.name}</span>} sortable />
              <Column field="facility_id" header="SUCURSAL" body={s => <span>Sucursal #{s.facility_id}</span>} sortable />
              <Column field="state" header="ESTADO" body={s => <Tag severity={s.state === 'DONE' ? 'success' : 'warning'} value={s.state} className="font-bold text-[9px]" />} align="center" sortable />
              <Column header="LÍNEAS CONTADAS" body={s => <span className="font-semibold text-slate-700">{s.lines?.length || 0} productos</span>} align="right" />
            </DataTable>
          </div>
        </div>
      )}

      {/* DIÁLOGO: NUEVO AJUSTE DIRECTO */}
      <Dialog
        header="Crear Solicitud de Ajuste Directo de Inventario"
        visible={newAdjDialogVisible}
        onHide={() => setNewAdjDialogVisible(false)}
        style={{ width: '950px' }}
        className="rounded-2xl"
      >
        <div className="flex flex-col gap-6 py-2">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-xs text-indigo-900 font-medium flex items-center justify-between">
            <div className="flex items-center">
              <i className="pi pi-info-circle text-indigo-600 text-xl mr-3"></i>
              <span>Esta solicitud ingresará en estado <b>PENDIENTE APROBACIÓN</b>. El stock no será modificado hasta que un supervisor o gerente apruebe el documento.</span>
            </div>
          </div>

          {/* Form Header Controls */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase">1. SUCURSAL *</label>
              <Dropdown
                value={selectedFacilityId}
                options={facilities}
                optionLabel="name"
                optionValue="id"
                onChange={e => setSelectedFacilityId(e.value)}
                placeholder="Seleccione Sucursal"
                className="w-full text-xs font-bold"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase">2. ALMACÉN *</label>
              <Dropdown
                value={selectedWarehouseId}
                options={filteredWarehouses}
                optionLabel="name"
                optionValue="id"
                onChange={e => setSelectedWarehouseId(e.value)}
                placeholder="Seleccione Almacén"
                className="w-full text-xs font-bold"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase">3. UBICACIÓN / ESTANTE</label>
              <Dropdown
                value={selectedLocationId}
                options={availableLocations}
                optionLabel="label"
                optionValue="value"
                onChange={e => setSelectedLocationId(e.value)}
                placeholder="Ubicación General (Opcional)"
                className="w-full text-xs"
                showClear
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase">4. MOTIVO DE AJUSTE *</label>
              <Dropdown
                value={selectedReasonId}
                options={reasons}
                optionLabel="name"
                optionValue="id"
                onChange={e => handleReasonChange(e.value)}
                placeholder="Seleccione Motivo"
                className="w-full text-xs font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase">TIPO DE MOVIMIENTO</label>
              <div className="flex gap-2 mt-1">
                <Button
                  type="button"
                  label="DESCARGO (-) Salida"
                  icon="pi pi-arrow-down-right"
                  severity={movementType === 'OUT' ? 'danger' : 'secondary'}
                  outlined={movementType !== 'OUT'}
                  onClick={() => setMovementType('OUT')}
                  className="font-bold text-xs flex-1"
                />
                <Button
                  type="button"
                  label="CARGO (+) Entrada"
                  icon="pi pi-arrow-up-right"
                  severity={movementType === 'IN' ? 'success' : 'secondary'}
                  outlined={movementType !== 'IN'}
                  onClick={() => setMovementType('IN')}
                  className="font-bold text-xs flex-1"
                />
              </div>
            </div>

            <div className="md:col-span-2 flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase">JUSTIFICACIÓN / OBSERVACIONES</label>
              <InputText
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ej. Mercancía rota durante estibado en muelle norte..."
                className="text-xs p-inputtext-sm w-full"
              />
            </div>
          </div>

          {/* Items Table */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Detalle de Productos a Ajustar</h3>
              <Button
                type="button"
                label="Añadir Producto"
                icon="pi pi-plus"
                size="small"
                severity="info"
                className="font-bold text-xs"
                onClick={addLine}
              />
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-100 uppercase text-[10px] font-bold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3">PRODUCTO / SKU</th>
                    <th className="p-3 w-32">CANTIDAD</th>
                    <th className="p-3 w-36">COSTO UNITARIO ($)</th>
                    <th className="p-3 w-36 text-right">SUBTOTAL ($)</th>
                    <th className="p-3 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adjLines.map((line, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2">
                        <Dropdown
                          value={line.product_variant_id}
                          options={products}
                          optionLabel="label"
                          optionValue="value"
                          onChange={e => updateLine(idx, 'product_variant_id', e.value)}
                          className="w-full text-xs"
                          filter
                        />
                      </td>
                      <td className="p-2">
                        <InputNumber
                          value={line.quantity}
                          onValueChange={e => updateLine(idx, 'quantity', e.value || 0)}
                          min={0.001}
                          maxFractionDigits={4}
                          inputClassName="p-inputtext-sm text-xs font-bold w-full"
                        />
                      </td>
                      <td className="p-2">
                        <InputNumber
                          value={line.unit_cost}
                          onValueChange={e => updateLine(idx, 'unit_cost', e.value || 0)}
                          mode="currency"
                          currency="USD"
                          locale="en-US"
                          inputClassName="p-inputtext-sm text-xs font-bold w-full"
                        />
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-slate-900">
                        ${(line.total_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 text-center">
                        <Button
                          icon="pi pi-trash"
                          rounded
                          text
                          severity="danger"
                          size="small"
                          onClick={() => removeLine(idx)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-800">
                  <tr>
                    <td colSpan={3} className="p-3 text-right uppercase text-[11px] tracking-wider">Total General del Ajuste ($):</td>
                    <td className="p-3 text-right font-mono text-base text-indigo-700 font-black">
                      ${calcDraftTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-200">
            <Button
              label="Cancelar"
              outlined
              severity="secondary"
              className="font-bold text-xs"
              onClick={() => setNewAdjDialogVisible(false)}
            />
            <Button
              label="Guardar Solicitud (Pendiente)"
              icon="pi pi-send"
              severity="indigo"
              loading={savingAdj}
              className="font-bold text-xs bg-indigo-600 border-indigo-600 text-white"
              onClick={saveDirectAdjustment}
            />
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO: VER Y APROBAR / RECHAZAR AJUSTE */}
      <Dialog
        header={`Solicitud de Ajuste Directo: ${selectedAdj?.number || ''}`}
        visible={viewAdjDialogVisible}
        onHide={() => setViewAdjDialogVisible(false)}
        style={{ width: '850px' }}
        className="rounded-2xl"
      >
        {selectedAdj && (
          <div className="flex flex-col gap-6 py-2 text-xs">
            {/* Header info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 font-bold uppercase block text-[10px]">SUCURSAL</span>
                <span className="font-bold text-slate-800 block mt-0.5">{selectedAdj.facility_name}</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase block text-[10px]">ALMACÉN / UBICACIÓN</span>
                <span className="font-bold text-slate-800 block mt-0.5">{selectedAdj.warehouse_name} ({selectedAdj.location_name})</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase block text-[10px]">MOTIVO DE AJUSTE</span>
                <span className="font-bold text-slate-800 block mt-0.5">{selectedAdj.reason_name}</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase block text-[10px]">ESTADO</span>
                <Tag severity={getAdjStateSeverity(selectedAdj.state)} value={getAdjStateText(selectedAdj.state)} className="font-bold text-[9px] mt-1" />
              </div>
            </div>

            {selectedAdj.notes && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-slate-700 italic">
                <b>Observaciones:</b> "{selectedAdj.notes}"
              </div>
            )}

            {/* Lines Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left text-slate-700">
                <thead className="bg-slate-100 uppercase text-[10px] font-bold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3">SKU</th>
                    <th className="p-3">PRODUCTO</th>
                    <th className="p-3 text-right">CANTIDAD</th>
                    <th className="p-3 text-right">COSTO UNIT. ($)</th>
                    <th className="p-3 text-right">SUBTOTAL ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(selectedAdj.lines || []).map((line: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-slate-700">{line.sku}</td>
                      <td className="p-3 font-bold text-slate-800">{line.product_name}</td>
                      <td className="p-3 text-right font-bold text-slate-800">{line.quantity}</td>
                      <td className="p-3 text-right font-mono text-slate-700">${(line.unit_cost || 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">${(line.total_value || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200 font-bold">
                  <tr>
                    <td colSpan={4} className="p-3 text-right uppercase text-[11px] tracking-wider">TOTAL GENERAL DEL AJUSTE ($):</td>
                    <td className="p-3 text-right font-mono text-sm text-indigo-700 font-black">${(selectedAdj.total_amount || 0).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Approval Controls */}
            {selectedAdj.state === 'PENDING' ? (
              <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                <Button
                  label="Rechazar Ajuste"
                  icon="pi pi-times"
                  severity="danger"
                  outlined
                  loading={processingApprove}
                  className="font-bold text-xs"
                  onClick={() => handleRejectAdj(selectedAdj.id)}
                />
                <Button
                  label="Aprobar Ajuste (Supervisor)"
                  icon="pi pi-check-circle"
                  severity="success"
                  loading={processingApprove}
                  className="font-bold text-xs bg-emerald-600 border-emerald-600 text-white shadow-md"
                  onClick={() => handleApproveAdj(selectedAdj.id)}
                />
              </div>
            ) : (
              <div className="text-right text-slate-500 font-medium text-xs pt-2">
                {selectedAdj.state === 'APPROVED' ? (
                  <span>✅ Aprobado por <b>{selectedAdj.approved_by_name || 'Supervisor'}</b> en fecha {selectedAdj.approved_at ? new Date(selectedAdj.approved_at).toLocaleString() : ''}</span>
                ) : (
                  <span>❌ Rechazado por <b>{selectedAdj.approved_by_name || 'Supervisor'}</b></span>
                )}
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* DIÁLOGO: CATÁLOGO DE MOTIVOS DE AJUSTE */}
      <Dialog
        header="Catálogo de Motivos de Ajuste & Cuentas Contables"
        visible={reasonsDialogVisible}
        onHide={() => setReasonsDialogVisible(false)}
        style={{ width: '700px' }}
        className="rounded-2xl"
      >
        <div className="flex flex-col gap-6 py-2 text-xs">
          {/* Create new reason form */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800 uppercase text-[11px] tracking-wider">Añadir Nuevo Motivo de Ajuste</h4>
            <div className="grid grid-cols-2 gap-3">
              <InputText
                value={newReasonCode}
                onChange={e => setNewReasonCode(e.target.value)}
                placeholder="Código (Ej. MERMA_02)"
                className="text-xs p-inputtext-sm font-mono font-bold uppercase"
              />
              <InputText
                value={newReasonName}
                onChange={e => setNewReasonName(e.target.value)}
                placeholder="Nombre (Ej. Rotura en Transporte)"
                className="text-xs p-inputtext-sm"
              />
              <Dropdown
                value={newReasonType}
                options={[{ label: 'Descargo (-) Salida', value: 'OUT' }, { label: 'Cargo (+) Entrada', value: 'IN' }]}
                optionLabel="label"
                optionValue="value"
                onChange={e => setNewReasonType(e.value)}
                className="text-xs"
              />
              <InputText
                value={newReasonAccount}
                onChange={e => setNewReasonAccount(e.target.value)}
                placeholder="Cuenta Contable (Ej. 6.1.02.05)"
                className="text-xs p-inputtext-sm font-mono"
              />
            </div>
            <div className="text-right">
              <Button
                label="Guardar Motivo"
                icon="pi pi-plus"
                size="small"
                severity="info"
                className="font-bold text-xs"
                onClick={handleCreateReason}
              />
            </div>
          </div>

          {/* List of Reasons */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left text-slate-700">
              <thead className="bg-slate-100 uppercase text-[10px] font-bold text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="p-3">CÓDIGO</th>
                  <th className="p-3">MOTIVO DE AJUSTE</th>
                  <th className="p-3">TIPO</th>
                  <th className="p-3">CUENTA CONTABLE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reasons.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-slate-800">{r.code}</td>
                    <td className="p-3 font-bold text-slate-800">{r.name}</td>
                    <td className="p-3">
                      <Tag severity={r.default_type === 'IN' ? 'success' : 'danger'} value={r.default_type === 'IN' ? 'Cargo (+)' : 'Descargo (-)'} className="text-[9px] font-bold" />
                    </td>
                    <td className="p-3 font-mono text-slate-600">{r.account_code || 'Por Asignar'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO: NUEVA TOMA FÍSICA MASIVA */}
      <Dialog
        header="Crear Nueva Toma Física de Inventario"
        visible={newSessionDialogVisible}
        onHide={() => setNewSessionDialogVisible(false)}
        style={{ width: '500px' }}
      >
        <div className="flex flex-col gap-4 py-2 text-xs">
          <div className="flex flex-col gap-1">
            <label className="font-bold text-slate-600">Nombre de la Toma / Conteo *</label>
            <InputText
              value={sessionName}
              onChange={e => setSessionName(e.target.value)}
              placeholder="Ej. Conteo Anual de Pasillo Central 2026"
              className="text-xs p-inputtext-sm"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-bold text-slate-600">Sucursal *</label>
            <Dropdown
              value={sessionFacilityId}
              options={facilities}
              optionLabel="name"
              optionValue="id"
              onChange={e => setSessionFacilityId(e.value)}
              placeholder="Seleccione Sucursal"
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-slate-200">
            <Button label="Cancelar" outlined severity="secondary" className="font-bold text-xs" onClick={() => setNewSessionDialogVisible(false)} />
            <Button label="Crear Sesión" icon="pi pi-check" loading={creatingSession} className="font-bold text-xs bg-indigo-600 text-white" onClick={createSession} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
