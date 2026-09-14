"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getStoreFacilities,
  getStoreAgentCommands,
  updateStoreAgentConfig,
  createStoreAgentCommand,
  FacilityAgentStatus,
  StoreAgentConfig,
  StoreAgentCommand,
  StoreDepositMapping,
  WarehouseOption
} from "@/app/actions/store-agent";

export default function StoreSyncDashboardPage() {
  const [facilities, setFacilities] = useState<FacilityAgentStatus[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Tab state: 'control' | 'deposits'
  const [activeTab, setActiveTab] = useState<'control' | 'deposits'>('control');

  // Configuration edit state
  const [configForm, setConfigForm] = useState<Partial<StoreAgentConfig>>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccessMsg, setConfigSuccessMsg] = useState<string | null>(null);

  // Command execution state
  const [executingCmd, setExecutingCmd] = useState<string | null>(null);
  const [commands, setCommands] = useState<StoreAgentCommand[]>([]);
  const [loadingCommands, setLoadingCommands] = useState(false);

  // Deposit mapping state
  const [depositMappings, setDepositMappings] = useState<StoreDepositMapping[]>([]);
  const [availableWarehouses, setAvailableWarehouses] = useState<WarehouseOption[]>([]);
  const [loadingDeposits, setLoadingDeposits] = useState(false);
  const [savingDepositId, setSavingDepositId] = useState<number | null>(null);
  const [depositSuccessMsg, setDepositSuccessMsg] = useState<string | null>(null);
  const [depositErrorMsg, setDepositErrorMsg] = useState<string | null>(null);

  // New deposit modal state
  const [showCreateDepositModal, setShowCreateDepositModal] = useState(false);
  const [creatingDeposit, setCreatingDeposit] = useState(false);
  const [newDepositForm, setNewDepositForm] = useState({
    external_deposit_code: '',
    external_deposit_name: '',
    warehouse_id: 0,
    location_id: 0,
    affects_inventory: true
  });

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
      let data: FacilityAgentStatus[] = [];
      try {
        const res = await fetch("/api/store-agent/facilities", { cache: "no-store" });
        if (res.ok) {
          data = await res.json();
        }
      } catch (httpErr) {
        console.warn("HTTP route fetch failed, falling back to Server Action:", httpErr);
      }

      if (!data || data.length === 0) {
        data = await getStoreFacilities();
      }

      if (Array.isArray(data) && data.length > 0) {
        setFacilities(data);
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
      let cmds: StoreAgentCommand[] = [];
      try {
        const res = await fetch(`/api/store-agent/${facilityId}/commands?limit=25`, { cache: "no-store" });
        if (res.ok) {
          cmds = await res.json();
        }
      } catch (httpErr) {
        console.warn("HTTP commands fetch failed, falling back to Server Action:", httpErr);
      }

      if (!cmds || cmds.length === 0) {
        cmds = await getStoreAgentCommands(facilityId, 25);
      }
      setCommands(cmds || []);
    } catch (err) {
      console.error("Error loading commands:", err);
    } finally {
      setLoadingCommands(false);
    }
  }, []);

  const fetchDepositMappings = useCallback(async (facilityId: number) => {
    setLoadingDeposits(true);
    setDepositErrorMsg(null);
    try {
      const res = await fetch(`/api/store-agent/${facilityId}/deposits`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setDepositMappings(data.mappings || []);
        setAvailableWarehouses(data.available_warehouses || []);
      } else {
        const err = await res.json().catch(() => ({ error: 'Error cargando mapeos' }));
        setDepositErrorMsg(err.error || 'Error cargando mapeos');
      }
    } catch (err: any) {
      console.error('Error loading deposit mappings:', err);
      setDepositErrorMsg(err.message || 'Error de conexión');
    } finally {
      setLoadingDeposits(false);
    }
  }, []);

  const handleUpdateDepositRow = (mappingId: number, field: string, value: any) => {
    setDepositMappings(prev => prev.map(m => {
      if (m.id !== mappingId) return m;
      const updated = { ...m, [field]: value };
      if (field === 'warehouse_id') {
        const targetWh = availableWarehouses.find(w => w.id === value);
        if (targetWh && targetWh.locations.length > 0) {
          updated.location_id = targetWh.locations[0].id;
          updated.warehouse_name = targetWh.name;
          updated.warehouse_code = targetWh.code;
          updated.location_name = targetWh.locations[0].name;
          updated.location_code = targetWh.locations[0].code;
        }
      } else if (field === 'location_id') {
        const targetWh = availableWarehouses.find(w => w.id === m.warehouse_id);
        const targetLoc = targetWh?.locations.find(l => l.id === value);
        if (targetLoc) {
          updated.location_name = targetLoc.name;
          updated.location_code = targetLoc.code;
        }
      }
      return updated;
    }));
  };

  const handleSaveDepositRow = async (mapping: StoreDepositMapping) => {
    if (!selectedFacilityId) return;
    setSavingDepositId(mapping.id);
    setDepositSuccessMsg(null);
    setDepositErrorMsg(null);

    try {
      const res = await fetch(`/api/store-agent/${selectedFacilityId}/deposits?mappingId=${mapping.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          external_deposit_name: mapping.external_deposit_name,
          warehouse_id: mapping.warehouse_id,
          location_id: mapping.location_id,
          affects_inventory: mapping.affects_inventory,
          is_active: mapping.is_active
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error actualizando depósito' }));
        throw new Error(err.error || 'Error al guardar el mapeo');
      }

      const updated = await res.json();
      setDepositMappings(prev => prev.map(m => m.id === updated.id ? updated : m));
      setDepositSuccessMsg(`Mapeo del depósito ${mapping.external_deposit_code} guardado.`);
      setTimeout(() => setDepositSuccessMsg(null), 5000);
    } catch (err: any) {
      setDepositErrorMsg(err.message || 'Error al guardar');
    } finally {
      setSavingDepositId(null);
    }
  };

  const handleDeleteDeposit = async (mappingId: number) => {
    if (!selectedFacilityId) return;
    const target = depositMappings.find(m => m.id === mappingId);
    if (!target) return;
    if (!confirm(`¿Estás seguro de eliminar el mapeo del depósito ${target.external_deposit_code}?`)) return;

    try {
      const res = await fetch(`/api/store-agent/${selectedFacilityId}/deposits?mappingId=${mappingId}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error eliminando depósito' }));
        throw new Error(err.error || 'Error al eliminar');
      }
      setDepositMappings(prev => prev.filter(m => m.id !== mappingId));
      setDepositSuccessMsg(`Mapeo del depósito ${target.external_deposit_code} eliminado.`);
      setTimeout(() => setDepositSuccessMsg(null), 5000);
    } catch (err: any) {
      setDepositErrorMsg(err.message || 'Error al eliminar');
    }
  };

  const handleCreateDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacilityId) return;
    setCreatingDeposit(true);
    setDepositErrorMsg(null);
    setDepositSuccessMsg(null);

    try {
      const res = await fetch(`/api/store-agent/${selectedFacilityId}/deposits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDepositForm)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error asociando depósito' }));
        throw new Error(err.error || 'Error al asociar depósito');
      }

      await fetchDepositMappings(selectedFacilityId);
      setShowCreateDepositModal(false);
      setDepositSuccessMsg(`Depósito ${newDepositForm.external_deposit_code} asociado exitosamente.`);
      setTimeout(() => setDepositSuccessMsg(null), 5000);
    } catch (err: any) {
      setDepositErrorMsg(err.message || 'Error al crear mapeo');
    } finally {
      setCreatingDeposit(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchFacilitiesData();
  }, [fetchFacilitiesData]);

  // Sync config form when selectedFacility changes
  useEffect(() => {
    if (selectedFacility?.config) {
      setConfigForm({ ...selectedFacility.config });
      fetchCommandsHistory(selectedFacility.facility_id);
      fetchDepositMappings(selectedFacility.facility_id);
    }
  }, [selectedFacilityId, selectedFacility, fetchCommandsHistory, fetchDepositMappings]);

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
      from: historicalParams.startDate,
      to: historicalParams.endDate,
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
    if (diffHours < 24) return `Hace ${diffHours} h`;
    const diffDays = Math.round(diffHours / 24);
    return `Hace ${diffDays} d`;
  };

  const formatExactDateTime = (dateStr: string | null) => {
    if (!dateStr) return "Sin datos registrados";
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("es-VE", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      });
    } catch {
      return dateStr;
    }
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
        <div className="space-y-6">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-3 border-b border-slate-200 pb-px">
            <button
              onClick={() => setActiveTab('control')}
              className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === 'control'
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 rounded-t-xl'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-t-xl'
              }`}
            >
              <i className="pi pi-desktop text-sm"></i>
              <span>Telemetría y Control Remoto</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('deposits');
                if (selectedFacilityId) fetchDepositMappings(selectedFacilityId);
              }}
              className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === 'deposits'
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 rounded-t-xl'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-t-xl'
              }`}
            >
              <i className="pi pi-box text-sm"></i>
              <span>Mapeo de Depósitos (Stellar ➔ Neo)</span>
              {depositMappings.filter(m => m.auto_discovered).length > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500 text-white font-extrabold animate-pulse">
                  {depositMappings.filter(m => m.auto_discovered).length}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'control' && (
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
                      {selectedFacility.lag_minutes > 1000 ? `${Math.round(selectedFacility.lag_minutes / 60)} h` : `${selectedFacility.lag_minutes} min`}
                    </span>
                  </div>
                </div>

                {/* Sincronización de Datos (Marca de Agua / Última Venta Sincronizada) */}
                <div className="mt-3.5 p-3.5 bg-gradient-to-r from-indigo-50/80 to-blue-50/80 border border-indigo-100 rounded-2xl">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                      <i className="pi pi-database text-xs text-indigo-600"></i>
                      Última Venta Sincronizada
                    </span>
                    <span className="text-[10px] font-bold text-indigo-500">
                      {formatRelativeTime(selectedFacility.last_synced_sale_time)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-mono font-bold text-indigo-950">
                      {formatExactDateTime(selectedFacility.last_synced_sale_time)}
                    </span>
                    <span className="text-[10px] font-semibold text-indigo-600 bg-white/70 px-2 py-0.5 rounded-md border border-indigo-100">
                      Stellar ➔ Neo ERP
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

        {/* Deposit Mapping Tab View */}
        {activeTab === 'deposits' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-7 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                      <i className="pi pi-box text-lg"></i>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">
                        Mapeo de Depósitos: {selectedFacility.facility_name}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Asocia los códigos de Stellar POS (<code className="font-mono text-indigo-700">c_deposito</code>) con los almacenes y ubicaciones de Neo ERP
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const firstWh = availableWarehouses[0];
                      setNewDepositForm({
                        external_deposit_code: '',
                        external_deposit_name: '',
                        warehouse_id: firstWh?.id || 0,
                        location_id: firstWh?.locations[0]?.id || 0,
                        affects_inventory: true
                      });
                      setShowCreateDepositModal(true);
                    }}
                    className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-indigo-600/20 inline-flex items-center gap-2"
                  >
                    <i className="pi pi-plus"></i>
                    <span>Asociar Nuevo Depósito</span>
                  </button>

                  <button
                    onClick={() => fetchDepositMappings(selectedFacility.facility_id)}
                    disabled={loadingDeposits}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all"
                    title="Refrescar depósitos"
                  >
                    <i className={`pi pi-sync ${loadingDeposits ? 'animate-spin' : ''}`}></i>
                  </button>
                </div>
              </div>

              {/* Notifications */}
              {depositSuccessMsg && (
                <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <i className="pi pi-check-circle text-emerald-600"></i>
                    <span>{depositSuccessMsg}</span>
                  </div>
                  <button onClick={() => setDepositSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
                    <i className="pi pi-times"></i>
                  </button>
                </div>
              )}

              {depositErrorMsg && (
                <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <i className="pi pi-exclamation-triangle text-rose-600"></i>
                    <span>{depositErrorMsg}</span>
                  </div>
                  <button onClick={() => setDepositErrorMsg(null)} className="text-rose-500 hover:text-rose-700">
                    <i className="pi pi-times"></i>
                  </button>
                </div>
              )}

              {/* Auto-discovered warning */}
              {depositMappings.some(m => m.auto_discovered) && (
                <div className="mt-4 p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-900">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                    <i className="pi pi-bell text-base"></i>
                  </div>
                  <div>
                    <h4 className="font-bold">Depósitos detectados automáticamente en ventas</h4>
                    <p className="text-amber-700 mt-0.5">
                      Se han registrado ventas en cajas con códigos de depósito no mapeados previamente. Se les asignó una ubicación provisional para no detener la facturación. Por favor verifique el almacén y la ubicación de destino y guarde los cambios.
                    </p>
                  </div>
                </div>
              )}

              {/* Table */}
              <div className="mt-6 overflow-x-auto">
                {loadingDeposits ? (
                  <div className="py-12 text-center text-slate-400">
                    <i className="pi pi-spinner animate-spin text-2xl text-indigo-600 mb-2"></i>
                    <p className="text-xs">Cargando mapeo de depósitos...</p>
                  </div>
                ) : depositMappings.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <i className="pi pi-inbox text-3xl mb-2"></i>
                    <p className="text-xs">No hay depósitos configurados para esta sucursal.</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="pb-3 px-3">Código Stellar</th>
                        <th className="pb-3 px-3">Descripción Depósito</th>
                        <th className="pb-3 px-3">Almacén Neo ERP</th>
                        <th className="pb-3 px-3">Ubicación de Stock</th>
                        <th className="pb-3 px-3">Impacto en Kardex</th>
                        <th className="pb-3 px-3">Estado</th>
                        <th className="pb-3 px-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {depositMappings.map((m) => {
                        const isSaving = savingDepositId === m.id;
                        const whOptions = availableWarehouses;
                        const selectedWh = whOptions.find(w => w.id === m.warehouse_id) || whOptions[0];
                        const locOptions = selectedWh?.locations || [];

                        return (
                          <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                            {/* Código Stellar */}
                            <td className="py-3.5 px-3">
                              <span className="font-mono text-xs font-bold bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg border border-slate-200">
                                {m.external_deposit_code}
                              </span>
                            </td>

                            {/* Nombre / Descripción editable */}
                            <td className="py-3.5 px-3">
                              <input
                                type="text"
                                value={m.external_deposit_name || ''}
                                onChange={(e) => handleUpdateDepositRow(m.id, 'external_deposit_name', e.target.value)}
                                placeholder="Ej. Almacén Principal"
                                className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg w-full max-w-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-700"
                              />
                            </td>

                            {/* Almacén Neo ERP */}
                            <td className="py-3.5 px-3">
                              <select
                                value={m.warehouse_id}
                                onChange={(e) => handleUpdateDepositRow(m.id, 'warehouse_id', Number(e.target.value))}
                                className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-700"
                              >
                                {whOptions.map(w => (
                                  <option key={w.id} value={w.id}>
                                    {w.name} ({w.code})
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* Ubicación de Stock */}
                            <td className="py-3.5 px-3">
                              <select
                                value={m.location_id}
                                onChange={(e) => handleUpdateDepositRow(m.id, 'location_id', Number(e.target.value))}
                                className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-700"
                              >
                                {locOptions.map(l => (
                                  <option key={l.id} value={l.id}>
                                    {l.name} ({l.code})
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* Impacto en Kardex */}
                            <td className="py-3.5 px-3">
                              <button
                                type="button"
                                onClick={() => handleUpdateDepositRow(m.id, 'affects_inventory', !m.affects_inventory)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                                  m.affects_inventory
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                    : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200"
                                }`}
                              >
                                <i className={`pi ${m.affects_inventory ? 'pi-check text-[10px]' : 'pi-ban text-[10px]'}`}></i>
                                <span>{m.affects_inventory ? "Descarga Stock" : "Solo Documental"}</span>
                              </button>
                            </td>

                            {/* Estado */}
                            <td className="py-3.5 px-3">
                              {m.auto_discovered ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                  <i className="pi pi-exclamation-triangle text-[9px]"></i>
                                  Auto-detectado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
                                  <i className="pi pi-check-circle text-emerald-600 text-[9px]"></i>
                                  Confirmado
                                </span>
                              )}
                            </td>

                            {/* Acciones */}
                            <td className="py-3.5 px-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={() => handleSaveDepositRow(m)}
                                  disabled={isSaving}
                                  className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-all border border-indigo-200 flex items-center gap-1"
                                  title="Guardar cambios de esta fila"
                                >
                                  <i className={`pi ${isSaving ? 'pi-spinner animate-spin' : 'pi-save'} text-[11px]`}></i>
                                  <span>{isSaving ? 'Guardando...' : 'Guardar'}</span>
                                </button>

                                <button
                                  onClick={() => handleDeleteDeposit(m.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                  title="Eliminar mapeo"
                                >
                                  <i className="pi pi-trash text-xs"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    )}

    {/* Create Deposit Mapping Modal */}
    {showCreateDepositModal && (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                <i className="pi pi-box text-xl"></i>
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Asociar Nuevo Depósito</h3>
                <p className="text-xs text-slate-400">{selectedFacility?.facility_name}</p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateDepositModal(false)}
              className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
            >
              <i className="pi pi-times"></i>
            </button>
          </div>

          <form onSubmit={handleCreateDepositSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                Código Depósito en Stellar POS *
              </label>
              <input
                type="text"
                required
                value={newDepositForm.external_deposit_code}
                onChange={(e) => setNewDepositForm({ ...newDepositForm, external_deposit_code: e.target.value })}
                placeholder="Ej: 1004, 04, PISO-01"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">Debe coincidir con la columna c_deposito de MA_TRANSACCION.</p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                Descripción / Nombre
              </label>
              <input
                type="text"
                value={newDepositForm.external_deposit_name}
                onChange={(e) => setNewDepositForm({ ...newDepositForm, external_deposit_name: e.target.value })}
                placeholder="Ej: Almacén Refrigerados, Piso 2"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                Almacén Destino en Neo ERP *
              </label>
              <select
                required
                value={newDepositForm.warehouse_id}
                onChange={(e) => {
                  const whId = Number(e.target.value);
                  const targetWh = availableWarehouses.find(w => w.id === whId);
                  setNewDepositForm({
                    ...newDepositForm,
                    warehouse_id: whId,
                    location_id: targetWh?.locations[0]?.id || 0
                  });
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value={0} disabled>Seleccione un almacén...</option>
                {availableWarehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                Ubicación Interna de Stock *
              </label>
              <select
                required
                value={newDepositForm.location_id}
                onChange={(e) => setNewDepositForm({ ...newDepositForm, location_id: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value={0} disabled>Seleccione una ubicación...</option>
                {availableWarehouses.find(w => w.id === newDepositForm.warehouse_id)?.locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                ))}
              </select>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newDepositForm.affects_inventory}
                  onChange={(e) => setNewDepositForm({ ...newDepositForm, affects_inventory: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span className="font-semibold text-slate-700">Afectar Inventario (Descargar existencia en Kardex)</span>
              </label>
              <p className="text-[11px] text-slate-400 ml-6 mt-0.5">
                Si se desmarca, las ventas de este depósito se registran sin mover stock físico.
              </p>
            </div>

            <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100 mt-6">
              <button
                type="button"
                onClick={() => setShowCreateDepositModal(false)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingDeposit || !newDepositForm.external_deposit_code || !newDepositForm.warehouse_id || !newDepositForm.location_id}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl font-bold transition-all shadow-sm shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50"
              >
                <i className={`pi ${creatingDeposit ? 'pi-spinner animate-spin' : 'pi-check'}`}></i>
                <span>{creatingDeposit ? 'Guardando...' : 'Asociar Depósito'}</span>
              </button>
            </div>
          </form>
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
