"use client";

import React, { useState, useEffect, useRef } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { TabView, TabPanel } from 'primereact/tabview';
import api from '@/lib/api';

export default function WmsTransfersPage() {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const toast = useRef<Toast>(null);

  // Diálogo Despacho Directo Multirrenglón
  const [transferDialogVisible, setTransferDialogVisible] = useState(false);
  const [directTransferLines, setDirectTransferLines] = useState<any[]>([]);
  
  // Diálogo Nueva Solicitud Multirrenglón
  const [requestDialogVisible, setRequestDialogVisible] = useState(false);
  const [requestLines, setRequestLines] = useState<any[]>([]);

  // Diálogo Ver Detalle
  const [detailDialogVisible, setDetailDialogVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  // Diálogo Confirmar Recepción en Destino
  const [receiveDialogVisible, setReceiveDialogVisible] = useState(false);
  const [receivingRequest, setReceivingRequest] = useState<any>(null);
  const [receiveLines, setReceiveLines] = useState<any[]>([]);

  const [facilities, setFacilities] = useState<any[]>([]);
  const [srcFacilityId, setSrcFacilityId] = useState<number | null>(null);
  const [destFacilityId, setDestFacilityId] = useState<number | null>(null);
  
  const [productsList, setProductsList] = useState<any[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [transferQty, setTransferQty] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const fetchTransfers = async () => {
    setLoadingTransfers(true);
    try {
      const res = await api.get('/wms-transfers/');
      setTransfers(res.data || []);
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las transferencias.' });
    }
    setLoadingTransfers(false);
  };

  const fetchRequests = async () => {
    setLoadingRequests(true);
    try {
      const res = await api.get('/wms-transfers/requests');
      setRequests(res.data || []);
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las solicitudes de reabastecimiento.' });
    }
    setLoadingRequests(false);
  };

  const fetchFacilitiesAndProducts = async () => {
    try {
      const facRes = await api.get('/facilities/');
      const facData = Array.isArray(facRes.data) ? facRes.data : (facRes.data?.items || facRes.data?.data || []);
      setFacilities(facData);
      if (facData && facData.length >= 2) {
        setSrcFacilityId(facData[0].id);
        setDestFacilityId(facData[1].id);
      }
    } catch (e) {
      console.error("Error al cargar sucursales:", e);
    }

    try {
      const prodRes = await api.get('/products/?limit=2000');
      let prodList: any[] = [];
      if (Array.isArray(prodRes.data)) {
        prodList = prodRes.data;
      } else if (prodRes.data?.items && Array.isArray(prodRes.data.items)) {
        prodList = prodRes.data.items;
      } else if (prodRes.data?.data && Array.isArray(prodRes.data.data)) {
        prodList = prodRes.data.data;
      }

      const variants: any[] = [];
      prodList.forEach((p: any) => {
        if (p && p.variants && p.variants.length > 0) {
          p.variants.forEach((v: any) => {
            variants.push({
              label: `${p.name || 'Producto'} ${v.sku ? `(SKU: ${v.sku})` : ''}`,
              value: v.id,
              sku: v.sku || 'N/A',
              product_name: p.name || 'Producto'
            });
          });
        } else if (p && p.id) {
          variants.push({
            label: `${p.name || 'Producto'} (ID: ${p.id})`,
            value: p.id,
            sku: p.sku || 'N/A',
            product_name: p.name || 'Producto'
          });
        }
      });
      setProductsList(variants);
    } catch (e) {
      console.error("Error al cargar productos:", e);
    }
  };

  useEffect(() => {
    fetchRequests();
    fetchTransfers();
    fetchFacilitiesAndProducts();
  }, []);

  // Agregar Renglón a la Solicitud
  const handleAddRequestLine = () => {
    if (!selectedVariantId || transferQty <= 0) {
      toast.current?.show({ severity: 'warn', summary: 'Atención', detail: 'Seleccione un producto y una cantidad válida.' });
      return;
    }

    const item = productsList.find(p => p.value === selectedVariantId);
    if (!item) return;

    const existingIndex = requestLines.findIndex(l => l.variant_id === selectedVariantId);
    if (existingIndex >= 0) {
      const updated = [...requestLines];
      updated[existingIndex].qty += transferQty;
      setRequestLines(updated);
    } else {
      setRequestLines([...requestLines, {
        variant_id: selectedVariantId,
        label: item.label,
        sku: item.sku,
        product_name: item.product_name,
        qty: transferQty
      }]);
    }

    setSelectedVariantId(null);
    setTransferQty(1);
  };

  // Eliminar Renglón de la Solicitud
  const handleRemoveRequestLine = (index: number) => {
    setRequestLines(requestLines.filter((_, i) => i !== index));
  };

  // Agregar Renglón al Despacho Directo
  const handleAddDirectTransferLine = () => {
    if (!selectedVariantId || transferQty <= 0) {
      toast.current?.show({ severity: 'warn', summary: 'Atención', detail: 'Seleccione un producto y una cantidad válida.' });
      return;
    }

    const item = productsList.find(p => p.value === selectedVariantId);
    if (!item) return;

    const existingIndex = directTransferLines.findIndex(l => l.variant_id === selectedVariantId);
    if (existingIndex >= 0) {
      const updated = [...directTransferLines];
      updated[existingIndex].qty += transferQty;
      setDirectTransferLines(updated);
    } else {
      setDirectTransferLines([...directTransferLines, {
        variant_id: selectedVariantId,
        label: item.label,
        sku: item.sku,
        product_name: item.product_name,
        qty: transferQty
      }]);
    }

    setSelectedVariantId(null);
    setTransferQty(1);
  };

  // Eliminar Renglón del Despacho Directo
  const handleRemoveDirectTransferLine = (index: number) => {
    setDirectTransferLines(directTransferLines.filter((_, i) => i !== index));
  };

  // Crear Solicitud (Estado Inicial: REQUESTED)
  const handleCreateRequest = async () => {
    if (!srcFacilityId || !destFacilityId) {
      toast.current?.show({ severity: 'warn', summary: 'Campos incompletos', detail: 'Complete sucursal origen y destino.' });
      return;
    }

    if (srcFacilityId === destFacilityId) {
      toast.current?.show({ severity: 'warn', summary: 'Error Origen/Destino', detail: 'La sucursal de origen y destino deben ser distintas.' });
      return;
    }

    if (requestLines.length === 0) {
      toast.current?.show({ severity: 'warn', summary: 'Sin Ítems', detail: 'Debe agregar al menos un producto a la solicitud.' });
      return;
    }

    setSaving(true);
    try {
      await api.post('/wms-transfers/requests', {
        src_facility_id: srcFacilityId,
        dest_facility_id: destFacilityId,
        lines: requestLines.map(l => ({
          variant_id: l.variant_id,
          qty: l.qty
        }))
      });
      toast.current?.show({ severity: 'success', summary: 'Solicitud Creada', detail: `Solicitud registrada en estado SOLICITADA.` });
      setRequestDialogVisible(false);
      setRequestLines([]);
      fetchRequests();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al crear la solicitud.' });
    }
    setSaving(false);
  };

  // Aceptar Solicitud (Origen) -> IN_PREPARATION
  const handleAcceptRequest = async (requestId: number) => {
    setActionLoadingId(requestId);
    try {
      await api.post(`/wms-transfers/requests/${requestId}/accept`);
      toast.current?.show({ severity: 'success', summary: 'Solicitud Aceptada', detail: 'La orden pasó a estado EN PREPARACIÓN.' });
      fetchRequests();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al aceptar la solicitud.' });
    }
    setActionLoadingId(null);
  };

  // Despachar Solicitud (Origen) -> IN_TRANSIT
  const handleDispatchRequest = async (requestId: number) => {
    setActionLoadingId(requestId);
    try {
      await api.post(`/wms-transfers/requests/${requestId}/dispatch`);
      toast.current?.show({ severity: 'success', summary: 'Guía Despachada', detail: 'Mercancía enviada. Ahora en Tránsito.' });
      fetchRequests();
      fetchTransfers();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al despachar la orden.' });
    }
    setActionLoadingId(null);
  };

  // Rechazar Solicitud -> CANCELLED
  const handleRejectRequest = async (requestId: number) => {
    setActionLoadingId(requestId);
    try {
      await api.post(`/wms-transfers/requests/${requestId}/reject`);
      toast.current?.show({ severity: 'warn', summary: 'Solicitud Rechazada', detail: 'La orden ha sido cancelada.' });
      fetchRequests();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al rechazar la solicitud.' });
    }
    setActionLoadingId(null);
  };

  // Abrir Modal de Recepción en Destino
  const handleOpenReceiveModal = (request: any) => {
    setReceivingRequest(request);
    setReceiveLines((request.lines || []).map((l: any) => ({
      move_id: l.id,
      sku: l.sku,
      product_name: l.product_name,
      quantity_demand: l.quantity_demand,
      quantity_received: l.quantity_demand,
      notes: ''
    })));
    setReceiveDialogVisible(true);
  };

  // Confirmar Recepción Conforme en Destino -> DONE
  const handleConfirmReceive = async () => {
    if (!receivingRequest) return;
    setSaving(true);
    try {
      await api.post(`/wms-transfers/requests/${receivingRequest.id}/receive`, {
        lines: receiveLines.map(l => ({
          move_id: l.move_id,
          quantity_received: l.quantity_received,
          notes: l.notes
        }))
      });
      toast.current?.show({ severity: 'success', summary: 'Recepción Conforme', detail: 'Mercancía ingresada al inventario de la tienda destino.' });
      setReceiveDialogVisible(false);
      setReceivingRequest(null);
      fetchRequests();
      fetchTransfers();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al confirmar la recepción.' });
    }
    setSaving(false);
  };

  // Crear Despacho Directo Multirrenglón (Sin Solicitud Previa) -> Nace en IN_TRANSIT
  const createDirectTransfer = async () => {
    if (!srcFacilityId || !destFacilityId) {
      toast.current?.show({ severity: 'warn', summary: 'Campos incompletos', detail: 'Complete sucursal origen y destino.' });
      return;
    }

    if (srcFacilityId === destFacilityId) {
      toast.current?.show({ severity: 'warn', summary: 'Error de Origen/Destino', detail: 'La sucursal origen y destino deben ser distintas.' });
      return;
    }

    if (directTransferLines.length === 0) {
      toast.current?.show({ severity: 'warn', summary: 'Sin Ítems', detail: 'Debe agregar al menos un producto al despacho.' });
      return;
    }

    setSaving(true);
    try {
      await api.post('/wms-transfers/', {
        src_facility_id: srcFacilityId,
        dest_facility_id: destFacilityId,
        lines: directTransferLines.map(l => ({
          variant_id: l.variant_id,
          qty: l.qty
        }))
      });
      toast.current?.show({ severity: 'success', summary: 'Despacho Directo Creado', detail: `Despacho con ${directTransferLines.length} artículo(s) registrado en estado EN TRÁNSITO.` });
      setTransferDialogVisible(false);
      setDirectTransferLines([]);
      fetchRequests();
      fetchTransfers();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al procesar el despacho directo.' });
    }
    setSaving(false);
  };

  // Formateador de Estados con Badges WMS Profesionales
  const renderStatusTag = (status: string) => {
    switch (status) {
      case 'REQUESTED':
      case 'DRAFT':
        return <Tag severity="warning" value="SOLICITADA (POR ACEPTAR)" className="font-black text-[9px]" />;
      case 'IN_PREPARATION':
      case 'CONFIRMED':
        return <Tag severity="warning" value="EN PREPARACIÓN" className="font-black text-[9px] bg-amber-500 text-white" />;
      case 'IN_TRANSIT':
        return <Tag severity="info" value="EN TRÁNSITO 🚚" className="font-black text-[9px]" />;
      case 'DONE':
        return <Tag severity="success" value="COMPLETADO 🟢" className="font-black text-[9px]" />;
      case 'CANCELLED':
        return <Tag severity="danger" value="RECHAZADO / CANCELADO" className="font-black text-[9px]" />;
      default:
        return <Tag value={status} className="font-black text-[9px]" />;
    }
  };

  return (
    <div className="p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />

      {/* HEADER PRINCIPAL */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex justify-between items-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-blue-600"></div>
        <div className="pl-4">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
            <i className="pi pi-arrow-right-arrow-left text-blue-600 mr-3"></i>Reabastecimiento y Transferencias Inter-Sucursales
          </h1>
          <p className="text-slate-500 text-sm mt-1">Gestión completa de solicitudes, preparación en origen, guías en tránsito y recepción conforme en destino.</p>
        </div>

        <div className="flex gap-3">
          <Button 
            label="Solicitar Reabastecimiento" 
            icon="pi pi-plus-circle" 
            severity="success" 
            onClick={() => setRequestDialogVisible(true)} 
            className="font-bold shadow-md" 
          />
          <Button 
            label="Despacho Directo (Sin Solicitud)" 
            icon="pi pi-send" 
            severity="info" 
            onClick={() => setTransferDialogVisible(true)} 
            className="font-bold shadow-md" 
          />
          <Button 
            icon="pi pi-refresh" 
            rounded 
            outlined 
            onClick={() => { fetchRequests(); fetchTransfers(); }} 
          />
        </div>
      </div>

      {/* PESTAÑAS PRINCIPALES */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-4">
        <TabView>
          {/* PESTAÑA 1: SOLICITUDES Y DESPACHOS EN CURSO */}
          <TabPanel header="Solicitudes y Movimientos en Curso" leftIcon="pi pi-list mr-2">
            <DataTable 
              value={requests} 
              loading={loadingRequests} 
              emptyMessage="No hay solicitudes o movimientos de inventario." 
              size="small" 
              stripedRows 
              rowHover 
              className="text-sm"
            >
              <Column 
                header="CÓDIGO SOLICITUD / GUÍA" 
                field="name" 
                body={r => <span className="font-mono font-bold text-xs bg-amber-50 px-3 py-1.5 rounded text-amber-800 border border-amber-200">{r.name}</span>} 
              />
              <Column header="FECHA" field="created_at" />
              <Column header="ORIGEN (DESPACHANTE)" field="src_facility_name" body={r => <span className="font-bold text-slate-700">{r.src_facility_name}</span>} />
              <Column header="DESTINO (SOLICITANTE)" field="dest_facility_name" body={r => <span className="font-bold text-blue-700">{r.dest_facility_name}</span>} />
              <Column header="ITEMS" field="lines_count" align="center" body={r => <span className="font-extrabold">{r.lines_count} ítems</span>} />
              <Column header="ESTADO LOGÍSTICO" body={r => renderStatusTag(r.status)} align="center" />
              <Column 
                header="ACCIONES" 
                align="center"
                body={r => (
                  <div className="flex gap-1.5 justify-center flex-wrap">
                    <Button 
                      icon="pi pi-eye" 
                      severity="secondary" 
                      outlined
                      size="small"
                      tooltip="Ver Detalle y Auditoría"
                      onClick={() => {
                        setSelectedRequest(r);
                        setDetailDialogVisible(true);
                      }} 
                    />

                    {/* ESTADO SOLICITADA -> Únicamente Aceptar o Rechazar (NO despachar directamente) */}
                    {(r.status === 'REQUESTED' || r.status === 'DRAFT') && (
                      <>
                        <Button 
                          label="Aceptar Solicitud" 
                          icon="pi pi-check-circle" 
                          severity="warning" 
                          size="small"
                          loading={actionLoadingId === r.id}
                          onClick={() => handleAcceptRequest(r.id)} 
                          className="font-bold text-xs" 
                        />
                        <Button 
                          icon="pi pi-times" 
                          severity="danger" 
                          text
                          size="small"
                          tooltip="Rechazar Solicitud"
                          loading={actionLoadingId === r.id}
                          onClick={() => handleRejectRequest(r.id)} 
                        />
                      </>
                    )}

                    {/* ESTADO EN PREPARACIÓN -> Origen Despacha */}
                    {(r.status === 'IN_PREPARATION' || r.status === 'CONFIRMED') && (
                      <Button 
                        label="Emitir Guía y Despachar" 
                        icon="pi pi-send" 
                        severity="info" 
                        size="small"
                        loading={actionLoadingId === r.id}
                        onClick={() => handleDispatchRequest(r.id)} 
                        className="font-bold text-xs shadow-sm" 
                      />
                    )}

                    {/* ESTADO EN TRÁNSITO -> Destino Recibe Conforme */}
                    {r.status === 'IN_TRANSIT' && (
                      <Button 
                        label="Confirmar Recepción" 
                        icon="pi pi-box" 
                        severity="success" 
                        size="small"
                        onClick={() => handleOpenReceiveModal(r)} 
                        className="font-bold text-xs shadow-sm bg-emerald-600 hover:bg-emerald-700" 
                      />
                    )}
                  </div>
                )} 
              />
            </DataTable>
          </TabPanel>

          {/* PESTAÑA 2: GUÍAS DE TRASLADO EJECUTADAS */}
          <TabPanel header="Histórico de Guías de Traslado" leftIcon="pi pi-history mr-2">
            <DataTable 
              value={transfers} 
              loading={loadingTransfers} 
              emptyMessage="No hay transferencias registradas." 
              size="small" 
              stripedRows 
              rowHover 
              className="text-sm"
            >
              <Column 
                header="NÚMERO GUÍA" 
                field="name" 
                body={t => <span className="font-mono font-bold text-xs bg-slate-100 px-3 py-1.5 rounded text-slate-700 border border-slate-200">{t.name}</span>} 
              />
              <Column header="FECHA" field="created_at" />
              <Column header="SUCURSAL ORIGEN" body={t => <span className="font-bold text-slate-700">Sucursal #{t.facility_id}</span>} />
              <Column header="LÍNEAS DESPACHADAS" field="lines_count" align="center" body={t => <span className="font-extrabold">{t.lines_count} ítems</span>} />
              <Column header="ESTADO LOGÍSTICO" body={t => renderStatusTag(t.status)} align="center" />
            </DataTable>
          </TabPanel>
        </TabView>
      </div>

      {/* DIÁLOGO NUEVA SOLICITUD DE REABASTECIMIENTO MULTIRRENGLÓN */}
      <Dialog 
        header="Nueva Solicitud de Reabastecimiento Interno" 
        visible={requestDialogVisible} 
        onHide={() => { setRequestDialogVisible(false); setRequestLines([]); }} 
        style={{ width: '720px' }}
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 font-medium flex items-center">
            <i className="pi pi-info-circle text-amber-600 text-lg mr-2"></i>
            <span>La solicitud quedará en estado <strong>SOLICITADA</strong> hasta que la sucursal o CENDI de origen la acepte y prepare.</span>
          </div>

          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Sucursal Origen (Despacha):</label>
              <Dropdown 
                value={srcFacilityId} 
                options={(facilities || []).map(f => ({ label: f.name, value: f.id }))} 
                onChange={(e) => setSrcFacilityId(e.value)} 
                className="w-full text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Sucursal Destino (Solicita):</label>
              <Dropdown 
                value={destFacilityId} 
                options={(facilities || []).map(f => ({ label: f.name, value: f.id }))} 
                onChange={(e) => setDestFacilityId(e.value)} 
                className="w-full text-xs font-bold"
              />
            </div>
          </div>

          {/* AGREGAR RENGLONES DE PRODUCTO */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex flex-col gap-3">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center">
              <i className="pi pi-box text-blue-600 mr-1.5"></i>Agregar Producto a la Solicitud
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Producto / SKU:</label>
              <Dropdown 
                value={selectedVariantId}
                options={productsList || []}
                optionLabel="label"
                optionValue="value"
                filter
                filterBy="label,sku,product_name"
                showClear
                onChange={(e) => setSelectedVariantId(e.value)}
                placeholder="Buscar por nombre o SKU de producto..."
                className="w-full text-xs font-bold bg-white"
                style={{ width: '100%' }}
                valueTemplate={(option, props) => {
                  if (option) {
                    return (
                      <div className="truncate font-bold text-xs text-slate-800" title={option.label}>
                        {option.label}
                      </div>
                    );
                  }
                  return <span className="text-slate-400 text-xs">{props.placeholder}</span>;
                }}
                itemTemplate={(option) => (
                  <div className="truncate text-xs font-bold py-1" title={option.label}>
                    {option.label}
                  </div>
                )}
              />
            </div>

            <div className="flex items-end gap-3 pt-1">
              <div className="w-36">
                <label className="block text-xs font-bold text-slate-600 mb-1">Cantidad:</label>
                <InputNumber 
                  value={transferQty} 
                  onValueChange={(e) => setTransferQty(e.value || 1)}
                  min={1}
                  className="w-full text-xs font-bold"
                  inputClassName="w-full text-xs font-bold"
                />
              </div>

              <Button 
                label="Agregar a la Lista" 
                icon="pi pi-plus" 
                severity="info" 
                onClick={handleAddRequestLine} 
                className="font-bold text-xs shadow-sm h-[38px] px-4" 
              />
            </div>
          </div>

          {/* TABLA DE RENGLONES AGREGADOS */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <DataTable 
              value={requestLines} 
              emptyMessage="No se han agregado productos a la solicitud. Use el selector de arriba." 
              size="small" 
              stripedRows 
              className="text-xs"
            >
              <Column header="SKU" field="sku" body={l => <span className="font-mono font-bold text-slate-700">{l.sku}</span>} />
              <Column header="PRODUCTO" field="product_name" body={l => <span className="font-bold text-slate-800 line-clamp-2">{l.product_name}</span>} />
              <Column header="CANTIDAD SOLICITADA" field="qty" align="center" body={l => <span className="font-extrabold text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200">{l.qty}</span>} />
              <Column 
                header="ACCIONES" 
                align="center"
                body={(_, options) => (
                  <Button 
                    icon="pi pi-trash" 
                    severity="danger" 
                    text 
                    rounded 
                    size="small" 
                    onClick={() => handleRemoveRequestLine(options.rowIndex)} 
                  />
                )} 
              />
            </DataTable>
          </div>

          <div className="flex justify-between items-center mt-2">
            <span className="text-xs font-bold text-slate-500">
              Total Renglones: <strong className="text-slate-800">{requestLines.length}</strong>
            </span>
            <div className="flex gap-2">
              <Button label="Cancelar" text severity="secondary" onClick={() => { setRequestDialogVisible(false); setRequestLines([]); }} />
              <Button 
                label="Enviar Solicitud" 
                icon="pi pi-check" 
                severity="success" 
                disabled={requestLines.length === 0}
                loading={saving} 
                onClick={handleCreateRequest} 
                className="font-bold text-xs shadow-md" 
              />
            </div>
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO NUEVO DESPACHO DIRECTO MULTIRRENGLÓN (SIN SOLICITUD PREVIA) */}
      <Dialog 
        header="Crear Despacho Directo Inter-Sucursales (Sin Solicitud)" 
        visible={transferDialogVisible} 
        onHide={() => { setTransferDialogVisible(false); setDirectTransferLines([]); }} 
        style={{ width: '720px' }}
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 font-medium flex items-center">
            <i className="pi pi-send text-blue-600 text-lg mr-2"></i>
            <span>Genera un despacho directo por iniciativa de la sucursal origen agregando múltiples productos. Pasará inmediatamente a <strong>EN TRÁNSITO 🚚</strong> para ser recibido en la tienda destino.</span>
          </div>

          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Sucursal Origen (Despacha):</label>
              <Dropdown 
                value={srcFacilityId} 
                options={(facilities || []).map(f => ({ label: f.name, value: f.id }))} 
                onChange={(e) => setSrcFacilityId(e.value)} 
                className="w-full text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Sucursal Destino (Recibe):</label>
              <Dropdown 
                value={destFacilityId} 
                options={(facilities || []).map(f => ({ label: f.name, value: f.id }))} 
                onChange={(e) => setDestFacilityId(e.value)} 
                className="w-full text-xs font-bold"
              />
            </div>
          </div>

          {/* AGREGAR RENGLONES AL DESPACHO DIRECTO */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex flex-col gap-3">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center">
              <i className="pi pi-box text-blue-600 mr-1.5"></i>Agregar Producto al Despacho Directo
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Producto / SKU:</label>
              <Dropdown 
                value={selectedVariantId}
                options={productsList || []}
                optionLabel="label"
                optionValue="value"
                filter
                filterBy="label,sku,product_name"
                showClear
                onChange={(e) => setSelectedVariantId(e.value)}
                placeholder="Buscar por nombre o SKU de producto..."
                className="w-full text-xs font-bold bg-white"
                style={{ width: '100%' }}
                valueTemplate={(option, props) => {
                  if (option) {
                    return (
                      <div className="truncate font-bold text-xs text-slate-800" title={option.label}>
                        {option.label}
                      </div>
                    );
                  }
                  return <span className="text-slate-400 text-xs">{props.placeholder}</span>;
                }}
                itemTemplate={(option) => (
                  <div className="truncate text-xs font-bold py-1" title={option.label}>
                    {option.label}
                  </div>
                )}
              />
            </div>

            <div className="flex items-end gap-3 pt-1">
              <div className="w-36">
                <label className="block text-xs font-bold text-slate-600 mb-1">Cantidad:</label>
                <InputNumber 
                  value={transferQty} 
                  onValueChange={(e) => setTransferQty(e.value || 1)}
                  min={1}
                  className="w-full text-xs font-bold"
                  inputClassName="w-full text-xs font-bold"
                />
              </div>

              <Button 
                label="Agregar al Despacho" 
                icon="pi pi-plus" 
                severity="info" 
                onClick={handleAddDirectTransferLine} 
                className="font-bold text-xs shadow-sm h-[38px] px-4" 
              />
            </div>
          </div>

          {/* TABLA DE RENGLONES DEL DESPACHO DIRECTO */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <DataTable 
              value={directTransferLines} 
              emptyMessage="No se han agregado productos al despacho. Use el selector de arriba." 
              size="small" 
              stripedRows 
              className="text-xs"
            >
              <Column header="SKU" field="sku" body={l => <span className="font-mono font-bold text-slate-700">{l.sku}</span>} />
              <Column header="PRODUCTO" field="product_name" body={l => <span className="font-bold text-slate-800 line-clamp-2">{l.product_name}</span>} />
              <Column header="CANTIDAD A DESPACHAR" field="qty" align="center" body={l => <span className="font-extrabold text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200">{l.qty}</span>} />
              <Column 
                header="ACCIONES" 
                align="center"
                body={(_, options) => (
                  <Button 
                    icon="pi pi-trash" 
                    severity="danger" 
                    text 
                    rounded 
                    size="small" 
                    onClick={() => handleRemoveDirectTransferLine(options.rowIndex)} 
                  />
                )} 
              />
            </DataTable>
          </div>

          <div className="flex justify-between items-center mt-2">
            <span className="text-xs font-bold text-slate-500">
              Total Renglones: <strong className="text-slate-800">{directTransferLines.length}</strong>
            </span>
            <div className="flex gap-2">
              <Button label="Cancelar" text severity="secondary" onClick={() => { setTransferDialogVisible(false); setDirectTransferLines([]); }} />
              <Button 
                label="Emitir Despacho en Tránsito" 
                icon="pi pi-send" 
                severity="info" 
                disabled={directTransferLines.length === 0}
                loading={saving} 
                onClick={createDirectTransfer} 
                className="font-bold text-xs shadow-md" 
              />
            </div>
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO CONFIRMAR RECEPCIÓN EN DESTINO CON OBSERVACIÓN POR PRODUCTO */}
      <Dialog 
        header={`Confirmar Recepción en Destino #${receivingRequest?.name || ''}`} 
        visible={receiveDialogVisible} 
        onHide={() => { setReceiveDialogVisible(false); setReceivingRequest(null); }} 
        style={{ width: '800px', maxWidth: '95vw' }}
      >
        {receivingRequest && (
          <div className="flex flex-col gap-4 py-2">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 font-medium flex items-center">
              <i className="pi pi-box text-emerald-600 text-lg mr-2"></i>
              <span>Verifique las cantidades recibidas físicamente. Puede añadir una <strong>observación opcional</strong> en cada producto en caso de mermas, daños o novedades.</span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <DataTable value={receiveLines} size="small" stripedRows className="text-xs">
                <Column header="SKU" field="sku" body={l => <span className="font-mono font-bold text-slate-700">{l.sku}</span>} />
                <Column header="PRODUCTO" field="product_name" body={l => <span className="font-bold text-slate-800">{l.product_name}</span>} />
                <Column header="CANT. DESPACHADA" field="quantity_demand" align="center" body={l => <span className="font-bold text-slate-600">{l.quantity_demand}</span>} />
                <Column 
                  header="CANT. RECIBIDA" 
                  align="center"
                  body={(l, options) => (
                    <InputNumber 
                      value={l.quantity_received} 
                      onValueChange={(e) => {
                        const updated = [...receiveLines];
                        updated[options.rowIndex].quantity_received = e.value || 0;
                        setReceiveLines(updated);
                      }}
                      min={0}
                      inputClassName="w-24 text-center font-extrabold text-emerald-700 text-xs py-1"
                    />
                  )} 
                />
                <Column 
                  header="OBSERVACIÓN POR PRODUCTO (OPCIONAL)" 
                  body={(l, options) => (
                    <InputText 
                      value={l.notes} 
                      onChange={(e) => {
                        const updated = [...receiveLines];
                        updated[options.rowIndex].notes = e.target.value;
                        setReceiveLines(updated);
                      }}
                      placeholder="Ej. Caja abollada, merma, OK..."
                      className="w-full text-xs"
                    />
                  )} 
                />
              </DataTable>
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <Button label="Cancelar" text severity="secondary" onClick={() => { setReceiveDialogVisible(false); setReceivingRequest(null); }} />
              <Button 
                label="Confirmar Recepción y Cargar Inventario" 
                icon="pi pi-check-circle" 
                severity="success" 
                loading={saving}
                onClick={handleConfirmReceive} 
                className="font-bold text-xs shadow-md bg-emerald-600 hover:bg-emerald-700" 
              />
            </div>
          </div>
        )}
      </Dialog>

      {/* DIÁLOGO DETALLE DE SOLICITUD Y TRAZABILIDAD COMPLETA */}
      <Dialog 
        header={`Detalle y Auditoría de Solicitud #${selectedRequest?.name || ''}`} 
        visible={detailDialogVisible} 
        onHide={() => { setDetailDialogVisible(false); setSelectedRequest(null); }} 
        style={{ width: '750px', maxWidth: '95vw' }}
      >
        {selectedRequest && (
          <div className="flex flex-col gap-4 py-2">
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 font-medium block">Origen (Despachante):</span>
                <strong className="text-slate-800">{selectedRequest.src_facility_name}</strong>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Destino (Solicitante):</span>
                <strong className="text-blue-700">{selectedRequest.dest_facility_name}</strong>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Solicitado por:</span>
                <strong className="text-slate-800">{selectedRequest.created_by_name} ({selectedRequest.created_at})</strong>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Estado Logístico:</span>
                {renderStatusTag(selectedRequest.status)}
              </div>

              {selectedRequest.shipped_at && (
                <div>
                  <span className="text-slate-500 font-medium block">Despachado en Origen por:</span>
                  <strong className="text-amber-800">{selectedRequest.shipped_by_name} ({selectedRequest.shipped_at})</strong>
                </div>
              )}

              {selectedRequest.date_done && (
                <div>
                  <span className="text-slate-500 font-medium block">Recibido en Destino por:</span>
                  <strong className="text-emerald-800">{selectedRequest.received_by_name} ({selectedRequest.date_done})</strong>
                </div>
              )}
            </div>

            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">Productos de la Orden:</h4>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <DataTable value={selectedRequest.lines || []} size="small" stripedRows className="text-xs">
                <Column header="SKU" field="sku" body={l => <span className="font-mono font-bold text-slate-700">{l.sku}</span>} />
                <Column header="PRODUCTO" field="product_name" body={l => <span className="font-bold text-slate-800">{l.product_name}</span>} />
                <Column header="CANT. DEMANDADA" field="quantity_demand" align="center" body={l => <span className="font-extrabold text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200">{l.quantity_demand}</span>} />
                <Column header="CANT. RECIBIDA" field="quantity_done" align="center" body={l => <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">{l.quantity_done}</span>} />
                <Column header="OBSERVACIONES / NOVEDADES" field="notes" body={l => <span className="italic text-slate-600">{l.notes || 'Sin novedades'}</span>} />
              </DataTable>
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <Button label="Cerrar" text severity="secondary" onClick={() => { setDetailDialogVisible(false); setSelectedRequest(null); }} />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
