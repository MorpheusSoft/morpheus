"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Dialog } from 'primereact/dialog';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import { Dropdown } from 'primereact/dropdown';
import { TabView, TabPanel } from 'primereact/tabview';
import { InputTextarea } from 'primereact/inputtextarea';
import api from '@/lib/api';

interface DeadStockItem {
  variant_id: number;
  sku: string;
  product_name: string;
  category_name: string;
  qty_on_hand: number;
  replacement_cost: number;
  stock_valuation_usd: number;
  last_sale_date: string | null;
  days_without_sales: number;
  dead_stock_status: 'DEAD_STOCK' | 'SLOW_MOVING' | 'HEALTHY';
  is_blocked_for_purchasing: boolean;
  purchasing_blocked_reason: string | null;
  clara_recommended_action: string;
}

interface ShrinkageItem {
  variant_id: number;
  sku: string;
  product_name: string;
  sales_price: number;
  replacement_cost: number;
  gross_margin_pct: number;
  units_sold: number;
  units_shrinkage: number;
  shrinkage_cost_usd: number;
  shrinkage_pct: number;
  net_real_margin_pct: number;
  profitability_status: 'HEALTHY' | 'SHRINKAGE_RISK' | 'NEGATIVE_MARGIN';
  is_blocked_for_purchasing: boolean;
  purchasing_blocked_reason: string | null;
  clara_verdict: string;
}

interface ScheduledReportItem {
  id: number;
  report_code: string;
  title: string;
  period_year: number;
  period_month: number;
  file_url: string;
  file_size_kb: number;
  metadata_summary: any;
  created_at: string;
}

export default function DeadStockIntelligencePage() {
  const toast = useRef<Toast>(null);

  const [activeTab, setActiveTab] = useState<number>(0);

  // Data states
  const [deadStockData, setDeadStockData] = useState<{
    items: DeadStockItem[];
    total_capital_immobilized_usd: number;
    total_dead_stock_items: number;
    total_slow_moving_items: number;
    items_blocked_for_reorder: number;
  }>({
    items: [],
    total_capital_immobilized_usd: 0,
    total_dead_stock_items: 0,
    total_slow_moving_items: 0,
    items_blocked_for_reorder: 0
  });

  const [shrinkageData, setShrinkageData] = useState<{
    items: ShrinkageItem[];
    total_skus_evaluated: number;
    skus_with_shrinkage: number;
    total_shrinkage_cost_usd: number;
    skus_blocked_due_to_margin: number;
  }>({
    items: [],
    total_skus_evaluated: 0,
    skus_with_shrinkage: 0,
    total_shrinkage_cost_usd: 0,
    skus_blocked_due_to_margin: 0
  });

  const [scheduledReports, setScheduledReports] = useState<ScheduledReportItem[]>([]);

  // Loading states
  const [loadingDeadStock, setLoadingDeadStock] = useState<boolean>(true);
  const [loadingShrinkage, setLoadingShrinkage] = useState<boolean>(true);
  const [loadingReports, setLoadingReports] = useState<boolean>(false);
  const [generatingReport, setGeneratingReport] = useState<boolean>(false);

  // Filters
  const [daysThreshold, setDaysThreshold] = useState<number>(60);
  const [lookbackDays, setLookbackDays] = useState<number>(90);
  const [searchTermDead, setSearchTermDead] = useState<string>('');
  const [searchTermShrink, setSearchTermShrink] = useState<string>('');

  // Toggle Block Dialog
  const [showBlockDialog, setShowBlockDialog] = useState<boolean>(false);
  const [selectedVariant, setSelectedVariant] = useState<{ id: number; sku: string; name: string; isBlocked: boolean } | null>(null);
  const [blockReason, setBlockReason] = useState<string>('');
  const [submittingToggle, setSubmittingToggle] = useState<boolean>(false);

  // Fetch functions
  const fetchDeadStock = async () => {
    setLoadingDeadStock(true);
    try {
      const res = await api.get('/inventory-intelligence/dead-stock', {
        params: { days_threshold: daysThreshold, auto_block: false }
      });
      setDeadStockData(res.data);
    } catch (err: any) {
      console.error("Error al cargar Dead Stock:", err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo cargar la auditoría de Dead Stock.'
      });
    } finally {
      setLoadingDeadStock(false);
    }
  };

  const fetchShrinkage = async () => {
    setLoadingShrinkage(true);
    try {
      const res = await api.get('/inventory-intelligence/shrinkage-profitability', {
        params: { lookback_days: lookbackDays, auto_block: false }
      });
      setShrinkageData(res.data);
    } catch (err: any) {
      console.error("Error al cargar mermas:", err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo cargar la auditoría de mermas y rentabilidad.'
      });
    } finally {
      setLoadingShrinkage(false);
    }
  };

  const fetchScheduledReports = async () => {
    setLoadingReports(true);
    try {
      const res = await api.get('/inventory-intelligence/scheduled-reports');
      setScheduledReports(res.data || []);
    } catch (err) {
      console.warn("Error al cargar reportes programados:", err);
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    fetchDeadStock();
    fetchShrinkage();
    fetchScheduledReports();
  }, [daysThreshold, lookbackDays]);

  // Generate Monthly Report On Demand
  const handleGenerateMonthlyReport = async () => {
    setGeneratingReport(true);
    try {
      const res = await api.post('/inventory-intelligence/generate-monthly-report');
      toast.current?.show({
        severity: 'success',
        summary: 'Reporte Mensual Generado con Éxito',
        detail: `Archivo generado (${res.data.file_size_kb} KB). Se iniciará la descarga directa.`,
        life: 6000
      });

      // Direct download trigger
      const fullUrl = res.data.file_url.startsWith('http') 
        ? res.data.file_url 
        : `${api.defaults.baseURL?.replace('/api/v1', '')}${res.data.file_url}`;
      
      const link = document.createElement('a');
      link.href = fullUrl;
      link.setAttribute('download', res.data.file_name);
      document.body.appendChild(link);
      link.click();
      link.remove();

      fetchScheduledReports();
    } catch (err: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Error al Generar Reporte',
        detail: err?.response?.data?.detail || 'No se pudo generar el reporte integral.'
      });
    } finally {
      setGeneratingReport(false);
    }
  };

  // Toggle Reorder Block in MRP
  const openToggleDialog = (variantId: number, sku: string, name: string, isBlocked: boolean) => {
    setSelectedVariant({ id: variantId, sku, name, isBlocked });
    setBlockReason(isBlocked ? 'Desbloqueado manualmente por analista comercial' : 'Bloqueado por detección de stock estancado o margen crítico');
    setShowBlockDialog(true);
  };

  const handleToggleSubmit = async () => {
    if (!selectedVariant) return;
    setSubmittingToggle(true);
    try {
      const newBlockedState = !selectedVariant.isBlocked;
      await api.post(`/inventory-intelligence/toggle-purchasing-block/${selectedVariant.id}`, {
        is_blocked: newBlockedState,
        reason: blockReason
      });

      toast.current?.show({
        severity: newBlockedState ? 'warn' : 'success',
        summary: newBlockedState ? 'Recompra Bloqueada en MRP' : 'Recompra Desbloqueada en MRP',
        detail: `El SKU ${selectedVariant.sku} ha sido ${newBlockedState ? 'bloqueado' : 'desbloqueado'} para el generador de pedidos de Clara.`
      });

      setShowBlockDialog(false);
      fetchDeadStock();
      fetchShrinkage();
    } catch (err: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Fallo al Actualizar Estatus',
        detail: err?.response?.data?.detail || 'No se pudo modificar el bloqueo de compra.'
      });
    } finally {
      setSubmittingToggle(false);
    }
  };

  // Filtered lists
  const filteredDeadStock = useMemo(() => {
    return deadStockData.items.filter(item => {
      if (!searchTermDead) return true;
      const s = searchTermDead.toLowerCase();
      return item.sku.toLowerCase().includes(s) || 
             item.product_name.toLowerCase().includes(s) ||
             (item.category_name && item.category_name.toLowerCase().includes(s));
    });
  }, [deadStockData.items, searchTermDead]);

  const filteredShrinkage = useMemo(() => {
    return shrinkageData.items.filter(item => {
      if (!searchTermShrink) return true;
      const s = searchTermShrink.toLowerCase();
      return item.sku.toLowerCase().includes(s) || 
             item.product_name.toLowerCase().includes(s);
    });
  }, [shrinkageData.items, searchTermShrink]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto flex flex-col gap-6">
      <Toast ref={toast} />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-black tracking-tight text-slate-800">
              Neo Compras: Inteligencia de Inventario & Merma Real
            </h1>
            <span className="bg-rose-100/80 text-rose-800 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-rose-200">
              <i className="pi pi-shield text-rose-600"></i> Gatekeeper MRP Clara
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Detección de Dead Stock inmovilizado, auditoría de mermas registradas en WMS y protección de márgenes netos con bloqueo automático en el MRP.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            label="Descargar Informe Mensual (.xlsx)"
            icon="pi pi-file-excel"
            className="p-button-sm rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 border-none shadow-md shadow-emerald-600/20"
            onClick={handleGenerateMonthlyReport}
            loading={generatingReport}
            tooltip="Genera el libro integral de 5 pestañas de Neo ERP (ODC, Proveedores, Mermas, Dead Stock, Sell-Out)"
            tooltipOptions={{ position: 'bottom' }}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dead Stock Inmovilizado</div>
            <div className="text-2xl font-black text-rose-600 mt-1">{deadStockData.total_dead_stock_items} SKUs</div>
            <div className="text-xs text-slate-500 font-medium mt-1">&gt;{daysThreshold} días sin ninguna rotación</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl font-bold">
            <i className="pi pi-exclamation-circle"></i>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Capital Inmovilizado Crítico</div>
            <div className="text-2xl font-black text-slate-800 mt-1">
              ${Number(deadStockData.total_capital_immobilized_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-rose-600 font-medium mt-1">Valoración al costo en almacén</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold">
            <i className="pi pi-dollar"></i>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Bloqueados en MRP</div>
            <div className="text-2xl font-black text-slate-800 mt-1">
              {deadStockData.items_blocked_for_reorder} SKUs
            </div>
            <div className="text-xs text-indigo-600 font-medium mt-1">Protegidos contra recompras</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl font-bold">
            <i className="pi pi-lock"></i>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pérdidas por Merma WMS</div>
            <div className="text-2xl font-black text-slate-800 mt-1">
              ${Number(shrinkageData.total_shrinkage_cost_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1">Auditadas últimos {lookbackDays} días</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center text-xl font-bold">
            <i className="pi pi-trash"></i>
          </div>
        </div>
      </div>

      {/* Main Tabs Container */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-6">
        <TabView activeIndex={activeTab} onTabChange={(e) => setActiveTab(e.index)}>
          
          {/* TAB 1: DEAD STOCK */}
          <TabPanel
            header={
              <div className="flex items-center gap-2">
                <i className="pi pi-exclamation-triangle text-rose-500"></i>
                <span className="font-semibold">Dead Stock & Rotación Lenta (Caso 4)</span>
              </div>
            }
          >
            <div className="flex flex-col gap-4 pt-4">
              {/* Toolbar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3">
                  <span className="p-input-icon-left w-72">
                    <i className="pi pi-search text-slate-400" />
                    <InputText
                      value={searchTermDead}
                      onChange={(e) => setSearchTermDead(e.target.value)}
                      placeholder="Filtrar por SKU o producto..."
                      className="w-full text-xs rounded-xl pl-9"
                    />
                  </span>

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-600 whitespace-nowrap">Umbral Días Sin Venta:</label>
                    <Dropdown
                      value={daysThreshold}
                      options={[
                        { label: '30 días (Rotación Lenta)', value: 30 },
                        { label: '60 días (Dead Stock Estándar)', value: 60 },
                        { label: '90 días (Inmovilizado Crítico)', value: 90 }
                      ]}
                      onChange={(e) => setDaysThreshold(e.value)}
                      className="text-xs rounded-xl"
                    />
                  </div>
                </div>

                <div className="text-xs text-slate-500">
                  <Button
                    label="Re-auditar Almacenes"
                    icon="pi pi-refresh"
                    size="small"
                    outlined
                    className="text-xs rounded-xl font-semibold"
                    onClick={fetchDeadStock}
                    loading={loadingDeadStock}
                  />
                </div>
              </div>

              {/* Dead Stock Table */}
              <DataTable
                value={filteredDeadStock}
                loading={loadingDeadStock}
                paginator
                rows={10}
                rowsPerPageOptions={[5, 10, 25, 50]}
                emptyMessage="No se encontraron productos en condición de Dead Stock o rotación lenta."
                className="text-sm"
                rowHover
              >
                <Column
                  field="sku"
                  header="SKU"
                  body={(r: DeadStockItem) => (
                    <span className="font-mono font-bold text-slate-800">{r.sku}</span>
                  )}
                  sortable
                  style={{ width: '130px' }}
                />

                <Column
                  field="product_name"
                  header="Producto & Categoría"
                  body={(r: DeadStockItem) => (
                    <div>
                      <div className="font-semibold text-slate-800">{r.product_name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{r.category_name}</div>
                    </div>
                  )}
                />

                <Column
                  field="qty_on_hand"
                  header="Stock Actual"
                  body={(r: DeadStockItem) => (
                    <div className="text-right font-medium">
                      <span className="text-slate-800 font-bold">{Number(r.qty_on_hand).toLocaleString()}</span>
                      <span className="text-[11px] text-slate-400 block">en almacén</span>
                    </div>
                  )}
                  sortable
                  style={{ width: '110px' }}
                />

                <Column
                  field="days_without_sales"
                  header="Días Sin Venta"
                  body={(r: DeadStockItem) => (
                    <div className="text-center font-bold">
                      <span className={r.days_without_sales >= 60 ? 'text-rose-600' : 'text-amber-600'}>
                        {r.days_without_sales} días
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {r.last_sale_date ? `Última: ${r.last_sale_date}` : 'Sin ventas reg.'}
                      </span>
                    </div>
                  )}
                  sortable
                  style={{ width: '130px' }}
                />

                <Column
                  field="stock_valuation_usd"
                  header="Valor Inmovilizado"
                  body={(r: DeadStockItem) => (
                    <div className="text-right">
                      <div className="font-bold text-slate-800">
                        ${Number(r.stock_valuation_usd).toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400">@ ${Number(r.replacement_cost).toFixed(2)} c/u</div>
                    </div>
                  )}
                  sortable
                  style={{ width: '130px' }}
                />

                <Column
                  field="dead_stock_status"
                  header="Estatus Clara"
                  body={(r: DeadStockItem) => {
                    if (r.dead_stock_status === 'DEAD_STOCK') {
                      return <Tag severity="danger" value="DEAD STOCK" className="text-[10px] font-bold" />;
                    }
                    if (r.dead_stock_status === 'SLOW_MOVING') {
                      return <Tag severity="warning" value="ROTACIÓN LENTA" className="text-[10px] font-bold" />;
                    }
                    return <Tag severity="success" value="SALUDABLE" className="text-[10px] font-bold" />;
                  }}
                  sortable
                  style={{ width: '130px' }}
                />

                <Column
                  header="Gatekeeper MRP"
                  body={(r: DeadStockItem) => (
                    <div className="text-center">
                      {r.is_blocked_for_purchasing ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                          <i className="pi pi-lock text-[9px]"></i> RECOMPRA BLOQUEADA
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <i className="pi pi-unlock text-[9px]"></i> HABILITADO
                        </span>
                      )}
                    </div>
                  )}
                  style={{ width: '160px' }}
                />

                <Column
                  field="clara_recommended_action"
                  header="Recomendación Estratégica"
                  body={(r: DeadStockItem) => (
                    <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200/60 leading-tight">
                      {r.clara_recommended_action}
                    </div>
                  )}
                />

                <Column
                  header="Acción"
                  body={(r: DeadStockItem) => (
                    <Button
                      label={r.is_blocked_for_purchasing ? "Desbloquear" : "Bloquear"}
                      icon={r.is_blocked_for_purchasing ? "pi pi-unlock" : "pi pi-lock"}
                      size="small"
                      severity={r.is_blocked_for_purchasing ? "success" : "secondary"}
                      outlined
                      className="p-button-sm text-xs rounded-xl font-medium"
                      onClick={() => openToggleDialog(r.variant_id, r.sku, r.product_name, r.is_blocked_for_purchasing)}
                    />
                  )}
                  style={{ width: '120px' }}
                />
              </DataTable>
            </div>
          </TabPanel>

          {/* TAB 2: MERMAS Y MARGEN REAL */}
          <TabPanel
            header={
              <div className="flex items-center gap-2">
                <i className="pi pi-chart-line text-emerald-600"></i>
                <span className="font-semibold">Factor de Merma & Rentabilidad Real (Caso 7)</span>
              </div>
            }
          >
            <div className="flex flex-col gap-4 pt-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3">
                  <span className="p-input-icon-left w-72">
                    <i className="pi pi-search text-slate-400" />
                    <InputText
                      value={searchTermShrink}
                      onChange={(e) => setSearchTermShrink(e.target.value)}
                      placeholder="Filtrar por SKU o producto..."
                      className="w-full text-xs rounded-xl pl-9"
                    />
                  </span>

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-600 whitespace-nowrap">Auditar Histórico:</label>
                    <Dropdown
                      value={lookbackDays}
                      options={[
                        { label: 'Últimos 30 días', value: 30 },
                        { label: 'Últimos 60 días', value: 60 },
                        { label: 'Últimos 90 días (Recomendado)', value: 90 },
                        { label: 'Últimos 180 días', value: 180 }
                      ]}
                      onChange={(e) => setLookbackDays(e.value)}
                      className="text-xs rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <Button
                    label="Re-calcular Rentabilidad"
                    icon="pi pi-refresh"
                    size="small"
                    outlined
                    className="text-xs rounded-xl font-semibold"
                    onClick={fetchShrinkage}
                    loading={loadingShrinkage}
                  />
                </div>
              </div>

              {/* Shrinkage Table */}
              <DataTable
                value={filteredShrinkage}
                loading={loadingShrinkage}
                paginator
                rows={10}
                rowsPerPageOptions={[5, 10, 25, 50]}
                emptyMessage="No hay registros de mermas para los parámetros seleccionados."
                className="text-sm"
                rowHover
              >
                <Column
                  field="sku"
                  header="SKU"
                  body={(r: ShrinkageItem) => (
                    <span className="font-mono font-bold text-slate-800">{r.sku}</span>
                  )}
                  sortable
                  style={{ width: '130px' }}
                />

                <Column
                  field="product_name"
                  header="Producto"
                  body={(r: ShrinkageItem) => (
                    <span className="font-semibold text-slate-800">{r.product_name}</span>
                  )}
                />

                <Column
                  header="Precios & Costo"
                  body={(r: ShrinkageItem) => (
                    <div className="text-xs">
                      <div>PVP: <span className="font-bold">${Number(r.sales_price).toFixed(2)}</span></div>
                      <div className="text-slate-500">Costo: ${Number(r.replacement_cost).toFixed(2)}</div>
                    </div>
                  )}
                  style={{ width: '130px' }}
                />

                <Column
                  field="gross_margin_pct"
                  header="Margen Bruto"
                  body={(r: ShrinkageItem) => (
                    <span className="font-semibold text-slate-700">{Number(r.gross_margin_pct).toFixed(1)}%</span>
                  )}
                  sortable
                  style={{ width: '110px' }}
                />

                <Column
                  header="Mermas WMS"
                  body={(r: ShrinkageItem) => (
                    <div className="text-right text-xs">
                      <div className="text-rose-600 font-bold">{Number(r.units_shrinkage).toLocaleString()} unds</div>
                      <div className="text-slate-400">${Number(r.shrinkage_cost_usd).toFixed(2)} USD</div>
                    </div>
                  )}
                  style={{ width: '120px' }}
                />

                <Column
                  field="shrinkage_pct"
                  header="Factor Merma %"
                  body={(r: ShrinkageItem) => (
                    <div className="text-center">
                      <span className={`font-bold ${r.shrinkage_pct > 5 ? 'text-rose-600' : 'text-slate-700'}`}>
                        {Number(r.shrinkage_pct).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  sortable
                  style={{ width: '120px' }}
                />

                <Column
                  field="net_real_margin_pct"
                  header="Margen Real Neto"
                  body={(r: ShrinkageItem) => {
                    const isNeg = r.net_real_margin_pct <= 0;
                    return (
                      <div className="text-center">
                        <span className={`font-black text-sm px-2 py-0.5 rounded ${isNeg ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'text-emerald-700'}`}>
                          {Number(r.net_real_margin_pct).toFixed(1)}%
                        </span>
                      </div>
                    );
                  }}
                  sortable
                  style={{ width: '140px' }}
                />

                <Column
                  field="profitability_status"
                  header="Estatus Rentabilidad"
                  body={(r: ShrinkageItem) => {
                    if (r.profitability_status === 'NEGATIVE_MARGIN') {
                      return <Tag severity="danger" value="DESTRUCCIÓN MARGEN" className="text-[10px] font-bold" />;
                    }
                    if (r.profitability_status === 'SHRINKAGE_RISK') {
                      return <Tag severity="warning" value="MARGEN EN RIESGO" className="text-[10px] font-bold" />;
                    }
                    return <Tag severity="success" value="RENTABLE" className="text-[10px] font-bold" />;
                  }}
                  style={{ width: '150px' }}
                />

                <Column
                  field="clara_verdict"
                  header="Veredicto de Clara"
                  body={(r: ShrinkageItem) => (
                    <div className="text-xs text-slate-600 italic">
                      {r.clara_verdict}
                    </div>
                  )}
                />
              </DataTable>
            </div>
          </TabPanel>

          {/* TAB 3: REPORTES PROGRAMADOS */}
          <TabPanel
            header={
              <div className="flex items-center gap-2">
                <i className="pi pi-calendar-clock text-blue-600"></i>
                <span className="font-semibold">Historial de Reportes Mensuales Programados (Caso 5)</span>
              </div>
            }
          >
            <div className="flex flex-col gap-4 pt-4">
              <div className="bg-blue-50/70 border border-blue-200/80 p-4 rounded-xl text-xs text-blue-900 flex items-start gap-3">
                <i className="pi pi-info-circle text-blue-600 text-base mt-0.5"></i>
                <div>
                  <span className="font-bold">Automatización de Clara (SystemJob):</span> El autómata mensual se ejecuta programadamente a las 00:05 AM del 1ro de cada mes en segundo plano, consolidando órdenes de compra, calibraciones OTIF de proveedores, mermas reales, dead stock y convenios Sell-Out en un paquete Excel corporativo.
                </div>
              </div>

              <DataTable
                value={scheduledReports}
                loading={loadingReports}
                emptyMessage="Aún no hay reportes mensuales archivados. Pulsa 'Descargar Informe Mensual' para generar uno inmediatamente."
                className="text-sm"
                rowHover
              >
                <Column field="report_code" header="Código" style={{ width: '130px' }} />
                <Column field="title" header="Título del Paquete" className="font-semibold" />
                <Column
                  header="Periodo"
                  body={(r: ScheduledReportItem) => `${r.period_month}/${r.period_year}`}
                  style={{ width: '110px' }}
                />
                <Column
                  header="Tamaño"
                  body={(r: ScheduledReportItem) => `${r.file_size_kb} KB`}
                  style={{ width: '100px' }}
                />
                <Column field="created_at" header="Fecha de Generación" style={{ width: '180px' }} />
                <Column
                  header="Descargar"
                  body={(r: ScheduledReportItem) => (
                    <a
                      href={r.file_url.startsWith('http') ? r.file_url : `${api.defaults.baseURL?.replace('/api/v1', '')}${r.file_url}`}
                      download
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 rounded-lg text-xs font-bold border border-slate-200 transition-colors"
                    >
                      <i className="pi pi-download text-[11px]"></i> Excel (.xlsx)
                    </a>
                  )}
                  style={{ width: '130px' }}
                />
              </DataTable>
            </div>
          </TabPanel>

        </TabView>
      </div>

      {/* Modal Desbloquear/Bloquear Recompra */}
      <Dialog
        header={
          <div className="flex items-center gap-2">
            <i className={`pi ${selectedVariant?.isBlocked ? 'pi-unlock text-emerald-600' : 'pi-lock text-rose-600'}`}></i>
            <span className="font-bold text-slate-800">
              {selectedVariant?.isBlocked ? 'Desbloquear Recompra en MRP' : 'Bloquear Recompra en MRP'}
            </span>
          </div>
        }
        visible={showBlockDialog}
        style={{ width: '500px' }}
        onHide={() => setShowBlockDialog(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              label="Cancelar"
              severity="secondary"
              text
              onClick={() => setShowBlockDialog(false)}
            />
            <Button
              label={selectedVariant?.isBlocked ? "Confirmar Desbloqueo" : "Confirmar Bloqueo"}
              icon="pi pi-check"
              className={selectedVariant?.isBlocked ? "bg-emerald-600 hover:bg-emerald-700 border-none" : "bg-rose-600 hover:bg-rose-700 border-none"}
              onClick={handleToggleSubmit}
              loading={submittingToggle}
            />
          </div>
        }
      >
        {selectedVariant && (
          <div className="flex flex-col gap-4 pt-2">
            <p className="text-sm text-slate-600">
              {selectedVariant.isBlocked
                ? `Al desbloquear este producto (${selectedVariant.sku}), Clara volverá a permitir su inclusión en las sugerencias automáticas de pedidos del MRP.`
                : `Al bloquear este producto (${selectedVariant.sku}), Clara omitirá su sugerencia de compra en el MRP para evitar mayor inmovilización o acumulación de pérdidas.`}
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700">Motivo / Justificación *</label>
              <InputTextarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                rows={3}
                placeholder="Indica la justificación comercial..."
                className="text-sm rounded-xl"
              />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
