'use client';
import { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { useRouter } from 'next/navigation';
import { PricingService } from '@/services/pricing.service';

export default function PricingSessionsListPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const data = await PricingService.getSessions();
      setSessions(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const statusTemplate = (rowData: any) => {
    const s = rowData.status;
    let bClass = "bg-slate-100 text-slate-600";
    if(s === 'APPLIED') bClass = "bg-emerald-50 text-emerald-600 border border-emerald-200/60";
    if(s === 'DRAFT') bClass = "bg-blue-50 text-blue-600 border border-blue-200/60";
    return <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${bClass}`}>{s}</span>;
  };

  const cDateTemplate = (rowData: any) => {
    if (!rowData.created_at) return '';
    const d = new Date(rowData.created_at);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Motor de Precios</h1>
          <p className="text-slate-500 mt-1 font-medium">Auditoría y ejecución atómica de costos.</p>
        </div>
        <Button label="Iniciar Nueva Sesión" icon="pi pi-bolt" className="!bg-teal-600 !border-none !rounded-full !shadow-lg hover:!bg-teal-700 !px-6" onClick={() => router.push('/pricing/new')} />
      </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/30 border border-slate-100 overflow-hidden">
        <DataTable value={sessions} loading={loading} emptyMessage="No hay sesiones de cambio de precios registradas" paginator rows={10} className="p-4">
          <Column field="id" header="ID" className="font-bold text-slate-400"></Column>
          <Column field="name" header="NOMBRE / MOTIVO" className="font-semibold text-slate-800"></Column>
          <Column field="source_type" header="TIPO"></Column>
          <Column field="target_cost_type" header="DESTINO DE COSTO"></Column>
          <Column header="FECHA CREACIÓN" body={cDateTemplate} className="text-slate-500"></Column>
          <Column header="ESTADO" body={statusTemplate}></Column>
          <Column header="" body={(r: any) => (
            <div className="flex gap-2 justify-end">
              {r.status === 'DRAFT' && (
                <Button icon="pi pi-trash" rounded text severity="danger" onClick={async () => {
                  if(confirm('¿Seguro quieres eliminar este borrador?')) {
                    await PricingService.deleteSession(r.id);
                    fetchSessions();
                  }
                }} />
              )}
              <Button icon="pi pi-chevron-right" rounded text severity="secondary" onClick={() => router.push('/pricing/' + r.id)} />
            </div>
          )} align="right"></Column>
        </DataTable>
      </div>
    </div>
  );
}
