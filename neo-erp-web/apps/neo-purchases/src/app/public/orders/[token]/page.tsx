'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Dialog } from 'primereact/dialog';
import api from '@/lib/api';

export default function PublicOrderPortalPage() {
  const params = useParams();
  const token = params.token as string;

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/public/orders/${token}`);
      setOrder(res.data);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || 'No se pudo cargar la orden de compra. Verifique el enlace o intente más tarde.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchOrder();
    }
  }, [token]);

  const handleDownloadPdf = () => {
    if (!token) return;
    const url = `${api.defaults.baseURL}/public/orders/${token}/pdf`;
    window.open(url, '_blank');
  };

  const handleAcceptOrder = async () => {
    try {
      setAccepting(true);
      await api.post(`/public/orders/${token}/accept`);
      setShowConfirmDialog(false);
      // Reload order status
      await fetchOrder();
    } catch (err: any) {
      alert('Error al aceptar la orden: ' + (err.response?.data?.detail || err.message));
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4">
        <i className="pi pi-spin pi-spinner text-4xl text-blue-600"></i>
        <span className="text-slate-500 font-bold text-sm tracking-wider">CARGANDO ORDEN DE COMPRA...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6">
        <div className="bg-white p-8 rounded-3xl border border-rose-100 shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 border border-rose-100">
            <i className="pi pi-exclamation-triangle"></i>
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Error de Enlace</h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">{error}</p>
          <Button label="Volver a Intentar" icon="pi pi-refresh" onClick={fetchOrder} className="w-full !rounded-xl !bg-slate-800 hover:!bg-slate-900 border-none font-bold py-3" />
        </div>
      </div>
    );
  }

  const formattedDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const isAccepted = order?.accepted_by_supplier_at != null;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Brand Header */}
      <header className="bg-slate-900 text-white py-4 px-6 md:px-12 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white text-lg font-black shadow-lg shadow-blue-500/25">M</div>
          <span className="font-extrabold text-lg tracking-wider">MORPHEUS<span className="text-blue-500 font-normal text-xs ml-1">Proveedor</span></span>
        </div>
        <div className="flex items-center gap-2 bg-slate-800 px-4 py-1.5 rounded-full border border-slate-700/60 text-xs font-semibold text-slate-300">
          <i className="pi pi-lock text-[10px] text-blue-400"></i> Portal de Aceptación Seguro
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1200px] mx-auto px-4 md:px-6 mt-8 animate-fade-in">
        {/* Status Alert Banner */}
        {isAccepted ? (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-5 rounded-2xl mb-6 flex items-start gap-4 shadow-sm">
            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-xl shrink-0 border border-emerald-200">
              <i className="pi pi-check-circle"></i>
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight text-emerald-950">Orden de Compra Aceptada</h3>
              <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
                Confirmaste la aceptación de esta ODC el <strong>{formattedDate(order.accepted_by_supplier_at)}</strong>. Ya hemos notificado al analista de compras para coordinar el despacho. ¡Muchas gracias!
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 p-5 rounded-2xl mb-6 flex items-start gap-4 shadow-sm">
            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xl shrink-0 border border-blue-200">
              <i className="pi pi-info-circle"></i>
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight text-blue-950">Firma / Conformidad Pendiente</h3>
              <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                Por favor, revise el listado de insumos y los costos acordados. Al hacer clic en el botón <strong>"Aceptar Orden"</strong> quedará constancia formal del recibo y aceptación de la misma.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Order Details Column */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Card className="!rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/30 overflow-hidden">
              {/* ODC Basic Info */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-5 mb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-slate-100 text-slate-700 font-mono text-xs font-bold border rounded-lg">ODC</span>
                    <h1 className="text-2xl font-black text-slate-800 m-0">{order.reference}</h1>
                  </div>
                  <p className="text-slate-400 text-xs mt-1 font-medium">Emitida el {formattedDate(order.created_at)}</p>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold mt-1 border ${
                    isAccepted 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                      : 'bg-amber-50 text-amber-700 border-amber-100'
                  }`}>
                    {isAccepted ? 'Confirmada / Aceptada' : 'Pendiente de Aceptación'}
                  </span>
                </div>
              </div>

              {/* Supplier & Destination Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Proveedor</span>
                  <span className="font-extrabold text-sm text-slate-800">{order.supplier_name}</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Destino / Sucursal de Entrega</span>
                  <span className="font-extrabold text-sm text-slate-800">{order.dest_facility_name}</span>
                </div>
              </div>

              {/* Items List */}
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 mt-6">Resumen de Insumos Solicitados</h3>
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                <DataTable value={order.lines} responsiveLayout="scroll" className="p-datatable-sm text-xs">
                  <Column header="SKU / CÓDIGO" field="variant_sku" bodyClassName="font-mono font-bold text-indigo-700" className="w-[20%]" />
                  <Column header="PRODUCTO / ARTÍCULO" field="variant_name" bodyClassName="font-bold text-slate-700" className="w-[40%]" />
                  <Column header="EMPAQUE" field="packaging_name" bodyClassName="font-medium text-slate-500" className="w-[15%]" />
                  <Column header="CANTIDAD" field="qty_ordered" bodyClassName="font-extrabold text-slate-800 text-center" alignHeader="center" className="w-[10%]" />
                  <Column header="COSTO UNIT." body={(r) => `$${Number(r.unit_cost).toFixed(2)}`} bodyClassName="font-bold text-slate-600 text-right" alignHeader="right" className="w-[15%]" />
                  <Column header="TOTAL" body={(r) => `$${(Number(r.qty_ordered) * Number(r.unit_cost)).toFixed(2)}`} bodyClassName="font-black text-slate-800 text-right" alignHeader="right" className="w-[15%]" />
                </DataTable>
              </div>
            </Card>
          </div>

          {/* Totals & Quick Actions Column */}
          <div className="flex flex-col gap-6">
            {/* Totals Card */}
            <Card className="!rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/30 overflow-hidden bg-slate-900 text-white">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumen Financiero</span>
              <div className="flex justify-between items-baseline mt-4 border-b border-slate-800 pb-3">
                <span className="text-slate-400 text-xs font-semibold">Subtotal</span>
                <span className="font-extrabold text-sm">${Number(order.total_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-baseline mt-3 border-b border-slate-800 pb-3">
                <span className="text-slate-400 text-xs font-semibold">Tributos (Exento/Gravado)</span>
                <span className="font-extrabold text-sm">$0.00</span>
              </div>
              <div className="flex justify-between items-center mt-4">
                <span className="text-white text-xs font-black uppercase tracking-wider">Total Acordado</span>
                <span className="text-2xl font-black text-blue-400">${Number(order.total_amount).toFixed(2)}</span>
              </div>
            </Card>

            {/* Actions Card */}
            <Card className="!rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/30">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Acciones de Orden</h3>
              <div className="flex flex-col gap-3">
                <Button 
                  label="Descargar PDF Oficial" 
                  icon="pi pi-file-pdf" 
                  onClick={handleDownloadPdf} 
                  className="w-full !rounded-xl !bg-slate-100 hover:!bg-slate-200 !text-slate-700 !border-none font-bold py-3.5" 
                />
                
                {!isAccepted && (
                  <Button 
                    label="Aceptar Orden" 
                    icon="pi pi-check" 
                    onClick={() => setShowConfirmDialog(true)} 
                    className="w-full !rounded-xl !bg-emerald-600 hover:!bg-emerald-700 border-none font-bold py-3.5 shadow-md shadow-emerald-500/20" 
                  />
                )}
              </div>
            </Card>

            {/* Seen Telemetry Log */}
            {order.seen_by_supplier_at && (
              <div className="bg-slate-100 border border-slate-200 p-4 rounded-2xl text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Telemetría de Lectura</span>
                <p className="text-[10px] font-bold text-slate-600 mt-1">
                  Enlace visualizado el: {formattedDate(order.seen_by_supplier_at)}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Confirmation Dialog */}
      <Dialog 
        header="Confirmar Aceptación de ODC" 
        visible={showConfirmDialog} 
        style={{ width: '90%', maxWidth: '400px' }} 
        onHide={() => setShowConfirmDialog(false)}
        className="!rounded-3xl overflow-hidden [&_.p-dialog-header]:!pt-6 [&_.p-dialog-header]:!px-6 [&_.p-dialog-content]:!px-6 [&_.p-dialog-footer]:!pb-6 [&_.p-dialog-footer]:!px-6"
        footer={
          <div className="flex justify-end gap-2 mt-4">
            <Button label="Cancelar" icon="pi pi-times" outlined onClick={() => setShowConfirmDialog(false)} className="!rounded-xl font-bold py-2 px-4 !text-slate-600 !border-slate-200" />
            <Button label="Aceptar Orden" icon="pi pi-check" loading={accepting} onClick={handleAcceptOrder} className="!rounded-xl font-bold py-2 px-4 !bg-emerald-600 hover:!bg-emerald-700 border-none" />
          </div>
        }
      >
        <div className="text-slate-600 text-sm leading-relaxed">
          Al confirmar, quedará registrado que el proveedor **{order?.supplier_name}** ha revisado los artículos y costos de la orden **{order?.reference}** y está de acuerdo en proceder con el despacho.
        </div>
      </Dialog>
    </div>
  );
}
