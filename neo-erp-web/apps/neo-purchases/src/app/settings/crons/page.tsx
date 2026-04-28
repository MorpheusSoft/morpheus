"use client";

import React, { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { Card } from 'primereact/card';
import { InputSwitch } from 'primereact/inputswitch';
import { Calendar } from 'primereact/calendar';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';

export default function CronsSettingsPage() {
    const [jobs, setJobs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const toast = useRef<Toast>(null);

    const fetchJobs = async () => {
        setLoading(true);
        try {
            const res = await api.get('/jobs/');
            setJobs(res.data.map((j: any) => {
                // Parse "HH:mm:ss" into Date object for Calendar
                const [h, m, s] = j.execution_time.split(':');
                const d = new Date();
                d.setHours(h);
                d.setMinutes(m);
                d.setSeconds(s || 0);
                return { ...j, timeObj: d };
            }));
        } catch (e) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo contactar al servidor' });
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchJobs();
    }, []);

    const saveJob = async (job: any) => {
        setSaving(true);
        try {
            const timeStr = `${job.timeObj.getHours().toString().padStart(2, '0')}:${job.timeObj.getMinutes().toString().padStart(2, '0')}:00`;
            await api.put(`/jobs/${job.job_code}`, {
                is_enabled: job.is_enabled,
                execution_time: timeStr
            });
            toast.current?.show({ severity: 'success', summary: 'Guardado', detail: `El autómata '${job.name}' ha sido reprogramado exitosamente.` });
            fetchJobs();
        } catch (e) {
            toast.current?.show({ severity: 'error', summary: 'Rechazo', detail: 'Fallo al guardar.' });
        }
        setSaving(false);
    };

    const updateJobState = (index: number, field: string, value: any) => {
        setJobs(prev => {
            const arr = [...prev];
            arr[index] = { ...arr[index], [field]: value };
            return arr;
        });
    };

    if (loading) return <div className="p-8 text-center"><i className="pi pi-spin pi-spinner text-3xl text-indigo-500"></i></div>;

    return (
        <div className="p-4 sm:p-8 max-w-[1000px] mx-auto fade-in">
            <Toast ref={toast} />
            <div className="mb-8">
                <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
                    <i className="pi pi-cog text-indigo-500 mr-4"></i> Configuración de Autómatas (Cron Jobs)
                </h1>
                <p className="text-slate-500 font-medium">Controla los demonios en segundo plano que ejecutan tareas silenciosas del sistema.</p>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {jobs.map((job, idx) => (
                    <Card key={job.id} className="shadow-lg border-2 border-slate-100 rounded-2xl overflow-hidden relative">
                        {job.is_enabled && <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>}
                        {!job.is_enabled && <div className="absolute top-0 left-0 w-2 h-full bg-slate-300"></div>}
                        
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-2">
                            <div className="flex-1 ml-4">
                                <h2 className="text-xl font-black text-slate-800 tracking-tight">{job.name}</h2>
                                <p className="text-xs font-mono text-slate-400 mt-1">ID Tarea: {job.job_code}</p>
                                {job.last_executed_at && (
                                    <p className="text-xs font-bold text-emerald-600 mt-3 bg-emerald-50 inline-block px-2 py-1 rounded">
                                        Último Éxito: {new Date(job.last_executed_at).toLocaleString()}
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center gap-6 mt-6 md:mt-0 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <div className="flex flex-col items-center border-r border-slate-200 pr-6">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Estado</span>
                                    <InputSwitch checked={job.is_enabled} onChange={(e) => updateJobState(idx, 'is_enabled', e.value)} />
                                    <span className={`text-[10px] font-black mt-1 ${job.is_enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {job.is_enabled ? 'CORRIENDO' : 'APAGADO'}
                                    </span>
                                </div>
                                
                                <div className="flex flex-col items-center">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Hora de Disparo</span>
                                    <Calendar value={job.timeObj} onChange={(e) => updateJobState(idx, 'timeObj', e.value)} timeOnly icon={() => <i className="pi pi-clock" />} showIcon className="w-32" disabled={!job.is_enabled} />
                                </div>

                                <Button icon="pi pi-save" rounded severity={job.is_enabled ? "success" : "secondary"} aria-label="Guardar" onClick={() => saveJob(job)} loading={saving} tooltip="Aplicar Cambios en Caliente" tooltipOptions={{position: 'top'}} className="ml-2 shadow-md" />
                            </div>
                        </div>
                    </Card>
                ))}
                
                {jobs.length === 0 && (
                    <div className="text-center p-12 bg-slate-50 rounded-2xl border border-slate-200">
                        <i className="pi pi-inbox text-5xl text-slate-300 mb-4 block"></i>
                        <h2 className="text-xl font-bold text-slate-600">No hay autómatas instalados en tu base de datos.</h2>
                    </div>
                )}
            </div>
        </div>
    );
}
