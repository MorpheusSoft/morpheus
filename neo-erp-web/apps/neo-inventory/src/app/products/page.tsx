'use client';
import { useState, useEffect } from 'react';
import { FilterMatchMode } from 'primereact/api';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { ProductService } from '@/services/product.service';
import { useRouter } from 'next/navigation';

export default function ProductsCatalogPage() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [globalFilterValue, setGlobalFilterValue] = useState('');
  
  const [showLocationsDialog, setShowLocationsDialog] = useState(false);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [selectedLocations, setSelectedLocations] = useState<any[]>([]);
  const [selectedProductTitle, setSelectedProductTitle] = useState('');
  
  const [lazyState, setLazyState] = useState({
      first: 0,
      rows: 10,
      page: 0
  });

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
     setIsMounted(true);
     if (typeof window !== 'undefined') {
         const savedFilter = sessionStorage.getItem('dt-products-filter');
         if (savedFilter) setGlobalFilterValue(savedFilter);
         
         const savedLazy = sessionStorage.getItem('dt-products-lazy');
         if (savedLazy) setLazyState(JSON.parse(savedLazy));
     }
  }, []);

  useEffect(() => {
     if (isMounted && typeof window !== 'undefined') {
         sessionStorage.setItem('dt-products-filter', globalFilterValue);
     }
  }, [globalFilterValue, isMounted]);

  useEffect(() => {
     if (isMounted && typeof window !== 'undefined') {
         sessionStorage.setItem('dt-products-lazy', JSON.stringify(lazyState));
     }
  }, [lazyState, isMounted]);

  const loadLazyData = async (first = lazyState.first, rows = lazyState.rows, filter = globalFilterValue) => {
    try {
      setLoading(true);
      const response = await ProductService.getProducts(first, rows, filter);
      setProducts(response?.data || []);
      setTotalRecords(response?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLazyData(lazyState.first, lazyState.rows, globalFilterValue);
  }, [lazyState.first, lazyState.rows]);

  useEffect(() => {
    const delay = setTimeout(() => {
        if (lazyState.first !== 0) {
           setLazyState(prev => ({ ...prev, first: 0, page: 0 }));
        } else {
           loadLazyData(0, lazyState.rows, globalFilterValue);
        }
    }, 500);
    return () => clearTimeout(delay);
  }, [globalFilterValue]);

  const onPage = (event: any) => {
      setLazyState(prev => ({ ...prev, ...event }));
  };

  const onGlobalFilterChange = (e: any) => {
    setGlobalFilterValue(e.target.value);
  };

  const showLocations = async (rowData: any) => {
      setSelectedProductTitle(rowData.name);
      setShowLocationsDialog(true);
      setLocationsLoading(true);
      try {
          const locs = await ProductService.getProductStockLocations(rowData.id);
          setSelectedLocations(locs || []);
      } catch (err) {
          console.error(err);
      } finally {
          setLocationsLoading(false);
      }
  };

  const statusBodyTemplate = (rowData: any) => {
    const active = rowData.is_active !== false;
    return (
      <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold ${active ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/60' : 'bg-rose-50 text-rose-600 border border-rose-200/60'}`}>
        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${active ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
        {active ? 'Activo' : 'Inactivo'}
      </span>
    );
  };

  const skuBodyTemplate = (rowData: any) => {
    const sku = rowData.variants?.length ? rowData.variants[0].sku : '---';
    return <span className="font-mono text-sm text-slate-600 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md shadow-sm">{sku}</span>;
  };

  const priceBodyTemplate = (rowData: any) => {
    const price = rowData.variants?.length ? rowData.variants[0].sales_price : 0;
    return <span className="font-extrabold text-slate-700 text-[15px]">${Number(price).toFixed(2)}</span>;
  };

  const stockBodyTemplate = (rowData: any) => {
    const stock = Number(rowData.total_stock || 0);
    return (
      <div className="flex items-center gap-2">
         <span className={`font-extrabold text-[15px] tabular-nums ${stock > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{stock} Und</span>
         <Button icon="pi pi-map-marker" rounded text severity="info" size="small" tooltip="Ver Desglose en Sucursales" tooltipOptions={{ position: 'top' }} onClick={(e) => { e.preventDefault(); showLocations(rowData); }} />
      </div>
    );
  };



  const renderHeader = () => {
    return (
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 m-0 tracking-tight">Catálogo de Productos</h2>
          <p className="text-slate-500 text-sm mt-1 font-medium">Gestión de inventario y precios</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <span className="p-input-icon-left w-full sm:w-64">
             <i className="pi pi-search text-slate-400 z-10" />
             <InputText 
               type="search"
               autoComplete="off" 
               value={globalFilterValue} 
               onChange={onGlobalFilterChange} 
               placeholder="Buscar (Nombre, SKU)..." 
               className="w-full !pl-10 !rounded-full !bg-slate-50 border-transparent focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 transition-all !py-2.5 shadow-sm"
             />
          </span>

        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto">
      <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden relative backdrop-blur-3xl">
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
              padding: 1.25rem 1rem !important;
            }
            .premium-datatable .p-datatable-thead > tr > th:last-child {
              text-align: right !important;
              padding-right: 1.5rem !important;
            }
            .premium-datatable .p-datatable-tbody > tr > td:last-child {
              text-align: right !important;
            }
          `}} />

          <DataTable 
            value={products} 
            lazy={true}
            first={lazyState.first}
            onPage={onPage}
            totalRecords={totalRecords}
            paginator 
            rows={10} 
            dataKey="id" 
            loading={loading}
            emptyMessage={
              <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                <i className="pi pi-box text-5xl mb-4 opacity-50"></i>
                <p className="font-medium text-lg">No hay productos en el catálogo.</p>
              </div>
            }
            className="premium-datatable mt-4" 
          >
            <Column field="id" header="ID" sortable style={{ width: '5%', minWidth: '4rem' }} className="text-slate-400 text-xs font-bold"></Column>
            <Column header="CÓDIGO (SKU)" body={skuBodyTemplate} style={{ width: '15%', minWidth: '10rem' }}></Column>
            <Column field="name" header="NOMBRE DEL PRODUCTO" sortable style={{ width: '35%', minWidth: '16rem' }} className="font-semibold text-slate-800 text-[15px]"></Column>
            <Column field="brand" header="MARCA" sortable style={{ width: '15%', minWidth: '8rem' }} className="text-slate-500 font-medium text-sm"></Column>
            <Column header="PRECIO BASE" body={priceBodyTemplate} sortable style={{ width: '15%', minWidth: '10rem' }}></Column>
            <Column header="EXISTENCIA" body={stockBodyTemplate} sortable style={{ width: '15%', minWidth: '10rem' }}></Column>
            <Column header="ESTADO" body={statusBodyTemplate} style={{ width: '10%', minWidth: '6rem' }}></Column>

          </DataTable>

          <Dialog header={`Inventario Físico - ${selectedProductTitle}`} visible={showLocationsDialog} style={{ width: '45vw' }} onHide={() => setShowLocationsDialog(false)} className="backdrop-blur-sm">
             <DataTable value={selectedLocations} loading={locationsLoading} emptyMessage="No hay stock físico registrado de este producto." className="mt-4 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <Column field="facility_name" header="SUCURSAL" className="font-bold text-slate-800"></Column>
                <Column field="variant_sku" header="SKU VARIANTE" className="font-mono text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded w-fit"></Column>
                <Column field="stock_qty" header="CANTIDAD" body={(r) => <span className="font-black text-blue-700 text-lg tabular-nums">{Number(r.stock_qty)} U</span>}></Column>
             </DataTable>
          </Dialog>

        </div>
      </div>
    </div>
  );
}
