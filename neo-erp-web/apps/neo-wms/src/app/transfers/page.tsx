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
import { TabView, TabPanel } from 'primereact/tabview';
import api from '@/lib/api';

export default function WmsTransfersPage() {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const toast = useRef<Toast>(null);

  // New Direct Transfer Dialog
  const [transferDialogVisible, setTransferDialogVisible] = useState(false);
  
  // New Replenishment Request Dialog
  const [requestDialogVisible, setRequestDialogVisible] = useState(false);

  const [facilities, setFacilities] = useState<any[]>([]);
  const [srcFacilityId, setSrcFacilityId] = useState<number | null>(null);
  const [destFacilityId, setDestFacilityId] = useState<number | null>(null);
  
  const [productsList, setProductsList] = useState<any[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [transferQty, setTransferQty] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [fulfillingId, setFulfillingId] = useState<number | null>(null);

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
      setFacilities(facRes.data || []);
      if (facRes.data && facRes.data.length >= 2) {
        setSrcFacilityId(facRes.data[0].id);
        setDestFacilityId(facRes.data[1].id);
      }

      const prodRes = await api.get('/products/?limit=100');
      const variants: any[] = [];
      (prodRes.data || []).forEach((p: any) => {
        if (p && p.variants && p.variants.length > 0) {
          p.variants.forEach((v: any) => {
            variants.push({
              label: `${p.name || 'Producto'} - SKU: ${v.sku || 'N/A'} (ID: ${v.id})`,
              value: v.id
            });
          });
        } else if (p) {
          variants.push({
            label: `${p.name || 'Producto'} (ID: ${p.id})`,
            value: p.id
          });
        }
      });
      setProductsList(variants);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchRequests();
    fetchTransfers();
    fetchFacilitiesAndProducts();
  }, []);

  // Crear Solicitud de Reabastecimiento Interno
  const handleCreateRequest = async () => {
    if (!srcFacilityId || !destFacilityId || !selectedVariantId || transferQty <= 0) {
      toast.current?.show({ severity: 'warn', summary: 'Campos incompletos', detail: 'Complete sucursal origen, destino, producto y cantidad.' });
      return;
    }

    if (srcFacilityId === destFacilityId) {
      toast.current?.show({ severity: 'warn', summary: 'Error Origen/Destino', detail: 'La sucursal de origen y destino deben ser distintas.' });
      return;
    }

    setSaving(true);
    try {
      await api.post('/wms-transfers/requests', {
        src_facility_id: srcFacilityId,
        dest_facility_id: destFacilityId,
        lines: [
          {
            variant_id: selectedVariantId,
            qty: transferQty
          }
        ]
      });
      toast.current?.show({ severity: 'success', summary: 'Solicitud Creada', detail: 'Solicitud de reabastecimiento registrada exitosamente.' });
      setRequestDialogVisible(false);
      fetchRequests();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al crear la solicitud.' });
    }
    setSaving(false);
  };

  // Despachar / Fulfill Solicitud
  const handleFulfillRequest = async (requestId: number) => {
    setFulfillingId(requestId);
    try {
      await api.post(`/wms-transfers/requests/${requestId}/fulfill`);
      toast.current?.show({ severity: 'success', summary: 'Solicitud Despachada', detail: 'Mercancía transferida con éxito entre sucursales.' });
      fetchRequests();
      fetchTransfers();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al despachar la solicitud.' });
    }
    setFulfillingId(null);
  };

  // Crear Transferencia Directa
  const createDirectTransfer = async () => {
    if (!srcFacilityId || !destFacilityId || !selectedVariantId || transferQty <= 0) {
      toast.current?.show({ severity: 'warn', summary: 'Campos incompletos', detail: 'Complete origen, destino, producto y cantidad.' });
      return;
    }

    if (srcFacilityId === destFacilityId) {
      toast.current?.show({ severity: 'warn', summary: 'Error de Origen/Destino', detail: 'La sucursal origen y destino deben ser distintas.' });
      return;
    }

    setSaving(true);
    try {
      await api.post('/wms-transfers/', {
        src_facility_id: srcFacilityId,
        dest_facility_id: destFacilityId,
        lines: [
          {
            variant_id: selectedVariantId,
            qty: transferQty
          }
        ]
      });
      toast.current?.show({ severity: 'success', summary: 'Transferencia Exitosa', detail: 'Despacho registrado entre sucursales.' });
      setTransferDialogVisible(false);
      fetchTransfers();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al procesar la transferencia.' });
    }
    setSaving(false);
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
          <p className="text-slate-500 text-sm mt-1">Gestión de solicitudes de stock entre tiendas y CENDI, despacho e historial de guías de movimiento.</p>
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
            label="Transferencia Directa" 
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
          {/* PESTAÑA 1: SOLICITUDES DE REABASTECIMIENTO */}
          <TabPanel header="Solicitudes de Reabastecimiento Interno" leftIcon="pi pi-list mr-2">
            <DataTable 
              value={requests} 
              loading={loadingRequests} 
              emptyMessage="No hay solicitudes de reabastecimiento pendientes." 
              size="small" 
              stripedRows 
              rowHover 
              className="text-sm"
            >
              <Column 
                header="CÓDIGO SOLICITUD" 
                field="name" 
                body={r => <span className="font-mono font-bold text-xs bg-amber-50 px-3 py-1.5 rounded text-amber-800 border border-amber-200">{r.name}</span>} 
              />
              <Column header="FECHA" field="created_at" />
              <Column header="ORIGEN (DESPACHANTE)" field="src_facility_name" body={r => <span className="font-bold text-slate-700">{r.src_facility_name}</span>} />
              <Column header="DESTINO (SOLICITANTE)" field="dest_facility_name" body={r => <span className="font-bold text-blue-700">{r.dest_facility_name}</span>} />
              <Column header="ITEMS" field="lines_count" align="center" body={r => <span className="font-extrabold">{r.lines_count} ítems</span>} />
              <Column 
                header="ESTADO" 
                body={r => (
                  <Tag 
                    severity={r.status === 'DONE' ? 'success' : (r.status === 'PENDING' ? 'warning' : 'info')} 
                    value={r.status === 'PENDING' ? 'PENDIENTE PREPARACIÓN' : r.status} 
                    className="font-black text-[10px]" 
                  />
                )} 
                align="center" 
              />
              <Column 
                header="ACCIONES" 
                align="center"
                body={r => (
                  r.status === 'PENDING' ? (
                    <Button 
                      label="Despachar / Transferir" 
                      icon="pi pi-check-circle" 
                      severity="success" 
                      size="small"
                      loading={fulfillingId === r.id}
                      onClick={() => handleFulfillRequest(r.id)} 
                      className="font-bold text-xs shadow-sm" 
                    />
                  ) : (
                    <span className="text-xs text-slate-400 font-bold">Completado</span>
                  )
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
              <Column header="ESTADO LOGÍSTICO" body={t => <Tag severity="success" value={t.status} className="font-black text-[9px]" />} align="center" />
            </DataTable>
          </TabPanel>
        </TabView>
      </div>

      {/* DIÁLOGO NUEVA SOLICITUD DE REABASTECIMIENTO */}
      <Dialog 
        header="Nueva Solicitud de Reabastecimiento Interno" 
        visible={requestDialogVisible} 
        onHide={() => setRequestDialogVisible(false)} 
        style={{ width: '480px' }}
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 font-medium">
            <i className="pi pi-info-circle mr-1"></i> Permite a cualquier tienda o sucursal solicitar stock al CENDI o a otra sucursal.
          </div>

          <div className="grid grid-cols-2 gap-3">
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

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Producto Requerido:</label>
            <Dropdown 
              value={selectedVariantId}
              options={productsList || []}
              onChange={(e) => setSelectedVariantId(e.value)}
              placeholder="Seleccionar producto..."
              filter
              className="w-full text-xs font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Cantidad Solicitada:</label>
            <InputNumber 
              value={transferQty} 
              onValueChange={(e) => setTransferQty(e.value || 1)}
              min={1}
              className="w-full"
            />
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <Button label="Cancelar" text severity="secondary" onClick={() => setRequestDialogVisible(false)} />
            <Button label="Enviar Solicitud" severity="success" loading={saving} onClick={handleCreateRequest} className="font-bold" />
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO NUEVA TRANSFERENCIA DIRECTA */}
      <Dialog 
        header="Crear Transferencia Directa Inter-Sucursales" 
        visible={transferDialogVisible} 
        onHide={() => setTransferDialogVisible(false)} 
        style={{ width: '480px' }}
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Sucursal Origen:</label>
              <Dropdown 
                value={srcFacilityId} 
                options={(facilities || []).map(f => ({ label: f.name, value: f.id }))} 
                onChange={(e) => setSrcFacilityId(e.value)} 
                className="w-full text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Sucursal Destino:</label>
              <Dropdown 
                value={destFacilityId} 
                options={(facilities || []).map(f => ({ label: f.name, value: f.id }))} 
                onChange={(e) => setDestFacilityId(e.value)} 
                className="w-full text-xs font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Producto a Despachar:</label>
            <Dropdown 
              value={selectedVariantId}
              options={productsList || []}
              onChange={(e) => setSelectedVariantId(e.value)}
              placeholder="Seleccionar producto..."
              filter
              className="w-full text-xs font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Cantidad a Transferir:</label>
            <InputNumber 
              value={transferQty} 
              onValueChange={(e) => setTransferQty(e.value || 1)}
              min={1}
              className="w-full"
            />
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <Button label="Cancelar" text severity="secondary" onClick={() => setTransferDialogVisible(false)} />
            <Button label="Ejecutar Despacho" severity="info" loading={saving} onClick={createDirectTransfer} className="font-bold" />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
