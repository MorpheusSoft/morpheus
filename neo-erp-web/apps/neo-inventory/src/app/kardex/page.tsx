'use client';
import { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { AutoComplete } from 'primereact/autocomplete';
import { ReportService } from '@/services/report.service';
import { ValuationService } from '@/services/valuation.service';
import { ProductService } from '@/services/product.service';

export default function KardexPage() {
  const [loading, setLoading] = useState(false);
  const [kardexResults, setKardexResults] = useState<any[]>([]);
  
  // Date range defaults
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1); // Last month by default
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Filters
  const [facilities, setFacilities] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  
  const [selectedFacilities, setSelectedFacilities] = useState<any[]>([]);
  const [selectedWarehouses, setSelectedWarehouses] = useState<any[]>([]);
  
  // Product Autocomplete
  const [selectedProducts, setSelectedProducts] = useState<any[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<any[]>([]);

  // Initial load
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const facs = await ValuationService.getFacilities();
        setFacilities(facs || []);
      } catch (err) {
        console.error("Error cargando metadatos", err);
      }
    };
    loadMetadata();
  }, []);

  // Load warehouses when facilities change
  useEffect(() => {
    const loadWarehouses = async () => {
      if (!selectedFacilities || selectedFacilities.length === 0) {
        setWarehouses([]);
        return;
      }
      try {
        // Load warehouses for all selected facilities
        const allWhs = [];
        for (const fac of selectedFacilities) {
          const whs = await ValuationService.getWarehouses(fac);
          allWhs.push(...whs);
        }
        setWarehouses(allWhs);
      } catch (err) {
        console.error("Error cargando almacenes", err);
      }
    };
    loadWarehouses();
  }, [selectedFacilities]);

  const searchProducts = async (event: any) => {
    try {
      // In Morpheus, getProducts returns items, we need their default variant id
      // Since getProducts might return Product, and we need Variant IDs.
      const res = await ProductService.getProducts(0, 20, event.query);
      if (res && res.data) {
        // Extract variants
        const variants = res.data.flatMap((p: any) => p.variants.map((v: any) => ({
            ...v,
            product_name: p.name,
            display_name: `[${v.sku}] ${p.name}`
        })));
        setFilteredProducts(variants);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadKardex = async () => {
    if (selectedProducts.length === 0) return;
    if (selectedProducts.length > 10) {
      alert("Por favor selecciona un máximo de 10 productos para el reporte.");
      return;
    }
    
    setLoading(true);
    try {
      const payload = {
        product_ids: selectedProducts.map(p => p.id),
        facility_ids: selectedFacilities.length > 0 ? selectedFacilities : undefined,
        location_ids: selectedWarehouses.length > 0 ? selectedWarehouses : undefined,
        date_from: startDate ? new Date(startDate).toISOString() : undefined,
        date_to: endDate ? new Date(endDate + 'T23:59:59Z').toISOString() : undefined
      };
      const data = await ReportService.getKardex(payload);
      setKardexResults(data);
    } catch (err) {
      console.error("Error cargando Kardex", err);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSelectedFacilities([]);
    setSelectedWarehouses([]);
    setSelectedProducts([]);
    setKardexResults([]);
  };

  const formatCurrency = (value: number) => {
    if (value === undefined || value === null) return '---';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '---';
    let cleanStr = dateStr;
    if (typeof dateStr === 'string' && !dateStr.includes('Z') && !dateStr.includes('+') && !/-\d{2}:\d{2}$/.test(dateStr)) {
      cleanStr = dateStr.replace(' ', 'T') + 'Z';
    }
    const d = new Date(cleanStr);
    return d.toLocaleString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // Cell templates
  const typeTemplate = (rowData: any) => {
    if (rowData.type === 'IN') return <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-bold">ENTRADA</span>;
    if (rowData.type === 'OUT') return <span className="bg-rose-100 text-rose-800 px-2 py-1 rounded text-xs font-bold">SALIDA</span>;
    if (rowData.type === 'TRANSFER') return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">TRANSF</span>;
    if (rowData.type === 'INITIAL') return <span className="bg-slate-200 text-slate-800 px-2 py-1 rounded text-xs font-bold">SALDO INI</span>;
    return <span>{rowData.type}</span>;
  };

  const renderHeader = () => {
    return (
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 m-0 tracking-tight">Reporte Kardex</h2>
            <p className="text-slate-500 text-sm mt-1 font-medium">Trazabilidad de Entradas, Salidas y Saldos por Producto</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button icon="pi pi-filter-slash" rounded text severity="secondary" onClick={clearFilters} tooltip="Limpiar Filtros" />
            <Button icon="pi pi-search" label="Generar Kardex" rounded severity="info" onClick={loadKardex} loading={loading} disabled={selectedProducts.length === 0} />
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-slate-50/50 p-4 rounded-[1.5rem] border border-slate-100 backdrop-blur-md">
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Productos (Máx 10) *</label>
            <AutoComplete
              multiple
              value={selectedProducts}
              suggestions={filteredProducts}
              completeMethod={searchProducts}
              field="display_name"
              onChange={(e) => {
                 if (e.value.length <= 10) setSelectedProducts(e.value);
              }}
              placeholder="Buscar por nombre o SKU..."
              className="w-full"
              inputClassName="w-full !rounded-xl !bg-white border-slate-200 focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 shadow-sm !py-2"
              pt={{ container: { className: '!rounded-xl border-slate-200 focus-within:!border-blue-400 focus-within:!ring-4 focus-within:!ring-blue-500/10 shadow-sm' } }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Sucursales</label>
            <MultiSelect
              value={selectedFacilities}
              options={facilities}
              optionLabel="name"
              optionValue="id"
              onChange={(e) => setSelectedFacilities(e.value)}
              placeholder="Todas"
              display="chip"
              className="w-full !rounded-xl !bg-white border-slate-200 focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 shadow-sm"
            />
          </div>

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
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto">
      {/* Main Table */}
      <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden relative">
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-90"></div>
        <div className="p-5 md:p-6">
          {renderHeader()}

          <style dangerouslySetInnerHTML={{__html: `
            .kardex-datatable .p-datatable-wrapper {
              border-radius: 1rem;
              overflow-x: auto;
            }
            .kardex-datatable .p-datatable-thead > tr > th {
              background-color: #f8fafc !important;
              border-bottom: 2px solid #e2e8f0 !important;
              color: #475569 !important;
              font-weight: 700 !important;
              text-transform: uppercase;
              font-size: 0.65rem;
              letter-spacing: 0.05em;
              padding: 0.75rem 0.5rem !important;
            }
            .kardex-datatable .p-datatable-tbody > tr > td {
              border-bottom: 1px solid #f1f5f9 !important;
              padding: 0.75rem 0.5rem !important;
              font-size: 0.85rem;
            }
          `}} />

          {kardexResults.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400">
              <i className="pi pi-table text-5xl mb-4 opacity-50"></i>
              <p className="font-medium text-lg">Selecciona al menos un producto y presiona Generar Kardex.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {kardexResults.map((result: any, idx: number) => (
                <div key={result.product_id} className="border border-slate-200 rounded-[1.5rem] p-4 bg-slate-50/30">
                  <div className="flex justify-between items-center mb-4 px-2">
                    <div>
                      <h3 className="font-extrabold text-lg text-slate-800 m-0">[{result.sku}] {result.product_name}</h3>
                      <p className="text-xs text-slate-500 font-medium">Saldo Inicial: <span className="text-blue-600 font-bold">{result.initial_balance} U</span> | Saldo Final: <span className="text-blue-600 font-bold">{result.final_balance} U</span></p>
                    </div>
                    <Button icon="pi pi-file-excel" severity="success" text rounded tooltip="Exportar Excel" onClick={() => {
                        const csvContent = "data:text/csv;charset=utf-8," 
                          + "FECHA,DOCUMENTO,TIPO,LOCALIDAD,ENTRADAS,SALIDAS,SALDO,COSTO\n"
                          + result.history.map((e: any) => `${e.date},${e.reference},${e.type},${e.location_name},${e.qty_in},${e.qty_out},${e.balance},${e.cost}`).join("\n");
                        const encodedUri = encodeURI(csvContent);
                        const link = document.createElement("a");
                        link.setAttribute("href", encodedUri);
                        link.setAttribute("download", `kardex_${result.sku}.csv`);
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    }} />
                  </div>
                  
                  <DataTable
                    value={result.history}
                    loading={loading}
                    paginator
                    rows={20}
                    className="kardex-datatable bg-white rounded-xl shadow-sm border border-slate-100"
                    emptyMessage="No hay movimientos en este rango de fechas."
                  >
                    <Column field="date" header="FECHA" body={(r) => formatDate(r.date)} style={{ width: '12%' }}></Column>
                    <Column field="reference" header="DOCUMENTO" style={{ width: '15%' }}></Column>
                    <Column field="type" header="TIPO" body={typeTemplate} style={{ width: '10%' }}></Column>
                    <Column field="location_name" header="LOCALIDAD" style={{ width: '20%' }}></Column>
                    <Column field="qty_in" header="ENTRADAS" className="font-bold text-emerald-600 tabular-nums" style={{ width: '10%' }}></Column>
                    <Column field="qty_out" header="SALIDAS" className="font-bold text-rose-600 tabular-nums" style={{ width: '10%' }}></Column>
                    <Column field="balance" header="SALDO" className="font-black text-blue-700 tabular-nums" style={{ width: '10%' }}></Column>
                    <Column field="cost" header="COSTO UNIT" body={(r) => formatCurrency(r.cost)} className="text-slate-500 text-xs" style={{ width: '13%' }}></Column>
                  </DataTable>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
