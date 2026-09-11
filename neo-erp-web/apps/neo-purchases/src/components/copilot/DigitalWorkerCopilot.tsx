'use client';
import React, { useState, useRef, useEffect } from 'react';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { ReportService } from '@/services/report.service';
import { SvgChart } from '@/components/SvgChart';

export interface ActionButton {
  label: string;
  action: string;
  icon?: string;
  prompt?: string;
  payload?: any;
}

export interface FileExport {
  filename: string;
  download_url: string;
  format: string;
  file_size?: string;
  total_records?: number;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  table?: any[];
  chart?: any;
  actions?: ActionButton[];
  file_export?: FileExport;
  timestamp?: string;
}

export interface DigitalWorkerCopilotProps {
  name: string;
  role: string;
  avatarIcon?: string;
  themeColor?: 'emerald' | 'blue' | 'indigo' | 'amber' | 'teal';
  welcomeMessage?: string;
  quickChips?: string[];
  initialOpen?: boolean;
}

const colorSchemes = {
  emerald: {
    fabBg: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/30',
    fabPulse: 'bg-emerald-400',
    headerBg: 'bg-[#0f172a] border-[#1e293b]',
    avatarBg: 'bg-emerald-950 text-emerald-300 border-emerald-500/40',
    accentText: 'text-emerald-400',
    accentBadge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    userBubble: 'bg-emerald-600 text-white border-emerald-700',
    chipBorder: 'border-slate-200 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50',
    sendBtn: '!bg-emerald-600 hover:!bg-emerald-700 shadow-emerald-200',
    focusRing: 'focus:border-emerald-500 focus:ring-emerald-500/20',
  },
  blue: {
    fabBg: 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-blue-500/30',
    fabPulse: 'bg-blue-400',
    headerBg: 'bg-[#0f172a] border-[#1e293b]',
    avatarBg: 'bg-blue-950 text-blue-300 border-blue-500/40',
    accentText: 'text-blue-400',
    accentBadge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    userBubble: 'bg-blue-600 text-white border-blue-700',
    chipBorder: 'border-slate-200 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50',
    sendBtn: '!bg-blue-600 hover:!bg-blue-700 shadow-blue-200',
    focusRing: 'focus:border-blue-500 focus:ring-blue-500/20',
  },
  amber: {
    fabBg: 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-amber-500/30',
    fabPulse: 'bg-amber-400',
    headerBg: 'bg-[#0f172a] border-[#1e293b]',
    avatarBg: 'bg-amber-950 text-amber-300 border-amber-500/40',
    accentText: 'text-amber-400',
    accentBadge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    userBubble: 'bg-amber-600 text-white border-amber-700',
    chipBorder: 'border-slate-200 hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50',
    sendBtn: '!bg-amber-600 hover:!bg-amber-700 shadow-amber-200',
    focusRing: 'focus:border-amber-500 focus:ring-amber-500/20',
  },
  indigo: {
    fabBg: 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-indigo-500/30',
    fabPulse: 'bg-indigo-400',
    headerBg: 'bg-[#0f172a] border-[#1e293b]',
    avatarBg: 'bg-indigo-950 text-indigo-300 border-indigo-500/40',
    accentText: 'text-indigo-400',
    accentBadge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    userBubble: 'bg-indigo-600 text-white border-indigo-700',
    chipBorder: 'border-slate-200 hover:border-indigo-400 hover:text-indigo-700 hover:bg-indigo-50',
    sendBtn: '!bg-indigo-600 hover:!bg-indigo-700 shadow-indigo-200',
    focusRing: 'focus:border-indigo-500 focus:ring-indigo-500/20',
  },
  teal: {
    fabBg: 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-teal-500/30',
    fabPulse: 'bg-teal-400',
    headerBg: 'bg-[#0f172a] border-[#1e293b]',
    avatarBg: 'bg-teal-950 text-teal-300 border-teal-500/40',
    accentText: 'text-teal-400',
    accentBadge: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    userBubble: 'bg-teal-600 text-white border-teal-700',
    chipBorder: 'border-slate-200 hover:border-teal-400 hover:text-teal-700 hover:bg-teal-50',
    sendBtn: '!bg-teal-600 hover:!bg-teal-700 shadow-teal-200',
    focusRing: 'focus:border-teal-500 focus:ring-teal-500/20',
  },
};

export function DigitalWorkerCopilot({
  name,
  role,
  avatarIcon = 'pi pi-sparkles',
  themeColor = 'emerald',
  welcomeMessage,
  quickChips = [],
  initialOpen = false,
}: DigitalWorkerCopilotProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const theme = colorSchemes[themeColor] || colorSchemes.emerald;

  const defaultGreeting = welcomeMessage || `👋 ¡Hola! Soy **${name}**, tu **${role}**.\n\nPuedes consultarme en tiempo real sobre órdenes de compra, proveedores, inventario y análisis de reposición.\n\n¿En qué te puedo ayudar hoy?`;

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: defaultGreeting,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }
  }, [defaultGreeting, messages.length]);

  // Global event listener to toggle/open copilot from Topbar or anywhere
  useEffect(() => {
    const handleToggle = () => setIsOpen((prev) => !prev);
    const handleOpen = () => setIsOpen(true);
    const handleClose = () => setIsOpen(false);

    window.addEventListener('toggle-digital-copilot', handleToggle);
    window.addEventListener('open-digital-copilot', handleOpen);
    window.addEventListener('close-digital-copilot', handleClose);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('toggle-digital-copilot', handleToggle);
      window.removeEventListener('open-digital-copilot', handleOpen);
      window.removeEventListener('close-digital-copilot', handleClose);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isOpen]);

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg = text.trim();
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg, timestamp: time }]);
    setLoading(true);

    try {
      const historyPayload = messages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

      const res = await ReportService.sendAIChat(userMsg, historyPayload);

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.text_response || 'He procesado la consulta.',
          table: res.data_table || undefined,
          chart: res.chart || undefined,
          actions: res.actions || undefined,
          file_export: res.file_export || undefined,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        },
      ]);
    } catch (err) {
      console.error(`Error in ${name} Copilot:`, err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ **Error de conexión con el agente**\n\nNo fue posible comunicarse con el servicio de IA en este momento. Por favor verifica la conexión con el backend de Neo ERP.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getDownloadUrl = (url: string) => {
    if (!url) return '#';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/api\/v1\/?$/, '');
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const handleActionClick = (action: ActionButton) => {
    if (loading) return;
    const promptToSend = action.prompt || action.label;
    handleSend(promptToSend);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        role: 'assistant',
        content: `Conversación reiniciada. ¿En qué te puedo colaborar ahora?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  const renderMarkdown = (text: string) => {
    if (!text) return null;

    const lines = text.split('\n');
    let insideList = false;
    let listItems: React.ReactNode[] = [];
    const elements: React.ReactNode[] = [];

    const parseInline = (str: string) => {
      const parts = str.split('**');
      return parts.map((part, index) => {
        if (index % 2 === 1) {
          return <strong key={index} className="font-extrabold text-slate-900">{part}</strong>;
        }
        return part;
      });
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        insideList = true;
        listItems.push(
          <li key={`li-${idx}`} className="ml-4 list-disc mb-1 text-slate-700">
            {parseInline(trimmed.substring(2))}
          </li>
        );
      } else {
        if (insideList) {
          elements.push(<ul key={`ul-${idx}`} className="mb-3 text-xs leading-relaxed">{...listItems}</ul>);
          listItems = [];
          insideList = false;
        }

        if (trimmed.startsWith('### ')) {
          elements.push(
            <h4 key={idx} className="text-xs font-extrabold text-slate-800 mt-3 mb-1.5 uppercase tracking-wide">
              {parseInline(trimmed.substring(4))}
            </h4>
          );
        } else if (trimmed.startsWith('## ')) {
          elements.push(
            <h3 key={idx} className="text-sm font-bold text-slate-900 mt-4 mb-1.5 border-b border-slate-200 pb-1">
              {parseInline(trimmed.substring(3))}
            </h3>
          );
        } else if (trimmed.startsWith('# ')) {
          elements.push(
            <h2 key={idx} className="text-base font-extrabold text-slate-900 mt-4 mb-2">
              {parseInline(trimmed.substring(2))}
            </h2>
          );
        } else if (trimmed === '') {
          elements.push(<div key={idx} className="h-1.5"></div>);
        } else {
          elements.push(
            <p key={idx} className="text-slate-700 leading-relaxed mb-2 text-xs">
              {parseInline(line)}
            </p>
          );
        }
      }
    });

    if (insideList) {
      elements.push(<ul key="ul-end" className="mb-3 text-xs leading-relaxed">{...listItems}</ul>);
    }

    return <div>{elements}</div>;
  };

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className={`flex items-center gap-3 pl-3.5 pr-4 py-3 rounded-full text-white font-semibold text-xs tracking-wide shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95 group ${theme.fabBg}`}
          title={`Abrir copiloto de ${name} (Alt + C)`}
        >
          <div className="relative flex items-center justify-center">
            <i className={`${avatarIcon} text-base`}></i>
            <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${theme.fabPulse} animate-pulse ring-2 ring-white`}></span>
          </div>
          <span className="font-bold flex items-center gap-1.5">
            {name} Copilot
            <span className="text-[10px] opacity-75 font-mono font-normal hidden sm:inline">(Alt+C)</span>
          </span>
        </button>
      </div>

      {/* Slide-over Backdrop (Click outside to close) */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-50 transition-opacity duration-300 ease-in-out"
        />
      )}

      {/* Slide-over Drawer */}
      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[460px] max-w-full bg-white z-50 shadow-2xl flex flex-col border-l border-slate-200 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-label={`Copiloto de ${name}`}
      >
        {/* Header */}
        <div className={`p-4 flex items-center justify-between border-b ${theme.headerBg} text-white`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-inner ${theme.avatarBg}`}>
              <i className={`${avatarIcon} text-lg`}></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold tracking-wide text-white">{name}</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${theme.accentBadge}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  En línea
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium truncate max-w-[240px]">{role}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleClearHistory}
              title="Limpiar conversación"
              className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 flex items-center justify-center transition-colors"
            >
              <i className="pi pi-trash text-xs"></i>
            </button>
            <button
              onClick={() => setIsOpen(false)}
              title="Cerrar panel (Esc)"
              className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 flex items-center justify-center transition-colors"
            >
              <i className="pi pi-times text-sm"></i>
            </button>
          </div>
        </div>

        {/* Conversation Message List */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-slate-50/50 custom-scrollbar text-xs">
          {messages.map((m, idx) => {
            const isUser = m.role === 'user';
            return (
              <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                <div
                  className={`max-w-[90%] rounded-2xl p-4 shadow-xs border ${
                    isUser
                      ? `${theme.userBubble} rounded-tr-none`
                      : 'bg-white text-slate-800 border-slate-200/80 rounded-tl-none'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span
                      className={`text-[10px] font-extrabold uppercase tracking-wider ${
                        isUser ? 'text-white/80' : theme.accentText
                      }`}
                    >
                      {isUser ? 'Tú' : name}
                    </span>
                    {m.timestamp && (
                      <span className={`text-[9px] ${isUser ? 'text-white/60' : 'text-slate-400'}`}>
                        {m.timestamp}
                      </span>
                    )}
                  </div>

                  <div className={isUser ? 'text-white text-xs' : 'text-slate-800'}>
                    {isUser ? m.content : renderMarkdown(m.content)}
                  </div>

                  {/* Structured Table */}
                  {m.table && m.table.length > 0 && (
                    <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs max-w-full overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-100 text-[11px]">
                        <thead className="bg-slate-50">
                          <tr>
                            {Object.keys(m.table[0]).map((h, hIdx) => (
                              <th
                                key={hIdx}
                                className="px-3 py-1.5 text-left font-bold text-slate-500 uppercase tracking-wider"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                          {m.table.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-50/80 transition-colors">
                              {Object.values(row).map((val: any, vIdx) => (
                                <td key={vIdx} className="px-3 py-1.5 font-medium text-slate-700 truncate max-w-[160px]">
                                  {typeof val === 'number' ? `$${val.toFixed(2)}` : String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* SVG Chart */}
                  {m.chart && (
                    <div className="mt-3 bg-white rounded-xl p-2 border border-slate-200">
                      <SvgChart type={m.chart.type} labels={m.chart.labels} datasets={m.chart.datasets} />
                    </div>
                  )}

                  {/* Interactive Decision Actions */}
                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                      {m.actions.map((act, aIdx) => (
                        <button
                          key={aIdx}
                          onClick={() => handleActionClick(act)}
                          disabled={loading}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-300 transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <i className={act.icon || 'pi pi-bolt'} style={{ fontSize: '11px' }}></i>
                          <span>{act.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Dynamic File Export Card */}
                  {m.file_export && (
                    <div className="mt-3.5 p-3 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm shrink-0 ${
                            m.file_export.format === 'xlsx'
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          <i className={m.file_export.format === 'xlsx' ? 'pi pi-file-excel' : 'pi pi-code'}></i>
                        </div>
                        <div className="truncate">
                          <p className="font-bold text-slate-900 text-xs truncate max-w-[190px]" title={m.file_export.filename}>
                            {m.file_export.filename}
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium">
                            {m.file_export.format.toUpperCase()} {m.file_export.total_records ? `• ${m.file_export.total_records} registros` : ''} {m.file_export.file_size ? `• ${m.file_export.file_size}` : ''}
                          </p>
                        </div>
                      </div>
                      <a
                        href={getDownloadUrl(m.file_export.download_url)}
                        download={m.file_export.filename}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0 no-underline"
                      >
                        <i className="pi pi-download text-xs"></i>
                        <span>Descargar</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing / Thinking indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white text-slate-600 border border-slate-200 rounded-2xl rounded-tl-none p-3.5 max-w-[85%] flex items-center gap-2.5 shadow-xs">
                <i className="pi pi-spin pi-spinner text-emerald-600 text-sm"></i>
                <span className="text-[11px] font-semibold animate-pulse text-slate-500">
                  {name} está analizando la base de datos...
                </span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        {quickChips.length > 0 && (
          <div className="px-3 py-2 border-t border-slate-200/80 bg-white/80 overflow-x-auto flex gap-1.5 custom-scrollbar">
            {quickChips.map((chip, cIdx) => (
              <button
                key={cIdx}
                onClick={() => handleSend(chip)}
                disabled={loading}
                className={`bg-slate-50 text-slate-600 border rounded-full px-3 py-1 text-[11px] font-medium whitespace-nowrap transition-all duration-200 shadow-2xs ${theme.chipBorder}`}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <div className="p-3 border-t border-slate-200 bg-white flex-shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <InputText
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Escríbele a ${name}...`}
                disabled={loading}
                className={`w-full py-2.5 px-3.5 text-xs border border-slate-200 rounded-xl bg-slate-50/50 ${theme.focusRing}`}
              />
            </div>
            <Button
              type="submit"
              icon="pi pi-send"
              disabled={!input.trim() || loading}
              className={`border-none px-4 py-2.5 rounded-xl text-white ${theme.sendBtn}`}
            />
          </form>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 px-1">
            <span>Presiona Enter para enviar</span>
            <span>Neo Digital Worker</span>
          </div>
        </div>
      </aside>
    </>
  );
}
