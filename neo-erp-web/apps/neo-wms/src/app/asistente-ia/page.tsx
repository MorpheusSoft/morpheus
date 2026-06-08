'use client';
import { useState, useRef, useEffect } from 'react';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { ProgressBar } from 'primereact/progressbar';
import { ReportService } from '@/services/report.service';
import { SvgChart } from '@/components/SvgChart';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  table?: any[];
  chart?: any;
}

export default function AIChatAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '👋 ¡Hola! Soy tu **Asistente de Inteligencia Artificial Morpheus** para el módulo **WMS / Depósito**.\n\nPuedo ayudarte a consultar stock por ubicaciones de pasillo, revisar el estado de recepciones (inbound), auditar movimientos y analizar la capacidad de almacenamiento.\n\n¿De qué te gustaría hablar hoy?'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const chips = [
    "Ver las recepciones inbound de mercancía",
    "Muestra la ocupación de stock por ubicación",
    "Buscar movimientos de inventario de Harina Pan"
  ];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg = text.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const historyPayload = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const res = await ReportService.sendAIChat(userMsg, historyPayload);
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.text_response || 'No he recibido una respuesta estructurada.',
        table: res.data_table || undefined,
        chart: res.chart || undefined
      }]);
    } catch (err) {
      console.error('Error in AI Chat:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ **Error de conexión**\n\nNo se pudo comunicar con el Asistente de IA en este momento. Por favor verifica que el backend de FastAPI esté en ejecución y tenga una API Key de Gemini configurada.'
      }]);
    } finally {
      setLoading(false);
    }
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
          return <strong key={index} className="font-extrabold text-slate-800">{part}</strong>;
        }
        return part;
      });
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        insideList = true;
        listItems.push(<li key={`li-${idx}`} className="ml-5 list-disc mb-1 text-slate-600">{parseInline(trimmed.substring(2))}</li>);
      } else {
        if (insideList) {
          elements.push(<ul key={`ul-${idx}`} className="mb-4">{...listItems}</ul>);
          listItems = [];
          insideList = false;
        }

        if (trimmed.startsWith('### ')) {
          elements.push(<h4 key={idx} className="text-sm font-extrabold text-slate-700 mt-4 mb-2 uppercase tracking-wide">{parseInline(trimmed.substring(4))}</h4>);
        } else if (trimmed.startsWith('## ')) {
          elements.push(<h3 key={idx} className="text-base font-bold text-slate-800 mt-5 mb-2">{parseInline(trimmed.substring(3))}</h3>);
        } else if (trimmed.startsWith('# ')) {
          elements.push(<h2 key={idx} className="text-lg font-extrabold text-slate-900 mt-6 mb-3 border-b border-slate-100 pb-1">{parseInline(trimmed.substring(2))}</h2>);
        } else if (trimmed === '') {
          elements.push(<div key={idx} className="h-2"></div>);
        } else {
          elements.push(<p key={idx} className="text-slate-600 leading-relaxed mb-3 text-sm">{parseInline(line)}</p>);
        }
      }
    });

    if (insideList) {
      elements.push(<ul key="ul-end" className="mb-4">{...listItems}</ul>);
    }

    return <div>{elements}</div>;
  };

  return (
    <div className="w-full max-w-[1000px] mx-auto h-[calc(100vh-100px)] py-6 px-4 flex flex-col gap-4">
      <div className="flex-shrink-0">
        <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
          <span className="text-2xl">✨</span> Asistente Analítico IA (WMS)
        </h1>
        <p className="text-slate-500 text-xs font-medium mt-1">Audita y analiza ubicaciones, stock en estanterías, recepciones y despachos del almacén.</p>
      </div>

      <div className="flex-1 bg-white border border-slate-100 shadow-sm rounded-3xl overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar">
          {messages.map((m, idx) => {
            const isUser = m.role === 'user';
            return (
              <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fadein`}>
                <div className={`max-w-[85%] rounded-3xl p-5 border shadow-sm ${
                  isUser 
                    ? 'bg-amber-600 text-white border-amber-700 rounded-tr-none' 
                    : 'bg-slate-50 text-slate-700 border-slate-100 rounded-tl-none'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isUser ? 'text-amber-100' : 'text-amber-600'}`}>
                      {isUser ? 'Tú (Usuario)' : '🤖 Asistente IA Morpheus'}
                    </span>
                  </div>

                  <div className={isUser ? 'text-white' : 'text-slate-700'}>
                    {isUser ? m.content : renderMarkdown(m.content)}
                  </div>

                  {m.table && m.table.length > 0 && (
                    <div className="mt-4 border border-slate-100 rounded-xl overflow-hidden bg-white shadow-sm text-xs max-w-full overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-100">
                        <thead className="bg-slate-50">
                          <tr>
                            {Object.keys(m.table[0]).map((h, hIdx) => (
                              <th key={hIdx} className="px-4 py-2 text-left font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-50">
                          {m.table.map((row, rIdx) => (
                            <tr key={rIdx}>
                              {Object.values(row).map((val: any, vIdx) => (
                                <td key={vIdx} className="px-4 py-2 font-medium text-slate-600 truncate max-w-[200px]">
                                  {typeof val === 'number' ? `$${val.toFixed(2)}` : String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {m.chart && (
                    <div className="mt-2 bg-white rounded-xl p-2 border border-slate-100">
                      <SvgChart type={m.chart.type} labels={m.chart.labels} datasets={m.chart.datasets} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-50 text-slate-500 border border-slate-100 rounded-3xl rounded-tl-none p-5 max-w-[80%] flex items-center gap-3">
                <i className="pi pi-spin pi-spinner text-amber-600 text-lg"></i>
                <span className="text-xs font-bold tracking-wide animate-pulse">Analizando base de datos Morpheus y generando respuesta estructurada...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-4 border-t border-slate-100 flex-shrink-0 bg-slate-50/50 flex flex-col gap-3">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {chips.map((chip, cIdx) => (
              <button
                key={cIdx}
                onClick={() => handleSend(chip)}
                className="bg-white hover:bg-amber-50 text-slate-600 hover:text-emerald-600 border border-slate-200 hover:border-amber-300 rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all duration-200 shadow-sm"
              >
                💡 {chip}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <InputText
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pregúntale a la IA sobre ocupación, ubicaciones, recepciones WMS..."
                disabled={loading}
                className="w-full py-3 pl-4 pr-12 border-slate-200 rounded-2xl focus:ring-4 focus:ring-amber-500/10 font-medium text-slate-700 bg-white"
              />
            </div>
            <Button
              type="submit"
              icon="pi pi-send"
              disabled={!input.trim() || loading}
              className="!bg-amber-600 hover:!bg-amber-700 border-none px-5 py-3 rounded-2xl shadow-md shadow-amber-100 text-white"
            />
          </form>
        </div>
      </div>
    </div>
  );
}
