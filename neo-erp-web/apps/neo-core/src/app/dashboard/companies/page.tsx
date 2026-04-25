"use client";

import { useEffect, useState } from "react";
import { getCompanies, createCompany, updateCompany } from "@/app/actions/companies";
import { getCurrencies } from "@/app/actions/currencies";

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [systemCurrencies, setSystemCurrencies] = useState<any[]>([]);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const [compData, currData] = await Promise.all([getCompanies(), getCurrencies()]);
      setCompanies(compData);
      setSystemCurrencies(currData.filter((c: any) => c.is_active));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const openNewModal = () => {
    setEditingId(null);
    setName("");
    setTaxId("");
    setCurrencyCode(systemCurrencies.length > 0 ? systemCurrencies[0].code : "");
    setIsModalOpen(true);
  };

  const openEditModal = (comp: any) => {
    setEditingId(comp.id);
    setName(comp.name);
    setTaxId(comp.tax_id || "");
    setCurrencyCode(comp.currency_code || (systemCurrencies.length > 0 ? systemCurrencies[0].code : ""));
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name, tax_id: taxId, currency_code: currencyCode };
    try {
      if (editingId) {
        await updateCompany(editingId, payload);
      } else {
        await createCompany(payload);
      }
      setIsModalOpen(false);
      fetchCompanies();
    } catch (error) {
      alert("Error guardando empresa");
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto pb-10 fade-in-up">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Empresas Base</h1>
          <p className="text-slate-500 mt-2 text-sm">Gestión del holding de compañías operativas en NEO ERP.</p>
        </div>
        <button 
          onClick={openNewModal}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
        >
          <i className="pi pi-plus"></i> Nueva Empresa
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400">
             <i className="pi pi-spinner animate-spin text-3xl mb-3 text-indigo-500"></i>
             <p>Cargando holding empresarial...</p>
          </div>
        ) : companies.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No hay empresas registradas en el sistema.</div>
        ) : (
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 rounded-tl-2xl">ID</th>
                <th className="px-6 py-4">Razón Social</th>
                <th className="px-6 py-4">RIF / Tax ID</th>
                <th className="px-6 py-4">Moneda Base</th>
                <th className="px-6 py-4 text-right rounded-tr-2xl">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-mono font-medium text-slate-400">#{c.id}</td>
                  <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-3">
                     <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                       <i className="pi pi-building text-sm"></i>
                     </div>
                     {c.name}
                  </td>
                  <td className="px-6 py-4 font-mono">{c.tax_id || "N/A"}</td>
                  <td className="px-6 py-4">
                     <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-md text-xs font-bold tracking-wide">
                        {c.currency_code}
                     </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => openEditModal(c)}
                      className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      title="Editar Empresa"
                    >
                      <i className="pi pi-pencil"></i>
                    </button>
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
                 <i className="pi pi-building text-indigo-500"></i> 
                 {editingId ? "Editar Empresa" : "Crear Nueva Empresa"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                <i className="pi pi-times"></i>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Razón Social</label>
                  <input 
                    type="text" 
                    required 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
                    placeholder="Ej. NEO Corp S.A."
                  />
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">RIF / Tax ID</label>
                  <input 
                    type="text" 
                    required 
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400 font-mono"
                    placeholder="J-12345678-9"
                  />
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Moneda Referencial</label>
                  <select 
                    value={currencyCode}
                    onChange={(e) => setCurrencyCode(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    required
                  >
                    <option value="" disabled>-- Seleccionar Moneda --</option>
                    {systemCurrencies.map(c => (
                       <option key={c.id} value={c.code}>{c.name} ({c.code})</option>
                    ))}
                  </select>
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
                    {editingId ? "Actualizar" : "Guardar"}
                 </button>
               </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
