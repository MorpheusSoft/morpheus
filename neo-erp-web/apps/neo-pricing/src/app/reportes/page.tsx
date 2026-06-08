'use client';
import { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { ProgressBar } from 'primereact/progressbar';
import { ProductService } from '@/services/product.service';
import { ReportService } from '@/services/report.service';

export default function PricingMarginReportPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  
  // Averages/KPIs for the filtered dataset
  const [avgMargin, setAvgMargin] = useState(0);
  const [totalSold, setTotalSold] = useState(0);

  const [lazyParams, setLazyParams] = useState({
    first: 0,
    rows: 10,
    page: 0
  });

  // Filter States (identical to Mass Update Wizard)
  const [suppliers, setSuppliers] = useState<number[]>([]);
  const [categories, setCategories] = useState<number[]>([]);
  const [brands, setBrands] = useState('');
  const [models, setModels] = useState('');
  const [attrKey, setAttrKey] = useState('');
  const [attrValue, setAttrValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [costType, setCostType] = useState('STANDARD');

  // Dropdown options
  const [supplierOptions, setSupplierOptions] = useState<any[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<any[]>([]);

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [cats, sups] = await Promise.all([
          ProductService.getCategories(),
          ProductService.getSuppliers()
        ]);
        setCategoryOptions(cats?.data || cats || []);
        setSupplierOptions(sups?.data || sups || []);
      } catch (err) {
        console.error('Error loading report metadata:', err);
      }
    };
    loadMetadata();
  }, []);

  const fetchReport = async () => {
    try {
      setLoading(true);
      // Format brand/model comma-separated values into arrays for backend
      const brandArray = brands ? brands.split(',').map(b => b.trim()).filter(Boolean) : undefined;
      const modelArray = models ? models.split(',').map(m => m.trim()).filter(Boolean) : undefined;

      const res = await ReportService.getPricingMarginReport({
        supplier_ids: suppliers,
        category_ids: categories,
        brands: brandArray,
        models: modelArray,
        attribute_key: attrKey || undefined,
        attribute_value: attrValue || undefined,
        search_term: searchTerm || undefined,
        cost_type: costType,
        skip: lazyParams.first,
        limit: lazyParams.rows
      });

      setData(res?.data || []);
      setTotalRecords(res?.total || 0);

      // Compute averages/summaries for the current page set
      if (res?.data && res.data.length > 0) {
        const totalMargin = res.data.reduce((sum: number, item: any) => sum + Number(item.margen || 0), 0);
        const totalQty = res.data.reduce((sum: number, item: any) => sum + Number(item.unidades_vendidas || 0), 0);
        setAvgMargin(totalMargin / res.data.length);
        setTotalSold(totalQty);
      } else {
        setAvgMargin(0);
        setTotalSold(0);
      }
    } catch (err) {
      console.error('Error fetching report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [lazyParams]);

  const handleFilterSubmit = (e: any) => {
    e.preventDefault();
    setLazyParams({ ...lazyParams, first: 0, page: 0 });
    fetchReport();
  };

  const handleClearFilters = () => {
    setSuppliers([]);
    setCategories([]);
    setBrands('');
    setModels('');
    setAttrKey('');
    setAttrValue('');
    setSearchTerm('');
    setCostType('STANDARD');
    setLazyParams({ ...lazyParams, first: 0, page: 0 });
  };

  const onPage = (event: any) => {
    setLazyParams(event);
  };

  const handleExportCSV = async () => {
    try {
      setLoading(true);
      const brandArray = brands ? brands.split(',').map(b => b.trim()).filter(Boolean) : undefined;
      const modelArray = models ? models.split(',').map(m => m.trim()).filter(Boolean) : undefined;

      // Query without pagination limit (or a high limit) to fetch all matching records
      const res = await ReportService.getPricingMarginReport({
        supplier_ids: suppliers,
        category_ids: categories,
        brands: brandArray,
        models: modelArray,
        attribute_key: attrKey || undefined,
        attribute_value: attrValue || undefined,
        search_term: searchTerm || undefined,
        cost_type: costType,
        skip: 0,
        limit: 10000
      });

      const exportData = res?.data || [];
      if (exportData.length === 0) {
        alert('No hay datos para exportar.');
        return;
      }

      // Generate CSV content
      const headers = ['Código (SKU)', 'Producto', 'Costo sin IVA', 'Costo con IVA', 'Margen %', 'Precio', 'PVP', 'Ventas (Últimos 30 días)'];
      const rows = exportData.map((item: any) => [
        `"${item.codigo}"`,
        `"${item.producto.replace(/"/g, '""')}"`,
        Number(item.costo_sin_iva || 0).toFixed(2),
        Number(item.costo_con_iva || 0).toFixed(2),
        Number(item.margen || 0).toFixed(2),
        Number(item.precio_venta || 0).toFixed(2),
        (Number(item.precio_venta || 0) * 1.16).toFixed(2),
        Number(item.unidades_vendidas || 0)
      ]);

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `reporte_margenes_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error exporting CSV:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto py-6 px-4">
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
            <span className="text-2xl">📈</span> Reporte de Precios y Márgenes
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Auditoría en tiempo real de márgenes de ganancia, costos ajustados con IVA y volúmenes de venta de los últimos 30 días.</p>
        </div>
        <Button
          label="Exportar CSV"
          icon="pi pi-file-excel"
          onClick={handleExportCSV}
          disabled={data.length === 0 || loading}
          className="!bg-emerald-600 hover:!bg-emerald-700 border-none px-5 py-2.5 rounded-xl font-bold shadow-md shadow-emerald-100 transition-all"
        />
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-3xl p-6 text-white shadow-sm border border-indigo-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-indigo-100 text-xs font-bold uppercase tracking-wider">Productos Filtrados</p>
              <h3 className="text-3xl font-extrabold mt-2">{totalRecords}</h3>
            </div>
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <i className="pi pi-box text-lg"></i>
            </div>
          </div>
          <p className="text-indigo-200 text-xs mt-3 font-medium">Total de SKUs que coinciden con los filtros</p>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-3xl p-6 text-white shadow-sm border border-emerald-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-emerald-100 text-xs font-bold uppercase tracking-wider">Margen Promedio (Pág)</p>
              <h3 className="text-3xl font-extrabold mt-2">{avgMargin.toFixed(2)}%</h3>
            </div>
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <i className="pi pi-percentage text-lg"></i>
            </div>
          </div>
          <p className="text-emerald-200 text-xs mt-3 font-medium">Margen bruto de los productos en pantalla</p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-3xl p-6 text-white shadow-sm border border-purple-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-purple-100 text-xs font-bold uppercase tracking-wider">Ventas 30d (Pág)</p>
              <h3 className="text-3xl font-extrabold mt-2">{totalSold} uds</h3>
            </div>
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <i className="pi pi-shopping-cart text-lg"></i>
            </div>
          </div>
          <p className="text-purple-200 text-xs mt-3 font-medium">Unidades vendidas en pantalla el último mes</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Form Panel (Matches Mass Update exactly) */}
        <form onSubmit={handleFilterSubmit} className="lg:col-span-1 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-5">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <i className="pi pi-sliders-h text-emerald-500"></i> Filtros de Carga Masiva
            </h2>
          </div>

          {/* Cost Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Costo a Visualizar</label>
            <Dropdown
              value={costType}
              options={[
                { label: 'Costo Estándar', value: 'STANDARD' },
                { label: 'Costo Promedio', value: 'AVERAGE' },
                { label: 'Costo de Reposición', value: 'REPLACEMENT' },
                { label: 'Último Costo', value: 'LAST' }
              ]}
              onChange={(e) => setCostType(e.value)}
              className="w-full text-xs"
            />
          </div>

          {/* Suppliers */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Proveedores</label>
            <MultiSelect
              value={suppliers}
              options={supplierOptions}
              onChange={(e) => setSuppliers(e.value)}
              optionLabel="name"
              optionValue="id"
              placeholder="Cualquier proveedor..."
              filter
              className="w-full text-xs"
              display="chip"
            />
          </div>

          {/* Categories */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Categorías Principales</label>
            <MultiSelect
              value={categories}
              options={categoryOptions}
              onChange={(e) => setCategories(e.value)}
              optionLabel="name"
              optionValue="id"
              placeholder="Cualquier categoría..."
              filter
              className="w-full text-xs"
              display="chip"
            />
          </div>

          {/* Brands */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Marcas (comas)</label>
            <InputText
              value={brands}
              onChange={(e) => setBrands(e.target.value)}
              placeholder="Ej. Polar, Nike..."
              className="w-full text-sm"
            />
          </div>

          {/* Models */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Modelos (comas)</label>
            <InputText
              value={models}
              onChange={(e) => setModels(e.target.value)}
              placeholder="Ej. Harina, Air Max..."
              className="w-full text-sm"
            />
          </div>

          {/* Variant Property & Value */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Propiedad</label>
              <Dropdown
                value={attrKey}
                options={[
                  { label: 'Sin Filtro', value: '' },
                  { label: 'Talla (talla)', value: 'talla' },
                  { label: 'Color (color)', value: 'color' }
                ]}
                onChange={(e) => {
                  setAttrKey(e.value);
                  if (!e.value) setAttrValue('');
                }}
                className="w-full text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Valor</label>
              <InputText
                value={attrValue}
                onChange={(e) => setAttrValue(e.target.value)}
                placeholder="Ej. XL, M, Rojo"
                disabled={!attrKey}
                className="w-full text-sm"
              />
            </div>
          </div>

          {/* Search Term */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Término Búsqueda</label>
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Ej. Lata, Caja..."
              className="w-full text-sm"
            />
          </div>

          <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-50">
            <Button
              type="submit"
              label="Aplicar Filtros"
              icon="pi pi-search"
              className="w-full !bg-emerald-600 hover:!bg-emerald-700 border-none rounded-xl py-2.5 font-bold shadow-md shadow-emerald-50"
            />
            <Button
              type="button"
              label="Limpiar Todo"
              icon="pi pi-refresh"
              text
              severity="secondary"
              className="w-full rounded-xl py-2"
              onClick={handleClearFilters}
            />
          </div>
        </form>

        {/* Main Data Table */}
        <div className="lg:col-span-3 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4">
          {loading && <ProgressBar mode="indeterminate" style={{ height: '4px' }} color="#10b981" className="rounded-full" />}
          
          <DataTable
            value={data}
            lazy
            paginator
            first={lazyParams.first}
            rows={lazyParams.rows}
            totalRecords={totalRecords}
            onPage={onPage}
            rowsPerPageOptions={[10, 20, 50, 100]}
            className="p-datatable-sm text-sm"
            emptyMessage="No hay datos que coincidan con los filtros seleccionados."
            rowHover
            responsiveLayout="scroll"
          >
            <Column
              field="codigo"
              header="CÓDIGO (SKU)"
              body={(r) => <span className="font-mono font-bold text-slate-700">{r.codigo}</span>}
              className="w-[12%]"
            ></Column>
            <Column
              field="producto"
              header="PRODUCTO"
              body={(r) => <span className="font-semibold text-slate-800">{r.producto}</span>}
              className="w-[30%]"
            ></Column>
            <Column
              field="costo_sin_iva"
              header={`COSTO SIN IVA (${costType === 'STANDARD' ? 'Est.' : costType === 'AVERAGE' ? 'Prom.' : costType === 'REPLACEMENT' ? 'Rep.' : 'Últ.'})`}
              body={(r) => <span className="font-medium text-slate-500">${Number(r.costo_sin_iva).toFixed(2)}</span>}
              className="w-[12%]"
            ></Column>
            <Column
              field="costo_con_iva"
              header={`COSTO CON IVA (${costType === 'STANDARD' ? 'Est.' : costType === 'AVERAGE' ? 'Prom.' : costType === 'REPLACEMENT' ? 'Rep.' : 'Últ.'})`}
              body={(r) => <span className="font-medium text-slate-600">${Number(r.costo_con_iva).toFixed(2)}</span>}
              className="w-[12%]"
            ></Column>
            <Column
              field="margen"
              header="MARGEN %"
              body={(r) => {
                const val = Number(r.margen);
                return (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${val >= 25 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                    {val.toFixed(2)}%
                  </span>
                );
              }}
              className="w-[12%]"
            ></Column>
            <Column
              field="precio_venta"
              header="PRECIO"
              body={(r) => <span className="font-bold text-emerald-600">${Number(r.precio_venta).toFixed(2)}</span>}
              className="w-[12%]"
            ></Column>
            <Column
              header="PVP"
              body={(r) => <span className="font-bold text-emerald-800">${(Number(r.precio_venta) * 1.16).toFixed(2)}</span>}
              className="w-[12%]"
            ></Column>
            <Column
              field="unidades_vendidas"
              header="VENTAS (30d)"
              body={(r) => <span className="font-bold text-slate-700">{r.unidades_vendidas} uds</span>}
              className="w-[10%]"
              align="center"
            ></Column>
          </DataTable>
        </div>
      </div>
    </div>
  );
}
