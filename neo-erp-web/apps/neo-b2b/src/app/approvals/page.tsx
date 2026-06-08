'use client';
import { useState, useEffect, useRef } from 'react';
import { Button } from 'primereact/button';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Dropdown } from 'primereact/dropdown';
import { Message } from 'primereact/message';
import { Toast } from 'primereact/toast';
import api from '@/lib/api';

export default function B2BApprovalsPage() {
  const [loading, setLoading] = useState(true);
  const [pendingCustomers, setPendingCustomers] = useState<any[]>([]);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  
  // Wholesaler Tiers configuration options (from standard database tier setup)
  const tiers = [
    { label: 'Tier Bronce - Descuento Base', value: 1 },
    { label: 'Tier Plata - Descuento 5%', value: 2 },
    { label: 'Tier Oro - Descuento 10%', value: 3 },
  ];
  
  // Selected tiers map for each customer row: customer_id -> tier_id
  const [selectedTiers, setSelectedTiers] = useState<{ [key: number]: number }>({});
  
  const toast = useRef<any>(null);

  const loadPending = async () => {
    setLoading(true);
    try {
      const res = await api.get('/b2b/pending-customers');
      setPendingCustomers(res.data || []);
      
      // Initialize tier selection to Tier 1
      const initialTiers: { [key: number]: number } = {};
      res.data?.forEach((c: any) => {
        initialTiers[c.id] = 1;
      });
      setSelectedTiers(initialTiers);
    } catch (err) {
      console.error(err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudieron cargar los registros pendientes.'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
  }, []);

  const handleTierChange = (customerId: number, val: number) => {
    setSelectedTiers(prev => ({
      ...prev,
      [customerId]: val
    }));
  };

  const approveCustomer = async (customer: any) => {
    const tierId = selectedTiers[customer.id] || 1;
    setSubmittingId(customer.id);
    
    try {
      await api.post(`/b2b/customers/${customer.id}/approve`, {
        wholesaler_tier_id: tierId
      });
      
      toast.current?.show({
        severity: 'success',
        summary: 'Mayorista Aprobado',
        detail: `Cuenta aprobada para ${customer.name}. Credenciales creadas.`
      });
      
      // Reload pending lists
      loadPending();
    } catch (err: any) {
      console.error(err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: err.response?.data?.detail || 'No se pudo aprobar la cuenta.'
      });
    } finally {
      setSubmittingId(null);
    }
  };

  // Templates
  const actionTemplate = (rowData: any) => {
    const isSubmitting = submittingId === rowData.id;
    return (
      <div className="flex items-center gap-3">
        <Dropdown
          value={selectedTiers[rowData.id] || 1}
          options={tiers}
          onChange={(e) => handleTierChange(rowData.id, e.value)}
          className="!rounded-xl border-slate-200 focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 shadow-sm text-xs"
          style={{ width: '220px' }}
        />
        
        <Button
          label="Aprobar"
          icon={isSubmitting ? "pi pi-spinner pi-spin" : "pi pi-check"}
          disabled={isSubmitting}
          onClick={() => approveCustomer(rowData)}
          className="!rounded-xl !bg-emerald-600 hover:!bg-emerald-700 border-none text-white font-bold text-xs !px-4 h-10 shadow-sm"
        />
      </div>
    );
  };

  const rifTemplate = (rowData: any) => {
    return <span className="font-mono text-xs text-slate-600 bg-slate-100 border border-slate-200/60 px-2 py-1 rounded shadow-sm">{rowData.rif}</span>;
  };

  const contactTemplate = (rowData: any) => {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold text-slate-700 text-sm">{rowData.email}</span>
        <span className="text-slate-400 text-xs font-medium">{rowData.phone}</span>
      </div>
    );
  };

  return (
    <div className="w-full max-w-[1200px] mx-auto animate-fade-in-up">
      <Toast ref={toast} position="top-right" />
      
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 m-0 tracking-tight">Aprobación de Mayoristas B2B</h2>
          <p className="text-slate-500 text-sm mt-1 font-medium">Gestione solicitudes de afiliación entrantes y asigne categorías de precios</p>
        </div>
        <Button icon="pi pi-refresh" rounded text severity="info" onClick={loadPending} loading={loading} tooltip="Actualizar Lista" />
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden relative">
        <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 opacity-90"></div>
        
        <div className="p-5 md:p-6">
          <style dangerouslySetInnerHTML={{__html: `
            .approvals-datatable .p-datatable-wrapper {
              border-radius: 1rem;
            }
            .approvals-datatable .p-datatable-thead > tr > th {
              background-color: transparent !important;
              border-bottom: 2px solid #e2e8f0 !important;
              color: #94a3b8 !important;
              font-weight: 700 !important;
              text-transform: uppercase;
              font-size: 0.65rem;
              letter-spacing: 0.1em;
              padding: 1rem 1rem 0.75rem 1rem !important;
              border-top: none !important;
              border-left: none !important;
              border-right: none !important;
            }
            .approvals-datatable .p-datatable-tbody > tr {
              background-color: transparent !important;
              transition: background-color 0.2s ease;
            }
            .approvals-datatable .p-datatable-tbody > tr:hover {
              background-color: #f8fafc !important;
            }
            .approvals-datatable .p-datatable-tbody > tr > td {
              border-bottom: 1px solid #f1f5f9 !important;
              border-top: none !important;
              border-left: none !important;
              border-right: none !important;
              padding: 1.1rem 1rem !important;
            }
          `}} />

          <DataTable
            value={pendingCustomers}
            loading={loading}
            paginator
            rows={10}
            emptyMessage={
              <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                <i className="pi pi-users text-5xl mb-4 opacity-50"></i>
                <p className="font-medium text-lg">No hay solicitudes de registro pendientes por aprobar.</p>
              </div>
            }
            className="approvals-datatable"
          >
            <Column header="RIF" body={rifTemplate} style={{ width: '15%', minWidth: '8rem' }}></Column>
            <Column field="name" header="EMPRESA / RAZÓN SOCIAL" className="font-semibold text-slate-800 text-[14px]" style={{ width: '25%', minWidth: '14rem' }}></Column>
            <Column header="CONTACTO" body={contactTemplate} style={{ width: '25%', minWidth: '12rem' }}></Column>
            <Column field="shipping_address" header="DIRECCIÓN DE DESPACHO" className="text-slate-500 font-medium text-xs truncate max-w-[200px]" style={{ width: '20%' }}></Column>
            <Column header="TASA DE PRECIO & ACCIÓN" body={actionTemplate} style={{ width: '15%', minWidth: '22rem' }}></Column>
          </DataTable>
        </div>
      </div>
    </div>
  );
}
