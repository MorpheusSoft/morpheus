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
import api from '@/lib/api';

export default function WmsTransfersPage() {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useRef<Toast>(null);

  // New Transfer Dialog
  const [dialogVisible, setDialogVisible] = useState(false);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [srcFacilityId, setSrcFacilityId] = useState<number | null>(null);
  const [destFacilityId, setDestFacilityId] = useState<number | null>(null);
  
  const [productsList, setProductsList] = useState<any[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [transferQty, setTransferQty] = useState<number>(1);
  const [saving, setSaving] = useState(false);

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/wms-transfers/');
      setTransfers(res.data || []);
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las transferencias.' });
    }
    setLoading(false);
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
      setProductsList(prodRes.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchTransfers();
    fetchFacilitiesAndProducts();
  }, []);

  const createTransfer = async () => {
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
      setDialogVisible(false);
      fetchTransfers();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo al procesar la transferencia.' });
    }
    setSaving(false);
  };

  return (
    <div className="p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex justify-between items-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-blue-600"></div>
        <div className="pl-4">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
            <i className="pi pi-arrow-right-arrow-left text-blue-600 mr-3"></i>Transferencias entre Sucursales (Outbound)
          </h1>
          <p className="text-slate-500 text-sm mt-1">Despacho y traslado de inventario inter-sucursales con guía de movimiento.</p>
        </div>

        <div className="flex gap-3">
          <Button label="Nueva Transferencia" icon="pi pi-send" severity="info" onClick={() => setDialogVisible(true)} className="font-bold shadow-md" />
          <Button icon="pi pi-refresh" rounded outlined onClick={fetchTransfers} />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <DataTable value={transfers} loading={loading} emptyMessage="No hay transferencias registradas." size="small" stripedRows rowHover className="text-sm">
          <Column header="NÚMERO GUÍA" field="name" body={t => <span className="font-mono font-bold text-xs bg-slate-100 px-3 py-1.5 rounded text-slate-700 border border-slate-200">{t.name}</span>} />
          <Column header="FECHA" field="created_at" />
          <Column header="SUCURSAL ORIGEN" body={t => <span className="font-bold text-slate-700">Sucursal #{t.facility_id}</span>} />
          <Column header="LÍNEAS DESPACHADAS" field="lines_count" align="center" body={t => <span className="font-extrabold">{t.lines_count} ítems</span>} />
          <Column header="ESTADO LOGÍSTICO" body={t => <Tag severity="success" value={t.status} className="font-black text-[9px]" />} align="center" />
        </DataTable>
      </div>

      {/* DIÁLOGO NUEVA TRANSFERENCIA */}
      <Dialog header="Crear Transferencia Inter-Sucursales" visible={dialogVisible} onHide={() => setDialogVisible(false)} style={{ width: '450px' }}>
        <div className="flex flex-col gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Sucursal Origen:</label>
              <Dropdown 
                value={srcFacilityId} 
                options={facilities.map(f => ({ label: f.name, value: f.id }))} 
                onChange={(e) => setSrcFacilityId(e.value)} 
                className="w-full text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Sucursal Destino:</label>
              <Dropdown 
                value={destFacilityId} 
                options={facilities.map(f => ({ label: f.name, value: f.id }))} 
                onChange={(e) => setDestFacilityId(e.value)} 
                className="w-full text-xs font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Producto a Despachar:</label>
            <Dropdown 
              value={selectedVariantId}
              options={productsList.map(p => ({ label: `${p.name} (SKU: ${p.sku || p.id})`, value: p.id }))}
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
            <Button label="Cancelar" text severity="secondary" onClick={() => setDialogVisible(false)} />
            <Button label="Ejecutar Despacho" severity="info" loading={saving} onClick={createTransfer} className="font-bold" />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
