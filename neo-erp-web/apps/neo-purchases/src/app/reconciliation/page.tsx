"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Calendar } from 'primereact/calendar';
import { Dialog } from 'primereact/dialog';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import { Dropdown } from 'primereact/dropdown';
import { InputTextarea } from 'primereact/inputtextarea';
import api from '@/lib/api';
import { format } from 'date-fns';

export default function ReconciliationPage() {
  const toast = useRef<Toast>(null);

  // KPIs
  const [kpis, setKpis] = useState<{
    pending_count: number;
    pending_amount_usd: number;
    pending_amount_ves: number;
    conciliated_count: number;
    conciliated_amount_usd: number;
    debit_notes_count: number;
    debit_notes_amount_usd: number;
    debit_notes_amount_ves: number;
  }>({
    pending_count: 0,
    pending_amount_usd: 0,
    pending_amount_ves: 0,
    conciliated_count: 0,
    conciliated_amount_usd: 0,
    debit_notes_count: 0,
    debit_notes_amount_usd: 0,
    debit_notes_amount_ves: 0,
  });

  // Table state
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0); // 0: Pending, 1: Conciliated
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);

  // Modal 3-Way Match Workspace state
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState<Date | null>(new Date());
  const [lines, setLines] = useState<any[]>([]);
  const [debitNoteReason, setDebitNoteReason] = useState('');
  const [savingAction, setSavingAction] = useState(false);

  // Debit Note Voucher Modal state
  const [showDebitNoteModal, setShowDebitNoteModal] = useState(false);
  const [debitNoteData, setDebitNoteData] = useState<any | null>(null);
  const [loadingDebitNote, setLoadingDebitNote] = useState(false);

  // Tab 2: Devoluciones a Proveedores (RTV) State
  const [returnsList, setReturnsList] = useState<any[]>([]);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<any | null>(null);
  const [creditNoteNumber, setCreditNoteNumber] = useState('');
  const [creditNoteAmount, setCreditNoteAmount] = useState<number>(0);
  const [creditNoteDate, setCreditNoteDate] = useState<Date | null>(new Date());
  const [returnNotes, setReturnNotes] = useState('');
  const [submittingReturn, setSubmittingReturn] = useState(false);

  // Fetch KPIs
  const fetchKpis = async () => {
    try {
      const res = await api.get('/reconciliation/kpis');
      setKpis(res.data);
    } catch (err) {
      console.error("Error loading KPIs:", err);
    }
  };

  // Fetch Orders
  const fetchOrders = async () => {
    setLoading(true);
    const tabName = activeTab === 0 ? 'pending' : 'conciliated';
    try {
      const res = await api.get(`/reconciliation/?tab=${tabName}`);
      setOrders(res.data || []);
    } catch (err) {
      console.error("Error fetching orders:", err);
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las órdenes para conciliación.' });
    }
    setLoading(false);
  };

  // Fetch Returns
  const fetchReturns = async () => {
    setLoadingReturns(true);
    try {
      const res = await api.get('/reconciliation/returns?status=ALL');
      setReturnsList(res.data || []);
    } catch (err) {
      console.error("Error loading returns for reconciliation:", err);
    }
    setLoadingReturns(false);
  };

  useEffect(() => {
    fetchKpis();
    if (activeTab === 2) {
      fetchReturns();
    } else {
      fetchOrders();
    }
    fetchReturns();
  }, [activeTab]);

  // Suppliers for dropdown filter
  const supplierOptions = useMemo(() => {
    const names = Array.from(new Set(orders.map((o) => o.supplier_name).filter(Boolean)));
    return names.sort().map((name) => ({ label: name, value: name }));
  }, [orders]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchesSupplier = !selectedSupplier || o.supplier_name === selectedSupplier;
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term ||
        o.reference?.toLowerCase().includes(term) ||
        o.supplier_name?.toLowerCase().includes(term) ||
        o.invoice_number?.toLowerCase().includes(term) ||
        o.debit_note_number?.toLowerCase().includes(term);
      return matchesSupplier && matchesSearch;
    });
  }, [orders, selectedSupplier, searchTerm]);

  // Filtered returns list
  const filteredReturns = useMemo(() => {
    return returnsList.filter((r) => {
      const matchesSupplier = !selectedSupplier || r.supplier_name === selectedSupplier;
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term ||
        r.return_number?.toLowerCase().includes(term) ||
        r.supplier_name?.toLowerCase().includes(term) ||
        r.credit_note_number?.toLowerCase().includes(term) ||
        r.carrier_name?.toLowerCase().includes(term);
      return matchesSupplier && matchesSearch;
    });
  }, [returnsList, selectedSupplier, searchTerm]);

  const openCloseReturnModal = (ret: any) => {
    setSelectedReturn(ret);
    setCreditNoteNumber(ret.credit_note_number || '');
    setCreditNoteAmount(Number(ret.credit_note_amount || ret.total_estimated_amount || 0));
    setCreditNoteDate(new Date());
    setReturnNotes('');
    setShowReturnModal(true);
  };

  const submitCloseReturn = async () => {
    if (!selectedReturn) return;
    if (!creditNoteNumber.trim()) {
      toast.current?.show({ severity: 'warn', summary: 'Campo Requerido', detail: 'Debe ingresar el Número de Nota de Crédito.' });
      return;
    }
    if (Number(creditNoteAmount) <= 0) {
      toast.current?.show({ severity: 'warn', summary: 'Monto Inválido', detail: 'El monto de la Nota de Crédito debe ser mayor a 0.' });
      return;
    }
    if (!creditNoteDate) {
      toast.current?.show({ severity: 'warn', summary: 'Campo Requerido', detail: 'Debe seleccionar la fecha de la Nota de Crédito.' });
      return;
    }

    setSubmittingReturn(true);
    try {
      const formattedDate = creditNoteDate.toISOString().split('T')[0];
      const payload = {
        credit_note_number: creditNoteNumber.trim(),
        credit_note_amount: Number(creditNoteAmount),
        credit_note_date: formattedDate,
        notes: returnNotes || null
      };

      const res = await api.post(`/reconciliation/returns/${selectedReturn.id}/close`, payload);
      toast.current?.show({ severity: 'success', summary: 'Conciliación Exitosa', detail: res.data?.message || 'Devolución conciliada con Nota de Crédito.' });
      setShowReturnModal(false);
      fetchReturns();
      fetchKpis();
    } catch (err: any) {
      toast.current?.show({ severity: 'error', summary: 'Error al Conciliar', detail: err.response?.data?.detail || 'No se pudo registrar la Nota de Crédito.' });
    } finally {
      setSubmittingReturn(false);
    }
  };

  // Open 3-Way Match Modal
  const openReconciliationModal = async (orderId: number) => {
    setLoadingDetail(true);
    setShowMatchModal(true);
    try {
      const res = await api.get(`/reconciliation/${orderId}`);
      const data = res.data;
      setSelectedOrder(data);
      setInvoiceNumber(data.invoice_number || '');
      setInvoiceDate(data.invoice_date ? new Date(data.invoice_date) : new Date());
      setDebitNoteReason(data.reconciliation_notes || '');

      setLines(data.lines.map((l: any) => ({
        id: l.id,
        sku: l.sku,
        name: l.product_name,
        uom: l.uom_base,
        pack_name: l.pack_name,
        ordered_qty: Number(l.expected_base_qty),
        received_qty: Number(l.received_base_qty),
        billed_qty: Number(l.billed_qty !== null ? l.billed_qty : l.received_base_qty),
        unit_cost: Number(l.unit_cost),
        billed_unit_cost: Number(l.billed_unit_cost !== null ? l.billed_unit_cost : l.unit_cost),
        sales_price: Number(l.current_sales_price || 0),
        new_sales_price: Number(l.current_sales_price || 0),
      })));
    } catch (err: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el detalle de la orden.' });
      setShowMatchModal(false);
    }
    setLoadingDetail(false);
  };

  // Open Debit Note Voucher
  const openDebitNoteVoucher = async (orderId: number) => {
    setLoadingDebitNote(true);
    setShowDebitNoteModal(true);
    try {
      const res = await api.get(`/reconciliation/${orderId}/debit-note-data`);
      setDebitNoteData(res.data);
    } catch (err: any) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se encontró información de Nota de Débito.' });
      setShowDebitNoteModal(false);
    }
    setLoadingDebitNote(false);
  };

  // Line modification handlers
  const handleBilledQtyChange = (rowIndex: number, val: number | null | undefined) => {
    if (val === null || val === undefined) return;
    setLines((prev) => {
      const arr = [...prev];
      arr[rowIndex] = { ...arr[rowIndex], billed_qty: val };
      return arr;
    });
  };

  const handleBilledCostChange = (rowIndex: number, val: number | null | undefined) => {
    if (val === null || val === undefined) return;
    setLines((prev) => {
      const arr = [...prev];
      arr[rowIndex] = { ...arr[rowIndex], billed_unit_cost: val };
      return arr;
    });
  };

  const handleNewSalesPriceChange = (rowIndex: number, val: number | null | undefined) => {
    if (val === null || val === undefined) return;
    setLines((prev) => {
      const arr = [...prev];
      arr[rowIndex] = { ...arr[rowIndex], new_sales_price: val };
      return arr;
    });
  };

  const handleTargetMarginChange = (rowIndex: number, marginPct: number | null | undefined, billedCost: number) => {
    if (marginPct === null || marginPct === undefined) return;
    let safeMargin = marginPct;
    if (safeMargin >= 100) safeMargin = 99.99;
    const newPrice = billedCost / (1 - safeMargin / 100);
    handleNewSalesPriceChange(rowIndex, newPrice);
  };

  // Financial calculations in live workspace
  const financialTotals = useMemo(() => {
    let totalBilled = 0;
    let totalReceived = 0;
    let totalOrdered = 0;
    let totalDebitNote = 0;
    let shortCount = 0;
    let priceHikeCount = 0;

    lines.forEach((l) => {
      const ordTot = l.ordered_qty * l.unit_cost;
      const recTot = l.received_qty * l.unit_cost;
      const billTot = l.billed_qty * l.billed_unit_cost;

      totalOrdered += ordTot;
      totalReceived += recTot;
      totalBilled += billTot;

      const diff = billTot - recTot;
      if (diff > 0.0001) {
        totalDebitNote += diff;
      }
      if (l.billed_qty > l.received_qty) shortCount++;
      if (l.billed_unit_cost > l.unit_cost) priceHikeCount++;
    });

    const netPayable = Math.max(0, totalBilled - totalDebitNote);
    const hasDiscrepancy = totalDebitNote > 0.05;

    return {
      totalOrdered,
      totalReceived,
      totalBilled,
      totalDebitNote,
      netPayable,
      hasDiscrepancy,
      shortCount,
      priceHikeCount,
    };
  }, [lines]);

  // Submit Reconciliation Action
  const submitAction = async (actionType: 'EXACT_MATCH' | 'APPROVE_WITH_DEBIT_NOTE' | 'REJECT') => {
    if (!invoiceNumber.trim() || !invoiceDate) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Datos Incompletos',
        detail: 'Debe ingresar el Número de Factura Fiscal y la Fecha del Documento.',
      });
      return;
    }

    if (actionType === 'EXACT_MATCH' && financialTotals.hasDiscrepancy) {
      toast.current?.show({
        severity: 'error',
        summary: 'Discrepancia Detectada',
        detail: `Existe una diferencia de $${financialTotals.totalDebitNote.toFixed(2)}. Seleccione "Aprobar con Nota de Débito" para emitir la deducción y no pagar de más.`,
      });
      return;
    }

    setSavingAction(true);
    try {
      const payload = {
        invoice_number: invoiceNumber.trim(),
        invoice_date: format(invoiceDate, 'yyyy-MM-dd'),
        action: actionType,
        debit_note_reason: debitNoteReason || undefined,
        lines: lines.map((l) => ({
          id: l.id,
          billed_qty: l.billed_qty,
          billed_unit_cost: l.billed_unit_cost,
          new_sales_price: l.new_sales_price > 0 && l.new_sales_price !== l.sales_price ? l.new_sales_price : null,
        })),
      };

      const res = await api.post(`/reconciliation/${selectedOrder.id}/process`, payload);
      toast.current?.show({
        severity: actionType === 'REJECT' ? 'info' : 'success',
        summary: 'Conciliación Procesada',
        detail: res.data.message,
        life: 5000,
      });

      setShowMatchModal(false);
      fetchKpis();
      fetchOrders();
    } catch (err: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Fallo al Conciliar',
        detail: err.response?.data?.detail || 'Ocurrió un error al procesar la conciliación.',
        life: 5000,
      });
    }
    setSavingAction(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'MATCH_EXACT':
        return <Tag value="100% Match Exacto" severity="success" icon="pi pi-check" className="font-bold text-xs" />;
      case 'MATCH_WITH_DEBIT_NOTE':
        return <Tag value="Aprobada c/ Nota Débito" severity="warning" icon="pi pi-file-edit" className="font-bold text-xs" />;
      case 'REJECTED':
        return <Tag value="Factura Rechazada" severity="danger" icon="pi pi-times" className="font-bold text-xs" />;
      default:
        return <Tag value="Pendiente por Factura" severity="info" icon="pi pi-clock" className="font-bold text-xs" />;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <Toast ref={toast} />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-lg shadow-lg shadow-indigo-500/20">
              <i className="pi pi-verified"></i>
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">Conciliación 3-Way Match Automática</h1>
              <p className="text-sm text-slate-500 font-medium">Cruce fiscal y operativo: Factura Proveedor vs Recepción WMS vs Orden de Compra</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            label="Actualizar"
            icon="pi pi-refresh"
            size="small"
            outlined
            className="p-button-secondary bg-white text-slate-700 font-semibold shadow-sm"
            onClick={() => {
              fetchKpis();
              fetchOrders();
            }}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Pendientes */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Órdenes Pendientes</span>
            <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-sm font-bold">
              <i className="pi pi-clock"></i>
            </span>
          </div>
          <div className="text-2xl font-black text-slate-800">{kpis.pending_count}</div>
          <div className="text-xs font-medium text-slate-400 mt-1 flex items-center gap-1">
            <span>En muelle esperando factura</span>
          </div>
        </div>

        {/* Card 2: Monto por Validar */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Monto por Validar</span>
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold">
              <i className="pi pi-dollar"></i>
            </span>
          </div>
          <div className="text-2xl font-black text-slate-800">${kpis.pending_amount_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div className="text-xs font-medium text-slate-400 mt-1">
            Bs. {kpis.pending_amount_ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
          </div>
        </div>

        {/* Card 3: Conciliadas con Éxito */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Conciliadas con Éxito</span>
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-bold">
              <i className="pi pi-check-circle"></i>
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-600">{kpis.conciliated_count}</div>
          <div className="text-xs font-medium text-slate-400 mt-1">
            Total: ${kpis.conciliated_amount_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>

        {/* Card 4: Notas de Débito Emitidas */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Notas de Débito (Ahorro)</span>
            <span className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center text-sm font-bold">
              <i className="pi pi-shield"></i>
            </span>
          </div>
          <div className="text-2xl font-black text-purple-600">${kpis.debit_notes_amount_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div className="text-xs font-medium text-slate-400 mt-1 flex items-center justify-between">
            <span>{kpis.debit_notes_count} retenciones</span>
            <span>Bs. {kpis.debit_notes_amount_ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Navigation Tabs */}
        <div className="border-b border-slate-200 px-6 pt-4 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab(0)}
              className={`px-4 py-2.5 rounded-t-xl text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${
                activeTab === 0
                  ? 'border-indigo-600 text-indigo-600 bg-white shadow-sm'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <i className="pi pi-inbox"></i>
              <span>Pendientes de Conciliar</span>
              <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-black">
                {kpis.pending_count}
              </span>
            </button>

            <button
              onClick={() => setActiveTab(1)}
              className={`px-4 py-2.5 rounded-t-xl text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${
                activeTab === 1
                  ? 'border-indigo-600 text-indigo-600 bg-white shadow-sm'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <i className="pi pi-history"></i>
              <span>Historial de Conciliaciones</span>
              <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs bg-slate-200 text-slate-700 font-black">
                {kpis.conciliated_count}
              </span>
            </button>

            <button
              onClick={() => setActiveTab(2)}
              className={`px-4 py-2.5 rounded-t-xl text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${
                activeTab === 2
                  ? 'border-indigo-600 text-indigo-600 bg-white shadow-sm'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <i className="pi pi-replay"></i>
              <span>Devoluciones RTV (Notas de Crédito)</span>
              <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-800 font-black">
                {returnsList.filter(r => r.status === 'DISPATCHED').length}
              </span>
            </button>
          </div>

          {/* Search and Filters */}
          <div className="flex items-center gap-3 pb-3">
            <Dropdown
              value={selectedSupplier}
              options={supplierOptions}
              onChange={(e) => setSelectedSupplier(e.value)}
              placeholder="Filtrar Proveedor..."
              showClear
              className="w-48 text-xs"
            />
            <div className="relative">
              <i className="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <InputText
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar ODC, Factura..."
                className="pl-8 py-1.5 text-xs w-48 font-medium rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="p-4">
          {activeTab === 2 ? (
            <DataTable
              value={filteredReturns}
              loading={loadingReturns}
              paginator
              rows={10}
              rowsPerPageOptions={[10, 25, 50]}
              dataKey="id"
              emptyMessage="No se encontraron devoluciones a proveedores para conciliar."
              className="text-sm"
              rowHover
            >
              <Column
                field="return_number"
                header="N° RTV"
                body={(r) => (
                  <div>
                    <span className="font-bold text-purple-700 font-mono text-sm block">{r.return_number}</span>
                    <span className="text-xs text-slate-400">{r.facility_name}</span>
                  </div>
                )}
              />

              <Column
                field="supplier_name"
                header="Proveedor"
                body={(r) => (
                  <div>
                    <span className="font-bold text-slate-800 block text-sm">{r.supplier_name}</span>
                    <span className="text-xs font-mono text-slate-400">{r.supplier_tax_id || 'Sin RIF'}</span>
                  </div>
                )}
              />

              <Column
                field="purchase_order_reference"
                header="ODC Origen"
                body={(r) => (
                  r.purchase_order_reference ? (
                    <span className="font-semibold text-blue-600 font-mono text-xs">{r.purchase_order_reference}</span>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Directa / Sin ODC</span>
                  )
                )}
              />

              <Column
                field="dispatched_at"
                header="Despacho en Muelle"
                body={(r) => (
                  <div>
                    <span className="text-xs font-semibold text-slate-700 block">{r.dispatched_at || 'Pendiente'}</span>
                    {r.carrier_name && <span className="text-[11px] text-slate-400">Chofer: {r.carrier_name}</span>}
                  </div>
                )}
              />

              <Column
                header="Salida Kardex ($)"
                body={(r) => (
                  <div className="text-right">
                    <span className="font-black text-slate-800 block">
                      ${Number(r.total_estimated_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs text-slate-400">
                      {r.lines?.length || 0} renglones
                    </span>
                  </div>
                )}
                align="right"
              />

              <Column
                header="Nota de Crédito"
                body={(r) => (
                  <div>
                    {r.credit_note_number ? (
                      <div>
                        <span className="font-bold font-mono text-emerald-800 text-xs block">
                          📄 {r.credit_note_number}
                        </span>
                        <span className="text-[11px] text-slate-500 font-bold">
                          ${Number(r.credit_note_amount || 0).toFixed(2)} ({r.credit_note_date})
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        Pendiente N/C
                      </span>
                    )}
                  </div>
                )}
              />

              <Column
                field="status"
                header="Estado"
                body={(r) => (
                  r.status === 'CONCILIATED' ? (
                    <Tag severity="success" value="Conciliado" icon="pi pi-check-circle" />
                  ) : (
                    <Tag severity="info" value="Despachado en Muelle" icon="pi pi-send" />
                  )
                )}
              />

              <Column
                header="Acciones"
                body={(r) => (
                  <div className="flex items-center justify-end gap-2">
                    {r.status === 'DISPATCHED' ? (
                      <Button
                        label="Registrar N/C"
                        icon="pi pi-receipt"
                        size="small"
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs py-1.5 px-3 rounded-lg shadow-sm"
                        onClick={() => openCloseReturnModal(r)}
                      />
                    ) : (
                      <Button
                        label="Ver N/C"
                        icon="pi pi-check"
                        size="small"
                        outlined
                        className="text-xs py-1 px-2.5 p-button-secondary font-medium"
                        onClick={() => openCloseReturnModal(r)}
                      />
                    )}
                  </div>
                )}
                align="right"
              />
            </DataTable>
          ) : (
            <DataTable
              value={filteredOrders}
              loading={loading}
              paginator
              rows={10}
              rowsPerPageOptions={[10, 25, 50]}
              dataKey="id"
              emptyMessage="No se encontraron órdenes en esta bandeja."
              className="text-sm"
              rowHover
            >
              <Column
                field="reference"
                header="Orden de Compra"
                body={(r) => (
                  <div>
                    <span className="font-bold text-indigo-600 font-mono text-sm block">{r.reference}</span>
                    <span className="text-xs text-slate-400">
                      {r.created_at ? format(new Date(r.created_at), 'dd/MM/yyyy') : ''}
                    </span>
                  </div>
                )}
              />

              <Column
                field="supplier_name"
                header="Proveedor"
                body={(r) => (
                  <div>
                    <span className="font-bold text-slate-800 block text-sm">{r.supplier_name}</span>
                    <span className="text-xs font-mono text-slate-400">{r.supplier_tax_id || 'Sin RIF'}</span>
                  </div>
                )}
              />

              <Column
                field="dest_facility_name"
                header="Destino"
                body={(r) => (
                  <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded">
                    {r.dest_facility_name || 'N/A'}
                  </span>
                )}
              />

              <Column
                header="Recepción Física (WMS)"
                body={(r) => (
                  <div className="text-right">
                    <span className="font-black text-slate-800 block">
                      ${Number(r.total_received || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs text-slate-400">
                      {r.items_count} {r.items_count === 1 ? 'renglón' : 'renglones'}
                    </span>
                  </div>
                )}
                align="right"
              />

              {activeTab === 1 && (
                <Column
                  header="Factura Fiscal"
                  body={(r) => (
                    <div>
                      {r.invoice_number ? (
                        <div>
                          <span className="font-bold font-mono text-slate-800 text-xs block">
                            📄 {r.invoice_number}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {r.invoice_date ? format(new Date(r.invoice_date), 'dd/MM/yyyy') : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No registrada</span>
                      )}
                    </div>
                  )}
                />
              )}

              <Column
                field="reconciliation_status"
                header="Estado"
                body={(r) => (
                  <div className="flex flex-col gap-1 items-start">
                    {getStatusBadge(r.reconciliation_status)}
                    {r.debit_note_number && (
                      <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                        Retención: -${Number(r.debit_note_amount || 0).toFixed(2)}
                      </span>
                    )}
                  </div>
                )}
              />

              <Column
                header="Acciones"
                body={(r) => (
                  <div className="flex items-center justify-end gap-2">
                    {activeTab === 0 ? (
                      <Button
                        label="Cotejar 3-Way Match"
                        icon="pi pi-check-square"
                        size="small"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-1.5 px-3 rounded-lg shadow-sm"
                        onClick={() => openReconciliationModal(r.id)}
                      />
                    ) : (
                      <>
                        <Button
                          label="Ver Cotejo"
                          icon="pi pi-eye"
                          size="small"
                          outlined
                          className="text-xs py-1 px-2.5 p-button-secondary font-medium"
                          onClick={() => openReconciliationModal(r.id)}
                        />
                        {r.debit_note_number && (
                          <Button
                            label="Nota Débito"
                            icon="pi pi-file-pdf"
                            size="small"
                            severity="help"
                            className="text-xs py-1 px-2.5 font-bold"
                            onClick={() => openDebitNoteVoucher(r.id)}
                          />
                        )}
                      </>
                    )}
                  </div>
                )}
                align="right"
              />
            </DataTable>
          )}
        </div>
      </div>

      {/* MODAL REGISTRAR NOTA DE CRÉDITO DEVOLUCIÓN RTV */}
      <Dialog
        header={`Conciliación de Devolución: ${selectedReturn?.return_number}`}
        visible={showReturnModal}
        onHide={() => setShowReturnModal(false)}
        style={{ width: '650px' }}
        className="text-xs"
      >
        {selectedReturn && (
          <div className="p-4 space-y-4">
            <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 text-purple-900 text-xs">
              <i className="pi pi-info-circle mr-2 text-purple-600 font-bold"></i>
              Conciliación 3-Way Inversa: cruza la salida física de almacén con la Nota de Crédito emitida por el proveedor para liquidar el saldo a favor en administración.
            </div>

            <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <p><strong>Proveedor:</strong> {selectedReturn.supplier_name}</p>
                <p><strong>RIF:</strong> {selectedReturn.supplier_tax_id}</p>
                <p><strong>Sucursal:</strong> {selectedReturn.facility_name}</p>
                <p><strong>ODC Ref:</strong> {selectedReturn.purchase_order_reference || 'Directa / Sin ODC'}</p>
              </div>
              <div>
                <p><strong>Despachado el:</strong> {selectedReturn.dispatched_at}</p>
                <p><strong>Chofer:</strong> {selectedReturn.carrier_name || 'N/A'}</p>
                <p><strong>Placa:</strong> {selectedReturn.carrier_plate || 'N/A'}</p>
                <p><strong>Total Salida Kardex:</strong> <span className="text-purple-700 font-black">${Number(selectedReturn.total_estimated_amount).toFixed(2)}</span></p>
              </div>
            </div>

            {selectedReturn.status === 'CONCILIATED' ? (
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-xs space-y-2">
                <p className="font-extrabold text-sm flex items-center gap-2">
                  <i className="pi pi-check-circle text-emerald-600"></i>
                  Esta orden ya se encuentra conciliada y cerrada.
                </p>
                <p><strong>N° Nota de Crédito:</strong> {selectedReturn.credit_note_number}</p>
                <p><strong>Monto N/C:</strong> ${Number(selectedReturn.credit_note_amount).toFixed(2)}</p>
                <p><strong>Fecha N/C:</strong> {selectedReturn.credit_note_date}</p>
                <p><strong>Conciliado por:</strong> {selectedReturn.conciliated_by} ({selectedReturn.conciliated_at})</p>
                {selectedReturn.notes && <p><strong>Notas:</strong> {selectedReturn.notes}</p>}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">N° Nota de Crédito Fiscal *</label>
                    <InputText
                      value={creditNoteNumber}
                      onChange={(e) => setCreditNoteNumber(e.target.value)}
                      placeholder="Ej. NC-0004521"
                      className="w-full text-xs font-mono font-bold uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Monto Nota de Crédito ($) *</label>
                    <InputNumber
                      value={creditNoteAmount}
                      onValueChange={(e) => setCreditNoteAmount(e.value || 0)}
                      minFractionDigits={2}
                      maxFractionDigits={4}
                      className="w-full text-xs font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Fecha Emisión Nota de Crédito *</label>
                    <Calendar
                      value={creditNoteDate}
                      onChange={(e) => setCreditNoteDate(e.value as Date)}
                      dateFormat="dd/mm/yy"
                      showIcon
                      className="w-full text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Observaciones de Conciliación</label>
                  <InputTextarea
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    rows={2}
                    placeholder="Detalles sobre deducción en cuenta por pagar o abono en cuenta..."
                    className="w-full text-xs"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <Button
                label="Cerrar"
                icon="pi pi-times"
                outlined
                severity="secondary"
                onClick={() => setShowReturnModal(false)}
              />
              {selectedReturn.status !== 'CONCILIATED' && (
                <Button
                  label="Confirmar y Conciliar Devolución"
                  icon="pi pi-check"
                  loading={submittingReturn}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold border-none"
                  onClick={submitCloseReturn}
                />
              )}
            </div>
          </div>
        )}
      </Dialog>

      {/* 3-WAY MATCH INTERACTIVE MODAL */}
      <Dialog
        header={
          <div className="flex items-center justify-between w-full pr-6">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg">
                <i className="pi pi-verified"></i>
              </span>
              <div>
                <h3 className="text-lg font-black text-slate-800">
                  Conciliación 3-Way Match: {selectedOrder?.reference}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Proveedor: <strong className="text-slate-700">{selectedOrder?.supplier_name}</strong> | Destino: <strong className="text-slate-700">{selectedOrder?.dest_facility_name}</strong>
                </p>
              </div>
            </div>
            {selectedOrder && (
              <span className="text-xs font-mono bg-slate-100 px-2.5 py-1 rounded text-slate-600 font-bold">
                Tasa: Bs. {Number(selectedOrder.exchange_rate || 1).toFixed(2)} / USD
              </span>
            )}
          </div>
        }
        visible={showMatchModal}
        style={{ width: '92vw', maxWidth: '1400px' }}
        onHide={() => setShowMatchModal(false)}
        maximizable
      >
        {loadingDetail ? (
          <div className="py-20 text-center text-slate-400">
            <i className="pi pi-spin pi-spinner text-3xl text-indigo-500 mb-3"></i>
            <p className="font-bold">Cargando matriz de cotejo de 3 vías...</p>
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {/* Header: Datos Fiscales de la Factura */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                  📄 Número de Factura Fiscal / Control
                </label>
                <InputText
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Ej: FACT-0019284"
                  className="w-full font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                  📅 Fecha de Emisión Fiscal
                </label>
                <Calendar
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.value as Date)}
                  dateFormat="dd/mm/yy"
                  showIcon
                  className="w-full font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                  📝 Observación / Motivo de Ajuste
                </label>
                <InputText
                  value={debitNoteReason}
                  onChange={(e) => setDebitNoteReason(e.target.value)}
                  placeholder="Ej: Faltante de 2 unidades reportado en muelle..."
                  className="w-full text-xs"
                />
              </div>
            </div>

            {/* Warning Banner if Discrepancy */}
            {financialTotals.hasDiscrepancy && (
              <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl flex items-start gap-3">
                <i className="pi pi-exclamation-triangle text-amber-600 text-xl mt-0.5"></i>
                <div>
                  <h4 className="text-sm font-black text-amber-900">
                    Discrepancia Fiscal Detectada en Cobro del Proveedor
                  </h4>
                  <p className="text-xs text-amber-800 mt-1">
                    La factura del proveedor excede lo físicamente recibido en <strong>${financialTotals.totalDebitNote.toFixed(2)}</strong>.
                    {financialTotals.shortCount > 0 && ` Detectado faltante en ${financialTotals.shortCount} renglón(es).`}
                    {financialTotals.priceHikeCount > 0 && ` Detectado incremento de costo en ${financialTotals.priceHikeCount} renglón(es).`}
                    &nbsp;Se emitirá una <strong>Nota de Débito Automática</strong> para que Cuentas por Pagar descuente la diferencia.
                  </p>
                </div>
              </div>
            )}

            {/* 3-Way Match Matrix Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <DataTable value={lines} dataKey="id" size="small" className="text-xs" rowHover>
                <Column
                  header="SKU / Producto"
                  body={(r) => (
                    <div>
                      <span className="font-mono text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-700 font-bold block mb-1">
                        {r.sku}
                      </span>
                      <span className="font-bold text-slate-800 block text-xs">{r.name}</span>
                      <span className="text-[11px] text-slate-400 font-medium">Empaque: {r.pack_name}</span>
                    </div>
                  )}
                  style={{ minWidth: '220px' }}
                />

                {/* Col 1: ODC Original */}
                <Column
                  header="[1] ODC Pactada"
                  body={(r) => (
                    <div className="flex flex-col items-end gap-0.5 text-right font-medium">
                      <span className="text-slate-600 font-bold">{r.ordered_qty} {r.uom}</span>
                      <span className="text-slate-500 text-[11px]">${r.unit_cost.toFixed(2)}/u</span>
                      <span className="text-slate-700 font-bold text-xs border-t border-slate-200 pt-0.5 mt-0.5">
                        ${(r.ordered_qty * r.unit_cost).toFixed(2)}
                      </span>
                    </div>
                  )}
                  align="right"
                  style={{ width: '130px' }}
                />

                {/* Col 2: WMS Recepción Muelle */}
                <Column
                  header="[2] Recepción WMS"
                  body={(r) => {
                    const isShort = r.received_qty < r.ordered_qty;
                    return (
                      <div className="flex flex-col items-end gap-0.5 text-right font-medium">
                        <span className={`font-black px-1.5 py-0.5 rounded ${isShort ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                          {r.received_qty} {r.uom}
                        </span>
                        <span className="text-slate-500 text-[11px]">${r.unit_cost.toFixed(2)}/u</span>
                        <span className="text-slate-800 font-bold text-xs border-t border-slate-200 pt-0.5 mt-0.5">
                          ${(r.received_qty * r.unit_cost).toFixed(2)}
                        </span>
                      </div>
                    );
                  }}
                  align="right"
                  style={{ width: '140px' }}
                />

                {/* Col 3: Factura Proveedor */}
                <Column
                  header="[3] Factura Proveedor (Editable)"
                  body={(r, options) => {
                    const isPriceHike = r.billed_unit_cost > r.unit_cost;
                    const isQtyOver = r.billed_qty > r.received_qty;
                    return (
                      <div className="flex flex-col items-end gap-1.5 bg-indigo-50/40 p-2 rounded-lg border border-indigo-100">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-500">Cant:</span>
                          <InputNumber
                            value={r.billed_qty}
                            onValueChange={(e) => handleBilledQtyChange(options.rowIndex, e.value)}
                            minFractionDigits={0}
                            maxFractionDigits={2}
                            inputClassName={`w-20 text-right font-bold py-1 px-2 text-xs rounded border ${
                              isQtyOver ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300'
                            }`}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-500">Costo:</span>
                          <InputNumber
                            value={r.billed_unit_cost}
                            onValueChange={(e) => handleBilledCostChange(options.rowIndex, e.value)}
                            mode="currency"
                            currency="USD"
                            minFractionDigits={2}
                            maxFractionDigits={4}
                            inputClassName={`w-24 text-right font-bold py-1 px-2 text-xs rounded border ${
                              isPriceHike ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-300'
                            }`}
                          />
                        </div>
                        <div className="text-indigo-900 font-black text-xs pt-1 border-t border-indigo-200/60 w-full text-right">
                          ${(r.billed_qty * r.billed_unit_cost).toFixed(2)}
                        </div>
                      </div>
                    );
                  }}
                  align="right"
                  style={{ width: '190px' }}
                />

                {/* Col 4: Variación y Estado */}
                <Column
                  header="[4] Variación & Estado"
                  body={(r) => {
                    const diffQty = r.billed_qty - r.received_qty;
                    const diffCost = r.billed_unit_cost - r.unit_cost;
                    const diffMoney = (r.billed_qty * r.billed_unit_cost) - (r.received_qty * r.unit_cost);
                    const isExact = Math.abs(diffMoney) < 0.01;

                    return (
                      <div className="flex flex-col items-start gap-1">
                        {isExact ? (
                          <Tag value="Match 100%" severity="success" icon="pi pi-check" className="text-[10px] font-bold" />
                        ) : (
                          <>
                            {diffQty > 0 && (
                              <Tag value={`Faltante: +${diffQty}u`} severity="danger" className="text-[10px] font-bold" />
                            )}
                            {diffCost > 0 && (
                              <Tag value={`Sobreprecio: +$${diffCost.toFixed(2)}`} severity="warning" className="text-[10px] font-bold" />
                            )}
                            <span className="text-red-600 font-black text-xs mt-0.5">
                              Retención: -${diffMoney.toFixed(2)}
                            </span>
                          </>
                        )}
                      </div>
                    );
                  }}
                  style={{ width: '160px' }}
                />

                {/* Col 5: Margen y Nuevo PVP */}
                <Column
                  header="[5] Margen & PVP Sugerido"
                  body={(r, options) => {
                    const originalMargin = r.sales_price > 0 ? ((r.sales_price - r.unit_cost) / r.sales_price) * 100 : 0;
                    const newMargin = r.new_sales_price > 0 ? ((r.new_sales_price - r.billed_unit_cost) / r.new_sales_price) * 100 : 0;
                    const isErosion = r.billed_unit_cost > r.unit_cost;

                    return (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-[10px] font-bold">
                          <span className="text-slate-400">PVP Actual: ${r.sales_price.toFixed(2)}</span>
                          <span className={isErosion && newMargin < originalMargin ? "text-red-500 font-black" : "text-emerald-600"}>
                            {originalMargin.toFixed(1)}% → {newMargin.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded border border-slate-200">
                          <InputNumber
                            value={newMargin}
                            onValueChange={(e) => handleTargetMarginChange(options.rowIndex, e.value, r.billed_unit_cost)}
                            suffix="%"
                            minFractionDigits={1}
                            maxFractionDigits={1}
                            inputClassName="w-16 text-center font-bold py-0.5 px-1 text-xs text-indigo-700 bg-white border border-indigo-200 rounded"
                            placeholder="Margen"
                            title="Ajusta el margen deseado"
                          />
                          <i className="pi pi-arrow-right text-[10px] text-slate-400"></i>
                          <InputNumber
                            value={r.new_sales_price}
                            onValueChange={(e) => handleNewSalesPriceChange(options.rowIndex, e.value)}
                            mode="currency"
                            currency="USD"
                            minFractionDigits={2}
                            maxFractionDigits={2}
                            inputClassName={`w-24 text-right font-black py-0.5 px-1 text-xs rounded border ${
                              isErosion ? 'border-red-400 text-red-700 bg-red-50' : 'border-slate-300 bg-white'
                            }`}
                            placeholder="Nuevo PVP"
                            title="Nuevo Precio de Venta al Público"
                          />
                        </div>
                      </div>
                    );
                  }}
                  style={{ width: '220px' }}
                />
              </DataTable>
            </div>

            {/* Financial Settlement Box */}
            <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div>
                  <span className="text-xs uppercase tracking-wider font-bold text-slate-400 block">Total ODC</span>
                  <span className="text-xl font-bold text-slate-300">${financialTotals.totalOrdered.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-xs uppercase tracking-wider font-bold text-slate-400 block">Total Muelle (WMS)</span>
                  <span className="text-xl font-bold text-emerald-400">${financialTotals.totalReceived.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-xs uppercase tracking-wider font-bold text-slate-400 block">Factura Proveedor</span>
                  <span className="text-xl font-bold text-indigo-300">${financialTotals.totalBilled.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-xs uppercase tracking-wider font-bold text-amber-400 block">Nota de Débito (Deducción)</span>
                  <span className="text-xl font-black text-amber-400">-${financialTotals.totalDebitNote.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex flex-col items-end border-t md:border-t-0 md:border-l border-slate-700 pt-4 md:pt-0 md:pl-6">
                <span className="text-xs uppercase tracking-widest font-black text-emerald-400">Neto Autorizado a Pagar (CxP)</span>
                <span className="text-3xl font-black text-white">${financialTotals.netPayable.toFixed(2)}</span>
                <span className="text-xs font-mono text-slate-400 mt-1">
                  Bs. {(financialTotals.netPayable * Number(selectedOrder?.exchange_rate || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button
                label="Rechazar Factura a Proveedor"
                icon="pi pi-times-circle"
                severity="danger"
                outlined
                className="font-bold text-xs py-2 px-4 shadow-sm"
                onClick={() => submitAction('REJECT')}
                disabled={savingAction}
              />

              <div className="flex items-center gap-3">
                {financialTotals.hasDiscrepancy ? (
                  <Button
                    label="Aprobar con Nota de Débito Automática"
                    icon="pi pi-file-edit"
                    severity="warning"
                    className="font-black text-xs py-2.5 px-6 shadow-lg shadow-amber-500/20"
                    onClick={() => submitAction('APPROVE_WITH_DEBIT_NOTE')}
                    loading={savingAction}
                  />
                ) : (
                  <Button
                    label="Aprobar Pago 100% Match Exacto"
                    icon="pi pi-verified"
                    severity="success"
                    className="font-black text-xs py-2.5 px-6 shadow-lg shadow-emerald-500/20"
                    onClick={() => submitAction('EXACT_MATCH')}
                    loading={savingAction}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* DEBIT NOTE VOUCHER MODAL */}
      <Dialog
        header="Comprobante Oficial de Nota de Débito por Discrepancia"
        visible={showDebitNoteModal}
        style={{ width: '650px' }}
        onHide={() => setShowDebitNoteModal(false)}
      >
        {loadingDebitNote ? (
          <div className="py-12 text-center text-slate-400">
            <i className="pi pi-spin pi-spinner text-2xl text-purple-500 mb-2"></i>
            <p>Generando comprobante de Nota de Débito...</p>
          </div>
        ) : debitNoteData ? (
          <div className="space-y-4 pt-2 text-slate-800" id="debit-note-voucher">
            <div className="border-b-2 border-slate-800 pb-3 flex justify-between items-start">
              <div>
                <h3 className="text-base font-black text-slate-900">{debitNoteData.company.name}</h3>
                <p className="text-xs text-slate-500 font-mono">RIF: {debitNoteData.company.rif}</p>
                <p className="text-xs text-slate-400">{debitNoteData.company.address}</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold uppercase text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-200 block mb-1">
                  {debitNoteData.debit_note_number}
                </span>
                <span className="text-xs text-slate-500 font-medium">Fecha: {debitNoteData.date}</span>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="font-bold text-slate-500 block">Proveedor:</span>
                <span className="font-black text-slate-800">{debitNoteData.supplier.name}</span>
                <span className="text-slate-400 block font-mono">RIF: {debitNoteData.supplier.tax_id}</span>
              </div>
              <div className="text-right">
                <span className="font-bold text-slate-500 block">Afecta Factura:</span>
                <span className="font-mono font-bold text-indigo-700">{debitNoteData.supplier_invoice_number}</span>
                <span className="text-slate-400 block">Orden: {debitNoteData.purchase_order_reference}</span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold">
                  <tr>
                    <th className="p-2">Ítem / Concepto</th>
                    <th className="p-2 text-center">Físico</th>
                    <th className="p-2 text-center">Facturado</th>
                    <th className="p-2 text-right">Deducción USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {debitNoteData.items.map((it: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2">
                        <span className="font-bold text-slate-800 block">{it.description}</span>
                        <span className="text-[10px] text-red-600 font-medium">{it.reason}</span>
                      </td>
                      <td className="p-2 text-center font-bold text-emerald-600">{it.qty_received}</td>
                      <td className="p-2 text-center font-bold text-indigo-600">{it.qty_billed}</td>
                      <td className="p-2 text-right font-black text-red-700">-${it.deduction_amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 flex justify-between items-center">
              <div>
                <span className="text-xs font-black uppercase text-purple-900 block">Total Nota de Débito</span>
                <span className="text-xs text-purple-700">Tasa: Bs. {debitNoteData.currency.exchange_rate.toFixed(2)}</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-purple-950 block">
                  -${debitNoteData.totals.total_debit_usd.toFixed(2)} USD
                </span>
                <span className="text-xs font-mono font-bold text-purple-800">
                  -Bs. {debitNoteData.totals.total_debit_ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 italic pt-2">
              * Este comprobante descuenta formalmente el saldo pendiente por pagar a favor del proveedor según la auditoría física del WMS.
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <Button
                label="Imprimir Comprobante"
                icon="pi pi-print"
                size="small"
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2 px-4"
                onClick={() => window.print()}
              />
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
