"use client";

import { useEffect, useState } from "react";
import { getCurrencies, createCurrency, updateCurrency, deleteCurrency } from "@/app/actions/currencies";

export default function CurrenciesPage() {
  const [currencies, setCurrencies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [symbol, setSymbol] = useState("$");
  const [exchangeRate, setExchangeRate] = useState<number>(1.0);
  const [decimalPlaces, setDecimalPlaces] = useState<number>(2);
  const [isActive, setIsActive] = useState(true);

  const fetchCurrencies = async () => {
    setLoading(true);
    try {
      const data = await getCurrencies();
      setCurrencies(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrencies();
  }, []);

  const openNewModal = () => {
    setEditingId(null);
    setName("");
    setCode("");
    setSymbol("$");
    setExchangeRate(1.0);
    setDecimalPlaces(2);
    setIsActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (curr: any) => {
    setEditingId(curr.id);
    setName(curr.name);
    setCode(curr.code);
    setSymbol(curr.symbol || "$");
    setExchangeRate(curr.exchange_rate ?? 1.0);
    setDecimalPlaces(curr.decimal_places ?? 2);
    setIsActive(curr.is_active ?? false);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { 
       name, 
       code, 
       symbol,
       exchange_rate: exchangeRate,
       decimal_places: decimalPlaces,
       is_active: isActive
    };
    try {
      if (editingId) {
        await updateCurrency(editingId, payload);
      } else {
        await createCurrency(payload);
      }
      setIsModalOpen(false);
      fetchCurrencies();
    } catch (error) {
      alert("Error guardando moneda");
    }
  };

  const handleDelete = async (curr: any) => {
    if (!window.confirm(`¿Estás seguro que deseas eliminar la moneda ${curr.name} (${curr.code})? Esta acción no se puede deshacer.`)) return;
    
    try {
      await deleteCurrency(curr.id);
      fetchCurrencies();
    } catch (error: any) {
      alert(error.message || "Error al eliminar la moneda");
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto pb-10 fade-in-up">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Monedas / Divisas</h1>
          <p className="text-slate-500 mt-2 text-sm">Gestiona el tabulador de cambios, tasas y monedas globales operativas.</p>
        </div>
        <button 
          onClick={openNewModal}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
        >
          <i className="pi pi-plus"></i> Nueva Divisa
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400">
             <i className="pi pi-spinner animate-spin text-3xl mb-3 text-indigo-500"></i>
             <p>Obteniendo mercado de divisas...</p>
          </div>
        ) : currencies.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No hay tarifas parametrizadas en el sistema.</div>
        ) : (
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 rounded-tl-2xl">Código ISO</th>
                <th className="px-6 py-4">Moneda</th>
                <th className="px-6 py-4">Tasa de Cambio</th>
                <th className="px-6 py-4">Decimales</th>
                <th className="px-6 py-4 text-center">Estatus</th>
                <th className="px-6 py-4 text-right rounded-tr-2xl">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currencies.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-mono font-medium text-indigo-500">{c.code}</td>
                  <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-3">
                     <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 font-bold">
                       {c.symbol}
                     </div>
                     {c.name}
                  </td>
                  <td className="px-6 py-4 font-mono font-semibold text-slate-700">
                     {c.exchange_rate}
                  </td>
                  <td className="px-6 py-4 font-mono text-slate-400">
                     {c.decimal_places}
                  </td>
                  <td className="px-6 py-4 text-center">
                     {c.is_active ? (
                        <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2.5 py-1 rounded-md text-[10px] uppercase font-black tracking-widest inline-block">Activa</span>
                     ) : (
                        <span className="bg-slate-100 text-slate-400 border border-slate-200 px-2.5 py-1 rounded-md text-[10px] uppercase font-black tracking-widest inline-block">Inactiva</span>
                     )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                       <button 
                         onClick={() => openEditModal(c)}
                         className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                         title="Editar Divisa"
                       >
                         <i className="pi pi-pencil"></i>
                       </button>
                       <button 
                         onClick={() => handleDelete(c)}
                         className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                         title="Eliminar Divisa"
                       >
                         <i className="pi pi-trash"></i>
                       </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                 <i className="pi pi-money-bill text-indigo-500"></i> 
                 {editingId ? "Actualizar Tasa y Divisa" : "Crear Nueva Divisa"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                <i className="pi pi-times"></i>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Código ISO</label>
                    <input 
                      type="text" 
                      required 
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400 font-mono text-indigo-600 uppercase"
                      placeholder="USD, VES, EUR"
                      maxLength={3}
                    />
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Símbolo</label>
                    <input 
                      type="text" 
                      required 
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400 font-mono text-center"
                      placeholder="$ / Bs. / €"
                    />
                 </div>
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Nombre de la Divisa</label>
                  <input 
                    type="text" 
                    required 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
                    placeholder="Ej. Dólar Estadounidense"
                  />
               </div>

               <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
                  <label className="block text-xs font-bold text-indigo-800 uppercase tracking-wide mb-2">Tasa de Cambio Referencial</label>
                  <input 
                    type="number" 
                    step="0.000001"
                    min="0"
                    required 
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400 font-mono text-lg font-bold text-indigo-700"
                  />
                  {editingId && <p className="text-xs text-indigo-500 mt-2"><i className="pi pi-info-circle"></i> Actualizar esta tasa creará un nuevo registro en el histórico.</p>}
               </div>

               <div className="grid grid-cols-2 gap-4 items-center">
                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Decimales</label>
                      <input 
                        type="number" 
                        min="0"
                        max="6"
                        required 
                        value={decimalPlaces}
                        onChange={(e) => setDecimalPlaces(Number(e.target.value))}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all font-mono"
                      />
                  </div>

                  <div className="flex justify-end pt-5">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <span className="font-bold text-slate-700 text-sm mr-3">Divisa Activa</span>
                      <input type="checkbox" className="sr-only peer" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>
               </div>

               <div className="mt-4 flex gap-3">
                 <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                 >
                    Cancelar
                 </button>
                 <button 
                    type="submit" 
                    className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all"
                 >
                    {editingId ? "Actualizar Divisa" : "Guardar"}
                 </button>
               </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
