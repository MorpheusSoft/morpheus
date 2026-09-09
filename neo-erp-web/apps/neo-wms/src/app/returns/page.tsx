"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Calendar } from 'primereact/calendar';
import { Dropdown } from 'primereact/dropdown';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Toast } from 'primereact/toast';
import { Dialog } from 'primereact/dialog';
import { Tag } from 'primereact/tag';
import { InputTextarea } from 'primereact/inputtextarea';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function ReturnsAndSwapsPage() {
  const [activeTab, setActiveTab] = useState<'rtv' | 'swaps'>('rtv');
  const [loading, setLoading] = useState(false);
  const toast = useRef<Toast>(null);
  const router = useRouter();

  // Reference Catalogs
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);

  // Filter States
  const [selectedFacility, setSelectedFacility] = useState<number | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Tab 1: Supplier Returns (RTV) Data
  const [returnsList, setReturnsList] = useState<any[]>([]);
  const [newReturnDialog, setNewReturnDialog] = useState(false);
  const [dispatchDialog, setDispatchDialog] = useState(false);
  const [selectedReturnForDispatch, setSelectedReturnForDispatch] = useState<any>(null);
  const [detailDialog, setDetailDialog] = useState(false);
  const [selectedReturnDetail, setSelectedReturnDetail] = useState<any>(null);

  // New Return Form State
  const [newRtvFacilityId, setNewRtvFacilityId] = useState<number | null>(null);
  const [newRtvSupplierId, setNewRtvSupplierId] = useState<number | null>(null);
  const [newRtvPoId, setNewRtvPoId] = useState<number | null>(null);
  const [newRtvCarrierName, setNewRtvCarrierName] = useState('');
  const [newRtvCarrierDoc, setNewRtvCarrierDoc] = useState('');
  const [newRtvCarrierPlate, setNewRtvCarrierPlate] = useState('');
  const [newRtvNotes, setNewRtvNotes] = useState('');
  const [newRtvLines, setNewRtvLines] = useState<any[]>([]);

  // Dispatch Form State
  const [dispatchCarrierName, setDispatchCarrierName] = useState('');
  const [dispatchCarrierDoc, setDispatchCarrierDoc] = useState('');
  const [dispatchCarrierPlate, setDispatchCarrierPlate] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');

  // Tab 2: Vendor Swaps (Canjes 1 a 1) Data
  const [swapsList, setSwapsList] = useState<any[]>([]);
  const [newSwapDialog, setNewSwapDialog] = useState(false);
  const [executeSwapDialog, setExecuteSwapDialog] = useState(false);
  const [selectedSwapForExecution, setSelectedSwapForExecution] = useState<any>(null);
  const [swapHistoryDialog, setSwapHistoryDialog] = useState(false);
  const [selectedSwapHistory, setSelectedSwapHistory] = useState<any>(null);

  // New Swap Form State
  const [newSwapFacilityId, setNewSwapFacilityId] = useState<number | null>(null);
  const [newSwapSupplierId, setNewSwapSupplierId] = useState<number | null>(null);
  const [newSwapVariantId, setNewSwapVariantId] = useState<number | null>(null);
  const [newSwapBatchId, setNewSwapBatchId] = useState<number | null>(null);
  const [newSwapQty, setNewSwapQty] = useState<number>(1);
  const [newSwapReason, setNewSwapReason] = useState('ROTURA/AVERIA');
  const [newSwapNotes, setNewSwapNotes] = useState('');

  // Execute Swap Form State
  const [execQty, setExecQty] = useState<number>(1);
  const [execBatchNumber, setExecBatchNumber] = useState('');
  const [execExpiryDate, setExecExpiryDate] = useState<Date | null>(null);
  const [execCarrierName, setExecCarrierName] = useState('');
  const [execCarrierPlate, setExecCarrierPlate] = useState('');

  // Thermal Ticket (80mm) Dialog
  const [ticketDialogVisible, setTicketDialogVisible] = useState(false);
  const [ticketData, setTicketData] = useState<any>(null);

  // Load Catalogs on Mount
  useEffect(() => {
    loadCatalogs();
  }, []);

  // Fetch data on filter or tab change
  useEffect(() => {
    if (activeTab === 'rtv') {
      fetchReturns();
    } else {
      fetchSwaps();
    }
  }, [activeTab, selectedFacility, selectedSupplier, statusFilter, searchTerm]);

  const loadCatalogs = async () => {
    try {
      const [supRes, facRes, prodRes, lotsRes] = await Promise.all([
        api.get('/suppliers/?limit=5000').catch(() => ({ data: [] })),
        api.get('/facilities/').catch(() => ({ data: [] })),
        api.get('/products/?limit=1000').catch(() => ({ data: [] })),
        api.get('/wms/lots').catch(() => ({ data: [] }))
      ]);

      const suppliersList = Array.isArray(supRes.data) ? supRes.data : (supRes.data?.data || supRes.data?.items || []);
      setSuppliers(suppliersList.map((s: any) => ({ label: `${s.name} ${s.tax_id ? `(${s.tax_id})` : ''}`, value: s.id })));

      const facilitiesList = Array.isArray(facRes.data) ? facRes.data : (facRes.data?.data || facRes.data?.items || []);
      setFacilities(facilitiesList.map((f: any) => ({ label: f.name, value: f.id })));

      const productsList = Array.isArray(prodRes.data) ? prodRes.data : (prodRes.data?.data || prodRes.data?.items || []);
      const variantList: any[] = [];
      productsList.forEach((p: any) => {
        if (p.variants && p.variants.length > 0) {
          p.variants.forEach((v: any) => {
            variantList.push({
              label: `${p.name} (SKU: ${v.sku})`,
              value: v.id,
              cost: Number(v.average_cost || v.standard_cost || 0),
              sku: v.sku,
              product_name: p.name
            });
          });
        }
      });
      setProducts(variantList);

      const rawLots = Array.isArray(lotsRes.data) ? lotsRes.data : (lotsRes.data?.items || lotsRes.data?.data || []);
      setLots(rawLots.map((l: any) => ({
        label: `Lote: ${l.batch_number || l.batch} - Exp: ${l.expiry_date || 'N/A'}`,
        value: l.batch_id || l.id,
        variant_id: l.variant_id,
        batch_number: l.batch_number || l.batch
      })));
    } catch (err) {
      console.error("Error cargando catálogos:", err);
    }
  };

  const fetchReturns = async () => {
    setLoading(true);
    try {
      let url = `/wms/returns?skip=0&limit=200`;
      if (selectedFacility) url += `&facility_id=${selectedFacility}`;
      if (selectedSupplier) url += `&supplier_id=${selectedSupplier}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;

      const res = await api.get(url);
      setReturnsList(res.data?.items || []);
    } catch (err) {
      console.error("Error al obtener devoluciones:", err);
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las devoluciones RTV.' });
    } finally {
      setLoading(false);
    }
  };

  const fetchSwaps = async () => {
    setLoading(true);
    try {
      let url = `/wms/swaps?skip=0&limit=200`;
      if (selectedFacility) url += `&facility_id=${selectedFacility}`;
      if (selectedSupplier) url += `&supplier_id=${selectedSupplier}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;

      const res = await api.get(url);
      setSwapsList(res.data?.items || []);
    } catch (err) {
      console.error("Error al obtener canjes:", err);
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar los canjes 1 a 1.' });
    } finally {
      setLoading(false);
    }
  };

  // --- ACTIONS: RTV ---
  const handleOpenNewReturn = () => {
    setNewRtvFacilityId(facilities[0]?.value || null);
    setNewRtvSupplierId(null);
    setNewRtvPoId(null);
    setNewRtvCarrierName('');
    setNewRtvCarrierDoc('');
    setNewRtvCarrierPlate('');
    setNewRtvNotes('');
    setNewRtvLines([{
      variant_id: null,
      batch_id: null,
      quantity: 1,
      unit_cost: 0,
      reason: 'DEFECTO_FABRICA'
    }]);
    setNewReturnDialog(true);
  };

  const handleAddRtvLine = () => {
    setNewRtvLines([...newRtvLines, {
      variant_id: null,
      batch_id: null,
      quantity: 1,
      unit_cost: 0,
      reason: 'DEFECTO_FABRICA'
    }]);
  };

  const handleRemoveRtvLine = (index: number) => {
    if (newRtvLines.length <= 1) return;
    setNewRtvLines(newRtvLines.filter((_, i) => i !== index));
  };

  const handleRtvLineChange = (index: number, field: string, value: any) => {
    const updated = [...newRtvLines];
    updated[index][field] = value;

    if (field === 'variant_id') {
      const prod = products.find(p => p.value === value);
      if (prod) {
        updated[index].unit_cost = prod.cost || 0;
      }
    }
    setNewRtvLines(updated);
  };

  const handleSaveReturn = async () => {
    if (!newRtvFacilityId || !newRtvSupplierId) {
      toast.current?.show({ severity: 'warn', summary: 'Campos requeridos', detail: 'Seleccione sucursal y proveedor.' });
      return;
    }

    const validLines = newRtvLines.filter(l => l.variant_id && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      toast.current?.show({ severity: 'warn', summary: 'Renglones requeridos', detail: 'Debe agregar al menos un producto con cantidad válida.' });
      return;
    }

    try {
      const payload = {
        facility_id: newRtvFacilityId,
        supplier_id: newRtvSupplierId,
        purchase_order_id: newRtvPoId || null,
        carrier_name: newRtvCarrierName || null,
        carrier_id_doc: newRtvCarrierDoc || null,
        carrier_plate: newRtvCarrierPlate || null,
        notes: newRtvNotes || null,
        lines: validLines.map(l => ({
          variant_id: l.variant_id,
          batch_id: l.batch_id || null,
          quantity: Number(l.quantity),
          unit_cost: Number(l.unit_cost || 0),
          reason: l.reason || 'DEFECTO_FABRICA'
        }))
      };

      const res = await api.post('/wms/returns', payload);
      toast.current?.show({ severity: 'success', summary: 'Guardado', detail: res.data?.message || 'Orden RTV creada.' });
      setNewReturnDialog(false);
      fetchReturns();
    } catch (err: any) {
      toast.current?.show({ severity: 'error', summary: 'Error al Guardar', detail: err.response?.data?.detail || 'No se pudo crear la devolución.' });
    }
  };

  const handleOpenDispatch = (ret: any) => {
    setSelectedReturnForDispatch(ret);
    setDispatchCarrierName(ret.carrier_name || '');
    setDispatchCarrierDoc(ret.carrier_id_doc || '');
    setDispatchCarrierPlate(ret.carrier_plate || '');
    setDispatchNotes('');
    setDispatchDialog(true);
  };

  const handleConfirmDispatch = async () => {
    if (!selectedReturnForDispatch) return;
    try {
      const payload = {
        carrier_name: dispatchCarrierName || null,
        carrier_id_doc: dispatchCarrierDoc || null,
        carrier_plate: dispatchCarrierPlate || null,
        notes: dispatchNotes || null
      };

      const res = await api.post(`/wms/returns/${selectedReturnForDispatch.id}/dispatch`, payload);
      toast.current?.show({ severity: 'success', summary: 'Despachado', detail: res.data?.message || 'Mercancía despachada en muelle.' });
      setDispatchDialog(false);
      fetchReturns();

      // Abrir comprobante térmico automáticamente
      handleViewReturnTicket(selectedReturnForDispatch.id);
    } catch (err: any) {
      toast.current?.show({ severity: 'error', summary: 'Error en Despacho', detail: err.response?.data?.detail || 'No se pudo despachar la devolución.' });
    }
  };

  const handleViewReturnTicket = async (returnId: number) => {
    try {
      const res = await api.get(`/wms/returns/${returnId}/ticket-80mm`);
      setTicketData(res.data);
      setTicketDialogVisible(true);
    } catch (err) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el ticket 80mm.' });
    }
  };

  // --- ACTIONS: SWAPS ---
  const handleOpenNewSwap = () => {
    setNewSwapFacilityId(facilities[0]?.value || null);
    setNewSwapSupplierId(null);
    setNewSwapVariantId(null);
    setNewSwapBatchId(null);
    setNewSwapQty(1);
    setNewSwapReason('ROTURA/AVERIA');
    setNewSwapNotes('');
    setNewSwapDialog(true);
  };

  const handleSaveSwap = async () => {
    if (!newSwapFacilityId || !newSwapSupplierId || !newSwapVariantId || Number(newSwapQty) <= 0) {
      toast.current?.show({ severity: 'warn', summary: 'Campos requeridos', detail: 'Complete sucursal, proveedor, producto y cantidad.' });
      return;
    }

    try {
      const payload = {
        facility_id: newSwapFacilityId,
        supplier_id: newSwapSupplierId,
        variant_id: newSwapVariantId,
        damaged_batch_id: newSwapBatchId || null,
        qty_quarantined: Number(newSwapQty),
        damage_reason: newSwapReason,
        notes: newSwapNotes || null
      };

      const res = await api.post('/wms/swaps', payload);
      toast.current?.show({ severity: 'success', summary: 'Aislado para Canje', detail: res.data?.message || 'Mercancía en cuarentena registrada.' });
      setNewSwapDialog(false);
      fetchSwaps();
    } catch (err: any) {
      toast.current?.show({ severity: 'error', summary: 'Error al Registrar', detail: err.response?.data?.detail || 'No se pudo aislar el producto.' });
    }
  };

  const handleOpenExecuteSwap = (swap: any) => {
    setSelectedSwapForExecution(swap);
    setExecQty(swap.qty_pending || 1);
    setExecBatchNumber('');
    setExecExpiryDate(null);
    setExecCarrierName('');
    setExecCarrierPlate('');
    setExecuteSwapDialog(true);
  };

  const handleConfirmExecuteSwap = async () => {
    if (!selectedSwapForExecution) return;
    if (!execBatchNumber.trim() || !execExpiryDate) {
      toast.current?.show({ severity: 'warn', summary: 'Datos Sanitarios Requeridos', detail: 'Indique número de lote nuevo y su fecha de vencimiento.' });
      return;
    }
    if (Number(execQty) <= 0 || Number(execQty) > selectedSwapForExecution.qty_pending) {
      toast.current?.show({ severity: 'warn', summary: 'Cantidad Inválida', detail: `La cantidad debe estar entre 1 y ${selectedSwapForExecution.qty_pending}.` });
      return;
    }

    try {
      const formattedDate = execExpiryDate.toISOString().split('T')[0];
      const payload = {
        qty: Number(execQty),
        new_batch_number: execBatchNumber.trim().toUpperCase(),
        new_expiration_date: formattedDate,
        carrier_name: execCarrierName || null,
        carrier_plate: execCarrierPlate || null
      };

      const res = await api.post(`/wms/swaps/${selectedSwapForExecution.id}/execute`, payload);
      toast.current?.show({ severity: 'success', summary: 'Canje Ejecutado', detail: res.data?.message || 'Sustitución atómica mano a mano completada.' });
      setExecuteSwapDialog(false);
      fetchSwaps();

      // Abrir ticket de canje
      handleViewSwapTicket(selectedSwapForExecution.id);
    } catch (err: any) {
      toast.current?.show({ severity: 'error', summary: 'Error al Canjear', detail: err.response?.data?.detail || 'No se pudo ejecutar el canje.' });
    }
  };

  const handleViewSwapTicket = async (swapId: number) => {
    try {
      const res = await api.get(`/wms/swaps/${swapId}/ticket-80mm`);
      setTicketData(res.data);
      setTicketDialogVisible(true);
    } catch (err) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el ticket de canje.' });
    }
  };

  // Status Badge Renderers
  const renderRtvStatus = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <Tag severity="warning" value="Borrador / Preparando" icon="pi pi-clock" />;
      case 'DISPATCHED':
        return <Tag severity="info" value="Despachado (Espera N/C)" icon="pi pi-send" />;
      case 'CONCILIATED':
        return <Tag severity="success" value="Conciliado (Con N/C)" icon="pi pi-check-circle" />;
      case 'CANCELLED':
        return <Tag severity="danger" value="Cancelado" icon="pi pi-times" />;
      default:
        return <Tag value={status} />;
    }
  };

  const renderSwapStatus = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Tag severity="warning" value="Pendiente Canje" icon="pi pi-clock" />;
      case 'PARTIAL':
        return <Tag severity="info" value="Canje Parcial" icon="pi pi-sync" />;
      case 'COMPLETED':
        return <Tag severity="success" value="Completado (100%)" icon="pi pi-check" />;
      default:
        return <Tag value={status} />;
    }
  };

  // KPIs
  const rtvDraftCount = returnsList.filter(r => r.status === 'DRAFT').length;
  const rtvDispatchedCount = returnsList.filter(r => r.status === 'DISPATCHED').length;
  const rtvConciliatedCount = returnsList.filter(r => r.status === 'CONCILIATED').length;
  const rtvTotalUsd = returnsList.reduce((acc, r) => acc + (Number(r.total_estimated_amount) || 0), 0);

  const swapPendingCount = swapsList.filter(s => s.status === 'PENDING' || s.status === 'PARTIAL').length;
  const swapCompletedCount = swapsList.filter(s => s.status === 'COMPLETED').length;
  const swapTotalUnitsQuarantined = swapsList.reduce((acc, s) => acc + (Number(s.qty_quarantined) || 0), 0);
  const swapTotalUnitsSwapped = swapsList.reduce((acc, s) => acc + (Number(s.qty_swapped) || 0), 0);

  return (
    <div className="p-4 sm:p-8 w-full max-w-[1500px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />

      {/* HEADER PRINCIPAL */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-amber-500"></div>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Button icon="pi pi-arrow-left" rounded text aria-label="Volver" onClick={() => router.push('/')} />
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
              <i className="pi pi-replay text-amber-500 mr-3"></i>Devoluciones & Canjes a Proveedores
            </h1>
          </div>
          <p className="text-slate-500 ml-12 text-xs mt-1">
            Control de salidas físicas en muelle (RTV) para conciliación con Nota de Crédito y sustituciones mano a mano (Canjes 1 a 1 en cuarentena).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {activeTab === 'rtv' ? (
            <Button
              label="Nueva Devolución (RTV)"
              icon="pi pi-plus"
              onClick={handleOpenNewReturn}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold border-none shadow-sm px-4 py-2 text-sm rounded-xl"
            />
          ) : (
            <Button
              label="Aislar Mercancía para Canje"
              icon="pi pi-box"
              onClick={handleOpenNewSwap}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold border-none shadow-sm px-4 py-2 text-sm rounded-xl"
            />
          )}
        </div>
      </div>

      {/* TABS SELECTOR */}
      <div className="flex border-b border-slate-200 mb-6 gap-2">
        <button
          onClick={() => setActiveTab('rtv')}
          className={`px-6 py-3 font-extrabold text-sm border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'rtv'
              ? 'border-amber-500 text-amber-600 bg-amber-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <i className="pi pi-send"></i>
          <span>1. Devoluciones a Proveedor (RTV)</span>
          <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-black">
            {returnsList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('swaps')}
          className={`px-6 py-3 font-extrabold text-sm border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'swaps'
              ? 'border-purple-500 text-purple-600 bg-purple-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <i className="pi pi-sync"></i>
          <span>2. Bolsa de Canjes 1 a 1 (Mano a Mano)</span>
          <span className="bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full font-black">
            {swapsList.length}
          </span>
        </button>
      </div>

      {/* KPIS CARDS */}
      {activeTab === 'rtv' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">En Preparación (DRAFT)</div>
            <div className="text-2xl font-black text-amber-600">{rtvDraftCount} órdenes</div>
            <p className="text-[11px] text-slate-500 mt-1">Pendientes de despacho por muelle</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Despachadas en Muelle</div>
            <div className="text-2xl font-black text-blue-600">{rtvDispatchedCount} órdenes</div>
            <p className="text-[11px] text-slate-500 mt-1">Salida física efectuada (Espera N/C)</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Conciliadas con N/C</div>
            <div className="text-2xl font-black text-emerald-600">{rtvConciliatedCount} órdenes</div>
            <p className="text-[11px] text-slate-500 mt-1">Cerradas en Administración</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Total Monto Devoluciones</div>
            <div className="text-2xl font-black text-slate-800">${rtvTotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <p className="text-[11px] text-slate-500 mt-1">Valoración estimada en Kardex</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Mercancía en Cuarentena</div>
            <div className="text-2xl font-black text-purple-700">{swapTotalUnitsQuarantined} unidades</div>
            <p className="text-[11px] text-slate-500 mt-1">Aisladas esperando chofer</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Canjes Pendientes</div>
            <div className="text-2xl font-black text-amber-600">{swapPendingCount} partidas</div>
            <p className="text-[11px] text-slate-500 mt-1">Por sustituir en muelle</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Unidades Sustituidas</div>
            <div className="text-2xl font-black text-emerald-600">{swapTotalUnitsSwapped} unidades</div>
            <p className="text-[11px] text-slate-500 mt-1">Ingresadas aptas a inventario</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Impacto Financiero</div>
            <div className="text-2xl font-black text-slate-800">$0.00 Net</div>
            <p className="text-[11px] text-emerald-600 mt-1 font-bold">Sin deuda ni notas de crédito</p>
          </div>
        </div>
      )}

      {/* BARRA DE FILTROS */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <span className="p-input-icon-left w-full">
            <i className="pi pi-search text-slate-400" />
            <InputText
              placeholder={activeTab === 'rtv' ? "Buscar por N° RTV, Proveedor, Chofer, Placa..." : "Buscar por N° SWAP, Proveedor, Motivo..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs rounded-xl"
            />
          </span>
        </div>

        <div className="w-[200px]">
          <Dropdown
            value={selectedFacility}
            options={[{ label: 'Todas las Sucursales', value: null }, ...facilities]}
            onChange={(e) => setSelectedFacility(e.value)}
            placeholder="Filtrar por Sucursal"
            className="w-full text-xs rounded-xl"
          />
        </div>

        <div className="w-[220px]">
          <Dropdown
            value={selectedSupplier}
            options={[{ label: 'Todos los Proveedores', value: null }, ...suppliers]}
            onChange={(e) => setSelectedSupplier(e.value)}
            placeholder="Filtrar por Proveedor"
            filter
            className="w-full text-xs rounded-xl"
          />
        </div>

        <div className="w-[180px]">
          <Dropdown
            value={statusFilter}
            options={
              activeTab === 'rtv'
                ? [
                    { label: 'Todos los Estados', value: null },
                    { label: 'Borrador (DRAFT)', value: 'DRAFT' },
                    { label: 'Despachado (DISPATCHED)', value: 'DISPATCHED' },
                    { label: 'Conciliado (CONCILIATED)', value: 'CONCILIATED' }
                  ]
                : [
                    { label: 'Todos los Estados', value: null },
                    { label: 'Pendiente (PENDING)', value: 'PENDING' },
                    { label: 'Parcial (PARTIAL)', value: 'PARTIAL' },
                    { label: 'Completado (COMPLETED)', value: 'COMPLETED' }
                  ]
            }
            onChange={(e) => setStatusFilter(e.value)}
            placeholder="Filtrar por Estado"
            className="w-full text-xs rounded-xl"
          />
        </div>

        <Button
          icon="pi pi-filter-slash"
          text
          rounded
          aria-label="Limpiar Filtros"
          onClick={() => {
            setSelectedFacility(null);
            setSelectedSupplier(null);
            setStatusFilter(null);
            setSearchTerm('');
          }}
          tooltip="Limpiar Filtros"
        />
      </div>

      {/* TAB 1: DATATABLE RTV */}
      {activeTab === 'rtv' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <DataTable
            value={returnsList}
            loading={loading}
            paginator
            rows={15}
            emptyMessage="No se encontraron órdenes de devolución a proveedor (RTV)."
            className="text-xs"
            stripedRows
          >
            <Column field="return_number" header="N° RTV" body={(r) => <span className="font-extrabold text-amber-700">{r.return_number}</span>} />
            <Column field="facility_name" header="Sucursal" />
            <Column field="supplier_name" header="Proveedor" body={(r) => (
              <div>
                <p className="font-bold text-slate-800">{r.supplier_name}</p>
                <p className="text-[10px] text-slate-400">{r.supplier_tax_id}</p>
              </div>
            )} />
            <Column field="purchase_order_number" header="ODC Ref" body={(r) => (
              r.purchase_order_number ? (
                <span className="font-semibold text-blue-600">{r.purchase_order_number}</span>
              ) : (
                <span className="text-slate-400 italic">Directa / Sin ODC</span>
              )
            )} />
            <Column field="lines_count" header="Renglones" body={(r) => `${r.lines_count} items`} />
            <Column field="total_estimated_amount" header="Total Est. ($)" body={(r) => (
              <span className="font-bold text-slate-800">${Number(r.total_estimated_amount).toFixed(2)}</span>
            )} />
            <Column field="carrier_name" header="Transporte" body={(r) => (
              r.carrier_name ? (
                <div className="text-[11px]">
                  <p className="font-bold text-slate-700">{r.carrier_name}</p>
                  <p className="text-slate-400">Placa: {r.carrier_plate || 'N/A'}</p>
                </div>
              ) : <span className="text-slate-400 italic">Por asignar</span>
            )} />
            <Column field="status" header="Estado" body={(r) => renderRtvStatus(r.status)} />
            <Column header="Acciones" body={(r) => (
              <div className="flex items-center gap-2">
                {r.status === 'DRAFT' && (
                  <Button
                    label="Despachar"
                    icon="pi pi-send"
                    size="small"
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold border-none text-xs px-3 py-1.5 rounded-lg"
                    onClick={() => handleOpenDispatch(r)}
                  />
                )}
                {r.status !== 'DRAFT' && (
                  <Button
                    icon="pi pi-print"
                    label="Ticket 80mm"
                    size="small"
                    outlined
                    severity="secondary"
                    className="text-xs px-2.5 py-1.5"
                    onClick={() => handleViewReturnTicket(r.id)}
                  />
                )}
                <Button
                  icon="pi pi-eye"
                  text
                  rounded
                  size="small"
                  tooltip="Ver Detalle"
                  onClick={() => {
                    setSelectedReturnDetail(r);
                    setDetailDialog(true);
                  }}
                />
              </div>
            )} />
          </DataTable>
        </div>
      )}

      {/* TAB 2: DATATABLE SWAPS */}
      {activeTab === 'swaps' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <DataTable
            value={swapsList}
            loading={loading}
            paginator
            rows={15}
            emptyMessage="No hay registros en la bolsa de canjes 1 a 1."
            className="text-xs"
            stripedRows
          >
            <Column field="swap_number" header="N° SWAP" body={(s) => <span className="font-extrabold text-purple-700">{s.swap_number}</span>} />
            <Column field="facility_name" header="Sucursal" />
            <Column field="supplier_name" header="Proveedor" body={(s) => (
              <div>
                <p className="font-bold text-slate-800">{s.supplier_name}</p>
                <p className="text-[10px] text-slate-400">{s.supplier_tax_id}</p>
              </div>
            )} />
            <Column field="product_name" header="Producto Averiado" body={(s) => (
              <div>
                <p className="font-bold text-slate-800">{s.product_name}</p>
                <p className="text-[10px] text-slate-400">SKU: {s.sku} | Lote: {s.damaged_batch_number || 'S/L'}</p>
              </div>
            )} />
            <Column field="qty_quarantined" header="Aislado (Cuarentena)" body={(s) => (
              <span className="font-bold text-purple-800">{s.qty_quarantined} unds</span>
            )} />
            <Column field="qty_swapped" header="Canjeado" body={(s) => (
              <span className="font-bold text-emerald-700">{s.qty_swapped} unds</span>
            )} />
            <Column field="qty_pending" header="Saldo Pendiente" body={(s) => (
              <span className={`font-black text-sm ${s.qty_pending > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                {s.qty_pending} unds
              </span>
            )} />
            <Column field="damage_reason" header="Motivo Daño" body={(s) => (
              <span className="text-slate-600 italic">{s.damage_reason}</span>
            )} />
            <Column field="status" header="Estado" body={(s) => renderSwapStatus(s.status)} />
            <Column header="Acciones" body={(s) => (
              <div className="flex items-center gap-2">
                {s.status !== 'COMPLETED' && s.qty_pending > 0 && (
                  <Button
                    label="Canjear Mano a Mano"
                    icon="pi pi-sync"
                    size="small"
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold border-none text-xs px-3 py-1.5 rounded-lg"
                    onClick={() => handleOpenExecuteSwap(s)}
                  />
                )}
                {s.executions && s.executions.length > 0 && (
                  <Button
                    icon="pi pi-print"
                    label="Ticket 80mm"
                    size="small"
                    outlined
                    severity="secondary"
                    className="text-xs px-2.5 py-1.5"
                    onClick={() => handleViewSwapTicket(s.id)}
                  />
                )}
                <Button
                  icon="pi pi-list"
                  text
                  rounded
                  size="small"
                  tooltip="Historial de Entregas"
                  onClick={() => {
                    setSelectedSwapHistory(s);
                    setSwapHistoryDialog(true);
                  }}
                />
              </div>
            )} />
          </DataTable>
        </div>
      )}

      {/* ==================================================================== */}
      {/* DIALOG: NUEVA DEVOLUCIÓN (RTV)                                       */}
      {/* ==================================================================== */}
      <Dialog
        header="Registrar Nueva Devolución a Proveedor (RTV)"
        visible={newReturnDialog}
        onHide={() => setNewReturnDialog(false)}
        style={{ width: '900px' }}
        className="text-xs"
      >
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Sucursal / Instalación *</label>
              <Dropdown
                value={newRtvFacilityId}
                options={facilities}
                onChange={(e) => setNewRtvFacilityId(e.value)}
                placeholder="Seleccione Sucursal"
                className="w-full text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Proveedor *</label>
              <Dropdown
                value={newRtvSupplierId}
                options={suppliers}
                onChange={(e) => setNewRtvSupplierId(e.value)}
                placeholder="Seleccione Proveedor"
                filter
                className="w-full text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Chofer / Transportista</label>
              <InputText
                value={newRtvCarrierName}
                onChange={(e) => setNewRtvCarrierName(e.target.value)}
                placeholder="Ej. Juan Pérez"
                className="w-full text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Cédula / ID Chofer</label>
              <InputText
                value={newRtvCarrierDoc}
                onChange={(e) => setNewRtvCarrierDoc(e.target.value)}
                placeholder="Ej. V-12345678"
                className="w-full text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Placa Vehículo</label>
              <InputText
                value={newRtvCarrierPlate}
                onChange={(e) => setNewRtvCarrierPlate(e.target.value)}
                placeholder="Ej. A12BC3D"
                className="w-full text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">Observaciones / Motivo General</label>
            <InputTextarea
              value={newRtvNotes}
              onChange={(e) => setNewRtvNotes(e.target.value)}
              rows={2}
              placeholder="Notas para el transportista o administración..."
              className="w-full text-xs"
            />
          </div>

          {/* Renglones */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-extrabold text-slate-800 text-sm">Productos a Devolver</h3>
              <Button
                label="Agregar Producto"
                icon="pi pi-plus"
                size="small"
                onClick={handleAddRtvLine}
                className="bg-slate-700 hover:bg-slate-800 text-white text-xs border-none"
              />
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2">Producto *</th>
                    <th className="p-2 w-[140px]">Lote</th>
                    <th className="p-2 w-[90px]">Cantidad *</th>
                    <th className="p-2 w-[100px]">Costo ($)</th>
                    <th className="p-2 w-[160px]">Causal</th>
                    <th className="p-2 w-[100px]">Subtotal</th>
                    <th className="p-2 w-[50px] text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  {newRtvLines.map((line, idx) => {
                    const subtotal = (Number(line.quantity) || 0) * (Number(line.unit_cost) || 0);
                    const filteredLots = lots.filter(l => l.variant_id === line.variant_id);

                    return (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="p-2">
                          <Dropdown
                            value={line.variant_id}
                            options={products}
                            onChange={(e) => handleRtvLineChange(idx, 'variant_id', e.value)}
                            placeholder="Seleccione..."
                            filter
                            className="w-full text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <Dropdown
                            value={line.batch_id}
                            options={[{ label: 'Sin Lote', value: null }, ...filteredLots]}
                            onChange={(e) => handleRtvLineChange(idx, 'batch_id', e.value)}
                            placeholder="Lote"
                            className="w-full text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <InputNumber
                            value={line.quantity}
                            onValueChange={(e) => handleRtvLineChange(idx, 'quantity', e.value)}
                            min={1}
                            className="w-full text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <InputNumber
                            value={line.unit_cost}
                            onValueChange={(e) => handleRtvLineChange(idx, 'unit_cost', e.value)}
                            minFractionDigits={2}
                            maxFractionDigits={4}
                            className="w-full text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <Dropdown
                            value={line.reason}
                            options={[
                              { label: 'Defecto Fábrica', value: 'DEFECTO_FABRICA' },
                              { label: 'Vencimiento', value: 'VENCIMIENTO' },
                              { label: 'Rotura Transporte', value: 'ROTURA_TRANSPORTE' },
                              { label: 'Sobrestock', value: 'SOBRESTOCK' },
                              { label: 'Reclamo Calidad', value: 'RECLAMO_CALIDAD' }
                            ]}
                            onChange={(e) => handleRtvLineChange(idx, 'reason', e.value)}
                            className="w-full text-xs"
                          />
                        </td>
                        <td className="p-2 font-bold text-slate-800">
                          ${subtotal.toFixed(2)}
                        </td>
                        <td className="p-2 text-center">
                          <Button
                            icon="pi pi-trash"
                            text
                            rounded
                            severity="danger"
                            size="small"
                            onClick={() => handleRemoveRtvLine(idx)}
                            disabled={newRtvLines.length <= 1}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end gap-6 text-sm font-bold text-slate-800">
              <span>Total Estimado:</span>
              <span className="text-amber-700 text-lg">
                ${newRtvLines.reduce((acc, l) => acc + ((Number(l.quantity) || 0) * (Number(l.unit_cost) || 0)), 0).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              label="Cancelar"
              icon="pi pi-times"
              outlined
              severity="secondary"
              onClick={() => setNewReturnDialog(false)}
            />
            <Button
              label="Crear Devolución (Borrador)"
              icon="pi pi-check"
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold border-none"
              onClick={handleSaveReturn}
            />
          </div>
        </div>
      </Dialog>

      {/* ==================================================================== */}
      {/* DIALOG: DESPACHO FÍSICO EN MUELLE (RTV)                              */}
      {/* ==================================================================== */}
      <Dialog
        header={`Despachar en Muelle: ${selectedReturnForDispatch?.return_number}`}
        visible={dispatchDialog}
        onHide={() => setDispatchDialog(false)}
        style={{ width: '550px' }}
        className="text-xs"
      >
        <div className="p-4 space-y-4">
          <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-amber-900 text-xs">
            <i className="pi pi-exclamation-triangle mr-2 text-amber-600 font-bold"></i>
            Esta acción descargará del inventario físico (Kardex) los renglones asociados y emitirá el comprobante oficial de entrega para firma del transportista.
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">Nombre Chofer / Transportista *</label>
            <InputText
              value={dispatchCarrierName}
              onChange={(e) => setDispatchCarrierName(e.target.value)}
              placeholder="Nombre y Apellido"
              className="w-full text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Cédula / Documento</label>
              <InputText
                value={dispatchCarrierDoc}
                onChange={(e) => setDispatchCarrierDoc(e.target.value)}
                placeholder="V-XXXXXXXX"
                className="w-full text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Placa Vehículo</label>
              <InputText
                value={dispatchCarrierPlate}
                onChange={(e) => setDispatchCarrierPlate(e.target.value)}
                placeholder="Placa camión"
                className="w-full text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">Notas del Despacho</label>
            <InputTextarea
              value={dispatchNotes}
              onChange={(e) => setDispatchNotes(e.target.value)}
              rows={2}
              placeholder="Precintos de seguridad, condiciones de entrega..."
              className="w-full text-xs"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              label="Cancelar"
              icon="pi pi-times"
              outlined
              severity="secondary"
              onClick={() => setDispatchDialog(false)}
            />
            <Button
              label="Confirmar Salida y Rebajar Kardex"
              icon="pi pi-check"
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold border-none"
              onClick={handleConfirmDispatch}
            />
          </div>
        </div>
      </Dialog>

      {/* ==================================================================== */}
      {/* DIALOG: AISLAR MERCANCÍA PARA CANJE 1 A 1                            */}
      {/* ==================================================================== */}
      <Dialog
        header="Aislar Mercancía Averiada para Canje 1 a 1"
        visible={newSwapDialog}
        onHide={() => setNewSwapDialog(false)}
        style={{ width: '600px' }}
        className="text-xs"
      >
        <div className="p-4 space-y-4">
          <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 text-purple-900 text-xs">
            <i className="pi pi-shield mr-2 text-purple-600 font-bold"></i>
            El producto quedará retenido en <strong>Cuarentena</strong> para no venderse ni pickearse, a la espera del próximo camión del proveedor para su sustitución mano a mano.
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Sucursal *</label>
              <Dropdown
                value={newSwapFacilityId}
                options={facilities}
                onChange={(e) => setNewSwapFacilityId(e.value)}
                placeholder="Sucursal"
                className="w-full text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Proveedor *</label>
              <Dropdown
                value={newSwapSupplierId}
                options={suppliers}
                onChange={(e) => setNewSwapSupplierId(e.value)}
                placeholder="Proveedor"
                filter
                className="w-full text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">Producto Dañado *</label>
            <Dropdown
              value={newSwapVariantId}
              options={products}
              onChange={(e) => setNewSwapVariantId(e.value)}
              placeholder="Buscar producto averiado..."
              filter
              className="w-full text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Lote Dañado (Opcional)</label>
              <Dropdown
                value={newSwapBatchId}
                options={[{ label: 'Sin Lote', value: null }, ...lots.filter(l => l.variant_id === newSwapVariantId)]}
                onChange={(e) => setNewSwapBatchId(e.value)}
                placeholder="Lote"
                className="w-full text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Cantidad a Aislar *</label>
              <InputNumber
                value={newSwapQty}
                onValueChange={(e) => setNewSwapQty(e.value || 1)}
                min={1}
                className="w-full text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">Causal de Avería *</label>
            <Dropdown
              value={newSwapReason}
              options={[
                { label: 'Rotura / Envase Dañado', value: 'ROTURA/AVERIA' },
                { label: 'Vencimiento Próximo / Expirado', value: 'VENCIMIENTO' },
                { label: 'Defecto de Fabricación', value: 'DEFECTO_FABRICA' },
                { label: 'Contaminación / Reclamo de Calidad', value: 'RECLAMO_CALIDAD' }
              ]}
              onChange={(e) => setNewSwapReason(e.value)}
              className="w-full text-xs"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">Notas de Cuarentena</label>
            <InputTextarea
              value={newSwapNotes}
              onChange={(e) => setNewSwapNotes(e.target.value)}
              rows={2}
              placeholder="Detalles sobre el daño o paquete..."
              className="w-full text-xs"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              label="Cancelar"
              icon="pi pi-times"
              outlined
              severity="secondary"
              onClick={() => setNewSwapDialog(false)}
            />
            <Button
              label="Aislar y Enviar a Cuarentena"
              icon="pi pi-check"
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold border-none"
              onClick={handleSaveSwap}
            />
          </div>
        </div>
      </Dialog>

      {/* ==================================================================== */}
      {/* DIALOG: EJECUTAR CANJE MANO A MANO EN MUELLE                         */}
      {/* ==================================================================== */}
      <Dialog
        header={`Ejecutar Canje Mano a Mano: ${selectedSwapForExecution?.swap_number}`}
        visible={executeSwapDialog}
        onHide={() => setExecuteSwapDialog(false)}
        style={{ width: '600px' }}
        className="text-xs"
      >
        <div className="p-4 space-y-4">
          <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-emerald-900 text-xs">
            <div className="font-bold mb-1">✨ Sustitución Atómica 1 a 1 ($0.00 de Impacto Financiero)</div>
            Entregarás la mercancía averiada al chofer y recibirás en el mismo acto producto apto. Se registrará la salida del lote dañado y el ingreso del nuevo lote sanitario.
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
            <p><strong>Producto:</strong> {selectedSwapForExecution?.product_name}</p>
            <p><strong>Proveedor:</strong> {selectedSwapForExecution?.supplier_name}</p>
            <p><strong>Lote Dañado Entregado:</strong> {selectedSwapForExecution?.damaged_batch_number || 'S/L'}</p>
            <p><strong>Saldo Pendiente de Canjear:</strong> <span className="text-amber-600 font-extrabold">{selectedSwapForExecution?.qty_pending} unidades</span></p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Cantidad a Canjear Hoy *</label>
              <InputNumber
                value={execQty}
                onValueChange={(e) => setExecQty(e.value || 1)}
                min={1}
                max={selectedSwapForExecution?.qty_pending || 1000}
                className="w-full text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">N° Nuevo Lote Sanitario *</label>
              <InputText
                value={execBatchNumber}
                onChange={(e) => setExecBatchNumber(e.target.value)}
                placeholder="Ej. LOT-2026-X"
                className="w-full text-xs font-mono uppercase font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Nueva Fecha de Vencimiento *</label>
              <Calendar
                value={execExpiryDate}
                onChange={(e) => setExecExpiryDate(e.value as Date)}
                dateFormat="dd/mm/yy"
                placeholder="dd/mm/aaaa"
                showIcon
                className="w-full text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Nombre Chofer Proveedor</label>
              <InputText
                value={execCarrierName}
                onChange={(e) => setExecCarrierName(e.target.value)}
                placeholder="Nombre del chofer"
                className="w-full text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Placa Camión</label>
              <InputText
                value={execCarrierPlate}
                onChange={(e) => setExecCarrierPlate(e.target.value)}
                placeholder="Placa del camión"
                className="w-full text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              label="Cancelar"
              icon="pi pi-times"
              outlined
              severity="secondary"
              onClick={() => setExecuteSwapDialog(false)}
            />
            <Button
              label="Confirmar Canje Mano a Mano"
              icon="pi pi-check"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold border-none"
              onClick={handleConfirmExecuteSwap}
            />
          </div>
        </div>
      </Dialog>

      {/* ==================================================================== */}
      {/* DIALOG: HISTORIAL DE EJECUCIONES DE CANJE                            */}
      {/* ==================================================================== */}
      <Dialog
        header={`Historial de Canjes: ${selectedSwapHistory?.swap_number}`}
        visible={swapHistoryDialog}
        onHide={() => setSwapHistoryDialog(false)}
        style={{ width: '700px' }}
        className="text-xs"
      >
        <div className="p-4 space-y-4">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <p><strong>Producto:</strong> {selectedSwapHistory?.product_name}</p>
            <p><strong>Proveedor:</strong> {selectedSwapHistory?.supplier_name}</p>
            <p><strong>Total Cuarentena:</strong> {selectedSwapHistory?.qty_quarantined} unds | <strong>Canjeado:</strong> {selectedSwapHistory?.qty_swapped} unds</p>
          </div>

          <h4 className="font-bold text-slate-800 text-sm">Entregas Mano a Mano Registradas:</h4>
          {selectedSwapHistory?.executions && selectedSwapHistory.executions.length > 0 ? (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2">Fecha</th>
                    <th className="p-2">Cant.</th>
                    <th className="p-2">Nuevo Lote</th>
                    <th className="p-2">Vence</th>
                    <th className="p-2">Chofer / Placa</th>
                    <th className="p-2">Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSwapHistory.executions.map((ex: any, idx: number) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="p-2">{ex.executed_at}</td>
                      <td className="p-2 font-bold text-emerald-700">{ex.qty} unds</td>
                      <td className="p-2 font-mono font-bold">{ex.new_batch_number}</td>
                      <td className="p-2">{ex.new_expiration_date}</td>
                      <td className="p-2">{ex.carrier_name || 'N/A'} ({ex.carrier_plate || 'S/P'})</td>
                      <td className="p-2 text-slate-500">{ex.executed_by || 'WMS'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-400 italic">Aún no se han ejecutado entregas mano a mano para esta partida.</p>
          )}

          <div className="flex justify-end pt-4 border-t border-slate-200">
            <Button
              label="Cerrar"
              icon="pi pi-check"
              onClick={() => setSwapHistoryDialog(false)}
            />
          </div>
        </div>
      </Dialog>

      {/* ==================================================================== */}
      {/* DIALOG: DETALLE DE DEVOLUCIÓN RTV                                    */}
      {/* ==================================================================== */}
      <Dialog
        header={`Detalle de Devolución: ${selectedReturnDetail?.return_number}`}
        visible={detailDialog}
        onHide={() => setDetailDialog(false)}
        style={{ width: '750px' }}
        className="text-xs"
      >
        {selectedReturnDetail && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <p><strong>Sucursal:</strong> {selectedReturnDetail.facility_name}</p>
                <p><strong>Proveedor:</strong> {selectedReturnDetail.supplier_name}</p>
                <p><strong>ODC Referencia:</strong> {selectedReturnDetail.purchase_order_number || 'Sin ODC'}</p>
                <p><strong>Estado:</strong> {selectedReturnDetail.status}</p>
              </div>
              <div>
                <p><strong>Creado el:</strong> {selectedReturnDetail.created_at}</p>
                <p><strong>Despachado el:</strong> {selectedReturnDetail.dispatched_at || 'Pendiente'}</p>
                <p><strong>Transportista:</strong> {selectedReturnDetail.carrier_name || 'N/A'} (Placa: {selectedReturnDetail.carrier_plate || 'N/A'})</p>
                <p><strong>Total Estimado:</strong> ${Number(selectedReturnDetail.total_estimated_amount).toFixed(2)}</p>
              </div>
            </div>

            {selectedReturnDetail.credit_note_number && (
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900">
                <p className="font-bold">✅ Conciliación Financiera (Cerrada)</p>
                <p><strong>N° Nota de Crédito:</strong> {selectedReturnDetail.credit_note_number}</p>
                <p><strong>Monto N/C:</strong> ${Number(selectedReturnDetail.credit_note_amount).toFixed(2)}</p>
                <p><strong>Fecha N/C:</strong> {selectedReturnDetail.credit_note_date}</p>
                <p><strong>Conciliado por:</strong> {selectedReturnDetail.conciliated_by} ({selectedReturnDetail.conciliated_at})</p>
              </div>
            )}

            <h4 className="font-bold text-slate-800 text-sm">Renglones Devueltos:</h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2">Producto / SKU</th>
                    <th className="p-2">Lote</th>
                    <th className="p-2">Cant.</th>
                    <th className="p-2">Costo ($)</th>
                    <th className="p-2">Subtotal</th>
                    <th className="p-2">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReturnDetail.lines.map((l: any, idx: number) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="p-2">
                        <p className="font-bold text-slate-800">{l.product_name}</p>
                        <p className="text-[10px] text-slate-400">SKU: {l.sku}</p>
                      </td>
                      <td className="p-2 font-mono">{l.batch_number || 'S/L'}</td>
                      <td className="p-2 font-bold">{l.quantity}</td>
                      <td className="p-2">${Number(l.unit_cost).toFixed(2)}</td>
                      <td className="p-2 font-bold text-slate-800">${Number(l.subtotal).toFixed(2)}</td>
                      <td className="p-2 text-slate-600">{l.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-200">
              <Button
                label="Cerrar"
                icon="pi pi-check"
                onClick={() => setDetailDialog(false)}
              />
            </div>
          </div>
        )}
      </Dialog>

      {/* ==================================================================== */}
      {/* DIALOG: TICKET TÉRMICO (80mm ESC/POS)                                */}
      {/* ==================================================================== */}
      <Dialog
        header={ticketData?.type === 'VENDOR_SWAP' ? "Comprobante Térmico de Canje 1 a 1 (80mm)" : "Comprobante Térmico de Devolución RTV (80mm)"}
        visible={ticketDialogVisible}
        onHide={() => setTicketDialogVisible(false)}
        style={{ width: '420px' }}
      >
        {ticketData && (
          <div className="bg-white p-4 font-mono text-[11px] text-black border border-slate-300 rounded shadow-inner" id="printable-thermal-ticket">
            {/* ENCABEZADO FISCAL */}
            <div className="text-center pb-2 border-b border-dashed border-slate-400">
              <h2 className="text-sm font-black tracking-tight">MORPHEUS SOFT WMS</h2>
              <p className="text-[10px] text-slate-600">{ticketData.facility_name}</p>
              <p className="text-[10px] text-slate-600">SISTEMA DE LOGÍSTICA Y CONTROL</p>
              <div className="mt-2 text-xs font-bold uppercase bg-slate-100 p-1 border border-slate-300">
                {ticketData.type === 'VENDOR_SWAP' ? 'ACTA DE CANJE 1 A 1 EN MUELLE' : 'GUÍA DE SALIDA POR DEVOLUCIÓN (RTV)'}
              </div>
            </div>

            {/* METADATOS */}
            <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[10px]">
              {ticketData.type === 'VENDOR_SWAP' ? (
                <>
                  <p><strong>N° CANJE:</strong> {ticketData.swap_number}</p>
                  <p><strong>FECHA:</strong> {ticketData.quarantined_at}</p>
                  <p><strong>PROVEEDOR:</strong> {ticketData.supplier_name}</p>
                  <p><strong>RIF:</strong> {ticketData.supplier_tax_id}</p>
                  <p><strong>ESTADO:</strong> {ticketData.status}</p>
                </>
              ) : (
                <>
                  <p><strong>N° RTV:</strong> {ticketData.return_number}</p>
                  <p><strong>FECHA DESPACHO:</strong> {ticketData.dispatched_at || ticketData.created_at}</p>
                  <p><strong>PROVEEDOR:</strong> {ticketData.supplier_name}</p>
                  <p><strong>RIF:</strong> {ticketData.supplier_tax_id}</p>
                  <p><strong>ODC REF:</strong> {ticketData.po_reference}</p>
                  <p><strong>CHOFER:</strong> {ticketData.carrier_name} ({ticketData.carrier_id_doc})</p>
                  <p><strong>PLACA:</strong> {ticketData.carrier_plate}</p>
                </>
              )}
            </div>

            {/* TABLA DE RENGLONES */}
            {ticketData.type === 'VENDOR_SWAP' ? (
              <div className="py-2 border-b border-dashed border-slate-400">
                <p className="font-bold text-[10px] mb-1">MERCANCÍA AVERIADA AISLADA:</p>
                <p className="text-[10px]">{ticketData.product_name} (SKU: {ticketData.sku})</p>
                <p className="text-[10px]">Lote Dañado: {ticketData.damaged_batch_number} (Exp: {ticketData.damaged_expiry_date})</p>
                <p className="text-[10px]">Total en Cuarentena: {ticketData.qty_quarantined} unds</p>

                {ticketData.last_execution && (
                  <div className="mt-2 p-2 bg-slate-50 border border-slate-200">
                    <p className="font-bold text-[10px] text-emerald-800">✅ SUSTITUCIÓN RECIBIDA HOY:</p>
                    <p className="text-[10px]"><strong>Cantidad:</strong> {ticketData.last_execution.qty} unds</p>
                    <p className="text-[10px]"><strong>Nuevo Lote:</strong> {ticketData.last_execution.new_batch_number}</p>
                    <p className="text-[10px]"><strong>Nuevo Vence:</strong> {ticketData.last_execution.new_expiration_date}</p>
                    <p className="text-[10px]"><strong>Chofer:</strong> {ticketData.last_execution.carrier_name} ({ticketData.last_execution.carrier_plate})</p>
                  </div>
                )}

                <div className="mt-2 flex justify-between font-bold text-[11px]">
                  <span>SALDO PENDIENTE:</span>
                  <span>{ticketData.qty_pending} unds</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-600">
                  <span>DELTA FINANCIERO:</span>
                  <span>$0.00 (SIN DEUDA)</span>
                </div>
              </div>
            ) : (
              <div className="py-2 border-b border-dashed border-slate-400">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-400 text-[10px]">
                      <th className="py-1">CÓD/PRODUCTO</th>
                      <th className="py-1 text-center">CANT</th>
                      <th className="py-1 text-right">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticketData.items?.map((it: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-200">
                        <td className="py-1 max-w-[160px]">
                          <div className="font-bold text-[11px]">{it.sku}</div>
                          <div className="text-[9px] text-slate-600 truncate">{it.product_name}</div>
                          <div className="text-[8px] text-slate-500">Lote: {it.batch_number} | Motivo: {it.reason}</div>
                        </td>
                        <td className="py-1 text-center font-bold">{it.quantity}</td>
                        <td className="py-1 text-right font-bold">${it.subtotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-2 flex justify-between font-bold text-xs pt-1 border-t border-slate-300">
                  <span>TOTAL ESTIMADO:</span>
                  <span>${ticketData.total_amount?.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* FIRMAS LEGALES */}
            <div className="mt-6 flex flex-col gap-6 text-[10px]">
              <div>
                <p className="border-b border-slate-400 w-full mb-1"></p>
                <p className="font-bold text-center">Firma Chofer / Transportista Proveedor</p>
              </div>
              <div>
                <p className="border-b border-slate-400 w-full mb-1"></p>
                <p className="font-bold text-center">Firma Despachador WMS / Muelle</p>
              </div>
            </div>

            <div className="mt-5 flex justify-center">
              <Button
                label="Imprimir Ticket 80mm"
                icon="pi pi-print"
                size="small"
                onClick={() => window.print()}
                className="font-bold bg-amber-600 border-none text-white"
              />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
