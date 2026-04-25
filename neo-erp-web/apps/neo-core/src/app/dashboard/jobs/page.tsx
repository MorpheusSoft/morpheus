"use client";

import { useEffect, useState } from "react";
import { getJobs, updateJob } from "@/app/actions/jobs";

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [executionTime, setExecutionTime] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const data = await getJobs();
      setJobs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const openEditModal = (job: any) => {
    setEditingCode(job.job_code);
    setName(job.name);
    setExecutionTime(job.execution_time);
    setIsEnabled(job.is_enabled);
    setIsModalOpen(true);
  };

  const handleToggle = async (job: any) => {
     try {
       await updateJob(job.job_code, {
          is_enabled: !job.is_enabled,
          execution_time: job.execution_time
       });
       fetchJobs();
     } catch (e) {
       alert("Error al cambiar estado.");
     }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCode) return;

    try {
      await updateJob(editingCode, {
         is_enabled: isEnabled,
         execution_time: executionTime
      });
      setIsModalOpen(false);
      fetchJobs();
    } catch (error) {
      alert("Error guardando el Job");
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto pb-10 fade-in-up">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Trabajos en Segundo Plano</h1>
          <p className="text-slate-500 mt-2 text-sm">Monitor y programador de tareas y cronjobs autónomos del ERP.</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400">
             <i className="pi pi-spinner animate-spin text-3xl mb-3 text-indigo-500"></i>
             <p>Escaneando demonios activos...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No hay tareas programadas en la base de datos.</div>
        ) : (
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 rounded-tl-2xl">Código Hash</th>
                <th className="px-6 py-4">Tarea Programada</th>
                <th className="px-6 py-4 text-center">Hora de Ejecución</th>
                <th className="px-6 py-4">Última Corrida</th>
                <th className="px-6 py-4 text-center">Estado Onde-Click</th>
                <th className="px-6 py-4 text-right rounded-tr-2xl">Ajustar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((job) => (
                <tr key={job.job_code} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-mono font-medium text-slate-400">{job.job_code}</td>
                  <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-3">
                     <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                       <i className="pi pi-server text-sm"></i>
                     </div>
                     {job.name}
                  </td>
                  <td className="px-6 py-4 text-center">
                     <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-md text-xs font-mono font-bold tracking-widest inline-block">
                        <i className="pi pi-clock mr-1"></i> {job.execution_time}
                     </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-slate-400 text-xs">
                     {job.last_executed_at ? new Date(job.last_executed_at).toLocaleString() : "Nunca"}
                  </td>
                  <td className="px-6 py-4">
                     <div className="flex justify-center">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" checked={job.is_enabled} onChange={() => handleToggle(job)} />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500 shadow-inner"></div>
                        </label>
                     </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => openEditModal(job)}
                      className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      title="Editar Horario"
                    >
                      <i className="pi pi-cog"></i>
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
                 <i className="pi pi-cog text-indigo-500"></i> Reprogramar Tarea Automática
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                <i className="pi pi-times"></i>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Nombre del Trabajo</label>
                  <input 
                    type="text" 
                    disabled 
                    value={name}
                    className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl outline-none font-medium text-slate-500"
                  />
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Hora de Ejecución (Trigger)</label>
                  <input 
                    type="time" 
                    required 
                    value={executionTime}
                    onChange={(e) => setExecutionTime(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400 font-mono text-lg text-indigo-600 font-bold"
                  />
               </div>

               <div className="flex gap-4 items-center">
                  <div className="flex-1">
                      <p className="font-bold text-slate-700 text-sm">Estado General</p>
                      <p className="text-xs text-slate-400">Las tareas desactivadas no consumirán CPU.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
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
                    Guardar Configuración
                 </button>
               </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
