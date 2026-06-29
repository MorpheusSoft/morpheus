'use client';
import { useState, useEffect } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { Checkbox } from 'primereact/checkbox';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { useForm, Controller } from 'react-hook-form';
import { CoreService } from '@/services/core.service';

export default function WarehousesPage() {
  const [facilities, setFacilities] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any | null>(null);
  
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(false);
  
  // Warehouse Dialog state
  const [warehouseDialogVisible, setWarehouseDialogVisible] = useState(false);
  const [editingWarehouseId, setEditingWarehouseId] = useState<number | null>(null);
  
  // Location Dialog state
  const [locationDialogVisible, setLocationDialogVisible] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<number | null>(null);

  const [locationSearch, setLocationSearch] = useState('');

  // Forms
  const { control: whControl, handleSubmit: whHandleSubmit, reset: whReset } = useForm({
    defaultValues: { facility_id: null as number | null, name: '', code: '', is_scrap: false, is_transit: false }
  });

  const { control: locControl, handleSubmit: locHandleSubmit, reset: locReset } = useForm({
    defaultValues: { warehouse_id: null as number | null, name: '', code: '', barcode: '', location_type: 'SHELF', usage: 'INTERNAL', is_blocked: false }
  });

  // Load physical facilities (Sucursales) and all warehouses
  const loadInitialData = async () => {
    try {
      const facs = await CoreService.getFacilities();
      const activeFacs = facs.filter((f: any) => f.is_active);
      setFacilities(activeFacs);
      
      // Auto-select first facility if exists
      if (activeFacs.length > 0) {
        setSelectedFacilityId(activeFacs[0].id);
      }
      
      await loadWarehouses();
    } catch (e) {
      console.error("Error loading facilities", e);
    }
  };

  const loadWarehouses = async () => {
    setLoadingWarehouses(true);
    try {
      const whs = await CoreService.getWarehouses();
      setWarehouses(whs);
    } catch (e) {
      console.error("Error loading warehouses", e);
    } finally {
      setLoadingWarehouses(false);
    }
  };

  const loadLocations = async (warehouseId: number) => {
    setLoadingLocations(true);
    try {
      const locs = await CoreService.getLocations({ warehouse_id: warehouseId });
      setLocations(locs);
    } catch (e) {
      console.error("Error loading locations", e);
    } finally {
      setLoadingLocations(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // When facility changes, auto-select its first warehouse
  useEffect(() => {
    if (selectedFacilityId) {
      const facilityWhs = warehouses.filter(w => w.facility_id === selectedFacilityId);
      if (facilityWhs.length > 0) {
        setSelectedWarehouse(facilityWhs[0]);
        loadLocations(facilityWhs[0].id);
      } else {
        setSelectedWarehouse(null);
        setLocations([]);
      }
    }
  }, [selectedFacilityId, warehouses]);

  // Handle warehouse selection
  const selectWarehouse = (wh: any) => {
    setSelectedWarehouse(wh);
    loadLocations(wh.id);
  };

  // CRUD WAREHOUSE
  const openNewWarehouse = () => {
    setEditingWarehouseId(null);
    whReset({
      facility_id: selectedFacilityId,
      name: '',
      code: '',
      is_scrap: false,
      is_transit: false
    });
    setWarehouseDialogVisible(true);
  };

  const openEditWarehouse = (wh: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingWarehouseId(wh.id);
    whReset({
      facility_id: wh.facility_id,
      name: wh.name,
      code: wh.code,
      is_scrap: wh.is_scrap || false,
      is_transit: wh.is_transit || false
    });
    setWarehouseDialogVisible(true);
  };

  const deleteWarehouse = async (wh: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`¿Está seguro de eliminar el depósito "${wh.name}"?`)) {
      try {
        await CoreService.deleteWarehouse(wh.id);
        await loadWarehouses();
      } catch (err: any) {
        alert("Error al eliminar depósito: " + (err.response?.data?.detail || err.message || err));
      }
    }
  };

  const onSubmitWarehouse = async (form: any) => {
    try {
      if (editingWarehouseId) {
        await CoreService.updateWarehouse(editingWarehouseId, form);
      } else {
        await CoreService.createWarehouse(form);
      }
      setWarehouseDialogVisible(false);
      await loadWarehouses();
    } catch (err: any) {
      alert("Error al guardar depósito: " + (err.response?.data?.detail || err.message || err));
    }
  };

  // CRUD LOCATION
  const openNewLocation = () => {
    if (!selectedWarehouse) return;
    setEditingLocationId(null);
    locReset({
      warehouse_id: selectedWarehouse.id,
      name: '',
      code: '',
      barcode: '',
      location_type: 'SHELF',
      usage: 'INTERNAL',
      is_blocked: false
    });
    setLocationDialogVisible(true);
  };

  const openEditLocation = (loc: any) => {
    setEditingLocationId(loc.id);
    locReset({
      warehouse_id: loc.warehouse_id,
      name: loc.name,
      code: loc.code,
      barcode: loc.barcode || '',
      location_type: loc.location_type || 'SHELF',
      usage: loc.usage || 'INTERNAL',
      is_blocked: loc.is_blocked || false
    });
    setLocationDialogVisible(true);
  };

  const deleteLocation = async (loc: any) => {
    if (confirm(`¿Está seguro de eliminar la ubicación "${loc.name}"?`)) {
      try {
        await CoreService.deleteLocation(loc.id);
        if (selectedWarehouse) {
          await loadLocations(selectedWarehouse.id);
        }
      } catch (err: any) {
        alert("Error al eliminar ubicación: " + (err.response?.data?.detail || err.message || err));
      }
    }
  };

  const onSubmitLocation = async (form: any) => {
    try {
      if (editingLocationId) {
        await CoreService.updateLocation(editingLocationId, form);
      } else {
        await CoreService.createLocation(form);
      }
      setLocationDialogVisible(false);
      if (selectedWarehouse) {
        await loadLocations(selectedWarehouse.id);
      }
    } catch (err: any) {
      alert("Error al guardar ubicación: " + (err.response?.data?.detail || err.message || err));
    }
  };

  // Helpers
  const currentFacilityWarehouses = warehouses.filter(w => w.facility_id === selectedFacilityId);
  
  const filteredLocations = locations.filter(loc => {
    const term = locationSearch.toLowerCase();
    return (
      loc.name.toLowerCase().includes(term) ||
      loc.code.toLowerCase().includes(term) ||
      (loc.barcode && loc.barcode.toLowerCase().includes(term))
    );
  });

  const getFacilityName = (facilityId: number) => {
    const fac = facilities.find(f => f.id === facilityId);
    return fac ? fac.name : '---';
  };

  // Dialog Options
  const typeOptions = [
    { label: 'Estantería (SHELF)', value: 'SHELF' },
    { label: 'Pasillo (ROW)', value: 'ROW' },
    { label: 'Bin / Caja (BIN)', value: 'BIN' },
    { label: 'Mesa de Trabajo (TABLE)', value: 'TABLE' },
    { label: 'Zona (ZONE)', value: 'ZONE' }
  ];

  const usageOptions = [
    { label: 'Interno (INTERNAL)', value: 'INTERNAL' },
    { label: 'Tránsito (TRANSIT)', value: 'TRANSIT' },
    { label: 'Merma / Desecho (SCRAP)', value: 'SCRAP' }
  ];

  return (
    <div className="flex flex-col flex-1 h-full min-h-[calc(100vh-100px)] p-2 md:p-6 w-full max-w-7xl mx-auto gap-6">
      
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm backdrop-blur-md bg-opacity-95">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Depósitos y Ubicaciones</h1>
          <p className="text-slate-500 text-sm mt-0.5">Control físico, almacenes y organización interna de stock por sucursales</p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 items-stretch">
        
        {/* Left Panel: Facilities and Warehouses */}
        <div className="col-span-1 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col gap-5">
          
          {/* Facility Selection */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Filtrar por Sucursal</label>
            <Dropdown
              value={selectedFacilityId}
              onChange={(e) => setSelectedFacilityId(e.value)}
              options={facilities}
              optionLabel="name"
              optionValue="id"
              placeholder="Seleccione una sucursal..."
              className="w-full !rounded-xl border-slate-200 shadow-sm"
              pt={{ input: { className: '!py-3 !px-4 text-slate-700 font-medium' } }}
            />
          </div>

          <div className="border-t border-slate-100 my-1"></div>

          {/* Warehouses list */}
          <div className="flex-1 flex flex-col min-h-[350px]">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Depósitos / Almacenes</span>
              <Button
                icon="pi pi-plus"
                label="Nuevo"
                onClick={openNewWarehouse}
                disabled={!selectedFacilityId}
                className="!text-teal-600 hover:!bg-teal-50 !border-none !py-1 !px-2 !rounded-lg text-xs font-semibold"
              />
            </div>

            {loadingWarehouses ? (
              <div className="flex-1 flex items-center justify-center py-10">
                <i className="pi pi-spin pi-spinner text-slate-400 text-2xl"></i>
              </div>
            ) : currentFacilityWarehouses.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <i className="pi pi-compass text-slate-300 text-3xl mb-2"></i>
                <p className="text-slate-400 text-sm font-medium">Sin depósitos registrados</p>
                <p className="text-slate-400 text-[11px] mt-0.5">Crea uno nuevo para empezar</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[450px] overflow-y-auto pr-1">
                {currentFacilityWarehouses.map((wh) => {
                  const isSelected = selectedWarehouse?.id === wh.id;
                  return (
                    <div
                      key={wh.id}
                      onClick={() => selectWarehouse(wh)}
                      className={`group flex items-center justify-between p-3.5 rounded-xl cursor-pointer border transition-all duration-200 ${
                        isSelected
                          ? 'bg-blue-50/70 border-blue-200 text-blue-900 font-semibold shadow-sm'
                          : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-700 hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <i className={`pi pi-compass text-lg ${isSelected ? 'text-blue-500' : 'text-slate-400'}`}></i>
                        <div className="min-w-0">
                          <p className="text-sm truncate pr-1">{wh.name}</p>
                          <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                            {wh.code}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          icon="pi pi-pencil"
                          rounded
                          text
                          severity="info"
                          className="!p-1 !h-7 !w-7"
                          onClick={(e) => openEditWarehouse(wh, e)}
                        />
                        <Button
                          icon="pi pi-trash"
                          rounded
                          text
                          severity="danger"
                          className="!p-1 !h-7 !w-7"
                          onClick={(e) => deleteWarehouse(wh, e)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Locations (Localidades) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col">
          {selectedWarehouse ? (
            <div className="flex-1 flex flex-col">
              
              {/* Warehouse Details Header */}
              <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-5 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    Ubicaciones - {selectedWarehouse.name}
                    <span className="text-xs font-mono font-normal uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      {selectedWarehouse.code}
                    </span>
                  </h2>
                  <p className="text-slate-400 text-xs mt-0.5">Sucursal: {getFacilityName(selectedWarehouse.facility_id)}</p>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    label="Nueva Ubicación"
                    icon="pi pi-plus"
                    onClick={openNewLocation}
                    className="!bg-teal-600 hover:!bg-teal-700 !border-none !rounded-xl !shadow-sm !px-4 !py-2.5 font-bold text-sm"
                  />
                </div>
              </div>

              {/* Table search filter */}
              <div className="mb-4">
                <span className="p-input-icon-left w-full">
                  <i className="pi pi-search text-slate-400" />
                  <InputText
                    value={locationSearch}
                    onChange={(e) => setLocationSearch(e.target.value)}
                    placeholder="Buscar ubicación por código, nombre o código de barras..."
                    className="w-full !rounded-xl border-slate-200 !py-3 !pl-10 shadow-sm"
                  />
                </span>
              </div>

              {/* Locations Table */}
              <div className="flex-1 overflow-hidden rounded-xl border border-slate-100">
                <DataTable
                  value={filteredLocations}
                  loading={loadingLocations}
                  emptyMessage={
                    <div className="py-12 text-center text-slate-400">
                      <i className="pi pi-map-marker text-3xl text-slate-200 mb-2"></i>
                      <p className="font-medium text-slate-400">Sin ubicaciones creadas en este depósito</p>
                      <p className="text-slate-300 text-xs mt-0.5">Las ubicaciones definen estanterías, pasillos o cajones</p>
                    </div>
                  }
                  className="w-full"
                  responsiveLayout="scroll"
                >
                  <Column field="code" header="CÓDIGO" className="font-bold text-slate-700 font-mono text-sm px-4 py-3"></Column>
                  <Column field="name" header="NOMBRE" className="font-semibold text-slate-800 px-4 py-3"></Column>
                  <Column
                    field="barcode"
                    header="CÓDIGO DE BARRAS"
                    className="px-4 py-3"
                    body={(rowData) => (
                      rowData.barcode ? (
                        <div className="flex items-center gap-2 font-mono text-xs text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded w-max">
                          <i className="pi pi-barcode text-slate-400"></i>
                          {rowData.barcode}
                        </div>
                      ) : <span className="text-slate-300 text-xs">Sin barcode</span>
                    )}
                  ></Column>
                  <Column
                    field="location_type"
                    header="TIPO"
                    className="px-4 py-3 font-medium text-slate-600"
                    body={(rowData) => {
                      const type = typeOptions.find(opt => opt.value === rowData.location_type);
                      return type ? type.label.split(' ')[0] : rowData.location_type;
                    }}
                  ></Column>
                  <Column
                    field="is_blocked"
                    header="ESTATUS"
                    className="px-4 py-3"
                    body={(rowData) => (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        rowData.is_blocked
                          ? 'bg-rose-50 text-rose-600 border border-rose-100'
                          : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                      }`}>
                        {rowData.is_blocked ? 'Bloqueada' : 'Disponible'}
                      </span>
                    )}
                  ></Column>
                  <Column
                    header="ACCIONES"
                    exportable={false}
                    className="px-4 py-3"
                    style={{ minWidth: '8rem' }}
                    body={(rowData) => (
                      <div className="flex items-center gap-1">
                        <Button
                          icon="pi pi-pencil"
                          rounded
                          text
                          severity="info"
                          tooltip="Editar"
                          className="!p-1 !h-8 !w-8"
                          onClick={() => openEditLocation(rowData)}
                        />
                        <Button
                          icon="pi pi-trash"
                          rounded
                          text
                          severity="danger"
                          tooltip="Eliminar"
                          className="!p-1 !h-8 !w-8"
                          onClick={() => deleteLocation(rowData)}
                        />
                      </div>
                    )}
                  ></Column>
                </DataTable>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl">
              <i className="pi pi-compass text-slate-300 text-5xl mb-4"></i>
              <h3 className="text-lg font-bold text-slate-700">Selecciona un Depósito</h3>
              <p className="text-slate-400 text-sm max-w-sm mt-1">
                Elige un depósito o almacén en la lista de la izquierda para ver y gestionar sus ubicaciones internas.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Warehouse Modal Dialog */}
      <Dialog
        header={editingWarehouseId ? "Editar Depósito / Almacén" : "Registrar Nuevo Depósito"}
        visible={warehouseDialogVisible}
        style={{ width: '450px' }}
        onHide={() => setWarehouseDialogVisible(false)}
        pt={{ root: { className: '!rounded-2xl shadow-xl border border-slate-100' }}}
      >
        <form onSubmit={whHandleSubmit(onSubmitWarehouse)} className="flex flex-col gap-4 mt-2 p-2">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Sucursal Asociada *</label>
            <Controller
              name="facility_id"
              control={whControl}
              rules={{ required: true }}
              render={({ field }) => (
                <Dropdown
                  value={field.value}
                  onChange={(e) => field.onChange(e.value)}
                  options={facilities}
                  optionLabel="name"
                  optionValue="id"
                  placeholder="Seleccione la sucursal..."
                  className="w-full !rounded-xl border-slate-200 shadow-sm"
                  pt={{ input: { className: '!py-3 !px-4' } }}
                  disabled={!!editingWarehouseId} // No cambiar sucursal de depósito existente
                />
              )}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Código *</label>
              <Controller
                name="code"
                control={whControl}
                rules={{ required: true }}
                render={({ field }) => (
                  <InputText
                    {...field}
                    required
                    autoComplete="off"
                    placeholder="WH-01"
                    className="w-full !rounded-xl border-slate-200 !py-3 !px-4 font-mono text-sm uppercase"
                    disabled={!!editingWarehouseId}
                  />
                )}
              />
            </div>
            <div className="col-span-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Nombre Almacén *</label>
              <Controller
                name="name"
                control={whControl}
                rules={{ required: true }}
                render={({ field }) => (
                  <InputText
                    {...field}
                    required
                    autoComplete="off"
                    placeholder="Piso de Venta Principal"
                    className="w-full !rounded-xl border-slate-200 !py-3 !px-4"
                  />
                )}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-1 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Propiedades de Inventario</span>
            
            <div className="flex items-center gap-2">
              <Controller
                name="is_scrap"
                control={whControl}
                render={({ field }) => (
                  <Checkbox
                    inputId="is_scrap"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.checked)}
                  />
                )}
              />
              <label htmlFor="is_scrap" className="text-xs text-slate-600 font-medium cursor-pointer selection:bg-transparent">
                Es Depósito de Mermas / Desechos (Scrap)
              </label>
            </div>

            <div className="flex items-center gap-2">
              <Controller
                name="is_transit"
                control={whControl}
                render={({ field }) => (
                  <Checkbox
                    inputId="is_transit"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.checked)}
                  />
                )}
              />
              <label htmlFor="is_transit" className="text-xs text-slate-600 font-medium cursor-pointer selection:bg-transparent">
                Es Depósito de Tránsito / Puertos (Transit)
              </label>
            </div>
          </div>

          <Button
            type="submit"
            label={editingWarehouseId ? "Guardar Cambios" : "Crear Depósito"}
            icon="pi pi-check"
            className="mt-4 !rounded-xl !bg-teal-600 hover:!bg-teal-700 !border-none !py-3 font-bold"
          />
        </form>
      </Dialog>

      {/* Location Modal Dialog */}
      <Dialog
        header={editingLocationId ? "Editar Localidad / Ubicación" : "Añadir Ubicación"}
        visible={locationDialogVisible}
        style={{ width: '450px' }}
        onHide={() => setLocationDialogVisible(false)}
        pt={{ root: { className: '!rounded-2xl shadow-xl border border-slate-100' }}}
      >
        <form onSubmit={locHandleSubmit(onSubmitLocation)} className="flex flex-col gap-4 mt-2 p-2">
          
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Código *</label>
              <Controller
                name="code"
                control={locControl}
                rules={{ required: true }}
                render={({ field }) => (
                  <InputText
                    {...field}
                    required
                    autoComplete="off"
                    placeholder="PAS-01"
                    className="w-full !rounded-xl border-slate-200 !py-3 !px-4 font-mono text-sm uppercase"
                  />
                )}
              />
            </div>
            <div className="col-span-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Nombre Ubicación *</label>
              <Controller
                name="name"
                control={locControl}
                rules={{ required: true }}
                render={({ field }) => (
                  <InputText
                    {...field}
                    required
                    autoComplete="off"
                    placeholder="Pasillo 1 de Pasillos"
                    className="w-full !rounded-xl border-slate-200 !py-3 !px-4"
                  />
                )}
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Código de Barras (Opcional)</label>
            <Controller
              name="barcode"
              control={locControl}
              render={({ field }) => (
                <InputText
                  {...field}
                  autoComplete="off"
                  placeholder="Ej: UB-A1-P1"
                  className="w-full !rounded-xl border-slate-200 !py-3 !px-4 font-mono text-sm"
                />
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Tipo de Localidad</label>
              <Controller
                name="location_type"
                control={locControl}
                render={({ field }) => (
                  <Dropdown
                    value={field.value}
                    onChange={(e) => field.onChange(e.value)}
                    options={typeOptions}
                    placeholder="Seleccione..."
                    className="w-full !rounded-xl border-slate-200 shadow-sm"
                    pt={{ input: { className: '!py-3 !px-4 text-xs' } }}
                  />
                )}
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Uso Principal</label>
              <Controller
                name="usage"
                control={locControl}
                render={({ field }) => (
                  <Dropdown
                    value={field.value}
                    onChange={(e) => field.onChange(e.value)}
                    options={usageOptions}
                    placeholder="Seleccione..."
                    className="w-full !rounded-xl border-slate-200 shadow-sm"
                    pt={{ input: { className: '!py-3 !px-4 text-xs' } }}
                  />
                )}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 mt-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <Controller
              name="is_blocked"
              control={locControl}
              render={({ field }) => (
                <Checkbox
                  inputId="is_blocked"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.checked)}
                />
              )}
            />
            <label htmlFor="is_blocked" className="text-xs text-rose-600 font-bold cursor-pointer selection:bg-transparent">
              Bloquear Ubicación (Evita movimientos de stock)
            </label>
          </div>

          <Button
            type="submit"
            label={editingLocationId ? "Guardar Cambios" : "Guardar Ubicación"}
            icon="pi pi-check"
            className="mt-4 !rounded-xl !bg-teal-600 hover:!bg-teal-700 !border-none !py-3 font-bold"
          />
        </form>
      </Dialog>
      
    </div>
  );
}
