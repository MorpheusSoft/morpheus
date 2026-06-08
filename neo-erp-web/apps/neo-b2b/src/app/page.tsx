'use client';
import { useState, useEffect } from 'react';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { Message } from 'primereact/message';
import { Toast } from 'primereact/toast';
import { Sidebar } from 'primereact/sidebar';
import { useRef } from 'react';
import api from '@/lib/api';

export default function WholesalerStorePage() {
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [selectedBrand, setSelectedBrand] = useState<any>(null);
  const [brandsList, setBrandsList] = useState<string[]>([]);
  
  // Exchange Rate (VES / USD)
  const [exchangeRate, setExchangeRate] = useState<number>(40.0);
  
  // Cart: Map of variant_id -> { product, quantity }
  const [cart, setCart] = useState<{ [key: number]: { item: any; quantity: number } }>({});
  const [cartVisible, setCartVisible] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  
  const toast = useRef<any>(null);

  // Load Initial Metadata & Catalog
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [catsRes, configRes] = await Promise.all([
          api.get('/categories'),
          api.get('/currencies')
        ]);
        
        setCategories(catsRes.data || []);
        
        // Find exchange rate for VES
        const ves = configRes.data?.find((c: any) => c.code === 'VES');
        if (ves) {
          setExchangeRate(Number(ves.exchange_rate));
        }
      } catch (err) {
        console.error("Error cargando metadatos", err);
      }
    };
    fetchMetadata();
  }, []);

  // Fetch Catalog & Recommendations
  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (searchQuery) params.query = searchQuery;
      if (selectedCategory) params.category_id = selectedCategory;
      if (selectedBrand) params.brand = selectedBrand;
      
      const [catalogRes, recsRes] = await Promise.all([
        api.get('/b2b/catalog', { params }),
        api.get('/b2b/recommendations').catch(e => {
          console.warn("Falla en recomendaciones de IA, usando mock/fallback.");
          return { data: [] };
        })
      ]);
      
      setCatalog(catalogRes.data || []);
      setRecommendations(recsRes.data || []);
      
      // Extract brands from catalog to populate brands filter
      if (catalogRes.data) {
        const brands = Array.from(new Set(catalogRes.data.map((item: any) => item.brand).filter(Boolean))) as string[];
        setBrandsList(brands);
      }
    } catch (err) {
      console.error("Error al cargar el catálogo B2B", err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo cargar el catálogo de productos.'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedCategory, selectedBrand]);

  const handleSearchSubmit = (e: any) => {
    e.preventDefault();
    loadData();
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory(null);
    setSelectedBrand(null);
    setTimeout(() => loadData(), 50);
  };

  // Add Item to Cart
  const addToCart = (item: any, quantity: number) => {
    if (quantity <= 0) return;
    
    // Check web stock limits
    if (quantity > item.web_stock) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Stock Limitado',
        detail: `Sólo hay ${Math.floor(item.web_stock)} unidades disponibles para compra web.`
      });
      quantity = Math.floor(item.web_stock);
      if (quantity === 0) return;
    }

    // Verify package multiplier (qty_per_pack)
    const factor = item.qty_per_pack || 1.0;
    if (quantity % factor !== 0) {
      // Round to nearest multiplier
      const lower = Math.floor(quantity / factor) * factor;
      const upper = Math.ceil(quantity / factor) * factor;
      const adjusted = upper <= item.web_stock ? upper : lower;

      if (adjusted === 0) {
        toast.current?.show({
          severity: 'error',
          summary: 'Multiplicador de Empaque',
          detail: `Este producto debe comprarse en empaques de ${factor} unidades.`
        });
        return;
      }
      
      toast.current?.show({
        severity: 'info',
        summary: 'Empaque Ajustado',
        detail: `Ajustado a ${adjusted} unidades (múltiplo de empaque: ${factor}).`
      });
      quantity = adjusted;
    }

    setCart(prev => ({
      ...prev,
      [item.variant_id]: {
        item,
        quantity: (prev[item.variant_id]?.quantity || 0) + quantity
      }
    }));

    toast.current?.show({
      severity: 'success',
      summary: 'Agregado al carrito',
      detail: `${quantity} unidades de ${item.name}`
    });
  };

  const removeFromCart = (variantId: number) => {
    setCart(prev => {
      const copy = { ...prev };
      delete copy[variantId];
      return copy;
    });
  };

  const updateCartQty = (variantId: number, qty: number) => {
    setCart(prev => {
      if (!prev[variantId]) return prev;
      const item = prev[variantId].item;
      
      if (qty <= 0) {
        const copy = { ...prev };
        delete copy[variantId];
        return copy;
      }

      if (qty > item.web_stock) {
        qty = Math.floor(item.web_stock);
      }

      // Adjust to factor
      const factor = item.qty_per_pack || 1.0;
      if (qty % factor !== 0) {
        qty = Math.round(qty / factor) * factor;
      }

      if (qty === 0) {
        const copy = { ...prev };
        delete copy[variantId];
        return copy;
      }

      return {
        ...prev,
        [variantId]: { item, quantity: qty }
      };
    });
  };

  // Calculations
  const cartItems = Object.values(cart);
  const totalUsd = cartItems.reduce((acc, c) => acc + (c.item.price_usd * c.quantity), 0);
  const totalVes = totalUsd * exchangeRate;

  // Submit Order Draft
  const submitOrder = async () => {
    if (cartItems.length === 0) return;
    setOrderSubmitting(true);
    try {
      const lines = cartItems.map(c => ({
        variant_id: c.item.variant_id,
        quantity: c.quantity
      }));
      
      const res = await api.post('/b2b/orders', { lines });
      
      toast.current?.show({
        severity: 'success',
        summary: 'Pedido Recibido',
        detail: `Su pedido borrador ${res.data.document_number} ha sido creado con éxito.`,
        life: 5000
      });
      
      // Clear Cart
      setCart({});
      setCartVisible(false);
    } catch (err: any) {
      console.error(err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: err.response?.data?.detail || 'No se pudo crear el pedido.'
      });
    } finally {
      setOrderSubmitting(false);
    }
  };

  // Image Carousel state for each card
  const [activeImageIndices, setActiveImageIndices] = useState<{ [key: number]: number }>({});
  
  const handleNextImage = (itemId: number, imagesCount: number) => {
    setActiveImageIndices(prev => ({
      ...prev,
      [itemId]: ((prev[itemId] || 0) + 1) % imagesCount
    }));
  };

  const handlePrevImage = (itemId: number, imagesCount: number) => {
    setActiveImageIndices(prev => ({
      ...prev,
      [itemId]: ((prev[itemId] || 0) - 1 + imagesCount) % imagesCount
    }));
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto">
      <Toast ref={toast} position="top-right" />
      
      {/* Dynamic Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 m-0 tracking-tight">Catálogo Mayorista</h2>
          <p className="text-slate-500 text-sm mt-1 font-medium">Consulte stock web protegido y realice compras en empaques oficiales</p>
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <div className="bg-blue-50 border border-blue-200/60 px-4 py-2 rounded-2xl flex items-center gap-2 shadow-sm">
            <i className="pi pi-refresh text-blue-500 animate-spin-slow"></i>
            <span className="text-xs text-blue-500 font-bold uppercase tracking-wider">Tasa de Cambio:</span>
            <span className="font-extrabold text-blue-700">{exchangeRate.toFixed(2)} Bs. / $</span>
          </div>
          
          <Button
            icon="pi pi-shopping-cart"
            label="Carrito"
            badge={cartItems.length > 0 ? `${cartItems.length}` : undefined}
            badgeClassName="p-badge-danger"
            onClick={() => setCartVisible(true)}
            className="!rounded-2xl !bg-blue-600 hover:!bg-blue-700 border-none text-white font-bold !px-5 shadow-md shadow-blue-500/20"
          />
        </div>
      </div>

      {/* Gemini AI Recommendations Section */}
      {recommendations.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-blue-500/10 border border-indigo-100 rounded-[2rem] p-6 mb-8 backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <i className="pi pi-sparkles text-8xl text-indigo-900"></i>
          </div>
          
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center border border-indigo-500/40 shadow-sm">
              <i className="pi pi-sparkles text-white text-sm"></i>
            </div>
            <div>
              <h3 className="text-sm font-black text-indigo-950 uppercase tracking-wider m-0">Sugerencias de IA Personalizadas</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-0.5">Gemini Copilot</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recommendations.map((rec, i) => {
              // Find matching catalog item to add easily
              const matchedItem = catalog.find(item => item.sku === rec.sku);
              return (
                <div key={i} className="bg-white/95 rounded-2xl p-4 shadow-sm border border-slate-100/80 flex flex-col justify-between hover:shadow-md transition-shadow">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-indigo-500 bg-indigo-50 border border-indigo-100/50 px-2 py-0.5 rounded-full inline-block mb-2">
                      {rec.sku}
                    </span>
                    <h4 className="text-sm font-bold text-slate-800 line-clamp-1 mb-1">{rec.name}</h4>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed italic mb-4">
                      "{rec.reason}"
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between border-t border-slate-50 pt-3">
                    <span className="text-[11px] font-bold text-slate-400">
                      Sugerido: <strong className="text-slate-700">{rec.suggested_qty} U</strong>
                    </span>
                    
                    <Button
                      icon="pi pi-plus"
                      label="Agregar"
                      size="small"
                      disabled={!matchedItem}
                      onClick={() => matchedItem && addToCart(matchedItem, rec.suggested_qty)}
                      className="!rounded-xl !bg-indigo-600 hover:!bg-indigo-700 border-none text-white text-xs font-bold"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Grid: Filters & Catalogue */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Faceted Filters Column */}
        <div className="lg:col-span-1 bg-white rounded-[2rem] p-5 shadow-xl shadow-slate-200/40 border border-slate-100 h-fit space-y-5">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Filtros</span>
            <Button icon="pi pi-filter-slash" rounded text severity="secondary" onClick={clearFilters} tooltip="Limpiar Filtros" />
          </div>

          <form onSubmit={handleSearchSubmit} className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Buscar Producto</label>
            <span className="p-input-icon-left w-full">
              <i className="pi pi-search text-slate-400 z-10" />
              <InputText
                type="search"
                autoComplete="off"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nombre, marca, modelo..."
                className="w-full !pl-10 !rounded-xl border-slate-200 focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 shadow-sm !py-2 text-sm"
              />
            </span>
          </form>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Categoría</label>
            <Dropdown
              value={selectedCategory}
              options={categories}
              optionLabel="name"
              optionValue="id"
              onChange={(e) => setSelectedCategory(e.value)}
              placeholder="Todas las categorías"
              showClear
              className="w-full !rounded-xl border-slate-200 focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 shadow-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Marca</label>
            <Dropdown
              value={selectedBrand}
              options={brandsList}
              onChange={(e) => setSelectedBrand(e.value)}
              placeholder="Todas las marcas"
              showClear
              className="w-full !rounded-xl border-slate-200 focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 shadow-sm"
            />
          </div>
        </div>

        {/* Catalogue Grid */}
        <div className="lg:col-span-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-24 text-slate-400 bg-white rounded-[2rem] border border-slate-100 shadow-md">
              <i className="pi pi-spinner pi-spin text-4xl mb-4 text-blue-500"></i>
              <p className="font-semibold text-lg">Cargando catálogo...</p>
            </div>
          ) : catalog.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-24 text-slate-400 bg-white rounded-[2rem] border border-slate-100 shadow-md">
              <i className="pi pi-box text-5xl mb-4 opacity-50"></i>
              <p className="font-semibold text-lg">No hay productos en esta sección.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {catalog.map((item) => {
                const activeImgIdx = activeImageIndices[item.variant_id] || 0;
                const imagesCount = item.images?.length || 0;
                const currentImgUrl = imagesCount > 0 ? item.images[activeImgIdx] : '/placeholder.png';
                
                // Pack info
                const qtyFactor = item.qty_per_pack || 1.0;
                
                return (
                  <div key={item.variant_id} className="bg-white rounded-[2rem] border border-slate-100 shadow-lg shadow-slate-200/30 overflow-hidden flex flex-col hover:shadow-xl hover:translate-y-[-2px] transition-all duration-300 relative group">
                    
                    {/* Image Panel with Carousel Controls */}
                    <div className="h-48 w-full bg-slate-50 relative flex items-center justify-center overflow-hidden border-b border-slate-50">
                      {imagesCount > 0 ? (
                        <img 
                          src={currentImgUrl.startsWith('http') ? currentImgUrl : `http://localhost:8000${currentImgUrl}`}
                          alt={item.name}
                          className="h-full w-full object-cover select-none"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-300 select-none">
                          <i className="pi pi-image text-4xl mb-1"></i>
                          <span className="text-[10px] uppercase font-bold tracking-widest">Sin Imagen</span>
                        </div>
                      )}

                      {/* Web Stock Limit Banner */}
                      <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full">
                        Stock: {Math.floor(item.web_stock)} U
                      </div>

                      {/* Packaging Multiple Tag */}
                      <div className="absolute top-3 right-3 bg-blue-600/90 backdrop-blur-md border border-blue-500/50 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full">
                        Empaque: {qtyFactor} U
                      </div>

                      {/* Carousel controls if multi images */}
                      {imagesCount > 1 && (
                        <div className="absolute inset-x-0 bottom-3 flex justify-between px-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handlePrevImage(item.variant_id, imagesCount)}
                            className="w-7 h-7 rounded-full bg-white/90 shadow-md flex items-center justify-center text-slate-800 hover:bg-white"
                          >
                            <i className="pi pi-chevron-left text-xs"></i>
                          </button>
                          
                          {/* Dot Indicators */}
                          <div className="flex items-center gap-1.5 bg-slate-900/60 backdrop-blur-xs px-2.5 py-1 rounded-full">
                            {item.images.map((_: any, idx: number) => (
                              <span 
                                key={idx} 
                                className={`w-1.5 h-1.5 rounded-full ${idx === activeImgIdx ? 'bg-white' : 'bg-white/40'}`}
                              ></span>
                            ))}
                          </div>

                          <button 
                            onClick={() => handleNextImage(item.variant_id, imagesCount)}
                            className="w-7 h-7 rounded-full bg-white/90 shadow-md flex items-center justify-center text-slate-800 hover:bg-white"
                          >
                            <i className="pi pi-chevron-right text-xs"></i>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Details Panel */}
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        {/* Brand & Category */}
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {item.brand || 'Genérica'}
                          </span>
                          <span className="text-[10px] font-extrabold text-blue-500 uppercase tracking-wider">
                            {item.category_name}
                          </span>
                        </div>

                        {/* Title & SKU */}
                        <h3 className="text-md font-extrabold text-slate-800 tracking-tight leading-snug line-clamp-2 mb-1">
                          {item.name}
                        </h3>
                        <span className="text-[10px] font-mono font-bold text-slate-400 block mb-3">
                          SKU: {item.sku}
                        </span>

                        {/* Bimonetary Prices */}
                        <div className="flex flex-col gap-0.5 bg-slate-50 border border-slate-100 rounded-2xl p-3 mb-4">
                          <div className="flex justify-between items-baseline">
                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Precio Unitario:</span>
                            <div className="text-right">
                              <span className="text-md font-black text-slate-800">${item.price_usd.toFixed(2)}</span>
                              <span className="text-[10px] text-slate-400 block font-semibold leading-none mt-0.5">
                                Bs. {item.price_ves.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Action Counter & Button */}
                      <CardActionPanel 
                        item={item} 
                        qtyFactor={qtyFactor} 
                        addToCart={addToCart} 
                      />
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Cart Drawer */}
      <Sidebar 
        visible={cartVisible} 
        onHide={() => setCartVisible(false)} 
        position="right"
        className="w-full max-w-md !rounded-l-[2rem] border-l border-slate-100"
      >
        <div className="flex flex-col h-full justify-between">
          <div>
            {/* Header */}
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100 mb-5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100">
                <i className="pi pi-shopping-cart text-blue-500"></i>
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-850 m-0 tracking-tight">Su Carrito</h3>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Detalle del Pedido</span>
              </div>
            </div>

            {/* Cart Items List */}
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <i className="pi pi-shopping-bag text-5xl mb-3 opacity-30"></i>
                <p className="font-semibold">El carrito está vacío.</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                {cartItems.map((c) => {
                  const factor = c.item.qty_per_pack || 1.0;
                  const itemTotalUsd = c.item.price_usd * c.quantity;
                  const itemTotalVes = itemTotalUsd * exchangeRate;
                  
                  return (
                    <div key={c.item.variant_id} className="bg-slate-50 border border-slate-150/70 rounded-2xl p-3 flex justify-between relative overflow-hidden">
                      <div className="flex-1 min-w-0 pr-2">
                        <h4 className="text-xs font-black text-slate-800 truncate mb-0.5">{c.item.name}</h4>
                        <span className="text-[9px] font-mono text-slate-400 block mb-2">SKU: {c.item.sku}</span>
                        
                        {/* Selector de Cantidades */}
                        <div className="flex items-center gap-1.5">
                          <button 
                            onClick={() => updateCartQty(c.item.variant_id, c.quantity - factor)}
                            className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 hover:bg-slate-100"
                          >
                            -
                          </button>
                          
                          <span className="text-xs font-bold font-mono px-2 text-slate-700 min-w-[30px] text-center">
                            {c.quantity}
                          </span>

                          <button 
                            onClick={() => updateCartQty(c.item.variant_id, c.quantity + factor)}
                            className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 hover:bg-slate-100"
                          >
                            +
                          </button>
                          
                          <span className="text-[9px] font-extrabold text-blue-500 bg-blue-50/80 px-2 py-0.5 rounded ml-1 uppercase">
                            Cajas
                          </span>
                        </div>
                      </div>

                      {/* Prices */}
                      <div className="flex flex-col justify-between items-end">
                        <button 
                          onClick={() => removeFromCart(c.item.variant_id)}
                          className="text-slate-400 hover:text-red-500 text-xs p-1"
                        >
                          <i className="pi pi-trash"></i>
                        </button>
                        
                        <div className="text-right">
                          <span className="text-xs font-black text-slate-800">${itemTotalUsd.toFixed(2)}</span>
                          <span className="text-[9px] text-slate-400 block font-semibold leading-none">
                            Bs. {itemTotalVes.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Subtotal & Action */}
          {cartItems.length > 0 && (
            <div className="border-t border-slate-150 pt-5 mt-5 space-y-4">
              <div className="bg-slate-50 border border-slate-150 rounded-[1.5rem] p-4 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <span>Subtotal USD:</span>
                  <span className="text-slate-800 font-extrabold">${totalUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                
                <div className="flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <span>Subtotal VES:</span>
                  <span className="text-slate-800 font-extrabold">Bs. {totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>

                <div className="h-px bg-slate-200 my-1"></div>

                <p className="text-[9px] text-slate-400 font-medium leading-relaxed">
                  Nota: El cobro final y los impuestos del 16% (IVA) serán procesados administrativamente por facturación según la tasa oficial del día de despacho.
                </p>
              </div>

              <Button
                label="Confirmar y Enviar Pedido"
                icon={orderSubmitting ? "pi pi-spinner pi-spin" : "pi pi-check"}
                disabled={orderSubmitting}
                onClick={submitOrder}
                className="w-full !rounded-xl !bg-blue-600 border-none text-white hover:!bg-blue-700 !py-3 shadow-md shadow-blue-500/20 text-sm font-bold uppercase tracking-wider"
              />
            </div>
          )}

        </div>
      </Sidebar>
    </div>
  );
}

// Separate component for quantity controls on catalog items
function CardActionPanel({ item, qtyFactor, addToCart }: { item: any; qtyFactor: number; addToCart: any }) {
  const [selectedQty, setSelectedQty] = useState<number>(qtyFactor);

  const increment = () => {
    setSelectedQty(prev => {
      const next = prev + qtyFactor;
      return next <= item.web_stock ? next : prev;
    });
  };

  const decrement = () => {
    setSelectedQty(prev => {
      const next = prev - qtyFactor;
      return next >= qtyFactor ? next : prev;
    });
  };

  // Adjust on manual change if any
  const handleManualChange = (val: string) => {
    let parsed = parseInt(val) || 0;
    if (parsed <= 0) {
      setSelectedQty(qtyFactor);
      return;
    }
    
    // Cap at stock
    if (parsed > item.web_stock) {
      parsed = Math.floor(item.web_stock);
    }
    
    // Multiple check
    if (parsed % qtyFactor !== 0) {
      parsed = Math.round(parsed / qtyFactor) * qtyFactor;
    }
    
    setSelectedQty(parsed === 0 ? qtyFactor : parsed);
  };

  return (
    <div className="flex gap-2 items-center">
      {/* Control de unidades */}
      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm h-10">
        <button 
          onClick={decrement}
          className="px-2.5 h-full text-slate-500 hover:bg-slate-100 transition-colors font-bold text-xs"
        >
          -
        </button>
        
        <input 
          type="text" 
          value={selectedQty}
          onChange={(e) => handleManualChange(e.target.value)}
          className="w-10 text-center text-xs font-bold font-mono text-slate-700 focus:outline-none bg-transparent"
        />

        <button 
          onClick={increment}
          className="px-2.5 h-full text-slate-500 hover:bg-slate-100 transition-colors font-bold text-xs"
        >
          +
        </button>
      </div>

      <Button
        icon="pi pi-shopping-cart"
        onClick={() => addToCart(item, selectedQty)}
        disabled={item.web_stock <= 0}
        tooltip={item.web_stock <= 0 ? 'Sin existencias web' : 'Agregar al Carrito'}
        className={`flex-1 h-10 !rounded-xl border-none font-bold text-xs shadow-sm ${item.web_stock <= 0 ? '!bg-slate-200 !text-slate-400' : '!bg-slate-900 hover:!bg-slate-800 text-white'}`}
      />
    </div>
  );
}
