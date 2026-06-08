'use client';
import { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { SelectButton } from 'primereact/selectbutton';
import { ValuationService } from '@/services/valuation.service';

export default function BookReportPage() {
  const [loading, setLoading] = useState(false);
  const [bookData, setBookData] = useState<any>(null);
  
  // Date range defaults (current month)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Filters
  const [facilities, setFacilities] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  const [selectedFacility, setSelectedFacility] = useState<any>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  
  const [globalFilterValue, setGlobalFilterValue] = useState('');
  
  // View mode: 'summary' or 'detailed'
  const [viewMode, setViewMode] = useState('summary');
  const viewModeOptions = [
    { label: 'Vista Resumida', value: 'summary' },
    { label: 'Vista Detallada', value: 'detailed' }
  ];

  // Initial load
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [facs, cats] = await Promise.all([
          ValuationService.getFacilities(),
          ValuationService.getCategories()
        ]);
        setFacilities(facs || []);
        setCategories(cats || []);
      } catch (err) {
        console.error("Error cargando metadatos", err);
      }
    };
    loadMetadata();
  }, []);

  // Load warehouses when facility changes
  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const whs = await ValuationService.getWarehouses(selectedFacility);
        setWarehouses(whs || []);
        setSelectedWarehouse(null);
      } catch (err) {
        console.error("Error cargando almacenes", err);
      }
    };
    loadWarehouses();
  }, [selectedFacility]);

  // Load book report data
  const loadBookReport = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const data = await ValuationService.getBookReport({
        start_date: startDate,
        end_date: endDate,
        facility_id: selectedFacility,
        warehouse_id: selectedWarehouse,
        category_id: selectedCategory
      });
      setBookData(data);
    } catch (err) {
      console.error("Error cargando libro de inventario", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookReport();
  }, [startDate, endDate, selectedFacility, selectedWarehouse, selectedCategory]);

  const onGlobalFilterChange = (e: any) => {
    setGlobalFilterValue(e.target.value);
  };

  const clearFilters = () => {
    setSelectedFacility(null);
    setSelectedWarehouse(null);
    setSelectedCategory(null);
    setGlobalFilterValue('');
  };

  const formatCurrency = (value: number, currency: 'USD' | 'VES') => {
    if (value === undefined || value === null) return '---';
    const formatter = new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: currency === 'USD' ? 'USD' : 'VES',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return formatter.format(value).replace('VES', 'Bs.F').replace('USD', '$');
  };

  // Cell templates
  const dualValueTemplate = (rowData: any, fieldUsd: string, fieldVes: string) => {
    return (
      <div className="flex flex-col gap-0.5 min-w-[90px]">
        <span className="font-semibold text-slate-700 text-xs">{formatCurrency(rowData[fieldUsd], 'USD')}</span>
        <span className="text-slate-400 text-[10px] font-medium">{formatCurrency(rowData[fieldVes], 'VES')}</span>
      </div>
    );
  };

  const dualQtyValueTemplate = (rowData: any, qtyField: string, valUsdField: string, valVesField: string) => {
    const qty = rowData[qtyField] || 0;
    const usd = rowData[valUsdField] || 0;
    const ves = rowData[valVesField] || 0;
    return (
      <div className="flex flex-col gap-0.5 min-w-[100px]">
        <span className="font-bold text-slate-800 text-[13px] tabular-nums">{qty.toLocaleString('es-VE')} U</span>
        <span className="text-slate-500 text-[11px] font-medium">{formatCurrency(usd, 'USD')}</span>
        <span className="text-slate-400 text-[10px] font-medium">{formatCurrency(ves, 'VES')}</span>
      </div>
    );
  };

  const skuTemplate = (rowData: any) => {
    return <span className="font-mono text-xs text-slate-600 bg-slate-100 border border-slate-200/60 px-2 py-1 rounded shadow-sm">{rowData.sku}</span>;
  };

  // Calculating aggregated sums for Summary view
  const aggregateSummary = (rowData: any, direction: 'in' | 'out') => {
    let qty = 0;
    let valUsd = 0;
    let valVes = 0;

    if (direction === 'in') {
      qty = (rowData.in_receptions_qty || 0) + (rowData.in_notes_qty || 0) + (rowData.in_transfers_qty || 0) + (rowData.in_adjustments_qty || 0) + (rowData.in_others_qty || 0);
      valUsd = (rowData.in_receptions_val_usd || 0) + (rowData.in_notes_val_usd || 0) + (rowData.in_transfers_val_usd || 0) + (rowData.in_adjustments_val_usd || 0) + (rowData.in_others_val_usd || 0);
      valVes = (rowData.in_receptions_val_ves || 0) + (rowData.in_notes_val_ves || 0) + (rowData.in_transfers_val_ves || 0) + (rowData.in_adjustments_val_ves || 0) + (rowData.in_others_val_ves || 0);
    } else {
      qty = (rowData.out_sales_qty || 0) + (rowData.out_notes_qty || 0) + (rowData.out_transfers_qty || 0) + (rowData.out_adjustments_qty || 0) + (rowData.out_others_qty || 0);
      valUsd = (rowData.out_sales_val_usd || 0) + (rowData.out_notes_val_usd || 0) + (rowData.out_transfers_val_usd || 0) + (rowData.out_adjustments_val_usd || 0) + (rowData.out_others_val_usd || 0);
      valVes = (rowData.out_sales_val_ves || 0) + (rowData.out_notes_val_ves || 0) + (rowData.out_transfers_val_ves || 0) + (rowData.out_adjustments_val_ves || 0) + (rowData.out_others_val_ves || 0);
    }

    return (
      <div className="flex flex-col gap-0.5 min-w-[100px]">
        <span className="font-bold text-slate-800 text-[13px] tabular-nums">{qty.toLocaleString('es-VE')} U</span>
        <span className="text-slate-500 text-[11px] font-medium">{formatCurrency(valUsd, 'USD')}</span>
        <span className="text-slate-400 text-[10px] font-medium">{formatCurrency(valVes, 'VES')}</span>
      </div>
    );
  };

  const renderHeader = () => {
    return (
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 m-0 tracking-tight">Libro de Inventario</h2>
            <p className="text-slate-500 text-sm mt-1 font-medium">Historial y flujo consolidado de entradas, salidas y saldos</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SelectButton
              value={viewMode}
              options={viewModeOptions}
              onChange={(e) => e.value && setViewMode(e.value)}
              className="premium-selectbutton shadow-sm"
            />
            {bookData?.rate && (
              <div className="bg-blue-50 border border-blue-200/60 px-4 py-2 rounded-2xl flex items-center gap-2 shadow-sm">
                <span className="text-xs text-blue-500 font-bold uppercase tracking-wider">Tasa BCV:</span>
                <span className="font-extrabold text-blue-700">{formatCurrency(bookData.rate, 'VES')} / $</span>
              </div>
            )}
            <Button icon="pi pi-filter-slash" rounded text severity="secondary" onClick={clearFilters} tooltip="Limpiar Filtros" />
            <Button icon="pi pi-refresh" rounded text severity="info" onClick={loadBookReport} loading={loading} tooltip="Recargar" />
          </div>
        </div>

        {/* Filters and Date Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 bg-slate-50/50 p-4 rounded-[1.5rem] border border-slate-100 backdrop-blur-md">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl bg-white border border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Hasta</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl bg-white border border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Sucursal</label>
            <Dropdown
              value={selectedFacility}
              options={facilities}
              optionLabel="name"
              optionValue="id"
              onChange={(e) => setSelectedFacility(e.value)}
              placeholder="Todas"
              showClear
              className="w-full !rounded-xl !bg-white border-slate-200 focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 shadow-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Almacén</label>
            <Dropdown
              value={selectedWarehouse}
              options={warehouses}
              optionLabel="name"
              optionValue="id"
              onChange={(e) => setSelectedWarehouse(e.value)}
              placeholder="Todos"
              showClear
              disabled={!selectedFacility}
              className="w-full !rounded-xl !bg-white border-slate-200 focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 shadow-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Categoría</label>
            <Dropdown
              value={selectedCategory}
              options={categories}
              optionLabel="name"
              optionValue="id"
              onChange={(e) => setSelectedCategory(e.value)}
              placeholder="Todas"
              showClear
              className="w-full !rounded-xl !bg-white border-slate-200 focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 shadow-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Buscar</label>
            <span className="p-input-icon-left w-full">
              <i className="pi pi-search text-slate-400 z-10" />
              <InputText
                type="search"
                autoComplete="off"
                value={globalFilterValue}
                onChange={onGlobalFilterChange}
                placeholder="SKU, Nombre..."
                className="w-full !pl-10 !rounded-xl !bg-white border-slate-200 focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 shadow-sm !py-2"
              />
            </span>
          </div>
        </div>
      </div>
    );
  };

  const getAggregateTotal = (direction: 'in' | 'out', valType: 'qty' | 'val_usd' | 'val_ves') => {
    if (!bookData?.totals) return 0;
    const t = bookData.totals;
    if (direction === 'in') {
      if (valType === 'qty') {
        return (t.in_receptions_qty || 0) + (t.in_notes_qty || 0) + (t.in_transfers_qty || 0) + (t.in_adjustments_qty || 0) + (t.in_others_qty || 0);
      } else if (valType === 'val_usd') {
        return (t.in_receptions_val_usd || 0) + (t.in_notes_val_usd || 0) + (t.in_transfers_val_usd || 0) + (t.in_adjustments_val_usd || 0) + (t.in_others_val_usd || 0);
      } else {
        return (t.in_receptions_val_ves || 0) + (t.in_notes_val_ves || 0) + (t.in_transfers_val_ves || 0) + (t.in_adjustments_val_ves || 0) + (t.in_others_val_ves || 0);
      }
    } else {
      if (valType === 'qty') {
        return (t.out_sales_qty || 0) + (t.out_notes_qty || 0) + (t.out_transfers_qty || 0) + (t.out_adjustments_qty || 0) + (t.out_others_qty || 0);
      } else if (valType === 'val_usd') {
        return (t.out_sales_val_usd || 0) + (t.out_notes_val_usd || 0) + (t.out_transfers_val_usd || 0) + (t.out_adjustments_val_usd || 0) + (t.out_others_val_usd || 0);
      } else {
        return (t.out_sales_val_ves || 0) + (t.out_notes_val_ves || 0) + (t.out_transfers_val_ves || 0) + (t.out_adjustments_val_ves || 0) + (t.out_others_val_ves || 0);
      }
    }
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto">
      {/* KPI Cards Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-[1.5rem] p-5 shadow-xl shadow-slate-200/40 border border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase block mb-0.5">Saldo Inicial Total</span>
            <h3 className="text-xl font-black text-slate-800 m-0 tabular-nums">
              {(bookData?.totals?.initial_qty || 0).toLocaleString('es-VE')} U
            </h3>
            <span className="text-xs text-slate-400 font-semibold block mt-0.5">
              {formatCurrency(bookData?.totals?.initial_val_avg_usd || 0, 'USD')}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100">
            <i className="pi pi-folder-open text-slate-400"></i>
          </div>
        </div>

        <div className="bg-white rounded-[1.5rem] p-5 shadow-xl shadow-slate-200/40 border border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase block mb-0.5">Total Entradas</span>
            <h3 className="text-xl font-black text-emerald-600 m-0 tabular-nums">
              {getAggregateTotal('in', 'qty').toLocaleString('es-VE')} U
            </h3>
            <span className="text-xs text-emerald-500/80 font-semibold block mt-0.5">
              {formatCurrency(getAggregateTotal('in', 'val_usd'), 'USD')}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100">
            <i className="pi pi-arrow-down-left text-emerald-500"></i>
          </div>
        </div>

        <div className="bg-white rounded-[1.5rem] p-5 shadow-xl shadow-slate-200/40 border border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase block mb-0.5">Total Salidas</span>
            <h3 className="text-xl font-black text-rose-600 m-0 tabular-nums">
              {getAggregateTotal('out', 'qty').toLocaleString('es-VE')} U
            </h3>
            <span className="text-xs text-rose-500/80 font-semibold block mt-0.5">
              {formatCurrency(getAggregateTotal('out', 'val_usd'), 'USD')}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center border border-rose-100">
            <i className="pi pi-arrow-up-right text-rose-500"></i>
          </div>
        </div>

        <div className="bg-white rounded-[1.5rem] p-5 shadow-xl shadow-slate-200/40 border border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-slate-400 tracking-widest uppercase block mb-0.5">Saldo Final Total</span>
            <h3 className="text-xl font-black text-blue-600 m-0 tabular-nums">
              {(bookData?.totals?.final_qty || 0).toLocaleString('es-VE')} U
            </h3>
            <span className="text-xs text-blue-500 font-semibold block mt-0.5">
              {formatCurrency(bookData?.totals?.final_val_avg_usd || 0, 'USD')}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100">
            <i className="pi pi-flag text-blue-500"></i>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden relative">
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-90"></div>
        <div className="p-5 md:p-6">
          {renderHeader()}

          <style dangerouslySetInnerHTML={{__html: `
            .premium-datatable .p-datatable-wrapper {
              border-radius: 1rem;
              overflow-x: auto;
            }
            .premium-datatable .p-datatable-thead > tr > th {
              background-color: #f8fafc !important;
              border-bottom: 2px solid #e2e8f0 !important;
              border-right: 1px solid #e2e8f0 !important;
              color: #475569 !important;
              font-weight: 700 !important;
              text-transform: uppercase;
              font-size: 0.65rem;
              letter-spacing: 0.05em;
              padding: 0.75rem 0.5rem !important;
              text-align: center !important;
            }
            .premium-datatable .p-datatable-thead > tr:first-child > th {
              border-top: 1px solid #e2e8f0 !important;
            }
            .premium-datatable .p-datatable-tbody > tr {
              background-color: transparent !important;
              transition: background-color 0.2s ease;
            }
            .premium-datatable .p-datatable-tbody > tr:hover {
              background-color: #f8fafc !important;
            }
            .premium-datatable .p-datatable-tbody > tr > td {
              border-bottom: 1px solid #f1f5f9 !important;
              border-right: 1px solid #f1f5f9 !important;
              padding: 0.75rem 0.5rem !important;
              text-align: center !important;
            }
            .premium-datatable .p-datatable-tbody > tr > td:first-child,
            .premium-datatable .p-datatable-tbody > tr > td:nth-child(2) {
              text-align: left !important;
            }
            .premium-selectbutton .p-button {
              background: #ffffff !important;
              border: 1px solid #cbd5e1 !important;
              color: #475569 !important;
              font-size: 0.8rem !important;
              font-weight: 600 !important;
              border-radius: 0.75rem !important;
              padding: 0.4rem 0.8rem !important;
              transition: all 0.2s;
            }
            .premium-selectbutton .p-button.p-highlight {
              background: #3b82f6 !important;
              border-color: #3b82f6 !important;
              color: #ffffff !important;
            }
          `}} />

          {viewMode === 'summary' ? (
            <DataTable
              value={bookData?.items || []}
              loading={loading}
              globalFilter={globalFilterValue}
              globalFilterFields={['sku', 'name', 'category']}
              paginator
              rows={15}
              dataKey="sku"
              emptyMessage={
                <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                  <i className="pi pi-book text-5xl mb-4 opacity-50"></i>
                  <p className="font-medium text-lg">No hay datos de movimientos para este periodo.</p>
                </div>
              }
              className="premium-datatable"
            >
              <Column header="SKU" body={skuTemplate} style={{ width: '10%' }}></Column>
              <Column field="name" header="PRODUCTO" className="font-semibold text-slate-800 text-[13px]" style={{ width: '22%' }}></Column>
              <Column field="category" header="CATEGORÍA" className="text-slate-500 font-medium text-xs" style={{ width: '10%' }}></Column>
              
              <Column header="SALDO INICIAL" body={(r) => dualQtyValueTemplate(r, 'initial_qty', 'initial_val_avg_usd', 'initial_val_avg_ves')} style={{ width: '14%' }}></Column>
              <Column header="TOTAL ENTRADAS" body={(r) => aggregateSummary(r, 'in')} style={{ width: '14%' }}></Column>
              <Column header="TOTAL SALIDAS" body={(r) => aggregateSummary(r, 'out')} style={{ width: '14%' }}></Column>
              <Column header="SALDO FINAL" body={(r) => dualQtyValueTemplate(r, 'final_qty', 'final_val_avg_usd', 'final_val_avg_ves')} style={{ width: '16%' }}></Column>
            </DataTable>
          ) : (
            /* Detailed view with full inflow/outflow matrix columns */
            <DataTable
              value={bookData?.items || []}
              loading={loading}
              globalFilter={globalFilterValue}
              globalFilterFields={['sku', 'name', 'category']}
              paginator
              rows={15}
              dataKey="sku"
              emptyMessage={
                <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                  <i className="pi pi-book text-5xl mb-4 opacity-50"></i>
                  <p className="font-medium text-lg">No hay datos de movimientos para este periodo.</p>
                </div>
              }
              className="premium-datatable"
            >
              {/* Product Info */}
              <Column header="SKU" body={skuTemplate} frozen></Column>
              <Column field="name" header="PRODUCTO" className="font-semibold text-slate-800 text-[13px]"></Column>
              
              {/* Initial Balance */}
              <Column header="SALDO INICIAL" body={(r) => dualQtyValueTemplate(r, 'initial_qty', 'initial_val_avg_usd', 'initial_val_avg_ves')}></Column>
              
              {/* Inflow Columns */}
              <Column header="ENT. COMPRAS" body={(r) => dualQtyValueTemplate(r, 'in_receptions_qty', 'in_receptions_val_usd', 'in_receptions_val_ves')}></Column>
              <Column header="ENT. NOTAS" body={(r) => dualQtyValueTemplate(r, 'in_notes_qty', 'in_notes_val_usd', 'in_notes_val_ves')}></Column>
              <Column header="ENT. TRANSF" body={(r) => dualQtyValueTemplate(r, 'in_transfers_qty', 'in_transfers_val_usd', 'in_transfers_val_ves')}></Column>
              <Column header="ENT. AJUSTE" body={(r) => dualQtyValueTemplate(r, 'in_adjustments_qty', 'in_adjustments_val_usd', 'in_adjustments_val_ves')}></Column>
              <Column header="ENT. OTROS" body={(r) => dualQtyValueTemplate(r, 'in_others_qty', 'in_others_val_usd', 'in_others_val_ves')}></Column>
              
              {/* Outflow Columns */}
              <Column header="SAL. VENTAS" body={(r) => dualQtyValueTemplate(r, 'out_sales_qty', 'out_sales_val_usd', 'out_sales_val_ves')}></Column>
              <Column header="SAL. NOTAS" body={(r) => dualQtyValueTemplate(r, 'out_notes_qty', 'out_notes_val_usd', 'out_notes_val_ves')}></Column>
              <Column header="SAL. TRANSF" body={(r) => dualQtyValueTemplate(r, 'out_transfers_qty', 'out_transfers_val_usd', 'out_transfers_val_ves')}></Column>
              <Column header="SAL. AJUSTE" body={(r) => dualQtyValueTemplate(r, 'out_adjustments_qty', 'out_adjustments_val_usd', 'out_adjustments_val_ves')}></Column>
              <Column header="SAL. OTROS" body={(r) => dualQtyValueTemplate(r, 'out_others_qty', 'out_others_val_usd', 'out_others_val_ves')}></Column>
              
              {/* Final Balance */}
              <Column header="SALDO FINAL" body={(r) => dualQtyValueTemplate(r, 'final_qty', 'final_val_avg_usd', 'final_val_avg_ves')}></Column>
            </DataTable>
          )}
        </div>
      </div>
    </div>
  );
}
