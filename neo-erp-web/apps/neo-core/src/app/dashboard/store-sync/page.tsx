"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getStoreFacilities,
  getStoreAgentCommands,
  updateStoreAgentConfig,
  createStoreAgentCommand,
  FacilityAgentStatus,
  StoreAgentConfig,
  StoreAgentCommand
} from "@/app/actions/store-agent";

export default function StoreSyncDashboardPage() {
  const [facilities, setFacilities] = useState<FacilityAgentStatus[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Configuration edit state
  const [configForm, setConfigForm] = useState<Partial<StoreAgentConfig>>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccessMsg, setConfigSuccessMsg] = useState<string | null>(null);

  // Command execution state
  const [executingCmd, setExecutingCmd] = useState<string | null>(null);
  const [commands, setCommands] = useState<StoreAgentCommand[]>([]);
  const [loadingCommands, setLoadingCommands] = useState(false);

  // Modal states
  const [showHistoricalModal, setShowHistoricalModal] = useState(false);
  const [historicalParams, setHistoricalParams] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    batchSize: 100
  });

  const [showRestartModal, setShowRestartModal] = useState(false);
  const [restartConfirmText, setRestartConfirmText] = useState("");

  const selectedFacility = facilities.find(f => f.facility_id === selectedFacilityId) || null;

  const fetchFacilitiesData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const data = await getStoreFacilities();
      setFacilities(data);

      if (data.length > 0) {
        setSelectedFacilityId(prev => {
          if (prev && data.some(f => f.facility_id === prev)) return prev;
          return data[0].facility_id;
        });
      }
    } catch (err) {
      console.error("Error loading facilities data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchCommandsHistory = useCallback(async (facilityId: number) => {
    setLoadingCommands(true);
    try {
      const cmds = await getStoreAgentCommands(facilityId, 25);
      setCommands(cmds);
    } catch (err) {
      console.error("Error loading commands:", err);
    } finally {
      setLoadingCommands(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchFacilitiesData();
  }, [fetchFacilitiesData]);

  // Sync config form when selectedFacility changes
  useEffect(() => {
    if (selectedFacility?.config) {
      setConfigForm({ ...selectedFacility.config });
      fetchCommandsHistory(selectedFacility.facility_id);
    }
  }, [selectedFacilityId, selectedFacility, fetchCommandsHistory]);

  // Auto-refresh interval (every 15 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchFacilitiesData(true);
      if (selectedFacilityId) {
        fetchCommandsHistory(selectedFacilityId);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedFacilityId, fetchFacilitiesData, fetchCommandsHistory]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacilityId) return;

    setSavingConfig(true);
    setConfigSuccessMsg(null);
    try {
      const updated = await updateStoreAgentConfig(selectedFacilityId, {
        sales_interval_minutes: Number(configForm.sales_interval_minutes),
        sales_batch_size: Number(configForm.sales_batch_size),
        heartbeat_interval_seconds: Number(configForm.heartbeat_interval_seconds),
        sales_enabled: configForm.sales_enabled,
        products_enabled: configForm.products_enabled,
        barcodes_enabled: configForm.barcodes_enabled,
        suppliers_enabled: configForm.suppliers_enabled,
        categories_enabled: configForm.categories_enabled,
        historical_enabled: configForm.historical_enabled,
      });

      setConfigSuccessMsg(`¡Configuración actualizada (v${updated.config_version})! El agente la adoptará en su próximo latido.`);
      setTimeout(() => setConfigSuccessMsg(null), 6000);
      await fetchFacilitiesData(true);
    } catch (err: any) {
      alert("Error al guardar la configuración: " + err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRunCommand = async (
    type: 'FORCE_SYNC_SALES' | 'FORCE_SYNC_MASTERS' | 'SYNC_HISTORICAL' | 'RESTART_SERVICE',
    params: Record<string, any> = {}
  ) => {
    if (!selectedFacilityId) return;

    setExecutingCmd(type);
    try {
      await createStoreAgentCommand(selectedFacilityId, type, params);
      await fetchCommandsHistory(selectedFacilityId);
    } catch (err: any) {
      alert("Error al enviar comando: " + err.message);
    } finally {
      setExecutingCmd(null);
    }
  };

  const handleConfirmHistorical = async () => {
    setShowHistoricalModal(false);
    await handleRunCommand('SYNC_HISTORICAL', {
      start_date: historicalParams.startDate,
      end_date: historicalParams.endDate,
      batch_size: Number(historicalParams.batchSize)
    });
  };

  const handleConfirmRestart = async () => {
    if (restartConfirmText.toUpperCase() !== "REINICIAR") {
      alert("Debes escribir REINICIAR para confirmar la operación.");
      return;
    }
    setShowRestartModal(false);
    setRestartConfirmText("");
    await handleRunCommand('RESTART_SERVICE', {
      grace_period_seconds: 3,
      reason: "Reinicio solicitado desde Consola Web Neo Core"
    });
  };

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return "Sin latido registrado";
    const diffSec = Math.round((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diffSec < 10) return "Hace un momento";
    if (diffSec < 60) return `Hace ${diffSec} segundos`;
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffHours = Math.round(diffMin / 60);
    return `Hace ${diffHours} h`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto pb-14 fade-in-up">
      {/* Header & Dante Badge */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <i className="pi pi-desktop text-xl"></i>
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">
                Consola de Mando: Agentes de Tienda
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-semibold text-slate-500">
                  Control remoto bidireccional y telemetría de servicios Windows (NeoAgentSync)
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <i className="pi pi-shield text-[10px]"></i>
                  Dante (Agente TI)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-3 self-stretch sm:self-auto justify-end">
          <label className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 px-3 py-2 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors shadow-2xs">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
            />
            <span className="font-medium">Auto-refrescar (15s)</span>
          </label>

          <button
            onClick={() => {
              fetchFacilitiesData(true);
              if (selectedFacilityId) fetchCommandsHistory(selectedFacilityId);
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all shadow-2xs disabled:opacity-50"
          >
            <i className={`pi pi-sync text-xs ${refreshing ? 'animate-spin text-indigo-600' : ''}`}></i>
            <span>{refreshing ? 'Actualizando...' : 'Refrescar'}</span>
          </button>
        </div>
      </div>

      {/* Facilities Navigation Bar */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center text-slate-400 shadow-sm mb-8">
          <i className="pi pi-spinner animate-spin text-4xl mb-4 text-indigo-600"></i>
          <p className="font-medium text-slate-600">Conectando con la red de tiendas y telemetría...</p>
        </div>
      ) : facilities.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center text-slate-500 shadow-sm mb-8">
          No hay sedes o tiendas configuradas en Neo ERP.
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2.5 mb-8 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-2xs">
          {facilities.map((fac) => {
            const isSelected = fac.facility_id === selectedFacilityId;
            return (
              <button
                key={fac.facility_id}
                onClick={() => setSelectedFacilityId(fac.facility_id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 ${
                  isSelected
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {/* Online/Offline status dot */}
                <span className="relative flex h-2.5 w-2.5">
                  {fac.is_online ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </>
                  ) : (
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                  )}
                </span>
                <span>{fac.facility_name}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                    isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {fac.facility_code}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selectedFacility && (
        <div className="space-y-8">
          {/* Top Row: Store Health Live Card & Remote Control Pad */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Live Health & Telemetry (1 Col) */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-md ${
                      selectedFacility.is_online
                        ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20"
                        : "bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/20"
                    }`}>
                      <i className={`pi ${selectedFacility.is_online ? 'pi-check-circle' : 'pi-exclamation-triangle'}`}></i>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-800">{selectedFacility.facility_name}</h2>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          selectedFacility.is_online
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${selectedFacility.is_online ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                          {selectedFacility.is_online ? "SERVICIO EN LÍNEA" : "DESCONECTADO"}
                        </span>
                        <span className="text-slate-400 text-xs">•</span>
                        <span className="text-[11px] text-slate-500 font-mono">v{selectedFacility.agent_version || "1.0.0"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Telemetry Metrics Grid */}
                <div className="grid grid-cols-2 gap-3 mt-5">
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Último Latido
                    </span>
                    <span className="text-xs font-bold text-slate-700">
                      {formatRelativeTime(selectedFacility.last_heartbeat)}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      SQL Server Local
                    </span>
                    <span className={`text-xs font-bold ${
                      selectedFacility.sql_server_status === 'CONNECTED' ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {selectedFacility.sql_server_status || 'UNKNOWN'}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Ventas Hoy
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base font-black text-indigo-600">
                        {selectedFacility.sales_today_count}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        (${Number(selectedFacility.sales_today_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Lag Sincronización
                    </span>
                    <span className={`text-xs font-bold ${
                      selectedFacility.lag_minutes > 15 ? 'text-amber-600' : 'text-slate-700'
                    }`}>
                      {selectedFacility.lag_minutes} min
                    </span>
                  </div>
                </div>

                {/* Quarantined items indicator */}
                {selectedFacility.unmapped_barcodes_count > 0 && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-800">
                    <div className="flex items-center gap-2">
                      <i className="pi pi-exclamation-circle text-amber-600"></i>
                      <span>Códigos en cuarentena:</span>
                    </div>
                    <span className="font-extrabold px-2 py-0.5 bg-amber-200/60 rounded-full">
                      {selectedFacility.unmapped_barcodes_count} items
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>Versión Config Activa: <strong className="text-slate-600 font-mono">v{selectedFacility.config?.config_version || 1}</strong></span>
                <span>ID Sede: #{selectedFacility.facility_id}</span>
              </div>
            </div>

            {/* Remote Command Control Pad (2 Cols) */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">Botonera de Control Remoto</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Despacha órdenes prioritarias al servicio Windows de la tienda sin abrir puertos en sitio.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Outbound Polling Ready
                  </span>
                </div>

                {/* Command Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                  {/* Force Sync Sales */}
                  <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                          <i className="pi pi-bolt text-sm"></i>
                        </div>
                        <h3 className="font-bold text-slate-800 text-sm">Sincronizar Ventas Ahora</h3>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed mb-4">
                        Fuerza la extracción inmediata de las facturas del día sin esperar el temporizador configurado.
                      </p>
                    </div>
                    <button
                      onClick={() => handleRunCommand('FORCE_SYNC_SALES')}
                      disabled={executingCmd === 'FORCE_SYNC_SALES'}
                      className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-indigo-600/20 inline-flex items-center justify-center gap-2"
                    >
                      {executingCmd === 'FORCE_SYNC_SALES' ? (
                        <>
                          <i className="pi pi-spinner animate-spin"></i>
                          <span>Enviando orden...</span>
                        </>
                      ) : (
                        <>
                          <i className="pi pi-play"></i>
                          <span>Ejecutar Extracción de Ventas</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Force Sync Masters */}
                  <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                          <i className="pi pi-box text-sm"></i>
                        </div>
                        <h3 className="font-bold text-slate-800 text-sm">Sincronizar Catálogos & Maestros</h3>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed mb-4">
                        Sincroniza artículos, códigos de barra, proveedores y categorías hacia el catálogo central.
                      </p>
                    </div>
                    <button
                      onClick={() => handleRunCommand('FORCE_SYNC_MASTERS')}
                      disabled={executingCmd === 'FORCE_SYNC_MASTERS'}
                      className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-purple-600/20 inline-flex items-center justify-center gap-2"
                    >
                      {executingCmd === 'FORCE_SYNC_MASTERS' ? (
                        <>
                          <i className="pi pi-spinner animate-spin"></i>
                          <span>Enviando orden...</span>
                        </>
                      ) : (
                        <>
                          <i className="pi pi-sync"></i>
                          <span>Actualizar Maestros</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Historical Ingestion Modal Trigger */}
                  <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                          <i className="pi pi-calendar text-sm"></i>
                        </div>
                        <h3 className="font-bold text-slate-800 text-sm">Carga Histórica Parametrizada</h3>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed mb-4">
                        Extrae e ingesta ventas históricas por rango de fechas y tamaño de lote personalizado.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowHistoricalModal(true)}
                      className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-teal-600/20 inline-flex items-center justify-center gap-2"
                    >
                      <i className="pi pi-sliders-h"></i>
                      <span>Configurar Carga Histórica</span>
                    </button>
                  </div>

                  {/* Restart Windows Service */}
                  <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50/30 hover:bg-rose-50/50 transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                          <i className="pi pi-power-off text-sm"></i>
                        </div>
                        <h3 className="font-bold text-rose-900 text-sm">Reiniciar Servicio Windows</h3>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed mb-4">
                        Reinicia de forma segura el servicio <code className="text-rose-700 font-mono">NeoAgentSync</code> en la máquina local de la tienda.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowRestartModal(true)}
                      className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-rose-600/20 inline-flex items-center justify-center gap-2"
                    >
                      <i className="pi pi-refresh"></i>
                      <span>Reiniciar Servicio</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
                <i className="pi pi-info-circle mr-1 text-indigo-500"></i>
                Los comandos son recogidos en el latido cada {selectedFacility.config?.heartbeat_interval_seconds || 60}s y reportan estado en tiempo real.
              </div>
            </div>
          </div>

          {/* Configuration Form (Hot Updates) */}
          <div className="bg-white border border-slate-200 rounded-3xl p-7 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-800">Configuración Remota en Caliente (Hot Config)</h2>
                  <span className="bg-emerald-50 text-emerald-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                    Versión {selectedFacility.config?.config_version}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Modifica los temporizadores, lotes de transferencia y extractores activos. El agente adoptará los cambios sin requerir acceso físico a la tienda.
                </p>
              </div>

              {configSuccessMsg && (
                <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs px-3.5 py-2 rounded-xl flex items-center gap-2 animate-in fade-in">
                  <i className="pi pi-check-circle text-emerald-600"></i>
                  <span>{configSuccessMsg}</span>
                </div>
              )}
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-6">
              {/* Sliders & Numeric Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Sales Interval */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Intervalo de Ventas
                  </label>
                  <p className="text-[11px] text-slate-400 mb-3">Frecuencia de sincronización de facturas</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={configForm.sales_interval_minutes ?? 5}
                      onChange={(e) => setConfigForm({ ...configForm, sales_interval_minutes: Number(e.target.value) })}
                      className="w-24 bg-white border border-slate-300 text-slate-800 text-sm font-bold rounded-xl px-3 py-2 text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <span className="text-xs font-semibold text-slate-600">minutos</span>
                  </div>
                </div>

                {/* Sales Batch Size */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Tamaño de Lote de Ventas
                  </label>
                  <p className="text-[11px] text-slate-400 mb-3">Máximo de facturas enviadas por ciclo HTTP</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={10}
                      max={1000}
                      step={10}
                      value={configForm.sales_batch_size ?? 500}
                      onChange={(e) => setConfigForm({ ...configForm, sales_batch_size: Number(e.target.value) })}
                      className="w-28 bg-white border border-slate-300 text-slate-800 text-sm font-bold rounded-xl px-3 py-2 text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <span className="text-xs font-semibold text-slate-600">facturas/lote</span>
                  </div>
                </div>

                {/* Heartbeat Interval */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Intervalo de Latido (Heartbeat)
                  </label>
                  <p className="text-[11px] text-slate-400 mb-3">Frecuencia de telemetría y sondeo de órdenes</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={15}
                      max={300}
                      step={5}
                      value={configForm.heartbeat_interval_seconds ?? 60}
                      onChange={(e) => setConfigForm({ ...configForm, heartbeat_interval_seconds: Number(e.target.value) })}
                      className="w-24 bg-white border border-slate-300 text-slate-800 text-sm font-bold rounded-xl px-3 py-2 text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <span className="text-xs font-semibold text-slate-600">segundos</span>
                  </div>
                </div>
              </div>

              {/* Switches Grid */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Interruptores de Extractores Activos
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { key: 'sales_enabled', label: 'Extractor de Ventas', desc: 'Ventas en tiempo real' },
                    { key: 'products_enabled', label: 'Extractor de Artículos', desc: 'Catálogo de productos' },
                    { key: 'barcodes_enabled', label: 'Extractor de Códigos de Barra', desc: 'Códigos y conversiones' },
                    { key: 'suppliers_enabled', label: 'Extractor de Proveedores', desc: 'Datos de proveedores' },
                    { key: 'categories_enabled', label: 'Extractor de Departamentos', desc: 'Líneas y departamentos' },
                    { key: 'historical_enabled', label: 'Carga Histórica de Ventas', desc: 'Habilita subida histórica' },
                  ].map((item) => {
                    const isChecked = Boolean(configForm[item.key as keyof StoreAgentConfig]);
                    return (
                      <div
                        key={item.key}
                        className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                          isChecked ? "bg-white border-slate-200 shadow-2xs" : "bg-slate-50/70 border-slate-100 opacity-60"
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-800">{item.label}</div>
                          <div className="text-[10px] text-slate-400">{item.desc}</div>
                        </div>

                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => setConfigForm({ ...configForm, [item.key]: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfigForm({ ...selectedFacility.config })}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  Restablecer
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md inline-flex items-center gap-2"
                >
                  {savingConfig ? (
                    <>
                      <i className="pi pi-spinner animate-spin"></i>
                      <span>Guardando configuración...</span>
                    </>
                  ) : (
                    <>
                      <i className="pi pi-save"></i>
                      <span>Aplicar Configuración a Tienda</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Remote Command Execution Audit Log */}
          <div className="bg-white border border-slate-200 rounded-3xl p-7 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
                  <i className="pi pi-history text-base"></i>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Historial de Órdenes y Comandos Remotos</h2>
                  <p className="text-xs text-slate-400">Bitácora cronológica de ejecuciones recibidas por el servicio en tienda</p>
                </div>
              </div>
              <button
                onClick={() => fetchCommandsHistory(selectedFacility.facility_id)}
                disabled={loadingCommands}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs inline-flex items-center gap-1.5"
              >
                <i className={`pi pi-sync text-xs ${loadingCommands ? 'animate-spin text-indigo-600' : ''}`}></i>
                <span>Refrescar Historial</span>
              </button>
            </div>

            {loadingCommands ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <i className="pi pi-spinner animate-spin text-3xl mb-2 text-indigo-500"></i>
                <p>Cargando órdenes despachadas...</p>
              </div>
            ) : commands.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-xs bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                No se han emitido órdenes remotas recientemente para esta tienda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600 border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-3">ID</th>
                      <th className="py-3 px-3">Comando</th>
                      <th className="py-3 px-3">Estado</th>
                      <th className="py-3 px-3">Emitido</th>
                      <th className="py-3 px-3">Completado</th>
                      <th className="py-3 px-3">Detalle / Resultado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {commands.map((cmd) => {
                      const isPending = cmd.status === 'PENDING';
                      const isSent = cmd.status === 'SENT';
                      const isRunning = cmd.status === 'RUNNING';
                      const isCompleted = cmd.status === 'COMPLETED';
                      const isFailed = cmd.status === 'FAILED';

                      return (
                        <tr key={cmd.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-3 font-mono font-bold text-slate-500">#{cmd.id}</td>
                          <td className="py-3 px-3 font-semibold text-slate-800">
                            <span className="font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded-md text-slate-700">
                              {cmd.command_type}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                              isCompleted
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : isRunning
                                ? "bg-purple-50 text-purple-700 border border-purple-200 animate-pulse"
                                : isSent
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : isPending
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-rose-50 text-rose-700 border border-rose-200"
                            }`}>
                              {isRunning && <i className="pi pi-spinner animate-spin text-[10px]"></i>}
                              {cmd.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-500">
                            {new Date(cmd.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="py-3 px-3 text-slate-500">
                            {cmd.completed_at
                              ? new Date(cmd.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                              : "—"}
                          </td>
                          <td className="py-3 px-3 max-w-xs truncate font-mono text-[11px]">
                            {cmd.error_message ? (
                              <span className="text-rose-600 font-semibold">{cmd.error_message}</span>
                            ) : cmd.result_details?.message ? (
                              <span className="text-emerald-700">{cmd.result_details.message}</span>
                            ) : cmd.parameters ? (
                              <span className="text-slate-400">{JSON.stringify(cmd.parameters)}</span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Historical Load Modal */}
      {showHistoricalModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                  <i className="pi pi-calendar text-xl"></i>
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Carga Histórica Parametrizada</h3>
                  <p className="text-xs text-slate-400">{selectedFacility?.facility_name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowHistoricalModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center"
              >
                <i className="pi pi-times"></i>
              </button>
            </div>

            <div className="space-y-4 my-5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Fecha Desde</label>
                <input
                  type="date"
                  value={historicalParams.startDate}
                  onChange={(e) => setHistoricalParams({ ...historicalParams, startDate: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Fecha Hasta</label>
                <input
                  type="date"
                  value={historicalParams.endDate}
                  onChange={(e) => setHistoricalParams({ ...historicalParams, endDate: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tamaño de Lote (Facturas por Petición)</label>
                <input
                  type="number"
                  min={10}
                  max={500}
                  value={historicalParams.batchSize}
                  onChange={(e) => setHistoricalParams({ ...historicalParams, batchSize: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Recomendado: 100 facturas para evitar saturar conexiones de tienda lentas.
                </span>
              </div>
            </div>

            <div className="p-3 bg-teal-50 border border-teal-100 rounded-2xl text-[11px] text-teal-800 leading-relaxed mb-6">
              <i className="pi pi-info-circle mr-1 text-teal-600"></i>
              La orden se encolará y el servicio Windows comenzará la ingesta secuencial respetando el límite por lote.
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowHistoricalModal(false)}
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmHistorical}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all active:scale-95"
              >
                Iniciar Ingesta Histórica
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restart Windows Service Confirmation Modal */}
      {showRestartModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  <i className="pi pi-exclamation-triangle text-xl"></i>
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Reiniciar Servicio Windows</h3>
                  <p className="text-xs text-slate-400">{selectedFacility?.facility_name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowRestartModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center"
              >
                <i className="pi pi-times"></i>
              </button>
            </div>

            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 leading-relaxed my-4">
              <strong>Atención:</strong> Esta acción invocará un reinicio programado del proceso Windows en la máquina de la tienda física:
              <pre className="mt-2 p-2 bg-white/70 rounded-lg text-[10px] font-mono text-rose-900 overflow-x-auto">
                cmd.exe /c timeout /t 3 && sc start NeoAgentSync
              </pre>
              El servicio se detendrá, cerrará descriptores de SQL Server y se reiniciará en 3 segundos.
            </div>

            <div className="mb-6 text-xs">
              <label className="block font-bold text-slate-700 mb-1">
                Escribe <span className="font-mono text-rose-600 font-bold">REINICIAR</span> para confirmar:
              </label>
              <input
                type="text"
                placeholder="REINICIAR"
                value={restartConfirmText}
                onChange={(e) => setRestartConfirmText(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowRestartModal(false)}
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmRestart}
                disabled={restartConfirmText.toUpperCase() !== "REINICIAR"}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white rounded-xl font-bold text-xs shadow-sm transition-all active:scale-95"
              >
                Confirmar y Reiniciar Servicio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
