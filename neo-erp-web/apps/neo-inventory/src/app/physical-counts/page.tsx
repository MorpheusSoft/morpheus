'use client';
import { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { Dialog } from 'primereact/dialog';
import { InputTextarea } from 'primereact/inputtextarea';
import { Message } from 'primereact/message';
import { PhysicalCountService } from '@/services/physical-count.service';
import { ValuationService } from '@/services/valuation.service';

export default function PhysicalCountsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isSupervisor, setIsSupervisor] = useState(false);
  
  // Modals
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  
  // New Session fields
  const [newSessionName, setNewSessionName] = useState('');
  const [facilities, setFacilities] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  const [selectedFacility, setSelectedFacility] = useState<any>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  
  const [scopeType, setScopeType] = useState('GENERAL');
  const [scopeValue, setScopeValue] = useState('');
  
  // CSV Import field
  const [csvContent, setCsvContent] = useState('');
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const scopeOptions = [
    { label: 'General (Toda la Sucursal)', value: 'GENERAL' },
    { label: 'Por Almacén', value: 'WAREHOUSE' },
    { label: 'Por Ubicación', value: 'LOCATION' },
    { label: 'Por Categoría de Producto', value: 'CATEGORY' }
  ];

  // Fetch metadata and current user
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [facs, cats] = await Promise.all([
          ValuationService.getFacilities(),
          ValuationService.getCategories()
        ]);
        setFacilities(facs || []);
        setCategories(cats || []);
      } catch (err) {
        console.error("Error cargando metadatos", err);
      }
    };

    // Auto-detect supervisor role (e.g. check current user)
    import('@/lib/api').then(({ default: api }) => {
      api.get('/users/me')
        .then(res => {
          if (res.data && res.data.active_role) {
            const roleName = res.data.active_role.name.toUpperCase();
            if (['SUPERVISOR', 'ADMIN', 'GERENTE'].includes(roleName)) {
              setIsSupervisor(true);
            }
          }
        })
        .catch(err => console.error("Error cargando rol de usuario: ", err));
    });

    loadMetadata();
    loadSessions();
  }, []);

  // Load warehouses if facility is selected in dialog
  useEffect(() => {
    if (selectedFacility) {
      ValuationService.getWarehouses(selectedFacility).then(setWarehouses);
    } else {
      setWarehouses([]);
    }
  }, [selectedFacility]);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await PhysicalCountService.getSessions();
      setSessions(data || []);
    } catch (err) {
      console.error("Error cargando sesiones de conteo", err);
    } finally {
      setLoading(false);
    }
  };

  const selectSession = async (session: any) => {
    setLoading(true);
    try {
      const fullSession = await PhysicalCountService.getSession(session.id);
      setSelectedSession(fullSession);
    } catch (err) {
      console.error("Error cargando detalle de sesión", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async () => {
    if (!newSessionName.trim() || !selectedFacility) {
      alert("Por favor indique nombre y sucursal.");
      return;
    }
    
    // Resolve scope value
    let resolvedScopeValue = '';
    if (scopeType === 'WAREHOUSE') {
      resolvedScopeValue = String(selectedWarehouse || '');
    } else if (scopeType === 'CATEGORY') {
      resolvedScopeValue = String(selectedCategory || '');
    } else {
      resolvedScopeValue = scopeValue;
    }

    try {
      setLoading(true);
      const session = await PhysicalCountService.createSession({
        name: newSessionName,
        facility_id: selectedFacility,
        warehouse_id: selectedWarehouse || undefined,
        scope_type: scopeType,
        scope_value: resolvedScopeValue || undefined
      });
      setShowCreateDialog(false);
      
      // Clear fields
      setNewSessionName('');
      setSelectedFacility(null);
      setSelectedWarehouse(null);
      setSelectedCategory(null);
      setScopeType('GENERAL');
      setScopeValue('');
      
      await loadSessions();
      selectSession(session);
    } catch (err) {
      console.error("Error creando sesión", err);
      alert("Error al crear sesión.");
    } finally {
      setLoading(false);
    }
  };

  const handleCsvImport = async () => {
    if (!csvContent.trim() || !selectedSession) return;
    
    setImportStatus({ type: 'info', text: 'Procesando líneas...' });
    
    const lines: any[] = [];
    const rows = csvContent.split('\n');
    let errors = 0;

    for (let r of rows) {
      const trimmed = r.trim();
      if (!trimmed) continue;
      
      // Expected format: SKU,LOCATION_CODE,COUNTED_QTY
      const parts = trimmed.split(',');
      if (parts.length < 3) {
        errors++;
        continue;
      }
      
      const sku = parts[0].trim();
      const location_code = parts[1].trim();
      const counted_qty = parseFloat(parts[2].trim());
      
      if (!sku || !location_code || isNaN(counted_qty)) {
        errors++;
        continue;
      }
      
      lines.push({
        sku,
        location_code,
        counted_qty
      });
    }

    if (lines.length === 0) {
      setImportStatus({ type: 'error', text: 'No se encontraron líneas válidas. Formato requerido: SKU,UBICACION,CANTIDAD' });
      return;
    }

    try {
      const updated = await PhysicalCountService.uploadLinesBulk(selectedSession.id, lines);
      setSelectedSession(updated);
      setCsvContent('');
      setShowUploadDialog(false);
      setImportStatus(null);
      alert(`Importación completada: ${lines.length} líneas procesadas con éxito.` + (errors > 0 ? ` (${errors} líneas omitidas por formato incorrecto).` : ''));
    } catch (err) {
      console.error("Error importando líneas", err);
      setImportStatus({ type: 'error', text: 'Error al enviar líneas al servidor.' });
    }
  };

  const handleValidateSession = async () => {
    if (!selectedSession) return;
    if (!confirm("¿Está seguro de que desea validar y consolidar esta toma de inventario? Se generarán los movimientos de ajuste y se actualizarán las existencias en tiempo real.")) {
      return;
    }

    setLoading(true);
    try {
      const res = await PhysicalCountService.validateSession(selectedSession.id);
      alert(res.message || "Inventario consolidado con éxito.");
      await loadSessions();
      // Reload details
      const fullSession = await PhysicalCountService.getSession(selectedSession.id);
      setSelectedSession(fullSession);
    } catch (err: any) {
      console.error("Error consolidando sesión", err);
      alert(err.response?.data?.detail || "Error al validar la sesión.");
    } finally {
      setLoading(false);
    }
  };

  // UI Templates
  const stateBodyTemplate = (rowData: any) => {
    const isDone = rowData.state === 'DONE';
    return (
      <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold ${isDone ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/60' : 'bg-amber-50 text-amber-600 border border-amber-200/60'}`}>
        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isDone ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
        {isDone ? 'Consolidado' : 'Borrador / Abierto'}
      </span>
    );
  };

  const getScopeBadge = (session: any) => {
    if (!session) return null;
    let label = 'General';
    let color = 'bg-slate-100 text-slate-700';
    if (session.scope_type === 'WAREHOUSE') {
      label = `Almacén`;
      color = 'bg-blue-50 text-blue-700 border border-blue-100';
    } else if (session.scope_type === 'LOCATION') {
      label = `Ubicación: ${session.scope_value}`;
      color = 'bg-purple-50 text-purple-700 border border-purple-100';
    } else if (session.scope_type === 'CATEGORY') {
      label = `Categoría`;
      color = 'bg-indigo-50 text-indigo-700 border border-indigo-100';
    }
    return <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${color}`}>{label}</span>;
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      {/* Sessions list (col-4) */}
      <div className="lg:col-4 flex flex-col gap-4">
        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-black text-slate-800 m-0">Tomas de Inventario</h3>
            <Button label="Nuevo" icon="pi pi-plus" size="small" rounded className="!bg-blue-600 !border-blue-600" onClick={() => setShowCreateDialog(true)} />
          </div>

          <style dangerouslySetInnerHTML={{__html: `
            .session-row-active {
              background-color: #f0f7ff !important;
              border-left: 4px solid #3b82f6 !important;
            }
          `}} />

          <DataTable
            value={sessions}
            loading={loading}
            selectionMode="single"
            onSelectionChange={(e) => selectSession(e.value)}
            dataKey="id"
            rowClassName={(data) => selectedSession?.id === data.id ? 'session-row-active' : ''}
            emptyMessage="No hay tomas registradas"
            className="premium-datatable cursor-pointer"
          >
            <Column field="name" header="SESIÓN" className="font-semibold text-slate-800 text-[13px]"></Column>
            <Column header="ESTADO" body={stateBodyTemplate} style={{ width: '30%' }}></Column>
          </DataTable>
        </div>
      </div>

      {/* Detail panel (col-8) */}
      <div className="lg:col-8">
        {selectedSession ? (
          <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden relative">
            <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-90"></div>
            
            <div className="p-6">
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-5 mb-5">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-black text-slate-900 m-0">{selectedSession.name}</h2>
                    {getScopeBadge(selectedSession)}
                    {stateBodyTemplate(selectedSession)}
                  </div>
                  <p className="text-slate-500 text-xs mt-1 font-medium">
                    Creado el {new Date(selectedSession.date_start).toLocaleString('es-VE')}
                  </p>
                </div>
                
                {selectedSession.state === 'DRAFT' && (
                  <div className="flex items-center gap-2">
                    <Button label="Subir CSV" icon="pi pi-upload" severity="secondary" rounded size="small" onClick={() => setShowUploadDialog(true)} />
                    {isSupervisor && (
                      <Button label="Consolidar" icon="pi pi-check" severity="success" rounded size="small" onClick={handleValidateSession} />
                    )}
                  </div>
                )}
              </div>

              {/* Anomaly banner */}
              {isSupervisor && selectedSession.lines?.some((l: any) => l.is_anomaly) && (
                <div className="mb-5 bg-rose-50 border border-rose-200/80 rounded-2xl p-4 flex gap-3 items-start animate-pulse">
                  <i className="pi pi-exclamation-triangle text-rose-500 text-lg mt-0.5"></i>
                  <div>
                    <h4 className="text-rose-800 text-xs font-extrabold uppercase tracking-wider">Alerta de IA / Desviaciones Anómalas Detectadas</h4>
                    <p className="text-rose-600 text-xs mt-0.5 font-semibold">
                      Se han detectado diferencias significativas de stock o conteo en artículos de alto valor. Se sugiere realizar reconteo antes de consolidar.
                    </p>
                  </div>
                </div>
              )}

              {/* Lines Table */}
              <DataTable
                value={selectedSession.lines || []}
                paginator
                rows={10}
                emptyMessage={
                  <div className="flex flex-col items-center justify-center p-8 text-slate-400">
                    <i className="pi pi-upload text-4xl mb-3 opacity-50"></i>
                    <p className="font-semibold text-sm">No hay líneas en esta sesión de conteo.</p>
                    {selectedSession.state === 'DRAFT' && (
                      <Button label="Cargar Primeras Líneas" size="small" severity="info" text className="mt-2" onClick={() => setShowUploadDialog(true)} />
                    )}
                  </div>
                }
                className="premium-datatable"
              >
                {/* SKU */}
                <Column field="product_variant_id" header="ARTÍCULO" body={(r) => (
                  <div className="flex flex-col">
                    <span className="font-mono text-xs text-slate-600 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded w-fit mb-1">
                      SKU ID: {r.product_variant_id}
                    </span>
                    {r.is_anomaly && (
                      <span className="text-[10px] text-rose-600 font-bold flex items-center gap-1">
                        <i className="pi pi-exclamation-circle"></i> Anómalo
                      </span>
                    )}
                  </div>
                )} style={{ width: '25%' }}></Column>

                {/* Location code */}
                <Column field="location_id" header="UBICACIÓN" body={(r) => (
                  <span className="font-bold text-slate-600 text-xs">Ubicación ID: {r.location_id}</span>
                )} style={{ width: '15%' }}></Column>

                {/* Counted Quantity */}
                <Column field="counted_qty" header="CONTEO FÍSICO" body={(r) => (
                  <span className="font-extrabold text-blue-700 text-sm tabular-nums">{r.counted_qty} U</span>
                )} style={{ width: '15%' }}></Column>

                {/* Theoretical Stock (Supervisor only) */}
                {isSupervisor && (
                  <Column field="theoretical_qty" header="STOCK SISTEMA" body={(r) => (
                    <span className="font-semibold text-slate-500 text-sm tabular-nums">{r.theoretical_qty} U</span>
                  )} style={{ width: '15%' }}></Column>
                )}

                {/* Difference (Supervisor only) */}
                {isSupervisor && (
                  <Column header="DIFERENCIA" body={(r) => {
                    const diff = r.counted_qty - r.theoretical_qty;
                    const color = diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600 font-extrabold' : 'text-slate-400';
                    return <span className={`font-black text-sm tabular-nums ${color}`}>{diff > 0 ? `+${diff}` : diff} U</span>;
                  }} style={{ width: '15%' }}></Column>
                )}

                {/* Notes/Anomaly details */}
                <Column header="COMENTARIOS / ALERTAS" body={(r) => (
                  <div className="flex flex-col gap-0.5 max-w-[200px]">
                    {r.notes && <span className="text-slate-500 text-xs">{r.notes}</span>}
                    {r.anomaly_reason && <span className="text-rose-500 text-[10px] font-semibold">{r.anomaly_reason}</span>}
                  </div>
                )} style={{ width: '15%' }}></Column>
              </DataTable>
            </div>
          </div>
        ) : (
          <div className="h-full min-h-[400px] bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center p-8 text-slate-400">
            <i className="pi pi-check-square text-6xl mb-4 opacity-30"></i>
            <p className="font-extrabold text-lg m-0">Seleccione una Sesión de Conteo</p>
            <p className="text-xs text-slate-400 mt-1">Cree una nueva sesión o seleccione una existente de la lista lateral.</p>
          </div>
        )}
      </div>

      {/* Dialog: Create Session */}
      <Dialog header="Nueva Toma de Inventario" visible={showCreateDialog} style={{ width: '35vw' }} onHide={() => setShowCreateDialog(false)} className="backdrop-blur-sm">
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Nombre / Identificador</label>
            <InputText value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)} placeholder="Ej. Inventario Anual Pasillo A" className="w-full !rounded-xl border-slate-200 focus:!border-blue-400" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Sucursal / Localidad</label>
            <Dropdown
              value={selectedFacility}
              options={facilities}
              optionLabel="name"
              optionValue="id"
              onChange={(e) => setSelectedFacility(e.value)}
              placeholder="Seleccionar sucursal"
              className="w-full !rounded-xl border-slate-200 focus:!border-blue-400"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Tipo de Alcance</label>
            <Dropdown
              value={scopeType}
              options={scopeOptions}
              onChange={(e) => setScopeType(e.value)}
              className="w-full !rounded-xl border-slate-200 focus:!border-blue-400"
            />
          </div>

          {scopeType === 'WAREHOUSE' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Seleccionar Almacén</label>
              <Dropdown
                value={selectedWarehouse}
                options={warehouses}
                optionLabel="name"
                optionValue="id"
                onChange={(e) => setSelectedWarehouse(e.value)}
                placeholder="Seleccione almacén"
                disabled={!selectedFacility}
                className="w-full !rounded-xl border-slate-200 focus:!border-blue-400"
              />
            </div>
          )}

          {scopeType === 'CATEGORY' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Seleccionar Categoría</label>
              <Dropdown
                value={selectedCategory}
                options={categories}
                optionLabel="name"
                optionValue="id"
                onChange={(e) => setSelectedCategory(e.value)}
                placeholder="Seleccione categoría"
                className="w-full !rounded-xl border-slate-200 focus:!border-blue-400"
              />
            </div>
          )}

          {scopeType === 'LOCATION' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Código de Ubicación</label>
              <InputText value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} placeholder="Ej. PASILLO-A" className="w-full !rounded-xl border-slate-200" />
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <Button label="Cancelar" severity="secondary" text onClick={() => setShowCreateDialog(false)} />
            <Button label="Iniciar Sesión" className="!bg-blue-600 !border-blue-600" onClick={handleCreateSession} />
          </div>
        </div>
      </Dialog>

      {/* Dialog: Upload CSV */}
      <Dialog header="Carga Rápida (Doble Ciego)" visible={showUploadDialog} style={{ width: '40vw' }} onHide={() => setShowUploadDialog(false)} className="backdrop-blur-sm">
        <div className="flex flex-col gap-4 mt-2">
          <div>
            <p className="text-slate-500 text-xs font-medium m-0">
              Copie y pegue la lista física de productos contados. Ingrese una línea por cada artículo usando el formato:
            </p>
            <code className="block bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-mono text-slate-600 mt-2">
              SKU_O_CODIGO_BARRAS,CODIGO_UBICACION,CANTIDAD_CONTADA
            </code>
            <p className="text-[10px] text-slate-400 mt-1 italic">
              Ejemplo: HARINA-PAN,ALM1-P01,42
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Listado de Conteo</label>
            <InputTextarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              rows={8}
              placeholder="HARINA-PAN,ALM1-P01,42&#10;POLLO-KG,NEVERA-1,35.5"
              className="w-full !rounded-xl border-slate-200 focus:!border-blue-400 font-mono text-xs p-3"
            />
          </div>

          {importStatus && (
            <Message severity={importStatus.type} text={importStatus.text} className="w-full" />
          )}

          <div className="flex justify-end gap-2 mt-2">
            <Button label="Cancelar" severity="secondary" text onClick={() => setShowUploadDialog(false)} />
            <Button label="Procesar e Importar" className="!bg-blue-600 !border-blue-600" onClick={handleCsvImport} />
          </div>
        </div>
      </Dialog>

    </div>
  );
}
