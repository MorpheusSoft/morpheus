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
              label: `${p.name} - SKU: ${v.sku || 'N/A'} (ID: ${v.id})`,
              value: v.id
            });
          });
        } else {
          variants.push({
            label: `${p.name} (ID: ${p.id})`,
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
      toast.current?.show({ severity: 'warn', summary: 'Campos Incompletos', detail: 'Por favor complete todos los datos requeridos.' });
      return;
    }

    setSaving(true);
    try {
      await api.post('/wms/shipments', {
        facility_id: selectedFacilityId,
        origin_doc: originDoc || undefined,
        destination_name: destinationName,
        lines: [
          {
            variant_id: selectedVariantId,
            quantity: shipmentQty
          }
        ]
      });

      toast.current?.show({ severity: 'success', summary: 'Despacho Creado', detail: 'Orden de salida registrada con éxito.' });
      setDialogVisible(false);
      fetchShipments();
      fetchPickingWaves();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'No se pudo crear el despacho.' });
    }
    setSaving(false);
  };

  const handleExecuteShipment = async (shipmentId: number) => {
    try {
      await api.post(`/wms/shipments/${shipmentId}/execute`);
      toast.current?.show({ severity: 'success', summary: 'Salida Confirmada', detail: 'Mercancía descontada e inventario actualizado.' });
      fetchShipments();
      fetchPickingWaves();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'No se pudo completar el despacho.' });
    }
  };

  const statusBodyTemplate = (rowData: any) => {
    switch (rowData.status) {
      case 'DONE':
        return <Tag value="COMPLETADO" severity="success" icon="pi pi-check" className="px-3 py-1 text-xs font-bold" />;
      case 'READY':
        return <Tag value="LISTO / PICKING" severity="info" icon="pi pi-clock" className="px-3 py-1 text-xs font-bold" />;
      case 'WAITING':
        return <Tag value="EN ESPERA" severity="warning" icon="pi pi-hourglass" className="px-3 py-1 text-xs font-bold" />;
      default:
        return <Tag value={rowData.status} severity="secondary" className="px-3 py-1 text-xs font-bold" />;
    }
  };

  const actionBodyTemplate = (rowData: any) => {
    return (
      <div className="flex gap-2">
        <Button
          icon="pi pi-eye"
          text
          className="p-button-sm text-slate-600 hover:text-slate-900"
          onClick={() => {
            setSelectedShipment(rowData);
            setDetailVisible(true);
          }}
          tooltip="Ver Detalle"
        />
        {rowData.status !== 'DONE' && (
          <Button
            icon="pi pi-check-circle"
            severity="success"
            className="p-button-sm text-xs font-bold px-3 py-1"
            label="Confirmar Salida"
            onClick={() => handleExecuteShipment(rowData.id)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} />

      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>
        <div className="pl-4">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
            <i className="pi pi-send text-emerald-500 mr-3"></i>Despachos & Olas de Picking
          </h1>
          <p className="text-slate-500 text-sm mt-1">Gestión de salidas de mercancía, preparación de carga y rutas de picking por pasillo.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            label="Actualizar"
            icon="pi pi-refresh"
            rounded
            outlined
            className="font-bold text-slate-600 border-slate-300 hover:bg-slate-50"
            onClick={() => { fetchShipments(); fetchPickingWaves(); }}
          />
          <Button
            label="Nuevo Despacho"
            icon="pi pi-plus"
            severity="success"
            className="font-bold px-4 py-2"
            onClick={() => setDialogVisible(true)}
          />
        </div>
      </div>

      <TabView className="custom-tabview">
        <TabPanel header="Órdenes de Despacho (Outbound)" leftIcon="pi pi-truck mr-2">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mt-2">
            <DataTable
              value={shipments}
              loading={loading}
              paginator
              rows={10}
              emptyMessage="No hay órdenes de despacho registradas."
              className="p-datatable-sm text-slate-700"
              stripedRows
              responsiveLayout="scroll"
            >
              <Column field="name" header="CÓDIGO" body={s => <span className="font-mono font-bold text-slate-800">{s.name}</span>} sortable />
              <Column field="destination_name" header="DESTINO / CLIENTE" body={s => <span className="font-semibold text-slate-700">{s.destination_name || 'Consumidor Final'}</span>} sortable />
              <Column field="origin_doc" header="DOC. ORIGEN" body={s => <span className="font-mono text-xs text-slate-500">{s.origin_doc || 'MANUAL'}</span>} sortable />
              <Column field="lines_count" header="LÍNEAS" body={s => <span className="font-bold">{s.lines_count || s.lines?.length || 0} ítems</span>} align="center" />
              <Column header="ESTADO" body={statusBodyTemplate} align="center" sortable />
              <Column header="ACCIONES" body={actionBodyTemplate} align="right" />
            </DataTable>
          </div>
        </TabPanel>

        <TabPanel header="Olas de Picking por Pasillo/Estante" leftIcon="pi pi-sitemap mr-2">
          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-4 font-semibold">
              Rutas óptimas de recolección agrupadas por estantes. El personal de almacén recoge los ítems priorizando lotes FEFO.
            </p>

            {pickingWaves.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-slate-500 border border-slate-200 shadow-sm">
                <i className="pi pi-inbox text-4xl mb-2 text-slate-300"></i>
                <p className="font-bold text-slate-700">No hay tareas de picking pendientes en este momento.</p>
                <p className="text-xs text-slate-400 mt-1">Las olas se generan automáticamente al crear nuevas órdenes de salida.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pickingWaves.map((wave) => (
                  <div key={wave.location_id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
                      <div>
                        <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider block">UBICACIÓN PICKING</span>
                        <h3 className="text-lg font-black">{wave.location_name} ({wave.location_code})</h3>
                      </div>
                      <Tag value={`${wave.pending_items_count} ítems`} severity="warning" className="font-bold" />
                    </div>

                    <div className="p-4 flex-1">
                      <div className="space-y-3">
                        {wave.items?.map((item: any, idx: number) => (
                          <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between items-center">
                            <div>
                              <p className="text-sm font-bold text-slate-800">{item.product_name}</p>
                              <p className="text-xs text-slate-500 font-mono">SKU: {item.sku || 'N/A'} | Orden: {item.picking_name}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-base font-black text-emerald-700">{item.qty_needed} Unds</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabPanel>
      </TabView>

      {/* DIÁLOGO NUEVO DESPACHO */}
      <Dialog
        header="Registrar Nueva Orden de Despacho"
        visible={dialogVisible}
        onHide={() => setDialogVisible(false)}
        style={{ width: '500px' }}
      >
        <div className="flex flex-col gap-4 py-2">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Instalación / Almacén Origen:</label>
            <Dropdown
              value={selectedFacilityId}
              options={facilities.map(f => ({ label: f.name, value: f.id }))}
              onChange={(e) => setSelectedFacilityId(e.value)}
              placeholder="Seleccionar almacén origen..."
              className="w-full text-xs font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Destino / Cliente B2B:</label>
            <InputText
              value={destinationName}
              onChange={(e) => setDestinationName(e.target.value)}
              placeholder="Nombre del cliente o sucursal destino..."
              className="w-full text-xs font-bold p-inputtext-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Doc. Referencia (Opcional):</label>
            <InputText
              value={originDoc}
              onChange={(e) => setOriginDoc(e.target.value)}
              placeholder="Ej: PED-2026-009"
              className="w-full text-xs font-bold p-inputtext-sm"
            />
          </div>

          <div className="border-t border-slate-200 pt-3 mt-1">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Producto a Despachar:</h4>
            
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Producto / Variante:</label>
                <Dropdown
                  value={selectedVariantId}
                  options={productsList}
                  onChange={(e) => setSelectedVariantId(e.value)}
                  placeholder="Seleccionar producto..."
                  filter
                  className="w-full text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Cantidad a Despachar:</label>
                <InputNumber
                  value={shipmentQty}
                  onValueChange={(e) => setShipmentQty(e.value || 1)}
                  min={1}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-slate-200">
            <Button label="Cancelar" text severity="secondary" onClick={() => setDialogVisible(false)} />
            <Button label="Crear Despacho" icon="pi pi-check" severity="success" loading={saving} onClick={handleCreateShipment} className="font-bold" />
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO DETALLE DESPACHO */}
      <Dialog
        header={`Detalle de Despacho ${selectedShipment?.name || ''}`}
        visible={detailVisible}
        onHide={() => setDetailVisible(false)}
        style={{ width: '600px' }}
      >
        {selectedShipment && (
          <div className="py-2">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 font-semibold">Cliente / Destino:</p>
                <p className="font-bold text-slate-800">{selectedShipment.destination_name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold">Documento Origen:</p>
                <p className="font-bold text-slate-800">{selectedShipment.origin_doc || 'MANUAL'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold">Estado Actual:</p>
                {statusBodyTemplate(selectedShipment)}
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold">Fecha de Registro:</p>
                <p className="font-mono text-xs text-slate-700">{selectedShipment.created_at || 'Hoy'}</p>
              </div>
            </div>

            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Líneas de Producto Solicitadas:</h4>
            <div className="space-y-2">
              {selectedShipment.lines?.map((line: any) => (
                <div key={line.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{line.product_name}</p>
                    <p className="text-xs text-slate-500 font-mono">SKU: {line.sku || 'N/A'}</p>
                  </div>
                  <span className="font-bold text-slate-800 text-sm bg-slate-100 px-3 py-1 rounded">
                    {line.quantity_demand} Unds
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-end mt-4 pt-3 border-t border-slate-200">
              <Button label="Cerrar" text severity="secondary" onClick={() => setDetailVisible(false)} />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
