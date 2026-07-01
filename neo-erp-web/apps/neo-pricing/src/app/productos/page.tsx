'use client';
import { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { ProgressBar } from 'primereact/progressbar';
import { ProductService } from '@/services/product.service';

export default function ProductConsultationPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalRecords, setTotalRecords] = useState(0);
  const [lazyParams, setLazyParams] = useState({
    first: 0,
    rows: 10,
    page: 0
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<number[]>([]);
  
  // Metadata options
  const [categoryOptions, setCategoryOptions] = useState<any[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);

  // Selected product detail drawer state
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [variantBranchPrices, setVariantBranchPrices] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [cats, sups, facs] = await Promise.all([
          ProductService.getCategories(),
          ProductService.getSuppliers(),
          ProductService.getFacilities()
        ]);
        setCategoryOptions(cats?.data || cats || []);
        setSupplierOptions(sups?.data || sups || []);
        setFacilities(facs?.data || facs || []);
      } catch (err) {
        console.error('Error loading metadata:', err);
      }
    };
    loadMetadata();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await ProductService.getProducts(
        lazyParams.first,
        lazyParams.rows,
        searchTerm,
        selectedCategories,
        selectedSuppliers
      );
      setProducts(res?.data || []);
      setTotalRecords(res?.total || 0);
    } catch (err) {
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [lazyParams, selectedCategories, selectedSuppliers]);

  const handleSearch = (e: any) => {
    e.preventDefault();
    setLazyParams({ ...lazyParams, first: 0, page: 0 });
    fetchProducts();
  };

  const onPage = (event: any) => {
    setLazyParams(event);
  };

  const handleViewProduct = async (product: any) => {
    setSelectedProduct(product);
    setShowDetailDialog(true);
    
    // Choose first variant by default if exists
    if (product.variants && product.variants.length > 0) {
      handleSelectVariant(product.variants[0], product);
    } else {
      setSelectedVariant(null);
      setVariantBranchPrices([]);
    }
  };

  const handleSelectVariant = async (variant: any, productObj: any) => {
    setSelectedVariant(variant);
    try {
      setLoadingDetail(true);
      const res = await ProductService.getVariantById(variant.id);
      const fps = res?.facility_prices || [];
      const mapped = facilities.map(f => {
        const fp = fps.find((x: any) => x.facility_id === f.id);
        return {
          facility_id: f.id,
          facility_name: f.name,
          sales_price: fp ? Number(fp.sales_price) : null,
          target_utility_pct: fp ? Number(fp.target_utility_pct) : 0
        };
      });
      setVariantBranchPrices(mapped);
    } catch (e) {
      console.error('Error loading variant branch prices:', e);
      setVariantBranchPrices([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Helper calculation for VAT (IVA)
  const getTaxRate = (product: any) => {
    // Morpheus tax is on the product. We can deduce it or check tax_id
    // For simplicity, if standard VAT is 16%, we show that.
    // If we have tribute options, we can lookup
    return 16.0; // default 16%
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto py-6 px-4">
      {/* Page Title */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
          <span className="text-2xl">🔍</span> Consulta de Productos
        </h1>
        <p className="text-slate-500 mt-1 font-medium">Buscador y catálogo de productos con información detallada de costos, precios y sucursales (Modo Lectura).</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Filters Panel */}
        <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <i className="pi pi-filter text-rose-500"></i> Filtros de Consulta
            </h2>
          </div>

          {/* Categories select */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Categoría / Departamento</label>
            <MultiSelect
              value={selectedCategories}
              options={categoryOptions}
              onChange={(e) => {
                setSelectedCategories(e.value);
                setLazyParams({ ...lazyParams, first: 0, page: 0 });
              }}
              optionLabel="name"
              optionValue="id"
              placeholder="Todas las categorías..."
              filter
              className="w-full border-slate-200 bg-slate-50 rounded-xl text-sm"
              display="chip"
            />
          </div>

          {/* Supplier select */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Proveedor</label>
            <MultiSelect
              value={selectedSuppliers}
              options={supplierOptions}
              onChange={(e) => {
                setSelectedSuppliers(e.value);
                setLazyParams({ ...lazyParams, first: 0, page: 0 });
              }}
              optionLabel="name"
              optionValue="id"
              placeholder="Todos los proveedores..."
              filter
              className="w-full border-slate-200 bg-slate-50 rounded-xl text-sm"
              display="chip"
            />
          </div>

          <Button
            label="Limpiar Filtros"
            icon="pi pi-refresh"
            text
            severity="secondary"
            className="w-full rounded-xl"
            onClick={() => {
              setSelectedCategories([]);
              setSelectedSuppliers([]);
              setSearchTerm('');
              setLazyParams({ ...lazyParams, first: 0, page: 0 });
            }}
          />
        </div>

        {/* Main Grid Panel */}
        <div className="lg:col-span-3 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-6">
          {/* Search Form */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <span className="p-input-icon-left flex-1 w-full relative">
              <i className="pi pi-search text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 z-10" />
              <InputText
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por código de barra, SKU o nombre de producto..."
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-slate-200 rounded-2xl focus:ring-4 focus:ring-rose-500/10 transition-all text-slate-700"
                style={{ paddingLeft: '3rem' }}
              />
            </span>
            <Button
              type="submit"
              label="Buscar"
              className="!bg-rose-500 hover:!bg-rose-600 border-none px-6 py-3 rounded-2xl font-bold shadow-md shadow-rose-100 transition-all duration-200"
            />
          </form>

          {loading ? (
            <ProgressBar mode="indeterminate" style={{ height: '6px' }} color="#f43f5e" className="rounded-full" />
          ) : null}

          {/* DataTable */}
          <DataTable
            value={products}
            lazy
            paginator
            first={lazyParams.first}
            rows={lazyParams.rows}
            totalRecords={totalRecords}
            onPage={onPage}
            rowsPerPageOptions={[10, 20, 50]}
            className="p-datatable-sm custom-table"
            emptyMessage="No se encontraron productos para esta consulta."
            rowHover
            responsiveLayout="scroll"
          >
            <Column
              field="sku"
              header="CÓDIGO (SKU)"
              body={(r) => {
                const firstVar = r.variants?.[0];
                return <span className="font-mono font-bold text-slate-700">{firstVar?.sku || r.sku || 'N/A'}</span>;
              }}
              className="w-[15%]"
            ></Column>
            <Column
              field="name"
              header="PRODUCTO"
              body={(r) => (
                <div>
                  <span className="font-semibold text-slate-800">{r.name}</span>
                  <div className="text-xs text-slate-400 mt-0.5">{categoryOptions.find(c => c.id === r.category_id)?.name || 'Sin Categoría'}</div>
                </div>
              )}
              className="w-[45%]"
            ></Column>
            <Column
              field="standard_cost"
              header="COSTO ESTÁNDAR"
              body={(r) => {
                const firstVar = r.variants?.[0];
                const cost = firstVar?.standard_cost || r.standard_cost || 0;
                return <span className="font-medium text-slate-600">${Number(cost).toFixed(2)}</span>;
              }}
              className="w-[12%]"
            ></Column>
            <Column
              field="sales_price"
              header="PVP BASE"
              body={(r) => {
                const firstVar = r.variants?.[0];
                const price = firstVar?.sales_price || r.sales_price || 0;
                return <span className="font-bold text-emerald-600">${Number(price).toFixed(2)}</span>;
              }}
              className="w-[12%]"
            ></Column>
            <Column
              field="total_stock"
              header="STOCK"
              body={(r) => {
                const stock = r.total_stock || 0;
                return (
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${stock > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                    {stock} uds
                  </span>
                );
              }}
              className="w-[8%] text-center"
              align="center"
            ></Column>
            <Column
              header="VER"
              body={(r) => (
                <Button
                  icon="pi pi-eye"
                  className="p-button-rounded p-button-text p-button-sm text-rose-500 hover:bg-rose-50/50"
                  onClick={() => handleViewProduct(r)}
                />
              )}
              className="w-[8%] text-center"
              align="center"
            ></Column>
          </DataTable>
        </div>
      </div>

      {/* Product Detail Dialog (Omits Specs/Images) */}
      <Dialog
        visible={showDetailDialog}
        style={{ width: '50vw', minWidth: '600px' }}
        header={<span className="text-xl font-extrabold text-slate-800">📄 Ficha de Consulta de Producto</span>}
        onHide={() => setShowDetailDialog(false)}
        footer={
          <div className="flex justify-end">
            <Button label="Cerrar" icon="pi pi-times" onClick={() => setShowDetailDialog(false)} className="px-5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 border-none font-bold" />
          </div>
        }
      >
        {selectedProduct && (
          <div className="flex flex-col gap-6 mt-2">
            
            {/* Header info */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
              <h3 className="text-xl font-bold text-slate-800 mb-1">{selectedProduct.name}</h3>
              <p className="text-slate-400 text-sm font-medium">Categoría: <span className="text-slate-600 font-semibold">{categoryOptions.find(c => c.id === selectedProduct.category_id)?.name || 'Sin Categoría'}</span></p>
              {selectedProduct.description && (
                <p className="text-slate-500 text-xs mt-3 bg-white p-3 rounded-lg border border-slate-100">{selectedProduct.description}</p>
              )}
            </div>

            {/* Variants Tabs if more than one */}
            {selectedProduct.variants && selectedProduct.variants.length > 1 && (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Variante del Producto</label>
                <div className="flex gap-2 flex-wrap">
                  {selectedProduct.variants.map((v: any) => {
                    const isSelected = selectedVariant?.id === v.id;
                    const attrString = v.attributes ? Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(', ') : '';
                    return (
                      <button
                        key={v.id}
                        onClick={() => handleSelectVariant(v, selectedProduct)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all duration-200 ${
                          isSelected
                            ? 'bg-rose-500 text-white border-rose-500 shadow-sm shadow-rose-100'
                            : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {v.sku} {attrString ? `(${attrString})` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedVariant && (
              <>
                {/* Costs & Prices Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Costs Card */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3">
                    <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-50 pb-2">Costos Unitarios</h4>
                    
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Costo Estándar (Sin IVA)</span>
                      <span className="font-semibold text-slate-700">${Number(selectedVariant.standard_cost || 0).toFixed(2)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Costo Estándar (Con IVA)</span>
                      <span className="font-semibold text-slate-700">${(Number(selectedVariant.standard_cost || 0) * (1.0 + getTaxRate(selectedProduct) / 100.0)).toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center text-sm border-t border-slate-50 pt-2">
                      <span className="text-slate-500">Costo Reposición</span>
                      <span className="font-semibold text-slate-700">${Number(selectedVariant.replacement_cost || 0).toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Costo Promedio</span>
                      <span className="font-semibold text-slate-700">${Number(selectedVariant.average_cost || 0).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Margins & Prices Card */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3">
                    <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-50 pb-2">Precios & Margen Base</h4>

                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">PVP Base General (Sin IVA)</span>
                      <span className="font-semibold text-slate-700">${Number(selectedVariant.sales_price || 0).toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">PVP Base General (Con IVA)</span>
                      <span className="font-extrabold text-emerald-600 text-lg">${(Number(selectedVariant.sales_price || 0) * (1.0 + getTaxRate(selectedProduct) / 100.0)).toFixed(2)}</span>
                    </div>

                    {(() => {
                      const cost = Number(selectedVariant.standard_cost || 0);
                      const price = Number(selectedVariant.sales_price || 0);
                      const margin = price > 0 ? ((price - cost) / price * 100.0) : 0;
                      return (
                        <div className="flex justify-between items-center text-sm border-t border-slate-50 pt-2">
                          <span className="text-slate-500">Margen Bruto General</span>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${margin >= 25 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                            {margin.toFixed(2)}%
                          </span>
                        </div>
                      );
                    })()}

                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Stock Consolidado</span>
                      <span className="font-semibold text-slate-700">
                        {(() => {
                          const stock = Number(selectedVariant.total_stock || 0);
                          const uom = (selectedProduct.uom_base || 'PZA').toUpperCase();
                          const isWeight = ['KG', 'KILOGRAMO', 'KILOGRAMOS', 'LBS', 'LIBRA', 'LIBRAS', 'G', 'GRAMOS', 'GRAMO', 'L', 'LT', 'M', 'MT', 'MTS'].includes(uom);
                          const formattedStock = isWeight ? stock.toFixed(3) : Math.round(stock).toString();
                          return `${formattedStock} ${uom.toLowerCase()}`;
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Branch Pricing Subgrid */}
                <div className="flex flex-col gap-3">
                  <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Precios por Sucursal</h4>
                  {loadingDetail ? (
                    <ProgressBar mode="indeterminate" style={{ height: '4px' }} color="#f43f5e" className="rounded-full" />
                  ) : (
                    <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                      <DataTable
                        value={variantBranchPrices}
                        className="p-datatable-sm text-xs"
                        emptyMessage="No hay sucursales registradas."
                      >
                        <Column field="facility_name" header="SUCURSAL" className="font-semibold text-slate-700"></Column>
                        <Column
                          header="ESTADO PRECIO"
                          body={(r) => (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.sales_price ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                              {r.sales_price ? 'Precio Específico' : 'Hereda General'}
                            </span>
                          )}
                        ></Column>
                        <Column
                          header="PVP (SIN IVA)"
                          body={(r) => {
                            const val = r.sales_price ?? selectedVariant.sales_price ?? 0;
                            return <span className={`font-semibold ${r.sales_price ? 'text-indigo-600' : 'text-slate-500'}`}>${Number(val).toFixed(2)}</span>;
                          }}
                        ></Column>
                        <Column
                          header="PVP (CON IVA)"
                          body={(r) => {
                            const val = r.sales_price ?? selectedVariant.sales_price ?? 0;
                            const valWithTax = Number(val) * (1.0 + getTaxRate(selectedProduct) / 100.0);
                            return <span className={`font-bold ${r.sales_price ? 'text-indigo-700' : 'text-emerald-600'}`}>${valWithTax.toFixed(2)}</span>;
                          }}
                        ></Column>
                      </DataTable>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
