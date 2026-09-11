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

interface SellOutLine {
  id?: number;
  variant_id: number;
  sku?: string;
  product_name?: string;
  regular_price: number;
  promo_price: number;
  discount_per_unit: number;
  provider_share_pct: number;
  provider_share_fixed: number;
  units_sold_qty?: number;
  claim_amount?: number;
}

interface SellOutAgreement {
  id: number;
  agreement_code: string;
  title: string;
  supplier_id: number;
  supplier_name?: string;
  start_date: string;
  end_date: string;
  status: string;
  total_units_sold: number;
  total_claim_amount: number;
  credit_note_number?: string;
  credit_note_amount?: number;
  credit_note_date?: string;
  conciliation_status?: string;
  conciliation_notes?: string;
  lines: SellOutLine[];
  created_at: string;
}

export default function SellOutAgreementsPage() {
  const toast = useRef<Toast>(null);

  const [agreements, setAgreements] = useState<SellOutAgreement[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState<boolean>(false);
  const [showConciliateDialog, setShowConciliateDialog] = useState<boolean>(false);
  const [showDetailDialog, setShowDetailDialog] = useState<boolean>(false);
  const [selectedAgreement, setSelectedAgreement] = useState<SellOutAgreement | null>(null);

  // Create Form State
  const [newCode, setNewCode] = useState<string>('');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newSupplierId, setNewSupplierId] = useState<number | null>(null);
  const [newDates, setNewDates] = useState<(Date | null)[]>([new Date(), new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)]);
  const [newNotes, setNewNotes] = useState<string>('');
  const [newLines, setNewLines] = useState<SellOutLine[]>([]);
  const [savingAgreement, setSavingAgreement] = useState<boolean>(false);

  // Conciliate Form State
  const [ncNumber, setNcNumber] = useState<string>('');
  const [ncAmount, setNcAmount] = useState<number>(0);
  const [ncDate, setNcDate] = useState<Date | null>(new Date());
  const [ncNotes, setNcNotes] = useState<string>('');
  const [savingConciliation, setSavingConciliation] = useState<boolean>(false);

  // Action Loading
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const fetchAgreements = async () => {
    setLoading(true);
    try {
      const res = await api.get('/sell-out/');
      setAgreements(res.data || []);
    } catch (err: any) {
      console.error("Error al cargar convenios Sell-Out:", err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudieron cargar los convenios de Sell-Out.'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliersAndProducts = async () => {
    try {
      const [suppRes, prodRes] = await Promise.all([
        api.get('/suppliers/'),
        api.get('/products/')
      ]);
      setSuppliers(suppRes.data || []);
      // Map variants from products
      const variantsList: any[] = [];
      (prodRes.data || []).forEach((p: any) => {
        if (p.variants && p.variants.length > 0) {
          p.variants.forEach((v: any) => {
            variantsList.push({
              variant_id: v.id,
              label: `${v.sku} - ${p.name} ${v.name ? `(${v.name})` : ''}`,
              regular_price: Number(v.sales_price || 0),
              sku: v.sku,
              product_name: p.name
            });
          });
        }
      });
      setProducts(variantsList);
    } catch (e) {
      console.warn("Error cargando catálogos auxiliares:", e);
    }
  };

  useEffect(() => {
    fetchAgreements();
    fetchSuppliersAndProducts();
  }, []);

  // KPIs
  const kpis = useMemo(() => {
    let activeCount = 0;
    let settledCount = 0;
    let conciliatedCount = 0;
    let totalClaim = 0;
    let totalUnits = 0;

    agreements.forEach((a) => {
      if (a.status === 'ACTIVE') activeCount++;
      if (a.status === 'SETTLED') settledCount++;
      if (a.status === 'CONCILIATED') conciliatedCount++;
      totalClaim += Number(a.total_claim_amount || 0);
      totalUnits += Number(a.total_units_sold || 0);
    });

    return { activeCount, settledCount, conciliatedCount, totalClaim, totalUnits };
  }, [agreements]);

  // Clara Settle Trigger
  const handleSettleAgreement = async (id: number) => {
    setActionLoadingId(id);
    try {
      const res = await api.post(`/sell-out/${id}/settle`);
      toast.current?.show({
        severity: 'success',
        summary: 'Liquidación Auditada por Clara',
        detail: `Se auditaron ${res.data.total_units_sold} unidades POS. Monto liquidado a reclamar: $${Number(res.data.total_claim_amount).toFixed(2)} USD.`,
        life: 5000
      });
      fetchAgreements();
    } catch (err: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Error en Liquidación',
        detail: err?.response?.data?.detail || 'No se pudo liquidar el convenio.'
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open Conciliation Modal
  const openConciliationModal = (agreement: SellOutAgreement) => {
    setSelectedAgreement(agreement);
    setNcNumber(agreement.credit_note_number || '');
    setNcAmount(Number(agreement.credit_note_amount || agreement.total_claim_amount || 0));
    setNcDate(agreement.credit_note_date ? new Date(agreement.credit_note_date) : new Date());
    setNcNotes(agreement.conciliation_notes || '');
    setShowConciliateDialog(true);
  };

  // Submit Conciliation 3-Way
  const handleConciliateSubmit = async () => {
    if (!selectedAgreement) return;
    if (!ncNumber || !ncAmount) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Datos Incompletos',
        detail: 'Indica el número y monto de la Nota de Crédito.'
      });
      return;
    }

    setSavingConciliation(true);
    try {
      const payload = {
        credit_note_number: ncNumber,
        credit_note_amount: ncAmount,
        credit_note_date: ncDate ? format(ncDate, 'yyyy-MM-dd') : undefined,
        notes: ncNotes
      };
      const res = await api.post(`/sell-out/${selectedAgreement.id}/conciliate-nc`, payload);

      const status = res.data.conciliation_status;
      if (status === 'MATCH_EXACT') {
        toast.current?.show({
          severity: 'success',
          summary: 'Conciliación 3-Way Exacta',
          detail: 'La Nota de Crédito coincide exactamente con el monto liquidado por Clara.',
          life: 5000
        });
      } else {
        toast.current?.show({
          severity: 'warn',
          summary: 'Conciliación con Discrepancia',
          detail: `Diferencia de $${Number(res.data.discrepancy_amount).toFixed(2)} USD. Notificada en compras.`,
          life: 6000
        });
      }

      setShowConciliateDialog(false);
      fetchAgreements();
    } catch (err: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Fallo al Conciliar',
        detail: err?.response?.data?.detail || 'No se pudo conciliar la Nota de Crédito.'
      });
    } finally {
      setSavingConciliation(false);
    }
  };

  // Create Agreement Line Add
  const addLine = () => {
    setNewLines([
      ...newLines,
      {
        variant_id: 0,
        regular_price: 0,
        promo_price: 0,
        discount_per_unit: 0,
        provider_share_pct: 100,
        provider_share_fixed: 0
      }
    ]);
  };

  const removeLine = (index: number) => {
    setNewLines(newLines.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: keyof SellOutLine, value: any) => {
    const updated = [...newLines];
    const item = { ...updated[index], [field]: value };

    // Auto-calculate discount
    if (field === 'promo_price' || field === 'regular_price') {
      const reg = field === 'regular_price' ? Number(value) : item.regular_price;
      const promo = field === 'promo_price' ? Number(value) : item.promo_price;
      item.discount_per_unit = Math.max(0, reg - promo);
      item.provider_share_fixed = item.discount_per_unit * (item.provider_share_pct / 100);
    } else if (field === 'provider_share_pct') {
      item.provider_share_fixed = item.discount_per_unit * (Number(value) / 100);
    }

    updated[index] = item;
    setNewLines(updated);
  };

  // Submit Create Agreement
  const handleCreateAgreement = async () => {
    if (!newSupplierId || !newTitle || !newDates[0] || !newDates[1]) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Campos Obligatorios',
        detail: 'Completa proveedor, título y fechas de vigencia.'
      });
      return;
    }

    if (newLines.length === 0 || newLines.some(l => l.variant_id === 0)) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Líneas Inválidas',
        detail: 'Agrega al menos un SKU válido para el convenio.'
      });
      return;
    }

    setSavingAgreement(true);
    try {
      const payload = {
        agreement_code: newCode || `SO-${Date.now().toString().slice(-6)}`,
        title: newTitle,
        supplier_id: newSupplierId,
        start_date: format(newDates[0], 'yyyy-MM-dd'),
        end_date: format(newDates[1], 'yyyy-MM-dd'),
        notes: newNotes,
        lines: newLines.map(l => ({
          variant_id: l.variant_id,
          regular_price: l.regular_price,
          promo_price: l.promo_price,
          discount_per_unit: l.discount_per_unit,
          provider_share_pct: l.provider_share_pct,
          provider_share_fixed: l.provider_share_fixed
        }))
      };

      await api.post('/sell-out/', payload);
      toast.current?.show({
        severity: 'success',
        summary: 'Convenio Sell-Out Creado',
        detail: 'El convenio quedó activo para auditar ventas en POS.'
      });

      setShowCreateDialog(false);
      // Reset form
      setNewCode('');
      setNewTitle('');
      setNewSupplierId(null);
      setNewNotes('');
      setNewLines([]);
      fetchAgreements();
    } catch (err: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: err?.response?.data?.detail || 'No se pudo guardar el convenio.'
      });
    } finally {
      setSavingAgreement(false);
    }
  };

  // Status tag renderer
  const renderStatus = (rowData: SellOutAgreement) => {
    const config: Record<string, { severity: 'success' | 'info' | 'warning' | 'danger' | 'secondary', label: string }> = {
      ACTIVE: { severity: 'success', label: 'VIGENTE' },
      SETTLED: { severity: 'info', label: 'LIQUIDADO' },
      CONCILIATED: { severity: 'success', label: 'CONCILIADO 3-WAY' },
      DRAFT: { severity: 'secondary', label: 'BORRADOR' },
      EXPIRED: { severity: 'warning', label: 'VENCIDO' },
      CANCELLED: { severity: 'danger', label: 'ANULADO' },
    };
    const c = config[rowData.status] || { severity: 'secondary', label: rowData.status };
    return <Tag severity={c.severity} value={c.label} className="text-xs font-semibold px-2 py-1" />;
  };

  const renderConciliationStatus = (rowData: SellOutAgreement) => {
    if (!rowData.conciliation_status || rowData.conciliation_status === 'PENDING') {
      return <span className="text-slate-400 text-xs italic">Pendiente N/C</span>;
    }
    if (rowData.conciliation_status === 'MATCH_EXACT') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">
          <i className="pi pi-check text-[10px]"></i> Exacto 3-Way
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-200">
        <i className="pi pi-exclamation-triangle text-[10px]"></i> Discrepancia
      </span>
    );
  };

  const filteredAgreements = useMemo(() => {
    return agreements.filter(a => {
      const matchSearch = searchTerm === '' || 
        a.agreement_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.supplier_name && a.supplier_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (a.credit_note_number && a.credit_note_number.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchStatus = !statusFilter || a.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [agreements, searchTerm, statusFilter]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto flex flex-col gap-6">
      <Toast ref={toast} />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-black tracking-tight text-slate-800">
              Neo Compras: Convenios Sell-Out & N/C
            </h1>
            <span className="bg-emerald-100/80 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-emerald-200">
              <i className="pi pi-sparkles text-emerald-600"></i> Auditoría Clara
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Control de convenios comerciales, auditoría de unidades vendidas en POS y conciliación 3-Way de Notas de Crédito emitidas por proveedores.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            label="Actualizar"
            icon="pi pi-refresh"
            severity="secondary"
            outlined
            className="p-button-sm rounded-xl font-medium"
            onClick={fetchAgreements}
            loading={loading}
          />
          <Button
            label="Nuevo Convenio Sell-Out"
            icon="pi pi-plus"
            className="p-button-sm rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-700 border-none shadow-md shadow-emerald-600/20"
            onClick={() => {
              setNewCode(`SO-${Date.now().toString().slice(-6)}`);
              setNewLines([]);
              setShowCreateDialog(true);
            }}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Convenios Vigentes</div>
            <div className="text-2xl font-black text-slate-800 mt-1">{kpis.activeCount}</div>
            <div className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <i className="pi pi-arrow-up-right"></i> En periodo de promoción
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-bold">
            <i className="pi pi-tags"></i>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Unidades POS Auditadas</div>
            <div className="text-2xl font-black text-slate-800 mt-1">{Number(kpis.totalUnits).toLocaleString()}</div>
            <div className="text-xs text-slate-500 font-medium mt-1">Registradas durante vigencia</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold">
            <i className="pi pi-shopping-cart"></i>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Monto Total a Reclamar</div>
            <div className="text-2xl font-black text-slate-800 mt-1">${kpis.totalClaim.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="text-xs text-amber-600 font-medium mt-1">Aporte acumulado proveedores</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold">
            <i className="pi pi-dollar"></i>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Conciliados 3-Way</div>
            <div className="text-2xl font-black text-slate-800 mt-1">{kpis.conciliatedCount}</div>
            <div className="text-xs text-emerald-600 font-medium mt-1">Con N/C verificada y cerrada</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center text-xl font-bold">
            <i className="pi pi-check-circle"></i>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Table Filters */}
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <span className="p-input-icon-left w-full md:w-80">
              <i className="pi pi-search text-slate-400" />
              <InputText
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar código, título, proveedor..."
                className="w-full text-sm rounded-xl pl-9"
              />
            </span>

            <Dropdown
              value={statusFilter}
              options={[
                { label: 'Todos los estados', value: null },
                { label: 'Vigentes (ACTIVE)', value: 'ACTIVE' },
                { label: 'Liquidados (SETTLED)', value: 'SETTLED' },
                { label: 'Conciliados (CONCILIATED)', value: 'CONCILIATED' },
                { label: 'Borrador (DRAFT)', value: 'DRAFT' }
              ]}
              onChange={(e) => setStatusFilter(e.value)}
              placeholder="Estado"
              className="text-sm rounded-xl"
            />
          </div>

          <div className="text-xs text-slate-400 font-medium">
            Mostrando {filteredAgreements.length} convenios
          </div>
        </div>

        <DataTable
          value={filteredAgreements}
          loading={loading}
          paginator
          rows={10}
          rowsPerPageOptions={[5, 10, 25]}
          emptyMessage="No se encontraron convenios Sell-Out."
          className="text-sm"
          rowHover
        >
          <Column
            field="agreement_code"
            header="Código"
            body={(row: SellOutAgreement) => (
              <span className="font-mono font-bold text-slate-800">{row.agreement_code}</span>
            )}
            sortable
            style={{ width: '130px' }}
          />

          <Column
            field="title"
            header="Convenio & Proveedor"
            body={(row: SellOutAgreement) => (
              <div>
                <div className="font-semibold text-slate-800">{row.title}</div>
                <div className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                  <i className="pi pi-building text-[10px]"></i> {row.supplier_name || `Proveedor #${row.supplier_id}`}
                </div>
              </div>
            )}
          />

          <Column
            header="Vigencia"
            body={(row: SellOutAgreement) => (
              <div className="text-xs text-slate-600 font-medium">
                <div>Desde: {row.start_date}</div>
                <div>Hasta: {row.end_date}</div>
              </div>
            )}
            style={{ width: '150px' }}
          />

          <Column
            field="status"
            header="Estado"
            body={renderStatus}
            sortable
            style={{ width: '140px' }}
          />

          <Column
            header="Unidades POS"
            body={(row: SellOutAgreement) => (
              <div className="text-right font-medium">
                <span className="text-slate-800 font-bold">{Number(row.total_units_sold || 0).toLocaleString()}</span>
                <span className="text-xs text-slate-400 block">vendidas</span>
              </div>
            )}
            style={{ width: '110px' }}
          />

          <Column
            header="Reclamo USD"
            body={(row: SellOutAgreement) => (
              <div className="text-right">
                <div className="font-bold text-emerald-700">
                  ${Number(row.total_claim_amount || 0).toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-400">Aporte pactado</div>
              </div>
            )}
            style={{ width: '130px' }}
          />

          <Column
            header="Nota de Crédito"
            body={(row: SellOutAgreement) => (
              <div className="text-xs">
                {row.credit_note_number ? (
                  <div>
                    <span className="font-mono font-bold text-slate-800">{row.credit_note_number}</span>
                    <div className="text-slate-500">${Number(row.credit_note_amount || 0).toFixed(2)} USD</div>
                    {renderConciliationStatus(row)}
                  </div>
                ) : (
                  <span className="text-slate-400 italic">Sin registrar</span>
                )}
              </div>
            )}
            style={{ width: '160px' }}
          />

          <Column
            header="Acciones"
            body={(row: SellOutAgreement) => (
              <div className="flex items-center gap-2 justify-end">
                <Button
                  icon="pi pi-eye"
                  severity="secondary"
                  text
                  rounded
                  tooltip="Ver SKUs y Detalle"
                  tooltipOptions={{ position: 'top' }}
                  onClick={() => {
                    setSelectedAgreement(row);
                    setShowDetailDialog(true);
                  }}
                />

                {row.status === 'ACTIVE' && (
                  <Button
                    label="Liquidar Clara"
                    icon="pi pi-sparkles"
                    size="small"
                    className="p-button-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-2.5 py-1 border-none shadow-sm"
                    loading={actionLoadingId === row.id}
                    onClick={() => handleSettleAgreement(row.id)}
                    tooltip="Audita ventas en POS del periodo y calcula monto a reclamar"
                    tooltipOptions={{ position: 'top' }}
                  />
                )}

                {row.status === 'SETTLED' && (
                  <Button
                    label="Conciliar N/C"
                    icon="pi pi-check-circle"
                    size="small"
                    severity="warning"
                    className="p-button-sm rounded-lg text-xs font-semibold px-2.5 py-1 shadow-sm"
                    onClick={() => openConciliationModal(row)}
                    tooltip="Registrar N/C del proveedor y realizar 3-Way Match"
                    tooltipOptions={{ position: 'top' }}
                  />
                )}

                {row.status === 'CONCILIATED' && (
                  <Tag severity="success" value="OK CERRADO" className="text-[10px]" />
                )}
              </div>
            )}
            style={{ width: '180px' }}
          />
        </DataTable>
      </div>

      {/* Modal Conciliación N/C */}
      <Dialog
        header={
          <div className="flex items-center gap-2">
            <i className="pi pi-check-circle text-emerald-600"></i>
            <span className="font-bold text-slate-800">Conciliación 3-Way Match de Nota de Crédito</span>
          </div>
        }
        visible={showConciliateDialog}
        style={{ width: '550px' }}
        onHide={() => setShowConciliateDialog(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              label="Cancelar"
              severity="secondary"
              text
              onClick={() => setShowConciliateDialog(false)}
            />
            <Button
              label="Validar & Conciliar 3-Way"
              icon="pi pi-check"
              className="bg-emerald-600 hover:bg-emerald-700 border-none font-semibold"
              onClick={handleConciliateSubmit}
              loading={savingConciliation}
            />
          </div>
        }
      >
        {selectedAgreement && (
          <div className="flex flex-col gap-4 pt-2">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="text-xs text-slate-500">Convenio Seleccionado:</div>
              <div className="font-bold text-slate-800 text-sm">{selectedAgreement.agreement_code} - {selectedAgreement.title}</div>
              <div className="text-xs text-slate-600 mt-1">Proveedor: <span className="font-semibold">{selectedAgreement.supplier_name || `#${selectedAgreement.supplier_id}`}</span></div>
              <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between items-center text-sm">
                <span className="text-slate-600">Monto Liquidado por Clara:</span>
                <span className="font-extrabold text-emerald-700 text-base">${Number(selectedAgreement.total_claim_amount || 0).toFixed(2)} USD</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700">Número de Nota de Crédito del Proveedor *</label>
              <InputText
                value={ncNumber}
                onChange={(e) => setNcNumber(e.target.value)}
                placeholder="Ej: NC-2026-00918"
                className="text-sm rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700">Monto Emitido en N/C ($ USD) *</label>
                <InputNumber
                  value={ncAmount}
                  onValueChange={(e) => setNcAmount(e.value || 0)}
                  mode="currency"
                  currency="USD"
                  locale="en-US"
                  minFractionDigits={2}
                  className="text-sm rounded-xl"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700">Fecha de Emisión de N/C *</label>
                <Calendar
                  value={ncDate}
                  onChange={(e) => setNcDate(e.value as Date)}
                  dateFormat="yy-mm-dd"
                  showIcon
                  className="text-sm rounded-xl"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700">Observaciones de Conciliación</label>
              <InputTextarea
                value={ncNotes}
                onChange={(e) => setNcNotes(e.target.value)}
                rows={3}
                placeholder="Detalles adicionales o justificación de diferencias..."
                className="text-sm rounded-xl"
              />
            </div>
          </div>
        )}
      </Dialog>

      {/* Modal Crear Convenio Sell-Out */}
      <Dialog
        header={
          <div className="flex items-center gap-2">
            <i className="pi pi-tags text-emerald-600"></i>
            <span className="font-bold text-slate-800">Nuevo Convenio Comercial Sell-Out</span>
          </div>
        }
        visible={showCreateDialog}
        style={{ width: '850px' }}
        onHide={() => setShowCreateDialog(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              label="Cancelar"
              severity="secondary"
              text
              onClick={() => setShowCreateDialog(false)}
            />
            <Button
              label="Guardar Convenio"
              icon="pi pi-check"
              className="bg-emerald-600 hover:bg-emerald-700 border-none font-semibold"
              onClick={handleCreateAgreement}
              loading={savingAgreement}
            />
          </div>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700">Código del Convenio *</label>
              <InputText
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="SO-XXXX"
                className="text-sm rounded-xl"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700">Proveedor *</label>
              <Dropdown
                value={newSupplierId}
                options={suppliers.map(s => ({ label: `${s.tax_id} - ${s.name}`, value: s.id }))}
                onChange={(e) => setNewSupplierId(e.value)}
                placeholder="Selecciona proveedor..."
                filter
                className="text-sm rounded-xl"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700">Título o Campaña Promocional *</label>
            <InputText
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Ej: Oferta Aniversario - Descuento 20% en Línea Lácteos"
              className="text-sm rounded-xl"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700">Periodo de Vigencia (Desde - Hasta) *</label>
              <Calendar
                value={newDates}
                onChange={(e) => setNewDates(e.value as (Date | null)[])}
                selectionMode="range"
                readOnlyInput
                dateFormat="yy-mm-dd"
                showIcon
                className="text-sm rounded-xl"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700">Observaciones del Acuerdo</label>
              <InputText
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Condiciones pactadas con la gerencia comercial..."
                className="text-sm rounded-xl"
              />
            </div>
          </div>

          {/* Lines */}
          <div className="border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                SKUs Participantes & Aporte del Proveedor
              </label>
              <Button
                label="Agregar SKU"
                icon="pi pi-plus"
                size="small"
                outlined
                className="p-button-sm text-xs rounded-xl"
                onClick={addLine}
              />
            </div>

            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
              {newLines.map((line, idx) => (
                <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col md:flex-row items-center gap-2">
                  <div className="flex-1 w-full">
                    <Dropdown
                      value={line.variant_id}
                      options={products.map(p => ({ label: p.label, value: p.variant_id }))}
                      onChange={(e) => {
                        const sel = products.find(p => p.variant_id === e.value);
                        updateLine(idx, 'variant_id', e.value);
                        if (sel) {
                          updateLine(idx, 'regular_price', sel.regular_price);
                        }
                      }}
                      placeholder="Seleccionar producto..."
                      filter
                      className="w-full text-xs rounded-lg"
                    />
                  </div>

                  <div className="w-24">
                    <label className="text-[10px] text-slate-500 font-bold block">PVP Reg.</label>
                    <InputNumber
                      value={line.regular_price}
                      onValueChange={(e) => updateLine(idx, 'regular_price', e.value || 0)}
                      mode="currency"
                      currency="USD"
                      locale="en-US"
                      minFractionDigits={2}
                      className="w-full text-xs"
                    />
                  </div>

                  <div className="w-24">
                    <label className="text-[10px] text-slate-500 font-bold block">PVP Promo</label>
                    <InputNumber
                      value={line.promo_price}
                      onValueChange={(e) => updateLine(idx, 'promo_price', e.value || 0)}
                      mode="currency"
                      currency="USD"
                      locale="en-US"
                      minFractionDigits={2}
                      className="w-full text-xs"
                    />
                  </div>

                  <div className="w-24">
                    <label className="text-[10px] text-slate-500 font-bold block">% Aporte</label>
                    <InputNumber
                      value={line.provider_share_pct}
                      onValueChange={(e) => updateLine(idx, 'provider_share_pct', e.value || 0)}
                      suffix="%"
                      className="w-full text-xs"
                    />
                  </div>

                  <div className="w-28 text-right">
                    <label className="text-[10px] text-slate-500 font-bold block">Aporte $/u</label>
                    <span className="font-bold text-emerald-700 text-xs">${line.provider_share_fixed.toFixed(2)}</span>
                  </div>

                  <Button
                    icon="pi pi-trash"
                    severity="danger"
                    text
                    rounded
                    onClick={() => removeLine(idx)}
                  />
                </div>
              ))}

              {newLines.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  Haz clic en &quot;Agregar SKU&quot; para registrar los productos en oferta.
                </div>
              )}
            </div>
          </div>
        </div>
      </Dialog>

      {/* Modal Ver Detalle */}
      <Dialog
        header={
          <div className="flex items-center gap-2">
            <i className="pi pi-info-circle text-blue-600"></i>
            <span className="font-bold text-slate-800">Detalle del Convenio {selectedAgreement?.agreement_code}</span>
          </div>
        }
        visible={showDetailDialog}
        style={{ width: '800px' }}
        onHide={() => setShowDetailDialog(false)}
      >
        {selectedAgreement && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block font-bold">Título:</span>
                <span className="font-bold text-slate-800">{selectedAgreement.title}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-bold">Vigencia:</span>
                <span className="text-slate-700">{selectedAgreement.start_date} al {selectedAgreement.end_date}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-bold">Total Unds Vendidas:</span>
                <span className="font-bold text-blue-700">{Number(selectedAgreement.total_units_sold || 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-bold">Monto Reclamo:</span>
                <span className="font-bold text-emerald-700">${Number(selectedAgreement.total_claim_amount || 0).toFixed(2)} USD</span>
              </div>
            </div>

            <DataTable value={selectedAgreement.lines} className="text-xs" emptyMessage="Sin SKUs asociados.">
              <Column field="sku" header="SKU" body={(r) => <span className="font-mono font-bold">{r.sku || `SKU #${r.variant_id}`}</span>} />
              <Column field="product_name" header="Producto" />
              <Column header="PVP Regular" body={(r) => `$${Number(r.regular_price).toFixed(2)}`} />
              <Column header="PVP Promo" body={(r) => `$${Number(r.promo_price).toFixed(2)}`} />
              <Column header="Desc. Unit." body={(r) => `$${Number(r.discount_per_unit).toFixed(2)}`} />
              <Column header="Aporte Prov." body={(r) => `${Number(r.provider_share_pct)}% ($${Number(r.provider_share_fixed).toFixed(2)})`} />
              <Column header="Unds Vendidas" body={(r) => Number(r.units_sold_qty || 0).toLocaleString()} />
              <Column header="Total Reclamo" body={(r) => <span className="font-bold text-emerald-700">${Number(r.claim_amount || 0).toFixed(2)}</span>} />
            </DataTable>
          </div>
        )}
      </Dialog>
    </div>
  );
}
