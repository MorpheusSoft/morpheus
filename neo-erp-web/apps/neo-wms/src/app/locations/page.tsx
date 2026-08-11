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

export default function WmsLocationsPage() {
  const [treeData, setTreeData] = useState<any[]>([]);
  const [occupancyData, setOccupancyData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const toast = useRef<Toast>(null);

  // Putaway state
  const [putawayDialogVisible, setPutawayDialogVisible] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);
  const [targetLocationId, setTargetLocationId] = useState<number | null>(null);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [productsList, setProductsList] = useState<any[]>([]);
  const [putawayQty, setPutawayQty] = useState<number>(1);
  const [executingPutaway, setExecutingPutaway] = useState(false);

  const fetchTreeAndOccupancy = async () => {
    setLoading(true);
    try {
      const [treeRes, occRes] = await Promise.all([
        api.get('/wms/locations/tree').catch(() => ({ data: [] })),
        api.get('/wms/locations/occupancy').catch(() => ({ data: [] }))
      ]);

      setTreeData(treeRes.data || []);
      
      const occMap: any = {};
      (occRes.data || []).forEach((item: any) => {
        occMap[item.id] = item;
      });
      setOccupancyData(occMap);
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el mapa de almacenes.' });
    }
    setLoading(false);
  };

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products/?limit=100');
      const formattedOptions: any[] = [];
      
      (res.data || []).forEach((p: any) => {
        if (p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
          p.variants.forEach((v: any) => {
            formattedOptions.push({
              label: `${p.name} (SKU: ${v.sku || 'N/A'})`,
              value: v.id
            });
          });
        } else {
          formattedOptions.push({
            label: `${p.name} (ID: ${p.id})`,
            value: p.id
          });
        }
      });

      setProductsList(formattedOptions);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchTreeAndOccupancy();
    fetchProducts();
  }, []);

  const openPutaway = (wh: any) => {
    if (!wh) return;
    setSelectedWarehouse(wh);
    setTargetLocationId(null);
    setVariantId(null);
    setPutawayQty(1);
    setPutawayDialogVisible(true);
  };

  const submitPutaway = async () => {
    if (!selectedWarehouse || !targetLocationId || !variantId || putawayQty <= 0) {
      toast.current?.show({ severity: 'warn', summary: 'Campos incompletos', detail: 'Complete todos los datos de reubicación.' });
      return;
    }

    setExecutingPutaway(true);
    try {
      await api.post('/wms/putaway', {
        warehouse_id: selectedWarehouse.id,
        variant_id: variantId,
        qty: putawayQty,
        dest_location_id: targetLocationId
      });
      toast.current?.show({ severity: 'success', summary: 'Putaway Exitoso', detail: 'Mercancía movida a la ubicación destino.' });
      setPutawayDialogVisible(false);
      fetchTreeAndOccupancy();
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error Putaway', detail: e.response?.data?.detail || 'No se pudo realizar el movimiento.' });
    }
    setExecutingPutaway(false);
  };

  const getLocationTypeSeverity = (type: string) => {
    switch (type) {
      case 'DOCK': return 'warning';
      case 'LOSS': return 'danger';
      case 'SHELF': return 'info';
      default: return 'secondary';
    }
  };

  const occupancyTemplate = (loc: any) => {
    if (!loc) return null;
    const occ = occupancyData[loc.id] || { percentage_used: 0, thermal_status: 'LOW' };
    const pct = occ.percentage_used || 0;
    
    let colorClass = "bg-emerald-500";
    let tagSeverity: any = "success";
    let tagLabel = "DESPEJADO";

    if (pct >= 90) {
      colorClass = "bg-red-500";
      tagSeverity = "danger";
      tagLabel = "SATURADO";
    } else if (pct >= 70) {
      colorClass = "bg-amber-500";
      tagSeverity = "warning";
      tagLabel = "OCUPADO";
    }

    return (
      <div className="w-48">
        <div className="flex justify-between items-center mb-1 text-[11px]">
          <span className="font-bold text-slate-300">{pct}% Llenado</span>
          <Tag value={tagLabel} severity={tagSeverity} className="text-[9px] px-1.5 py-0.5" />
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
          <div className={`h-full ${colorClass} transition-all duration-500`} style={{ width: `${Math.min(100, pct)}%` }}></div>
        </div>
      </div>
    );
  };

  // Prevenir crash calculando siempre un array seguro de ubicaciones
  const locationOptions = React.useMemo(() => {
    if (!selectedWarehouse || !Array.isArray(selectedWarehouse.locations)) return [];
    return selectedWarehouse.locations.map((l: any) => ({
      label: `${l.name} (${l.code}) [${l.location_type || 'SHELF'}]`,
      value: l.id
    }));
  }, [selectedWarehouse]);

  return (
    <div className="p-6 bg-[#0f172a] min-h-screen text-slate-200">
      <Toast ref={toast} position="bottom-right" />
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 pb-4 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <i className="pi pi-sitemap text-xl"></i>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Mapa Térmico de Almacenes y Ubicaciones</h1>
              <p className="text-slate-400 text-sm">Control de ocupación volumétrica, saturación de pasillos y reubicación Putaway (Acomodo en Estantes).</p>
            </div>
          </div>
        </div>
        
        <Button
          icon="pi pi-refresh"
          className="p-button-outlined p-button-secondary border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={fetchTreeAndOccupancy}
        />
      </div>

      {loading ? (
        <div className="p-8 text-slate-400 font-medium flex items-center"><i className="pi pi-spin pi-spinner text-2xl mr-3 text-emerald-400"></i> Cargando mapa térmico...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {treeData.map((wh) => (
            <div key={wh.id} className="bg-[#1e293b]/60 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-md flex flex-col">
              <div className="p-4 border-b border-slate-800 bg-slate-900/80 text-white flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2 text-white">
                    <i className="pi pi-building text-emerald-400"></i> {wh.name}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">CÓD: {wh.code}</p>
                </div>
                
                <div className="flex items-center gap-2">
                  {wh.requires_dock_staging && (
                    <Tag value="CD (DOCK)" severity="warning" className="text-[10px] font-bold" />
                  )}
                  <Button 
                    label="Putaway" 
                    icon="pi pi-arrow-right-arrow-left" 
                    size="small" 
                    className="p-button-success bg-emerald-500 hover:bg-emerald-600 border-none text-xs font-medium px-3 py-1.5" 
                    onClick={() => openPutaway(wh)} 
                  />
                </div>
              </div>

              <div className="p-4 flex-1">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Ubicaciones y Pasillos ({wh.locations?.length || 0})</h4>
                <DataTable value={wh.locations || []} size="small" className="p-datatable-sm text-slate-300" stripedRows emptyMessage="No hay ubicaciones en este almacén.">
                  <Column header="CÓDIGO" field="code" body={l => <span className="font-mono text-xs font-bold bg-slate-900 px-2 py-1 rounded text-emerald-400 border border-emerald-500/30">{l.code}</span>} sortable />
                  <Column header="NOMBRE UBICACIÓN" field="name" body={l => <span className="font-medium text-slate-200">{l.name}</span>} sortable />
                  <Column header="TIPO" body={l => <Tag severity={getLocationTypeSeverity(l.location_type)} value={l.location_type} className="text-[10px] font-bold" />} sortable />
                  <Column header="SATURACIÓN VOLUMÉTRICA (MAPA TÉRMICO)" body={occupancyTemplate} align="right" />
                </DataTable>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DIÁLOGO PUTAWAY (REUBICACIÓN EN ESTANTES) */}
      <Dialog
        header="Ejecutar Movimiento Putaway (Acomodo en Estante)"
        visible={putawayDialogVisible}
        onHide={() => setPutawayDialogVisible(false)}
        style={{ width: '480px' }}
        className="custom-dialog"
      >
        {selectedWarehouse && (
          <div className="flex flex-col gap-4 py-2">
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
              <p className="text-xs text-slate-400">Almacén Seleccionado:</p>
              <p className="font-semibold text-slate-100">{selectedWarehouse.name} ({selectedWarehouse.code})</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Producto a Reubicar:</label>
              <Dropdown 
                value={variantId}
                options={productsList}
                onChange={(e) => setVariantId(e.value)}
                placeholder="Seleccionar producto..."
                filter
                className="w-full p-inputtext-sm bg-slate-900 border-slate-700 text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Ubicación Destino (Pasillo / Estante):</label>
              <Dropdown 
                value={targetLocationId}
                options={locationOptions}
                onChange={(e) => setTargetLocationId(e.value)}
                placeholder="Seleccionar estante destino..."
                filter
                className="w-full p-inputtext-sm bg-slate-900 border-slate-700 text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Cantidad a Mover:</label>
              <InputNumber 
                value={putawayQty} 
                onValueChange={(e) => setPutawayQty(e.value || 1)}
                min={1}
                className="w-full p-inputtext-sm"
                inputClassName="bg-slate-900 border-slate-700 text-white text-base"
              />
            </div>

            <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-slate-800">
              <Button label="Cancelar" className="p-button-text text-slate-400 hover:text-white" onClick={() => setPutawayDialogVisible(false)} />
              <Button label="Confirmar Putaway" icon="pi pi-check" className="p-button-success bg-emerald-500 hover:bg-emerald-600 border-none font-medium px-4" loading={executingPutaway} onClick={submitPutaway} />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
