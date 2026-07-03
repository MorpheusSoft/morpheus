'use client';
import { useState, useEffect, useRef } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Button } from 'primereact/button';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Toast } from 'primereact/toast';
import { Card } from 'primereact/card';
import { PrintTemplate, PrintTemplateService } from '@/services/print-template.service';
import { ProductService } from '@/services/product.service';
import { PricingService } from '@/services/pricing.service';
import { CoreService } from '@/services/core.service';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface PrintItem {
  variant_id: number;
  sku: string;
  name: string;
  brand: string;
  model?: string;
  uom: string;
  price_usd: number;
  price_ves: number;
  barcode: string;
  qty: number;
  tax_rate: number;
  custom_text?: string;
}

export default function HabladoresWorkbenchPage() {
  const router = useRouter();
  const toast = useRef<Toast>(null);
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<PrintTemplate | null>(null);

  const getVariantBarcode = (variant: any) => {
    if (variant.barcode) return variant.barcode;
    const barcodeObj = variant.barcodes?.find((b: any) => b.code_type === 'BARCODE') || variant.barcodes?.[0];
    return barcodeObj ? barcodeObj.barcode : '';
  };

  const getVariantPrice = (variant: any, facilityId: number = 1) => {
    const fp = variant.facility_prices?.find((f: any) => f.facility_id === facilityId);
    return fp ? Number(fp.sales_price) : Number(variant.sales_price || 0);
  };

  // Sessions and rate
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [vesRate, setVesRate] = useState<number>(40.0); // fallback rate

  // Search products
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Workbench queue
  const [selectedProducts, setSelectedProducts] = useState<PrintItem[]>([]);

  // Page layout starting position
  const [startingPosition, setStartingPosition] = useState<number>(1);
  const [loading, setLoading] = useState(false);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [tpls, sess, currencies] = await Promise.all([
        PrintTemplateService.getTemplates(),
        PricingService.getSessions(),
        CoreService.getCurrencies()
      ]);

      setTemplates(tpls);
      if (tpls.length > 0) {
        setSelectedTemplate(tpls[0]);
      }

      setSessions(sess?.data || sess || []);

      // Resolve exchange rate for VES
      const rateList = currencies?.data || currencies || [];
      const vesCur = rateList.find((c: any) => c.code === 'VES');
      const usdCur = rateList.find((c: any) => c.code === 'USD');
      
      let rate = 40.0; // default fallback
      const vesRateVal = vesCur ? Number(vesCur.exchange_rate) : 1;
      const usdRateVal = usdCur ? Number(usdCur.exchange_rate) : 1;
      
      if (vesRateVal > 1) {
        rate = vesRateVal;
      } else if (usdRateVal > 1) {
        // En Saint/Stellar a veces se guarda la tasa de USD escalada por 10 (ej: 488.7732 en vez de 48.87732)
        rate = usdRateVal > 150 ? usdRateVal / 10 : usdRateVal;
      }
      setVesRate(rate);
    } catch (err) {
      console.error(err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Error cargando datos iniciales de la mesa de trabajo.'
      });
    } finally {
      setLoading(false);
    }
  };

  const [isOperator, setIsOperator] = useState(false);

  useEffect(() => {
    loadInitialData();

    import('@/lib/api').then(({ default: api }) => {
      api.get('/users/me')
        .then(res => {
          if (res.data && res.data.active_role) {
            const roleName = res.data.active_role.name.toLowerCase();
            const isOp = roleName.includes('operador') || 
                         roleName.includes('operator') || 
                         roleName.includes('cajero');
            setIsOperator(isOp);
          }
        })
        .catch(err => console.error("Error loading user in page:", err));
    });
  }, []);

  // Search product handlers
  const handleSearch = async (e: any) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    try {
      setSearching(true);
      const res = await ProductService.getProducts(0, 10, searchTerm);
      setSearchResults(res?.data || []);
    } catch (err) {
      console.error(err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al buscar productos.'
      });
    } finally {
      setSearching(false);
    }
  };

  const handleAddProduct = async (product: any) => {
    if (!product.variants || product.variants.length === 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Sin Variantes',
        detail: 'Este producto no posee variantes (SKU) configuradas.'
      });
      return;
    }

    // Default to the first variant
    const variant = product.variants[0];

    // Check if variant already exists in queue
    const exists = selectedProducts.find((p) => p.variant_id === variant.id);
    if (exists) {
      setSelectedProducts(
        selectedProducts.map((p) =>
          p.variant_id === variant.id ? { ...p, qty: p.qty + 1 } : p
        )
      );
      toast.current?.show({
        severity: 'info',
        summary: 'Actualizado',
        detail: `Incrementado cantidad para ${product.name}`
      });
      return;
    }

    let fullVariant = variant;
    try {
      fullVariant = await ProductService.getVariantById(variant.id);
    } catch (e) {
      console.error("Error cargando detalles extendidos de la variante:", e);
    }

    const usdPrice = getVariantPrice(fullVariant, 1);
    const vesPrice = usdPrice * vesRate;
    const barcode = getVariantBarcode(fullVariant);
    const taxRate = Number(product.tax_rate || 0);
    const model = product.model || '';

    const newItem: PrintItem = {
      variant_id: variant.id,
      sku: variant.sku,
      name: product.name,
      brand: product.brand || 'Genérico',
      model,
      uom: product.uom_base || 'PZA',
      price_usd: usdPrice,
      price_ves: vesPrice,
      barcode,
      qty: 1,
      tax_rate: taxRate,
      custom_text: ''
    };

    setSelectedProducts([...selectedProducts, newItem]);
    toast.current?.show({
      severity: 'success',
      summary: 'Agregado',
      detail: `Agregado ${product.name} a la cola de impresión.`
    });
  };

  // Load from Pricing Session
  const handleLoadSession = async () => {
    if (!selectedSessionId) return;
    try {
      setLoading(true);
      const session = await PricingService.getSessionById(selectedSessionId);
      const lines = session.lines || [];

      if (lines.length === 0) {
        toast.current?.show({
          severity: 'warn',
          summary: 'Sesión Vacía',
          detail: 'Esta sesión de precios no tiene líneas de productos.'
        });
        return;
      }

      toast.current?.show({
        severity: 'info',
        summary: 'Cargando',
        detail: `Cargando ${lines.length} productos de la sesión...`
      });

      const loadedItems: PrintItem[] = [];

      for (const line of lines) {
        if (!line.variant_id) continue;
        try {
          // Fetch variant and product detail
          const variant = await ProductService.getVariantById(line.variant_id);
          if (!variant) continue;
          const product = await ProductService.getProductById(variant.product_id);
          if (!product) continue;

          // Price priority: proposed_price (line) > variant branch price
          let usdPrice = Number(line.proposed_price || 0);
          if (usdPrice === 0) {
            usdPrice = getVariantPrice(variant, 1);
          }
          const vesPrice = usdPrice * vesRate;
          const barcode = getVariantBarcode(variant);
          const taxRate = Number(product.tax_rate || 0);
          const model = product.model || '';

          loadedItems.push({
            variant_id: variant.id,
            sku: variant.sku,
            name: product.name,
            brand: product.brand || 'Genérico',
            model,
            uom: product.uom_base || 'PZA',
            price_usd: usdPrice,
            price_ves: vesPrice,
            barcode,
            qty: 1,
            tax_rate: taxRate,
            custom_text: ''
          });
        } catch (e) {
          console.error(`Error loading variant ID ${line.variant_id} for printing:`, e);
        }
      }

      // Merge new loaded items with current selected items
      const merged = [...selectedProducts];
      loadedItems.forEach((newItem) => {
        const idx = merged.findIndex((x) => x.variant_id === newItem.variant_id);
        if (idx !== -1) {
          merged[idx].qty += newItem.qty;
        } else {
          merged.push(newItem);
        }
      });

      setSelectedProducts(merged);
      toast.current?.show({
        severity: 'success',
        summary: 'Sesión Cargada',
        detail: `Importados correctamente ${loadedItems.length} productos.`
      });
    } catch (err) {
      console.error(err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo cargar la sesión de precios.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveItem = (variantId: number) => {
    setSelectedProducts(selectedProducts.filter((p) => p.variant_id !== variantId));
  };

  const handleUpdateQty = (variantId: number, qty: number) => {
    setSelectedProducts(
      selectedProducts.map((p) => (p.variant_id === variantId ? { ...p, qty: Math.max(1, qty) } : p))
    );
  };

  const handleUpdateCustomText = (variantId: number, val: string) => {
    setSelectedProducts(
      selectedProducts.map((p) => (p.variant_id === variantId ? { ...p, custom_text: val } : p))
    );
  };

  const handleClearAll = () => {
    setSelectedProducts([]);
  };

  const handleGenerate = () => {
    if (selectedProducts.length === 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Validación',
        detail: 'Debe agregar al menos un producto a la cola de impresión.'
      });
      return;
    }
    if (!selectedTemplate) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Validación',
        detail: 'Debe seleccionar una plantilla para imprimir.'
      });
      return;
    }

    // Save configuration to sessionStorage
    const printConfig = {
      products: selectedProducts,
      template: selectedTemplate,
      startingPosition: selectedTemplate.paper_type === 'GRID' ? startingPosition : 1,
      vesRate
    };

    sessionStorage.setItem('habladores_print_data', JSON.stringify(printConfig));

    // Open print-friendly layout
    window.open('/costos/habladores/imprimir', '_blank');
  };

  // Interactivevisual grid selector for starting position
  const renderVisualGrid = () => {
    if (!selectedTemplate || selectedTemplate.paper_type !== 'GRID') return null;
    const r = selectedTemplate.rows || 1;
    const c = selectedTemplate.cols || 1;
    const totalCells = r * c;

    const cells = [];
    for (let i = 1; i <= totalCells; i++) {
      const isSelected = startingPosition === i;
      const isSkipped = i < startingPosition;

      cells.push(
        <button
          key={i}
          onClick={() => setStartingPosition(i)}
          className={`h-10 w-10 border rounded-lg flex items-center justify-center font-bold text-xs transition-all duration-200 ${
            isSelected
              ? 'bg-emerald-500 text-white border-emerald-600 shadow-md scale-105'
              : isSkipped
              ? 'bg-slate-100 text-slate-400 border-slate-200 line-through'
              : 'bg-white hover:bg-indigo-50 border-slate-300 text-indigo-600'
          }`}
          title={isSelected ? 'Impresión inicia aquí' : isSkipped ? 'Posición vacía' : `Posición ${i}`}
        >
          {i}
        </button>
      );
    }

    return (
      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
            Posición Inicial de Impresión
          </span>
          <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">
            Casilla {startingPosition}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 leading-tight">
          Selecciona la casilla para iniciar la impresión si utilizas una hoja parcialmente usada.
        </p>
        <div
          className="grid gap-2 justify-center mx-auto my-2"
          style={{
            gridTemplateColumns: `repeat(${c}, minmax(0, 1fr))`
          }}
        >
          {cells}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto py-6 px-4">
      <Toast ref={toast} />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Button
              icon="pi pi-arrow-left"
              rounded
              text
              severity="secondary"
              className="p-button-sm text-slate-500 hover:bg-slate-100"
              onClick={() => router.push('/')}
            />
            <span className="text-2xl">🏷️</span> Mesa de Trabajo: Habladores
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Cola de impresión de etiquetas de precios. Agrega productos manualmente o desde auditorías de precios.
          </p>
        </div>
        {!isOperator && (
          <div className="flex gap-2">
            <Link href="/habladores/plantillas">
              <Button
                label="Configurar Plantillas"
                icon="pi pi-cog"
                className="!bg-white !text-indigo-600 hover:!bg-slate-50 !border-slate-200 !rounded-xl !shadow-sm font-semibold transition-all duration-200"
              />
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Side: Product Search and Add, and Pricing Sessions */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Pricing Session Loader */}
          <Card className="rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="mb-4">
              <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Importar Lote</span>
              <h3 className="text-lg font-bold text-slate-800">Cargar desde Sesión de Precios</h3>
            </div>
            <div className="flex flex-col gap-3">
              <Dropdown
                value={selectedSessionId}
                options={sessions}
                optionLabel="name"
                optionValue="id"
                onChange={(e) => setSelectedSessionId(e.value)}
                placeholder="Seleccione sesión..."
                className="w-full border-slate-200 bg-slate-50 rounded-xl"
                filter
              />
              <Button
                label="Importar Productos"
                icon="pi pi-download"
                className="w-full !bg-indigo-600 hover:!bg-indigo-700 border-none font-bold rounded-xl mt-1 shadow-sm text-xs py-2.5"
                disabled={!selectedSessionId || loading}
                onClick={handleLoadSession}
              />
            </div>
          </Card>

          {/* Product Search */}
          <Card className="rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="mb-4">
              <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest block mb-1">Búsqueda Individual</span>
              <h3 className="text-lg font-bold text-slate-800">Buscador de Productos</h3>
            </div>
            <form onSubmit={handleSearch} className="flex gap-2 mb-4">
              <span className="p-input-icon-left flex-1 relative">
                <i className="pi pi-search text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <InputText
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="SKU, barra o nombre..."
                  className="w-full pl-9 p-2 bg-slate-50 border-slate-200 rounded-xl text-sm"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </span>
              <Button
                type="submit"
                icon="pi pi-search"
                className="!bg-slate-900 border-none hover:!bg-slate-800 rounded-xl px-4 py-2"
                disabled={searching}
              />
            </form>

            {/* Results List */}
            {searching ? (
              <div className="text-center py-4">
                <i className="pi pi-spin pi-spinner text-indigo-600 text-xl"></i>
              </div>
            ) : searchResults.length === 0 ? (
              <p className="text-slate-400 text-xs text-center py-4">Realice una búsqueda para agregar productos.</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto">
                {searchResults.map((product) => (
                  <div
                    key={product.id}
                    className="flex justify-between items-center p-3 border border-slate-100 rounded-xl bg-slate-50 hover:bg-slate-100/50 transition-all duration-200"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="font-bold text-sm text-slate-700 truncate">{product.name}</div>
                      <div className="text-slate-400 text-[10px] font-bold font-mono uppercase tracking-wider mt-0.5">
                        {product.variants?.[0]?.sku || 'SIN SKU'} • {product.brand || 'Genérico'}
                      </div>
                    </div>
                    <Button
                      icon="pi pi-plus"
                      rounded
                      text
                      className="p-button-sm text-indigo-600 hover:bg-indigo-50"
                      onClick={() => handleAddProduct(product)}
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Side: Print Queue list and Config */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-6">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Cola de Impresión de Etiquetas</h3>
                <p className="text-slate-400 text-xs mt-0.5">Define las cantidades para cada etiqueta de precio.</p>
              </div>
              {selectedProducts.length > 0 && (
                <Button
                  label="Limpiar Cola"
                  icon="pi pi-trash"
                  className="!text-rose-500 hover:!bg-rose-50 !bg-white !border-slate-200 !rounded-xl !px-3 font-semibold text-xs py-1.5 transition-all duration-200"
                  onClick={handleClearAll}
                />
              )}
            </div>

            {/* Print Queue Table */}
            <DataTable
              value={selectedProducts}
              dataKey="variant_id"
              className="p-datatable-sm text-xs custom-table"
              emptyMessage="No hay productos en la cola. Agrega productos de forma individual o en lote."
              rowHover
              responsiveLayout="scroll"
            >
              <Column
                field="sku"
                header="SKU"
                body={(r) => <span className="font-mono font-bold text-slate-700">{r.sku}</span>}
                className="w-[12%]"
              ></Column>
              <Column field="name" header="PRODUCTO" className="font-semibold text-slate-800 w-[28%]"></Column>
              <Column
                header="TEXTO PROMO"
                body={(r) => (
                  <InputText
                    value={r.custom_text || ''}
                    onChange={(e) => handleUpdateCustomText(r.variant_id, e.target.value)}
                    placeholder="Opcional..."
                    className="p-inputtext-sm text-xs p-1 w-full bg-slate-50 border-slate-200"
                  />
                )}
                className="w-[15%]"
              ></Column>
              <Column
                field="price_usd"
                header="PRECIO USD"
                body={(r) => <span className="font-semibold text-slate-600">${r.price_usd.toFixed(2)}</span>}
                className="w-[10%]"
              ></Column>
              <Column
                field="price_ves"
                header="PRECIO VES"
                body={(r) => <span className="font-bold text-slate-700">Bs. {r.price_ves.toFixed(2)}</span>}
                className="w-[15%]"
              ></Column>
              <Column
                header="CANTIDAD"
                body={(r) => (
                  <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50 w-24 mx-auto select-none">
                    <button
                      onClick={() => handleUpdateQty(r.variant_id, r.qty - 1)}
                      disabled={r.qty <= 1}
                      className="px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 font-extrabold transition-all text-sm w-7 text-center select-none"
                      type="button"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={r.qty}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        handleUpdateQty(r.variant_id, val);
                      }}
                      className="w-10 text-center bg-transparent border-none text-xs font-bold text-slate-700 outline-none p-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none select-none"
                      min={1}
                      max={1000}
                    />
                    <button
                      onClick={() => handleUpdateQty(r.variant_id, r.qty + 1)}
                      className="px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-extrabold transition-all text-sm w-7 text-center select-none"
                      type="button"
                    >
                      +
                    </button>
                  </div>
                )}
                className="w-[15%]"
                align="center"
              ></Column>
              <Column
                header="ACCIONES"
                align="center"
                body={(r) => (
                  <Button
                    icon="pi pi-times"
                    rounded
                    text
                    className="p-button-rounded p-button-text p-0 w-8 h-8 text-rose-500 hover:bg-rose-50"
                    onClick={() => handleRemoveItem(r.variant_id)}
                  />
                )}
                className="w-[8%] text-center"
              ></Column>
            </DataTable>

            {/* Print Parameters Panel */}
            {selectedProducts.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-100 pt-6 mt-4">
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-500 mb-1.5 uppercase tracking-wider">
                      Seleccionar Plantilla
                    </label>
                    <Dropdown
                      value={selectedTemplate}
                      options={templates}
                      optionLabel="name"
                      onChange={(e) => setSelectedTemplate(e.value)}
                      placeholder="Seleccione plantilla..."
                      className="w-full border-slate-200 bg-slate-50 rounded-xl"
                    />
                  </div>

                  {selectedTemplate && (
                    <div className="text-xs text-slate-400 bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-1">
                      <div>
                        <strong>Dimensiones de Etiqueta:</strong> {selectedTemplate.width_mm}mm x {selectedTemplate.height_mm}mm
                      </div>
                      <div>
                        <strong>Márgenes de página:</strong> T:{selectedTemplate.margin_top_mm}mm, B:{selectedTemplate.margin_bottom_mm}mm, L:{selectedTemplate.margin_left_mm}mm, R:{selectedTemplate.margin_right_mm}mm
                      </div>
                      <div>
                        <strong>Tipo de Papel:</strong> {selectedTemplate.paper_type}
                      </div>
                      {selectedTemplate.paper_type === 'GRID' && (
                        <div>
                          <strong>Cuadrícula:</strong> {selectedTemplate.rows} filas x {selectedTemplate.cols} columnas
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-4">
                  {renderVisualGrid()}

                  <Button
                    label="Generar Habladores"
                    icon="pi pi-print"
                    className="w-full !bg-emerald-600 hover:!bg-emerald-700 border-none font-bold rounded-xl mt-auto py-3 shadow-md shadow-emerald-100 transition-all duration-200"
                    onClick={handleGenerate}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
