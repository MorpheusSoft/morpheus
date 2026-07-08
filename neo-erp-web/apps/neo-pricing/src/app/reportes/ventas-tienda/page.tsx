'use client';

import { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { ProgressBar } from 'primereact/progressbar';
import { ReportService } from '@/services/report.service';
import { ProductService } from '@/services/product.service';
import * as XLSX from 'xlsx';

interface Facility {
  id: number;
  name: string;
  code: string;
}

interface SaleRow {
  code: string;
  name: string;
  sales: Record<number, number>;
}

export default function SalesByFacilityReportPage() {
  const [loading, setLoading] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [data, setData] = useState<SaleRow[]>([]);
  
  // Filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [codeType, setCodeType] = useState<string>('SKU');
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [supplierOptions, setSupplierOptions] = useState<any[]>([]);

  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        const sups = await ProductService.getSuppliers();
        setSupplierOptions(sups?.data || sups || []);
      } catch (err) {
        console.error('Error loading suppliers:', err);
      }
    };
    loadSuppliers();
  }, []);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const res = await ReportService.getSalesByFacilityReport({
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        code_type: codeType,
        supplier_id: selectedSupplierId || undefined,
        search_term: searchTerm || undefined
      });
      setFacilities(res?.facilities || []);
      setData(res?.rows || []);
    } catch (err) {
      console.error('Error fetching sales by facility report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const handleFilterSubmit = (e: any) => {
    e.preventDefault();
    fetchReport();
  };

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    setCodeType('SKU');
    setSelectedSupplierId(null);
    setSearchTerm('');
  };

  const handleExportExcel = () => {
    if (data.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }
    
    // Create worksheet data
    const headers = [
      codeType === 'BARCODE' ? 'Código de Barra' : 'Código (SKU)',
      'Producto'
    ];
    facilities.forEach(fac => {
      headers.push(fac.name || fac.code);
    });
    headers.push('Total General');

    const rows = data.map((item: SaleRow) => {
      const rowData: any[] = [
        item.code,
        item.name
      ];
      let totalRow = 0;
      facilities.forEach(fac => {
        const qty = item.sales[fac.id] || 0;
        rowData.push(qty);
        totalRow += qty;
      });
      rowData.push(totalRow);
      return rowData;
    });

    const worksheetData = [headers, ...rows];
    
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas por Sucursal');
    
    XLSX.writeFile(workbook, `reporte_ventas_sucursal_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto py-6 px-4">
      {/* Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
            <span className="text-2xl">🏬</span> Reporte de Ventas por Sucursal
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Visualización y auditoría de cantidades vendidas agregadas por producto y distribuidas por cada sucursal activa.</p>
        </div>
        <Button
          label="Exportar Excel"
          icon="pi pi-file-excel"
          onClick={handleExportExcel}
          disabled={data.length === 0 || loading}
          className="!bg-emerald-600 hover:!bg-emerald-700 border-none px-5 py-2.5 rounded-xl font-bold shadow-md shadow-emerald-100 transition-all text-white"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters Form Panel */}
        <form onSubmit={handleFilterSubmit} className="lg:col-span-1 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-5">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <i className="pi pi-sliders-h text-emerald-500"></i> Filtros del Reporte
            </h2>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Fecha Inicio</label>
            <InputText
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-sm"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Fecha Fin</label>
            <InputText
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-sm"
            />
          </div>

          {/* Code Type */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Tipo de Código</label>
            <Dropdown
              value={codeType}
              options={[
                { label: 'Código (SKU)', value: 'SKU' },
                { label: 'Código de Barra', value: 'BARCODE' }
              ]}
              onChange={(e) => setCodeType(e.value)}
              className="w-full text-xs"
            />
          </div>

          {/* Supplier Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Proveedor</label>
            <Dropdown
              value={selectedSupplierId}
              options={supplierOptions}
              onChange={(e) => setSelectedSupplierId(e.value)}
              optionLabel="name"
              optionValue="id"
              placeholder="Cualquier proveedor..."
              filter
              showClear
              className="w-full text-xs"
            />
          </div>

          {/* Product Search */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Buscar Producto</label>
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nombre, SKU o barras..."
              className="w-full text-sm"
            />
          </div>

          <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-50">
            <Button
              type="submit"
              label="Aplicar Filtros"
              icon="pi pi-search"
              className="w-full !bg-emerald-600 hover:!bg-emerald-700 border-none rounded-xl py-2.5 font-bold shadow-md shadow-emerald-50 text-white"
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
            className="p-datatable-sm text-sm"
            emptyMessage="No hay datos que coincidan con los filtros seleccionados."
            rowHover
            responsiveLayout="scroll"
            paginator
            rows={15}
            rowsPerPageOptions={[10, 15, 30, 50]}
          >
            <Column
              field="code"
              header={codeType === 'BARCODE' ? 'CÓDIGO DE BARRA' : 'CÓDIGO (SKU)'}
              body={(r) => <span className="font-mono font-bold text-slate-700">{r.code}</span>}
              className="w-[15%]"
            ></Column>
            <Column
              field="name"
              header="PRODUCTO"
              body={(r) => <span className="font-semibold text-slate-800">{r.name}</span>}
              className="w-[30%]"
            ></Column>
            
            {/* Dynamic Columns for each Facility */}
            {facilities.map((fac) => (
              <Column
                key={fac.id}
                header={fac.name || fac.code}
                body={(r: SaleRow) => {
                  const qty = r.sales[fac.id] || 0;
                  return <span className={qty > 0 ? "font-bold text-slate-800" : "text-slate-400"}>{qty.toFixed(2)}</span>;
                }}
                align="center"
              />
            ))}

            {/* Total Column */}
            <Column
              header="TOTAL"
              body={(r: SaleRow) => {
                const total = facilities.reduce((sum, fac) => sum + (r.sales[fac.id] || 0), 0);
                return <span className="font-extrabold text-emerald-700">{total.toFixed(2)}</span>;
              }}
              align="center"
              className="w-[12%]"
            />
          </DataTable>
        </div>
      </div>
    </div>
  );
}
