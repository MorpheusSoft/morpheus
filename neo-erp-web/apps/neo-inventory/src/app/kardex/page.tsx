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
      try {
        const allWhs = await ValuationService.getWarehouses();
        if (selectedFacilities && selectedFacilities.length > 0) {
          const filtered = (allWhs || []).filter((w: any) => selectedFacilities.includes(w.facility_id));
          setWarehouses(filtered);
          setSelectedWarehouses(prev => prev.filter(whId => filtered.some((w: any) => w.id === whId)));
        } else {
          setWarehouses(allWhs || []);
        }
      } catch (err) {
        console.error("Error cargando almacenes", err);
      }
    };
    loadWarehouses();
  }, [selectedFacilities]);

  const searchProducts = async (event: any) => {
    try {
      const res = await ProductService.getProducts(0, 25, event.query);
      if (res && res.data) {
        const variants = res.data.flatMap((p: any) => (p.variants || []).map((v: any) => {
          const barcodesList: string[] = [];
          if (v.barcode) barcodesList.push(v.barcode);
          if (Array.isArray(v.barcodes)) {
            v.barcodes.forEach((b: any) => {
              if (b?.barcode && !barcodesList.includes(b.barcode)) {
                barcodesList.push(b.barcode);
              }
            });
          }
          const barcodeStr = barcodesList.length > 0 ? ` | Barras: ${barcodesList.join(', ')}` : '';
          const partNumStr = v.part_number ? ` | Ref: ${v.part_number}` : '';
          return {
            ...v,
            product_name: p.name,
            display_name: `[${v.sku}] ${p.name}${barcodeStr}${partNumStr}`
          };
        }));
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
        warehouse_ids: selectedWarehouses.length > 0 ? selectedWarehouses : undefined,
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

  const formatQty = (value: number | undefined | null, isDecimal: boolean) => {
    if (value === undefined || value === null) return '0';
    const num = Number(value);
    if (isNaN(num)) return '0';
    if (!isDecimal) {
      return Math.round(num).toLocaleString('es-VE');
    }
    return new Intl.NumberFormat('es-VE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    }).format(Math.round(num * 1000) / 1000);
  };

  const exportProductCSV = (result: any) => {
    const rows: string[] = [
      "SUCURSAL,ALMACEN,FECHA,DOCUMENTO,TIPO,DETALLE_MOVIMIENTO,ENTRADAS,SALIDAS,SALDO,UNIDAD,COSTO"
    ];
    if (result.facilities && result.facilities.length > 0) {
      result.facilities.forEach((fac: any) => {
        fac.warehouses.forEach((wh: any) => {
          wh.history.forEach((h: any) => {
            rows.push(
              `"${fac.facility_name}","${wh.warehouse_name}","${h.date}","${h.reference}","${h.type}","${h.flow_display || ''}",${h.qty_in},${h.qty_out},${h.balance},"${result.uom || 'UND'}",${h.cost}`
            );
          });
        });
      });
    } else if (result.history) {
      result.history.forEach((h: any) => {
        rows.push(
          `"${h.facility_name || ''}","${h.src_warehouse || h.dest_warehouse || ''}","${h.date}","${h.reference}","${h.type}","${h.flow_display || ''}",${h.qty_in},${h.qty_out},${h.balance},"${result.uom || 'UND'}",${h.cost}`
        );
      });
    }
    const csvContent = "data:text/csv;charset=utf-8," + rows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `kardex_${result.sku}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const flowLocationTemplate = (rowData: any) => {
    if (rowData.flow_type === 'INITIAL' || rowData.type === 'INITIAL') {
      return (
        <span className="font-semibold text-slate-500 text-xs flex items-center gap-1.5">
          <i className="pi pi-bookmark text-slate-400 text-xs"></i>
          Saldo Inicial
        </span>
      );
    }

    const isIn = rowData.flow_type === 'IN';
    const isOut = rowData.flow_type === 'OUT';
    const isInternal = rowData.flow_type === 'INTERNAL';

    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isIn && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <i className="pi pi-arrow-down-left text-[10px]"></i>
              {rowData.flow_display}
            </span>
          )}
          {isOut && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
              <i className="pi pi-arrow-up-right text-[10px]"></i>
              {rowData.flow_display}
            </span>
          )}
          {isInternal && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              <i className="pi pi-arrows-h text-[10px]"></i>
              {rowData.flow_display}
            </span>
          )}
          {!isIn && !isOut && !isInternal && (
            <span className="text-xs text-slate-700 font-medium">{rowData.flow_display || rowData.location_name || 'N/A'}</span>
          )}
        </div>
        {(rowData.dest_location || rowData.src_location) && (
          <span className="text-[11px] text-slate-400 pl-0.5">
            Ubicación: {rowData.dest_location || rowData.src_location}
          </span>
        )}
      </div>
    );
  };

  const renderHeader = () => {
    return (
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 m-0 tracking-tight">Reporte Kardex</h2>
            <p className="text-slate-500 text-sm mt-1 font-medium">Trazabilidad segmentada por Localidad y Almacén</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button icon="pi pi-filter-slash" rounded text severity="secondary" onClick={clearFilters} tooltip="Limpiar Filtros" />
            <Button icon="pi pi-search" label="Generar Kardex" rounded severity="info" onClick={loadKardex} loading={loading} disabled={selectedProducts.length === 0} />
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 bg-slate-50/50 p-4 rounded-[1.5rem] border border-slate-100 backdrop-blur-md">
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
              placeholder="Buscar por nombre, SKU o código de barras..."
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
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">Almacenes</label>
            <MultiSelect
              value={selectedWarehouses}
              options={warehouses}
              optionLabel="name"
              optionValue="id"
              onChange={(e) => setSelectedWarehouses(e.value)}
              placeholder="Todos"
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
              border-radius: 0.75rem;
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
              padding: 0.65rem 0.5rem !important;
            }
            .kardex-datatable .p-datatable-tbody > tr > td {
              border-bottom: 1px solid #f1f5f9 !important;
              padding: 0.65rem 0.5rem !important;
              font-size: 0.82rem;
            }
          `}} />

          {kardexResults.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400">
              <i className="pi pi-table text-5xl mb-4 opacity-50"></i>
              <p className="font-medium text-lg">Selecciona al menos un producto y presiona Generar Kardex.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-10">
              {kardexResults.map((result: any) => (
                <div key={result.product_id} className="border border-slate-200 rounded-[2rem] p-5 md:p-6 bg-slate-50/50 flex flex-col gap-6 shadow-sm">
                  {/* Product Header Card */}
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="font-extrabold text-xl text-slate-900 m-0 tracking-tight">
                          [{result.sku}] {result.product_name}
                        </h3>
                        <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black border ${result.is_decimal ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-blue-50 text-blue-800 border-blue-200'}`}>
                          {result.uom || 'UND'} {result.is_decimal ? '(Medida Ponderable)' : '(Por Unidad)'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 md:gap-4 text-xs font-semibold text-slate-500 mt-2.5 flex-wrap">
                        <span>Saldo Inicial Consolidado: <strong className="text-slate-700">{formatQty(result.total_initial_balance, result.is_decimal)} {result.uom}</strong></span>
                        <span className="text-slate-300">•</span>
                        <span>Total Entradas: <strong className="text-emerald-600">+{formatQty(result.total_in, result.is_decimal)}</strong></span>
                        <span className="text-slate-300">•</span>
                        <span>Total Salidas: <strong className="text-rose-600">-{formatQty(result.total_out, result.is_decimal)}</strong></span>
                        <span className="text-slate-300">•</span>
                        <span>Saldo Final Consolidado: <strong className="text-blue-700 font-black">{formatQty(result.total_final_balance, result.is_decimal)} {result.uom}</strong></span>
                      </div>
                    </div>
                    
                    <Button
                      icon="pi pi-file-excel"
                      label="Exportar CSV"
                      severity="success"
                      size="small"
                      rounded
                      onClick={() => exportProductCSV(result)}
                    />
                  </div>

                  {/* Segmented by Facility and Warehouse */}
                  {(!result.facilities || result.facilities.length === 0) ? (
                    <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-dashed border-slate-200">
                      <i className="pi pi-inbox text-3xl mb-2 opacity-50"></i>
                      <p className="font-medium text-sm m-0">No se registraron movimientos ni saldos para este producto en los filtros seleccionados.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-6">
                      {result.facilities.map((fac: any) => (
                        <div key={fac.facility_id} className="flex flex-col gap-3">
                          {/* Facility Title */}
                          <div className="flex items-center gap-2.5 px-2 pt-1">
                            <div className="w-8 h-8 rounded-xl bg-slate-800 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                              <i className="pi pi-building text-xs"></i>
                            </div>
                            <div>
                              <h4 className="text-sm font-black text-slate-800 m-0 uppercase tracking-wider">
                                SUCURSAL: {fac.facility_name}
                              </h4>
                              <span className="text-[11px] text-slate-400 font-medium">
                                {fac.warehouses.length} {fac.warehouses.length === 1 ? 'almacén con actividad' : 'almacenes con actividad'}
                              </span>
                            </div>
                          </div>

                          {/* Warehouses inside this facility */}
                          <div className="flex flex-col gap-5 pl-2 md:pl-4 border-l-2 border-slate-200/70 ml-3">
                            {fac.warehouses.map((wh: any) => (
                              <div key={wh.warehouse_id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                {/* Warehouse Subheader */}
                                <div className="bg-slate-50/80 border-b border-slate-200 px-5 py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                  <div className="flex items-center gap-2">
                                    <i className="pi pi-box text-cyan-600 font-bold text-base"></i>
                                    <span className="font-black text-sm text-slate-800">
                                      {wh.warehouse_name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs font-semibold flex-wrap">
                                    <span className="text-slate-500">Saldo Inicial: <strong className="text-slate-700">{formatQty(wh.initial_balance, result.is_decimal)} {result.uom}</strong></span>
                                    <span className="text-emerald-600 font-bold">+{formatQty(wh.total_in, result.is_decimal)}</span>
                                    <span className="text-rose-600 font-bold">-{formatQty(wh.total_out, result.is_decimal)}</span>
                                    <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-md font-black">
                                      Saldo Final: {formatQty(wh.final_balance, result.is_decimal)} {result.uom}
                                    </span>
                                  </div>
                                </div>

                                {/* Table of Movements for this Warehouse */}
                                <DataTable
                                  value={wh.history}
                                  loading={loading}
                                  paginator
                                  rows={15}
                                  className="kardex-datatable"
                                  emptyMessage="No hay movimientos registrados para este almacén."
                                >
                                  <Column field="date" header="FECHA" body={(r) => formatDate(r.date)} style={{ width: '13%' }}></Column>
                                  <Column field="reference" header="DOCUMENTO" style={{ width: '15%' }}></Column>
                                  <Column field="type" header="TIPO" body={typeTemplate} style={{ width: '10%' }}></Column>
                                  <Column field="flow_display" header="DETALLE / MOVIMIENTO" body={flowLocationTemplate} style={{ width: '26%' }}></Column>
                                  <Column
                                    field="qty_in"
                                    header="ENTRADAS"
                                    body={(r) => r.qty_in > 0 ? <span className="font-bold text-emerald-600 tabular-nums">+{formatQty(r.qty_in, result.is_decimal)}</span> : <span className="text-slate-300">-</span>}
                                    style={{ width: '10%' }}
                                  ></Column>
                                  <Column
                                    field="qty_out"
                                    header="SALIDAS"
                                    body={(r) => r.qty_out > 0 ? <span className="font-bold text-rose-600 tabular-nums">-{formatQty(r.qty_out, result.is_decimal)}</span> : <span className="text-slate-300">-</span>}
                                    style={{ width: '10%' }}
                                  ></Column>
                                  <Column
                                    field="balance"
                                    header="SALDO"
                                    body={(r) => <span className="font-black text-blue-700 tabular-nums">{formatQty(r.balance, result.is_decimal)}</span>}
                                    style={{ width: '10%' }}
                                  ></Column>
                                  <Column
                                    field="cost"
                                    header="COSTO UNIT"
                                    body={(r) => formatCurrency(r.cost)}
                                    className="text-slate-500 text-xs tabular-nums"
                                    style={{ width: '10%' }}
                                  ></Column>
                                </DataTable>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
