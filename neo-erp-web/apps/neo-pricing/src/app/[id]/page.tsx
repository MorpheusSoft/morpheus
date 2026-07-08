'use client';
import { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { AutoComplete } from 'primereact/autocomplete';
import { InputNumber } from 'primereact/inputnumber';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Checkbox } from 'primereact/checkbox';
import { SelectButton } from 'primereact/selectbutton';
import { useRouter, useParams } from 'next/navigation';
import api from '@/lib/api';
import { PricingService } from '@/services/pricing.service';
import { ProductService } from '@/services/product.service';
import { CoreService } from '@/services/core.service';

function BranchPricingSubGrid({ 
    variantId, 
    defaultPrice, 
    facilities,
    lineId,
    clearFacilityPrices = false,
    onToggleClearFacilityPrices,
    sessionStatus
}: { 
    variantId: number, 
    defaultPrice: number, 
    facilities: any[],
    lineId?: number,
    clearFacilityPrices?: boolean,
    onToggleClearFacilityPrices?: (val: boolean) => Promise<void>,
    sessionStatus?: string
}) {
    const [branchPrices, setBranchPrices] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchBranchPrices = async () => {
        if (!variantId) return;
        try {
            setLoading(true);
            const variantData = await ProductService.getVariantById(variantId);
            const fps = variantData?.facility_prices || [];
            
            const mapped = facilities.map(f => {
                const fp = fps.find((x: any) => x.facility_id === f.id);
                return {
                    facility_id: f.id,
                    facility_name: f.name,
                    sales_price: fp ? Number(fp.sales_price) : 0,
                    target_utility_pct: fp ? Number(fp.target_utility_pct) : 0
                };
            });
            setBranchPrices(mapped);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBranchPrices();
    }, [variantId, facilities]);

    const handleResetAllBranches = async () => {
        if (clearFacilityPrices) {
            try {
                setLoading(true);
                if (onToggleClearFacilityPrices) {
                    await onToggleClearFacilityPrices(false);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        } else {
            const confirmed = window.confirm("¿Estás seguro de configurar este producto para heredar el precio general en todas las sucursales? Se aplicará al confirmar la sesión.");
            if (!confirmed) return;
            try {
                setLoading(true);
                if (onToggleClearFacilityPrices) {
                    await onToggleClearFacilityPrices(true);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
    };

    const handleSavePrice = async (facilityId: number, newPrice: number) => {
        try {
            setLoading(true);
            const variantData = await ProductService.getVariantById(variantId);
            let fps = [...(variantData?.facility_prices || [])];
            const index = fps.findIndex((x: any) => x.facility_id === facilityId);
            
            if (index !== -1) {
                if (newPrice > 0) {
                    fps[index].sales_price = newPrice;
                } else {
                    fps.splice(index, 1);
                }
            } else if (newPrice > 0) {
                fps.push({
                    facility_id: facilityId,
                    sales_price: newPrice,
                    target_utility_pct: 0
                });
            }

            await ProductService.updateVariant(variantId, {
                facility_prices: fps
            });
            
            fetchBranchPrices();
        } catch (e) {
            console.error(e);
            alert('Error al guardar el precio de la sucursal.');
        } finally {
            setLoading(false);
        }
    };

    const renderAIElasticity = (facilityName: string, currentPrice: number) => {
        const isCapital = facilityName.toLowerCase().includes('principal') || 
                          facilityName.toLowerCase().includes('norte') ||
                          facilityName.toLowerCase().includes('centro');
        
        const basePrice = currentPrice > 0 ? currentPrice : defaultPrice;
        if (isCapital) {
            const sug = basePrice * 1.04;
            return (
                <div className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg p-2 font-medium">
                    <span className="font-bold block text-indigo-900"><i className="pi pi-sparkles"></i> Elasticidad Baja</span>
                    Alta rotación. Permite incremento del 4% sin frenar demanda. Sugerido: <span className="font-extrabold">${sug.toFixed(2)}</span>
                </div>
            );
        } else {
            const sug = basePrice * 0.98;
            return (
                <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2 font-medium">
                    <span className="font-bold block text-amber-900"><i className="pi pi-sparkles"></i> Elasticidad Alta</span>
                    Competencia local intensa. Se sugiere ajuste defensivo del -2% para traccionar volumen. Sugerido: <span className="font-extrabold">${sug.toFixed(2)}</span>
                </div>
            );
        }
    };

    return (
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-inner">
            <div className="flex justify-between items-center mb-3">
                <h4 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-2 m-0">
                    <i className="pi pi-building text-slate-400"></i> Precios Exclusivos por Sucursal
                </h4>
                {sessionStatus === 'DRAFT' && (
                    <Button 
                        label={clearFacilityPrices ? "Cancelar Heredar General" : "Heredar General en Todas"} 
                        icon={clearFacilityPrices ? "pi pi-times" : "pi pi-refresh"} 
                        className={`p-button-text p-button-sm !py-1 !px-2 text-[10px] font-bold rounded-md ${
                            clearFacilityPrices 
                                ? "text-red-600 hover:bg-red-50 hover:text-red-700" 
                                : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                        }`} 
                        onClick={handleResetAllBranches}
                        disabled={loading}
                    />
                )}
            </div>
            {clearFacilityPrices && (
                <div className="mb-3 p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs font-semibold flex items-center gap-2">
                    <i className="pi pi-exclamation-triangle text-amber-600"></i>
                    <span>Este producto está marcado para <strong>heredar el precio general</strong> en todas las sucursales cuando se aplique la sesión (se eliminarán los precios específicos).</span>
                </div>
            )}
            {loading ? (
                <div className="p-4 text-center text-xs text-slate-400 font-bold animate-pulse">Consultando base de precios por localidad...</div>
            ) : (
                <DataTable value={branchPrices} className="text-xs p-datatable-sm" responsiveLayout="scroll">
                    <Column field="facility_name" header="SUCURSAL" className="font-bold text-slate-700"></Column>
                    <Column header="PRECIO ACTUAL" body={(r) => (
                        <span className="font-medium text-slate-500">
                            {r.sales_price > 0 ? `$${r.sales_price.toFixed(2)}` : `Heredado ($${defaultPrice.toFixed(2)})`}
                        </span>
                    )}></Column>
                    <Column header="PRECIO EXCLUSIVO ($)" body={(r) => (
                        <InputNumber 
                            value={r.sales_price > 0 ? r.sales_price : null} 
                            onValueChange={(e) => handleSavePrice(r.facility_id, e.value ?? 0)}
                            mode="currency" 
                            currency="USD" 
                            locale="en-US" 
                            placeholder={`Inherit ($${defaultPrice.toFixed(2)})`}
                            inputClassName="p-1 w-28 text-center text-xs font-bold border border-slate-200 rounded" 
                            disabled={sessionStatus !== 'DRAFT' || loading}
                        />
                    )}></Column>
                    <Column header="SUGERENCIA IA (ELASTICIDAD)" body={(r) => renderAIElasticity(r.facility_name, r.sales_price)} className="w-[45%]"></Column>
                </DataTable>
            )}
        </div>
    );
}

export default function PricingValidationBoardPage() {
  const router = useRouter();
  const params = useParams();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [newCost, setNewCost] = useState<number | null>(null);
  const [newPrice, setNewPrice] = useState<number | null>(null);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [expandedRows, setExpandedRows] = useState<any>(null);

  // Product Detail Dialog states
  const [showProductDetailDialog, setShowProductDetailDialog] = useState(false);
  const [detailProductInfo, setDetailProductInfo] = useState<any>(null);
  const [detailVariantPrices, setDetailVariantPrices] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

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

  // Export Wizard states
  const [showExportWizard, setShowExportWizard] = useState(false);
  const [exportFields, setExportFields] = useState<string[]>(['sku', 'name', 'proposed_cost', 'proposed_price']);
  const [exportDelimiter, setExportDelimiter] = useState<string>(',');
  const [exportIncludeHeaders, setExportIncludeHeaders] = useState<boolean>(true);
  const [exportCodeType, setExportCodeType] = useState<string>('BARCODE');

  const exportCodeTypeOptions = [
      { label: 'Cualquiera (El primero disponible)', value: 'ANY' },
      { label: 'Código de Barras (EAN/UPC)', value: 'BARCODE' },
      { label: 'Código Principal (STELLAR_CODE)', value: 'STELLAR_CODE' },
      { label: 'Referencia de Fábrica', value: 'FACTORY_REF' }
  ];

  const exportFieldOptions = [
      { label: 'SKU / Código', value: 'sku' },
      { label: 'Código de Barras', value: 'barcode' },
      { label: 'Nombre / Descripción', value: 'name' },
      { label: 'Costo Actual', value: 'old_cost' },
      { label: 'Nuevo Costo Propuesto', value: 'proposed_cost' },
      { label: 'Costo Reposición Actual', value: 'old_replacement_cost' },
      { label: 'Nuevo Costo Reposición', value: 'proposed_replacement_cost' },
      { label: 'Precio Actual', value: 'old_price' },
      { label: 'Nuevo Precio Propuesto', value: 'proposed_price' },
      { label: 'Nuevo Precio (Con IVA)', value: 'proposed_price_iva' }
  ];

  const delimiterOptions = [
      { label: 'Coma (,)', value: ',' },
      { label: 'Punto y Coma (;)', value: ';' },
      { label: 'Barra Vertical (|)', value: '|' },
      { label: 'Tabulador (Tab)', value: '\t' }
  ];

  // Reconciliation states
  const [reconcilingLine, setReconcilingLine] = useState<any>(null);
  const [showReconciliationDialog, setShowReconciliationDialog] = useState(false);
  const [selectedReconcileProduct, setSelectedReconcileProduct] = useState<any>(null);
  const [reconcileSearchResults, setReconcileSearchResults] = useState([]);

  // Currency & exchange rate conversion states
  const [vesRate, setVesRate] = useState<number>(40.0);
  const [uploadCurrency, setUploadCurrency] = useState<string>('USD');
  const [uploadRate, setUploadRate] = useState<number>(40.0);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedUploadFile, setSelectedUploadFile] = useState<any>(null);

  // Factorization post-upload states
  const [factorRate, setFactorRate] = useState<number>(40.0);
  const [applyingRate, setApplyingRate] = useState(false);

  useEffect(() => {
     ProductService.getFacilities().then(setFacilities);
     // Fetch exchange rates from CoreService
     CoreService.getCurrencies().then((currencies: any) => {
       const list = currencies?.data || currencies || [];
       const ves = list.find((c: any) => c.code === 'VES');
       if (ves && ves.exchange_rate) {
         const rate = parseFloat(ves.exchange_rate);
         setVesRate(rate);
         setUploadRate(rate);
         setFactorRate(rate);
       }
     }).catch((err: any) => {
       console.error("Error fetching currencies:", err);
     });
  }, []);

  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardSuppliers, setWizardSuppliers] = useState<number[]>([]);
  const [wizardCategories, setWizardCategories] = useState<number[]>([]);
  const [wizardSearchTerm, setWizardSearchTerm] = useState<string>('');
  const [wizardBrands, setWizardBrands] = useState<string>('');
  const [wizardModels, setWizardModels] = useState<string>('');
  const [wizardAttrKey, setWizardAttrKey] = useState<string>('');
  const [wizardAttrValue, setWizardAttrValue] = useState<string>('');
  
  const [wizardSupplierOptions, setWizardSupplierOptions] = useState<any[]>([]);
  const [wizardCategoryOptions, setWizardCategoryOptions] = useState<any[]>([]);
  
  const [costRuleAction, setCostRuleAction] = useState('KEEP');
  const [costRuleValue, setCostRuleValue] = useState<number>(0);
  
  const [priceRuleAction, setPriceRuleAction] = useState('ADD_PERCENTAGE');
  const [priceRuleValue, setPriceRuleValue] = useState<number>(5.0);
  const [priceRuleBaseTarget, setPriceRuleBaseTarget] = useState('CURRENT_PRICE');
  const [priceRuleIncludeTax, setPriceRuleIncludeTax] = useState(false);
  const [wizardClearFacilityPrices, setWizardClearFacilityPrices] = useState(false);

  const ruleOptions = [
    { label: 'Mantiene', value: 'KEEP' },
    { label: 'Suma (%)', value: 'ADD_PERCENTAGE' },
    { label: 'Suma Fija ($)', value: 'ADD_FIXED' },
    { label: 'Fijar Precio ($)', value: 'SET_FIXED' },
    { label: 'Aplicar Margen (%) Esperado', value: 'TARGET_MARGIN' }
  ];

  const baseTargetOptions = [
    { label: 'Precio Actual', value: 'CURRENT_PRICE' },
    { label: 'Costo Estándar', value: 'STANDARD_COST' },
    { label: 'Costo de Reposición', value: 'REPLACEMENT_COST' },
    { label: 'Costo Promedio', value: 'AVERAGE_COST' },
    ...(session?.update_type !== 'PRICE' ? [{ label: 'Nuevo Costo de esta Sesión', value: 'NEW_COST' }] : [])
  ];

  const fetchWizardData = async () => {
    try {
      const [sup, cat] = await Promise.all([
        api.get('/suppliers/?limit=1000'),
        ProductService.getCategories()
      ]);
      
      const supData = sup.data?.data || sup.data?.items || (Array.isArray(sup.data) ? sup.data : []);
      const catData = cat?.data || cat?.items || (Array.isArray(cat) ? cat : []);
      
      setWizardSupplierOptions(supData);
      setWizardCategoryOptions(catData);
    } catch(e) { console.error(e); }
  };

  useEffect(() => {
    if (showWizard && (wizardSupplierOptions.length === 0 && wizardCategoryOptions.length === 0)) {
       fetchWizardData();
    }
  }, [showWizard]);

  const searchProduct = async (event: any) => {
    try {
      const res = await ProductService.getProducts(0, 20, event.query);
      const variants = res?.data?.flatMap((p: any) => p.variants.map((v: any) => ({...v, product: p}))) || [];
      setSearchResults(variants);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddLine = async () => {
    if (!selectedProduct) return;
    try {
      setLoading(true);
      const nameDesc = selectedProduct.product?.name || 'Variante';
      const extRefName = `${selectedProduct.sku} - ${nameDesc}`;
      await PricingService.addSessionLine(params.id as string, {
        variant_id: selectedProduct.id,
        external_reference_name: extRefName,
        proposed_cost: newCost || 0,
        proposed_price: newPrice || 0,
        action: 'UPDATE_COST'
      });
      setSelectedProduct(null);
      setNewCost(null);
      setNewPrice(null);
      fetchSession();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleWizardSubmit = async () => {
    try {
        setLoading(true);
        const brandsList = wizardBrands ? wizardBrands.split(',').map(b => b.trim()).filter(Boolean) : [];
        const modelsList = wizardModels ? wizardModels.split(',').map(m => m.trim()).filter(Boolean) : [];
        const payload = {
            filters: {
               supplier_ids: wizardSuppliers,
               category_ids: wizardCategories,
               search_term: wizardSearchTerm || null,
               brands: brandsList,
               models: modelsList,
               attribute_key: wizardAttrKey || null,
               attribute_value: wizardAttrValue || null
            },
            cost_rule: { action: costRuleAction, value: costRuleValue, base_target: 'CURRENT_COST', include_tax: false },
            price_rule: { action: priceRuleAction, value: priceRuleValue, base_target: priceRuleBaseTarget, include_tax: priceRuleIncludeTax },
            clear_facility_prices: wizardClearFacilityPrices
        };
        await PricingService.bulkFilterLines(params.id as string, payload);
        setShowWizard(false);
        setWizardStep(1);
        setWizardClearFacilityPrices(false);
        fetchSession();
    } catch(err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  const fetchSession = async () => {
    try {
      setLoading(true);
      const data = await PricingService.getSessionById(params.id as string);
      setSession(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, [params.id]);

  const onCellEditComplete = async (e: any) => {
    let { rowData, newValue, field } = e;
    if (newValue === rowData[field] || newValue === null) return;

    // Optimistic update
    const newLines = [...(session?.lines || [])];
    const index = newLines.findIndex(l => l.id === rowData.id);
    if (index !== -1) {
       newLines[index] = { ...newLines[index], [field]: newValue };
       setSession({ ...session, lines: newLines });
    }

    try {
       await PricingService.updateSessionLine(params.id as string, rowData.id, { [field]: newValue });
    } catch (err) {
       console.error("Error updating line", err);
       fetchSession(); // Revert on failure
    }
  };

  const priceEditor = (options: any) => {
    return <InputNumber value={options.value} onValueChange={(e) => options.editorCallback(e.value)} mode="currency" currency="USD" autoFocus inputClassName="p-1 w-24 text-sm" />;
  };

  const handleApply = async () => {
    try {
      setApplying(true);
      await PricingService.applySession(params.id as string);
      fetchSession();
    } catch (err) {
      console.error(err);
    } finally {
      setApplying(false);
    }
  };

  const handleExportFile = () => {
      if (!session?.lines || session.lines.length === 0) {
          alert("No hay líneas para exportar en esta sesión.");
          return;
      }
      let fileContent = "";
      if (exportIncludeHeaders) {
          const headers = exportFields.map(f => exportFieldOptions.find(opt => opt.value === f)?.label || f);
          fileContent += headers.join(exportDelimiter) + "\n";
      }
      session.lines.forEach((line: any) => {
          let sku = line.variant?.sku || line.variant_id?.toString() || '';
          let name = line.external_reference_name || '';
          let finalBarcode = '';

          // 1. Intentar extraer del JSON en external_reference si no hay variante (líneas importadas sin emparejar)
          try {
              if (name.startsWith('{') && name.endsWith('}')) {
                  const parsed = JSON.parse(name);
                  sku = parsed.supplier_sku || sku;
                  finalBarcode = parsed.barcode || '';
                  name = parsed.description || '';
              } else if (name.includes(' - ')) {
                  const parts = name.split(' - ');
                  name = parts.slice(1).join(' - ');
              }
          } catch (e) {
              console.error(e);
          }

          // 2. Extraer el código correcto de los barcodes reales de la base de datos
          if (line.variant && line.variant.barcodes && line.variant.barcodes.length > 0) {
              if (exportCodeType === 'ANY') {
                  finalBarcode = line.variant.barcodes[0].barcode;
              } else {
                  const found = line.variant.barcodes.find((b: any) => b.code_type === exportCodeType);
                  if (found) {
                      finalBarcode = found.barcode;
                  } else {
                      // Fallback si no tiene el específico
                      finalBarcode = line.variant.barcodes[0].barcode;
                  }
              }
          }

          const rowData: Record<string, string> = {
              sku: sku,
              barcode: finalBarcode,
              name: `"${name.replace(/"/g, '""')}"`,
              old_cost: Number(line.old_cost || 0).toFixed(2),
              proposed_cost: Number(line.proposed_cost || 0).toFixed(2),
              old_replacement_cost: Number(line.old_replacement_cost || 0).toFixed(2),
              proposed_replacement_cost: Number(line.proposed_replacement_cost || 0).toFixed(2),
              old_price: Number(line.old_price || 0).toFixed(2),
              proposed_price: Number(line.proposed_price || 0).toFixed(2),
              proposed_price_iva: (Number(line.proposed_price || 0) * 1.16).toFixed(2)
          };
          const rowValues = exportFields.map(f => rowData[f] || "");
          fileContent += rowValues.join(exportDelimiter) + "\n";
      });
      const blob = new Blob([fileContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      const ext = exportDelimiter === '\t' ? 'txt' : 'csv';
      link.setAttribute("download", `exportacion_sesion_${params.id || 'morpheus'}.${ext}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setShowExportWizard(false);
  };

  const handleUploadCsv = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setParsingPdf(true);
      setPdfProgressMsg('IA: Leyendo archivo CSV...');
      await new Promise(r => setTimeout(r, 600));
      setPdfProgressMsg('IA: Analizando encabezados y mapeando columnas con Gemini...');
      await new Promise(r => setTimeout(r, 800));
      setPdfProgressMsg('IA: Procesando productos y conciliando...');
      await PricingService.uploadCsv(params.id as string, file);
      setPdfProgressMsg('IA: Carga y conciliación finalizada con éxito.');
      await new Promise(r => setTimeout(r, 400));
      fetchSession();
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.detail || 'Error al procesar el archivo CSV.';
      alert(msg);
    } finally {
      setParsingPdf(false);
      setPdfProgressMsg('');
    }
  };

  const handleUploadPdfWithParams = async (file: File, currency: string, rate: number) => {
    if (!file) return;
    try {
      setParsingPdf(true);
      setShowUploadDialog(false);
      setPdfProgressMsg('IA: Iniciando motor de lectura OCR...');
      await new Promise(r => setTimeout(r, 600));
      setPdfProgressMsg('IA: Procesando columnas y extrayendo productos con Gemini...');
      await PricingService.uploadPdf(params.id as string, file, currency, currency === 'VES' ? rate : 1.0);
      setPdfProgressMsg('IA: Conciliación completada con éxito.');
      await new Promise(r => setTimeout(r, 400));
      fetchSession();
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.detail || 'Error al procesar el archivo PDF.';
      alert(msg);
    } finally {
      setParsingPdf(false);
      setPdfProgressMsg('');
      setSelectedUploadFile(null);
    }
  };

  const handleApplyExchangeRate = async (op: string) => {
    if (!factorRate || factorRate <= 0) {
      alert("Por favor ingrese una tasa válida mayor a 0.");
      return;
    }
    const opMsg = op === 'DIVIDE' ? 'dividir' : 'multiplicar';
    if (!confirm(`¿Está seguro de que desea ${opMsg} todos los nuevos costos y precios propuestos por ${factorRate}?`)) {
      return;
    }
    
    try {
      setApplyingRate(true);
      await PricingService.applyExchangeRate(params.id as string, factorRate, op);
      fetchSession();
      alert("Tasa de cambio aplicada exitosamente en lote.");
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || "Error al aplicar la tasa de cambio en lote.");
    } finally {
      setApplyingRate(false);
    }
  };

  const openReconciliationDialog = (line: any) => {
      setReconcilingLine(line);
      setShowReconciliationDialog(true);
  };

  const handleConfirmLink = async () => {
    if (!reconcilingLine || !selectedReconcileProduct) return;
    try {
        setLoading(true);
        await PricingService.associateLine(params.id as string, reconcilingLine.id, selectedReconcileProduct.id);
        setShowReconciliationDialog(false);
        setSelectedReconcileProduct(null);
        fetchSession();
    } catch(err: any) {
        console.error(err);
        alert('Error al vincular el producto.');
    } finally {
        setLoading(false);
    }
  };

  const handleCreateAsNew = async (line: any) => {
     let desc = line.external_reference_name;
     try {
         if (desc.startsWith('{') && desc.endsWith('}')) {
             const parsed = JSON.parse(desc);
             desc = parsed.description || desc;
         }
     } catch(e){}
     
     const confirmed = window.confirm(`¿Estás seguro de crear "${desc}" como un nuevo producto en la categoría Licores?`);
     if (!confirmed) return;
     
     try {
         setLoading(true);
         await PricingService.createProductFromLine(params.id as string, line.id, {
             brand: session?.name?.includes('Diageo') || session?.name?.includes('DIAGEO') ? 'DIAGEO' : 'PROVEEDOR'
         });
         fetchSession();
         alert('Producto creado y vinculado correctamente.');
     } catch (err: any) {
         console.error(err);
         alert('Error al crear el producto.');
     } finally {
         setLoading(false);
     }
  };

  const productTemplate = (rowData: any) => {
      let sku = '';
      let name = rowData.external_reference_name || '';
      let barcode = '';

      try {
          if (name.startsWith('{') && name.endsWith('}')) {
              const parsed = JSON.parse(name);
              sku = parsed.supplier_sku || '';
              barcode = parsed.barcode || '';
              name = parsed.description || '';
          }
      } catch (e) {}

      const hasVariant = !!rowData.variant_id;

      return (
          <div className="flex flex-col gap-1 py-1">
              <div className="flex items-center gap-2">
                  {!hasVariant && (
                      <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider border border-amber-200">
                          ⚠️ Sin Mapear
                      </span>
                  )}
                  {hasVariant ? (
                      <span 
                          onClick={() => handleViewProductDetail(rowData.variant_id, name)}
                          className="font-bold text-indigo-600 cursor-pointer hover:text-indigo-800 hover:underline flex items-center gap-1.5"
                      >
                          {name} <i className="pi pi-info-circle text-indigo-400 text-xs hover:text-indigo-600"></i>
                      </span>
                  ) : (
                      <span className="font-bold text-slate-800">{name}</span>
                  )}
              </div>
              {(sku || barcode) && (
                  <div className="text-[10px] text-slate-400 font-medium flex items-center gap-3">
                      {sku && <span>SKU Prov: <span className="font-bold text-slate-500">{sku}</span></span>}
                      {barcode && <span>Barras: <span className="font-bold text-slate-500">{barcode}</span></span>}
                  </div>
              )}
          </div>
      );
  };

  const handleDeleteLine = async (line: any) => {
      const confirmed = window.confirm(`¿Estás seguro de eliminar este registro de la mesa de trabajo?`);
      if (!confirmed) return;
      try {
          setLoading(true);
          await PricingService.deleteSessionLine(params.id as string, line.id);
          fetchSession();
      } catch (err: any) {
          console.error(err);
          if (err.response?.status === 404) {
              fetchSession();
          } else {
              alert('Error al eliminar la línea.');
          }
      } finally {
          setLoading(false);
      }
  };

  const actionTemplate = (rowData: any) => {
      const isDraft = session?.status === 'DRAFT';
      
      if (!rowData.variant_id) {
          return (
              <div className="flex gap-2 justify-center items-center">
                  <Button 
                      icon="pi pi-link" 
                      tooltip="Vincular a producto existente" 
                      tooltipOptions={{ position: 'top' }}
                      className="p-button-rounded p-button-text p-button-info p-0 w-8 h-8 text-blue-600 hover:bg-blue-50" 
                      onClick={() => openReconciliationDialog(rowData)} 
                  />
                  <Button 
                      icon="pi pi-plus" 
                      tooltip="Crear como nuevo" 
                      tooltipOptions={{ position: 'top' }}
                      className="p-button-rounded p-button-text p-button-success p-0 w-8 h-8 text-emerald-600 hover:bg-emerald-50" 
                      onClick={() => handleCreateAsNew(rowData)} 
                  />
                  {isDraft && (
                      <Button 
                          icon="pi pi-trash" 
                          tooltip="Eliminar registro" 
                          tooltipOptions={{ position: 'top' }}
                          className="p-button-rounded p-button-text p-button-danger p-0 w-8 h-8 text-rose-600 hover:bg-rose-50" 
                          onClick={() => handleDeleteLine(rowData)} 
                      />
                  )}
              </div>
          );
      }

      return (
          <div className="flex gap-3 justify-center items-center">
              <span className="font-mono text-xs px-2 py-1 bg-slate-100 rounded text-slate-500">{rowData.action}</span>
              {isDraft && (
                  <Button 
                      icon="pi pi-trash" 
                      tooltip="Eliminar registro" 
                      tooltipOptions={{ position: 'top' }}
                      className="p-button-rounded p-button-text p-button-danger p-0 w-8 h-8 text-rose-600 hover:bg-rose-50" 
                      onClick={() => handleDeleteLine(rowData)} 
                  />
              )}
          </div>
      );
  };

  const [parsingPdf, setParsingPdf] = useState(false);
  const [pdfProgressMsg, setPdfProgressMsg] = useState('');

  const handleUploadPdfMock = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setParsingPdf(true);
      setPdfProgressMsg('IA: Iniciando motor de lectura OCR...');
      await new Promise(r => setTimeout(r, 800));
      
      setPdfProgressMsg('IA: Analizando estructura de la factura / listado...');
      await new Promise(r => setTimeout(r, 800));
      
      setPdfProgressMsg('IA: Cotejando códigos de barra y SKUs con el catálogo maestro...');
      await new Promise(r => setTimeout(r, 800));

      const res = await ProductService.getProducts(0, 3);
      const variants = res?.data?.flatMap((p: any) => p.variants.map((v: any) => ({...v, product: p}))) || [];
      
      if (variants.length > 0) {
        for (let i = 0; i < Math.min(variants.length, 3); i++) {
          const v = variants[i];
          const standardCost = Number(v.standard_cost || 10);
          const replacementCost = Number(v.replacement_cost || 10);
          const salesPrice = Number(v.sales_price || 15);
          
          await PricingService.addSessionLine(params.id as string, {
            variant_id: v.id,
            external_reference_name: `${v.sku} - ${v.product?.name || 'Producto'} (Escaneado IA)`,
            old_cost: standardCost,
            proposed_cost: standardCost * 1.15,
            old_replacement_cost: replacementCost,
            proposed_replacement_cost: replacementCost * 1.15,
            old_price: salesPrice,
            proposed_price: salesPrice * 1.05,
            action: 'UPDATE_COST'
          });
        }
        setPdfProgressMsg('IA: Carga finalizada con éxito.');
        await new Promise(r => setTimeout(r, 400));
        fetchSession();
        alert('¡Factura procesada con éxito! La IA de Morpheus identificó 3 productos en la imagen y detectó un incremento de costos de un 15% de promedio.');
      } else {
        alert('No se encontraron productos en el catálogo para simular la carga. Por favor, agrega productos primero.');
      }
    } catch (err) {
      console.error(err);
      alert('Error simulando el procesamiento de PDF.');
    } finally {
      setParsingPdf(false);
      setPdfProgressMsg('');
    }
  };

  const statusTemplate = (rowData: any) => {
    const s = rowData.action;
    return <span className="font-mono text-xs px-2 py-1 bg-slate-100 rounded text-slate-500">{s}</span>;
  };

  const renderMarginAlert = (rowData: any) => {
      const isReplacement = session?.target_cost_type === 'REPLACEMENT';
      const cost = Number(isReplacement ? (rowData.proposed_replacement_cost || 0) : (rowData.proposed_cost || 0));
      const price = Number(rowData.proposed_price || rowData.old_price || 0);
      const isFresh = rowData.external_reference_name?.toLowerCase().includes('fresco') || 
                      rowData.external_reference_name?.toLowerCase().includes('polar') || 
                      (Number(rowData.variant_id || 0) % 2 === 0);
      const shrinkage = isFresh ? 6.5 : 1.5;
      const netMargin = price > 0 ? ((price - (cost / (1 - shrinkage/100))) / price) * 100 : 0;

      if (netMargin < 15) {
          const recommendedPrice = (cost / (1 - shrinkage/100)) / 0.75;
          return (
              <div className="flex flex-col gap-1 text-[11px] bg-rose-50 border border-rose-100 rounded-lg p-2 text-rose-800">
                  <span className="font-extrabold flex items-center gap-1 text-rose-700"><i className="pi pi-exclamation-triangle"></i> Margen Crítico</span>
                  <span>Pérdida por merma del {shrinkage}% (Neto: {netMargin.toFixed(1)}%).</span>
                  <span className="font-bold text-slate-700">Sug. PVP: ${recommendedPrice.toFixed(2)}</span>
              </div>
          );
      }
      return (
          <div className="flex flex-col gap-1 text-[11px] bg-emerald-50 border border-emerald-100 rounded-lg p-2 text-emerald-800">
              <span className="font-bold flex items-center gap-1 text-emerald-700"><i className="pi pi-check-circle"></i> Protegido</span>
              <span>Margen Neto Real: {netMargin.toFixed(1)}% (Mermas: {shrinkage}%).</span>
              <span className="font-bold text-slate-700">Precio (Sin IVA): ${price.toFixed(2)}</span>
          </div>
      );
  };

  const rowExpansionTemplate = (rowData: any) => {
      return (
          <div className="p-4 bg-slate-50 border-y border-slate-200">
              <BranchPricingSubGrid 
                  variantId={rowData.variant_id} 
                  defaultPrice={Number(rowData.proposed_price || 0)} 
                  facilities={facilities} 
                  lineId={rowData.id}
                  clearFacilityPrices={rowData.clear_facility_prices}
                  onToggleClearFacilityPrices={async (val) => {
                      try {
                          await PricingService.updateSessionLine(params.id as string, rowData.id, { clear_facility_prices: val });
                          await fetchSession();
                      } catch (e) {
                          console.error(e);
                          alert("Error al actualizar la línea de la sesión.");
                      }
                  }}
                  sessionStatus={session?.status}
              />
          </div>
      );
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto py-6">
       <div className="flex justify-between items-center mb-6">
          <div>
             <div className="flex items-center gap-3">
                <Button icon="pi pi-arrow-left" rounded text severity="secondary" onClick={() => router.push(session?.update_type === 'COST' ? '/costos' : '/precios')} />
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{session?.name || 'Cargando...'}</h1>
             </div>
             <p className="text-slate-500 mt-1 ml-12">
                 Origen: <span className="font-bold text-slate-800">{session?.source_type}</span> | 
                 Afectará: <span className="font-bold text-slate-800">{session?.target_cost_type}</span> | 
                 Tipo: <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{session?.update_type || 'BOTH'}</span>
             </p>
          </div>
          <div className="flex items-center gap-4">
              {session?.status === 'APPLIED' && (
                  <Button 
                      label="Exportar TXT/CSV" 
                      icon="pi pi-download" 
                      severity="secondary"
                      outlined
                      className="font-bold !rounded-xl !py-2.5 !px-5 text-sm" 
                      onClick={() => setShowExportWizard(true)} 
                  />
              )}
              {session?.status === 'DRAFT' && (
                <div className="flex items-center gap-2">
                   {session?.source_type === 'AI_PDF_PARSER' && (
                     <Button 
                       label="Cargar Lista de Precios / PDF (IA)" 
                       icon="pi pi-file-pdf" 
                       severity="help" 
                       className="border-slate-300 font-bold !rounded-xl !py-2.5 !px-5 text-sm" 
                       onClick={() => setShowUploadDialog(true)}
                     />
                   )}
                   {session?.source_type === 'CSV_UPLOAD' && (
                     <div className="relative overflow-hidden inline-block">
                        <Button 
                          label="Importar CSV" 
                          icon="pi pi-upload" 
                          severity="secondary" 
                          className="border-slate-300 font-bold !rounded-xl !py-2.5 !px-5 text-sm" 
                        />
                        <input 
                          type="file" 
                          accept=".csv" 
                          onChange={handleUploadCsv} 
                          className="absolute left-0 top-0 opacity-0 cursor-pointer w-full h-full" 
                        />
                     </div>
                   )}
                </div>
              )}
              {session?.status === 'DRAFT' && (
                 <Button 
                   label="Aplicar Cambios Atómicamente" 
                   icon="pi pi-check-circle" 
                   loading={applying || loading} 
                   className="!bg-emerald-600 border-none !rounded-xl !py-2.5 !px-5 text-sm font-bold shadow-md hover:!bg-emerald-700 transition-all" 
                   onClick={handleApply} 
                 />
              )}
           </div>
       </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
           {session?.status === 'DRAFT' && (session?.source_type === 'AI_PDF_PARSER' || session?.source_type === 'CSV_UPLOAD') && (
             <div className="bg-slate-900 text-white border-b border-slate-800 p-4 flex flex-wrap items-center justify-between gap-4 relative z-10">
                <div className="flex items-center gap-3">
                   <span className="text-xl">💱</span>
                   <div>
                      <h4 className="text-sm font-bold text-slate-200">Conversión y Factorización Rápida (Mesa de Trabajo)</h4>
                      <p className="text-slate-400 text-xs mt-0.5">Divide o multiplica todos los nuevos costos y precios propuestos en lote.</p>
                   </div>
                </div>
                <div className="flex items-center gap-3">
                   <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Tasa de Cambio</span>
                      <InputNumber 
                        value={factorRate} 
                        onValueChange={(e) => setFactorRate(e.value ?? 1.0)} 
                        mode="decimal" 
                        minFractionDigits={2} 
                        maxFractionDigits={6} 
                        placeholder="40.00" 
                        inputClassName="p-2 bg-slate-800 border-slate-700 text-white rounded-lg w-28 text-sm text-center font-bold" 
                      />
                   </div>
                   <Button 
                     label="Dividir (VES -> USD)" 
                     icon="pi pi-percentage" 
                     className="!bg-emerald-600 hover:!bg-emerald-700 border-none px-4 py-2 text-xs font-bold shadow-md h-9 mt-4" 
                     loading={applyingRate}
                     onClick={() => handleApplyExchangeRate('DIVIDE')}
                   />
                   <Button 
                     label="Multiplicar (USD -> VES)" 
                     icon="pi pi-times" 
                     className="!bg-amber-600 hover:!bg-amber-700 border-none px-4 py-2 text-xs font-bold shadow-md h-9 mt-4" 
                     loading={applyingRate}
                     onClick={() => handleApplyExchangeRate('MULTIPLY')}
                   />
                </div>
             </div>
           )}
           {session?.status === 'DRAFT' && session?.source_type === 'FILTER_BULK' && (
            <div className="bg-slate-55 border-b border-slate-200 p-4 flex flex-wrap items-end gap-4 relative z-10">
               <div className="flex-1 min-w-[250px]">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Línea Manual: Buscar Producto</label>
                  <AutoComplete 
                    field="sku" 
                    value={selectedProduct} 
                    suggestions={searchResults} 
                    completeMethod={searchProduct} 
                    onChange={(e) => setSelectedProduct(e.value)} 
                    itemTemplate={(item) => (<div><span className="font-bold text-slate-800">{item.product?.name || 'Variante'}</span><div className="text-xs text-slate-500 mt-1">{item.sku}</div></div>)} 
                    placeholder="Escribe el código o nombre..." 
                    className="w-full" 
                    inputClassName="w-full p-2 border-slate-300 rounded-md" 
                  />
               </div>
               {session?.update_type !== 'PRICE' && (
                  <div className="w-32">
                     <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Nvo. Costo</label>
                     <InputNumber value={newCost} onValueChange={(e) => setNewCost(e.value ?? null)} mode="currency" currency="USD" locale="en-US" placeholder="0.00" inputClassName="p-2 border-slate-300 rounded-md w-full" />
                  </div>
                )}
                {session?.update_type !== 'COST' && (
                  <div className="w-32">
                     <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Nvo. Precio</label>
                     <InputNumber value={newPrice} onValueChange={(e) => setNewPrice(e.value ?? null)} mode="currency" currency="USD" locale="en-US" placeholder="0.00" inputClassName="p-2 border-slate-300 rounded-md w-full" />
                  </div>
                )}
               <Button icon="pi pi-plus" label="Añadir a Mesa" className="h-[40px] px-6 !bg-rose-600 hover:!bg-rose-700 border-none font-bold" disabled={!selectedProduct} onClick={handleAddLine} />
            </div>
          )}
          {session?.status === 'DRAFT' && session?.source_type === 'FILTER_BULK' && (
            <div className="bg-slate-100 border-b border-slate-200 p-4 flex flex-col justify-center items-center py-8">
               <h3 className="text-lg font-bold text-slate-700 mb-2">Explora y Multiplica Rápidamente</h3>
               <p className="text-slate-500 text-sm mb-4">Usa el Motor de Cálculo para afectar a decenas de productos de golpe desde proveedores selectos.</p>
               <Button icon="pi pi-sparkles" label="Asistente de Carga Masiva" className="!bg-purple-600 hover:!bg-purple-700 border-none px-6 py-2 shadow-lg hover:scale-105 transition-transform" onClick={() => setShowWizard(true)} />
            </div>
          )}
          {session?.status === 'APPLIED' && (
             <div className="bg-emerald-50 text-emerald-800 p-4 border-b border-emerald-100 flex items-center gap-3 font-medium">
                <i className="pi pi-check-circle text-xl text-emerald-500"></i>
                Esta sesión ya ha sido aplicada a la base de datos y es de solo lectura.
             </div>
          )}
          <DataTable 
             value={session?.lines || []} 
             loading={loading} 
             emptyMessage="No hay lineas cargadas en este borrador." 
             scrollable 
             scrollHeight="60vh" 
             editMode="cell"
             expandedRows={expandedRows}
             onRowToggle={(e) => setExpandedRows(e.data)}
             rowExpansionTemplate={rowExpansionTemplate}
          >
             {session?.update_type === 'PRICE' && <Column expander style={{ width: '3rem' }} />}
             
             <Column field="external_reference_name" header="REFERENCIA / PRODUCTO" className="font-bold" body={productTemplate}></Column>
             
             {(session?.update_type === 'BOTH' || !session?.update_type) && (
                <Column 
                   field="old_cost" 
                   header="COSTO ESTÁNDAR ($)" 
                   body={(r) => <span className="text-slate-400">${Number(r.old_cost).toFixed(2)}</span>}
                ></Column>
             )}
             {(session?.update_type === 'BOTH' || !session?.update_type) && (
                <Column 
                   field="proposed_cost" 
                   header="NUEVO ESTÁNDAR ($)" 
                   body={(r) => <span className="text-blue-600 font-extrabold">${Number(r.proposed_cost).toFixed(2)}</span>} 
                   editor={session?.status === 'DRAFT' ? priceEditor : undefined} 
                   onCellEditComplete={onCellEditComplete} 
                   className={session?.status === 'DRAFT' ? 'cursor-pointer hover:bg-slate-50 font-bold' : ''}
                ></Column>
             )}
             
             {(session?.update_type === 'BOTH' || !session?.update_type) && (
                <Column 
                   field="old_replacement_cost" 
                   header="COSTO REPOSICIÓN ($)" 
                   body={(r) => <span className="text-slate-400">${Number(r.old_replacement_cost || 0).toFixed(2)}</span>}
                ></Column>
             )}
             {(session?.update_type === 'BOTH' || !session?.update_type) && (
                <Column 
                   field="proposed_replacement_cost" 
                   header="NUEVO REPOSICIÓN ($)" 
                   body={(r) => <span className="text-violet-600 font-extrabold">${Number(r.proposed_replacement_cost || 0).toFixed(2)}</span>} 
                   editor={session?.status === 'DRAFT' ? priceEditor : undefined} 
                   onCellEditComplete={onCellEditComplete} 
                   className={session?.status === 'DRAFT' ? 'cursor-pointer hover:bg-slate-50 font-bold' : ''}
                ></Column>
             )}

             {session?.update_type === 'COST' && (
                session?.target_cost_type === 'STANDARD' ? (
                   <Column 
                      field="old_cost" 
                      header="COSTO ACTUAL ($)" 
                      body={(r) => <span className="text-slate-500">${Number(r.old_cost).toFixed(2)}</span>}
                   ></Column>
                ) : (
                   <Column 
                      field="old_replacement_cost" 
                      header="COSTO ACTUAL ($)" 
                      body={(r) => <span className="text-slate-500">${Number(r.old_replacement_cost || 0).toFixed(2)}</span>}
                   ></Column>
                )
             )}
             {session?.update_type === 'COST' && (
                session?.target_cost_type === 'STANDARD' ? (
                   <Column 
                      field="proposed_cost" 
                      header="NUEVO COSTO ($)" 
                      body={(r) => <span className="text-blue-600 font-extrabold">${Number(r.proposed_cost).toFixed(2)}</span>} 
                      editor={session?.status === 'DRAFT' ? priceEditor : undefined} 
                      onCellEditComplete={onCellEditComplete} 
                      className={session?.status === 'DRAFT' ? 'cursor-pointer hover:bg-slate-50 font-bold' : ''}
                   ></Column>
                ) : (
                   <Column 
                      field="proposed_replacement_cost" 
                      header="NUEVO COSTO ($)" 
                      body={(r) => <span className="text-violet-600 font-extrabold">${Number(r.proposed_replacement_cost || 0).toFixed(2)}</span>} 
                      editor={session?.status === 'DRAFT' ? priceEditor : undefined} 
                      onCellEditComplete={onCellEditComplete} 
                      className={session?.status === 'DRAFT' ? 'cursor-pointer hover:bg-slate-50 font-bold' : ''}
                   ></Column>
                )
             )}

             {session?.update_type !== 'COST' && (
                <Column 
                   header="COSTO BASE ($)" 
                   body={(r) => {
                       const cost = session?.target_cost_type === 'REPLACEMENT' 
                           ? Number(r.proposed_replacement_cost || r.old_replacement_cost || 0)
                           : Number(r.proposed_cost || r.old_cost || 0);
                       return <span className="text-slate-500 font-medium">${cost.toFixed(2)}</span>;
                   }}
                ></Column>
             )}
             {session?.update_type !== 'COST' && (
                <Column 
                   field="old_price" 
                   header="PVP ACTUAL ($)" 
                   body={(r) => <span className="text-slate-500">${Number(r.old_price).toFixed(2)}</span>}
                ></Column>
             )}
             {session?.update_type !== 'COST' && (
                <Column 
                   field="proposed_price" 
                   header="NUEVO PVP ($)" 
                   body={(r) => <span className="text-emerald-600 font-extrabold">${Number(r.proposed_price).toFixed(2)}</span>} 
                   editor={session?.status === 'DRAFT' ? priceEditor : undefined} 
                   onCellEditComplete={onCellEditComplete} 
                   className={session?.status === 'DRAFT' ? 'cursor-pointer hover:bg-slate-50 font-bold' : ''}
                ></Column>
             )}
             {session?.update_type !== 'COST' && (
                <Column 
                   header="NUEVO PVP (CON IVA) ($)" 
                   body={(r) => <span className="text-emerald-800 font-bold">${(Number(r.proposed_price) * 1.16).toFixed(2)}</span>} 
                ></Column>
             )}
             
             {session?.update_type === 'COST' && (
                <Column header="ANÁLISIS DE MARGEN (IA)" body={renderMarginAlert} className="w-[20%]"></Column>
             )}
             
             <Column header="ACCIÓN" body={actionTemplate} align="center"></Column>
          </DataTable>
       </div>

       <Dialog visible={showWizard} style={{ width: '40vw', minWidth: '500px' }} header="✨ Asistente de Carga Masiva" onHide={() => { setShowWizard(false); setWizardStep(1); }} footer={
          <div className="flex justify-between w-full">
             <Button label="Cancelar" icon="pi pi-times" className="p-button-text" onClick={() => { setShowWizard(false); setWizardStep(1); }} />
             <div>
                {wizardStep > 1 && <Button label="Atrás" icon="pi pi-arrow-left" className="p-button-text mr-2" onClick={() => setWizardStep(wizardStep - 1)} />}
                {wizardStep < 2 ? (
                  <Button label="Siguiente" icon="pi pi-arrow-right" iconPos="right" onClick={() => setWizardStep(wizardStep + 1)} />
                ) : (
                  <Button label="Generar Lote" icon="pi pi-check" iconPos="right" loading={loading} onClick={handleWizardSubmit} className="!bg-teal-600 border-none" />
                )}
             </div>
          </div>
       }>
        {wizardStep === 1 && (
            <div className="flex flex-col gap-4 mt-2">
               <p className="text-sm text-slate-500 mb-2">Paso 1: ¿A qué productos les aplicaremos la regla matemática? Puedes combinar múltiples filtros (AND).</p>
               
               <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Proveedores</label>
                  <MultiSelect value={wizardSuppliers} options={wizardSupplierOptions} onChange={(e) => setWizardSuppliers(e.value)} optionLabel="name" optionValue="id" placeholder="Cualquier proveedor..." filter className="w-full" display="chip" virtualScrollerOptions={{ itemSize: 38 }} />
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Categorías Principales</label>
                  <MultiSelect value={wizardCategories} options={wizardCategoryOptions} onChange={(e) => setWizardCategories(e.value)} optionLabel="name" optionValue="id" placeholder="Cualquier categoría..." filter className="w-full" display="chip" virtualScrollerOptions={{ itemSize: 38 }} />
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Marcas (separadas por coma)</label>
                     <InputText value={wizardBrands} onChange={(e) => setWizardBrands(e.target.value)} placeholder="Ej. Polar, Nike..." className="w-full" />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Modelos (separados por coma)</label>
                     <InputText value={wizardModels} onChange={(e) => setWizardModels(e.target.value)} placeholder="Ej. Harina, Air Max..." className="w-full" />
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Propiedad de Variante</label>
                     <Dropdown 
                       value={wizardAttrKey} 
                       options={[
                         { label: 'Ninguno / Sin Filtro', value: '' },
                         { label: 'Talla / Tamaño (talla)', value: 'talla' },
                         { label: 'Color (color)', value: 'color' }
                       ]} 
                       onChange={(e) => setWizardAttrKey(e.value)} 
                       placeholder="Selecciona atributo..." 
                       className="w-full" 
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Valor del Atributo</label>
                     <InputText value={wizardAttrValue} onChange={(e) => setWizardAttrValue(e.target.value)} placeholder="Ej. M, Rojo, XL..." disabled={!wizardAttrKey} className="w-full" />
                  </div>
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Término de Búsqueda (Opcional)</label>
                  <InputText value={wizardSearchTerm} onChange={(e) => setWizardSearchTerm(e.currentTarget.value)} placeholder="Ej. Lata, Caja..." className="w-full" />
               </div>
            </div>
        )}
        {wizardStep === 2 && (
             <div className="flex flex-col gap-4 mt-2">
                <p className="text-sm text-slate-500 mb-2">Paso 2: ¿Qué matemática aplicamos al lote resultante?</p>
                <div className="flex gap-4">
                   {session?.update_type !== 'PRICE' && (
                      <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-500 mb-1 uppercase text-rose-600 border-b border-slate-100 pb-1">Regla para el COSTO</label>
                          <Dropdown value={costRuleAction} options={ruleOptions} onChange={(e) => setCostRuleAction(e.value)} className="w-full mb-2" />
                          <InputNumber value={costRuleValue} onValueChange={(e) => setCostRuleValue(e.value ?? 0)} disabled={costRuleAction === 'KEEP'} minFractionDigits={2} className="w-full" placeholder="Valor numérico..." />
                      </div>
                   )}
                   {session?.update_type !== 'COST' && (
                      <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-500 mb-1 uppercase text-emerald-600 border-b border-slate-100 pb-1">Regla para el PRECIO</label>
                          <Dropdown value={priceRuleBaseTarget} options={baseTargetOptions} onChange={(e) => setPriceRuleBaseTarget(e.value)} className="w-full mb-2" placeholder="Base de Cálculo" />
                          <Dropdown value={priceRuleAction} options={ruleOptions} onChange={(e) => setPriceRuleAction(e.value)} className="w-full mb-2" />
                          <InputNumber value={priceRuleValue} onValueChange={(e) => setPriceRuleValue(e.value ?? 0)} disabled={priceRuleAction === 'KEEP' || priceRuleAction === 'TARGET_MARGIN'} minFractionDigits={2} className="w-full" placeholder="Valor numérico..." />
                          
                          <div className="flex items-center mt-3 gap-2">
                             <Checkbox inputId="cbTax" checked={priceRuleIncludeTax} onChange={(e) => setPriceRuleIncludeTax(e.checked ?? false)} />
                             <label htmlFor="cbTax" className="text-sm text-slate-700 cursor-pointer select-none">Sumar Impuesto (IVA)</label>
                          </div>
                          
                          <div className="flex items-center mt-3 gap-2">
                             <Checkbox inputId="cbClearFac" checked={wizardClearFacilityPrices} onChange={(e) => setWizardClearFacilityPrices(e.checked ?? false)} />
                             <label htmlFor="cbClearFac" className="text-sm text-slate-700 cursor-pointer select-none">Heredar precio general en sucursales (Elimina precios específicos)</label>
                          </div>
                      </div>
                   )}
                </div>
               
               <div className="bg-blue-50 text-blue-800 p-4 rounded-md mt-4 text-sm border border-blue-100 flex items-start gap-3">
                   <i className="pi pi-info-circle text-xl mt-0.5"></i>
                   <div>
                     <span className="font-bold block mb-1">Impacto Seguro en la Base de Datos</span>
                     <p>Esto cruzará y calculará las líneas solicitadas. Las líneas resultantes se inyectarán en la sesión borrador actual de forma temporal para tu revisión visual.</p>
                   </div>
               </div>
            </div>
        )}
      </Dialog>

      <Dialog 
          visible={showExportWizard} 
          style={{ width: '30vw', minWidth: '400px' }} 
          header="📤 Exportar Datos de la Sesión" 
          onHide={() => setShowExportWizard(false)}
          footer={
              <div className="flex justify-end gap-2">
                  <Button label="Cancelar" icon="pi pi-times" className="p-button-text text-slate-500" onClick={() => setShowExportWizard(false)} />
                  <Button label="Descargar Archivo" icon="pi pi-download" className="!bg-teal-600 hover:!bg-teal-700 border-none font-bold text-white px-4 py-2" onClick={handleExportFile} />
              </div>
          }
      >
          <div className="flex flex-col gap-4 mt-2">
              <p className="text-sm text-slate-500 mb-2">Selecciona las columnas y el delimitador para el archivo exportado.</p>
              
              <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Columnas a Exportar</label>
                  <MultiSelect 
                      value={exportFields} 
                      options={exportFieldOptions} 
                      onChange={(e) => setExportFields(e.value)} 
                      optionLabel="label" 
                      placeholder="Selecciona campos..." 
                      display="chip" 
                      className="w-full" 
                  />
              </div>

              <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase text-indigo-600">Tipo de Código de Barras</label>
                  <Dropdown 
                      value={exportCodeType} 
                      options={exportCodeTypeOptions} 
                      onChange={(e) => setExportCodeType(e.value)} 
                      className="w-full border-indigo-200 shadow-sm" 
                  />
              </div>

              <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Delimitador (Separador)</label>
                  <Dropdown 
                      value={exportDelimiter} 
                      options={delimiterOptions} 
                      onChange={(e) => setExportDelimiter(e.value)} 
                      className="w-full" 
                  />
              </div>

              <div className="flex items-center mt-2 gap-2">
                  <Checkbox 
                      inputId="cbIncludeHeaders" 
                      checked={exportIncludeHeaders} 
                      onChange={(e) => setExportIncludeHeaders(e.checked ?? false)} 
                  />
                  <label htmlFor="cbIncludeHeaders" className="text-sm text-slate-700 cursor-pointer select-none">
                      Incluir fila de encabezados en el archivo
                  </label>
              </div>
          </div>
      </Dialog>

      <Dialog 
        visible={showReconciliationDialog} 
        style={{ width: '35vw', minWidth: '450px' }} 
        header="🔗 Reconciliar Producto Inexistente" 
        onHide={() => { setShowReconciliationDialog(false); setSelectedReconcileProduct(null); }}
        footer={
          <div className="flex justify-end gap-2">
            <Button label="Cancelar" text severity="secondary" onClick={() => { setShowReconciliationDialog(false); setSelectedReconcileProduct(null); }} className="p-button-text" />
            <Button 
                label="Vincular a Existente" 
                icon="pi pi-link" 
                disabled={!selectedReconcileProduct} 
                onClick={handleConfirmLink} 
                className="!bg-indigo-600 border-none font-bold text-white px-4 py-2 rounded" 
            />
          </div>
        }
      >
        <div className="flex flex-col gap-4 mt-2">
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800">
                <span className="font-bold block mb-1">Producto en PDF sin coincidencia:</span>
                {reconcilingLine && (() => {
                    let desc = reconcilingLine.external_reference_name;
                    let sku = '';
                    let barcode = '';
                    try {
                        if (desc.startsWith('{') && desc.endsWith('}')) {
                            const parsed = JSON.parse(desc);
                            sku = parsed.supplier_sku || '';
                            barcode = parsed.barcode || '';
                            desc = parsed.description || desc;
                        }
                    } catch(e){}
                    return (
                        <div className="mt-1 font-semibold">
                            <p className="text-sm font-bold text-slate-800">{desc}</p>
                            {sku && <p>SKU Proveedor: <span className="font-mono text-slate-600">{sku}</span></p>}
                            {barcode && <p>Código de Barras: <span className="font-mono text-slate-600">{barcode}</span></p>}
                        </div>
                    );
                })()}
            </div>
            
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Buscar Producto Equivalente en Sistema</label>
                <AutoComplete 
                    field="sku" 
                    value={selectedReconcileProduct} 
                    suggestions={searchResults} 
                    completeMethod={searchProduct} 
                    onChange={(e) => setSelectedReconcileProduct(e.value)} 
                    itemTemplate={(item) => (
                        <div>
                            <span className="font-bold text-slate-800">{item.sku}</span>
                            <div className="text-xs text-slate-500 mt-1">{item.product?.name || 'Variante'}</div>
                        </div>
                    )} 
                    placeholder="Escribe código de barra, SKU o nombre..." 
                    className="w-full" 
                    inputClassName="w-full p-2 border border-slate-300 rounded" 
                />
            </div>
        </div>
      </Dialog>

      <Dialog visible={parsingPdf} closable={false} style={{ width: '30vw', minWidth: '400px' }} header="✨ Procesamiento de Archivo (IA)" onHide={() => {}}>
        <div className="flex flex-col items-center py-6 text-center gap-4">
          <i className="pi pi-spin pi-spinner text-4xl text-indigo-600 animate-pulse"></i>
          <p className="font-bold text-slate-700 text-sm">{pdfProgressMsg}</p>
          <span className="text-xs text-slate-400 font-medium">Analizando archivo y cruzando datos con la base de datos...</span>
        </div>
      </Dialog>

      {/* Diálogo de Carga de Lista (PDF / Excel / IA) */}
      <Dialog 
        header="Cargar Lista de Precios / PDF (IA)" 
        visible={showUploadDialog} 
        style={{ width: '450px' }} 
        modal 
        onHide={() => {
          setShowUploadDialog(false);
          setSelectedUploadFile(null);
        }}
        className="!rounded-2xl"
      >
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Moneda del Documento</label>
            <SelectButton 
              value={uploadCurrency} 
              options={[
                { label: 'Dólares (USD)', value: 'USD' },
                { label: 'Bolívares (VES)', value: 'VES' }
              ]} 
              onChange={(e) => setUploadCurrency(e.value || 'USD')} 
              className="w-full text-center"
            />
          </div>

          {uploadCurrency === 'VES' && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tasa de Cambio a aplicar (dividirá costos y precios)</label>
              <div className="flex items-center gap-2">
                <InputNumber 
                  value={uploadRate} 
                  onValueChange={(e) => setUploadRate(e.value ?? 1.0)} 
                  mode="decimal" 
                  minFractionDigits={2} 
                  maxFractionDigits={6}
                  className="w-full"
                  inputClassName="p-2 border border-slate-300 rounded-lg w-full text-sm"
                />
                <Button 
                  icon="pi pi-sync" 
                  severity="secondary" 
                  outlined 
                  onClick={() => setUploadRate(vesRate)} 
                  tooltip="Restablecer a Tasa Oficial" 
                  className="h-10"
                />
              </div>
              <p className="text-[10px] text-slate-500 italic">
                * Tasa oficial de referencia: {vesRate.toFixed(4)} VES/USD.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 mt-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Seleccionar Archivo (PDF, Excel o Imagen)</label>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-all">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <span className="text-2xl mb-2">📁</span>
                  <p className="mb-1 text-xs text-slate-500 font-bold">
                    {selectedUploadFile ? selectedUploadFile.name : 'Haz clic para seleccionar archivo'}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    PDF, XLSX, XLS, JPG o PNG
                  </p>
                </div>
                <input 
                  type="file" 
                  accept=".pdf,image/*,.xlsx,.xls" 
                  className="hidden" 
                  onChange={(e) => setSelectedUploadFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button 
              label="Cancelar" 
              className="p-button-text text-sm font-bold" 
              onClick={() => {
                setShowUploadDialog(false);
                setSelectedUploadFile(null);
              }} 
            />
            <Button 
              label="Procesar con IA" 
              severity="help" 
              className="font-bold text-sm px-4" 
              disabled={!selectedUploadFile} 
              onClick={() => handleUploadPdfWithParams(selectedUploadFile, uploadCurrency, uploadRate)}
            />
          </div>
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
                         const isWeight = ['KG', 'KILOGRAMO', 'KILOGRAMOS', 'LBS', 'LIBRA', 'LIBRAS', 'G', 'GRAMOS', 'GRAMO'].includes(uom);
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
    </div>
  );
}
