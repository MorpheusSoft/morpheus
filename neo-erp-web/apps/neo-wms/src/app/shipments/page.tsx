"use client";

import React, { useState, useEffect, useRef } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { TabView, TabPanel } from 'primereact/tabview';
import api from '@/lib/api';

export default function WmsShipmentsPage() {
  const [shipments, setShipments] = useState<any[]>([]);
  const [pickingWaves, setPickingWaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useRef<Toast>(null);

  // New Shipment Dialog
  const [dialogVisible, setDialogVisible] = useState(false);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [destinationName, setDestinationName] = useState('Cliente B2B / Sucursal');
  const [originDoc, setOriginDoc] = useState('');
  
  const [productsList, setProductsList] = useState<any[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [shipmentQty, setShipmentQty] = useState<number>(1);
  const [saving, setSaving] = useState(false);

  // View Shipment Detail Dialog
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<any>(null);

  const fetchShipments = async () => {
    setLoading(true);
    try {
      const res = await api.get('/wms/shipments');
      setShipments(res.data || []);
    } catch (e) {
      console.error(e);
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las órdenes de despacho.' });
    }
    setLoading(false);
  };

  const fetchPickingWaves = async () => {
    try {
      const res = await api.get('/wms/picking-waves');
      setPickingWaves(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchFacilitiesAndProducts = async () => {
    try {
      const facRes = await api.get('/facilities/');
      setFacilities(facRes.data || []);
      if (facRes.data && facRes.data.length > 0) {
        setSelectedFacilityId(facRes.data[0].id);
      }

      const prodRes = await api.get('/products/?limit=100');
      const variants: any[] = [];
      (prodRes.data || []).forEach((p: any) => {
        if (p.variants && p.variants.length > 0) {
          p.variants.forEach((v: any) => {
            variants.push({
              label: `${p.name} - SKU: ${v.sku}`,
              value: v.id
            });
          });
        } else {
          variants.push({
            label: `${p.name} - (Sin Variante)`,
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
    fetchShipments();
    fetchPickingWaves();
    fetchFacilitiesAndProducts();
  }, []);

  const handleCreateShipment = async () => {
    if (!selectedFacilityId || !selectedVariantId || shipmentQty <= 0) {
      toast.current?.show({ severity: 'warn', summary: 'Atención', detail: 'Por favor completa todos los campos requeridos.' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        facility_id: selectedFacilityId,
        destination_name: destinationName,
        origin_document: originDoc || 'ORD-SALIDA-MANUAL',
        lines: [
          {
            variant_id: selectedVariantId,
            quantity: shipmentQty
          }
        ]
      };

      const res = await api.post('/wms/shipments', payload);
      toast.current?.show({ severity: 'success', summary: 'Éxito', detail: res.data.message || 'Orden de despacho creada.' });
      setDialogVisible(false);
      fetchShipments();
      fetchPickingWaves();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Error al crear despacho.' });
    }
    setSaving(false);
  };

  const handleExecuteShipment = async (pickingId: number) => {
    try {
      const res = await api.post(`/wms/shipments/${pickingId}/execute`);
      toast.current?.show({ severity: 'success', summary: 'Despachado', detail: res.data.message });
      fetchShipments();
      fetchPickingWaves();
      if (detailVisible) setDetailVisible(false);
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'No se pudo completar el despacho.' });
    }
  };

  const statusBodyTemplate = (rowData: any) => {
    switch (rowData.status) {
      case 'DONE':
        return <Tag value="COMPLETADO" severity="success" icon="pi pi-check" className="px-3 py-1 text-xs" />;
      case 'READY':
        return <Tag value="LISTO / PICKING" severity="info" icon="pi pi-clock" className="px-3 py-1 text-xs" />;
      case 'WAITING':
        return <Tag value="EN ESPERA" severity="warning" icon="pi pi-hourglass" className="px-3 py-1 text-xs" />;
      default:
        return <Tag value={rowData.status} severity="secondary" className="px-3 py-1 text-xs" />;
    }
  };

  const actionBodyTemplate = (rowData: any) => {
    return (
      <div className="flex gap-2">
        <Button
          icon="pi pi-eye"
          className="p-button-text p-button-sm text-slate-300 hover:text-white"
          onClick={() => {
            setSelectedShipment(rowData);
            setDetailVisible(true);
          }}
          tooltip="Ver Detalle"
        />
        {rowData.status !== 'DONE' && (
          <Button
            icon="pi pi-check-circle"
            className="p-button-success p-button-sm text-xs px-3 py-1"
            label="Confirmar Salida"
            onClick={() => handleExecuteShipment(rowData.id)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="p-6 bg-[#0f172a] min-h-screen text-slate-200">
      <Toast ref={toast} />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 pb-4 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <i className="pi pi-send text-xl"></i>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Despachos & Olas de Picking</h1>
              <p className="text-slate-400 text-sm">Gestión de salidas de mercancía, preparación de carga y rutas de picking por pasillo.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            label="Actualizar"
            icon="pi pi-refresh"
            className="p-button-outlined p-button-secondary text-sm border-slate-700 text-slate-300 hover:bg-slate-800"
            onClick={() => { fetchShipments(); fetchPickingWaves(); }}
          />
          <Button
            label="Nueva Orden de Salida"
            icon="pi pi-plus"
            className="p-button-success text-sm bg-emerald-500 hover:bg-emerald-600 border-none font-medium px-4 py-2"
            onClick={() => setDialogVisible(true)}
          />
        </div>
      </div>

      {/* Main Tabs */}
      <TabView className="custom-tabview">
        <TabPanel header="Órdenes de Despacho" leftIcon="pi pi-list mr-2">
          <div className="bg-[#1e293b]/60 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-md p-4">
            <DataTable
              value={shipments}
              loading={loading}
              paginator
              rows={10}
              className="p-datatable-sm text-slate-300"
              emptyMessage="No se encontraron órdenes de despacho."
              responsiveLayout="scroll"
            >
              <Column field="name" header="Código Ref." sortable className="font-semibold text-emerald-400" />
              <Column field="origin_document" header="Doc. Origen" sortable />
              <Column field="total_items" header="Ítems" sortable align="center" />
              <Column field="status" header="Estado" body={statusBodyTemplate} sortable />
              <Column field="created_at" header="Fecha Creación" body={(rd) => rd.created_at ? new Date(rd.created_at).toLocaleString() : 'N/A'} sortable />
              <Column header="Acciones" body={actionBodyTemplate} align="right" />
            </DataTable>
          </div>
        </TabPanel>

        <TabPanel header="Olas de Picking por Ubicación" leftIcon="pi pi-sitemap mr-2">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pickingWaves.length === 0 ? (
              <div className="col-span-full p-8 text-center bg-[#1e293b]/40 rounded-xl border border-slate-800 text-slate-400">
                <i className="pi pi-[#1e293b] pi-check-circle text-4xl mb-3 text-emerald-500/40"></i>
                <p>No hay olas de picking pendientes en este momento.</p>
              </div>
            ) : (
              pickingWaves.map((wave, idx) => (
                <div key={idx} className="bg-[#1e293b]/80 border border-slate-700/60 rounded-xl p-4 shadow-lg flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3 border-b border-slate-700 pb-2">
                      <div className="flex items-center gap-2">
                        <i className="pi pi-map-marker text-emerald-400"></i>
                        <span className="font-bold text-white text-base">{wave.location_code}</span>
                      </div>
                      <Tag value={`${wave.total_items} Ítems`} severity="info" className="text-xs px-2 py-1" />
                    </div>
                    <p className="text-xs text-slate-400 mb-3">{wave.location_name}</p>

                    <div className="space-y-2">
                      {wave.items.map((item: any, iIdx: number) => (
                        <div key={iIdx} className="bg-[#0f172a]/60 p-2.5 rounded-lg border border-slate-800 flex justify-between items-center text-xs">
                          <div>
                            <p className="font-semibold text-slate-200">{item.product_name}</p>
                            <p className="text-slate-500">SKU: {item.sku} | Ref: {item.picking_name}</p>
                          </div>
                          <span className="font-bold text-emerald-400 text-sm bg-emerald-950/40 px-2 py-1 rounded border border-emerald-800/40">
                            x{item.quantity_demand}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabPanel>
      </TabView>

      {/* New Shipment Dialog */}
      <Dialog
        header="Crear Nueva Orden de Despacho"
        visible={dialogVisible}
        style={{ width: '500px' }}
        onHide={() => setDialogVisible(false)}
        className="custom-dialog"
      >
        <div className="flex flex-col gap-4 py-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Sucursal Origen</label>
            <Dropdown
              value={selectedFacilityId}
              options={facilities}
              optionLabel="name"
              optionValue="id"
              onChange={(e) => setSelectedFacilityId(e.value)}
              placeholder="Selecciona Sucursal"
              className="w-full p-inputtext-sm bg-slate-900 border-slate-700 text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Destino / Cliente</label>
            <InputText
              value={destinationName}
              onChange={(e) => setDestinationName(e.target.value)}
              placeholder="Nombre del Cliente o Sucursal Destino"
              className="w-full p-inputtext-sm bg-slate-900 border-slate-700 text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Documento Referencia / Orden B2B</label>
            <InputText
              value={originDoc}
              onChange={(e) => setOriginDoc(e.target.value)}
              placeholder="Ej: PED-B2B-1002"
              className="w-full p-inputtext-sm bg-slate-900 border-slate-700 text-white"
            />
          </div>

          <div className="border-t border-slate-800 pt-3">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Producto / Variante a Despachar</label>
            <Dropdown
              value={selectedVariantId}
              options={productsList}
              onChange={(e) => setSelectedVariantId(e.value)}
              placeholder="Buscar Producto..."
              filter
              className="w-full p-inputtext-sm bg-slate-900 border-slate-700 text-white mb-3"
            />

            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Cantidad de Salida</label>
            <InputNumber
              value={shipmentQty}
              onValueChange={(e) => setShipmentQty(e.value || 1)}
              min={1}
              className="w-full p-inputtext-sm"
              inputClassName="bg-slate-900 border-slate-700 text-white text-base"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-800">
          <Button
            label="Cancelar"
            className="p-button-text text-slate-400 hover:text-white"
            onClick={() => setDialogVisible(false)}
          />
          <Button
            label="Crear Orden"
            icon="pi pi-check"
            loading={saving}
            className="p-button-success bg-emerald-500 hover:bg-emerald-600 border-none font-medium px-4"
            onClick={handleCreateShipment}
          />
        </div>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog
        header={`Detalle de Despacho: ${selectedShipment?.name || ''}`}
        visible={detailVisible}
        style={{ width: '650px' }}
        onHide={() => setDetailVisible(false)}
        className="custom-dialog"
      >
        {selectedShipment && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4 bg-slate-900/80 p-3 rounded-lg border border-slate-800 text-xs">
              <div>
                <p className="text-slate-500">Documento Origen:</p>
                <p className="font-semibold text-slate-200">{selectedShipment.origin_document}</p>
              </div>
              <div>
                <p className="text-slate-500">Estado Actual:</p>
                {statusBodyTemplate(selectedShipment)}
              </div>
            </div>

            <div className="bg-slate-900/40 rounded-lg p-2 border border-slate-800">
              <p className="text-xs font-bold text-slate-400 mb-2 px-2 uppercase tracking-wider">Productos en esta Orden</p>
              <DataTable value={selectedShipment.moves || []} className="p-datatable-sm text-xs">
                <Column field="product_name" header="Producto" />
                <Column field="sku" header="SKU" />
                <Column field="quantity_demand" header="Cant. Requerida" align="center" />
                <Column field="location_src_name" header="Ubicación Origen" />
              </DataTable>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              {selectedShipment.status !== 'DONE' && (
                <Button
                  label="Confirmar Salida Física"
                  icon="pi pi-check-circle"
                  className="p-button-success bg-emerald-500 hover:bg-emerald-600 border-none"
                  onClick={() => handleExecuteShipment(selectedShipment.id)}
                />
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
