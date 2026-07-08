'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { CoreService } from '@/services/core.service';

interface CostInfo {
  standard_cost: number;
  replacement_cost: number;
  average_cost: number;
}

interface PriceInfo {
  regular_price_usd: number;
  regular_price_ves: number;
  has_promo: boolean;
  promo_price_usd: number | null;
  promo_price_ves: number | null;
  promo_ends_at: string | null;
}

interface MarginInfo {
  regular_margin_pct: number;
  promo_margin_pct: number;
}

interface StockFacility {
  facility_id: number;
  facility_name: string;
  quantity: number;
}

interface StockInfo {
  total_consolidated: number;
  by_facility: StockFacility[];
}

interface ProductDetails {
  variant_id: number;
  sku: string;
  barcode: string;
  name: string;
  brand: string;
  uom: string;
  costs: CostInfo;
  prices: PriceInfo;
  margins: MarginInfo;
  stock: StockInfo;
}

export default function KioskConsultorPage() {
  const router = useRouter();
  const [facilities, setFacilities] = useState<any[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number>(1);
  
  // Auth roles
  const [showCosts, setShowCosts] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');

  // Scanner state
  const [scannerActive, setScannerActive] = useState<boolean>(false);
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [html5QrcodeScanner, setHtml5QrcodeScanner] = useState<any>(null);

  // Manual entry & Search state
  const [codeQuery, setCodeQuery] = useState<string>('');
  const [searching, setSearching] = useState<boolean>(false);
  const [scannedProduct, setScannedProduct] = useState<ProductDetails | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Scan History
  const [history, setHistory] = useState<ProductDetails[]>([]);

  // Sound beep ref
  const beepGenerated = useRef<boolean>(false);

  // Load user data and facilities
  useEffect(() => {
    // Load facilities
    CoreService.getFacilities()
      .then((data: any) => {
        const facList = data?.data || data || [];
        setFacilities(facList);
        
        // Cache facility id
        const cached = localStorage.getItem('morpheus_kiosk_facility_id');
        if (cached) {
          setSelectedFacilityId(Number(cached));
        } else if (facList.length > 0) {
          setSelectedFacilityId(facList[0].id);
        }
      })
      .catch(err => console.error("Error loading facilities:", err));

    // Load user role
    api.get('/users/me')
      .then(res => {
        if (res.data) {
          setUsername(res.data.full_name || res.data.email);
          const roles = res.data.roles || [];
          const isOperator = roles.some((r: any) => {
            const name = r.name.toLowerCase();
            return name.includes('operador') || name.includes('operator') || name.includes('cajero');
          });
          setShowCosts(!isOperator);
        }
      })
      .catch(err => {
        console.error("Error checking user:", err);
        // Default to not showing costs if check fails
        setShowCosts(false);
      });

    // Load local history
    const cachedHistory = localStorage.getItem('morpheus_scan_history');
    if (cachedHistory) {
      try {
        const parsed = JSON.parse(cachedHistory);
        if (Array.isArray(parsed) && parsed.every(p => p && p.sku && p.prices)) {
          setHistory(parsed);
        } else {
          localStorage.removeItem('morpheus_scan_history');
        }
      } catch (e) {
        console.error(e);
        localStorage.removeItem('morpheus_scan_history');
      }
    }
  }, []);

  // Save history helper
  const updateHistory = (product: ProductDetails) => {
    if (!product || !product.sku) return;
    setHistory(prev => {
      const arr = Array.isArray(prev) ? prev : [];
      const filtered = arr.filter(p => p && p.sku && p.sku !== product.sku);
      const newHist = [product, ...filtered].slice(0, 5);
      localStorage.setItem('morpheus_scan_history', JSON.stringify(newHist));
      return newHist;
    });
  };

  // Clear history helper
  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('morpheus_scan_history');
  };

  // Load cameras lists when scanner is requested
  const loadCameras = async () => {
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setCameras(devices);
        // Prioritize back camera if found
        const backCam = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('entera') || d.label.toLowerCase().includes('rear'));
        setSelectedCameraId(backCam ? backCam.id : devices[0].id);
      } else {
        setErrorMsg("No se detectaron cámaras en este dispositivo.");
      }
    } catch (err) {
      console.error("Error listing cameras:", err);
      setErrorMsg("Permiso de cámara denegado o error de hardware.");
    }
  };

  // Trigger beep sound on scan
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.value = 1200;
      gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.08);
    } catch (e) {
      console.log("Audio not supported or blocked by user gesture:", e);
    }
  };

  // Start scanning camera
  const startScanner = async () => {
    setErrorMsg('');
    setScannerActive(true);
    await loadCameras();
    
    // Ensure element reader is ready in DOM
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        
        // Clean up any existing scanner reference to avoid duplication
        if (html5QrcodeScanner) {
          try {
            await html5QrcodeScanner.stop();
          } catch (e) {
            // ignore
          }
        }

        const scanner = new Html5Qrcode("reader");
        setHtml5QrcodeScanner(scanner);

        const config = {
          fps: 15,
          qrbox: { width: 280, height: 140 }, // optimized for barcodes
          aspectRatio: 1.333333
        };

        await scanner.start(
          selectedCameraId || { facingMode: "environment" },
          config,
          (decodedText) => {
            playBeep();
            // Automatically stop scanning and search
            scanner.stop().then(() => {
              setHtml5QrcodeScanner(null);
              searchProduct(decodedText);
              // Delay hiding container to allow library to finish cleanup and release tracks safely
              setTimeout(() => {
                setScannerActive(false);
              }, 300);
            }).catch(err => {
              console.error("Error stopping scanner:", err);
              setHtml5QrcodeScanner(null);
              searchProduct(decodedText);
              setTimeout(() => {
                setScannerActive(false);
              }, 300);
            });
          },
          (errorMessage) => {
            // ignore scan errors
          }
        );
        setScannerActive(true);
      } catch (err: any) {
        console.error("Scanner failed to start:", err);
        setErrorMsg(`Error al iniciar la cámara: ${err.message || err}`);
        setScannerActive(false);
      }
    }, 150);
  };

  // Stop scanning camera
  const stopScanner = async () => {
    if (html5QrcodeScanner) {
      try {
        await html5QrcodeScanner.stop();
      } catch (e) {
        console.error("Error stopping scanner:", e);
      }
      setHtml5QrcodeScanner(null);
    }
    // Delay hiding container to allow library to release resource
    setTimeout(() => {
      setScannerActive(false);
    }, 300);
  };

  // Perform search query to backend
  const searchProduct = async (code: string) => {
    if (!code.trim()) return;
    setSearching(true);
    setErrorMsg('');
    setScannedProduct(null);

    try {
      const response = await api.get(`/products/by-code/${encodeURIComponent(code.trim())}?facility_id=${selectedFacilityId}`);
      const product = response.data;
      if (!product || typeof product !== 'object' || !product.sku || !product.prices) {
        setErrorMsg(`Producto con código "${code}" no encontrado.`);
      } else {
        setScannedProduct(product);
        updateHistory(product);
        setCodeQuery('');
      }
    } catch (err: any) {
      console.error("Error searching product:", err);
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      
      if (status === 404 || (detail && detail.toLowerCase().includes("not found"))) {
        setErrorMsg(`Producto con código "${code}" no encontrado.`);
      } else {
        setErrorMsg(detail || "Error al consultar el producto. Verifique su conexión.");
      }
    } finally {
      setSearching(false);
    }
  };

  // Handle manual submit
  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchProduct(codeQuery);
  };

  // Switch facility & update prices
  const handleFacilityChange = (facilityId: number) => {
    setSelectedFacilityId(facilityId);
    localStorage.setItem('morpheus_kiosk_facility_id', String(facilityId));
    
    // If there is currently a scanned product, re-query it
    if (scannedProduct) {
      searchProduct(scannedProduct.barcode || scannedProduct.sku);
    }
  };

  // Format date helper
  const formatDate = (isoString: string | null) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      return isoString;
    }
  };

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().catch(console.error);
      }
    };
  }, [html5QrcodeScanner]);

  // Margin calculation indicator styles
  const isMarginAlert = (margin: number) => margin < 15;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* Dynamic Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 px-4 py-3 shadow-md flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/habladores/tienda')}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Volver"
          >
            <i className="pi pi-arrow-left text-sm" />
          </button>
          <div>
            <h1 className="text-base font-extrabold tracking-tight bg-gradient-to-r from-rose-400 via-rose-500 to-indigo-500 bg-clip-text text-transparent">
              Consultor Móvil
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">Morpheus Soft PWA</p>
          </div>
        </div>

        {/* Facility Selector */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest text-right">Sucursal</span>
          <select
            value={selectedFacilityId}
            onChange={(e) => handleFacilityChange(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold rounded-lg px-2 py-1 outline-none cursor-pointer focus:ring-1 focus:ring-rose-500"
          >
            {facilities.map((fac) => (
              <option key={fac.id} value={fac.id}>
                {fac.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 p-4 flex flex-col gap-6 max-w-md mx-auto w-full">
        {/* User identification badge */}
        {username && (
          <div className="flex justify-between items-center px-3 py-1.5 rounded-xl bg-slate-900/40 border border-slate-900 text-[10px] text-slate-400">
            <span>Usuario: <strong className="text-slate-300">{username}</strong></span>
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${showCosts ? 'bg-indigo-500' : 'bg-amber-500'}`} />
              {showCosts ? 'Perfil: Admin/Gerente' : 'Perfil: Operador'}
            </span>
          </div>
        )}

        {/* SCANNER CONTAINER */}
        <div className="w-full flex flex-col items-center">
          {/* Always mount scanner wrapper but control visibility via CSS to prevent unmounting crashes */}
          <div className={`w-full flex flex-col gap-3 ${scannerActive ? 'block' : 'hidden'}`}>
            <div className="relative rounded-3xl overflow-hidden border border-rose-500/30 bg-slate-900/60 p-1 shadow-2xl">
              {/* Laser scan target indicator */}
              <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-center items-center">
                <div className="w-72 h-36 border-2 border-dashed border-rose-500/60 rounded-xl relative">
                  <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-rose-500 shadow-[0_0_10px_#f43f5e] animate-pulse" />
                </div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-rose-400 bg-slate-950/80 px-2 py-0.5 rounded-full mt-2">
                  Alinee código de barras
                </span>
              </div>

              <div id="reader" className="w-full rounded-2xl overflow-hidden bg-slate-950 aspect-[4/3]" />
            </div>

            <div className="flex gap-2">
              {/* Camera selector if multiple */}
              {cameras.length > 1 && (
                <select
                  value={selectedCameraId}
                  onChange={(e) => {
                    setSelectedCameraId(e.target.value);
                    stopScanner().then(() => startScanner());
                  }}
                  className="flex-1 bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-xl p-2.5 outline-none font-medium"
                >
                  {cameras.map((c, i) => (
                    <option key={c.id} value={c.id}>
                      Cámara {i + 1}: {c.label || 'Principal'}
                    </option>
                  ))}
                </select>
              )}
              
              <button
                onClick={stopScanner}
                className="flex-1 bg-slate-900 hover:bg-slate-850 border border-slate-850 hover:border-slate-800 text-slate-300 text-xs font-bold py-2.5 rounded-xl transition-all"
              >
                Detener Escáner
              </button>
            </div>
          </div>

          {/* Trigger button when scanner is not active */}
          <button
            onClick={startScanner}
            className={`w-full py-8 px-6 rounded-3xl bg-gradient-to-br from-rose-600 to-indigo-700 hover:from-rose-500 hover:to-indigo-600 text-white flex flex-col items-center justify-center gap-3 shadow-xl hover:shadow-rose-950/20 active:scale-[0.98] transition-all border border-rose-500/20 ${scannerActive ? 'hidden' : 'flex'}`}
          >
            <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center shadow-inner relative">
              <i className="pi pi-camera text-2xl text-white" />
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
              </span>
            </div>
            <div className="text-center">
              <span className="text-base font-extrabold block">Iniciar Lector de Cámara</span>
              <span className="text-[10px] text-white/70 block mt-0.5">Escaneo rápido de códigos de barra (EAN/SKU)</span>
            </div>
          </button>
        </div>

        {/* MANUAL CODE ENTRY */}
        <form onSubmit={handleManualSearch} className="flex gap-2">
          <div className="flex-1 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <i className="pi pi-barcode text-sm" />
            </span>
            <input
              type="text"
              value={codeQuery}
              onChange={(e) => setCodeQuery(e.target.value)}
              placeholder="Escriba SKU o Código de Barras..."
              className="w-full bg-slate-900 border border-slate-800 hover:border-slate-700 focus:border-rose-500 text-slate-100 placeholder-slate-500 rounded-2xl pl-10 pr-4 py-3 text-xs outline-none focus:ring-1 focus:ring-rose-500/40 font-medium transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !codeQuery.trim()}
            className="px-5 bg-slate-900 hover:bg-slate-850 active:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-bold rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {searching ? <i className="pi pi-spin pi-spinner" /> : 'Buscar'}
          </button>
        </form>

        {/* ERROR BUBBLE */}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-900/50 text-rose-300 text-xs font-semibold flex items-start gap-2.5 shadow-md animate-fade-in">
            <i className="pi pi-exclamation-circle text-rose-400 mt-0.5 text-sm" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* LOADER SPINNER */}
        {searching && !scannerActive && (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-rose-500" />
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider animate-pulse">Buscando en la base de datos...</p>
          </div>
        )}

        {/* PRODUCT DETAILS CARD */}
        {scannedProduct && !searching && (
          <div className="flex flex-col gap-5 animate-fade-in-up">
            
            {/* Header info */}
            <div className="p-5 rounded-3xl bg-slate-900/50 border border-slate-800/80 shadow-lg backdrop-blur-md">
              <div className="flex justify-between items-start gap-2 mb-2">
                <span className="text-[9px] font-black bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {scannedProduct.brand || 'Genérico'}
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  UOM: <strong className="text-slate-300 font-bold">{scannedProduct.uom}</strong>
                </span>
              </div>
              <h2 className="text-lg font-black tracking-tight text-white leading-snug">
                {scannedProduct.name}
              </h2>
              <div className="flex gap-4 mt-2.5 text-[10px] text-slate-400 font-mono">
                <span>SKU: <strong className="text-slate-200">{scannedProduct.sku}</strong></span>
                {scannedProduct.barcode && (
                  <span>Barras: <strong className="text-slate-200">{scannedProduct.barcode}</strong></span>
                )}
              </div>
            </div>

            {/* PRECIOS Y OFERTAS (PVP) */}
            <div className="p-5 rounded-3xl bg-slate-900/50 border border-slate-800/80 shadow-lg backdrop-blur-md relative overflow-hidden">
              {scannedProduct.prices.has_promo && (
                <div className="absolute top-0 right-0 bg-gradient-to-l from-amber-500 to-amber-600 text-slate-950 font-black text-[9px] px-3.5 py-1 rounded-bl-2xl uppercase tracking-wider flex items-center gap-1 shadow-sm">
                  <span className="flex h-1.5 w-1.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-950 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-slate-950"></span>
                  </span>
                  Oferta
                </div>
              )}
              
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-3">Precio al Público</span>
              
              <div className="flex flex-col gap-4">
                {scannedProduct.prices.has_promo ? (
                  <>
                    {/* Oferta Prices */}
                    <div>
                      <div className="flex items-baseline gap-1.5 text-amber-400">
                        <span className="text-3xl font-black">${(scannedProduct.prices.promo_price_usd ?? 0).toFixed(2)}</span>
                        <span className="text-xs font-bold">USD</span>
                      </div>
                      <div className="text-sm font-bold text-amber-500/90 mt-0.5">
                        Bs. {(scannedProduct.prices.promo_price_ves ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    {/* Regular Price (Strikeout) */}
                    <div className="pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Precio Regular:</span>
                      <div className="text-right text-slate-400">
                        <span className="line-through font-bold">${(scannedProduct.prices.regular_price_usd ?? 0).toFixed(2)} USD</span>
                        <span className="block text-[10px] text-slate-500 line-through">
                          Bs. {(scannedProduct.prices.regular_price_ves ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                    {/* Expiration date */}
                    {scannedProduct.prices.promo_ends_at && (
                      <div className="mt-2 text-[9px] font-bold text-slate-400 bg-slate-800/40 p-2 rounded-xl border border-slate-800/30 flex items-center gap-1.5 justify-center">
                        <i className="pi pi-calendar-times text-slate-500 text-[10px]" />
                        <span>Oferta válida hasta el: <strong className="text-amber-400">{formatDate(scannedProduct.prices.promo_ends_at)}</strong></span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Regular Price */}
                    <div>
                      <div className="flex items-baseline gap-1.5 text-emerald-400">
                        <span className="text-3xl font-black">${(scannedProduct.prices.regular_price_usd ?? 0).toFixed(2)}</span>
                        <span className="text-xs font-bold">USD</span>
                      </div>
                      <div className="text-sm font-bold text-emerald-500/90 mt-0.5">
                        Bs. {(scannedProduct.prices.regular_price_ves ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* STOCK POR TIENDA */}
            <div className="p-5 rounded-3xl bg-slate-900/50 border border-slate-800/80 shadow-lg backdrop-blur-md">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Existencias en Tiendas</span>
                <span className="text-[10px] font-black bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                  Total: {scannedProduct.stock.total_consolidated}
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {scannedProduct.stock.by_facility.map((fac) => (
                  <div
                    key={fac.facility_id}
                    className="flex justify-between items-center p-2.5 rounded-2xl bg-slate-950/40 border border-slate-850/60"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        fac.quantity > 10 
                          ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' 
                          : fac.quantity > 0 
                            ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b]' 
                            : 'bg-rose-500 shadow-[0_0_8px_#ef4444]'
                      }`} />
                      <span className="text-xs font-bold text-slate-300">{fac.facility_name}</span>
                    </div>
                    <span className="text-xs font-black text-white">
                      {fac.quantity > 0 ? (
                        `${fac.quantity} ${scannedProduct.uom}`
                      ) : (
                        <span className="text-rose-400 font-extrabold uppercase text-[9px] tracking-wider">Agotado</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* COSTOS Y MARGENES (CONDITIONAL ROLE ROLE_GERENCIA) */}
            {showCosts && (
              <div className={`p-5 rounded-3xl bg-slate-900/50 border shadow-lg backdrop-blur-md transition-colors ${
                isMarginAlert(scannedProduct.prices.has_promo ? scannedProduct.margins.promo_margin_pct : scannedProduct.margins.regular_margin_pct)
                  ? 'border-rose-500/40 bg-gradient-to-b from-slate-900/50 to-rose-950/10'
                  : 'border-slate-800/80'
              }`}>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-3.5">
                  Costos e Indicadores Financieros
                </span>

                {/* Costs Detail */}
                <div className="grid grid-cols-3 gap-2.5 mb-4">
                  <div className="bg-slate-950/60 border border-slate-850 p-2.5 rounded-2xl text-center">
                    <span className="text-[8px] font-extrabold text-slate-500 uppercase tracking-wider block mb-1">Costo Reposición</span>
                    <strong className="text-xs font-bold text-white">${(scannedProduct.costs.replacement_cost ?? 0).toFixed(2)}</strong>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-850 p-2.5 rounded-2xl text-center">
                    <span className="text-[8px] font-extrabold text-slate-500 uppercase tracking-wider block mb-1">Costo Promedio</span>
                    <strong className="text-xs font-bold text-white">${(scannedProduct.costs.average_cost ?? 0).toFixed(2)}</strong>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-850 p-2.5 rounded-2xl text-center">
                    <span className="text-[8px] font-extrabold text-slate-500 uppercase tracking-wider block mb-1">Costo Estándar</span>
                    <strong className="text-xs font-bold text-white">${(scannedProduct.costs.standard_cost ?? 0).toFixed(2)}</strong>
                  </div>
                </div>

                {/* Margins */}
                <div className="p-3 rounded-2xl bg-slate-950/50 border border-slate-850 flex flex-col gap-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Margen Regular:</span>
                    <span className={`font-black ${isMarginAlert(scannedProduct.margins.regular_margin_pct) ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {scannedProduct.margins.regular_margin_pct}%
                    </span>
                  </div>
                  
                  {scannedProduct.prices.has_promo && (
                    <div className="flex justify-between items-center text-xs border-t border-slate-800/80 pt-2">
                      <span className="text-slate-400">Margen de Oferta:</span>
                      <span className={`font-black ${isMarginAlert(scannedProduct.margins.promo_margin_pct) ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {scannedProduct.margins.promo_margin_pct}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Alert threshold banner */}
                {isMarginAlert(scannedProduct.prices.has_promo ? scannedProduct.margins.promo_margin_pct : scannedProduct.margins.regular_margin_pct) && (
                  <div className="mt-3.5 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[10px] font-bold flex items-center gap-2">
                    <i className="pi pi-exclamation-triangle text-rose-400 text-xs animate-bounce" />
                    <span>ALERTA: Margen neto real por debajo del límite de seguridad (15%)</span>
                  </div>
                )}
              </div>
            )}
            
          </div>
        )}

        {/* SCAN HISTORY SECTION */}
        {history.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Historial de Consultas</span>
              <button
                onClick={clearHistory}
                className="text-[9px] font-black text-rose-400 hover:text-rose-300 transition-colors"
              >
                Limpiar Historial
              </button>
            </div>
            
            <div className="flex flex-col gap-2">
              {history.map((product, idx) => (
                <div
                  key={`${product.sku}-${idx}`}
                  onClick={() => {
                    setErrorMsg('');
                    setScannedProduct(product);
                  }}
                  className="p-3 border border-slate-850 bg-slate-900/30 rounded-2xl flex justify-between items-center hover:bg-slate-900/60 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <div className="min-w-0 pr-2">
                    <h4 className="text-xs font-bold text-slate-200 truncate">{product.name}</h4>
                    <span className="text-[9px] text-slate-500 font-mono">SKU: {product.sku}</span>
                  </div>
                  
                  <div className="text-right flex-shrink-0">
                    <strong className="text-xs font-black text-emerald-400">
                      ${((product.prices?.has_promo && product.prices?.promo_price_usd !== null ? product.prices?.promo_price_usd : product.prices?.regular_price_usd) ?? 0).toFixed(2)}
                    </strong>
                    <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-wider">
                      {product.prices?.has_promo ? 'Oferta' : 'Regular'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      
      {/* Footer footer information */}
      <footer className="text-center text-[9px] text-slate-600 mt-auto py-6 border-t border-slate-900">
        © 2026 Morpheus ERP Soft. Todos los derechos reservados.
      </footer>
    </div>
  );
}
