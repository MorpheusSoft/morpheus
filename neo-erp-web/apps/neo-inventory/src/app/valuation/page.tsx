'use client';
import { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { ValuationService } from '@/services/valuation.service';

export default function ValuationPage() {
  const [loading, setLoading] = useState(true);
  const [valuationData, setValuationData] = useState<any>(null);
  
  // Filters
  const [facilities, setFacilities] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  const [selectedFacility, setSelectedFacility] = useState<any>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  
  const [globalFilterValue, setGlobalFilterValue] = useState('');

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
        // Reset selected warehouse if not valid for new facility
        setSelectedWarehouse(null);
      } catch (err) {
        console.error("Error cargando almacenes", err);
      }
    };
    loadWarehouses();
  }, [selectedFacility]);

  // Load valuation data
  const loadValuation = async () => {
    setLoading(true);
    try {
      const data = await ValuationService.getValuation({
        facility_id: selectedFacility,
        warehouse_id: selectedWarehouse,
        category_id: selectedCategory
      });
      setValuationData(data);
    } catch (err) {
      console.error("Error cargando valoración", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadValuation();
  }, [selectedFacility, selectedWarehouse, selectedCategory]);

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

  // Templates
  const dualCostTemplate = (rowData: any, fieldUsd: string, fieldVes: string) => {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold text-slate-700 text-sm">{formatCurrency(rowData[fieldUsd], 'USD')}</span>
        <span className="text-slate-400 text-xs font-medium">{formatCurrency(rowData[fieldVes], 'VES')}</span>
      </div>
    );
  };

  const qtyTemplate = (rowData: any) => {
    return <span className="font-extrabold text-slate-700 tabular-nums">{rowData.qty.toLocaleString('es-VE')} U</span>;
  };

  const skuTemplate = (rowData: any) => {
    return <span className="font-mono text-xs text-slate-600 bg-slate-100 border border-slate-200/60 px-2 py-1 rounded shadow-sm">{rowData.sku}</span>;
  };

  const renderHeader = () => {
    return (
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 m-0 tracking-tight">Valoración de Inventario</h2>
            <p className="text-slate-500 text-sm mt-1 font-medium">Valoración dual en tiempo real (Promedio vs Actual)</p>
          </div>
          <div className="flex items-center gap-2">
            {valuationData?.rate && (
              <div className="bg-blue-50 border border-blue-200/60 px-4 py-2 rounded-2xl flex items-center gap-2 shadow-sm">
                <i className="pi pi-refresh text-blue-500 animate-spin-slow"></i>
                <span className="text-xs text-blue-500 font-bold uppercase tracking-wider">Tasa BCV del día:</span>
                <span className="font-extrabold text-blue-700">{formatCurrency(valuationData.rate, 'VES')} / $</span>
              </div>
            )}
            <Button icon="pi pi-filter-slash" rounded text severity="secondary" onClick={clearFilters} tooltip="Limpiar Filtros" />
            <Button icon="pi pi-refresh" rounded text severity="info" onClick={loadValuation} loading={loading} tooltip="Recargar" />
          </div>
        </div>

        {/* Filters Panel */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50/50 p-4 rounded-[1.5rem] border border-slate-100 backdrop-blur-md">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Sucursal / Localidad</label>
            <Dropdown
              value={selectedFacility}
              options={facilities}
              optionLabel="name"
              optionValue="id"
              onChange={(e) => setSelectedFacility(e.value)}
              placeholder="Todas las sucursales"
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
              placeholder="Todos los almacenes"
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
              placeholder="Todas las categorías"
              showClear
              className="w-full !rounded-xl !bg-white border-slate-200 focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 shadow-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Buscar Producto</label>
            <span className="p-input-icon-left w-full">
              <i className="pi pi-search text-slate-400 z-10" />
              <InputText
                type="search"
                autoComplete="off"
                value={globalFilterValue}
                onChange={onGlobalFilterChange}
                placeholder="Nombre, SKU..."
                className="w-full !pl-10 !rounded-xl !bg-white border-slate-200 focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 shadow-sm !py-2"
              />
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        {/* Card 1: Quantities */}
        <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/40 border border-slate-100 relative overflow-hidden flex items-center justify-between">
          <div className="absolute right-0 top-0 h-full w-[80px] bg-gradient-to-l from-blue-50 to-transparent opacity-40"></div>
          <div>
            <span className="text-[11px] font-extrabold text-slate-400 tracking-widest uppercase block mb-1">Volumen Disponible</span>
            <h3 className="text-3xl font-black text-slate-800 m-0 tabular-nums">
              {(valuationData?.total_qty || 0).toLocaleString('es-VE')}
              <span className="text-sm font-semibold text-slate-400 ml-1.5">Unidades</span>
            </h3>
            <span className="text-xs text-slate-400 font-medium mt-1 block">
              {(valuationData?.items?.length || 0)} SKUs únicos valorizados
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center border border-blue-100">
            <i className="pi pi-box text-xl text-blue-500"></i>
          </div>
        </div>

        {/* Card 2: Costo Promedio */}
        <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/40 border border-slate-100 relative overflow-hidden flex items-center justify-between">
          <div className="absolute right-0 top-0 h-full w-[80px] bg-gradient-to-l from-indigo-50 to-transparent opacity-40"></div>
          <div>
            <span className="text-[11px] font-extrabold text-slate-400 tracking-widest uppercase block mb-1">Valoración (Costo Promedio)</span>
            <h3 className="text-2xl font-black text-slate-800 m-0 tracking-tight">
              {formatCurrency(valuationData?.total_val_avg_usd || 0, 'USD')}
            </h3>
            <span className="text-sm text-slate-400 font-semibold block mt-0.5">
              {formatCurrency(valuationData?.total_val_avg_ves || 0, 'VES')}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
            <i className="pi pi-chart-line text-xl text-indigo-500"></i>
          </div>
        </div>

        {/* Card 3: Costo Actual */}
        <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/40 border border-slate-100 relative overflow-hidden flex items-center justify-between">
          <div className="absolute right-0 top-0 h-full w-[80px] bg-gradient-to-l from-purple-50 to-transparent opacity-40"></div>
          <div>
            <span className="text-[11px] font-extrabold text-slate-400 tracking-widest uppercase block mb-1">Valoración (Último Costo)</span>
            <h3 className="text-2xl font-black text-slate-800 m-0 tracking-tight">
              {formatCurrency(valuationData?.total_val_actual_usd || 0, 'USD')}
            </h3>
            <span className="text-sm text-slate-400 font-semibold block mt-0.5">
              {formatCurrency(valuationData?.total_val_actual_ves || 0, 'VES')}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center border border-purple-100">
            <i className="pi pi-dollar text-xl text-purple-500"></i>
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
            }
            .premium-datatable .p-datatable-thead > tr > th {
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
            .premium-datatable .p-datatable-tbody > tr {
              background-color: transparent !important;
              transition: background-color 0.2s ease;
            }
            .premium-datatable .p-datatable-tbody > tr:hover {
              background-color: #f8fafc !important;
            }
            .premium-datatable .p-datatable-tbody > tr > td {
              border-bottom: 1px solid #f1f5f9 !important;
              border-top: none !important;
              border-left: none !important;
              border-right: none !important;
              padding: 1.1rem 1rem !important;
            }
          `}} />

          <DataTable
            value={valuationData?.items || []}
            loading={loading}
            globalFilter={globalFilterValue}
            globalFilterFields={['sku', 'name', 'category']}
            paginator
            rows={15}
            rowsPerPageOptions={[10, 15, 30, 50]}
            dataKey="sku"
            emptyMessage={
              <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                <i className="pi pi-box text-5xl mb-4 opacity-50"></i>
                <p className="font-medium text-lg">No se encontraron productos valorizados.</p>
              </div>
            }
            className="premium-datatable"
          >
            <Column header="SKU" body={skuTemplate} style={{ width: '12%', minWidth: '8rem' }}></Column>
            <Column field="name" header="PRODUCTO" className="font-semibold text-slate-800 text-[14px]" style={{ width: '30%', minWidth: '16rem' }}></Column>
            <Column field="category" header="CATEGORÍA" className="text-slate-500 font-medium text-sm" style={{ width: '12%', minWidth: '8rem' }}></Column>
            <Column header="CANTIDAD" body={qtyTemplate} style={{ width: '10%', minWidth: '6rem' }}></Column>
            <Column header="COSTO PROMEDIO U." body={(r) => dualCostTemplate(r, 'cost_avg_usd', 'cost_avg_ves')} style={{ width: '12%', minWidth: '8rem' }}></Column>
            <Column header="COSTO ACTUAL U." body={(r) => dualCostTemplate(r, 'cost_actual_usd', 'cost_actual_ves')} style={{ width: '12%', minWidth: '8rem' }}></Column>
            <Column header="VALORACIÓN PROMEDIO" body={(r) => dualCostTemplate(r, 'val_total_avg_usd', 'val_total_avg_ves')} style={{ width: '14%', minWidth: '10rem' }}></Column>
            <Column header="VALORACIÓN ACTUAL" body={(r) => dualCostTemplate(r, 'val_total_actual_usd', 'val_total_actual_ves')} style={{ width: '14%', minWidth: '10rem' }}></Column>
          </DataTable>
        </div>
      </div>
    </div>
  );
}
