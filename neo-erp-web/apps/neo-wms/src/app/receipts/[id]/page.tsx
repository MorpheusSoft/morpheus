"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Calendar } from 'primereact/calendar';
import { Dropdown } from 'primereact/dropdown';
import { Dialog } from 'primereact/dialog';
import { Tag } from 'primereact/tag';
import api from '@/lib/api';
import { isWeightUom, sanitizeQuantity } from '@/lib/uom';
import { format } from 'date-fns';

export default function ReceiptExecutionPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id;
  
  const [order, setOrder] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const linesRef = useRef<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useRef<Toast>(null);

  // Warehouse, Invoice & Date selection
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [receiptDate, setReceiptDate] = useState<Date | null>(new Date());

  // Dialogs
  const [ticketDialogVisible, setTicketDialogVisible] = useState(false);
  const [ticketData, setTicketData] = useState<any>(null);

  const [discrepancyDialogVisible, setDiscrepancyDialogVisible] = useState(false);
  const [discrepancyLine, setDiscrepancyLine] = useState<any>(null);
  const [discrepancyDamagedQty, setDiscrepancyDamagedQty] = useState<number>(0);
  const [discrepancyReason, setDiscrepancyReason] = useState<string>('');

  const [unplannedDialogVisible, setUnplannedDialogVisible] = useState(false);
  const [productSearch, setProductSearch] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [lineFilter, setLineFilter] = useState<string>('');

  // Clara Invoice Upload & 3-Way Match Modal State
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [confirmingReconciliation, setConfirmingReconciliation] = useState(false);

  // Control de Reverso de Recepción y Auditoría
  const [currentUser, setCurrentUser] = useState<any>(null);

  const formatReceiptQty = (val: number | string | null | undefined, uom?: string | null): string => {
    const num = Number(val || 0);
    if (isNaN(num)) return isWeightUom(uom) ? '0.000' : '0';
    return isWeightUom(uom) ? num.toFixed(3) : String(Math.round(num));
  };
  const [orderAuditLogs, setOrderAuditLogs] = useState<any[]>([]);
  const [reversalModalVisible, setReversalModalVisible] = useState(false);
  const [reversalReason, setReversalReason] = useState<string>('ERROR_DIGITACION');
  const [reversalNotes, setReversalNotes] = useState<string>('');
  const [submittingReversal, setSubmittingReversal] = useState(false);
  const [rejectReversalModalVisible, setRejectReversalModalVisible] = useState(false);
  const [rejectReversalReason, setRejectReversalReason] = useState<string>('');
  const [auditSnapshotModalLog, setAuditSnapshotModalLog] = useState<any>(null);

  const REVERSAL_REASON_OPTIONS = [
    { label: 'Error de digitación de cantidades en conteo', value: 'ERROR_DIGITACION' },
    { label: 'Omisión de renglón / producto dejado en 0 por error', value: 'OMISION_RENGLON' },
    { label: 'Factura o Guía de Despacho equivocada', value: 'FACTURA_EQUIVOCADA' },
    { label: 'Error en factor de empaque / unidad de medida', value: 'ERROR_EMPAQUE' },
    { label: 'Diferencia detectada en revisión post-descarga', value: 'REVISION_POST_DESCARGA' },
    { label: 'Otro motivo justificado', value: 'OTRO' },
  ];

  const canApproveReversal = React.useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.is_superuser) return true;
    for (const r of (currentUser.roles || [])) {
      const roleName = String(r.name || '').trim().toUpperCase();
      if (['ADMIN', 'SUPERVISOR', 'GERENTE', 'MANAGER', 'ADMINISTRADOR', 'JEFE DE ALMACEN', 'JEFE DE LOGISTICA'].includes(roleName)) {
        return true;
      }
      const perms = r.permissions || {};
      for (const mk of ['neo_wms', 'neo_logistics', 'wms', 'logistics']) {
        const recPerms = perms?.[mk]?.receipts;
        if (recPerms && (recPerms.approve || recPerms.admin)) return true;
      }
    }
    return false;
  }, [currentUser]);

  const isOrderConciliated = React.useMemo(() => {
    if (!order) return false;
    return (
      order.status === 'conciliated' ||
      Boolean(order.conciliated_at) ||
      ['MATCH_EXACT', 'MATCH_WITH_DEBIT_NOTE'].includes(order.reconciliation_status)
    );
  }, [order]);

  const canReverseReceipt = React.useMemo(() => {
    if (!order) return false;
    return order.status === 'received' && !isOrderConciliated;
  }, [order, isOrderConciliated]);

  const fetchOrderAuditLogs = async () => {
    if (!orderId) return;
    try {
      const res = await api.get(`/wms/audit-logs?order_id=${orderId}&limit=50`);
      setOrderAuditLogs(res.data || []);
    } catch (e) {
      console.error('Error cargando bitácora de auditoría:', e);
    }
  };

  const handleRequestReversal = async (directApprove: boolean = false) => {
    if (!reversalReason || !reversalNotes.trim()) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Justificación requerida',
        detail: 'Debe seleccionar una causal y describir detalladamente el motivo del reverso.',
      });
      return;
    }
    setSubmittingReversal(true);
    try {
      if (directApprove && canApproveReversal) {
        const res = await api.post(`/wms/receipts/${orderId}/approve-reversal`, {
          reason: reversalReason,
          notes: reversalNotes.trim(),
          approval_notes: 'Autorizado y ejecutado directamente por Supervisión/Administración.',
        });
        toast.current?.show({
          severity: 'success',
          summary: 'Recepción Reversada',
          detail: res.data.message,
          life: 6000,
        });
      } else {
        const res = await api.post(`/wms/receipts/${orderId}/request-reversal`, {
          reason: reversalReason,
          notes: reversalNotes.trim(),
        });
        toast.current?.show({
          severity: 'info',
          summary: 'Solicitud Enviada',
          detail: res.data.message,
          life: 5000,
        });
      }
      setReversalModalVisible(false);
      setReversalNotes('');
      await fetchOrder();
      await fetchOrderAuditLogs();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'No se pudo procesar la solicitud de reverso.';
      toast.current?.show({ severity: 'error', summary: 'Error', detail: msg, life: 6000 });
    } finally {
      setSubmittingReversal(false);
    }
  };

  const handleApprovePendingReversal = async () => {
    setSubmittingReversal(true);
    try {
      const res = await api.post(`/wms/receipts/${orderId}/approve-reversal`, {
        approval_notes: 'Solicitud del analista verificada y aprobada por supervisión.',
      });
      toast.current?.show({
        severity: 'success',
        summary: 'Reverso Aprobado y Ejecutado',
        detail: res.data.message,
        life: 6000,
      });
      await fetchOrder();
      await fetchOrderAuditLogs();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'No se pudo aprobar el reverso.';
      toast.current?.show({ severity: 'error', summary: 'Error', detail: msg, life: 6000 });
    } finally {
      setSubmittingReversal(false);
    }
  };

  const handleRejectPendingReversal = async () => {
    if (!rejectReversalReason.trim()) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Motivo requerido',
        detail: 'Indique el motivo por el cual se rechaza el reverso.',
      });
      return;
    }
    setSubmittingReversal(true);
    try {
      const res = await api.post(`/wms/receipts/${orderId}/reject-reversal`, {
        rejection_reason: rejectReversalReason.trim(),
      });
      toast.current?.show({
        severity: 'warn',
        summary: 'Solicitud Rechazada',
        detail: res.data.message,
      });
      setRejectReversalModalVisible(false);
      setRejectReversalReason('');
      await fetchOrder();
      await fetchOrderAuditLogs();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'No se pudo rechazar la solicitud.';
      toast.current?.show({ severity: 'error', summary: 'Error', detail: msg });
    } finally {
      setSubmittingReversal(false);
    }
  };

  const handleUploadInvoiceToClara = async () => {
    if (!invoiceFile) {
      toast.current?.show({ severity: 'warn', summary: 'Archivo requerido', detail: 'Por favor selecciona la foto o PDF de la factura.' });
      return;
    }
    setOcrLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', invoiceFile);
      const res = await api.post(`/reconciliation/${orderId}/upload-invoice`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setOcrResult(res.data);
      toast.current?.show({ 
        severity: 'success', 
        summary: 'OCR Completado por Clara', 
        detail: `Factura ${res.data.invoice_number || ''} procesada. Estado: ${res.data.reconciliation_status}` 
      });
      fetchOrder();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Error procesando la factura con Clara.';
      toast.current?.show({ severity: 'error', summary: 'Error OCR', detail: msg });
    } finally {
      setOcrLoading(false);
    }
  };

  const handleConfirmReconciliation = async () => {
    setConfirmingReconciliation(true);
    try {
      const res = await api.post(`/reconciliation/${orderId}/confirm-reconciliation`);
      toast.current?.show({ severity: 'success', summary: 'Orden Conciliada', detail: res.data.message });
      setInvoiceModalVisible(false);
      fetchOrder();
    } catch (err: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo confirmar la conciliación.' });
    } finally {
      setConfirmingReconciliation(false);
    }
  };

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/purchase-orders/${orderId}/details`);
      setOrder(res.data);
      if (res.data.invoice_number) setInvoiceNumber(res.data.invoice_number);
      if (res.data.invoice_date) setReceiptDate(new Date(res.data.invoice_date + 'T00:00:00'));
      
      const alreadyReceived = ['received', 'conciliated'].includes(res.data.status);
      const initialLines = res.data.lines.map((l: any) => ({
          ...l,
          received_qty: alreadyReceived ? Number(l.received_base_qty ?? 0) : Number(l.expected_base_qty ?? 0),
          damaged_qty: 0,
          lot_number: '',
          expiration_date: null,
          is_unplanned: false
      }));
      linesRef.current = initialLines;
      setLines(initialLines);

      // Cargar almacenes de la sucursal de destino
      const facilityId = res.data.dest_facility_id || res.data.dest_facility?.id;
      try {
          const whRes = await api.get('/warehouses/');
          const allWhs = whRes.data || [];
          const facilityWhs = facilityId 
              ? allWhs.filter((w: any) => Number(w.facility_id) === Number(facilityId) && !w.is_scrap)
              : allWhs.filter((w: any) => !w.is_scrap);
          
          const finalWhs = facilityWhs.length > 0 ? facilityWhs : allWhs;
          setWarehouses(finalWhs);
          if (finalWhs.length > 0) {
              setSelectedWarehouseId(finalWhs[0].id);
          }
      } catch(err) {
          console.error("Error cargando almacenes:", err);
      }
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar la orden.' });
    }
    setLoading(false);
  };

  useEffect(() => {
    api.get('/users/me').then(res => setCurrentUser(res.data)).catch(() => {});
    if (orderId) {
      fetchOrder();
      fetchOrderAuditLogs();
    }
  }, [orderId]);

  const handleQtyChange = (rowIndex: number, val: any) => {
      setLines(prev => {
          const updated = [...prev];
          const row = updated[rowIndex];
          if (!row) return prev;
          let parsed: any = '';
          if (val === 0 || val === '0') {
              parsed = 0;
          } else if (val !== '' && val !== null && val !== undefined && !isNaN(parseFloat(String(val)))) {
              parsed = sanitizeQuantity(val, row.uom_base);
          }
          updated[rowIndex] = { ...row, received_qty: parsed };
          linesRef.current = updated;
          return updated;
      });
  };

  const handleSetAllZero = () => {
      setLines(prev => {
          const updated = prev.map(l => ({ ...l, received_qty: 0 }));
          linesRef.current = updated;
          return updated;
      });
  };

  const handleRestoreExpected = () => {
      setLines(prev => {
          const updated = prev.map(l => ({ ...l, received_qty: Number(l.expected_base_qty ?? 0) }));
          linesRef.current = updated;
          return updated;
      });
  };

  const handleTextChange = (rowIndex: number, field: string, val: string) => {
      setLines(prev => {
          const updated = [...prev];
          if (!updated[rowIndex]) return prev;
          updated[rowIndex] = { ...updated[rowIndex], [field]: val };
          linesRef.current = updated;
          return updated;
      });
  };

  const handleDateChange = (rowIndex: number, val: Date | null) => {
      setLines(prev => {
          const updated = [...prev];
          if (!updated[rowIndex]) return prev;
          updated[rowIndex] = { ...updated[rowIndex], expiration_date: val };
          linesRef.current = updated;
          return updated;
      });
  };

  const handleSearchProducts = async (overrideQuery?: string) => {
      const q = (overrideQuery !== undefined ? overrideQuery : productSearch).trim();
      if (!q) {
          setSearchResults([]);
          return;
      }
      setSearchingProducts(true);
      try {
          const res = await api.get(`/products/selector?q=${encodeURIComponent(q)}&limit=100`);
          const list = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.items || []);
          setSearchResults(list);
      } catch (e) {
          toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Fallo al buscar productos.' });
      }
      setSearchingProducts(false);
  };

  const addUnplannedProduct = (variant: any) => {
      const newLine = {
          id: 0,
          variant_id: variant.variant_id || variant.value || variant.id,
          sku: variant.sku || 'N/A',
          barcode: variant.barcode || null,
          plu: variant.plu || null,
          product_name: variant.product_name || variant.name || 'Producto Inesperado',
          uom_base: variant.uom_base || 'UND',
          expected_base_qty: 0,
          received_qty: 1,
          damaged_qty: 0,
          lot_number: '',
          expiration_date: null,
          is_unplanned: true
      };
      setLines(prev => {
          const updated = [...prev, newLine];
          linesRef.current = updated;
          return updated;
      });
      setUnplannedDialogVisible(false);
      toast.current?.show({ severity: 'info', summary: 'Producto Inesperado Agregado', detail: `${newLine.product_name} añadido al manifiesto.` });
  };

  const openTicketDialog = async () => {
      try {
          const res = await api.get(`/wms/receipts/${orderId}/ticket-80mm`);
          setTicketData(res.data);
          setTicketDialogVisible(true);
      } catch(e) {
          toast.current?.show({ severity: 'error', summary: 'Error Ticket', detail: 'No se pudo generar el ticket de 80mm.' });
      }
  };

  const openDiscrepancyDialog = (line: any) => {
      setDiscrepancyLine(line);
      setDiscrepancyDamagedQty(0);
      setDiscrepancyReason('');
      setDiscrepancyDialogVisible(true);
  };

  const submitDiscrepancy = async () => {
      if (!discrepancyLine || discrepancyDamagedQty <= 0) {
          toast.current?.show({ severity: 'warn', summary: 'Cantidad inválida', detail: 'Ingrese una cantidad averiada mayor a 0.' });
          return;
      }
      const cleanDamagedQty = sanitizeQuantity(discrepancyDamagedQty, discrepancyLine.uom_base);
      try {
          await api.post(`/wms/receipts/${orderId}/discrepancy`, {
              variant_id: discrepancyLine.variant_id,
              warehouse_id: selectedWarehouseId,
              damaged_qty: cleanDamagedQty,
              reason: discrepancyReason || 'Avería reportada en muelle',
              lot_number: discrepancyLine.lot_number || null,
              reject_at_dock: true
          });
          
          setLines(prev => {
              const updated = prev.map(l => {
                  if (l.variant_id === discrepancyLine.variant_id) {
                      const exp = Number(l.expected_base_qty || 0);
                      const curRec = Number(l.received_qty || 0);
                      const newRec = (curRec + cleanDamagedQty > exp && exp > 0)
                          ? sanitizeQuantity(Math.max(0, exp - cleanDamagedQty), l.uom_base)
                          : curRec;
                      return { 
                          ...l, 
                          received_qty: newRec,
                          damaged_qty: cleanDamagedQty,
                          rejection_reason: discrepancyReason || 'Avería reportada en muelle',
                          reject_at_dock: true
                      };
                  }
                  return l;
              });
              linesRef.current = updated;
              return updated;
          });

          setDiscrepancyDialogVisible(false);
          toast.current?.show({ severity: 'success', summary: 'Rechazo Registrado', detail: `${cleanDamagedQty} unds devueltas al chofer registradas en muelle.` });
      } catch (e: any) {
          const detailMsg = typeof e.response?.data?.detail === 'string' 
              ? e.response.data.detail 
              : Array.isArray(e.response?.data?.detail)
                  ? e.response.data.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ')
                  : e.message || 'No se pudo registrar el rechazo.';
          toast.current?.show({ severity: 'error', summary: 'Error', detail: detailMsg });
      }
  };

  const confirmReceipt = async () => {
      setSaving(true);
      try {
          const currentLines = linesRef.current.length > 0 ? linesRef.current : lines;
          const payload = {
              warehouse_id: selectedWarehouseId,
              invoice_number: invoiceNumber,
              receipt_date: receiptDate ? format(receiptDate, 'yyyy-MM-dd') : null,
              lines: currentLines.map(l => ({
                  po_line_id: l.id > 0 ? l.id : null,
                  variant_id: l.variant_id,
                  received_qty: sanitizeQuantity(l.received_qty, l.uom_base),
                  damaged_qty: sanitizeQuantity(l.damaged_qty || 0, l.uom_base),
                  reject_at_dock: l.reject_at_dock !== false,
                  rejection_reason: l.rejection_reason || null,
                  lot_number: l.lot_number || null,
                  expiration_date: l.expiration_date ? format(l.expiration_date, 'yyyy-MM-dd') : null
              }))
          };
          const res = await api.post(`/wms/receipts/${orderId}`, payload);
          toast.current?.show({ 
              severity: 'success', 
              summary: 'Recepción Confirmada', 
              detail: `Mercancía ingresada a inventario. Abriendo Acta Definitiva...` 
          });
          
          setOrder((prev: any) => ({ ...prev, status: 'received', reversal_status: 'NONE' }));
          setInvoiceModalVisible(true);
          setTimeout(() => fetchOrderAuditLogs(), 600);
      } catch(e: any) {
          const detailMsg = typeof e.response?.data?.detail === 'string' 
              ? e.response.data.detail 
              : Array.isArray(e.response?.data?.detail)
                  ? e.response.data.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ')
                  : e.message || 'Fallo de conexión WMS';
          toast.current?.show({ severity: 'error', summary: 'Error de Recepción', detail: detailMsg });
      }
      setSaving(false);
  };

  if (loading && !order) return <div className="p-8 text-slate-500 font-bold flex items-center"><i className="pi pi-spin pi-spinner text-2xl mr-3 text-blue-500"></i> Localizando Manifiesto WMS...</div>;
  if (!order) return <div className="p-8 text-red-500 font-black text-2xl">ODC no encontrada en el Muelle.</div>;

  const selectedWarehouse = warehouses.find(w => w.id === selectedWarehouseId);
  const isReadOnly = order?.status === 'received' || order?.status === 'conciliated';

  return (
    <div className="p-4 sm:p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />
      
      {/* HEADER EJECUTIVO CIEGO CON SELECCIÓN DE ALMACÉN */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>
          <div>
              <div className="flex items-center gap-3 mb-1">
                 <Button icon="pi pi-arrow-left" rounded text aria-label="Volver" onClick={() => router.push('/receipts')} />
                 <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
                    <i className="pi pi-box mr-3 text-blue-500"></i>Recepcionando: {order.reference}
                 </h1>
              </div>
              <p className="text-slate-500 ml-12 text-sm mt-2 flex flex-col sm:flex-row gap-4">
                  <span><i className="pi pi-building mr-2 text-slate-400"></i> Proveedor: <span className="font-bold text-slate-700">{order.supplier.name}</span></span>
                  <span><i className="pi pi-clock mr-2 text-slate-400"></i> Vencimiento ODC: <span className="font-bold text-slate-700">{order.expiration_date ? format(new Date(order.expiration_date + 'T00:00:00'), 'dd/MM/yyyy') : 'Sin Límite'}</span></span>
              </p>
          </div>
          
          {/* Opciones de Impresión y Conciliación */}
          <div className="flex flex-col sm:flex-row items-end gap-3">
              {isReadOnly && (
                  <Button 
                      label="Conciliar con Clara 🤖" 
                      icon="pi pi-sparkles" 
                      severity="info" 
                      onClick={() => setInvoiceModalVisible(true)} 
                      className="font-bold bg-blue-600 hover:bg-blue-700 text-white border-none shadow-sm text-xs px-3 py-2" 
                  />
              )}
              <Button 
                  icon="pi pi-print" 
                  rounded 
                  severity="secondary" 
                  outlined 
                  disabled={isReadOnly}
                  onClick={openTicketDialog} 
                  tooltip={isReadOnly ? "Recepción completada (Use 'Imprimir Acta Definitiva')" : "Imprimir Hoja de Conteo de Descarga"} 
                  tooltipOptions={{ position: 'top' }}
                  className="font-bold border-slate-300 text-slate-700 hover:bg-slate-100 shadow-sm disabled:opacity-40 cursor-not-allowed"
              />
          </div>
      </div>

      {/* CONTROL DE DATOS DE RECEPCIÓN (DEPÓSITO, FACTURA / GUÍA Y FECHA DE RECEPCIÓN) */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col gap-1 relative">
           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">1. Depósito / Almacén Destino (*)</label>
           <Dropdown 
               value={selectedWarehouseId} 
               options={warehouses.map(w => ({ label: w.name + (w.requires_dock_staging ? ' (CD - Bahía)' : ' (Directo)'), value: w.id }))} 
               onChange={(e) => setSelectedWarehouseId(e.value)} 
               placeholder="Seleccionar Depósito"
               disabled={isReadOnly}
               className="w-full text-xs font-bold border-slate-200"
           />
        </div>

        <div className="flex flex-col gap-1">
           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">2. N° Factura / Guía de Despacho</label>
           <InputText 
               value={invoiceNumber} 
               onChange={(e) => setInvoiceNumber(e.target.value)} 
               placeholder="Ej: FACT-99012" 
               disabled={isReadOnly}
               className="w-full text-xs font-bold border-slate-200"
           />
        </div>

        <div className="flex flex-col gap-1">
           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">3. Fecha de Recepción (*)</label>
           <Calendar 
               value={receiptDate} 
               onChange={(e) => setReceiptDate(e.value as Date)} 
               dateFormat="dd/mm/yy" 
               placeholder="Seleccionar Fecha"
               disabled={isReadOnly}
               className="w-full p-inputtext-sm text-xs font-bold"
           />
        </div>
      </div>

      {/* BANNER DE RECEPCIÓN CERRADA Y CONFIRMADA */}
      {isReadOnly && (
        <div className="bg-emerald-50 border-2 border-emerald-500 text-emerald-800 p-5 rounded-2xl mb-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <i className="pi pi-check-circle text-3xl text-emerald-600"></i>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black text-lg text-emerald-900">RECEPCIÓN REGISTRADA Y ASENTADA EN INVENTARIO</h3>
                {order?.reconciliation_status === 'MATCH_EXACT' && (
                  <Tag value="✓ CONCILIADA 100%" severity="success" className="font-black text-[10px]" />
                )}
                {order?.reconciliation_status === 'MATCH_WITH_DEBIT_NOTE' && (
                  <Tag value={`⚠️ NOTA DÉBITO: $${Number(order.debit_note_amount || 0).toFixed(2)}`} severity="warning" className="font-black text-[10px]" />
                )}
                {Number(order?.reversal_count || 0) > 0 && (
                  <Tag value={`🔄 REVERSADA ${order.reversal_count}x`} severity="info" className="font-black text-[10px]" />
                )}
              </div>
              <p className="text-xs text-emerald-700 font-medium mt-0.5">
                {isOrderConciliated
                  ? 'Esta orden ya fue conciliada financieramente (3-Way Match). El reverso de recepción está bloqueado por seguridad contable.'
                  : 'Esta orden fue recibida y cerrada. Si requiere corregir el conteo antes de conciliar, solicite un Reverso de Recepción.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {canReverseReceipt && order?.reversal_status !== 'PENDING_APPROVAL' && (
              <Button
                label={canApproveReversal ? 'Reversar Recepción 🔄' : 'Solicitar Reverso 🔄'}
                icon="pi pi-undo"
                severity="warning"
                onClick={() => setReversalModalVisible(true)}
                className="font-black bg-amber-600 hover:bg-amber-700 text-white border-none px-4 py-3 shadow-md"
              />
            )}
            {isOrderConciliated && (
              <Button
                label="Reverso Bloqueado (Conciliada)"
                icon="pi pi-lock"
                severity="secondary"
                disabled
                tooltip="Solo se pueden reversar ODC que no estén conciliadas"
                className="font-bold px-4 py-3 opacity-70"
              />
            )}
            {order?.reversal_status !== 'PENDING_APPROVAL' && (
              <Button 
                  label="Conciliar Factura con Clara 🤖" 
                  icon="pi pi-sparkles" 
                  severity="info" 
                  onClick={() => setInvoiceModalVisible(true)} 
                  className="font-black bg-blue-600 hover:bg-blue-700 text-white border-none px-4 py-3 shadow-md" 
              />
            )}
            <Button 
                label="Imprimir Acta Definitiva 🖨️" 
                icon="pi pi-print" 
                severity="success" 
                onClick={openTicketDialog} 
                className="font-bold bg-emerald-600 text-white border-none px-6 py-3 shadow-md hover:bg-emerald-700" 
            />
          </div>
        </div>
      )}

      {/* BANNER DE SOLICITUD DE REVERSO PENDIENTE DE APROBACIÓN */}
      {isReadOnly && order?.reversal_status === 'PENDING_APPROVAL' && (
        <div className="bg-amber-50 border-2 border-amber-500 text-amber-950 p-5 rounded-2xl mb-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 shadow-md">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow">
              <i className="pi pi-exclamation-triangle text-xl"></i>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black text-base text-amber-900 uppercase tracking-wide">
                  Solicitud de Reverso de Recepción Pendiente de Aprobación
                </h3>
                <Tag value={order.reversal_reason || 'CORRECCIÓN'} severity="warning" className="font-black text-[10px]" />
              </div>
              <p className="text-xs text-amber-900 mt-1">
                <strong>Solicitado por:</strong> {order.reversal_requested_by_name || 'Analista de Almacén'}{' '}
                {order.reversal_requested_at ? `el ${format(new Date(order.reversal_requested_at), 'dd/MM/yyyy HH:mm')}` : ''}
              </p>
              <p className="text-xs text-amber-800 mt-1 bg-white/80 px-3 py-1.5 rounded-lg border border-amber-300 font-medium">
                <strong>Justificación:</strong> {order.reversal_notes || 'Sin detalle adicional'}
              </p>
            </div>
          </div>

          {canApproveReversal ? (
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                label="Rechazar Solicitud"
                icon="pi pi-times"
                severity="danger"
                outlined
                disabled={submittingReversal}
                onClick={() => setRejectReversalModalVisible(true)}
                className="font-bold px-4 py-2.5 bg-white"
              />
              <Button
                label="Aprobar Reverso y Reabrir ODC"
                icon="pi pi-check-circle"
                severity="success"
                loading={submittingReversal}
                onClick={handleApprovePendingReversal}
                className="font-black bg-indigo-600 hover:bg-indigo-700 text-white border-none px-5 py-2.5 shadow-md"
              />
            </div>
          ) : (
            <div className="px-4 py-2 rounded-xl bg-amber-200/70 border border-amber-400 text-amber-900 text-xs font-bold">
              ⏳ En espera de autorización por un Supervisor o Administrador
            </div>
          )}
        </div>
      )}

      {/* BANNER INFORMATIVO SI UNA SOLICITUD PREVIA FUE RECHAZADA */}
      {isReadOnly && order?.reversal_status === 'REJECTED' && order?.reversal_rejection_reason && (
        <div className="bg-rose-50 border border-rose-300 text-rose-900 p-4 rounded-2xl mb-6 flex items-center justify-between gap-4 text-xs">
          <div>
            <span className="font-black uppercase">Última solicitud de reverso rechazada por supervisión: </span>
            <span className="font-medium">{order.reversal_rejection_reason}</span>
            {order.reversal_approved_by_name && (
              <span className="text-rose-700 ml-2 font-bold">({order.reversal_approved_by_name})</span>
            )}
          </div>
        </div>
      )}

      {/* BANNER INFORMATIVO EN RECEPCIÓN REABIERTA TRAS REVERSO */}
      {!isReadOnly && Number(order?.reversal_count || 0) > 0 && (
        <div className="bg-indigo-50 border-2 border-indigo-400 text-indigo-950 p-4 rounded-2xl mb-6 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <i className="pi pi-history text-2xl text-indigo-600"></i>
            <div>
              <h4 className="font-black text-sm text-indigo-900 uppercase">
                ODC Reabierta por Reverso Aprobado (Reverso #{order.reversal_count})
              </h4>
              <p className="text-xs text-indigo-700">
                La recepción anterior fue anulada en Kardex y respaldada en el Log de Auditoría. Ingrese nuevamente el conteo físico correcto y confirme la recepción.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MATRIZ DE RECEPCIÓN (CIEGA) */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <h3 className="font-bold text-slate-700 tracking-tight flex items-center">
                <i className="pi pi-list mr-2 text-blue-500"></i>Manifiesto de Conteo Físico
                {selectedWarehouse?.requires_dock_staging && (
                    <Tag value="REGLA: INGRESO A BAHÍA (DOCK)" severity="warning" className="ml-3 font-extrabold text-[10px]" />
                )}
            </h3>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                <div className="relative w-full sm:w-64">
                    <i className="pi pi-barcode text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none z-10" />
                    <InputText
                        value={lineFilter}
                        onChange={(e) => setLineFilter(e.target.value)}
                        placeholder="Filtrar por Cód. Barra, PLU o Producto..."
                        className="p-inputtext-sm w-full text-xs !pl-9 rounded-lg border-slate-200"
                        style={{ paddingLeft: '2.25rem' }}
                    />
                </div>
                {!isReadOnly && (
                    <>
                        <Button
                            label="Todo en 0"
                            icon="pi pi-eraser"
                            severity="secondary"
                            outlined
                            size="small"
                            className="font-bold text-xs py-1.5 px-2.5"
                            tooltip="Poner todos los renglones en 0 para conteo ciego"
                            tooltipOptions={{ position: 'top' }}
                            onClick={handleSetAllZero}
                        />
                        <Button
                            label="Cargar Esperado"
                            icon="pi pi-refresh"
                            severity="secondary"
                            outlined
                            size="small"
                            className="font-bold text-xs py-1.5 px-2.5"
                            tooltip="Restaurar las cantidades esperadas de la ODC"
                            tooltipOptions={{ position: 'top' }}
                            onClick={handleRestoreExpected}
                        />
                        <Button 
                            label="Agregar Producto Inesperado" 
                            icon="pi pi-plus-circle" 
                            severity="info" 
                            text 
                            className="font-bold text-xs" 
                            onClick={() => setUnplannedDialogVisible(true)} 
                        />
                    </>
                )}
            </div>
        </div>
        
        <DataTable
          dataKey="id"
          value={lines.filter(r => {
            if (!lineFilter.trim()) return true;
            const q = lineFilter.trim().toLowerCase();
            return (
              (r.barcode && String(r.barcode).toLowerCase().includes(q)) ||
              (r.plu && String(r.plu).toLowerCase().includes(q)) ||
              (r.sku && String(r.sku).toLowerCase().includes(q)) ||
              (r.product_name && String(r.product_name).toLowerCase().includes(q))
            );
          })}
          emptyMessage="No hay productos para recibir."
          size="small"
          stripedRows
          rowHover
          className="text-sm"
        >
          <Column header="Cód. Barra / PLU" field="barcode" style={{ width: '155px', minWidth: '140px' }} body={r => {
              const primaryCode = r.barcode || r.plu || r.sku;
              const showPluSub = r.plu && r.plu !== primaryCode;
              return (
                  <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-800 font-bold border border-slate-200 w-fit">{primaryCode}</span>
                      {showPluSub && <span className="font-mono text-[10px] font-bold text-blue-600 pl-0.5">PLU: {r.plu}</span>}
                      {r.is_unplanned && <Tag value="INESPERADO" severity="danger" className="text-[8px] uppercase font-black w-fit" />}
                  </div>
              );
          }} />
          
          <Column header="Producto" field="product_name" body={r => <span className="font-bold text-slate-800">{r.product_name}</span>} />
          
          <Column header="Esperado (Base)" body={r => {
             const isWeight = isWeightUom(r.uom_base);
             const dec = isWeight ? 3 : 0;
             const val = Number(r.expected_base_qty) || 0;
             const uomLabel = r.uom_base || 'UND';
             return <span className="font-semibold text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-200">{val.toLocaleString('en-US', {minimumFractionDigits: dec, maximumFractionDigits: dec})} {uomLabel}</span>;
          }} align="right" />
          
          {/* CAMPOS INTERACTIVOS WMS */}
          <Column header="Físico Recibido" body={(r) => {
             const origIdx = lines.findIndex(item => item.id === r.id && item.variant_id === r.variant_id);
             const isWeight = isWeightUom(r.uom_base);
             const dec = isWeight ? 3 : 0;
             return (
                 <div className="flex justify-end">
                     <InputNumber 
                        value={r.received_qty === '' ? null : r.received_qty} 
                        onChange={(e) => handleQtyChange(origIdx, e.value === null ? '' : e.value)}
                        onValueChange={(e) => handleQtyChange(origIdx, e.value === null ? '' : e.value)}
                        min={0}
                        minFractionDigits={dec}
                        maxFractionDigits={dec}
                        step={isWeight ? 0.001 : 1}
                        disabled={isReadOnly}
                        inputClassName="w-24 text-right text-lg font-black p-2 rounded-lg border-2 border-blue-200 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 bg-blue-50/50 transition-all text-blue-700 shadow-inner disabled:bg-slate-100 disabled:border-slate-300 disabled:text-slate-700" 
                     />
                 </div>
             )
          }} align="right" />

          {/* BALANCE Y DISCREPANCIA */}
          <Column header="Estado Conteo" body={r => {
              const isWeight = isWeightUom(r.uom_base);
              const exp = Number(r.expected_base_qty) || 0;
              const rec = Number(r.received_qty) || 0;
              const dam = Number(r.damaged_qty) || 0;
              const diff = Number(((rec + dam) - exp).toFixed(isWeight ? 3 : 0));
              const diffFmt = formatReceiptQty(diff, r.uom_base);

              if (r.is_unplanned) return <Tag value="NO PLANIFICADO" severity="info" className="font-extrabold text-[9px]" />;
              if (diff === 0) return <Tag value="COMPLETO (OK)" severity="success" className="font-extrabold text-[9px]" />;
              if (diff > 0) return <Tag value={`SOBRANTE (+${diffFmt})`} severity="warning" className="font-extrabold text-[9px]" />;
              return <Tag value={`FALTANTE (${diffFmt})`} severity="danger" className="font-extrabold text-[9px]" />;
          }} align="center" />

          <Column header="Trazabilidad (Lote)" body={(r) => {
             const origIdx = lines.findIndex(item => item.id === r.id && item.variant_id === r.variant_id);
             return (
             <InputText 
                 value={r.lot_number} 
                 onChange={(e) => handleTextChange(origIdx, 'lot_number', e.target.value)} 
                 placeholder="Ej: L-204" 
                 disabled={isReadOnly}
                 className="w-28 text-xs font-bold text-center uppercase disabled:bg-slate-100 disabled:border-slate-300" 
             />
          );}} align="center" />

          <Column header="Vencimiento (FEFO)" body={(r) => {
             const origIdx = lines.findIndex(item => item.id === r.id && item.variant_id === r.variant_id);
             return (
             <Calendar 
                 value={r.expiration_date} 
                 onChange={(e) => handleDateChange(origIdx, e.value as Date)} 
                 dateFormat="dd/mm/yy" 
                 placeholder="Opcional" 
                 disabled={isReadOnly}
                 className="w-32 p-inputtext-sm text-xs" 
             />
          );}} align="center" />

          <Column header="Avería" body={r => (
             <Button 
                 icon="pi pi-exclamation-triangle" 
                 rounded 
                 text 
                 disabled={isReadOnly}
                 severity={r.damaged_qty > 0 ? "danger" : "secondary"} 
                 tooltip={r.damaged_qty > 0 ? `${r.damaged_qty} unds dañadas` : "Reportar Avería"}
                 onClick={() => openDiscrepancyDialog(r)} 
             />
          )} align="center" />
        </DataTable>
      </div>

      <div className="flex justify-end gap-4 p-6 bg-white rounded-2xl shadow-sm border border-slate-200 mt-6">
         {isReadOnly ? (
             <div className="flex items-center gap-4">
                 <Tag value="✓ RECEPCIÓN COMPLETADA Y CERRADA" severity="success" className="font-extrabold px-4 py-2 text-xs tracking-wider" />
             </div>
         ) : (
             <Button label="Confirmar e Ingresar a Inventario" icon="pi pi-check-circle" severity="success" onClick={confirmReceipt} disabled={saving} className="font-bold px-8 shadow-lg hover:shadow-xl transition-all shadow-emerald-500/30 text-lg bg-emerald-600 border-none" />
         )}
      </div>

      {/* DIÁLOGO TICKET Y ACTA DE RECEPCIÓN 80MM */}
      <Dialog header={ticketData?.is_confirmed ? "Vista Previa Acta Definitiva 80mm" : "Vista Previa Guía de Descarga en Muelle"} visible={ticketDialogVisible} onHide={() => setTicketDialogVisible(false)} style={{ width: '420px' }}>
          {ticketData && (
              <div className="font-mono text-xs p-4 bg-white border border-slate-300 rounded shadow-inner text-slate-900 leading-tight">
                  <div className="text-center font-black text-sm mb-1">NEO WMS LOGÍSTICA</div>
                  <div className="text-center font-bold text-[11px] mb-2 border-b pb-2 border-dashed border-slate-400 uppercase">
                      {ticketData.is_confirmed ? "ACTA DE RECEPCIÓN Y DISCREPANCIAS" : "GUÍA DE CONTEO Y DESCARGA EN MUELLE"}
                  </div>
                  <p><strong>ODC:</strong> {ticketData.order_reference}</p>
                  <p><strong>FECHA:</strong> {ticketData.created_at}</p>
                  <p><strong>PROVEEDOR:</strong> {ticketData.supplier_name}</p>
                  <p><strong>SUCURSAL:</strong> {ticketData.facility_name}</p>
                  {ticketData.is_confirmed && (
                      <p><strong>REGISTRADO POR:</strong> {ticketData.received_by_name || currentUser?.full_name || currentUser?.email || 'Operador WMS'}</p>
                  )}

                  {ticketData.is_confirmed ? (
                      <>
                          {ticketData.has_discrepancies && (
                              <div className="my-2 p-1.5 bg-slate-100 font-bold text-center border border-slate-400 text-[10px]">
                                  ⚠️ CONTIENE DISCREPANCIAS / RECHAZOS EN MUELLE
                              </div>
                          )}
                          <div className="my-2 border-b border-dashed border-slate-400"></div>
                          <table className="w-full text-left">
                              <thead>
                                  <tr className="border-b border-slate-400 text-[10px]">
                                      <th className="py-1">CÓD/PRODUCTO</th>
                                      <th className="py-1 text-center">PED</th>
                                      <th className="py-1 text-center">REC</th>
                                      <th className="py-1 text-right">DEV</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {ticketData.items.map((it: any, idx: number) => {
                                      const codeLabel = it.barcode || it.plu || it.sku;
                                      const pluLabel = it.plu && it.plu !== codeLabel ? ` (PLU: ${it.plu})` : '';
                                      const rejNum = Number(it.rejected_qty || 0);
                                      const pedFmt = formatReceiptQty(it.expected_qty, it.uom_base);
                                      const recFmt = formatReceiptQty(it.received_qty, it.uom_base);
                                      const rejFmt = rejNum > 0 ? `-${formatReceiptQty(rejNum, it.uom_base)}` : '0';
                                      return (
                                      <tr key={idx} className="border-b border-slate-200">
                                          <td className="py-1 max-w-[150px]">
                                              <div className="font-bold text-[11px]">{codeLabel}{pluLabel}</div>
                                              <div className="text-[9px] text-slate-600 truncate">{it.product_name}</div>
                                          </td>
                                          <td className="py-1 text-center font-bold">{pedFmt}</td>
                                          <td className="py-1 text-center font-bold text-emerald-700">{recFmt}</td>
                                          <td className="py-1 text-right font-black text-red-600">{rejFmt}</td>
                                      </tr>
                                  );})}
                              </tbody>
                          </table>
                          <div className="my-4 border-b border-dashed border-slate-400"></div>
                          
                          {/* BLOQUE DE FIRMAS LEGALES */}
                          <div className="mt-6 flex flex-col gap-6 text-[10px]">
                              <div>
                                  <p className="border-b border-slate-400 w-full mb-1"></p>
                                  <p className="font-bold text-center">Firma y Cédula Chofer / Transportista</p>
                              </div>
                              <div>
                                  <p className="border-b border-slate-400 w-full mb-1"></p>
                                  <p className="font-bold text-center">Firma y Cédula Recibidor WMS / Muelle</p>
                                  <p className="text-center text-[9px] text-slate-600 font-semibold mt-0.5">
                                      ({ticketData.received_by_name || currentUser?.full_name || currentUser?.email || 'Operador WMS'})
                                  </p>
                              </div>
                          </div>
                      </>
                  ) : (
                      <>
                          <div className="my-2 p-1.5 bg-blue-50 font-bold text-center border border-blue-300 text-[10px] text-blue-800">
                              📋 CONTROL FÍSICO DE CONTEO EN MUELLE
                          </div>
                          <div className="my-2 border-b border-dashed border-slate-400"></div>
                          <table className="w-full text-left">
                              <thead>
                                  <tr className="border-b border-slate-400 text-[10px]">
                                      <th className="py-1">CÓD/PRODUCTO</th>
                                      <th className="py-1 text-center">ESPERADO</th>
                                      <th className="py-1 text-right">CONTEO FÍSICO</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {ticketData.items.map((it: any, idx: number) => {
                                      const codeLabel = it.barcode || it.plu || it.sku;
                                      const pluLabel = it.plu && it.plu !== codeLabel ? ` (PLU: ${it.plu})` : '';
                                      return (
                                      <tr key={idx} className="border-b border-slate-200">
                                          <td className="py-1 max-w-[160px]">
                                              <div className="font-bold text-[11px]">{codeLabel}{pluLabel}</div>
                                              <div className="text-[9px] text-slate-600 truncate">{it.product_name}</div>
                                          </td>
                                          <td className="py-1 text-center font-bold text-slate-800">{formatReceiptQty(it.expected_qty, it.uom_base)}</td>
                                          <td className="py-1 text-right font-bold text-slate-400">[ &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; ]</td>
                                      </tr>
                                  );})}
                              </tbody>
                          </table>
                          <div className="my-4 border-b border-dashed border-slate-400"></div>
                          <div className="mt-4 text-[10px] text-center text-slate-600">
                              <p className="border-b border-slate-400 w-full mb-1 mt-6"></p>
                              <p className="font-bold">Firma Fiscal / Revisor Muelle</p>
                          </div>
                      </>
                  )}

                  <div className="mt-5 flex justify-center">
                      <Button 
                          label={ticketData.is_confirmed ? "Imprimir Acta Definitiva" : "Imprimir Guía de Descarga"} 
                          icon="pi pi-print" 
                          severity={ticketData.is_confirmed ? "success" : "info"} 
                          size="small" 
                          onClick={() => {
                              const isConfirmed = Boolean(ticketData.is_confirmed);
                              const registeredByName = ticketData.received_by_name || currentUser?.full_name || currentUser?.email || 'Operador WMS';
                              const items = Array.isArray(ticketData.items) ? ticketData.items : [];
                              const rowsHtml = items.map((it: any) => {
                                  const codeLabel = it.barcode || it.plu || it.sku || '';
                                  const pluLabel = it.plu && it.plu !== codeLabel ? ` (PLU: ${it.plu})` : '';
                                  const pedFmt = formatReceiptQty(it.expected_qty, it.uom_base);
                                  if (isConfirmed) {
                                      const rej = Number(it.rejected_qty || 0);
                                      const recFmt = formatReceiptQty(it.received_qty, it.uom_base);
                                      const rejFmt = rej > 0 ? `-${formatReceiptQty(rej, it.uom_base)}` : '0';
                                      return `
                                          <tr>
                                              <td style="padding: 3px 0; border-bottom: 1px dotted #000; max-width: 42mm; word-wrap: break-word;">
                                                  <div style="font-weight: 800; font-size: 11px;">${codeLabel}${pluLabel}</div>
                                                  <div style="font-size: 10px;">${it.product_name || ''}</div>
                                              </td>
                                              <td style="padding: 3px 2px; border-bottom: 1px dotted #000; text-align: center; font-weight: 700;">${pedFmt}</td>
                                              <td style="padding: 3px 2px; border-bottom: 1px dotted #000; text-align: center; font-weight: 800;">${recFmt}</td>
                                              <td style="padding: 3px 0; border-bottom: 1px dotted #000; text-align: right; font-weight: 800;">${rejFmt}</td>
                                          </tr>
                                      `;
                                  } else {
                                      return `
                                          <tr>
                                              <td style="padding: 3px 0; border-bottom: 1px dotted #000; max-width: 44mm; word-wrap: break-word;">
                                                  <div style="font-weight: 800; font-size: 11px;">${codeLabel}${pluLabel}</div>
                                                  <div style="font-size: 10px;">${it.product_name || ''}</div>
                                              </td>
                                              <td style="padding: 3px 2px; border-bottom: 1px dotted #000; text-align: center; font-weight: 700;">${pedFmt}</td>
                                              <td style="padding: 3px 0; border-bottom: 1px dotted #000; text-align: right; font-weight: 700;">[ &nbsp; &nbsp; &nbsp; ]</td>
                                          </tr>
                                      `;
                                  }
                              }).join('');

                              const estHeightMm = Math.max(90, 75 + items.length * 10);
                              const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${ticketData.order_reference || 'Ticket 80mm'} - Neo WMS</title>
  <style id="thermal-page-style">
    @page { size: 80mm ${estHeightMm}mm; margin: 0mm; }
  </style>
  <style>
    * { box-sizing: border-box; color: #000000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body {
      width: 72mm;
      max-width: 72mm;
      margin: 0;
      padding: 2mm 2mm 4mm 2mm;
      font-family: Arial, Helvetica, 'Courier New', monospace;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.25;
      background: #ffffff !important;
      color: #000000 !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: hidden !important;
    }
    .no-print-bar {
      background: #0f172a;
      color: #fff !important;
      padding: 8px;
      margin-bottom: 8px;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: sans-serif;
      font-size: 11px;
    }
    .no-print-bar button {
      background: #10b981;
      color: #fff !important;
      border: none;
      padding: 5px 10px;
      border-radius: 4px;
      font-weight: bold;
      cursor: pointer;
    }
    @media print {
      .no-print-bar { display: none !important; }
    }
    .header-title { text-align: center; font-weight: 900; font-size: 14px; margin-bottom: 2px; }
    .header-sub { text-align: center; font-weight: 800; font-size: 10.5px; border-bottom: 1.5px dashed #000; padding-bottom: 4px; margin-bottom: 6px; text-transform: uppercase; }
    .meta-row { margin: 2px 0; font-size: 11px; word-wrap: break-word; font-weight: 700; }
    .alert-box { margin: 6px 0; padding: 4px; border: 1.5px solid #000; text-align: center; font-weight: 900; font-size: 10px; }
    .divider { border-bottom: 1.5px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    th { border-bottom: 1.5px solid #000; padding: 3px 0; font-size: 10px; font-weight: 900; }
    .sig-block { margin-top: 16px; text-align: center; font-size: 10px; font-weight: 800; page-break-inside: avoid; }
    .sig-line { border-bottom: 1.5px solid #000; width: 100%; height: 18px; margin-bottom: 3px; }
    .footer-note { margin-top: 8px; text-align: center; font-size: 9px; font-weight: 700; border-top: 1.5px dashed #000; padding-top: 4px; }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <span style="color:#fff !important;">Ticket 80mm listo</span>
    <button onclick="window.print()">🖨️ Imprimir</button>
  </div>
  <div id="ticket-root">
    <div class="header-title">NEO WMS LOGÍSTICA</div>
    <div class="header-sub">${isConfirmed ? 'ACTA DE RECEPCIÓN Y DISCREPANCIAS' : 'GUÍA DE CONTEO Y DESCARGA EN MUELLE'}</div>
    <div class="meta-row"><strong>ODC:</strong> ${ticketData.order_reference || ''}</div>
    <div class="meta-row"><strong>FECHA:</strong> ${ticketData.created_at || ''}</div>
    <div class="meta-row"><strong>PROVEEDOR:</strong> ${ticketData.supplier_name || ''}</div>
    <div class="meta-row"><strong>SUCURSAL:</strong> ${ticketData.facility_name || ''}</div>
    ${isConfirmed ? `<div class="meta-row"><strong>REGISTRADO POR:</strong> ${registeredByName}</div>` : ''}
    ${isConfirmed && ticketData.has_discrepancies ? '<div class="alert-box">CONTIENE DISCREPANCIAS / RECHAZOS EN MUELLE</div>' : ''}
    ${!isConfirmed ? '<div class="alert-box">CONTROL FÍSICO DE CONTEO EN MUELLE</div>' : ''}
    <div class="divider"></div>
    <table>
      <thead>
        ${isConfirmed ? `
          <tr>
            <th style="text-align: left;">CÓD/PRODUCTO</th>
            <th style="text-align: center;">PED</th>
            <th style="text-align: center;">REC</th>
            <th style="text-align: right;">DEV</th>
          </tr>
        ` : `
          <tr>
            <th style="text-align: left;">CÓD/PRODUCTO</th>
            <th style="text-align: center;">ESP</th>
            <th style="text-align: right;">FÍSICO</th>
          </tr>
        `}
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="divider"></div>
    ${isConfirmed ? `
      <div class="sig-block"><div class="sig-line"></div><div>Firma y Cédula Chofer / Transportista</div></div>
      <div class="sig-block"><div class="sig-line"></div><div>Firma y Cédula Recibidor WMS / Muelle</div><div style="font-size: 9px; font-weight: 700; margin-top: 2px;">(${registeredByName})</div></div>
    ` : `
      <div class="sig-block"><div class="sig-line"></div><div>Firma Fiscal / Revisor Muelle</div></div>
    `}
    <div class="footer-note">Impreso por Neo ERP — ${new Date().toLocaleString('es-VE')}</div>
  </div>
  <script>
    window.onload = function() {
      var root = document.getElementById('ticket-root');
      var hPx = root ? root.offsetHeight : document.body.scrollHeight;
      var exactMm = Math.max(75, Math.ceil((hPx * 25.4) / 96) + 8);
      var pageStyle = document.getElementById('thermal-page-style');
      if (pageStyle) {
        pageStyle.innerHTML = '@page { size: 80mm ' + exactMm + 'mm; margin: 0mm; }';
      }
      setTimeout(function() {
        window.focus();
        window.print();
      }, 200);
    };
  </script>
</body>
</html>`;

                              const printWin = window.open('', '_blank', 'width=420,height=720');
                              if (!printWin) {
                                  toast.current?.show({ severity: 'warn', summary: 'Ventana bloqueada', detail: 'Permita las ventanas emergentes para imprimir en la tickera.' });
                                  return;
                              }
                              printWin.document.open();
                              printWin.document.write(htmlContent);
                              printWin.document.close();
                          }} 
                          className="font-bold" 
                      />
                  </div>
              </div>
          )}
      </Dialog>

      {/* DIÁLOGO REPORTAR AVERÍA / RECHAZO */}
      <Dialog header="Reportar Avería o Rechazo en Muelle" visible={discrepancyDialogVisible} onHide={() => setDiscrepancyDialogVisible(false)} style={{ width: '420px' }}>
          {discrepancyLine && (
              <div className="flex flex-col gap-4 py-2">
                  <div className="bg-slate-50 p-3 rounded border border-slate-200">
                      <p className="font-bold text-slate-800">{discrepancyLine.product_name}</p>
                      <p className="text-xs text-slate-500 font-mono">
                          Cód. Barra: {discrepancyLine.barcode || discrepancyLine.plu || discrepancyLine.sku}
                          {discrepancyLine.plu && discrepancyLine.plu !== (discrepancyLine.barcode || discrepancyLine.plu || discrepancyLine.sku) ? ` | PLU: ${discrepancyLine.plu}` : ''}
                      </p>
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Evento:</label>
                      <div className="flex flex-col gap-2 p-2 bg-blue-50/50 border border-blue-200 rounded text-xs">
                          <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                              <input type="radio" name="reject_type" checked={true} readOnly />
                              Devolver al Chofer (Rechazo en Puerta - NO entra a Inventario)
                          </label>
                      </div>
                  </div>

                   <div>
                       {(() => {
                           const isWeight = isWeightUom(discrepancyLine.uom_base);
                           const dec = isWeight ? 3 : 0;
                           const uomLabel = discrepancyLine.uom_base || 'UND';
                           return (
                               <>
                                   <label className="block text-xs font-bold text-slate-700 mb-1">Cantidad Devuelta / Rechazada ({uomLabel}):</label>
                                   <InputNumber 
                                       value={discrepancyDamagedQty} 
                                       onValueChange={(e) => setDiscrepancyDamagedQty(e.value || 0)} 
                                       className="w-full"
                                       min={0}
                                       minFractionDigits={dec}
                                       maxFractionDigits={dec}
                                       step={isWeight ? 0.001 : 1}
                                   />
                               </>
                           );
                       })()}
                   </div>

                  <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Motivo / Observación del Rechazo:</label>
                      <InputText 
                          value={discrepancyReason} 
                          onChange={(e) => setDiscrepancyReason(e.target.value)} 
                          placeholder="Ej: Devuelto por empaque roto / mala calidad" 
                          className="w-full text-xs"
                      />
                  </div>

                  <div className="flex justify-end gap-2 mt-2">
                      <Button label="Cancelar" text severity="secondary" onClick={() => setDiscrepancyDialogVisible(false)} />
                      <Button label="Registrar Rechazo" severity="danger" onClick={submitDiscrepancy} className="font-bold" />
                  </div>
              </div>
          )}
      </Dialog>

      {/* DIÁLOGO PRODUCTO INESPERADO */}
      <Dialog header="Agregar Producto Inesperado (No Planificado)" visible={unplannedDialogVisible} onHide={() => setUnplannedDialogVisible(false)} style={{ width: '500px' }}>
          <div className="flex flex-col gap-4 py-2">
              <div className="flex gap-2">
                  <InputText 
                      value={productSearch} 
                      onChange={(e) => {
                          const val = e.target.value;
                          setProductSearch(val);
                          if (val.trim().length >= 2) {
                              handleSearchProducts(val);
                          }
                      }} 
                      placeholder="Buscar por Nombre, SKU, Código de Barras o Alterno..." 
                      className="flex-1 text-xs"
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchProducts()}
                  />
                  <Button label="Buscar" icon="pi pi-search" onClick={() => handleSearchProducts()} loading={searchingProducts} />
              </div>
              <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded">
                  {searchResults.map((p, idx) => (
                      <div key={idx} className="p-3 border-b border-slate-100 flex justify-between items-center hover:bg-slate-50">
                          <div>
                              <p className="font-bold text-sm text-slate-800">{p.product_name || p.name}</p>
                              <p className="text-xs text-slate-500 font-mono">
                                  SKU: {p.sku || p.code || 'N/A'}
                                  {p.barcodes && p.barcodes.length > 0 ? ` | Cód: ${p.barcodes.slice(0, 4).join(', ')}` : ''}
                              </p>
                          </div>
                          <Button label="Agregar" icon="pi pi-plus" size="small" severity="success" onClick={() => addUnplannedProduct(p)} />
                      </div>
                  ))}
                  {searchResults.length === 0 && !searchingProducts && (
                      <p className="p-4 text-xs text-slate-400 text-center">Ingrese nombre o cualquier código para buscar en el catálogo.</p>
                  )}
              </div>
          </div>
      </Dialog>

      {/* DIÁLOGO COTEJO FISCAL Y CONCILIACIÓN CON CLARA (OCR MULTIMODAL) */}
      <Dialog 
          header={
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-blue-100 text-blue-700 font-black text-sm">🤖 CLARA AI</span>
              <span className="font-black text-slate-800 text-lg">Cotejo Fiscal y Conciliación 3-Way</span>
            </div>
          } 
          visible={invoiceModalVisible} 
          onHide={() => setInvoiceModalVisible(false)} 
          style={{ width: '620px' }}
      >
          <div className="flex flex-col gap-4 py-2 text-slate-700">
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed">
                  <p className="font-bold mb-1">📸 Ingesta de Factura / Guía de Despacho:</p>
                  Sube la foto del documento o PDF entregado por el proveedor. Clara extraerá automáticamente los datos fiscales y cotejará línea a línea con la recepción en muelle para validar precios y cantidades.
              </div>

              {/* Selector de Archivo */}
              <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-600">Seleccionar Documento (Foto o PDF):</label>
                  <input 
                      type="file" 
                      accept="image/*,application/pdf" 
                      onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                              setInvoiceFile(e.target.files[0]);
                          }
                      }}
                      className="block w-full text-xs text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer cursor-pointer border border-slate-200 rounded-xl p-1 bg-slate-50"
                  />
                  {invoiceFile && (
                      <p className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                          <i className="pi pi-check"></i> Archivo listo: {invoiceFile.name} ({(invoiceFile.size / 1024).toFixed(1)} KB)
                      </p>
                  )}
              </div>

              {/* Botón de Análisis OCR */}
              <Button 
                  label={ocrLoading ? "Clara está leyendo el documento y cotejando..." : "Analizar con Clara OCR ⚡"} 
                  icon={ocrLoading ? "pi pi-spin pi-spinner" : "pi pi-sparkles"} 
                  severity="info" 
                  disabled={!invoiceFile || ocrLoading} 
                  onClick={handleUploadInvoiceToClara}
                  className="w-full font-black py-3 bg-blue-600 hover:bg-blue-700 border-none shadow-md"
              />

              {/* Resultados de la Conciliación */}
              {ocrResult && (
                  <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col gap-3">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                          <div>
                              <p className="font-bold text-slate-800 text-sm">Factura: {ocrResult.invoice_number || 'N/A'}</p>
                              <p className="text-[11px] text-slate-500">Fecha: {ocrResult.invoice_date || 'N/A'}</p>
                          </div>
                          {ocrResult.reconciliation_status === 'MATCH_EXACT' && (
                              <Tag value="✓ COINCIDENCIA EXACTA" severity="success" className="font-black px-3 py-1" />
                          )}
                          {ocrResult.reconciliation_status === 'MATCH_WITH_DEBIT_NOTE' && (
                              <Tag value="⚠️ NOTA DE DÉBITO SUGERIDA" severity="warning" className="font-black px-3 py-1" />
                          )}
                          {ocrResult.reconciliation_status === 'PENDING_DECISION' && (
                              <Tag value="❓ ÍTEMS NO PEDIDOS" severity="danger" className="font-black px-3 py-1" />
                          )}
                      </div>

                      {/* Métricas Resumidas */}
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="p-2 bg-white rounded-xl border border-slate-200">
                              <span className="text-slate-400 block text-[10px] uppercase font-bold">Físico Recibido</span>
                              <span className="font-bold text-slate-700">${ocrResult.total_received?.toFixed(2)}</span>
                          </div>
                          <div className="p-2 bg-white rounded-xl border border-slate-200">
                              <span className="text-slate-400 block text-[10px] uppercase font-bold">Facturado OCR</span>
                              <span className="font-bold text-blue-700">${ocrResult.total_invoiced?.toFixed(2)}</span>
                          </div>
                          <div className="p-2 bg-white rounded-xl border border-slate-200">
                              <span className="text-slate-400 block text-[10px] uppercase font-bold">Diferencia</span>
                              <span className={`font-black ${ocrResult.net_financial_diff > 0.50 ? 'text-red-600' : 'text-emerald-600'}`}>
                                  ${ocrResult.net_financial_diff?.toFixed(2)}
                              </span>
                          </div>
                      </div>

                      {/* Alerta de Nota de Débito */}
                      {ocrResult.debit_note_amount > 0 && (
                          <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex justify-between items-center">
                              <div>
                                  <p className="font-bold">Nota de Débito {ocrResult.debit_note_number}:</p>
                                  <p className="text-[11px] text-amber-800">{ocrResult.reconciliation_notes}</p>
                              </div>
                              <span className="text-base font-black text-amber-900 bg-amber-200 px-3 py-1 rounded-lg">
                                  ${ocrResult.debit_note_amount?.toFixed(2)}
                              </span>
                          </div>
                      )}

                      {/* Botón de Confirmación */}
                      <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-slate-200">
                          <Button 
                              label="Cerrar y Revisar en Compras" 
                              text 
                              severity="secondary" 
                              onClick={() => {
                                  setInvoiceModalVisible(false);
                                  router.push('/reconciliation');
                              }} 
                          />
                          <Button 
                              label="Aprobar y Conciliar Orden" 
                              icon="pi pi-check-circle" 
                              severity="success" 
                              loading={confirmingReconciliation} 
                              onClick={handleConfirmReconciliation} 
                              className="font-bold bg-emerald-600 border-none"
                          />
                      </div>
                  </div>
              )}
          </div>
      </Dialog>

      {/* BITÁCORA DE AUDITORÍA Y REVERSOS DE ESTA ODC */}
      {orderAuditLogs.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-6">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
              <i className="pi pi-shield text-indigo-600"></i>
              Bitácora de Auditoría y Trazabilidad de Recepción ({orderAuditLogs.length} eventos)
            </h3>
            <span className="text-[11px] font-bold text-slate-500">Registro Inmutable Neo ERP</span>
          </div>
          <div className="divide-y divide-slate-100">
            {orderAuditLogs.map((log: any) => {
              const det = log.details || {};
              let badgeLabel = log.action;
              let badgeSeverity: 'success' | 'info' | 'warning' | 'danger' = 'info';
              if (log.action === 'RECEIVE_PURCHASE_ORDER') {
                badgeLabel = 'RECEPCIÓN CONFIRMADA';
                badgeSeverity = 'success';
              } else if (log.action === 'REQUEST_RECEIPT_REVERSAL') {
                badgeLabel = 'SOLICITUD DE REVERSO';
                badgeSeverity = 'warning';
              } else if (log.action === 'APPROVE_RECEIPT_REVERSAL') {
                badgeLabel = `REVERSO APROBADO #${det.reversal_number || 1}`;
                badgeSeverity = 'info';
              } else if (log.action === 'REJECT_RECEIPT_REVERSAL') {
                badgeLabel = 'REVERSO RECHAZADO';
                badgeSeverity = 'danger';
              } else if (log.action === 'REJECT_AT_DOCK' || log.action === 'REPORT_DISCREPANCY_SCRAP') {
                badgeLabel = 'DISCREPANCIA / AVERÍA';
                badgeSeverity = 'danger';
              }

              return (
                <div key={log.id} className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 hover:bg-slate-50/70">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag value={badgeLabel} severity={badgeSeverity} className="font-black text-[10px]" />
                      <span className="text-xs font-bold text-slate-800">
                        {log.user_name || log.user_email || 'Usuario'}
                      </span>
                      <span className="text-xs text-slate-400">
                        • {log.created_at ? format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss') : ''}
                      </span>
                      {log.ip_address && (
                        <span className="font-mono text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                          IP: {log.ip_address}
                        </span>
                      )}
                    </div>
                    {det.reversal_reason && (
                      <p className="text-xs text-slate-700">
                        <strong>Causal:</strong> {det.reversal_reason} — <strong>Detalle:</strong> {det.reversal_notes || 'N/A'}
                      </p>
                    )}
                    {det.requested_by_name && log.action === 'APPROVE_RECEIPT_REVERSAL' && (
                      <p className="text-[11px] text-slate-500">
                        Solicitado por: <strong>{det.requested_by_name}</strong> | Aprobado por: <strong>{det.approved_by_name || log.user_name}</strong>
                        {det.previous_invoice_number ? ` | Factura previa: ${det.previous_invoice_number}` : ''}
                      </p>
                    )}
                    {det.rejection_reason && (
                      <p className="text-xs text-rose-700">
                        <strong>Motivo de rechazo:</strong> {det.rejection_reason}
                      </p>
                    )}
                    {log.action === 'RECEIVE_PURCHASE_ORDER' && (
                      <p className="text-xs text-slate-600">
                        Documento: <strong>{det.picking_name}</strong> | Factura/Guía: <strong>{det.invoice_number || 'S/N'}</strong> | Total unidades recibidas: <strong>{det.total_received ?? 0}</strong>
                      </p>
                    )}
                  </div>

                  {Array.isArray(det.lines_before_reversal) && det.lines_before_reversal.length > 0 && (
                    <Button
                      label="Ver Foto Antes del Reverso"
                      icon="pi pi-eye"
                      size="small"
                      outlined
                      severity="secondary"
                      onClick={() => setAuditSnapshotModalLog(log)}
                      className="text-xs font-bold shrink-0"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL SOLICITAR / EJECUTAR REVERSO DE RECEPCIÓN */}
      <Dialog
        header={
          <div className="flex items-center gap-2">
            <i className="pi pi-undo text-amber-600 text-xl"></i>
            <span className="font-black text-slate-800 text-lg">
              {canApproveReversal ? 'Reversar Recepción de Mercancía' : 'Solicitar Reverso de Recepción'}
            </span>
          </div>
        }
        visible={reversalModalVisible}
        onHide={() => setReversalModalVisible(false)}
        style={{ width: '540px' }}
      >
        <div className="flex flex-col gap-4 py-2 text-slate-700">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 leading-relaxed">
            <p className="font-black mb-1">⚠️ Control de Auditoría Neo WMS (Solo ODC no conciliadas):</p>
            Al aprobarse el reverso de <strong>{order?.reference}</strong>, los movimientos de ingreso en Kardex pasarán a estado <strong>ANULADO (CANCELLED)</strong>, se descontará el stock ingresado y la ODC volverá a estado <strong>Pendiente por Recibir</strong> para cargarla nuevamente. Todo el detalle quedará respaldado en el Log de Auditoría.
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Causal del Reverso (*):</label>
            <Dropdown
              value={reversalReason}
              options={REVERSAL_REASON_OPTIONS}
              onChange={(e) => setReversalReason(e.value)}
              className="w-full text-xs font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Explicación / Justificación Detallada (*):
            </label>
            <InputText
              value={reversalNotes}
              onChange={(e) => setReversalNotes(e.target.value)}
              placeholder="Ej: El analista colocó 0 en el renglón PRD-10578 por error y se requiere volver a contar..."
              className="w-full text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-slate-200">
            <Button
              label="Cancelar"
              text
              severity="secondary"
              disabled={submittingReversal}
              onClick={() => setReversalModalVisible(false)}
            />
            <Button
              label="Enviar Solicitud a Supervisión"
              icon="pi pi-send"
              severity="warning"
              loading={submittingReversal}
              onClick={() => handleRequestReversal(false)}
              className="font-bold text-xs"
            />
            {canApproveReversal && (
              <Button
                label="Aprobar y Ejecutar Reverso Ahora"
                icon="pi pi-check-circle"
                severity="help"
                loading={submittingReversal}
                onClick={() => handleRequestReversal(true)}
                className="font-black text-xs bg-indigo-600 hover:bg-indigo-700 border-none"
              />
            )}
          </div>
        </div>
      </Dialog>

      {/* MODAL RECHAZAR SOLICITUD DE REVERSO */}
      <Dialog
        header="Rechazar Solicitud de Reverso"
        visible={rejectReversalModalVisible}
        onHide={() => setRejectReversalModalVisible(false)}
        style={{ width: '440px' }}
      >
        <div className="flex flex-col gap-4 py-2">
          <p className="text-xs text-slate-600">
            Indique el motivo por el cual se rechaza la solicitud de reverso de <strong>{order?.reference}</strong>. La recepción se mantendrá válida.
          </p>
          <InputText
            value={rejectReversalReason}
            onChange={(e) => setRejectReversalReason(e.target.value)}
            placeholder="Ej: El conteo físico fue verificado y es correcto"
            className="w-full text-xs"
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button label="Cancelar" text severity="secondary" onClick={() => setRejectReversalModalVisible(false)} />
            <Button
              label="Confirmar Rechazo"
              severity="danger"
              loading={submittingReversal}
              onClick={handleRejectPendingReversal}
              className="font-bold text-xs"
            />
          </div>
        </div>
      </Dialog>

      {/* MODAL FOTO FORENSE ANTES DEL REVERSO */}
      <Dialog
        header={`Respaldo de Auditoría — ${auditSnapshotModalLog?.details?.order_reference || order?.reference || ''}`}
        visible={Boolean(auditSnapshotModalLog)}
        onHide={() => setAuditSnapshotModalLog(null)}
        style={{ width: '680px' }}
      >
        {auditSnapshotModalLog && (
          <div className="flex flex-col gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <p><strong>Evento:</strong> {auditSnapshotModalLog.action}</p>
              <p><strong>Fecha/Hora:</strong> {auditSnapshotModalLog.created_at ? format(new Date(auditSnapshotModalLog.created_at), 'dd/MM/yyyy HH:mm:ss') : ''}</p>
              <p><strong>Solicitado por:</strong> {auditSnapshotModalLog.details?.requested_by_name || auditSnapshotModalLog.user_name}</p>
              {auditSnapshotModalLog.details?.approved_by_name && (
                <p><strong>Aprobado por:</strong> {auditSnapshotModalLog.details.approved_by_name}</p>
              )}
              <p><strong>Causal:</strong> {auditSnapshotModalLog.details?.reversal_reason} — {auditSnapshotModalLog.details?.reversal_notes}</p>
            </div>
            <div className="max-h-[340px] overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-slate-600 uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">SKU</th>
                    <th className="p-2.5">Producto</th>
                    <th className="p-2.5 text-right">Esperado</th>
                    <th className="p-2.5 text-right">Recibido (Anulado)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(auditSnapshotModalLog.details?.lines_before_reversal || []).map((ln: any, i: number) => (
                    <tr key={i}>
                      <td className="p-2.5 font-mono font-bold text-slate-700">{ln.sku}</td>
                      <td className="p-2.5 font-semibold text-slate-800">{ln.product_name}</td>
                      <td className="p-2.5 text-right text-slate-500">{ln.expected_base_qty}</td>
                      <td className="p-2.5 text-right font-black text-rose-600">{ln.received_base_qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
