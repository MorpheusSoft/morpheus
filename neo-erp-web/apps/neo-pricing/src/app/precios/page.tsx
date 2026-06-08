'use client';
import { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { useRouter } from 'next/navigation';
import { PricingService } from '@/services/pricing.service';

export default function PriceSessionsListPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const data = await PricingService.getSessions();
      // Filter for Price-related updates
      const priceSessions = (data || []).filter((s: any) => s.update_type === 'PRICE' || s.update_type === 'BOTH');
      setSessions(priceSessions);
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
    let bClass = "bg-slate-100 text-slate-600 border border-slate-200/60";
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
    <div className="w-full max-w-[1400px] mx-auto py-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
            <span className="text-slate-400 font-normal">🏷️</span> Actualizar Precios
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Gestiona y actualiza precios de venta a público en general o sucursales específicas.</p>
        </div>
        <Button 
          label="Nueva Actualización de Precios" 
          icon="pi pi-plus" 
          className="!bg-[#0f172a] hover:!bg-slate-800 !border-none !rounded-xl !shadow-lg !px-6 !py-3 font-semibold transition-all duration-200" 
          onClick={() => router.push('/precios/new')} 
        />
      </div>

      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/30 border border-slate-100 overflow-hidden">
        <DataTable value={sessions} loading={loading} emptyMessage="No hay sesiones de actualización de precios registradas" paginator rows={10} className="p-4">
          <Column field="id" header="ID" className="font-bold text-slate-400" style={{ width: '80px' }}></Column>
          <Column field="name" header="MOTIVO DE ACTUALIZACIÓN" className="font-semibold text-slate-800"></Column>
          <Column field="source_type" header="ORIGEN" body={(r: any) => (
            <span className="text-slate-600 font-medium bg-slate-50 px-2.5 py-1 rounded-md text-xs border border-slate-100 uppercase">
              {r.source_type}
            </span>
          )}></Column>
          <Column header="FECHA CREACIÓN" body={cDateTemplate} className="text-slate-500 font-medium"></Column>
          <Column header="ESTADO" body={statusTemplate} style={{ width: '120px' }}></Column>
          <Column header="" body={(r: any) => (
            <div className="flex gap-2 justify-end">
              {r.status === 'DRAFT' && (
                <Button icon="pi pi-trash" rounded text severity="danger" onClick={async () => {
                  if(confirm('¿Seguro quieres eliminar este borrador de precio?')) {
                    await PricingService.deleteSession(r.id);
                    fetchSessions();
                  }
                }} />
              )}
              <Button icon="pi pi-arrow-right" label="Trabajar" size="small" text className="!text-slate-700 font-bold hover:!bg-slate-50" onClick={() => router.push('/' + r.id)} />
            </div>
          )} align="right" style={{ width: '200px' }}></Column>
        </DataTable>
      </div>
    </div>
  );
}
