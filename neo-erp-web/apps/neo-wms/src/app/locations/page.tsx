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
import api from '@/lib/api';

export default function WmsLocationsPage() {
  const [treeData, setTreeData] = useState<any[]>([]);
  const [occupancyData, setOccupancyData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const toast = useRef<Toast>(null);

  // Sucursales y Filtro Activo (0 = Todas las Sucursales)
  const [facilities, setFacilities] = useState<any[]>([]);
  const [selectedFacilityFilter, setSelectedFacilityFilter] = useState<number>(0);

  // Reubicación (Putaway) state
  const [putawayDialogVisible, setPutawayDialogVisible] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);
  const [targetLocationId, setTargetLocationId] = useState<number | null>(null);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [productsList, setProductsList] = useState<any[]>([]);
  const [putawayQty, setPutawayQty] = useState<number>(1);
  const [executingPutaway, setExecutingPutaway] = useState(false);

  // Nuevo Almacén / Depósito state
  const [newWhDialogVisible, setNewWhDialogVisible] = useState(false);
  const [newWhFacilityId, setNewWhFacilityId] = useState<number | null>(null);
  const [newWhName, setNewWhName] = useState<string>('');
  const [newWhCode, setNewWhCode] = useState<string>('');
  const [creatingWarehouse, setCreatingWarehouse] = useState(false);

  // Nueva Ubicación state
  const [newLocDialogVisible, setNewLocDialogVisible] = useState(false);
  const [newLocFacilityId, setNewLocFacilityId] = useState<number | null>(null);
  const [newLocWarehouseId, setNewLocWarehouseId] = useState<number | null>(null);
  const [newLocName, setNewLocName] = useState<string>('');
  const [newLocCode, setNewLocCode] = useState<string>('');
  const [newLocCapacity, setNewLocCapacity] = useState<number>(100);
  const [newLocType, setNewLocType] = useState<string>('SHELF');
  const [creatingLocation, setCreatingLocation] = useState(false);

  const fetchFacilities = async () => {
    try {
      const res = await api.get('/facilities/');
      const facData = Array.isArray(res.data) ? res.data : (res.data?.items || res.data?.data || []);
      setFacilities(facData);
      if (facData && facData.length > 0) {
        setNewWhFacilityId(facData[0].id);
        setNewLocFacilityId(facData[0].id);
      }
    } catch (e) {
      console.error("Error cargando sucursales:", e);
    }
  };

  const fetchTreeAndOccupancy = async (facilityId?: number | null) => {
    setLoading(true);
    try {
      const url = (facilityId && facilityId !== 0) ? `/wms/locations/tree?facility_id=${facilityId}` : '/wms/locations/tree';
      const [treeRes, occRes] = await Promise.all([
        api.get(url).catch(() => ({ data: [] })),
        api.get('/wms/locations/occupancy').catch(() => ({ data: [] }))
      ]);

      const tree = treeRes.data || [];
      setTreeData(tree);
      
      const occMap: any = {};
      (occRes.data || []).forEach((item: any) => {
        occMap[item.id] = item;
      });
      setOccupancyData(occMap);

      if (tree && tree.length > 0 && !newLocWarehouseId) {
        setNewLocWarehouseId(tree[0].id);
      }
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el mapa de almacenes.' });
    }
    setLoading(false);
  };

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products/?limit=2000');
      const formattedOptions: any[] = [];
      let prodList: any[] = [];
      if (Array.isArray(res.data)) {
        prodList = res.data;
      } else if (res.data?.items && Array.isArray(res.data.items)) {
        prodList = res.data.items;
      } else if (res.data?.data && Array.isArray(res.data.data)) {
        prodList = res.data.data;
      }

      prodList.forEach((p: any) => {
        if (p && p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
          p.variants.forEach((v: any) => {
            formattedOptions.push({
              label: `${p.name || 'Producto'} ${v.sku ? `(SKU: ${v.sku})` : ''}`,
              value: v.id
            });
          });
        } else if (p && p.id) {
          formattedOptions.push({
            label: `${p.name || 'Producto'} (ID: ${p.id})`,
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
    fetchFacilities();
    fetchTreeAndOccupancy(0);
    fetchProducts();
  }, []);

  const handleFacilityFilterChange = (facId: number) => {
    setSelectedFacilityFilter(facId);
    fetchTreeAndOccupancy(facId);
  };

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
      toast.current?.show({ severity: 'success', summary: 'Reubicación Exitosa', detail: 'Mercancía movida a la ubicación destino.' });
      setPutawayDialogVisible(false);
      fetchTreeAndOccupancy(selectedFacilityFilter);
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error de Reubicación', detail: e.response?.data?.detail || 'No se pudo realizar el movimiento.' });
    }
    setExecutingPutaway(false);
  };

  const handleCreateWarehouse = async () => {
    if (!newWhFacilityId || !newWhName.trim() || !newWhCode.trim()) {
      toast.current?.show({ severity: 'warn', summary: 'Campos Incompletos', detail: 'Por favor complete sucursal, nombre y código de almacén.' });
      return;
    }

    setCreatingWarehouse(true);
    try {
      await api.post('/warehouses/', {
        facility_id: newWhFacilityId,
        name: newWhName.trim(),
        code: newWhCode.trim().toUpperCase()
      });
      toast.current?.show({ severity: 'success', summary: 'Almacén Creado', detail: `Almacén ${newWhName} registrado con éxito.` });
      setNewWhDialogVisible(false);
      setNewWhName('');
      setNewWhCode('');
      fetchTreeAndOccupancy(selectedFacilityFilter);
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error al Crear', detail: e.response?.data?.detail || 'No se pudo registrar el almacén.' });
    }
    setCreatingWarehouse(false);
  };

  const handleCreateLocation = async () => {
    if (!newLocWarehouseId || !newLocName.trim() || !newLocCode.trim()) {
      toast.current?.show({ severity: 'warn', summary: 'Campos Incompletos', detail: 'Por favor complete almacén, nombre y código de ubicación.' });
      return;
    }

    setCreatingLocation(true);
    try {
      await api.post('/locations/', {
        warehouse_id: newLocWarehouseId,
        name: newLocName.trim(),
        code: newLocCode.trim().toUpperCase(),
        capacity_volume: newLocCapacity || 100.0,
        location_type: newLocType,
        usage: 'INTERNAL'
      });
      toast.current?.show({ severity: 'success', summary: 'Ubicación Creada', detail: `Ubicación ${newLocName} registrada con capacidad de ${newLocCapacity} unidades.` });
      setNewLocDialogVisible(false);
      setNewLocName('');
      setNewLocCode('');
      setNewLocCapacity(100);
      fetchTreeAndOccupancy(selectedFacilityFilter);
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error al Crear', detail: e.response?.data?.detail || 'No se pudo registrar la ubicación.' });
    }
    setCreatingLocation(false);
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
      <div className="w-36">
        <div className="flex justify-between items-center mb-1 text-[10px]">
          <span className="font-bold text-slate-700">{pct}%</span>
          <Tag value={tagLabel} severity={tagSeverity} className="text-[8px] px-1 py-0.2" />
        </div>
        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden border border-slate-300">
          <div className={`h-full ${colorClass} transition-all duration-500`} style={{ width: `${Math.min(100, pct)}%` }}></div>
        </div>
      </div>
    );
  };

  const locationOptions = React.useMemo(() => {
    if (!selectedWarehouse || !Array.isArray(selectedWarehouse.locations)) return [];
    return selectedWarehouse.locations.map((l: any) => ({
      label: `${l.name} (${l.code}) [${l.location_type || 'SHELF'}]`,
      value: l.id
    }));
  }, [selectedWarehouse]);

  // Almacenes filtrados para el modal de Nueva Ubicación
  const filteredWarehousesForNewLoc = React.useMemo(() => {
    if (!newLocFacilityId) return treeData;
    return treeData.filter(wh => wh.facility_id === newLocFacilityId);
  }, [treeData, newLocFacilityId]);

  const facilityDropdownOptions = React.useMemo(() => {
    return [
      { label: '🌐 Todas las Sucursales', value: 0 },
      ...facilities.map(f => ({ label: `🏢 ${f.name}`, value: f.id }))
    ];
  }, [facilities]);

  const locationTypeOptions = [
    { label: 'Estante / Rack (SHELF)', value: 'SHELF' },
    { label: 'Muelle Descarga (DOCK)', value: 'DOCK' },
    { label: 'Merma / Dañados (LOSS)', value: 'LOSS' },
    { label: 'Ubicación Interna (INTERNAL)', value: 'INTERNAL' }
  ];

  return (
    <div className="p-4 sm:p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />
      
      {/* Header Principal */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>
        
        {/* Fila 1: Título de Pantalla */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 border-b border-slate-100 gap-2">
          <div className="pl-3">
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
              <i className="pi pi-sitemap text-emerald-500 mr-3"></i>Mapa Térmico de Almacenes y Reubicación
            </h1>
            <p className="text-slate-500 text-sm mt-1">Estructura jerárquica por sucursales, depósitos y estantes con control volumétrico de espacio.</p>
          </div>

          <Button
            icon="pi pi-refresh"
            rounded
            outlined
            title="Actualizar Mapa"
            className="font-bold text-slate-600 border-slate-300 hover:bg-slate-50 self-end md:self-auto"
            onClick={() => fetchTreeAndOccupancy(selectedFacilityFilter)}
          />
        </div>

        {/* Fila 2: Barra Integrada de Filtros y Acciones Directas */}
        <div className="pt-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100 mt-2">
          {/* Selector de Sucursal */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 whitespace-nowrap flex items-center">
              <i className="pi pi-building text-slate-400 mr-1.5 text-sm"></i>Sucursal:
            </span>
            <Dropdown
              value={selectedFacilityFilter}
              options={facilityDropdownOptions}
              onChange={(e) => handleFacilityFilterChange(e.value)}
              placeholder="Filtrar Sucursal..."
              className="w-64 text-xs font-bold shadow-none border-slate-300"
            />
          </div>

          {/* Botones de Acción */}
          <div className="flex items-center gap-2.5">
            <Button 
              label="Nuevo Almacén" 
              icon="pi pi-building" 
              outlined
              className="font-bold text-xs border-slate-300 text-slate-700 hover:bg-white shadow-sm"
              onClick={() => setNewWhDialogVisible(true)} 
            />

            <Button 
              label="Nueva Ubicación / Estante" 
              icon="pi pi-plus" 
              severity="success" 
              className="font-bold text-xs shadow-sm bg-emerald-600 border-emerald-600"
              onClick={() => {
                if (filteredWarehousesForNewLoc.length > 0) {
                  setNewLocWarehouseId(filteredWarehousesForNewLoc[0].id);
                }
                setNewLocDialogVisible(true);
              }} 
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-slate-500 font-bold flex items-center"><i className="pi pi-spin pi-spinner text-2xl mr-3 text-emerald-500"></i> Cargando mapa térmico de almacenes...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {treeData.map((wh) => (
            <div key={wh.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-100 bg-slate-800 text-white flex justify-between items-center flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-black text-lg flex items-center gap-2 text-white">
                      <i className="pi pi-building text-emerald-400"></i> {wh.name}
                    </h3>
                    <Tag 
                      value={`🏢 ${wh.facility_name || 'General'}`} 
                      severity="info" 
                      className="text-[10px] font-bold uppercase bg-slate-700 border border-slate-600 text-emerald-300 px-2 py-0.5" 
                    />
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">CÓDIGO ALMACÉN: {wh.code}</p>
                </div>
                
                <div className="flex items-center gap-2">
                  {wh.requires_dock_staging && (
                    <Tag value="CD (DOCK)" severity="warning" className="text-[10px] font-bold" />
                  )}
                  <Button 
                    label="Reubicar Mercancía" 
                    icon="pi pi-arrow-right-arrow-left" 
                    size="small" 
                    severity="success"
                    className="font-bold text-xs" 
                    onClick={() => openPutaway(wh)} 
                  />
                </div>
              </div>

              <div className="p-4 flex-1">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Ubicaciones y Pasillos ({wh.locations?.length || 0})</h4>
                <DataTable value={wh.locations || []} size="small" className="p-datatable-sm text-slate-700 text-xs" stripedRows emptyMessage="No hay ubicaciones en este almacén. Use el botón superior para crear la primera.">
                  <Column header="CÓDIGO" field="code" body={l => <span className="font-mono text-[11px] font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{l.code}</span>} sortable style={{ width: '18%' }} />
                  <Column header="UBICACIÓN" field="name" body={l => <span className="font-bold text-slate-800 text-xs">{l.name}</span>} sortable style={{ width: '28%' }} />
                  <Column header="TIPO" body={l => <Tag severity={getLocationTypeSeverity(l.location_type)} value={l.location_type} className="text-[9px] font-bold px-1 py-0.5" />} sortable style={{ width: '14%' }} />
                  <Column header="CAPACIDAD" body={l => <span className="font-mono text-xs text-slate-600 font-semibold">{l.capacity_volume || 10.0} m³</span>} sortable style={{ width: '16%' }} />
                  <Column header="SATURACIÓN" body={occupancyTemplate} style={{ width: '24%' }} />
                </DataTable>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DIÁLOGO NUEVO ALMACÉN / DEPÓSITO */}
      <Dialog 
        header="Crear Nuevo Almacén / Depósito" 
        visible={newWhDialogVisible} 
        onHide={() => setNewWhDialogVisible(false)} 
        style={{ width: '500px' }}
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 font-medium flex items-center">
            <i className="pi pi-building text-blue-600 text-lg mr-2"></i>
            <span>Registre un nuevo almacén asignándolo explícitamente a su <strong>Sucursal / Sede</strong>.</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Sucursal / Sede Propietaria:</label>
            <Dropdown 
              value={newWhFacilityId}
              options={facilities.map(f => ({ label: `🏢 ${f.name}`, value: f.id }))}
              onChange={(e) => setNewWhFacilityId(e.value)}
              className="w-full text-xs font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nombre del Almacén:</label>
            <InputText 
              value={newWhName}
              onChange={(e) => setNewWhName(e.target.value)}
              placeholder="Ej. Depósito Principal, Cámara Fría, Almacén B..."
              className="w-full text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Código del Almacén:</label>
            <InputText 
              value={newWhCode}
              onChange={(e) => setNewWhCode(e.target.value)}
              placeholder="Ej. ALM-PRINCIPAL, CAM-FRIA"
              className="w-full text-xs font-mono font-bold"
            />
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <Button label="Cancelar" text severity="secondary" onClick={() => setNewWhDialogVisible(false)} />
            <Button 
              label="Guardar Almacén" 
              icon="pi pi-check" 
              severity="info" 
              loading={creatingWarehouse}
              onClick={handleCreateWarehouse} 
              className="font-bold text-xs shadow-md" 
            />
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO NUEVA UBICACIÓN / ESTANTE */}
      <Dialog 
        header="Crear Nueva Ubicación en Almacén" 
        visible={newLocDialogVisible} 
        onHide={() => setNewLocDialogVisible(false)} 
        style={{ width: '520px' }}
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 font-medium flex items-center">
            <i className="pi pi-plus-circle text-emerald-600 text-lg mr-2"></i>
            <span>Agregue un nuevo pasillo, estante o posición definiendo su <strong>capacidad volumétrica máxima</strong>.</span>
          </div>

          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Sucursal / Sede:</label>
              <Dropdown 
                value={newLocFacilityId}
                options={facilities.map(f => ({ label: `🏢 ${f.name}`, value: f.id }))}
                onChange={(e) => {
                  setNewLocFacilityId(e.value);
                  const firstWh = treeData.find(wh => wh.facility_id === e.value);
                  if (firstWh) setNewLocWarehouseId(firstWh.id);
                }}
                className="w-full text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Almacén / Depósito:</label>
              <Dropdown 
                value={newLocWarehouseId}
                options={filteredWarehousesForNewLoc.map(wh => ({ label: `${wh.name} (${wh.code})`, value: wh.id }))}
                onChange={(e) => setNewLocWarehouseId(e.value)}
                placeholder="Seleccionar Almacén..."
                className="w-full text-xs font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nombre de la Ubicación:</label>
            <InputText 
              value={newLocName}
              onChange={(e) => setNewLocName(e.target.value)}
              placeholder="Ej. Pasillo A - Estante 01 - Nivel 2"
              className="w-full text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Código de Ubicación:</label>
              <InputText 
                value={newLocCode}
                onChange={(e) => setNewLocCode(e.target.value)}
                placeholder="Ej. PAS-A-EST01"
                className="w-full text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Capacidad Máxima (m³):</label>
              <InputNumber 
                value={newLocCapacity}
                onValueChange={(e) => setNewLocCapacity(e.value || 100)}
                min={0.1}
                maxFractionDigits={2}
                placeholder="Ej. 5.0"
                className="w-full text-xs font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Ubicación:</label>
            <Dropdown 
              value={newLocType}
              options={locationTypeOptions}
              onChange={(e) => setNewLocType(e.value)}
              className="w-full text-xs font-bold"
            />
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <Button label="Cancelar" text severity="secondary" onClick={() => setNewLocDialogVisible(false)} />
            <Button 
              label="Guardar Ubicación" 
              icon="pi pi-check" 
              severity="success" 
              loading={creatingLocation}
              onClick={handleCreateLocation} 
              className="font-bold text-xs shadow-md" 
            />
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO REUBICACIÓN (PUTAWAY) */}
      <Dialog 
        header={`Reubicación de Mercancía (${selectedWarehouse?.name || ''})`} 
        visible={putawayDialogVisible} 
        onHide={() => setPutawayDialogVisible(false)} 
        style={{ width: '500px' }}
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 font-medium flex items-center">
            <i className="pi pi-arrow-right-arrow-left text-blue-600 text-lg mr-2"></i>
            <span>Mueva mercancía de recepción a su posición o estante definitivo. El movimiento quedará <strong>auditado con su usuario</strong>.</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Producto a Reubicar:</label>
            <Dropdown 
              value={variantId}
              options={productsList}
              onChange={(e) => setVariantId(e.value)}
              placeholder="Seleccionar variante o SKU..."
              filter
              showClear
              className="w-full text-xs font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Ubicación Destino en Almacén:</label>
            <Dropdown 
              value={targetLocationId}
              options={locationOptions}
              onChange={(e) => setTargetLocationId(e.value)}
              placeholder="Seleccionar estante/posicion..."
              className="w-full text-xs font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Cantidad a Mover:</label>
            <InputNumber 
              value={putawayQty}
              onValueChange={(e) => setPutawayQty(e.value || 1)}
              min={1}
              className="w-full"
            />
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <Button label="Cancelar" text severity="secondary" onClick={() => setPutawayDialogVisible(false)} />
            <Button 
              label="Confirmar Reubicación" 
              icon="pi pi-check" 
              severity="success" 
              loading={executingPutaway}
              onClick={submitPutaway} 
              className="font-bold text-xs shadow-md" 
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
