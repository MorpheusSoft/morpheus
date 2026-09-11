"use client";

import { useEffect, useState } from "react";
import {
  getDigitalWorkers,
  getDigitalSkills,
  toggleDigitalSkill,
  runDigitalWorkerNow,
  getDigitalWorkerActions,
  generatePairingPin,
  updateDigitalWorker,
  simulateWhatsApp
} from "@/app/actions/digital-workers";

export default function DigitalWorkersPage() {
  const [workers, setWorkers] = useState<any[]>([]);
  const [skillsCatalog, setSkillsCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Execution state
  const [runningWorkerId, setRunningWorkerId] = useState<number | null>(null);
  
  // Audit log modal
  const [selectedWorkerForLogs, setSelectedWorkerForLogs] = useState<any | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // WhatsApp Pairing Modal
  const [pairingModalWorker, setPairingModalWorker] = useState<any | null>(null);
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [generatingPin, setGeneratingPin] = useState(false);

  // WhatsApp Simulator Modal
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [simPhone, setSimPhone] = useState("584121112233");
  const [simMessage, setSimMessage] = useState("Arturo, ¿cuáles son los productos con saldo negativo?");
  const [simChat, setSimChat] = useState<any[]>([
    { sender: "system", text: "Simulador de canal WhatsApp para agentes autónomos. Puedes escribir consultas directas o comandos de vinculación como 'Vincular <PIN>'." }
  ]);
  const [simSending, setSimSending] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [workersData, skillsData] = await Promise.all([
        getDigitalWorkers(),
        getDigitalSkills()
      ]);
      setWorkers(workersData);
      setSkillsCatalog(skillsData);
    } catch (e) {
      console.error("Error fetching digital workers data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleSkill = async (workerId: number, skillId: number, currentEnabled: boolean) => {
    try {
      await toggleDigitalSkill(workerId, skillId, !currentEnabled);
      // Optimistic update
      setWorkers(prev => prev.map(w => {
        if (w.id === workerId) {
          return {
            ...w,
            worker_skills: w.worker_skills.map((ws: any) => 
              ws.skill_id === skillId ? { ...ws, is_enabled: !currentEnabled } : ws
            )
          };
        }
        return w;
      }));
    } catch (e: any) {
      alert("Error al actualizar la habilidad: " + e.message);
      fetchData();
    }
  };

  const handleToggleAutonomous = async (worker: any) => {
    try {
      await updateDigitalWorker(worker.id, {
        is_autonomous_active: !worker.is_autonomous_active
      });
      setWorkers(prev => prev.map(w => w.id === worker.id ? { ...w, is_autonomous_active: !worker.is_autonomous_active } : w));
    } catch (e: any) {
      alert("Error al cambiar modo autónomo: " + e.message);
    }
  };

  const handleRunNow = async (worker: any) => {
    if (!window.confirm(`¿Deseas ejecutar de inmediato el ciclo de auditoría y tareas para '${worker.display_title}'?`)) return;
    setRunningWorkerId(worker.id);
    try {
      const res = await runDigitalWorkerNow(worker.id);
      alert(`Ciclo de ${worker.display_title} completado exitosamente.\n\nHabilidades procesadas: ${res.summary?.executed_skills?.length || 0}`);
      await fetchData();
    } catch (e: any) {
      alert(e.message || "Error al ejecutar el ciclo del agente.");
    } finally {
      setRunningWorkerId(null);
    }
  };

  const openLogsModal = async (worker: any) => {
    setSelectedWorkerForLogs(worker);
    setLoadingLogs(true);
    try {
      const logsData = await getDigitalWorkerActions(worker.id, 40);
      setLogs(logsData);
    } catch (e) {
      console.error(e);
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  const openPairingModal = (worker: any) => {
    setPairingModalWorker(worker);
    setGeneratedPin(worker.user?.pairing_pin || null);
  };

  const handleGeneratePin = async () => {
    if (!pairingModalWorker) return;
    setGeneratingPin(true);
    try {
      const res = await generatePairingPin(pairingModalWorker.id);
      setGeneratedPin(res.pairing_pin);
      fetchData();
    } catch (e: any) {
      alert("Error generando PIN: " + e.message);
    } finally {
      setGeneratingPin(false);
    }
  };

  const handleSendSimulatorMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simMessage.trim() || simSending) return;

    const userText = simMessage;
    setSimChat(prev => [...prev, { sender: "user", text: userText }]);
    setSimMessage("");
    setSimSending(true);

    try {
      const res = await simulateWhatsApp(simPhone, userText);
      setSimChat(prev => [...prev, {
        sender: "bot",
        text: res.reply || "Sin respuesta",
        tool: res.tool,
        worker: res.worker_name
      }]);
    } catch (err: any) {
      setSimChat(prev => [...prev, { sender: "error", text: "Error conectando con el servicio: " + err.message }]);
    } finally {
      setSimSending(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto pb-14 fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
              <i className="pi pi-android text-xl"></i>
            </div>
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Usuarios Digitales (AI Workers)</h1>
          </div>
          <p className="text-slate-500 mt-2 text-sm">
            Ecosistema de agentes cognitivos y autónomos que supervisan inventarios, generan sugerencias de compras y responden en WhatsApp.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSimulatorOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all shadow-emerald-600/20 active:scale-95"
          >
            <i className="pi pi-whatsapp text-lg"></i>
            <span>Simulador WhatsApp</span>
          </button>
        </div>
      </div>

      {/* Workers Grid */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center text-slate-400 shadow-sm">
          <i className="pi pi-spinner animate-spin text-4xl mb-4 text-purple-600"></i>
          <p className="font-medium text-slate-600">Conectando con la red neuronal de agentes...</p>
        </div>
      ) : workers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center text-slate-500 shadow-sm">
          No hay usuarios digitales configurados en este entorno.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {workers.map((worker) => {
            const isArturo = worker.agent_code === "ARTURO_WMS";
            const avatarColor = isArturo 
              ? "from-blue-600 to-cyan-600 border-blue-200" 
              : "from-purple-600 to-pink-600 border-purple-200";

            return (
              <div
                key={worker.id}
                className="bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col justify-between"
              >
                {/* Card Top */}
                <div className="p-7">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${avatarColor} flex items-center justify-center text-white shadow-md text-2xl font-black`}>
                        {isArturo ? "AW" : "CC"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold text-slate-800">{worker.display_title}</h2>
                          <span className="bg-purple-50 text-purple-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-purple-200">
                            {worker.agent_code}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                          <span>Login: <strong className="text-slate-600">{worker.user?.email}</strong></span>
                          <span>•</span>
                          <span>Módulo: <strong className="text-indigo-600 uppercase">{worker.operational_module}</strong></span>
                        </p>
                      </div>
                    </div>

                    {/* Toggle Switch Daemon */}
                    <button
                      onClick={() => handleToggleAutonomous(worker)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                        worker.is_autonomous_active
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                          : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
                      }`}
                      title="Activar/Desactivar escaneo en segundo plano"
                    >
                      <span className={`w-2 h-2 rounded-full ${worker.is_autonomous_active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                      {worker.is_autonomous_active ? "Autónomo ON" : "Pausado"}
                    </button>
                  </div>

                  {/* System Persona Box */}
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-6 text-xs text-slate-600 leading-relaxed">
                    <span className="font-bold text-slate-700 block mb-1 text-[11px] uppercase tracking-wider">Misión y Persona:</span>
                    {worker.system_prompt}
                  </div>

                  {/* Skills Section */}
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Habilidades Asignadas ({worker.worker_skills?.filter((s:any) => s.is_enabled).length || 0})
                      </span>
                      <span className="text-[11px] text-slate-400">Modelo: {worker.model_name || "gemini-2.5-flash"}</span>
                    </div>

                    <div className="space-y-2">
                      {worker.worker_skills?.map((ws: any) => (
                        <div
                          key={ws.id}
                          className={`flex items-center justify-between p-3 rounded-xl border transition-all text-xs ${
                            ws.is_enabled
                              ? "bg-white border-slate-200 shadow-xs"
                              : "bg-slate-50/60 border-slate-100 opacity-60"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 pr-4">
                            <i className={`pi ${ws.is_enabled ? 'pi-check-circle text-emerald-500' : 'pi-circle text-slate-400'} text-sm`}></i>
                            <div>
                              <div className="font-semibold text-slate-800">{ws.skill?.name}</div>
                              <div className="text-[11px] text-slate-400 line-clamp-1">{ws.skill?.description}</div>
                            </div>
                          </div>

                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={ws.is_enabled}
                              onChange={() => handleToggleSkill(worker.id, ws.skill_id, ws.is_enabled)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* WhatsApp Status Bar */}
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                        <i className="pi pi-whatsapp text-sm"></i>
                      </div>
                      <div>
                        <div className="font-bold text-slate-700">Canal WhatsApp</div>
                        <div className="text-[11px] text-slate-500">
                          {worker.user?.is_phone_verified ? (
                            <span className="text-emerald-600 font-semibold flex items-center gap-1">
                              <i className="pi pi-check text-[10px]"></i> Conectado ({worker.user?.phone_number})
                            </span>
                          ) : (
                            <span className="text-amber-600 font-medium">No vinculado / Pendiente</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => openPairingModal(worker)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 shadow-2xs transition-all"
                    >
                      {worker.user?.is_phone_verified ? "Re-Vincular PIN" : "Generar PIN"}
                    </button>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="bg-slate-50/80 px-7 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-400">
                    Último escaneo: {worker.last_scan_at ? new Date(worker.last_scan_at).toLocaleTimeString() : "Nunca"}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openLogsModal(worker)}
                      className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs"
                    >
                      <i className="pi pi-history mr-1.5"></i>
                      Bitácora
                    </button>

                    <button
                      onClick={() => handleRunNow(worker)}
                      disabled={runningWorkerId === worker.id}
                      className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 rounded-xl transition-all shadow-sm shadow-indigo-500/20 inline-flex items-center gap-1.5"
                    >
                      {runningWorkerId === worker.id ? (
                        <>
                          <i className="pi pi-spinner animate-spin"></i>
                          <span>Ejecutando...</span>
                        </>
                      ) : (
                        <>
                          <i className="pi pi-play"></i>
                          <span>Ejecutar Ahora</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Audit Log Modal */}
      {selectedWorkerForLogs && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <i className="pi pi-history text-lg"></i>
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Bitácora de Acciones y Auditorías</h3>
                  <p className="text-xs text-slate-400">Historial de decisiones operativas de {selectedWorkerForLogs.display_title}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedWorkerForLogs(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors"
              >
                <i className="pi pi-times"></i>
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              {loadingLogs ? (
                <div className="py-12 text-center text-slate-400">
                  <i className="pi pi-spinner animate-spin text-3xl mb-2 text-indigo-500"></i>
                  <p className="text-xs">Cargando registros de auditoría...</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  No hay acciones registradas aún para este agente.
                </div>
              ) : (
                <div className="space-y-3">
                  {logs.map((log) => {
                    const isCritical = log.severity === "CRITICAL";
                    const isWarning = log.severity === "WARNING";
                    const badgeClass = isCritical
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : isWarning
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-slate-100 text-slate-600 border-slate-200";

                    return (
                      <div key={log.id} className="p-4 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white transition-all">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${badgeClass}`}>
                              {log.action_type}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-500">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>
                          <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            {log.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed font-medium">
                          {log.summary}
                        </p>
                        {log.details && (
                          <div className="mt-2 p-2 bg-slate-50 rounded-xl text-[10px] font-mono text-slate-600 overflow-x-auto">
                            {JSON.stringify(log.details)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 text-right">
              <button
                onClick={() => setSelectedWorkerForLogs(null)}
                className="px-5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Pairing Modal */}
      {pairingModalWorker && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                  <i className="pi pi-whatsapp text-xl"></i>
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Vincular Dispositivo WhatsApp</h3>
                  <p className="text-xs text-slate-400">{pairingModalWorker.display_title}</p>
                </div>
              </div>
              <button
                onClick={() => setPairingModalWorker(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center"
              >
                <i className="pi pi-times"></i>
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center my-4">
              <p className="text-xs text-slate-500 mb-2">PIN DE EMPAREJAMIENTO DE 6 DÍGITOS</p>
              <div className="text-3xl font-black font-mono tracking-widest text-indigo-600 select-all py-1">
                {generatedPin || "------"}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                {generatedPin ? "Válido para un solo uso. Expira tras la vinculación." : "Presione generar para crear un nuevo código."}
              </p>
            </div>

            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl text-xs text-indigo-900 leading-relaxed mb-6">
              <strong>Instrucciones:</strong>
              <ol className="list-decimal pl-4 mt-1 space-y-1">
                <li>Abre WhatsApp en tu teléfono.</li>
                <li>Envía un mensaje al número corporativo con: <strong>Vincular {generatedPin || "XXXXXX"}</strong></li>
                <li>El asistente confirmará la sesión de inmediato.</li>
              </ol>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                onClick={handleGeneratePin}
                disabled={generatingPin}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all disabled:opacity-50"
              >
                {generatingPin ? "Generando..." : "Generar Nuevo PIN"}
              </button>
              <button
                onClick={() => setPairingModalWorker(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition-all"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Simulator Modal */}
      {isSimulatorOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b141a] text-slate-100 rounded-3xl shadow-2xl border border-slate-800 max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* WhatsApp Header */}
            <div className="bg-[#202c33] p-4 flex items-center justify-between border-b border-[#2a3942]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold">
                  <i className="pi pi-android text-lg"></i>
                </div>
                <div>
                  <div className="font-bold text-sm text-white flex items-center gap-2">
                    <span>Neo ERP Assistant</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  </div>
                  <div className="text-[11px] text-slate-400">Arturo WMS & Clara Compras</div>
                </div>
              </div>
              <button
                onClick={() => setIsSimulatorOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-[#374248] text-slate-400 hover:text-white flex items-center justify-center"
              >
                <i className="pi pi-times"></i>
              </button>
            </div>

            {/* Chat Body */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#0b141a] custom-scrollbar text-xs">
              {simChat.map((msg, i) => {
                if (msg.sender === "system") {
                  return (
                    <div key={i} className="text-center my-2">
                      <span className="bg-[#182229] text-[#8696a0] px-3 py-1 rounded-lg text-[10px]">
                        {msg.text}
                      </span>
                    </div>
                  );
                }

                if (msg.sender === "user") {
                  return (
                    <div key={i} className="flex justify-end">
                      <div className="bg-[#005c4b] text-[#e9edef] rounded-2xl rounded-tr-none px-3.5 py-2 max-w-[85%] shadow-sm whitespace-pre-line leading-relaxed">
                        {msg.text}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={i} className="flex justify-start">
                    <div className="bg-[#202c33] text-[#d1d7db] rounded-2xl rounded-tl-none px-3.5 py-2 max-w-[85%] shadow-sm whitespace-pre-line leading-relaxed border border-[#2a3942]/60">
                      {msg.worker && (
                        <div className="text-[10px] text-emerald-400 font-bold mb-1">
                          {msg.worker}
                        </div>
                      )}
                      {msg.text}
                    </div>
                  </div>
                );
              })}

              {simSending && (
                <div className="flex justify-start">
                  <div className="bg-[#202c33] text-slate-400 rounded-2xl rounded-tl-none px-3.5 py-2 text-[11px] flex items-center gap-2">
                    <i className="pi pi-spin pi-spinner text-emerald-400"></i>
                    <span>Consultando bases de datos y procesando herramientas...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSendSimulatorMessage} className="p-3 bg-[#202c33] border-t border-[#2a3942] flex items-center gap-2">
              <input
                type="text"
                value={simMessage}
                onChange={(e) => setSimMessage(e.target.value)}
                placeholder="Escribe tu mensaje a Arturo o Clara..."
                className="flex-1 bg-[#2a3942] border-none text-white text-xs px-4 py-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder-slate-400"
              />
              <button
                type="submit"
                disabled={simSending || !simMessage.trim()}
                className="w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition-all disabled:opacity-40"
              >
                <i className="pi pi-send text-sm"></i>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
