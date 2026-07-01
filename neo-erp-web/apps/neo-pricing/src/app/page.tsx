'use client';
import { useState, useEffect } from 'react';
import { Button } from 'primereact/button';
import { ProgressBar } from 'primereact/progressbar';
import { Dialog } from 'primereact/dialog';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { PricingService } from '@/services/pricing.service';
import { ProductService } from '@/services/product.service';
import { useRouter } from 'next/navigation';

export default function MetricsDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [showCriticalDialog, setShowCriticalDialog] = useState(false);

  // Product Detail Dialog states
  const [showProductDetailDialog, setShowProductDetailDialog] = useState(false);
  const [detailProductInfo, setDetailProductInfo] = useState<any>(null);
  const [detailVariantPrices, setDetailVariantPrices] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [facilities, setFacilities] = useState<any[]>([]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const data = await PricingService.getMetrics();
      setMetrics(data);
    } catch (err) {
      console.error('Error fetching dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewProductDetail = async (variantId: number, productName: string) => {
    try {
      setLoadingDetail(true);
      setShowProductDetailDialog(true);
      
      const variantData = await ProductService.getVariantById(variantId);
      
      let categoryName = 'Sin Categoría';
      let description = '';
      
      if (variantData && variantData.product_id) {
         try {
            const productData = await ProductService.getProductById(variantData.product_id);
            if (productData) {
               description = productData.description || '';
               const uomBase = productData.uom_base || 'PZA';
               const catData = await ProductService.getCategories();
               const categoryList = catData?.data || catData || [];
               const matchedCat = categoryList.find((c: any) => c.id === productData.category_id);
               if (matchedCat) {
                  categoryName = matchedCat.name;
               }
               setDetailProductInfo({
                 ...variantData,
                 name: productName,
                 categoryName,
                 description,
                 uom_base: uomBase
               });
            } else {
               setDetailProductInfo({
                 ...variantData,
                 name: productName,
                 categoryName,
                 description,
                 uom_base: 'PZA'
               });
            }
         } catch (e) {
            console.error('Error fetching parent product details:', e);
            setDetailProductInfo({
              ...variantData,
              name: productName,
              categoryName,
              description,
              uom_base: 'PZA'
            });
         }
      } else {
         setDetailProductInfo({
           ...variantData,
           name: productName,
           categoryName,
           description: '',
           uom_base: 'PZA'
         });
      }

      const facs = await ProductService.getFacilities();
      const activeFacilities = facs?.data || facs || [];
      setFacilities(activeFacilities);

      const fps = variantData?.facility_prices || [];
      const mapped = activeFacilities.map((f: any) => {
        const fp = fps.find((x: any) => x.facility_id === f.id);
        return {
          facility_id: f.id,
          facility_name: f.name,
          sales_price: fp ? Number(fp.sales_price) : null,
          target_utility_pct: fp ? Number(fp.target_utility_pct) : 0
        };
      });
      setDetailVariantPrices(mapped);
    } catch (e) {
      console.error('Error fetching product variant details:', e);
      setDetailVariantPrices([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCreateSessionForVariant = async (variant: any) => {
    try {
      const newSession = await PricingService.createSession({
        name: "Ajuste Margen: [" + variant.sku + "] " + variant.name,
        source_type: 'FILTER_BULK',
        target_cost_type: 'REPLACEMENT',
        update_type: 'BOTH',
        supplier_id: null
      });
      if (newSession && newSession.id) {
        await PricingService.addSessionLine(newSession.id, {
          variant_id: variant.variant_id,
          action: 'UPDATE_COST'
        });
        router.push(`/${newSession.id}`);
      }
    } catch (e) {
      console.error('Error creating pricing session for variant:', e);
    }
  };

  const handleSendAllInBulk = async () => {
    try {
      const list = metrics?.critical_skus_list || [];
      if (list.length === 0) return;
      
      const newSession = await PricingService.createSession({
        name: "Ajuste Margen Masivo: SKUs en Riesgo Crítico",
        source_type: 'FILTER_BULK',
        target_cost_type: 'REPLACEMENT',
        update_type: 'BOTH',
        supplier_id: null
      });
      
      if (newSession && newSession.id) {
        for (const item of list) {
          await PricingService.addSessionLine(newSession.id, {
            variant_id: item.variant_id,
            action: 'UPDATE_COST'
          });
        }
        router.push(`/${newSession.id}`);
      }
    } catch (e) {
      console.error('Error creating bulk session:', e);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <div className="w-full max-w-[1400px] mx-auto py-12 px-4 flex flex-col justify-center items-center h-[60vh]">
        <i className="pi pi-spin pi-spinner text-4xl text-rose-600 mb-4"></i>
        <p className="text-slate-500 font-bold text-sm tracking-wide animate-pulse">Compilando análisis de costos y márgenes en tiempo real...</p>
      </div>
    );
  }

  const kpiList = [
    {
      title: "Margen Bruto Promedio",
      value: `${metrics?.kpis?.avg_gross_margin ?? 28.5}%`,
      subtext: "Promedio ponderado de SKUs activos",
      icon: "pi-chart-line",
      color: "from-blue-500 to-indigo-600 animate-fadein",
      border: "border-indigo-100",
      textColor: "text-indigo-600",
      bgColor: "bg-indigo-50"
    },
    {
      title: "Margen Neto Ponderado",
      value: `${metrics?.kpis?.avg_net_margin ?? 22.7}%`,
      subtext: "Calculado tras mermas y logística",
      icon: "pi-percentage",
      color: "from-teal-500 to-emerald-600",
      border: "border-emerald-100",
      textColor: "text-emerald-600",
      bgColor: "bg-emerald-50"
    },
    {
      title: "Índice Inflacionario Costos",
      value: `+${metrics?.kpis?.cost_inflation_index ?? 4.2}%`,
      subtext: "Variación acumulada mensual",
      icon: "pi-arrow-up-right",
      color: "from-amber-500 to-orange-600",
      border: "border-amber-100",
      textColor: "text-amber-600",
      bgColor: "bg-amber-50"
    },
    {
      title: "SKUs en Riesgo Crítico",
      value: metrics?.kpis?.critical_skus ?? 14,
      subtext: "Márgenes netos por debajo del 20%",
      icon: "pi-exclamation-triangle",
      color: "from-rose-500 to-red-600",
      border: "border-rose-100",
      textColor: "text-rose-600",
      bgColor: "bg-rose-50",
      isCritical: true
    }
  ];

  return (
    <div className="w-full max-w-[1400px] mx-auto py-6 px-4">
      {/* Top Welcome Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
            <span className="text-2xl">📊</span> Análisis y Métricas
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Diagnóstico de rentabilidad y alertas tempranas del Motor de Costos y Precios.</p>
        </div>
        <div className="flex gap-2">
          <Button 
            label="Actualizar Costos" 
            icon="pi pi-percentage" 
            className="!bg-indigo-600 hover:!bg-indigo-700 !border-none !rounded-xl !shadow-sm !px-4 !py-2.5 font-semibold transition-all duration-200"
            onClick={() => router.push('/costos')} 
          />
          <Button 
            label="Actualizar Precios" 
            icon="pi pi-tags" 
            className="!bg-emerald-600 hover:!bg-emerald-700 !border-none !rounded-xl !shadow-sm !px-4 !py-2.5 font-semibold transition-all duration-200"
            onClick={() => router.push('/precios')} 
          />
          <Button 
            icon="pi pi-refresh" 
            className="!bg-white !text-slate-600 hover:!bg-slate-50 !border-slate-200 !rounded-xl !shadow-sm transition-all duration-200"
            onClick={fetchMetrics}
          />
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {kpiList.map((kpi, idx) => (
          <div 
            key={idx} 
            onClick={() => kpi.isCritical && setShowCriticalDialog(true)}
            className={`bg-white rounded-2xl p-6 border ${kpi.border} shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group ${kpi.isCritical ? 'cursor-pointer hover:border-red-300 hover:shadow-lg' : ''}`}
          >
            {/* Background Accent Gradient */}
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${kpi.color}`}></div>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{kpi.title}</p>
                <h3 className="text-3xl font-extrabold text-slate-800 mt-2 tracking-tight group-hover:scale-[1.02] transition-transform duration-200">
                  {kpi.value}
                </h3>
                <p className="text-slate-400 text-xs mt-1.5 font-medium">
                  {kpi.subtext} {kpi.isCritical && <span className="text-rose-500 font-bold ml-1 hover:underline">Ver detalle ≫</span>}
                </p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${kpi.textColor} ${kpi.bgColor} group-hover:scale-110 transition-transform duration-200`}>
                <i className={`pi ${kpi.icon} text-lg`}></i>
              </div>
            </div>
            {kpi.isCritical && (
              <div className="mt-4 pt-3 border-t border-rose-50 flex items-center justify-between text-[11px] font-bold text-rose-600 bg-rose-50/50 px-3 py-1.5 rounded-lg">
                <span>PÉRDIDA ESTIMADA MENSUAL</span>
                <span>${metrics?.kpis?.estimated_loss_usd?.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Critical SKUs Dialog */}
      <Dialog
        visible={showCriticalDialog}
        style={{ width: '65vw', minWidth: '700px' }}
        header={
          <div className="flex justify-between items-center w-full pr-8">
            <span className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
              ⚠️ Detalle de SKUs en Riesgo Crítico (&lt;20% de Margen)
            </span>
            <Button
              label="⚡ Enviar Todo en Lote"
              className="!bg-rose-600 hover:!bg-rose-700 border-none font-bold text-white text-xs px-3 py-1.5 rounded-xl ml-4 shadow-sm"
              onClick={handleSendAllInBulk}
              disabled={!metrics?.critical_skus_list || metrics.critical_skus_list.length === 0}
            />
          </div>
        }
        onHide={() => setShowCriticalDialog(false)}
        footer={
          <div className="flex justify-end">
            <Button 
              label="Cerrar" 
              icon="pi pi-times" 
              onClick={() => setShowCriticalDialog(false)} 
              className="px-5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 border-none font-bold" 
            />
          </div>
        }
      >
        <div className="mt-2">
          <DataTable
            value={metrics?.critical_skus_list || []}
            paginator
            rows={10}
            className="p-datatable-sm text-xs custom-table"
            emptyMessage="No hay productos en riesgo crítico registrados."
            rowHover
            responsiveLayout="scroll"
          >
            <Column field="sku" header="SKU" className="font-mono font-bold text-slate-700 w-[15%]"></Column>
            <Column field="name" header="PRODUCTO" className="font-semibold text-slate-800 w-[35%]"></Column>
            <Column 
              field="standard_cost" 
              header="COSTO ESTÁNDAR" 
              body={(r) => `$${Number(r.standard_cost).toFixed(2)}`}
              className="w-[12%] text-right font-medium text-slate-600"
              alignHeader="right"
            ></Column>
            <Column 
              field="sales_price" 
              header="PVP BASE" 
              body={(r) => `$${Number(r.sales_price).toFixed(2)}`}
              className="w-[12%] text-right font-bold text-slate-700"
              alignHeader="right"
            ></Column>
            <Column 
              field="margin_pct" 
              header="MARGEN" 
              body={(r) => (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-100`}>
                  {r.margin_pct}%
                </span>
              )}
              className="w-[11%] text-center"
              alignHeader="center"
            ></Column>
            <Column 
              header="ACCIONES" 
              align="center"
              className="w-[15%] text-center"
              body={(rowData) => (
                <div className="flex gap-2 justify-center">
                  <Button 
                    icon="pi pi-eye" 
                    rounded 
                    text 
                    tooltip="Ver Detalle"
                    className="p-button-rounded p-button-text p-0 w-8 h-8 text-indigo-600 hover:bg-indigo-50"
                    onClick={() => handleViewProductDetail(rowData.variant_id, rowData.name)} 
                  />
                  <Button 
                    icon="pi pi-external-link" 
                    rounded 
                    text 
                    tooltip="Actualizar"
                    className="p-button-rounded p-button-text p-0 w-8 h-8 text-emerald-600 hover:bg-emerald-50"
                    onClick={() => handleCreateSessionForVariant(rowData)} 
                  />
                </div>
              )}
            ></Column>
          </DataTable>
        </div>
      </Dialog>

      {/* Product consultation quick-view dialog */}
      <Dialog
        visible={showProductDetailDialog}
        style={{ width: '50vw', minWidth: '600px' }}
        header={<span className="text-xl font-extrabold text-slate-800">📄 Ficha de Consulta de Producto</span>}
        onHide={() => setShowProductDetailDialog(false)}
        footer={
          <div className="flex justify-end">
            <Button 
              label="Cerrar" 
              icon="pi pi-times" 
              onClick={() => setShowProductDetailDialog(false)} 
              className="px-5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 border-none font-bold" 
            />
          </div>
        }
      >
        {detailProductInfo && (
          <div className="flex flex-col gap-6 mt-2">
            
            {/* Header info */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
              <h3 className="text-xl font-bold text-slate-800 mb-1">{detailProductInfo.name}</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400 text-sm font-medium mt-2">
                <span>SKU: <span className="text-slate-600 font-semibold">{detailProductInfo.sku || 'N/A'}</span></span>
                <span>•</span>
                <span>Categoría: <span className="text-slate-600 font-semibold">{detailProductInfo.categoryName || 'Sin Categoría'}</span></span>
              </div>
              {detailProductInfo.description && (
                <p className="text-slate-500 text-xs mt-3 bg-white p-3 rounded-lg border border-slate-100">{detailProductInfo.description}</p>
              )}
            </div>

            {loadingDetail ? (
              <div className="p-8 text-center">
                 <i className="pi pi-spin pi-spinner text-3xl text-indigo-600"></i>
                 <p className="text-xs text-slate-400 mt-2 font-medium">Cargando detalles de costos y sucursales...</p>
              </div>
            ) : (
              <>
                {/* Costs & Prices Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Costs Card */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3">
                    <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-50 pb-2">Estructura de Costos</h4>
                    
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Costo Estándar (Sin IVA)</span>
                      <span className="font-semibold text-slate-700">${Number(detailProductInfo.standard_cost || 0).toFixed(2)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Costo Estándar (Con IVA)</span>
                      <span className="font-semibold text-slate-700">${(Number(detailProductInfo.standard_cost || 0) * 1.16).toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center text-sm border-t border-slate-50 pt-2">
                      <span className="text-slate-500">Costo Reposición</span>
                      <span className="font-semibold text-slate-700">${Number(detailProductInfo.replacement_cost || 0).toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Costo Promedio</span>
                      <span className="font-semibold text-slate-700">${Number(detailProductInfo.average_cost || 0).toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Último Costo</span>
                      <span className="font-semibold text-slate-700">${Number(detailProductInfo.last_cost || 0).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Margins & Prices Card */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3">
                    <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider border-b border-slate-50 pb-2">Precios & Margen General</h4>

                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">PVP Base General (Sin IVA)</span>
                      <span className="font-semibold text-slate-700">${Number(detailProductInfo.sales_price || 0).toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">PVP Base General (Con IVA)</span>
                      <span className="font-extrabold text-emerald-600 text-lg">${(Number(detailProductInfo.sales_price || 0) * 1.16).toFixed(2)}</span>
                    </div>

                    {(() => {
                      const cost = Number(detailProductInfo.standard_cost || 0);
                      const price = Number(detailProductInfo.sales_price || 0);
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
                       {(() => {
                         const stock = Number(detailProductInfo.total_stock || 0);
                         const uom = (detailProductInfo.uom_base || 'PZA').toUpperCase();
                         const isWeight = ['KG', 'KILOGRAMO', 'KILOGRAMOS', 'LBS', 'LIBRA', 'LIBRAS', 'G', 'GRAMOS', 'GRAMO', 'L', 'LT', 'M', 'MT', 'MTS'].includes(uom);
                         const formattedStock = isWeight ? stock.toFixed(3) : Math.round(stock).toString();
                         return (
                           <span className="font-semibold text-slate-700">
                             {formattedStock} {uom.toLowerCase()}
                           </span>
                         );
                       })()}
                     </div>
                  </div>
                </div>

                {/* Branch Pricing Subgrid */}
                <div className="flex flex-col gap-3">
                  <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Detalle por Sucursales</h4>
                  <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                    <DataTable
                      value={detailVariantPrices}
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
                          const val = r.sales_price ?? detailProductInfo.sales_price ?? 0;
                          return <span className={`font-semibold ${r.sales_price ? 'text-indigo-600' : 'text-slate-500'}`}>${Number(val).toFixed(2)}</span>;
                        }}
                      ></Column>
                      <Column
                        header="PVP (CON IVA)"
                        body={(r) => {
                          const val = r.sales_price ?? detailProductInfo.sales_price ?? 0;
                          const valWithTax = Number(val) * 1.16;
                          return <span className={`font-bold ${r.sales_price ? 'text-indigo-700' : 'text-emerald-600'}`}>${valWithTax.toFixed(2)}</span>;
                        }}
                      ></Column>
                      <Column
                        header="MARGEN/UTILIDAD LOCAL"
                        body={(r) => {
                          const val = r.sales_price ?? detailProductInfo.sales_price ?? 0;
                          const cost = Number(detailProductInfo.standard_cost || 0);
                          const margin = val > 0 ? ((val - cost) / val * 100.0) : 0;
                          return (
                            <div className="flex flex-col">
                              <span className={`font-bold ${margin >= 25 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {margin.toFixed(2)}%
                              </span>
                              {r.target_utility_pct > 0 && (
                                <span className="text-[10px] text-slate-400">Objetivo: {r.target_utility_pct}%</span>
                              )}
                            </div>
                          );
                        }}
                      ></Column>
                    </DataTable>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Dialog>

      {/* Middle Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Branch Dispersion Card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 lg:col-span-7 flex flex-col">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <i className="pi pi-building text-slate-400 text-sm"></i> Márgenes por Sucursal
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">Dispersión de rentabilidad y SKUs exclusivos activos por sucursal.</p>
            </div>
            <span className="text-[10px] font-bold px-2.5 py-1 bg-slate-100 rounded-full text-slate-500 uppercase tracking-wider">Sucursales</span>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Sucursal</th>
                  <th className="pb-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">SKUs Activos</th>
                  <th className="pb-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Margen Promedio</th>
                  <th className="pb-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right" style={{ width: '120px' }}>Salud</th>
                </tr>
              </thead>
              <tbody>
                {metrics?.branch_dispersion?.map((branch: any, idx: number) => {
                  const healthy = branch.avg_margin_pct >= 25;
                  const warning = branch.avg_margin_pct < 25 && branch.avg_margin_pct >= 20;
                  const pct = Math.min(Math.max((branch.avg_margin_pct / 40) * 100, 10), 100);
                  
                  let colorClass = "bg-emerald-500";
                  let textClass = "text-emerald-600";
                  if (warning) {
                    colorClass = "bg-amber-500";
                    textClass = "text-amber-600";
                  } else if (branch.avg_margin_pct < 20) {
                    colorClass = "bg-rose-500";
                    textClass = "text-rose-600";
                  }

                  return (
                    <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 font-bold text-slate-700 text-sm">{branch.facility_name}</td>
                      <td className="py-4 text-slate-500 text-xs font-semibold text-center">{branch.active_skus}</td>
                      <td className="py-4 text-slate-800 font-extrabold text-sm text-right">{branch.avg_margin_pct}%</td>
                      <td className="py-4 text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          <span className={`text-[10px] font-extrabold ${textClass}`}>
                            {healthy ? 'Saludable' : warning ? 'Atención' : 'Crítico'}
                          </span>
                          <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className={`${colorClass} h-full rounded-full`} style={{ width: `${pct}%` }}></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Cost-driving Suppliers Card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 lg:col-span-5 flex flex-col">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <i className="pi pi-truck text-slate-400 text-sm"></i> Inflación por Proveedor
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">Proveedores con mayor impacto de aumento en listas de costos.</p>
            </div>
            <span className="text-[10px] font-bold px-2.5 py-1 bg-rose-50 rounded-full text-rose-600 border border-rose-100 uppercase tracking-wider">Alertas</span>
          </div>

          <div className="flex-1 flex flex-col gap-4">
            {metrics?.top_suppliers?.map((supplier: any, idx: number) => (
              <div 
                key={idx} 
                className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100/60 rounded-xl border border-slate-100 transition-all duration-200 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 border border-rose-100 flex items-center justify-center font-extrabold text-xs">
                    {idx + 1}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">{supplier.name}</h4>
                    <p className="text-slate-400 text-[11px] font-medium">{supplier.affected_skus} productos afectados</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-extrabold text-rose-600 block">+{supplier.cost_increase_pct}%</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Incremento</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
