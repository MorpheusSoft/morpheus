"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Dropdown } from 'primereact/dropdown';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Checkbox } from 'primereact/checkbox';
import { Tag } from 'primereact/tag';
import { SelectButton } from 'primereact/selectbutton';
import api from '@/lib/api';
import { isWeightUom, sanitizeQuantity, preventDecimalKey } from '@/lib/uom';

export default function NewOrderPage() {
  const router = useRouter();
  const toast = useRef<Toast>(null);
  
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [globalVariants, setGlobalVariants] = useState<any[]>([]);
  
  const [searchMode, setSearchMode] = useState<'CATALOG' | 'GLOBAL'>('CATALOG');
  const searchModeOptions = [
      { label: 'Catálogo Privado', value: 'CATALOG' },
      { label: 'Maestro Global', value: 'GLOBAL' }
  ];
  
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedPackId, setSelectedPackId] = useState<number | null>(null);

  const mapPackagings = (packagings: any[]) => [
      { id: null, name: 'Und. Base', qty_per_unit: 1, label: 'Unidad Base (x1)' },
      ...(packagings || []).map((pk: any) => ({
          id: pk.id,
          name: pk.name,
          qty_per_unit: Number(pk.qty_per_unit),
          label: `${pk.name} (x${pk.qty_per_unit})`
      }))
  ];
  
  const [categories, setCategories] = useState<any[]>([]);
  const [currencies, setCurrencies] = useState<any[]>([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
      name: '',
      category_id: null,
      brand: '',
      currency_id: null,
      unit_cost: 0
  });
  
  const [lines, setLines] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // Selección Masiva de Catálogo Privado
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchSearchText, setBatchSearchText] = useState('');
  const [batchCategoryFilter, setBatchCategoryFilter] = useState<string | null>(null);
  const [batchState, setBatchState] = useState<Record<number, { selected: boolean; qty: number | string; pack_id: number | null }>>({});
  const [batchSortField, setBatchSortField] = useState<string>('product_name');
  const [batchSortOrder, setBatchSortOrder] = useState<'asc' | 'desc'>('asc');

  // Pegado desde Excel / Portapapeles
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteRawText, setPasteRawText] = useState('');
  const [pasteResults, setPasteResults] = useState<{ matched: any[]; unmatched: string[] } | null>(null);

  // Filtro en vivo en la matriz de la orden
  const [filterLinesText, setFilterLinesText] = useState('');

  useEffect(() => {
    api.get('/suppliers/?limit=5000')
      .then(res => setSuppliers((res.data.data || res.data.items || res.data || []).filter((s: any) => s.is_active)))
      .catch(err => console.error(err));
      
    api.get('/products/?limit=50')
      .then(res => {
          const variants: any[] = [];
          const productsList = res.data.data || res.data.items || (Array.isArray(res.data) ? res.data : []);
          productsList.forEach((p: any) => {
              if (p.variants) {
                  const pPacks = mapPackagings(p.packagings);
                  p.variants.forEach((v: any) => {
                      variants.push({
                          variant_id: v.id,
                          variant_sku: v.sku,
                          product_name: p.name,
                          uom_base: p.uom_base || 'UND',
                          pack_id: null,
                          pack_name: 'Und. Base',
                          qty_per_unit: 1,
                          replacement_cost: v.replacement_cost || p.replacement_cost || 0,
                          display_name: `[GLOBAL] ${v.sku || ''} - ${p.name} - $${v.replacement_cost || p.replacement_cost || 0}`,
                          available_packagings: pPacks
                      });
                  });
              }
          });
          setGlobalVariants(variants);
      })
      .catch(err => console.error(err));
      
    api.get('/facilities/?limit=1000')
      .then(res => setFacilities(res.data.data || res.data.items || (Array.isArray(res.data) ? res.data : [])))
      .catch(err => console.error(err));
      
    api.get('/categories/?limit=1000')
      .then(res => setCategories(res.data.data || res.data.items || (Array.isArray(res.data) ? res.data : [])))
      .catch(err => console.error(err));
      
    api.get('/currencies/')
      .then(res => {
          const list = res.data.data || res.data.items || (Array.isArray(res.data) ? res.data : []);
          setCurrencies(list);
          let usd = list.find((c: any) => c.code === 'USD');
          if (usd) {
              setNewProductForm(prev => ({ ...prev, currency_id: usd.id }));
          }
      })
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (selectedSupplierId) {
      api.get(`/suppliers/${selectedSupplierId}/catalog`)
        .then(res => {
            const mappedCatalog = res.data.map((opt: any) => ({
                ...opt,
                uom_base: opt.uom_base || 'UND',
                display_name: `${opt.variant_sku || ''} - ${opt.product_name} - $${opt.replacement_cost}`,
                available_packagings: mapPackagings(opt.packagings)
            }));
            setCatalog(mappedCatalog);
        })
        .catch(err => {
             toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el catálogo del proveedor.' });
             setCatalog([]);
        });
        
      const supplier = suppliers.find(s => s.id === selectedSupplierId);
      if (supplier && supplier.default_facility_id) {
          setSelectedFacilityId(supplier.default_facility_id);
      } else {
          setSelectedFacilityId(null);
      }
      
      // Reseteamos las líneas porque son de otro proveedor
      setLines([]);
    } else {
      setCatalog([]);
      setLines([]);
    }
  }, [selectedSupplierId]); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadCatalog = async () => {
       if(!selectedSupplierId) return;
       try {
           const res = await api.get(`/suppliers/${selectedSupplierId}/catalog`);
           const mappedCatalog = res.data.map((opt: any) => ({
                ...opt,
                uom_base: opt.uom_base || 'UND',
                display_name: `${opt.variant_sku || ''} - ${opt.product_name} - $${opt.replacement_cost}`,
                available_packagings: mapPackagings(opt.packagings)
           }));
           setCatalog(mappedCatalog);
           return mappedCatalog;
       } catch (e) {
           console.error(e);
       }
   };

  const filterTimeoutRef = useRef<any>(null);
  const handleDropdownFilter = (e: any) => {
      const filterText = e.filter || '';
      if (searchMode === 'GLOBAL') {
          if (filterTimeoutRef.current) clearTimeout(filterTimeoutRef.current);
          filterTimeoutRef.current = setTimeout(() => {
              const query = filterText.trim();
              const url = query.length >= 2 ? `/products/?q=${encodeURIComponent(query)}&limit=50` : '/products/?limit=50';
              api.get(url)
                  .then(res => {
                      const variants: any[] = [];
                      const productsList = res.data.data || res.data.items || (Array.isArray(res.data) ? res.data : []);
                      productsList.forEach((p: any) => {
                          if (p.variants) {
                              const pPacks = mapPackagings(p.packagings);
                              p.variants.forEach((v: any) => {
                                  variants.push({
                                      variant_id: v.id,
                                      variant_sku: v.sku,
                                      product_name: p.name,
                                      uom_base: p.uom_base || 'UND',
                                      pack_id: null,
                                      pack_name: 'Und. Base',
                                      qty_per_unit: 1,
                                      replacement_cost: v.replacement_cost || p.replacement_cost || 0,
                                      display_name: `[GLOBAL] ${v.sku || ''} - ${p.name} - $${v.replacement_cost || p.replacement_cost || 0}`,
                                      available_packagings: pPacks
                                  });
                              });
                          }
                      });
                      setGlobalVariants(variants);
                  })
                  .catch(err => console.error(err));
          }, 300);
      }
  };

  const handleCreateFastProduct = async () => {
      if (!newProductForm.name || !newProductForm.category_id || !newProductForm.currency_id) {
          toast.current?.show({ severity: 'warn', summary: 'Campos Obligatorios', detail: 'Nombre, Categoría y Moneda son requeridos.' });
          return;
      }
      setCreatingProduct(true);
      try {
          const productPayload = {
              name: newProductForm.name,
              category_id: newProductForm.category_id,
              brand: newProductForm.brand || 'Genérica',
              currency_id: newProductForm.currency_id,
              has_variants: false,
              is_active: true
          };
          const prodRes = await api.post('/products/', productPayload);
          const newProduct = prodRes.data;
          const defaultVariant = newProduct.variants && newProduct.variants.length > 0 ? newProduct.variants[0] : null;

          if (!defaultVariant) {
              throw new Error("No se generó la variante por defecto.");
          }

          const suppPayload = {
              supplier_id: selectedSupplierId,
              variant_id: defaultVariant.id,
              currency_id: newProductForm.currency_id,
              replacement_cost: newProductForm.unit_cost,
              min_order_qty: 1,
              is_active: true
          };
          await api.post(`/suppliers/${selectedSupplierId}/catalog`, suppPayload);

          toast.current?.show({ severity: 'success', summary: 'Magia', detail: 'Insumo creado y enlazado al proveedor.' });
          
          const updatedCatalog = await reloadCatalog();
          if (updatedCatalog) {
              const matched = updatedCatalog.find((c: any) => c.variant_id === defaultVariant.id);
              if (matched) setSelectedProduct(matched);
          }
          
          setShowProductModal(false);
          setNewProductForm({ name: '', category_id: null, brand: '', currency_id: newProductForm.currency_id, unit_cost: 0 });
      } catch (e: any) {
          toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'Fallo la creación rápida.' });
      }
      setCreatingProduct(false);
  };

  const addLine = () => {
    if (!selectedProduct) return;
    
    const chosenPack = (selectedProduct.available_packagings || []).find((p: any) => p.id === selectedPackId) 
        || { id: null, name: 'Und. Base', qty_per_unit: 1, label: 'Unidad Base (x1)' };
        
    if (lines.some(l => l.variant_id === selectedProduct.variant_id && l.pack_id === chosenPack.id)) {
        toast.current?.show({ severity: 'warn', summary: 'Aviso', detail: 'Este insumo con esta presentación ya está en la orden.' });
        return;
    }
    
    const qty_per_unit = Number(chosenPack.qty_per_unit) || 1;
    const initial_qty = 1;
    const replacement_cost = parseFloat(selectedProduct.replacement_cost) || 0;
    const initial_pack_cost = Number((replacement_cost * qty_per_unit).toFixed(4));
    
    const newLine = {
        internal_id: Math.random().toString(),
        variant_id: selectedProduct.variant_id,
        sku: selectedProduct.variant_sku || 'N/A',
        product_name: selectedProduct.product_name,
        uom_base: selectedProduct.uom_base || 'UND',
        pack_id: chosenPack.id,
        pack_name: chosenPack.name || 'Und. Base',
        qty_per_pack: qty_per_unit,
        qty_ordered: initial_qty,
        unit_cost: replacement_cost,
        pack_cost: initial_pack_cost,
        expected_base_qty: qty_per_unit * initial_qty,
        subtotal: replacement_cost * qty_per_unit * initial_qty,
        available_packagings: selectedProduct.available_packagings || [chosenPack]
    };
    
    setLines([...lines, newLine]);
    setSelectedProduct(null);
    setSelectedPackId(null);
  };

  const handlePresentationChange = (internalId: string, newPackId: number | null) => {
      setLines(prev => prev.map(row => {
          if (row.internal_id !== internalId) return row;
          const pack = (row.available_packagings || []).find((p: any) => p.id === newPackId)
              || { id: null, name: 'Und. Base', qty_per_unit: 1 };
          const factor = Number(pack.qty_per_unit) || 1;
          const expected_base = (row.qty_ordered || 1) * factor;
          const pack_cost = Number(((row.unit_cost || 0) * factor).toFixed(4));
          return {
              ...row,
              pack_id: newPackId,
              pack_name: pack.name || 'Und. Base',
              qty_per_pack: factor,
              expected_base_qty: expected_base,
              pack_cost: pack_cost,
              subtotal: expected_base * (row.unit_cost || 0)
          };
      }));
  };

  const removeLine = (internalId: string) => {
      setLines(prev => prev.filter(row => row.internal_id !== internalId));
  };

  const handleQtyChange = (internalId: string, newQty: number) => {
      setLines(prev => prev.map(row => {
          if (row.internal_id !== internalId) return row;
          const isPack = (row.qty_per_pack || 1) > 1;
          const cleanQty = sanitizeQuantity(newQty, row.uom_base, isPack);
          const factor = (row.qty_per_pack && row.qty_per_pack > 0) ? row.qty_per_pack : 1;
          const expected_base = cleanQty * factor;
          return {
              ...row,
              qty_ordered: cleanQty,
              expected_base_qty: expected_base,
              subtotal: expected_base * (row.unit_cost || 0)
          };
      }));
  };
  
  const handlePackCostChange = (internalId: string, newPackCost: number) => {
      setLines(prev => prev.map(row => {
          if (row.internal_id !== internalId) return row;
          const pCost = isNaN(newPackCost) || newPackCost < 0 ? 0 : newPackCost;
          const factor = (row.qty_per_pack && row.qty_per_pack > 0) ? row.qty_per_pack : 1;
          const uCost = pCost / factor;
          const expected_base = row.expected_base_qty || (row.qty_ordered * factor);
          return {
              ...row,
              pack_cost: pCost,
              unit_cost: uCost,
              subtotal: expected_base * uCost
          };
      }));
  };

  const handleUnitCostChange = (internalId: string, newUnitCost: number) => {
      setLines(prev => prev.map(row => {
          if (row.internal_id !== internalId) return row;
          const uCost = isNaN(newUnitCost) || newUnitCost < 0 ? 0 : newUnitCost;
          const factor = (row.qty_per_pack && row.qty_per_pack > 0) ? row.qty_per_pack : 1;
          const expected_base = row.expected_base_qty || (row.qty_ordered * factor);
          return {
              ...row,
              unit_cost: uCost,
              pack_cost: uCost * factor,
              subtotal: expected_base * uCost
          };
      }));
  };

  const calculateTotal = () => {
      return lines.reduce((acc, row) => acc + parseFloat(row.subtotal || 0), 0);
  };

  // --- LÓGICA DE SELECCIÓN MASIVA (MODAL DE CATÁLOGO) ---

  const openBatchModal = () => {
    if (!selectedSupplierId || catalog.length === 0) {
      toast.current?.show({ severity: 'warn', summary: 'Aviso', detail: 'Seleccione primero un proveedor con catálogo disponible.' });
      return;
    }
    const initialBatch: Record<number, { selected: boolean; qty: number | string; pack_id: number | null }> = {};
    catalog.forEach(item => {
      const existingLine = lines.find(l => l.variant_id === item.variant_id);
      if (existingLine) {
        initialBatch[item.variant_id] = {
          selected: true,
          qty: existingLine.qty_ordered,
          pack_id: existingLine.pack_id
        };
      } else {
        initialBatch[item.variant_id] = {
          selected: false,
          qty: '',
          pack_id: item.pack_id || null
        };
      }
    });
    setBatchState(initialBatch);
    setBatchSearchText('');
    setBatchCategoryFilter(null);
    setBatchSortField('product_name');
    setBatchSortOrder('asc');
    setShowBatchModal(true);
  };

  // Auto-enfocar el primer renglón al abrir el modal para digitación 100% por teclado
  useEffect(() => {
    if (showBatchModal) {
      const timer = setTimeout(() => {
        const firstInput = document.getElementById('batch-qty-0');
        if (firstInput) {
          firstInput.focus();
          (firstInput as HTMLInputElement).select?.();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [showBatchModal]);

  const catalogCategories = useMemo(() => {
    const catsMap = new Map<string, { label: string; value: string | null }>();
    catsMap.set('ALL', { label: 'Todas las Categorías', value: null });
    catalog.forEach(item => {
      const cat = item.category_name || 'Sin Categoría';
      if (!catsMap.has(cat)) {
        catsMap.set(cat, { label: cat, value: cat });
      }
    });
    return Array.from(catsMap.values());
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    return catalog.filter(item => {
      if (batchCategoryFilter && item.category_name !== batchCategoryFilter) {
        return false;
      }
      if (!batchSearchText.trim()) return true;
      const q = batchSearchText.toLowerCase();
      return (
        (item.variant_sku && item.variant_sku.toLowerCase().includes(q)) ||
        (item.product_name && item.product_name.toLowerCase().includes(q)) ||
        (item.barcode && item.barcode.toLowerCase().includes(q)) ||
        (item.brand && item.brand.toLowerCase().includes(q)) ||
        (item.category_name && item.category_name.toLowerCase().includes(q))
      );
    });
  }, [catalog, batchCategoryFilter, batchSearchText]);

  const sortedAndFilteredCatalog = useMemo(() => {
    let list = filteredCatalog.slice();
    if (batchSortField) {
      list.sort((a, b) => {
        let valA: any = a[batchSortField] ?? '';
        let valB: any = b[batchSortField] ?? '';

        if (batchSortField === 'replacement_cost') {
          valA = parseFloat(valA) || 0;
          valB = parseFloat(valB) || 0;
        } else if (typeof valA === 'string') {
          valA = valA.toLowerCase();
          valB = (valB || '').toString().toLowerCase();
        }

        if (valA < valB) return batchSortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return batchSortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [filteredCatalog, batchSortField, batchSortOrder]);

  const handleBatchSort = (field: string) => {
    if (batchSortField === field) {
      setBatchSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setBatchSortField(field);
      setBatchSortOrder('asc');
    }
  };

  const toggleBatchSelect = (item: any, checked: boolean, rowIndex?: number) => {
    setBatchState(prev => {
      const current = prev[item.variant_id] || { selected: false, qty: '', pack_id: item.pack_id || null };
      if (checked) {
        const currentQtyNum = parseFloat(String(current.qty)) || 0;
        return {
          ...prev,
          [item.variant_id]: {
            ...current,
            selected: true,
            qty: currentQtyNum > 0 ? current.qty : 1
          }
        };
      } else {
        return {
          ...prev,
          [item.variant_id]: {
            ...current,
            selected: false,
            qty: ''
          }
        };
      }
    });

    if (checked && rowIndex !== undefined) {
      setTimeout(() => {
        const input = document.getElementById(`batch-qty-${rowIndex}`);
        if (input) {
          input.focus();
          (input as HTMLInputElement).select?.();
        }
      }, 50);
    }
  };

  const updateBatchQty = (item: any, rawVal: string) => {
    const num = parseFloat(rawVal);
    const isValidPositive = !isNaN(num) && num > 0;

    setBatchState(prev => {
      const current = prev[item.variant_id] || { selected: false, qty: '', pack_id: item.pack_id || null };
      return {
        ...prev,
        [item.variant_id]: {
          ...current,
          qty: rawVal,
          selected: isValidPositive
        }
      };
    });
  };

  const updateBatchPack = (variantId: number, packId: number | null) => {
    setBatchState(prev => {
      const current = prev[variantId] || { selected: false, qty: '', pack_id: null };
      return {
        ...prev,
        [variantId]: {
          ...current,
          pack_id: packId
        }
      };
    });
  };

  const handleSelectAllFiltered = (markAll: boolean) => {
    setBatchState(prev => {
      const updated = { ...prev };
      sortedAndFilteredCatalog.forEach(item => {
        const current = updated[item.variant_id] || { selected: false, qty: '', pack_id: item.pack_id || null };
        const currentQty = parseFloat(String(current.qty)) || 0;
        updated[item.variant_id] = {
          ...current,
          selected: markAll,
          qty: markAll ? (currentQty > 0 ? current.qty : 1) : ''
        };
      });
      return updated;
    });
  };

  const handleBatchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextInput = document.getElementById(`batch-qty-${rowIndex + 1}`);
      if (nextInput) {
        nextInput.focus();
        (nextInput as HTMLInputElement).select?.();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevInput = document.getElementById(`batch-qty-${rowIndex - 1}`);
      if (prevInput) {
        prevInput.focus();
        (prevInput as HTMLInputElement).select?.();
      }
    }
  };

  const batchSelectedSummary = useMemo(() => {
    let count = 0;
    let units = 0;
    let estimatedTotal = 0;

    catalog.forEach(item => {
      const state = batchState[item.variant_id];
      const qtyNum = parseFloat(String(state?.qty)) || 0;
      if (state && state.selected && qtyNum > 0) {
        count++;
        const pk = (item.available_packagings || []).find((p: any) => p.id === state.pack_id) || { qty_per_unit: 1 };
        const factor = Number(pk.qty_per_unit) || 1;
        const lineUnits = qtyNum * factor;
        units += lineUnits;
        estimatedTotal += lineUnits * (parseFloat(item.replacement_cost) || 0);
      }
    });

    return { count, units, estimatedTotal };
  }, [catalog, batchState]);

  const applyBatchToOrder = () => {
    const selectedItems = catalog.filter(item => {
      const state = batchState[item.variant_id];
      const qtyNum = parseFloat(String(state?.qty)) || 0;
      return state && state.selected && qtyNum > 0;
    });

    if (selectedItems.length === 0) {
      toast.current?.show({ severity: 'warn', summary: 'Sin Selección', detail: 'Debe seleccionar productos con cantidad mayor a 0.' });
      return;
    }

    setLines(prevLines => {
      const newLinesMap = new Map<string, any>();
      prevLines.forEach(l => {
        newLinesMap.set(`${l.variant_id}_${l.pack_id}`, l);
      });

      selectedItems.forEach(item => {
        const state = batchState[item.variant_id];
        const chosenPack = (item.available_packagings || []).find((p: any) => p.id === state.pack_id)
          || { id: null, name: 'Und. Base', qty_per_unit: 1, label: 'Unidad Base (x1)' };
        const key = `${item.variant_id}_${chosenPack.id}`;
        const qty_per_unit = Number(chosenPack.qty_per_unit) || 1;
        const isPack = qty_per_unit > 1;
        const rawQty = parseFloat(String(state.qty)) || 1;
        const qtyNum = sanitizeQuantity(rawQty, item.uom_base, isPack);
        const replacement_cost = parseFloat(item.replacement_cost) || 0;
        const pack_cost = Number((replacement_cost * qty_per_unit).toFixed(4));

        newLinesMap.set(key, {
          internal_id: newLinesMap.get(key)?.internal_id || Math.random().toString(),
          variant_id: item.variant_id,
          sku: item.variant_sku || 'N/A',
          product_name: item.product_name,
          uom_base: item.uom_base || 'UND',
          pack_id: chosenPack.id,
          pack_name: chosenPack.name || 'Und. Base',
          qty_per_pack: qty_per_unit,
          qty_ordered: qtyNum,
          unit_cost: replacement_cost,
          pack_cost: pack_cost,
          expected_base_qty: qty_per_unit * qtyNum,
          subtotal: replacement_cost * qty_per_unit * qtyNum,
          available_packagings: item.available_packagings || [chosenPack]
        });
      });

      return Array.from(newLinesMap.values());
    });

    toast.current?.show({ 
      severity: 'success', 
      summary: 'Productos Incorporados', 
      detail: `Se añadieron o actualizaron ${selectedItems.length} productos a la orden.` 
    });
    setShowBatchModal(false);
  };

  // --- CARGAR TODO EL CATÁLOGO ---
  const handleLoadEntireCatalog = () => {
    if (!selectedSupplierId || catalog.length === 0) return;
    if (lines.length > 0) {
      if (!confirm(`¿Desea cargar los ${catalog.length} productos del catálogo a la orden? Los renglones ya existentes se mantendrán.`)) {
        return;
      }
    }
    setLines(prevLines => {
      const newLinesMap = new Map<string, any>();
      prevLines.forEach(l => {
        newLinesMap.set(`${l.variant_id}_${l.pack_id}`, l);
      });

      catalog.forEach(item => {
        const pack = (item.available_packagings || [])[0] || { id: null, name: 'Und. Base', qty_per_unit: 1 };
        const key = `${item.variant_id}_${pack.id}`;
        if (!newLinesMap.has(key)) {
          const qty_per_unit = Number(pack.qty_per_unit) || 1;
          const replacement_cost = parseFloat(item.replacement_cost) || 0;
          newLinesMap.set(key, {
            internal_id: Math.random().toString(),
            variant_id: item.variant_id,
            sku: item.variant_sku || 'N/A',
            product_name: item.product_name,
            pack_id: pack.id,
            pack_name: pack.name || 'Und. Base',
            qty_per_pack: qty_per_unit,
            qty_ordered: 0,
            unit_cost: replacement_cost,
            pack_cost: Number((replacement_cost * qty_per_unit).toFixed(4)),
            expected_base_qty: 0,
            subtotal: 0,
            available_packagings: item.available_packagings || [pack]
          });
        }
      });

      return Array.from(newLinesMap.values());
    });

    toast.current?.show({
      severity: 'info',
      summary: 'Catálogo Completo Cargado',
      detail: `Se cargaron los ${catalog.length} productos con cantidad 0 para tipeo directo.`
    });
  };

  // --- LIMPIAR LÍNEAS EN CERO ---
  const handlePruneZeroLines = () => {
    const beforeCount = lines.length;
    const active = lines.filter(l => (Number(l.qty_ordered) || 0) > 0);
    const removedCount = beforeCount - active.length;
    setLines(active);
    toast.current?.show({
      severity: 'info',
      summary: 'Líneas Depuradas',
      detail: `Se descartaron ${removedCount} renglones con cantidad 0.`
    });
  };

  const handleClearAllLines = () => {
    if (confirm('¿Está seguro de vaciar todos los renglones de la orden actual?')) {
      setLines([]);
    }
  };

  // --- PEGADO DESDE EXCEL / PORTAPAPELES ---
  const handleProcessPasteText = () => {
    if (!pasteRawText.trim()) return;
    const rawLines = pasteRawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const matched: any[] = [];
    const unmatched: string[] = [];

    rawLines.forEach(rawLine => {
      const parts = rawLine.split(/\t|;|,|\s{2,}/).map(p => p.trim()).filter(Boolean);
      if (parts.length === 0) return;
      const code = parts[0];
      const rawQty = parts.length > 1 ? parts[parts.length - 1] : "1";
      const qty = parseFloat(rawQty.replace(',', '.')) || 1;

      const found = catalog.find(item => 
        (item.variant_sku && item.variant_sku.toLowerCase() === code.toLowerCase()) ||
        (item.barcode && item.barcode.toLowerCase() === code.toLowerCase()) ||
        (item.supplier_sku && item.supplier_sku.toLowerCase() === code.toLowerCase())
      );

      if (found) {
        const pack = (found.available_packagings || [])[0] || { id: null, name: 'Und. Base', qty_per_unit: 1 };
        const qty_per_unit = Number(pack.qty_per_unit) || 1;
        const isPack = qty_per_unit > 1;
        const cleanQty = sanitizeQuantity(qty, found.uom_base, isPack);
        const replacement_cost = parseFloat(found.replacement_cost) || 0;
        matched.push({
          item: found,
          pack: pack,
          qty: cleanQty,
          qty_per_unit: qty_per_unit,
          replacement_cost: replacement_cost,
          subtotal: replacement_cost * qty_per_unit * cleanQty
        });
      } else {
        unmatched.push(rawLine);
      }
    });

    setPasteResults({ matched, unmatched });
  };

  const handleApplyPasteToOrder = () => {
    if (!pasteResults || pasteResults.matched.length === 0) return;
    setLines(prevLines => {
      const newLinesMap = new Map<string, any>();
      prevLines.forEach(l => {
        newLinesMap.set(`${l.variant_id}_${l.pack_id}`, l);
      });

      pasteResults.matched.forEach(({ item, pack, qty, qty_per_unit, replacement_cost }) => {
        const key = `${item.variant_id}_${pack.id}`;
        newLinesMap.set(key, {
          internal_id: newLinesMap.get(key)?.internal_id || Math.random().toString(),
          variant_id: item.variant_id,
          sku: item.variant_sku || 'N/A',
          product_name: item.product_name,
          uom_base: item.uom_base || 'UND',
          pack_id: pack.id,
          pack_name: pack.name || 'Und. Base',
          qty_per_pack: qty_per_unit,
          qty_ordered: qty,
          unit_cost: replacement_cost,
          pack_cost: Number((replacement_cost * qty_per_unit).toFixed(4)),
          expected_base_qty: qty_per_unit * qty,
          subtotal: replacement_cost * qty_per_unit * qty,
          available_packagings: item.available_packagings || [pack]
        });
      });

      return Array.from(newLinesMap.values());
    });

    toast.current?.show({
      severity: 'success',
      summary: 'Importación Exitosa',
      detail: `Se incorporaron ${pasteResults.matched.length} productos desde el portapapeles.`
    });
    setShowPasteModal(false);
    setPasteRawText('');
    setPasteResults(null);
  };

  // --- LÍNEAS VISIBLES EN LA MATRIZ PRINCIPAL (CON FILTRO EN VIVO) ---
  const visibleLines = useMemo(() => {
    if (!filterLinesText.trim()) return lines;
    const q = filterLinesText.toLowerCase();
    return lines.filter(l =>
      (l.sku && l.sku.toLowerCase().includes(q)) ||
      (l.product_name && l.product_name.toLowerCase().includes(q)) ||
      (l.pack_name && l.pack_name.toLowerCase().includes(q))
    );
  }, [lines, filterLinesText]);

  // --- GUARDAR ORDEN (DRAFT) ---
  const createDraft = async () => {
      if (!selectedSupplierId) {
          toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Debe seleccionar un proveedor.' });
          return;
      }
      const validLines = lines.filter(l => (Number(l.qty_ordered) || 0) > 0);
      if (validLines.length === 0) {
          toast.current?.show({ severity: 'error', summary: 'Error', detail: 'La orden debe tener al menos un renglón con cantidad mayor a 0.' });
          return;
      }
      
      setSaving(true);
      try {
          const payload = {
              supplier_id: selectedSupplierId,
              dest_facility_id: selectedFacilityId,
              lines: validLines.map(l => ({
                  variant_id: l.variant_id,
                  pack_id: l.pack_id,
                  qty_ordered: l.qty_ordered,
                  expected_base_qty: l.expected_base_qty,
                  unit_cost: l.unit_cost
              }))
          };
          const res = await api.post('/purchase-orders/', payload);
          toast.current?.show({ severity: 'success', summary: 'Draft Creado', detail: 'Se ha creado la Orden.', life: 3000 });
          
          setTimeout(() => {
              router.push('/orders/' + res.data.id);
          }, 1500);
      } catch(e: any) {
          console.error('Error creating draft order:', e);
          const errMsg = e.response?.data?.detail || e.message || 'No se pudo crear el borrador.';
          toast.current?.show({ severity: 'error', summary: 'Fallo', detail: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) });
          setSaving(false);
      }
  };

  return (
    <div className="p-4 sm:p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />
      
      {/* HEADER EJECUTIVO */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500"></div>
          <div>
              <div className="flex items-center gap-3 mb-1">
                 <Button icon="pi pi-arrow-left" rounded text aria-label="Volver" onClick={() => router.push('/orders')} />
                 <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">Crear Orden Manual</h1>
              </div>
              <p className="text-slate-500 ml-12 text-xs sm:text-sm mt-1 sm:mt-2">
                 Construya una Orden de Compra física (DRAFT) sin pasar por el simulador MRP.
              </p>
          </div>
          
          <div className="flex flex-col items-start sm:items-end bg-slate-50 p-4 rounded-xl border border-slate-100 w-full lg:w-auto shrink-0 min-w-[200px]">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Estimado</span>
              <span className="text-3xl sm:text-4xl font-black text-indigo-600 block leading-none">
                 <span className="text-xl text-indigo-400 mr-1">$</span>
                 {calculateTotal().toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </span>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-2">
             <label className="text-sm font-bold text-slate-700 uppercase tracking-wide">1. Proveedor Origen</label>
             <Dropdown 
                value={selectedSupplierId} 
                onChange={(e) => setSelectedSupplierId(e.value)} 
                options={suppliers} 
                optionLabel="name" 
                optionValue="id" 
                placeholder="Seleccione un Proveedor" 
                filter
                virtualScrollerOptions={{ itemSize: 38 }}
                className="w-full border-2 border-slate-200 rounded-xl" 
             />
          </div>
          
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-2">
             <label className="text-sm font-bold text-slate-700 uppercase tracking-wide">2. Destino Logístico (Opcional)</label>
             <Dropdown 
                value={selectedFacilityId} 
                onChange={(e) => setSelectedFacilityId(e.value)} 
                options={facilities} 
                optionLabel="name" 
                optionValue="id" 
                placeholder="Centro de Despacho" 
                filter
                showClear
                className="w-full border-2 border-slate-200 rounded-xl" 
             />
          </div>
      </div>

      {/* Barra de Herramientas de Productividad Comercial para Catálogo Privado */}
      {searchMode === 'CATALOG' && selectedSupplierId && (
        <div className="bg-gradient-to-r from-indigo-50/90 via-blue-50/70 to-slate-50 p-4 rounded-2xl shadow-sm border border-indigo-100 mb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/20">
                <i className="pi pi-box text-lg"></i>
             </div>
             <div>
                <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider block">Catálogo del Proveedor</span>
                <span className="text-sm text-slate-600">
                  <strong>{catalog.length}</strong> productos disponibles para transcripción rápida
                </span>
             </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
             <Button 
                label="Selección Masiva" 
                icon="pi pi-th-large" 
                onClick={openBatchModal}
                disabled={catalog.length === 0}
                className="font-bold bg-indigo-600 hover:bg-indigo-700 text-white border-none rounded-xl px-4 py-2.5 text-xs shadow-md shadow-indigo-500/20"
             />
             <Button 
                label="Pegar desde Excel" 
                icon="pi pi-file-excel" 
                onClick={() => { setPasteRawText(''); setPasteResults(null); setShowPasteModal(true); }}
                disabled={catalog.length === 0}
                className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white border-none rounded-xl px-4 py-2.5 text-xs shadow-md shadow-emerald-500/20"
             />
             <Button 
                label="Cargar Catálogo Completo" 
                icon="pi pi-download" 
                onClick={handleLoadEntireCatalog}
                disabled={catalog.length === 0}
                className="font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl px-4 py-2.5 text-xs shadow-sm"
             />
          </div>
        </div>
      )}

      {/* Selector de Catálogo Individual / Maestro Global */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col items-start gap-4">
          <div className="w-full overflow-x-auto pb-1">
             <SelectButton value={searchMode} onChange={(e) => { if(e.value) setSearchMode(e.value) }} options={searchModeOptions} optionLabel="label" />
          </div>
          
          <div className="w-full flex flex-col xl:flex-row items-stretch xl:items-center gap-3">
            <div className="flex-1 w-full flex items-center gap-2 min-w-0">
              <Dropdown 
                  value={selectedProduct} 
                  onChange={(e) => {
                      setSelectedProduct(e.value);
                      setSelectedPackId(null);
                  }} 
                  options={searchMode === 'CATALOG' ? catalog : globalVariants} 
                  optionLabel="display_name"
                  placeholder={
                      searchMode === 'CATALOG' 
                      ? (selectedSupplierId ? "Buscar producto puntual en catálogo privado..." : "Seleccione primero un proveedor") 
                      : "Buscar en todo el Maestro Global de Inventario..."
                  }
                  filter
                  onFilter={handleDropdownFilter}
                  virtualScrollerOptions={{ itemSize: 38 }}
                  disabled={searchMode === 'CATALOG' && (!selectedSupplierId || catalog.length === 0)}
                  className="w-full border-2 rounded-xl"
                  emptyMessage="No hay productos disponibles."
                  emptyFilterMessage="No se encontraron productos."
              />
            {selectedSupplierId && (
                <Button 
                    icon="pi pi-bolt" 
                    tooltip="Alta Rápida de Insumo Cero-Fricción"
                    tooltipOptions={{ position: 'top' }}
                    className="p-button-rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none shrink-0 w-11 h-11" 
                    onClick={() => setShowProductModal(true)} 
                />
            )}
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full xl:w-auto shrink-0 justify-end">
            {selectedProduct && selectedProduct.available_packagings && selectedProduct.available_packagings.length > 1 && (
               <div className="flex items-center gap-2 bg-indigo-50/70 px-3 py-2 rounded-xl border border-indigo-200 w-full sm:w-auto justify-between sm:justify-start">
                  <span className="text-xs font-bold text-indigo-700 uppercase whitespace-nowrap">Presentación:</span>
                  <Dropdown
                     value={selectedPackId}
                     onChange={(e) => setSelectedPackId(e.value)}
                     options={selectedProduct.available_packagings}
                     optionLabel="label"
                     optionValue="id"
                     placeholder="Presentación"
                     className="w-full sm:w-48 p-inputtext-sm text-xs font-bold border-indigo-300 bg-white text-indigo-900 rounded-lg shadow-sm"
                  />
               </div>
            )}

            <Button label="Añadir a Orden" icon="pi pi-plus" onClick={addLine} disabled={!selectedProduct} className="w-full sm:w-auto font-bold bg-indigo-600 hover:bg-indigo-700 border-none rounded-xl px-5 py-3 text-sm justify-center whitespace-nowrap shadow-md shadow-indigo-500/20" />
            </div>
          </div>
      </div>

      {/* DIALOG 1: CREADOR FAST-TRACK */}
      <Dialog 
         header={<div className="flex items-center gap-2 text-xl font-black text-slate-800"><i className="pi pi-bolt text-emerald-500"></i> Creador Fast-Track</div>} 
         visible={showProductModal} 
         style={{ width: '40vw', minWidth: '320px' }} 
         breakpoints={{ '1200px': '55vw', '960px': '75vw', '640px': '95vw' }}
         onHide={() => setShowProductModal(false)} 
         className="rounded-2xl overflow-hidden"
      >
         <div className="p-2 flex flex-col gap-4 mt-2">
            <p className="text-slate-500 text-sm mb-2">Crearás un producto real en el Maestro y se anclará automáticamente a este Proveedor.</p>
            
            <div className="flex flex-col gap-1">
                <label className="text-sm font-bold text-slate-700">Nombre del Insumo *</label>
                <InputText value={newProductForm.name} onChange={(e) => setNewProductForm({...newProductForm, name: e.target.value})} placeholder="Ej. Harina de Trigo 50kg" className="w-full p-3 border-2 rounded-xl" />
            </div>
            
            <div className="flex flex-col gap-1">
                <label className="text-sm font-bold text-slate-700">Categoría *</label>
                <Dropdown value={newProductForm.category_id} onChange={(e) => setNewProductForm({...newProductForm, category_id: e.value})} options={categories} optionLabel="name" optionValue="id" placeholder="Seleccione Categoría Maestra" filter className="w-full border-2 rounded-xl" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                    <label className="text-sm font-bold text-slate-700">Marca / Fabricante</label>
                    <InputText value={newProductForm.brand} onChange={(e) => setNewProductForm({...newProductForm, brand: e.target.value})} placeholder="Opcional" className="w-full p-3 border-2 rounded-xl" />
                </div>
                
                <div className="flex flex-col gap-1">
                    <label className="text-sm font-bold text-slate-700">Costo Base Negociado *</label>
                    <div className="p-inputgroup border-2 rounded-xl overflow-hidden">
                        <span className="p-inputgroup-addon bg-slate-50 border-none text-slate-500 font-bold">$</span>
                        <input type="number" step="0.01" value={newProductForm.unit_cost} onChange={(e) => setNewProductForm({...newProductForm, unit_cost: parseFloat(e.target.value)})} placeholder="0.00" className="w-full p-3 border-none outline-none" />
                    </div>
                </div>
            </div>
            
            <div className="mt-4 flex justify-end gap-3">
                <Button label="Cancelar" icon="pi pi-times" onClick={() => setShowProductModal(false)} className="p-button-text text-slate-500 font-bold" />
                <Button label="Crear y Cargar a ODC" icon="pi pi-check" loading={creatingProduct} onClick={handleCreateFastProduct} className="bg-emerald-600 hover:bg-emerald-700 border-none text-white font-bold rounded-xl px-6 shadow-lg shadow-emerald-500/30 text-sm" />
            </div>
         </div>
      </Dialog>

      {/* DIALOG 2: SELECCIÓN MASIVA DE CATÁLOGO PRIVADO */}
      <Dialog
         header={
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full pr-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md">
                   <i className="pi pi-th-large text-lg"></i>
                </div>
                <div>
                   <h2 className="text-lg sm:text-xl font-black text-slate-800 leading-tight">Catálogo Privado - Selección y Captura Masiva</h2>
                   <p className="text-slate-500 text-xs mt-0.5">
                     Tilde productos o tipee la cantidad directamente con teclado (teclas <strong className="text-indigo-600">Enter</strong> o <strong className="text-indigo-600">↓</strong> para avanzar).
                   </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                 <Tag severity="info" value={`${filteredCatalog.length} disponibles`} className="font-bold px-2.5 py-1 text-xs" />
                 <Tag severity={batchSelectedSummary.count > 0 ? "success" : "warning"} value={`${batchSelectedSummary.count} marcados`} className="font-bold px-2.5 py-1 text-xs" />
              </div>
            </div>
         }
         visible={showBatchModal}
         style={{ width: '88vw', maxWidth: '1450px' }}
         breakpoints={{ '1200px': '92vw', '960px': '95vw', '640px': '98vw' }}
         onHide={() => setShowBatchModal(false)}
         className="rounded-3xl overflow-hidden shadow-2xl"
      >
         <div className="flex flex-col gap-3 pt-2">
            {/* Barra de Filtros Rápidos */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
               <div className="flex-1 flex flex-col sm:flex-row items-center gap-2">
                  <div className="relative w-full sm:w-80">
                     <i className="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                     <InputText
                        value={batchSearchText}
                        onChange={(e) => setBatchSearchText(e.target.value)}
                        placeholder="Filtrar por SKU, nombre, barras, marca..."
                        className="w-full pl-9 pr-3 py-2 text-xs border rounded-xl"
                     />
                  </div>
                  <Dropdown
                     value={batchCategoryFilter}
                     onChange={(e) => setBatchCategoryFilter(e.value)}
                     options={catalogCategories}
                     optionLabel="label"
                     optionValue="value"
                     placeholder="Todas las Categorías"
                     className="w-full sm:w-60 p-inputtext-sm text-xs border rounded-xl"
                  />
               </div>

               <div className="flex items-center gap-2 shrink-0">
                  <Button
                     label="Marcar Filtrados"
                     icon="pi pi-check-square"
                     onClick={() => handleSelectAllFiltered(true)}
                     className="p-button-sm font-bold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-none rounded-xl px-3 py-2 text-xs"
                  />
                  <Button
                     label="Desmarcar Todos"
                     icon="pi pi-times-circle"
                     onClick={() => handleSelectAllFiltered(false)}
                     className="p-button-sm font-bold bg-slate-200 text-slate-600 hover:bg-slate-300 border-none rounded-xl px-3 py-2 text-xs"
                  />
               </div>
            </div>

            {/* Tabla de Catálogo - Alto rendimiento con DOM estable y navegación ágil por teclado */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
               <div className="overflow-y-auto max-h-[52vh] relative">
                  <table className="w-full text-xs text-left border-collapse">
                     <thead className="sticky top-0 bg-slate-100/95 backdrop-blur-xs text-slate-600 border-b border-slate-200 z-10 select-none shadow-xs">
                        <tr>
                           <th className="py-2.5 px-3 w-12 text-center">
                              <div className="flex items-center justify-center">
                                 <button
                                    type="button"
                                    onClick={() => handleSelectAllFiltered(!(sortedAndFilteredCatalog.length > 0 && sortedAndFilteredCatalog.every(i => !!batchState[i.variant_id]?.selected)))}
                                    title="Marcar / Desmarcar todos los visibles"
                                    className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all cursor-pointer ${
                                       sortedAndFilteredCatalog.length > 0 && sortedAndFilteredCatalog.every(i => !!batchState[i.variant_id]?.selected)
                                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs ring-2 ring-indigo-200'
                                          : 'border-slate-300 bg-white hover:border-indigo-400'
                                    }`}
                                 >
                                    {sortedAndFilteredCatalog.length > 0 && sortedAndFilteredCatalog.every(i => !!batchState[i.variant_id]?.selected) && (
                                       <i className="pi pi-check text-[10px] font-black text-white"></i>
                                    )}
                                 </button>
                              </div>
                           </th>

                           <th
                              onClick={() => handleBatchSort('variant_sku')}
                              className="py-2.5 px-3 font-black text-slate-600 hover:text-indigo-600 cursor-pointer transition-colors w-28 whitespace-nowrap"
                           >
                              <div className="flex items-center gap-1.5">
                                 <span>SKU</span>
                                 <i className={`text-[10px] ${
                                    batchSortField === 'variant_sku'
                                       ? (batchSortOrder === 'asc' ? 'pi pi-sort-amount-up text-indigo-600' : 'pi pi-sort-amount-down text-indigo-600')
                                       : 'pi pi-sort-alt text-slate-300'
                                 }`}></i>
                              </div>
                           </th>

                           <th
                              onClick={() => handleBatchSort('product_name')}
                              className="py-2.5 px-3 font-black text-slate-600 hover:text-indigo-600 cursor-pointer transition-colors min-w-[240px]"
                           >
                              <div className="flex items-center gap-1.5">
                                 <span>DESCRIPCIÓN / INSUMO</span>
                                 <i className={`text-[10px] ${
                                    batchSortField === 'product_name'
                                       ? (batchSortOrder === 'asc' ? 'pi pi-sort-amount-up text-indigo-600' : 'pi pi-sort-amount-down text-indigo-600')
                                       : 'pi pi-sort-alt text-slate-300'
                                 }`}></i>
                              </div>
                           </th>

                           <th
                              onClick={() => handleBatchSort('category_name')}
                              className="py-2.5 px-3 font-black text-slate-600 hover:text-indigo-600 cursor-pointer transition-colors w-36 whitespace-nowrap"
                           >
                              <div className="flex items-center gap-1.5">
                                 <span>CATEGORÍA</span>
                                 <i className={`text-[10px] ${
                                    batchSortField === 'category_name'
                                       ? (batchSortOrder === 'asc' ? 'pi pi-sort-amount-up text-indigo-600' : 'pi pi-sort-amount-down text-indigo-600')
                                       : 'pi pi-sort-alt text-slate-300'
                                 }`}></i>
                              </div>
                           </th>

                           <th className="py-2.5 px-3 font-black text-slate-600 w-44 whitespace-nowrap">
                              PRESENTACIÓN
                           </th>

                           <th
                              onClick={() => handleBatchSort('replacement_cost')}
                              className="py-2.5 px-3 font-black text-slate-600 hover:text-indigo-600 cursor-pointer transition-colors w-28 text-right whitespace-nowrap"
                           >
                              <div className="flex items-center justify-end gap-1.5">
                                 <span>COSTO UNIT</span>
                                 <i className={`text-[10px] ${
                                    batchSortField === 'replacement_cost'
                                       ? (batchSortOrder === 'asc' ? 'pi pi-sort-amount-up text-indigo-600' : 'pi pi-sort-amount-down text-indigo-600')
                                       : 'pi pi-sort-alt text-slate-300'
                                 }`}></i>
                              </div>
                           </th>

                           <th className="py-2.5 px-3 font-black text-slate-600 w-28 text-center whitespace-nowrap">
                              CANTIDAD
                           </th>

                           <th
                              onClick={() => handleBatchSort('subtotal')}
                              className="py-2.5 px-3 font-black text-slate-600 hover:text-indigo-600 cursor-pointer transition-colors w-28 text-right whitespace-nowrap"
                           >
                              <div className="flex items-center justify-end gap-1.5">
                                 <span>SUBTOTAL</span>
                                 <i className={`text-[10px] ${
                                    batchSortField === 'subtotal'
                                       ? (batchSortOrder === 'asc' ? 'pi pi-sort-amount-up text-indigo-600' : 'pi pi-sort-amount-down text-indigo-600')
                                       : 'pi pi-sort-alt text-slate-300'
                                 }`}></i>
                              </div>
                           </th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100 bg-white">
                        {sortedAndFilteredCatalog.length === 0 ? (
                           <tr>
                              <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                                 <i className="pi pi-search text-2xl block mb-2 text-slate-300"></i>
                                 No hay productos que coincidan con la búsqueda.
                              </td>
                           </tr>
                        ) : (
                           sortedAndFilteredCatalog.map((r, idx) => {
                              const state = batchState[r.variant_id];
                              const isSelected = !!state?.selected;
                              const qtyVal = state?.qty ?? '';
                              const qtyNum = parseFloat(String(qtyVal)) || 0;
                              const chosenPack = (r.available_packagings || []).find((p: any) => p.id === state?.pack_id);
                              const factor = Number(chosenPack?.qty_per_unit) || 1;
                              const subtotal = qtyNum * factor * Number(r.replacement_cost || 0);

                              return (
                                 <tr
                                    key={r.variant_id}
                                    className={`transition-colors ${
                                       isSelected
                                          ? 'bg-indigo-50/75 hover:bg-indigo-100/60 font-medium'
                                          : idx % 2 === 0
                                            ? 'bg-white hover:bg-slate-50/80'
                                            : 'bg-slate-50/40 hover:bg-slate-100/80'
                                    }`}
                                 >
                                    {/* Checkbox */}
                                    <td className="py-2 px-3 text-center">
                                       <div className="flex items-center justify-center">
                                          <button
                                             type="button"
                                             onClick={() => toggleBatchSelect(r, !isSelected, idx)}
                                             className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all cursor-pointer ${
                                                isSelected
                                                   ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs ring-2 ring-indigo-200'
                                                   : 'border-slate-300 bg-white hover:border-indigo-400'
                                             }`}
                                          >
                                             {isSelected && <i className="pi pi-check text-[10px] font-black text-white"></i>}
                                          </button>
                                       </div>
                                    </td>

                                    {/* SKU */}
                                    <td className="py-2 px-3">
                                       <span className="font-mono text-[11px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200/60">
                                          {r.variant_sku}
                                       </span>
                                    </td>

                                    {/* DESCRIPCIÓN */}
                                    <td className="py-2 px-3">
                                       <div>
                                          <div className="font-bold text-slate-800 text-xs">{r.product_name}</div>
                                          <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                             {r.brand && (
                                                <span className="bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 text-slate-600 font-semibold">
                                                   {r.brand}
                                                </span>
                                             )}
                                             {r.barcode && (
                                                <span className="font-mono text-slate-500">
                                                   <i className="pi pi-barcode mr-1 text-[10px]"></i>
                                                   {r.barcode}
                                                </span>
                                             )}
                                          </div>
                                       </div>
                                    </td>

                                    {/* CATEGORÍA */}
                                    <td className="py-2 px-3">
                                       <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60 whitespace-nowrap">
                                          {r.category_name || 'General'}
                                       </span>
                                    </td>

                                    {/* PRESENTACIÓN */}
                                    <td className="py-2 px-3">
                                       {r.available_packagings && r.available_packagings.length > 1 ? (
                                          <select
                                             value={state?.pack_id ?? (r.pack_id || '')}
                                             onChange={(e) => updateBatchPack(r.variant_id, e.target.value ? Number(e.target.value) : null)}
                                             className="w-full text-[11px] font-bold border border-indigo-200 bg-indigo-50/40 text-indigo-900 rounded-lg p-1 outline-none focus:ring-1 focus:ring-indigo-500"
                                          >
                                             {r.available_packagings.map((pkg: any) => (
                                                <option key={pkg.id ?? 'base'} value={pkg.id ?? ''}>
                                                   {pkg.name || pkg.label} {pkg.qty_per_unit > 1 ? `(x${pkg.qty_per_unit})` : ''}
                                                </option>
                                             ))}
                                          </select>
                                       ) : (
                                          <span className="text-[11px] font-semibold text-slate-500">
                                             {r.pack_name || 'Und. Base'} (x{r.qty_per_unit || 1})
                                          </span>
                                       )}
                                    </td>

                                    {/* COSTO UNIT */}
                                    <td className="py-2 px-3 text-right">
                                       <span className="font-semibold text-slate-700">
                                          ${parseFloat(r.replacement_cost || 0).toFixed(2)}
                                       </span>
                                    </td>

                                     {/* CANTIDAD - Entrada ágil por teclado */}
                                     <td className="py-2 px-3 text-center">
                                        {(() => {
                                           const isPack = (r.qty_per_unit || 1) > 1;
                                           const isWeight = !isPack && isWeightUom(r.uom_base);
                                           return (
                                              <input
                                                 id={`batch-qty-${idx}`}
                                                 type="number"
                                                 min="0"
                                                 step={isWeight ? "0.001" : "1"}
                                                 value={qtyVal}
                                                 placeholder="0"
                                                 onFocus={(e) => e.target.select()}
                                                 onKeyDown={(e) => {
                                                    preventDecimalKey(e, isWeight);
                                                    handleBatchKeyDown(e, idx);
                                                 }}
                                                 onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (!isWeight && (val.includes('.') || val.includes(','))) {
                                                       const clean = Math.round(parseFloat(val.replace(',', '.')) || 0).toString();
                                                       updateBatchQty(r, clean);
                                                    } else {
                                                       updateBatchQty(r, val);
                                                    }
                                                 }}
                                                 className={`w-20 text-center font-black p-1 text-xs rounded-lg border-2 outline-none transition-all ${
                                                    isSelected
                                                       ? 'border-indigo-500 bg-white text-indigo-800 shadow-xs ring-2 ring-indigo-100'
                                                       : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 focus:border-indigo-400'
                                                 }`}
                                              />
                                           );
                                        })()}
                                     </td>

                                    {/* SUBTOTAL */}
                                    <td className="py-2 px-3 text-right">
                                       <span className={`font-black text-xs ${subtotal > 0 ? 'text-emerald-700' : 'text-slate-300'}`}>
                                          ${subtotal.toFixed(2)}
                                       </span>
                                    </td>
                                 </tr>
                              );
                           })
                        )}
                     </tbody>
                  </table>
               </div>
            </div>

            {/* Footer Modal con Totales y Acción */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 mt-1">
               <div className="flex flex-wrap items-center gap-4 text-xs">
                  <div>
                     <span className="text-slate-400 block font-semibold">SKUs Seleccionados</span>
                     <span className="text-base font-black text-slate-800">{batchSelectedSummary.count} productos</span>
                  </div>
                  <div className="h-7 w-px bg-slate-200"></div>
                  <div>
                     <span className="text-slate-400 block font-semibold">Total Unidades Base</span>
                     <span className="text-base font-black text-indigo-600">{batchSelectedSummary.units.toLocaleString()} unds</span>
                  </div>
                  <div className="h-7 w-px bg-slate-200"></div>
                  <div>
                     <span className="text-slate-400 block font-semibold">Subtotal Estimado</span>
                     <span className="text-base font-black text-emerald-700">
                        ${batchSelectedSummary.estimatedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                     </span>
                  </div>
               </div>

               <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <Button
                     label="Cancelar"
                     icon="pi pi-times"
                     onClick={() => setShowBatchModal(false)}
                     className="p-button-text text-slate-500 font-bold text-xs"
                  />
                  <Button
                     label={`Añadir a la Orden (${batchSelectedSummary.count} ítems)`}
                     icon="pi pi-check"
                     onClick={applyBatchToOrder}
                     disabled={batchSelectedSummary.count === 0}
                     className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl px-6 py-2.5 text-xs shadow-lg shadow-indigo-500/20 border-none"
                  />
               </div>
            </div>
         </div>
      </Dialog>

      {/* DIALOG 3: PEGAR DESDE EXCEL / PORTAPAPELES */}
      <Dialog
         header={
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                  <i className="pi pi-file-excel text-lg"></i>
               </div>
               <div>
                  <h2 className="text-lg font-black text-slate-800 leading-tight">Pegar desde Excel / Portapapeles</h2>
                  <p className="text-slate-500 text-xs">Copia columnas de tu hoja de cálculo o WhatsApp y pégalas aquí.</p>
               </div>
            </div>
         }
         visible={showPasteModal}
         style={{ width: '55vw', minWidth: '320px' }}
         breakpoints={{ '1200px': '70vw', '960px': '85vw', '640px': '95vw' }}
         onHide={() => setShowPasteModal(false)}
         className="rounded-3xl overflow-hidden shadow-2xl"
      >
         <div className="flex flex-col gap-4 pt-2">
            <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200 text-xs text-emerald-900 leading-relaxed">
               <strong className="block font-black mb-1"><i className="pi pi-info-circle mr-1"></i> Formato sugerido:</strong>
               Copie 2 columnas desde Excel (la primera con el <strong>Código / SKU / Código de Barras</strong> y la segunda con la <strong>Cantidad</strong>). El sistema identificará automáticamente los productos en el catálogo del proveedor.
            </div>

            <div className="flex flex-col gap-1.5">
               <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Pega aquí el contenido copiado:</label>
               <InputTextarea
                  value={pasteRawText}
                  onChange={(e) => setPasteRawText(e.target.value)}
                  rows={8}
                  placeholder={`Ejemplo:
PRD-4295	10
PRD-4296	25
PRD-4297	5`}
                  className="w-full font-mono text-xs p-3 border-2 rounded-xl"
               />
            </div>

            <div className="flex justify-end">
               <Button
                  label="Procesar y Cruzar con Catálogo"
                  icon="pi pi-sync"
                  onClick={handleProcessPasteText}
                  disabled={!pasteRawText.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl px-4 py-2 border-none shadow-md"
               />
            </div>

            {/* Resultados del Procesamiento */}
            {pasteResults && (
               <div className="flex flex-col gap-3 mt-2 border-t pt-3">
                  <div className="flex items-center justify-between">
                     <span className="text-xs font-bold text-slate-700">Resultado del cruce:</span>
                     <div className="flex items-center gap-2">
                        <Tag severity="success" value={`${pasteResults.matched.length} reconocidos`} className="font-bold text-xs" />
                        {pasteResults.unmatched.length > 0 && (
                           <Tag severity="warning" value={`${pasteResults.unmatched.length} no encontrados`} className="font-bold text-xs" />
                        )}
                     </div>
                  </div>

                  {/* Previsualización de ítems reconocidos */}
                  {pasteResults.matched.length > 0 && (
                     <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-white text-xs">
                        <table className="w-full text-left">
                           <thead className="bg-slate-50 text-slate-500 font-bold sticky top-0 border-b">
                              <tr>
                                 <th className="p-2">SKU</th>
                                 <th className="p-2">Producto</th>
                                 <th className="p-2 text-center">Cantidad</th>
                                 <th className="p-2 text-right">Subtotal</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100">
                              {pasteResults.matched.map((m, idx) => (
                                 <tr key={idx} className="hover:bg-slate-50">
                                    <td className="p-2 font-mono text-[11px] font-bold text-slate-700">{m.item.variant_sku}</td>
                                    <td className="p-2 font-semibold text-slate-800">{m.item.product_name}</td>
                                    <td className="p-2 text-center font-black text-indigo-600">{m.qty}</td>
                                    <td className="p-2 text-right font-bold text-emerald-700">${m.subtotal.toFixed(2)}</td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  )}

                  {/* Advertencia de no encontrados */}
                  {pasteResults.unmatched.length > 0 && (
                     <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200 text-[11px] text-amber-800 max-h-24 overflow-y-auto">
                        <strong>Líneas no localizadas en el catálogo del proveedor:</strong>
                        <ul className="list-disc list-inside mt-1 font-mono">
                           {pasteResults.unmatched.map((u, i) => <li key={i}>{u}</li>)}
                        </ul>
                     </div>
                  )}

                  <div className="flex justify-end gap-2 mt-2">
                     <Button
                        label="Cancelar"
                        icon="pi pi-times"
                        onClick={() => setShowPasteModal(false)}
                        className="p-button-text text-slate-500 font-bold text-xs"
                     />
                     <Button
                        label={`Incorporar ${pasteResults.matched.length} Productos a la Orden`}
                        icon="pi pi-check"
                        onClick={handleApplyPasteToOrder}
                        disabled={pasteResults.matched.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl px-5 py-2.5 border-none shadow-md"
                     />
                  </div>
               </div>
            )}
         </div>
      </Dialog>

      {/* MATRIZ DE EDICIÓN DE LÍNEAS DE LA ORDEN */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden mb-6">
        {/* Cabecera de la Matriz con Buscador y Filtros */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50/50">
           <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                 Renglones en la Orden ({lines.length})
              </span>
              {lines.length > 0 && (
                 <span className="text-xs text-slate-400">
                    Mostrando {visibleLines.length} de {lines.length}
                 </span>
              )}
           </div>

           <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                 <i className="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                 <InputText
                    value={filterLinesText}
                    onChange={(e) => setFilterLinesText(e.target.value)}
                    placeholder="Filtrar en orden..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border"
                 />
              </div>

              {lines.some(l => (Number(l.qty_ordered) || 0) === 0) && (
                 <Button
                    label="Descartar Ceros"
                    icon="pi pi-filter-slash"
                    onClick={handlePruneZeroLines}
                    className="p-button-sm font-bold bg-amber-100 hover:bg-amber-200 text-amber-800 border-none rounded-lg px-2.5 py-1.5 text-xs"
                    tooltip="Elimina renglones con cantidad 0"
                    tooltipOptions={{ position: 'top' }}
                 />
              )}

              {lines.length > 0 && (
                 <Button
                    icon="pi pi-trash"
                    onClick={handleClearAllLines}
                    className="p-button-sm p-button-text p-button-danger rounded-lg text-xs"
                    tooltip="Vaciar todos los renglones"
                    tooltipOptions={{ position: 'top' }}
                 />
              )}
           </div>
        </div>

        <div className="overflow-x-auto w-full">
          <DataTable 
            dataKey="internal_id" 
            value={visibleLines} 
            emptyMessage={lines.length > 0 ? "No hay renglones que coincidan con el filtro." : "No has añadido productos a esta orden."} 
            size="small" 
            stripedRows 
            rowHover 
            responsiveLayout="scroll"
            className="text-sm min-w-[780px]"
          >
          <Column header="SKU" field="sku" style={{ width: '90px', minWidth: '80px' }} body={r => <span className="font-mono text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500">{r.sku}</span>} />
          
          <Column header="Nomenclatura" field="product_name" style={{ minWidth: '160px' }} body={r => <span className="font-bold text-slate-800">{r.product_name}</span>} />
          
          <Column header="Presentación" style={{ minWidth: '160px' }} body={(r) => (
             <div className="flex items-center justify-center">
                {r.available_packagings && r.available_packagings.length > 1 ? (
                    <Dropdown
                       value={r.pack_id ?? null}
                       options={r.available_packagings}
                       optionLabel="label"
                       optionValue="id"
                       onChange={(e) => handlePresentationChange(r.internal_id, e.value)}
                       className="p-inputtext-sm text-xs font-bold border-indigo-200 bg-indigo-50/50 text-indigo-800 rounded-lg shadow-sm"
                    />
                ) : (
                    <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                       <i className="pi pi-box text-slate-400 text-xs"></i>
                       {r.pack_name || 'Und. Base'} (x{r.qty_per_pack || 1})
                    </span>
                )}
             </div>
          )} align="center" />
          
          <Column header="Cant. a Comprar" style={{ minWidth: '120px' }} body={(r) => {
             const isPack = (r.qty_per_pack || 1) > 1;
             const isWeight = !isPack && isWeightUom(r.uom_base);
             const uomLabel = r.uom_base || 'UND';
             return (
                 <div className="flex flex-col items-center gap-1">
                     <input 
                        type="number" 
                        value={r.qty_ordered} 
                        min="0"
                        step={isWeight ? "0.001" : "1"}
                        onKeyDown={(e) => preventDecimalKey(e, isWeight)}
                        onChange={(e) => {
                           const raw = e.target.value;
                           if (raw === '') {
                              handleQtyChange(r.internal_id, 0);
                              return;
                           }
                           const parsed = isWeight ? parseFloat(raw.replace(',', '.')) : parseInt(raw, 10);
                           handleQtyChange(r.internal_id, isNaN(parsed) ? 0 : parsed);
                        }}
                        className={`w-20 text-center text-base font-black p-1.5 rounded-lg border-2 outline-none shadow-inner ${
                           r.qty_ordered === 0 
                              ? 'border-amber-200 bg-amber-50 text-amber-700' 
                              : 'border-indigo-200 bg-indigo-50/70 text-indigo-700 focus:border-indigo-500'
                        }`} 
                     />
                     {isPack ? (
                         <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                            = {r.expected_base_qty} {uomLabel}
                         </span>
                     ) : (
                         <span className="text-[10px] font-semibold text-slate-400">
                            {r.qty_ordered} {uomLabel}
                         </span>
                     )}
                 </div>
             );
          }} align="center" />
          
          <Column header="Costo x Bulto" style={{ minWidth: '130px' }} body={(r) => {
             const isPack = r.qty_per_pack > 1;
             const packCostVal = r.pack_cost != null ? Number(r.pack_cost) : Number(((Number(r.unit_cost) || 0) * (r.qty_per_pack || 1)).toFixed(2));
             
             if (!isPack) {
                 return (
                     <div className="flex justify-end items-center gap-1 pr-2">
                         <span className="text-xs text-slate-400 font-semibold italic">N/A (Unidad)</span>
                     </div>
                 );
             }
             
             return (
                 <div className="flex justify-end items-center gap-1">
                     <span className="font-bold text-slate-400 text-xs">$</span>
                     <input 
                        type="number" 
                        value={packCostVal} 
                        step="0.01"
                        onChange={(e) => handlePackCostChange(r.internal_id, parseFloat(e.target.value))}
                        className="w-24 text-right font-bold p-1.5 text-sm rounded-lg border-2 border-sky-200 outline-none focus:border-sky-500 bg-sky-50/50 text-sky-900 shadow-inner" 
                        placeholder="0.00"
                     />
                 </div>
             );
          }} align="right" />

          <Column header="Costo x Unidad" style={{ minWidth: '130px' }} body={(r) => (
             <div className="flex justify-end items-center gap-1">
                 <span className="font-bold text-slate-400 text-xs">$</span>
                 <input 
                    type="number" 
                    value={r.unit_cost != null ? Number(Number(r.unit_cost).toFixed(4)) : 0} 
                    step="0.0001"
                    onChange={(e) => handleUnitCostChange(r.internal_id, parseFloat(e.target.value))}
                    className="w-24 text-right font-bold p-1.5 text-sm rounded-lg border-2 border-slate-200 outline-none focus:border-emerald-500 bg-slate-50 text-slate-700" 
                    placeholder="0.00"
                 />
             </div>
          )} align="right" />
          
          <Column header="Subtotal" style={{ minWidth: '110px' }} body={r => <span className="font-black text-emerald-700 text-base">${parseFloat(r.subtotal).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>} align="right" />
          
          <Column style={{ width: '60px', minWidth: '60px' }} body={(r) => (
             <Button type="button" icon="pi pi-trash" rounded text severity="danger" onClick={() => removeLine(r.internal_id)} aria-label="Eliminar" />
          )} align="center" />
          </DataTable>
        </div>
      </div>

      {/* CONSOLA DE ACCIONES */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
         <span className="text-slate-400 text-sm"><i className="pi pi-info-circle mr-2"></i>La orden creada iniciará como Borrador (Draft). Los renglones con cantidad 0 serán omitidos automáticamente.</span>
         <Button label="Crear Borrador" icon="pi pi-arrow-right" iconPos="right" onClick={createDraft} disabled={saving || lines.length === 0} className="w-full sm:w-auto font-bold px-8 shadow-lg hover:shadow-xl transition-all shadow-indigo-500/30 text-lg bg-indigo-600 border-none text-white justify-center" />
      </div>

    </div>
  );
}
