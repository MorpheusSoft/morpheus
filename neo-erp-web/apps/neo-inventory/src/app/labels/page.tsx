'use client';
import { useState, useEffect } from 'react';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { Checkbox } from 'primereact/checkbox';
import { ValuationService } from '@/services/valuation.service';
import { ProductService } from '@/services/product.service';
import api from '@/lib/api';

export default function LabelsPage() {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'location' | 'product'>('location');
  
  // Metadata
  const [facilities, setFacilities] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  
  // Location Form
  const [selectedLocFacility, setSelectedLocFacility] = useState<any>(null);
  const [selectedLocWarehouse, setSelectedLocWarehouse] = useState<any>(null);
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const [locWidth, setLocWidth] = useState(100);
  const [locHeight, setLocHeight] = useState(50);
  
  // Product Form
  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [prodWidth, setProdWidth] = useState(100);
  const [prodHeight, setProdHeight] = useState(50);
  const [showPrice, setShowPrice] = useState(true);
  const [batchCode, setBatchCode] = useState('');
  const [expirationDate, setExpirationDate] = useState('');

  // Initial load
  useEffect(() => {
    ValuationService.getFacilities().then(setFacilities).catch(console.error);
  }, []);

  // Location logic
  useEffect(() => {
    if (selectedLocFacility) {
      ValuationService.getWarehouses(selectedLocFacility).then(setWarehouses).catch(console.error);
    } else {
      setWarehouses([]);
      setSelectedLocWarehouse(null);
    }
  }, [selectedLocFacility]);

  useEffect(() => {
    if (selectedLocWarehouse) {
      api.get(`/locations/?warehouse_id=${selectedLocWarehouse}`)
        .then(res => setLocations(res.data || []))
        .catch(console.error);
    } else {
      setLocations([]);
      setSelectedLocation(null);
    }
  }, [selectedLocWarehouse]);

  // Product search
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (productSearch.trim().length >= 2) {
        ProductService.getProducts(0, 50, productSearch)
          .then(res => {
            // Map variants to options
            const list: any[] = [];
            res?.data?.forEach((p: any) => {
              p.variants?.forEach((v: any) => {
                list.push({
                  id: v.id,
                  sku: v.sku,
                  name: `${p.name} (${v.sku})`,
                  price: v.sales_price
                });
              });
            });
            setProducts(list);
          })
          .catch(console.error);
      } else {
        setProducts([]);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [productSearch]);

  const handlePrintLocation = async () => {
    if (!selectedLocation) {
      alert("Por favor seleccione una ubicación.");
      return;
    }
    setLoading(true);
    try {
      const response = await api.get(`/labels/location/${selectedLocation}`, {
        responseType: 'blob',
        params: {
          width: locWidth,
          height: locHeight
        }
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl);
    } catch (err) {
      console.error("Error imprimiendo etiqueta de ubicación", err);
      alert("Error al generar el PDF de la ubicación.");
    } finally {
      setLoading(false);
    }
  };

  const handlePrintProduct = async () => {
    if (!selectedProduct) {
      alert("Por favor seleccione un producto.");
      return;
    }
    setLoading(true);
    try {
      const response = await api.get(`/labels/product/${selectedProduct}`, {
        responseType: 'blob',
        params: {
          width: prodWidth,
          height: prodHeight,
          show_price: showPrice,
          batch_code: batchCode || undefined,
          expiration_date: expirationDate || undefined
        }
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl);
    } catch (err) {
      console.error("Error imprimiendo etiqueta de producto", err);
      alert("Error al generar el PDF del producto.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[1000px] mx-auto">
      <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden relative">
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-90"></div>
        
        <div className="p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-extrabold text-slate-900 m-0 tracking-tight">Impresión de Etiquetas</h2>
            <p className="text-slate-500 text-sm mt-1 font-medium">Generación de códigos de barras autoadhesivos (Code 39)</p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 border-b border-slate-100 pb-4 mb-6">
            <button
              onClick={() => setActiveTab('location')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'location' ? 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}
            >
              <i className="pi pi-map-marker mr-2"></i>
              Etiquetas de Ubicación
            </button>
            <button
              onClick={() => setActiveTab('product')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'product' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}
            >
              <i className="pi pi-box mr-2"></i>
              Etiquetas de Producto
            </button>
          </div>

          {activeTab === 'location' ? (
            /* Location Form */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Sucursal / Localidad</label>
                  <Dropdown
                    value={selectedLocFacility}
                    options={facilities}
                    optionLabel="name"
                    optionValue="id"
                    onChange={(e) => setSelectedLocFacility(e.value)}
                    placeholder="Seleccione sucursal"
                    className="w-full !rounded-xl border-slate-200"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Almacén</label>
                  <Dropdown
                    value={selectedLocWarehouse}
                    options={warehouses}
                    optionLabel="name"
                    optionValue="id"
                    onChange={(e) => setSelectedLocWarehouse(e.value)}
                    placeholder="Seleccione almacén"
                    disabled={!selectedLocFacility}
                    className="w-full !rounded-xl border-slate-200"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Ubicación</label>
                  <Dropdown
                    value={selectedLocation}
                    options={locations}
                    optionLabel="code"
                    optionValue="id"
                    onChange={(e) => setSelectedLocation(e.value)}
                    placeholder="Seleccione ubicación"
                    disabled={!selectedLocWarehouse}
                    className="w-full !rounded-xl border-slate-200"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-4 bg-slate-50/50 p-5 rounded-[1.5rem] border border-slate-100">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Dimensiones de Impresión</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-500">Ancho (mm)</label>
                    <InputText type="number" value={locWidth.toString()} onChange={(e) => setLocWidth(parseFloat(e.target.value) || 100)} className="!rounded-xl border-slate-200" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-500">Alto (mm)</label>
                    <InputText type="number" value={locHeight.toString()} onChange={(e) => setLocHeight(parseFloat(e.target.value) || 50)} className="!rounded-xl border-slate-200" />
                  </div>
                </div>

                <div className="mt-auto pt-6 border-t border-slate-100 flex justify-end">
                  <Button
                    label="Generar PDF de Ubicación"
                    icon="pi pi-print"
                    loading={loading}
                    disabled={!selectedLocation}
                    className="!bg-blue-600 !border-blue-600 !rounded-xl"
                    onClick={handlePrintLocation}
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Product Form */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Buscar Producto o SKU</label>
                  <span className="p-input-icon-left w-full">
                    <i className="pi pi-search text-slate-400 z-10" />
                    <InputText
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Escriba mínimo 2 caracteres..."
                      className="w-full !pl-10 !rounded-xl border-slate-200"
                    />
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Seleccionar Variante</label>
                  <Dropdown
                    value={selectedProduct}
                    options={products}
                    optionLabel="name"
                    optionValue="id"
                    onChange={(e) => setSelectedProduct(e.value)}
                    placeholder="Resultados de búsqueda"
                    disabled={products.length === 0}
                    className="w-full !rounded-xl border-slate-200"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Código de Lote</label>
                    <InputText value={batchCode} onChange={(e) => setBatchCode(e.target.value)} placeholder="Opcional" className="!rounded-xl border-slate-200" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Vencimiento</label>
                    <input
                      type="date"
                      value={expirationDate}
                      onChange={(e) => setExpirationDate(e.target.value)}
                      className="w-full rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-blue-400 px-3 py-2 text-sm text-slate-700 shadow-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4 bg-slate-50/50 p-5 rounded-[1.5rem] border border-slate-100">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Configuración de Impresión</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-500">Ancho (mm)</label>
                    <InputText type="number" value={prodWidth.toString()} onChange={(e) => setProdWidth(parseFloat(e.target.value) || 100)} className="!rounded-xl border-slate-200" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-500">Alto (mm)</label>
                    <InputText type="number" value={prodHeight.toString()} onChange={(e) => setProdHeight(parseFloat(e.target.value) || 50)} className="!rounded-xl border-slate-200" />
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 pl-1">
                  <Checkbox inputId="showPrice" checked={showPrice} onChange={(e) => setShowPrice(e.checked || false)} />
                  <label htmlFor="showPrice" className="text-xs font-bold text-slate-600 cursor-pointer">
                    Mostrar PVP Bimonetario (USD / VES)
                  </label>
                </div>

                <div className="mt-auto pt-6 border-t border-slate-100 flex justify-end">
                  <Button
                    label="Generar PDF de Producto"
                    icon="pi pi-print"
                    loading={loading}
                    disabled={!selectedProduct}
                    className="!bg-indigo-600 !border-indigo-600 !rounded-xl"
                    onClick={handlePrintProduct}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
