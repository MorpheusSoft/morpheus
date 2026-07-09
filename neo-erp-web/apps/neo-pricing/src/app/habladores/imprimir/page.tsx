'use client';
import { useState, useEffect } from 'react';
import { PrintTemplate } from '@/services/print-template.service';

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
  regular_net_usd: number;
  regular_gross_usd: number;
  regular_net_ves: number;
  regular_gross_ves: number;
  promo_net_usd: number | null;
  promo_gross_usd: number | null;
  promo_net_ves: number | null;
  promo_gross_ves: number | null;
  promo_start_at: string | null;
  promo_end_at: string | null;
  promo_active: boolean;
}

interface PrintConfig {
  products: PrintItem[];
  template: PrintTemplate;
  startingPosition: number;
  vesRate: number;
}

const BarcodeSVG = ({ val }: { val: string }) => {
  const hash = val ? val.split('').map((c) => c.charCodeAt(0)) : [3, 2, 4, 1, 2, 3];
  return (
    <div className="flex flex-col items-center justify-center w-full">
      <svg className="h-5 w-full max-w-[110px] bg-white" viewBox="0 0 100 24" preserveAspectRatio="none">
        <g fill="black">
          {Array.from({ length: 24 }).map((_, i) => {
            const width = (hash[i % hash.length] % 3) + 1;
            const x = i * 4;
            return <rect key={i} x={x} y={0} width={width} height={18} />;
          })}
        </g>
      </svg>
      <span className="text-[6pt] font-mono tracking-widest mt-0.5 text-black leading-none bg-white px-1">
        {val || '000000000000'}
      </span>
    </div>
  );
};

export default function PrintHabladoresPage() {
  const [config, setConfig] = useState<PrintConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const dataStr = sessionStorage.getItem('habladores_print_data');
      if (!dataStr) {
        setError('No se encontraron datos de impresión en la sesión.');
        setLoading(false);
        return;
      }
      const parsed = JSON.parse(dataStr) as PrintConfig;
      setConfig(parsed);
    } catch (e) {
      console.error(e);
      setError('Error al procesar los datos de impresión.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger print dialog quickly once page renders completely
  useEffect(() => {
    if (!loading && config) {
      const timer = setTimeout(() => {
        window.print();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [loading, config]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 font-semibold">
        <div className="text-center">
          <i className="pi pi-spin pi-spinner text-indigo-600 text-3xl mb-3"></i>
          <div>Cargando habladores para impresión...</div>
        </div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-slate-800 font-semibold">
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl max-w-md text-center flex flex-col gap-4">
          <div className="text-red-500 text-4xl">⚠️</div>
          <h2 className="text-xl font-bold">Error de Impresión</h2>
          <p className="text-slate-500 text-sm font-medium">{error || 'Configuración no válida'}</p>
          <button
            onClick={() => window.close()}
            className="bg-slate-900 text-white font-bold rounded-xl py-2.5 px-5 hover:bg-slate-800 transition-all text-sm mt-2"
          >
            Cerrar Ventana
          </button>
        </div>
      </div>
    );
  }

  const { products, template, startingPosition } = config;
  const {
    paper_type,
    width_mm,
    height_mm,
    margin_top_mm,
    margin_bottom_mm,
    margin_left_mm,
    margin_right_mm,
    rows = 1,
    cols = 1,
    show_sku,
    show_barcode,
    show_price_usd,
    show_price_ves,
    show_price_iva,
    show_uom,
    show_brand,
    promo_text,
    font_size_pt = 10,
    layout_config
  } = template;

  // Flatten the queue to replicate products by their quantity
  const labelsToPrint: PrintItem[] = [];
  products.forEach((p) => {
    for (let i = 0; i < p.qty; i++) {
      labelsToPrint.push(p);
    }
  });

  const getBlockValue = (key: string, item: PrintItem) => {
    const block = layout_config?.[key];
    const cleanCurrency = (text: string) => {
      return text.replace(/\$/g, '').replace(/Bs\./gi, '').replace(/Bs/gi, '').trim();
    };

    if (block?.isCustomText) {
      let result = block.textValue || '';
      const priceUsdIva = item.price_usd * (1 + item.tax_rate / 100);
      const priceVesIva = item.price_ves * (1 + item.tax_rate / 100);
      
      const formatF = (v: number | null | undefined) => v !== null && v !== undefined ? v.toFixed(2) : '-';

      result = result.replace(/{{sku}}/g, item.sku || '');
      result = result.replace(/{{modelo}}/g, item.model || '');
      result = result.replace(/{{marca}}/g, item.brand || '');
      result = result.replace(/{{uom}}/g, item.uom || '');
      result = result.replace(/{{precio_usd}}/g, `${item.price_usd.toFixed(2)}`);
      result = result.replace(/{{precio_ves}}/g, `${item.price_ves.toFixed(2)}`);
      result = result.replace(/{{precio_usd_iva}}/g, `${priceUsdIva.toFixed(2)}`);
      result = result.replace(/{{precio_ves_iva}}/g, `${priceVesIva.toFixed(2)}`);
      
      result = result.replace(/{{regular_net_usd}}/g, `${formatF(item.regular_net_usd)}`);
      result = result.replace(/{{regular_gross_usd}}/g, `${formatF(item.regular_gross_usd)}`);
      result = result.replace(/{{regular_net_ves}}/g, `${formatF(item.regular_net_ves)}`);
      result = result.replace(/{{regular_gross_ves}}/g, `${formatF(item.regular_gross_ves)}`);
      result = result.replace(/{{promo_net_usd}}/g, item.promo_net_usd !== null ? `${formatF(item.promo_net_usd)}` : '-');
      result = result.replace(/{{promo_gross_usd}}/g, item.promo_gross_usd !== null ? `${formatF(item.promo_gross_usd)}` : '-');
      result = result.replace(/{{promo_net_ves}}/g, item.promo_net_ves !== null ? `${formatF(item.promo_net_ves)}` : '-');
      result = result.replace(/{{promo_gross_ves}}/g, item.promo_gross_ves !== null ? `${formatF(item.promo_gross_ves)}` : '-');
      result = result.replace(/{{promo_end_at}}/g, item.promo_end_at ? new Date(item.promo_end_at).toLocaleDateString() : '');
      result = result.replace(/{{promo_start_at}}/g, item.promo_start_at ? new Date(item.promo_start_at).toLocaleDateString() : '');

      return result;
    }

    const prefixRaw = block?.prefix || '';
    const prefixCleaned = cleanCurrency(prefixRaw);
    const prefix = prefixCleaned ? prefixCleaned + ' ' : '';
    
    if (key === 'brand') return prefix + (item.brand || 'Genérico');
    if (key === 'sku') return prefix + (item.sku || '');
    if (key === 'name') return prefix + (item.name || '');
    if (key === 'model') return prefix + (item.model || '');
    if (key === 'uom') return prefix + (item.uom || '');
    if (key === 'price_usd') return prefix + `${item.price_usd.toFixed(2)}`;
    if (key === 'price_ves') return prefix + `${item.price_ves.toFixed(2)}`;
    
    const priceUsdIva = item.price_usd * (1 + item.tax_rate / 100);
    const priceVesIva = item.price_ves * (1 + item.tax_rate / 100);
    if (key === 'price_usd_iva') return prefix + `${priceUsdIva.toFixed(2)}`;
    if (key === 'price_ves_iva') return prefix + `${priceVesIva.toFixed(2)}`;
    
    const formatVal = (v: number | null | undefined) => v !== null && v !== undefined ? v.toFixed(2) : '-';
    if (key === 'regular_net_usd') return prefix + `${formatVal(item.regular_net_usd)}`;
    if (key === 'regular_gross_usd') return prefix + `${formatVal(item.regular_gross_usd)}`;
    if (key === 'regular_net_ves') return prefix + `${formatVal(item.regular_net_ves)}`;
    if (key === 'regular_gross_ves') return prefix + `${formatVal(item.regular_gross_ves)}`;
    if (key === 'promo_net_usd') return prefix + (item.promo_net_usd !== null ? `${formatVal(item.promo_net_usd)}` : '-');
    if (key === 'promo_gross_usd') return prefix + (item.promo_gross_usd !== null ? `${formatVal(item.promo_gross_usd)}` : '-');
    if (key === 'promo_net_ves') return prefix + (item.promo_net_ves !== null ? `${formatVal(item.promo_net_ves)}` : '-');
    if (key === 'promo_gross_ves') return prefix + (item.promo_gross_ves !== null ? `${formatVal(item.promo_gross_ves)}` : '-');
    if (key === 'promo_end_at') return prefix + (item.promo_end_at ? new Date(item.promo_end_at).toLocaleDateString() : '');
    if (key === 'promo_start_at') return prefix + (item.promo_start_at ? new Date(item.promo_start_at).toLocaleDateString() : '');

    if (key === 'promo_text') return prefix + (item.custom_text || promo_text || '');
    return '';
  };

  // Render individual label contents
  const renderLabel = (item: PrintItem, index: number) => {
    // If layout_config exists, render absolute Canva positioning
    if (layout_config) {
      return (
        <div
          key={index}
          className="label-box relative bg-white overflow-hidden"
          style={{
            width: `${width_mm}mm`,
            height: `${height_mm}mm`,
            boxSizing: 'border-box',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            border: '1px dotted #ccc',
            pageBreakInside: 'avoid'
          }}
        >
          {Object.keys(layout_config).map((key) => {
            const block = layout_config[key];
            if (!block || !block.visible) return null;

            if (key === 'barcode') {
              return (
                <div
                  key={key}
                  style={{
                    position: 'absolute',
                    left: `${block.x}mm`,
                    top: `${block.y}mm`,
                    width: `${block.width}mm`,
                    height: `${block.height}mm`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box'
                  }}
                >
                  <BarcodeSVG val={item.barcode} />
                </div>
              );
            }

            if (key === 'company_logo') {
              return (
                <div
                  key={key}
                  style={{
                    position: 'absolute',
                    left: `${block.x}mm`,
                    top: `${block.y}mm`,
                    width: `${block.width}mm`,
                    height: `${block.height}mm`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box'
                  }}
                >
                  {block.imageUrl ? (
                    <img src={block.imageUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', fill: 'currentColor', color: '#000000' }}>
                      <path d="M50,10 L90,30 L90,70 L50,90 L10,70 L10,30 Z M50,25 A 25 25 0 1 0 50,75 A 25 25 0 1 0 50,25 Z M50,38 L62,50 L50,62 L38,50 Z" />
                    </svg>
                  )}
                </div>
              );
            }

            const valText = getBlockValue(key, item);
            if (!valText && key === 'promo_text') return null;

            return (
              <div
                key={key}
                style={{
                  position: 'absolute',
                  left: `${block.x}mm`,
                  top: `${block.y}mm`,
                  fontSize: `${block.fontSize}pt`,
                  fontWeight: block.bold ? 'bold' : 'normal',
                  fontFamily: block.fontFamily || 'system-ui, -apple-system, sans-serif',
                  lineHeight: 'tight',
                  whiteSpace: 'nowrap',
                  boxSizing: 'border-box',
                  color: key === 'promo_text' ? '#e11d48' : '#000000' // Red for promo texts
                }}
              >
                {valText}
              </div>
            );
          })}
        </div>
      );
    }

    // Classic Fallback design
    const priceUsdIva = item.price_usd * (1 + item.tax_rate / 100);
    const priceVesIva = item.price_ves * (1 + item.tax_rate / 100);

    return (
      <div
        key={index}
        className="label-box flex flex-col justify-between p-2 relative bg-white overflow-hidden"
        style={{
          width: `${width_mm}mm`,
          height: `${height_mm}mm`,
          fontSize: `${font_size_pt}pt`,
          boxSizing: 'border-box',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          border: '1px dotted #ccc',
          pageBreakInside: 'avoid'
        }}
      >
        {/* Brand / SKU Row */}
        <div className="flex justify-between items-start text-[0.75em] font-bold text-gray-500 uppercase tracking-wider">
          {show_brand ? <span className="truncate max-w-[65%] text-indigo-700">{item.brand}</span> : <span></span>}
          {show_sku ? <span className="font-mono text-black">{item.sku}</span> : <span></span>}
        </div>

        {/* Product Name */}
        <div className="font-extrabold text-black leading-tight my-0.5 text-[0.95em] line-clamp-2 truncate-2-lines flex-1">
          {item.name} {item.model ? `(${item.model})` : ''}
        </div>

        {/* Custom Promo Text badge or active offer badge */}
        {item.promo_active && item.promo_net_usd !== null ? (
          <div className="bg-rose-600 text-white font-extrabold text-center py-0.5 px-1 rounded uppercase text-[0.7em] tracking-wide mb-0.5 flex justify-between items-center px-2">
            <span>🔥 PRECIO EN OFERTA</span>
            {item.promo_end_at && <span>Vence: {new Date(item.promo_end_at).toLocaleDateString()}</span>}
          </div>
        ) : (item.custom_text || promo_text) ? (
          <div className="bg-rose-600 text-white font-extrabold text-center py-0.5 px-1 rounded uppercase text-[0.7em] tracking-wide mb-0.5">
            {item.custom_text || promo_text}
          </div>
        ) : null}

        {/* UoM Row */}
        {show_uom && (
          <div className="text-[0.75em] font-medium text-gray-600 mb-0.5">
            Uni: <span className="text-black font-bold uppercase">{item.uom}</span>
          </div>
        )}

        {/* Pricing Layout */}
        <div className="flex flex-col border-t border-gray-100 pt-0.5">
          <div className="flex justify-between items-end">
            {show_price_ves && (
              <div className="flex flex-col leading-none">
                <span className="text-[0.55em] font-bold text-gray-400 uppercase">
                  {item.promo_active ? 'VES Regular' : 'Precio VES'}
                </span>
                <span className={`font-bold text-black text-[1.1em] ${item.promo_active ? 'line-through text-gray-400 text-[0.9em]' : ''}`}>
                  {item.price_ves.toFixed(2)}
                </span>
              </div>
            )}
            {show_price_usd && (
              <div className="flex flex-col items-end leading-none">
                <span className="text-[0.55em] font-bold text-gray-400 uppercase">
                  {item.promo_active ? 'USD Regular' : 'Precio USD'}
                </span>
                <span className={`font-bold text-black text-[1.3em] ${item.promo_active ? 'line-through text-gray-400 text-[1.0em]' : ''}`}>
                  {item.price_usd.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Active Promo Prices */}
          {item.promo_active && item.promo_net_usd !== null && (
            <div className="flex justify-between items-end mt-1 pt-1 border-t border-dashed border-rose-200 bg-rose-50/50 p-1 rounded">
              <div className="flex flex-col leading-none">
                <span className="text-[0.55em] font-bold text-rose-600 uppercase">VES OFERTA</span>
                <span className="font-extrabold text-rose-600 text-[1.2em]">
                  {(item.promo_net_ves || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex flex-col items-end leading-none">
                <span className="text-[0.55em] font-bold text-rose-600 uppercase">USD OFERTA</span>
                <span className="font-extrabold text-rose-600 text-[1.5em]">
                  {(item.promo_net_usd || 0).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Show price with IVA underneath if enabled */}
          {show_price_iva && (
            <div className="flex justify-between items-end mt-0.5 pt-0.5 border-t border-dashed border-gray-100">
              <span className="text-[0.6em] font-bold text-slate-500 uppercase">Con IVA:</span>
              <span className="text-[0.75em] font-bold text-slate-800">
                {item.promo_active && item.promo_gross_usd !== null ? (
                  <>{item.promo_gross_ves?.toFixed(2)} / {item.promo_gross_usd?.toFixed(2)}</>
                ) : (
                  <>{priceVesIva.toFixed(2)} / {priceUsdIva.toFixed(2)}</>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Barcode Render */}
        {show_barcode && <BarcodeSVG val={item.barcode} />}
      </div>
    );
  };

  // For GRID paper, we need to arrange items inside page grids
  const renderGridPages = () => {
    const cellsPerPage = rows * cols;
    const allCells: (PrintItem | null)[] = [];

    // 1. Add skipped positions as null placeholders
    const offset = startingPosition - 1;
    for (let i = 0; i < offset; i++) {
      allCells.push(null);
    }

    // 2. Add actual print labels
    labelsToPrint.forEach((item) => {
      allCells.push(item);
    });

    // 3. Pad the end of the last page to keep columns matching
    const totalCellsNeeded = Math.ceil(allCells.length / cellsPerPage) * cellsPerPage;
    while (allCells.length < totalCellsNeeded) {
      allCells.push(null);
    }

    // 4. Chunk cells into page arrays
    const pages: (PrintItem | null)[][] = [];
    for (let i = 0; i < allCells.length; i += cellsPerPage) {
      pages.push(allCells.slice(i, i + cellsPerPage));
    }

    return pages.map((pageCells, pageIdx) => (
      <div
        key={pageIdx}
        className="print-page grid"
        style={{
          width: `${width_mm * cols}mm`,
          height: `${height_mm * rows}mm`,
          gridTemplateColumns: `repeat(${cols}, ${width_mm}mm)`,
          gridTemplateRows: `repeat(${rows}, ${height_mm}mm)`,
          marginTop: `${margin_top_mm}mm`,
          marginBottom: `${margin_bottom_mm}mm`,
          marginLeft: `${margin_left_mm}mm`,
          marginRight: `${margin_right_mm}mm`,
          pageBreakAfter: 'always',
          boxSizing: 'content-box'
        }}
      >
        {pageCells.map((item, cellIdx) => {
          if (!item) {
            return (
              <div
                key={cellIdx}
                className="no-print-border"
                style={{
                  width: `${width_mm}mm`,
                  height: `${height_mm}mm`,
                  boxSizing: 'border-box'
                }}
              ></div>
            );
          }
          return renderLabel(item, cellIdx);
        })}
      </div>
    ));
  };

  const renderSequentialLabels = () => {
    return (
      <div className="print-parent flex flex-col items-start bg-white">
        {labelsToPrint.map((item, idx) => (
          <div
            key={idx}
            className="label-container"
            style={{
              pageBreakAfter: paper_type === 'INDIVIDUAL' ? 'always' : 'auto',
              marginBottom: paper_type === 'CONTINUOUS' ? '2mm' : '0'
            }}
          >
            {renderLabel(item, idx)}
          </div>
        ))}
      </div>
    );
  };

  const customPageSizeStyle = paper_type === 'CUSTOM' ? `
          @page {
            size: ${width_mm * cols + margin_left_mm + margin_right_mm}mm ${height_mm * rows + margin_top_mm + margin_bottom_mm}mm !important;
            margin: 0 !important;
          }
  ` : `
          @page {
            margin: 0 !important;
          }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        /* Reset styles for printing */
        body, html {
          background: white !important;
          color: black !important;
          margin: 0 !important;
          padding: 0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        /* Hide screen-only stuff during print */
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
          ${customPageSizeStyle}
          .print-parent {
            display: block !important;
            width: auto !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
          .print-page, .label-container {
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .label-box {
            border: none !important;
          }
          .label-container {
            margin: 0 !important;
            padding: 0 !important;
          }
        }

        /* Line clamp helper */
        .truncate-2-lines {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}} />

      {/* Screen action header (hidden on print) */}
      <div className="no-print bg-slate-900 text-white p-4 flex justify-between items-center shadow-md select-none">
        <div>
          <h1 className="font-extrabold text-sm tracking-wide uppercase">Modo Pre-Impresión</h1>
          <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Esta página está optimizada para la impresora. Si el diálogo no abre solo, presiona Imprimir.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-4 rounded-xl transition-all shadow-sm"
          >
            🖨️ Imprimir
          </button>
          <button
            onClick={() => window.close()}
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs py-2 px-4 rounded-xl transition-all"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* Print Document Content */}
      <div className="print-parent flex justify-center bg-slate-100/30 min-h-screen py-8 print:p-0 print:bg-white select-none">
        <div className="print-parent bg-white shadow-lg print:shadow-none p-4 print:p-0">
          {paper_type === 'GRID' || paper_type === 'CUSTOM' ? renderGridPages() : renderSequentialLabels()}
        </div>
      </div>
    </>
  );
}
