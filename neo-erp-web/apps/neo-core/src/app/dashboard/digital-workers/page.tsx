"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import {
  getDigitalWorkers,
  getDigitalSkills,
  toggleDigitalSkill,
  runDigitalWorkerNow,
  getDigitalWorkerActions,
  generatePairingPin,
  updateDigitalWorker,
  simulateWhatsApp,
  simulateTelegram,
  getWorkerTelegramConfig,
  saveWorkerTelegramConfig,
  testWorkerTelegramToken,
  deleteWorkerTelegramWebhook
} from "@/app/actions/digital-workers";

const getWorkerMeta = (agentCode: string) => {
  if (agentCode === "ARTURO_WMS") {
    return {
      name: "Arturo (WMS)",
      shortCode: "AW",
      icon: "pi-box",
      colorClass: "bg-blue-600 text-white shadow-sm",
      badgeColor: "bg-blue-50 text-blue-700",
      avatarGradient: "from-blue-600 to-cyan-600 border-blue-200",
      defaultChannel: "WHATSAPP"
    };
  }
  if (agentCode === "CLARA_COMPRAS" || agentCode === "CLARA_PURCHASING") {
    return {
      name: "Clara (Compras)",
      shortCode: "CC",
      icon: "pi-shopping-cart",
      colorClass: "bg-purple-600 text-white shadow-sm",
      badgeColor: "bg-purple-50 text-purple-700",
      avatarGradient: "from-purple-600 to-pink-600 border-purple-200",
      defaultChannel: "WHATSAPP"
    };
  }
  if (agentCode === "DANTE_IT") {
    return {
      name: "Dante (TI & Infraestructura)",
      shortCode: "DT",
      icon: "pi-shield",
      colorClass: "bg-indigo-600 text-white shadow-sm",
      badgeColor: "bg-indigo-50 text-indigo-700",
      avatarGradient: "from-indigo-600 to-sky-600 border-indigo-200",
      defaultChannel: "TELEGRAM"
    };
  }
  if (agentCode === "VALERIA_PRICING" || agentCode.includes("VALERIA") || agentCode.includes("PRICING")) {
    return {
      name: "Valeria (Precios & Costos)",
      shortCode: "VP",
      icon: "pi-percentage",
      colorClass: "bg-emerald-600 text-white shadow-sm",
      badgeColor: "bg-emerald-50 text-emerald-700",
      avatarGradient: "from-emerald-600 to-teal-600 border-emerald-200",
      defaultChannel: "TELEGRAM"
    };
  }
  return {
    name: agentCode,
    shortCode: agentCode.slice(0, 2).toUpperCase(),
    icon: "pi-android",
    colorClass: "bg-slate-800 text-white shadow-sm",
    badgeColor: "bg-slate-50 text-slate-700",
    avatarGradient: "from-slate-700 to-indigo-700 border-slate-200",
    defaultChannel: "TELEGRAM"
  };
};

export default function DigitalWorkersPage() {
  const [workers, setWorkers] = useState<any[]>([]);
  const [skillsCatalog, setSkillsCatalog] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Execution state
  const [runningWorkerId, setRunningWorkerId] = useState<number | null>(null);
  const [workerFilter, setWorkerFilter] = useState<string>("ALL");
  
  // Audit log modal
  const [selectedWorkerForLogs, setSelectedWorkerForLogs] = useState<any | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Pairing Modal (Multichannel: Telegram & WhatsApp)
  const [pairingModalWorker, setPairingModalWorker] = useState<any | null>(null);
  const [pairingChannel, setPairingChannel] = useState<"TELEGRAM" | "WHATSAPP">("TELEGRAM");
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [generatingPin, setGeneratingPin] = useState(false);
  const [telegramDeepLink, setTelegramDeepLink] = useState<string | null>(null);
  const [telegramBotUsername, setTelegramBotUsername] = useState<string>("dante_neo_erp_bot");
  const [copiedPin, setCopiedPin] = useState(false);

  // Telegram Bot Config Modal
  const [configModalWorker, setConfigModalWorker] = useState<any | null>(null);
  const [configToken, setConfigToken] = useState("");
  const [configEnabled, setConfigEnabled] = useState(true);
  const [configAutoWebhook, setConfigAutoWebhook] = useState(true);
  const [configCustomWebhookUrl, setConfigCustomWebhookUrl] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingConfig, setTestingConfig] = useState(false);
  const [liveBotInfo, setLiveBotInfo] = useState<any | null>(null);
  const [configFeedback, setConfigFeedback] = useState<{ type: "success" | "error" | "info", message: string } | null>(null);


  // Simulator Modal (Telegram & WhatsApp)
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [simulatorChannel, setSimulatorChannel] = useState<"TELEGRAM" | "WHATSAPP">("TELEGRAM");
  const [simPhone, setSimPhone] = useState("584121112233");
  const [simChatId, setSimChatId] = useState(12345678);
  const [simMessage, setSimMessage] = useState("/estado");
  const [simChat, setSimChat] = useState<any[]>([
    { sender: "system", text: "Simulador multicanal de Neo ERP. Prueba la interacción de Dante TI por Telegram o Arturo y Clara por WhatsApp." }
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

      // Obtener datos del usuario logueado para verificar estado de vinculación
      try {
        const userRes = await api.get('/users/me');
        setCurrentUser(userRes.data);
      } catch (err) {
        console.warn("No se pudo obtener el usuario autenticado:", err);
      }
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

  const openPairingModal = async (worker: any, channel: "TELEGRAM" | "WHATSAPP" = "TELEGRAM") => {
    setPairingModalWorker(worker);
    setPairingChannel(channel);
    setCopiedPin(false);

    const tgBot = worker.channel_config?.telegram?.bot_username || "neo_dante_it_bot";
    setTelegramBotUsername(tgBot);

    // Si el usuario ya tiene un PIN guardado, lo cargamos
    if (currentUser?.pairing_pin) {
      setGeneratedPin(currentUser.pairing_pin);
      setTelegramDeepLink(`https://t.me/${tgBot}?start=VINCULAR_${currentUser.pairing_pin}`);
    } else {
      // Auto-generar PIN inmediatamente para que el usuario no tenga que hacer clics extras
      setGeneratingPin(true);
      try {
        const res = await generatePairingPin(worker.id);
        setGeneratedPin(res.pairing_pin);
        if (res.telegram_deep_link) {
          setTelegramDeepLink(res.telegram_deep_link);
        }
        if (res.telegram_bot_username) {
          setTelegramBotUsername(res.telegram_bot_username);
        }
        try {
          const userRes = await api.get('/users/me');
          setCurrentUser(userRes.data);
        } catch {}
      } catch (e: any) {
        console.warn("Error generando PIN automático:", e);
      } finally {
        setGeneratingPin(false);
      }
    }
  };

  const handleGeneratePin = async () => {
    if (!pairingModalWorker) return;
    setGeneratingPin(true);
    setCopiedPin(false);
    try {
      const res = await generatePairingPin(pairingModalWorker.id);
      setGeneratedPin(res.pairing_pin);
      if (res.telegram_deep_link) {
        setTelegramDeepLink(res.telegram_deep_link);
      }
      if (res.telegram_bot_username) {
        setTelegramBotUsername(res.telegram_bot_username);
      }
      // Actualizar perfil de usuario
      try {
        const userRes = await api.get('/users/me');
        setCurrentUser(userRes.data);
      } catch {}
    } catch (e: any) {
      alert("Error generando PIN: " + e.message);
    } finally {
      setGeneratingPin(false);
    }
  };

  const openTelegramConfigModal = async (worker: any) => {
    setConfigModalWorker(worker);
    setConfigFeedback(null);
    setShowToken(false);
    setLiveBotInfo(null);
    setLoadingConfig(true);

    const defaultWebhook = `https://api.qa.morpheussoft.net/api/v1/telegram/${worker.agent_code.toLowerCase()}/webhook`;
    setConfigCustomWebhookUrl(defaultWebhook);

    try {
      const tgStatus = await getWorkerTelegramConfig(worker.id);
      const savedToken = worker.channel_config?.telegram?.token || "";
      setConfigToken(savedToken);
      setConfigEnabled(worker.channel_config?.telegram?.enabled !== false);
      if (tgStatus.webhook_url) {
        setConfigCustomWebhookUrl(tgStatus.webhook_url);
      }
      if (tgStatus.bot_id) {
        setLiveBotInfo({
          id: tgStatus.bot_id,
          username: tgStatus.bot_username,
          first_name: tgStatus.bot_first_name,
          webhook_url: tgStatus.webhook_url,
          webhook_registered: tgStatus.webhook_registered,
          webhook_info: tgStatus.webhook_info
        });
      }
    } catch (e: any) {
      console.warn("Error cargando configuración existente:", e);
      const savedToken = worker.channel_config?.telegram?.token || "";
      setConfigToken(savedToken);
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleTestToken = async () => {
    if (!configToken.trim()) {
      setConfigFeedback({ type: "error", message: "Ingresa un Bot Token para probar." });
      return;
    }
    setTestingConfig(true);
    setConfigFeedback(null);
    try {
      const res = await testWorkerTelegramToken(configModalWorker.id, configToken.trim());
      if (res.success && res.bot) {
        setLiveBotInfo(res.bot);
        setConfigFeedback({
          type: "success",
          message: `✅ Token válido: Bot identificado como "${res.bot.first_name}" (@${res.bot.username}).`
        });
      } else {
        setConfigFeedback({
          type: "error",
          message: `❌ Error en Telegram API: ${res.error || "Token inválido"}`
        });
      }
    } catch (e: any) {
      setConfigFeedback({ type: "error", message: `❌ ${e.message || "Error probando token"}` });
    } finally {
      setTestingConfig(false);
    }
  };

  const handleSaveTelegramConfig = async () => {
    if (!configToken.trim()) {
      setConfigFeedback({ type: "error", message: "El Bot Token es obligatorio." });
      return;
    }
    setSavingConfig(true);
    setConfigFeedback(null);
    try {
      const res = await saveWorkerTelegramConfig(configModalWorker.id, {
        token: configToken.trim(),
        enabled: configEnabled,
        auto_register_webhook: configAutoWebhook,
        custom_webhook_url: configCustomWebhookUrl.trim()
      });
      
      setConfigFeedback({
        type: "success",
        message: `🎉 ¡Guardado exitosamente! Bot "${res.bot?.first_name}" (@${res.bot?.username}) enlazado${res.webhook?.registered ? " con Webhook activo en Telegram." : "."}`
      });
      setLiveBotInfo(res.bot);
      await fetchData();
    } catch (e: any) {
      setConfigFeedback({ type: "error", message: `❌ ${e.message || "Error al guardar configuración"}` });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDeleteWebhook = async () => {
    if (!window.confirm("¿Seguro que deseas desvincular el webhook de Telegram? El bot dejará de recibir mensajes automáticos.")) return;
    setSavingConfig(true);
    try {
      await deleteWorkerTelegramWebhook(configModalWorker.id);
      setConfigFeedback({
        type: "info",
        message: "Webhook eliminado exitosamente. El bot ahora está en modo sondeo o inactivo."
      });
      if (liveBotInfo) {
        setLiveBotInfo({ ...liveBotInfo, webhook_registered: false, webhook_url: null });
      }
      await fetchData();
    } catch (e: any) {
      setConfigFeedback({ type: "error", message: `❌ ${e.message || "Error eliminando webhook"}` });
    } finally {
      setSavingConfig(false);
    }
  };


  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2500);
  };

  const handleSendSimulatorMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simMessage.trim() || simSending) return;

    const userText = simMessage;
    setSimChat(prev => [...prev, { sender: "user", text: userText, channel: simulatorChannel }]);
    setSimMessage("");
    setSimSending(true);

    try {
      if (simulatorChannel === "TELEGRAM") {
        const res = await simulateTelegram(simChatId, userText, workerFilter !== "ALL" ? workerFilter : "DANTE_IT");
        setSimChat(prev => [...prev, {
          sender: "bot",
          text: res.reply || "Sin respuesta",
          channel: "TELEGRAM",
          worker: res.bot_username || "Dante TI"
        }]);
      } else {
        const res = await simulateWhatsApp(simPhone, userText);
        setSimChat(prev => [...prev, {
          sender: "bot",
          text: res.reply || "Sin respuesta",
          channel: "WHATSAPP",
          tool: res.tool,
          worker: res.worker_name
        }]);
      }
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
            Ecosistema multicanal de agentes cognitivos y autónomos de <strong>Neo ERP</strong>. Supervisan almacenes, cuadratura fiscal y se comunican vía Telegram y WhatsApp.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSimulatorChannel("TELEGRAM");
              setIsSimulatorOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all shadow-sky-600/20 active:scale-95"
          >
            <i className="pi pi-send text-sm"></i>
            <span>Simulador Telegram</span>
          </button>

          <button
            onClick={() => {
              setSimulatorChannel("WHATSAPP");
              setIsSimulatorOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all shadow-emerald-600/20 active:scale-95"
          >
            <i className="pi pi-whatsapp text-lg"></i>
            <span>Simulador WhatsApp</span>
          </button>
        </div>
      </div>

      {/* Worker Navigation Tabs */}
      {!loading && workers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 mb-7 bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs">
          <button
            onClick={() => setWorkerFilter("ALL")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              workerFilter === "ALL"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <i className="pi pi-users text-xs"></i>
            <span>Todos los Agentes</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
              workerFilter === "ALL" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
            }`}>
              {workers.length}
            </span>
          </button>

          {workers.map((w) => {
            const isSelected = workerFilter === w.agent_code;
            const meta = getWorkerMeta(w.agent_code);
            const skillsCount = w.worker_skills?.filter((s: any) => s.is_enabled).length || 0;

            return (
              <button
                key={w.id}
                onClick={() => setWorkerFilter(w.agent_code)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  isSelected
                    ? meta.colorClass
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <i className={`pi ${meta.icon} text-xs`}></i>
                <span>{meta.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  isSelected
                    ? "bg-white/25 text-white"
                    : meta.badgeColor
                }`}>
                  {skillsCount} Habilidades
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Workers Grid */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center text-slate-400 shadow-sm">
          <i className="pi pi-spinner animate-spin text-4xl mb-4 text-purple-600"></i>
          <p className="font-medium text-slate-600">Conectando con la red neuronal de agentes de Neo ERP...</p>
        </div>
      ) : workers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center text-slate-500 shadow-sm">
          No hay usuarios digitales configurados en este entorno.
        </div>
      ) : (
        <div className={`grid gap-8 ${
          workerFilter === "ALL" ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1 max-w-2xl mx-auto"
        }`}>
          {workers
            .filter((worker) => workerFilter === "ALL" || worker.agent_code === workerFilter)
            .map((worker) => {
            const meta = getWorkerMeta(worker.agent_code);
            const isDante = worker.agent_code === "DANTE_IT";

            return (
              <div
                key={worker.id}
                className="bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col justify-between"
              >
                {/* Card Top */}
                <div className="p-7">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${meta.avatarGradient} flex items-center justify-center text-white shadow-md text-2xl font-black`}>
                        {meta.shortCode}
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

                    <div className="max-h-[340px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
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

                  {/* Multichannel Communication Section */}
                  <div className="space-y-2.5 pt-2 border-t border-slate-100">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Canales de Comunicación y Alertas
                    </div>

                    {/* Telegram Channel Bar */}
                    <div className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs transition-all ${
                      isDante ? "bg-sky-50/50 border-sky-200/80" : "bg-slate-50 border-slate-200"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-sky-500 text-white flex items-center justify-center font-bold shadow-sm shadow-sky-500/20">
                          <i className="pi pi-send text-xs"></i>
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                            <span>Telegram Bot</span>
                            {isDante && (
                              <span className="bg-sky-100 text-sky-700 text-[10px] font-bold px-1.5 py-0.2 rounded-md">
                                Oficial TI
                              </span>
                            )}
                            {worker.channel_config?.telegram?.token ? (
                              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-1.5 py-0.2 rounded-md flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Conectado
                              </span>
                            ) : (
                              <span className="bg-slate-100 text-slate-500 text-[10px] font-medium px-1.5 py-0.2 rounded-md">
                                Sin Token
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {currentUser?.telegram_chat_id ? (
                              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                                <i className="pi pi-check text-[10px]"></i> Conectado {currentUser.telegram_username ? `(@${currentUser.telegram_username})` : `(ID: ${currentUser.telegram_chat_id})`}
                              </span>
                            ) : (
                              <span className="text-slate-500">
                                @{worker.channel_config?.telegram?.bot_username || (isDante ? "neo_dante_it_bot" : "bot")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openTelegramConfigModal(worker)}
                          title="Configurar Token y Webhook del Bot de Telegram"
                          className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-bold shadow-2xs transition-all flex items-center gap-1"
                        >
                          <i className="pi pi-cog text-[11px] text-slate-500"></i>
                          <span>Configurar Bot</span>
                        </button>

                        <button
                          onClick={() => openPairingModal(worker, "TELEGRAM")}
                          className="px-3 py-1.5 bg-white hover:bg-sky-50 border border-sky-200 text-sky-700 rounded-lg text-[11px] font-bold shadow-2xs transition-all flex items-center gap-1"
                        >
                          <i className="pi pi-link text-[10px]"></i>
                          <span>{currentUser?.telegram_chat_id ? "Re-Vincular" : "Vincular"}</span>
                        </button>
                      </div>
                    </div>

                    {/* WhatsApp Channel Bar */}
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                          <i className="pi pi-whatsapp text-sm"></i>
                        </div>
                        <div>
                          <div className="font-bold text-slate-700">WhatsApp</div>
                          <div className="text-[11px] text-slate-500">
                            {currentUser?.is_phone_verified ? (
                              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                                <i className="pi pi-check text-[10px]"></i> Conectado ({currentUser.phone_number})
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal">No vinculado</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => openPairingModal(worker, "WHATSAPP")}
                        className="px-3 py-1.5 bg-white hover:bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-[11px] font-bold shadow-2xs transition-all"
                      >
                        {currentUser?.is_phone_verified ? "Re-Vincular" : "Vincular WhatsApp"}
                      </button>
                    </div>
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

      {/* Multichannel Pairing Modal (Telegram / WhatsApp) */}
      {pairingModalWorker && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-sm ${
                  pairingChannel === "TELEGRAM" ? "bg-sky-500 shadow-sky-500/20" : "bg-emerald-600 shadow-emerald-600/20"
                }`}>
                  <i className={`pi ${pairingChannel === "TELEGRAM" ? "pi-send" : "pi-whatsapp"} text-lg`}></i>
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">
                    Vincular con {pairingModalWorker.display_title}
                  </h3>
                  <p className="text-xs text-slate-400">Emparejamiento seguro por PIN de un solo uso</p>
                </div>
              </div>
              <button
                onClick={() => setPairingModalWorker(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center"
              >
                <i className="pi pi-times"></i>
              </button>
            </div>

            {/* Channel Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-xl mb-4 text-xs font-bold">
              <button
                onClick={() => {
                  setPairingChannel("TELEGRAM");
                  setCopiedPin(false);
                }}
                className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  pairingChannel === "TELEGRAM"
                    ? "bg-white text-sky-700 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <i className="pi pi-send text-xs"></i>
                <span>Telegram (Recomendado)</span>
              </button>
              <button
                onClick={() => {
                  setPairingChannel("WHATSAPP");
                  setCopiedPin(false);
                }}
                className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  pairingChannel === "WHATSAPP"
                    ? "bg-white text-emerald-700 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <i className="pi pi-whatsapp text-xs"></i>
                <span>WhatsApp</span>
              </button>
            </div>

            {/* PIN Display */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center my-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                PIN de Vinculación Personal
              </p>
              <div className="text-3xl font-black font-mono tracking-widest text-indigo-600 select-all py-1">
                {generatedPin || "------"}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {generatedPin
                  ? "Este PIN es de uso único y vincula tu usuario de Neo ERP con este canal."
                  : "Presiona 'Generar PIN' para obtener tu código de vinculación."}
              </p>
            </div>

            {/* Step-by-Step Instructions */}
            {pairingChannel === "TELEGRAM" ? (
              <div className="p-3.5 bg-sky-50/70 border border-sky-100 rounded-2xl text-xs text-sky-950 leading-relaxed mb-5">
                <strong className="text-sky-900 block mb-1">Pasos para conectar con Telegram:</strong>
                <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                  <li>Haz clic en el botón <strong>Abrir en Telegram</strong> abajo.</li>
                  <li>
                    O en Telegram busca a <strong>@{telegramBotUsername}</strong> y envía:
                    <br />
                    <code className="bg-sky-100/70 text-sky-800 px-1 py-0.5 rounded font-mono text-[11px]">
                      /vincular {generatedPin || "XXXXXX"}
                    </code>
                  </li>
                  <li>{selectedWorker?.display_title || 'El asistente'} confirmará tu sesión y activará tus reportes automáticos.</li>
                </ol>
              </div>
            ) : (
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl text-xs text-emerald-950 leading-relaxed mb-5">
                <strong className="text-emerald-900 block mb-1">Pasos para conectar con WhatsApp:</strong>
                <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                  <li>Abre WhatsApp en tu teléfono móvil.</li>
                  <li>
                    Envía un mensaje al número corporativo con el texto:
                    <br />
                    <code className="bg-emerald-100/70 text-emerald-800 px-1 py-0.5 rounded font-mono text-[11px]">
                      Vincular {generatedPin || "XXXXXX"}
                    </code>
                  </li>
                  <li>El asistente confirmará la sesión de inmediato.</li>
                </ol>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2">
              {generatedPin && pairingChannel === "TELEGRAM" && (
                <a
                  href={telegramDeepLink || `https://t.me/${telegramBotUsername}?start=VINCULAR_${generatedPin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-bold text-xs shadow-sm shadow-sky-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <i className="pi pi-external-link"></i>
                  <span>Abrir en Telegram (@{telegramBotUsername})</span>
                </a>
              )}

              {generatedPin && (
                <button
                  onClick={() => copyToClipboard(
                    pairingChannel === "TELEGRAM" ? `/vincular ${generatedPin}` : `Vincular ${generatedPin}`
                  )}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2"
                >
                  <i className={`pi ${copiedPin ? "pi-check text-emerald-600" : "pi-copy"}`}></i>
                  <span>{copiedPin ? "¡Comando copiado!" : "Copiar Comando de Vinculación"}</span>
                </button>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleGeneratePin}
                  disabled={generatingPin}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all disabled:opacity-50"
                >
                  {generatingPin ? "Generando..." : (generatedPin ? "Regenerar PIN" : "Generar PIN")}
                </button>
                <button
                  onClick={() => setPairingModalWorker(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition-all"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multichannel Simulator Modal (Telegram & WhatsApp) */}
      {isSimulatorOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`rounded-3xl shadow-2xl border max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 transition-all ${
            simulatorChannel === "TELEGRAM"
              ? "bg-[#17212b] border-[#242f3d] text-slate-100"
              : "bg-[#0b141a] border-slate-800 text-slate-100"
          }`}>
            {/* Header */}
            <div className={`p-4 flex items-center justify-between border-b ${
              simulatorChannel === "TELEGRAM"
                ? "bg-[#242f3d] border-[#1e2a38]"
                : "bg-[#202c33] border-[#2a3942]"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                  simulatorChannel === "TELEGRAM" ? "bg-sky-500" : "bg-emerald-600"
                }`}>
                  <i className={`pi ${simulatorChannel === "TELEGRAM" ? "pi-send" : "pi-whatsapp"} text-lg`}></i>
                </div>
                <div>
                  <div className="font-bold text-sm text-white flex items-center gap-2">
                    <span>{simulatorChannel === "TELEGRAM" ? "Dante TI (@dante_neo_erp_bot)" : "Neo Assistant (WhatsApp)"}</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {simulatorChannel === "TELEGRAM" ? "Canal Oficial de Infraestructura y Sincronización" : "Arturo WMS & Clara Compras"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Switcher */}
                <div className="flex bg-black/20 p-0.5 rounded-lg text-[10px] font-bold">
                  <button
                    onClick={() => setSimulatorChannel("TELEGRAM")}
                    className={`px-2.5 py-1 rounded-md transition-all ${
                      simulatorChannel === "TELEGRAM" ? "bg-sky-500 text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Telegram
                  </button>
                  <button
                    onClick={() => setSimulatorChannel("WHATSAPP")}
                    className={`px-2.5 py-1 rounded-md transition-all ${
                      simulatorChannel === "WHATSAPP" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    WhatsApp
                  </button>
                </div>

                <button
                  onClick={() => setIsSimulatorOpen(false)}
                  className="w-8 h-8 rounded-full hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center"
                >
                  <i className="pi pi-times"></i>
                </button>
              </div>
            </div>

            {/* Quick Chips for Dante TI Telegram */}
            {simulatorChannel === "TELEGRAM" && (
              <div className="bg-[#1e2a38] px-3 py-2 border-b border-[#242f3d] flex items-center gap-1.5 overflow-x-auto text-[11px] custom-scrollbar">
                <span className="text-slate-400 font-bold text-[10px] uppercase mr-1">Comandos:</span>
                {[
                  { label: "/estado", text: "/estado" },
                  { label: "/cuadratura", text: "/cuadratura" },
                  { label: "/correlatividad", text: "/correlatividad" },
                  { label: "/remediar", text: "/remediar" },
                  { label: "¿Cómo van los latidos?", text: "¿Cómo van los latidos de las tiendas?" }
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSimMessage(chip.text)}
                    className="whitespace-nowrap px-2 py-0.5 bg-[#2b394a] hover:bg-[#344558] text-sky-300 rounded-md font-mono text-[10px] transition-all"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            {/* Chat Body */}
            <div className={`flex-1 p-4 overflow-y-auto space-y-3 custom-scrollbar text-xs ${
              simulatorChannel === "TELEGRAM" ? "bg-[#0e1621]" : "bg-[#0b141a]"
            }`}>
              {simChat.map((msg, i) => {
                if (msg.sender === "system") {
                  return (
                    <div key={i} className="text-center my-2">
                      <span className={`px-3 py-1 rounded-lg text-[10px] ${
                        simulatorChannel === "TELEGRAM" ? "bg-[#182533] text-[#708499]" : "bg-[#182229] text-[#8696a0]"
                      }`}>
                        {msg.text}
                      </span>
                    </div>
                  );
                }

                if (msg.sender === "user") {
                  return (
                    <div key={i} className="flex justify-end">
                      <div className={`rounded-2xl rounded-tr-none px-3.5 py-2 max-w-[85%] shadow-sm whitespace-pre-line leading-relaxed ${
                        simulatorChannel === "TELEGRAM"
                          ? "bg-[#2b5278] text-[#ffffff]"
                          : "bg-[#005c4b] text-[#e9edef]"
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={i} className="flex justify-start">
                    <div className={`rounded-2xl rounded-tl-none px-3.5 py-2 max-w-[85%] shadow-sm whitespace-pre-line leading-relaxed border ${
                      simulatorChannel === "TELEGRAM"
                        ? "bg-[#182533] text-[#e3e8ed] border-[#242f3d]"
                        : "bg-[#202c33] text-[#d1d7db] border-[#2a3942]/60"
                    }`}>
                      {msg.worker && (
                        <div className={`text-[10px] font-bold mb-1 ${
                          simulatorChannel === "TELEGRAM" ? "text-sky-400" : "text-emerald-400"
                        }`}>
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
                  <div className={`rounded-2xl rounded-tl-none px-3.5 py-2 text-[11px] flex items-center gap-2 ${
                    simulatorChannel === "TELEGRAM" ? "bg-[#182533] text-sky-400" : "bg-[#202c33] text-emerald-400"
                  }`}>
                    <i className="pi pi-spin pi-spinner"></i>
                    <span>Consultando bases de datos y procesando herramientas...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <form
              onSubmit={handleSendSimulatorMessage}
              className={`p-3 border-t flex items-center gap-2 ${
                simulatorChannel === "TELEGRAM"
                  ? "bg-[#17212b] border-[#242f3d]"
                  : "bg-[#202c33] border-[#2a3942]"
              }`}
            >
              <input
                type="text"
                value={simMessage}
                onChange={(e) => setSimMessage(e.target.value)}
                placeholder={
                  simulatorChannel === "TELEGRAM"
                    ? "Escribe /estado, /cuadratura o una consulta a Dante..."
                    : "Escribe tu mensaje a Arturo o Clara..."
                }
                className={`flex-1 border-none text-white text-xs px-4 py-2.5 rounded-xl focus:outline-none placeholder-slate-400 ${
                  simulatorChannel === "TELEGRAM"
                    ? "bg-[#242f3d] focus:ring-1 focus:ring-sky-500"
                    : "bg-[#2a3942] focus:ring-1 focus:ring-emerald-500"
                }`}
              />
              <button
                type="submit"
                disabled={simSending || !simMessage.trim()}
                className={`w-10 h-10 rounded-xl text-white flex items-center justify-center transition-all disabled:opacity-40 ${
                  simulatorChannel === "TELEGRAM"
                    ? "bg-sky-500 hover:bg-sky-600"
                    : "bg-emerald-600 hover:bg-emerald-500"
                }`}
              >
                <i className="pi pi-send text-sm"></i>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Telegram Channel Configuration Modal */}
      {configModalWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-6 bg-gradient-to-r from-sky-600 via-sky-700 to-indigo-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-inner">
                  <i className="pi pi-send text-2xl"></i>
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight flex items-center gap-2">
                    <span>Configurar Bot de Telegram</span>
                  </h3>
                  <p className="text-xs text-sky-100 mt-0.5">
                    {configModalWorker.display_title} ({configModalWorker.agent_code})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConfigModalWorker(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              >
                <i className="pi pi-times text-xs"></i>
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <p className="text-xs text-slate-600 leading-relaxed">
                Configura el token de la API de Telegram provisto por <strong>@BotFather</strong>. El sistema validará las credenciales directamente con los servidores de Telegram y registrará automáticamente el Webhook oficial sin tener que editar ningún archivo de configuración en el servidor.
              </p>

              {/* Feedback Alert */}
              {configFeedback && (
                <div className={`p-3.5 rounded-xl text-xs font-medium border flex items-start gap-2 ${
                  configFeedback.type === "success" 
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
                    : configFeedback.type === "error"
                    ? "bg-rose-50 text-rose-800 border-rose-200"
                    : "bg-sky-50 text-sky-800 border-sky-200"
                }`}>
                  <i className={`pi ${
                    configFeedback.type === "success" ? "pi-check-circle" : configFeedback.type === "error" ? "pi-exclamation-triangle" : "pi-info-circle"
                  } mt-0.5 text-sm`}></i>
                  <span className="flex-1">{configFeedback.message}</span>
                </div>
              )}

              {/* Bot API Token Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span>Token HTTP API (Telegram BotFather)</span>
                  <span className="text-[11px] font-normal text-slate-400">Requerido</span>
                </label>
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    value={configToken}
                    onChange={(e) => setConfigToken(e.target.value)}
                    placeholder="8940269345:AAHbK_NoIFfvzpKBIom0EAdD0TbX3vsMF_8"
                    className="w-full text-xs font-mono px-3.5 py-2.5 pr-28 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
                      title={showToken ? "Ocultar token" : "Mostrar token"}
                    >
                      <i className={`pi ${showToken ? "pi-eye-slash" : "pi-eye"} text-xs`}></i>
                    </button>
                    <button
                      type="button"
                      onClick={handleTestToken}
                      disabled={testingConfig || !configToken.trim()}
                      className="px-2.5 py-1 text-[10px] font-bold bg-sky-100 text-sky-700 hover:bg-sky-200 rounded-md transition-colors disabled:opacity-40"
                    >
                      {testingConfig ? "Probando..." : "Probar"}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  Obtén o regenera este token hablando con <strong>@BotFather</strong> en Telegram con el comando <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">/token</code>.
                </p>
              </div>

              {/* Live Bot Info Card */}
              {liveBotInfo && (
                <div className="p-4 bg-sky-50/70 border border-sky-200/80 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="font-bold text-xs text-sky-950">Bot Identificado en Telegram</span>
                    </div>
                    <span className="text-[10px] bg-sky-200/70 text-sky-800 px-2 py-0.5 rounded-md font-bold">
                      ID: {liveBotInfo.id}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 text-[11px]">Nombre:</span>
                      <div className="font-bold text-slate-800">{liveBotInfo.first_name || liveBotInfo.name}</div>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px]">Username:</span>
                      <div className="font-bold text-sky-700">
                        <a 
                          href={`https://t.me/${(liveBotInfo.username || "").replace("@", "")}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="hover:underline flex items-center gap-1"
                        >
                          @{liveBotInfo.username}
                          <i className="pi pi-external-link text-[10px]"></i>
                        </a>
                      </div>
                    </div>
                  </div>
                  {liveBotInfo.webhook_registered && (
                    <div className="pt-2 border-t border-sky-200/60 flex items-center justify-between text-[11px]">
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <i className="pi pi-check text-[10px]"></i> Webhook oficial registrado
                      </span>
                      <button
                        type="button"
                        onClick={handleDeleteWebhook}
                        disabled={savingConfig}
                        className="text-rose-600 hover:text-rose-800 hover:underline text-[10px] font-medium"
                      >
                        Desvincular Webhook
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Webhook URL configuration */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span>URL del Webhook (Recepción de Mensajes)</span>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">HTTPS</span>
                </label>
                <input
                  type="text"
                  value={configCustomWebhookUrl}
                  onChange={(e) => setConfigCustomWebhookUrl(e.target.value)}
                  placeholder="https://api.qa.morpheussoft.net/api/v1/telegram/dante_it/webhook"
                  className="w-full text-xs font-mono px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800"
                />
                <p className="text-[11px] text-slate-400">
                  Esta es la dirección pública donde Telegram envía los eventos entrantes hacia Neo ERP.
                </p>
              </div>

              {/* Options */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-slate-50 rounded-xl transition-colors">
                  <input
                    type="checkbox"
                    checked={configAutoWebhook}
                    onChange={(e) => setConfigAutoWebhook(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-600 border-slate-300 focus:ring-sky-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-700">Registrar Webhook automáticamente en Telegram</div>
                    <div className="text-[11px] text-slate-400">Llama a Telegram setWebhook al guardar para activar la mensajería en vivo de inmediato.</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-slate-50 rounded-xl transition-colors">
                  <input
                    type="checkbox"
                    checked={configEnabled}
                    onChange={(e) => setConfigEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-600 border-slate-300 focus:ring-sky-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-700">Canal de Telegram Habilitado</div>
                    <div className="text-[11px] text-slate-400">Permite procesar comandos y enviar alertas proactivas a supervisores vinculados.</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfigModalWorker(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveTelegramConfig}
                disabled={savingConfig || !configToken.trim()}
                className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-xl shadow-md shadow-sky-600/20 transition-all flex items-center gap-2 disabled:opacity-40"
              >
                {savingConfig ? (
                  <>
                    <i className="pi pi-spin pi-spinner text-xs"></i>
                    <span>Guardando y Enlazando...</span>
                  </>
                ) : (
                  <>
                    <i className="pi pi-check text-xs"></i>
                    <span>Guardar y Registrar Webhook</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
