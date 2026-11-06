"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import api from '@/lib/api';

const extractErrorMessage = (e: any, fallback: string = 'Ha ocurrido un error inesperado'): string => {
  const detail = e?.response?.data?.detail;
  if (!detail) return e?.message || fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: any) => (typeof d === 'object' ? (d.msg || JSON.stringify(d)) : String(d))).join(', ');
  }
  if (typeof detail === 'object') {
    return detail.msg || JSON.stringify(detail);
  }
  return String(detail);
};

const buildCodeCandidates = (clean: string) => {
  const candidates = [clean];
  if (/^\d+$/.test(clean)) {
    if (clean.length === 12) {
      candidates.push('0' + clean);
    } else if (clean.length === 13 && clean.startsWith('0')) {
      candidates.push(clean.slice(1));
    }
    const unpadded = clean.replace(/^0+/, '');
    if (unpadded && !candidates.includes(unpadded)) {
      candidates.push(unpadded);
      candidates.push(`prd-${unpadded}`);
    }
    for (const len of [6, 13, 12, 14, 8]) {
      const padded = (unpadded || clean).padStart(len, '0');
      if (padded && !candidates.includes(padded)) {
        candidates.push(padded);
      }
    }
  }
  return candidates;
};

export default function WmsLocationsPage() {
  const [treeData, setTreeData] = useState<any[]>([]);
  const [occupancyData, setOccupancyData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const toast = useRef<Toast>(null);

  // Usuario y Permisos RBAC
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isSuperUser, setIsSuperUser] = useState<boolean>(false);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [selectedFacilityFilter, setSelectedFacilityFilter] = useState<number>(0);

  // Reubicación (Putaway) state
  const [putawayDialogVisible, setPutawayDialogVisible] = useState(false);
  const [relocationMode, setRelocationMode] = useState<'single' | 'batch'>('batch');
  const [sourceWarehouse, setSourceWarehouse] = useState<any>(null);
  const [sourceLocationId, setSourceLocationId] = useState<number | null>(null);
  const [destWarehouseId, setDestWarehouseId] = useState<number | null>(null);
  const [destLocationId, setDestLocationId] = useState<number | null>(null);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [batchId, setBatchId] = useState<number | null>(null);
  const [putawayQty, setPutawayQty] = useState<number>(1);
  const [executingPutaway, setExecutingPutaway] = useState(false);
  const [productsList, setProductsList] = useState<any[]>([]);

  // Multi-empaque y UOM para Reubicación (Putaway)
  const [availablePackagings, setAvailablePackagings] = useState<any[]>([]);
  const [selectedPackagingId, setSelectedPackagingId] = useState<number>(0);
  const [currentProductUom, setCurrentProductUom] = useState<string>('UND');
  const [loadingPackagings, setLoadingPackagings] = useState<boolean>(false);

  // Líneas del Lote (Batch Mode)
  const [batchLines, setBatchLines] = useState<any[]>([]);

  // Fast Barcode Input (Estilo Ajustes)
  const [fastCodeInput, setFastCodeInput] = useState<string>('');
  const [fastSelectedProd, setFastSelectedProd] = useState<any>(null);
  const [fastQty, setFastQty] = useState<number>(1);
  const [fastPackagingId, setFastPackagingId] = useState<number>(0);
  const [fastPackagings, setFastPackagings] = useState<any[]>([]);
  const [fastLoadingPackagings, setFastLoadingPackagings] = useState<boolean>(false);
  const [fastSearching, setFastSearching] = useState<boolean>(false);

  const fastCodeInputRef = useRef<any>(null);
  const fastQtyInputRef = useRef<any>(null);

  // Modal Búsqueda F2
  const [f2SearchDialogVisible, setF2SearchDialogVisible] = useState<boolean>(false);
  const [f2SearchQuery, setF2SearchQuery] = useState<string>('');
  const [f2SearchResults, setF2SearchResults] = useState<any[]>([]);
  const [f2SelectedIndex, setF2SelectedIndex] = useState<number>(0);
  const [f2Loading, setF2Loading] = useState<boolean>(false);
  const f2InputRef = useRef<any>(null);
  const f2ListContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!f2SearchDialogVisible || !f2ListContainerRef.current) return;
    const container = f2ListContainerRef.current;
    if (f2SelectedIndex === 0) {
      container.scrollTop = 0;
      return;
    }
    const activeEl = container.querySelector(`[data-f2-index="${f2SelectedIndex}"]`) as HTMLElement;
    if (!activeEl) return;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();

    if (activeRect.top < containerRect.top) {
      container.scrollTop -= (containerRect.top - activeRect.top);
    } else if (activeRect.bottom > containerRect.bottom) {
      container.scrollTop += (activeRect.bottom - containerRect.bottom);
    }
  }, [f2SelectedIndex, f2SearchDialogVisible, f2SearchResults]);

  // Consulta de Stock (Ubicación Quirúrgica o Almacén Global)
  const [stockDialogVisible, setStockDialogVisible] = useState(false);
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockData, setStockData] = useState<any>(null);
  const [currentStockWarehouse, setCurrentStockWarehouse] = useState<any>(null);
  const [currentStockLocation, setCurrentStockLocation] = useState<any>(null);
  const [stockSearchQuery, setStockSearchQuery] = useState<string>('');

  // Nuevo Almacén / Depósito state
  const [newWhDialogVisible, setNewWhDialogVisible] = useState(false);
  const [newWhFacilityId, setNewWhFacilityId] = useState<number | null>(null);
  const [newWhName, setNewWhName] = useState<string>('');
  const [newWhCode, setNewWhCode] = useState<string>('');
  const [creatingWarehouse, setCreatingWarehouse] = useState(false);

  // Editar Almacén (Solo Nombre) y Estado (Habilitar / Inhabilitar / Eliminar)
  const [editWhDialogVisible, setEditWhDialogVisible] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<any>(null);
  const [editWhName, setEditWhName] = useState<string>('');
  const [savingEditWh, setSavingEditWh] = useState(false);
  const [togglingWhId, setTogglingWhId] = useState<number | null>(null);
  const [deletingWhId, setDeletingWhId] = useState<number | null>(null);

  // Nueva Ubicación state
  const [newLocDialogVisible, setNewLocDialogVisible] = useState(false);
  const [newLocFacilityId, setNewLocFacilityId] = useState<number | null>(null);
  const [newLocWarehouseId, setNewLocWarehouseId] = useState<number | null>(null);
  const [newLocName, setNewLocName] = useState<string>('');
  const [newLocCode, setNewLocCode] = useState<string>('');
  const [newLocCapacity, setNewLocCapacity] = useState<number>(100);
  const [newLocType, setNewLocType] = useState<string>('SHELF');
  const [creatingLocation, setCreatingLocation] = useState(false);

  // Inicialización de Usuario, Sucursales y Filtro Activo (RBAC)
  const initUserAndFacilities = async () => {
    try {
      // 1. Obtener usuario autenticado
      const userRes = await api.get('/users/me');
      const user = userRes.data;
      setCurrentUser(user);
      const isSuper = !!user.is_superuser;
      setIsSuperUser(isSuper);

      let availableFacs: any[] = [];
      if (isSuper) {
        const facRes = await api.get('/facilities/').catch(() => ({ data: [] }));
        availableFacs = Array.isArray(facRes.data) ? facRes.data : (facRes.data?.items || facRes.data?.data || []);
      } else {
        availableFacs = Array.isArray(user.facilities) ? user.facilities : [];
      }
      setFacilities(availableFacs);

      // 2. Determinar selección inicial con persistencia en localStorage
      const savedFacility = typeof window !== 'undefined' ? localStorage.getItem('morpheus_wms_facility') : null;
      let initialFacId = 0;

      if (isSuper) {
        if (savedFacility !== null && savedFacility !== undefined) {
          const parsed = parseInt(savedFacility, 10);
          if (parsed === 0 || availableFacs.some(f => f.id === parsed)) {
            initialFacId = parsed;
          } else {
            initialFacId = availableFacs.length > 0 ? availableFacs[0].id : 0;
          }
        } else {
          initialFacId = availableFacs.length > 0 ? availableFacs[0].id : 0;
        }
      } else {
        // Usuario estándar: jamás puede seleccionar 0 ("Todas las sucursales")
        if (savedFacility !== null && savedFacility !== undefined) {
          const parsed = parseInt(savedFacility, 10);
          if (availableFacs.some(f => f.id === parsed)) {
            initialFacId = parsed;
          } else {
            initialFacId = availableFacs.length > 0 ? availableFacs[0].id : 0;
          }
        } else {
          initialFacId = availableFacs.length > 0 ? availableFacs[0].id : 0;
        }
      }

      setSelectedFacilityFilter(initialFacId);
      if (typeof window !== 'undefined' && initialFacId) {
        localStorage.setItem('morpheus_wms_facility', String(initialFacId));
      }

      if (availableFacs.length > 0) {
        setNewWhFacilityId(initialFacId || availableFacs[0].id);
        setNewLocFacilityId(initialFacId || availableFacs[0].id);
      }

      await fetchTreeAndOccupancy(initialFacId);
    } catch (e) {
      console.error("Error inicializando autenticación y sucursales:", e);
      toast.current?.show({ severity: 'error', summary: 'Error de Autenticación', detail: 'No se pudo validar el perfil de usuario.' });
    }
  };

  const fetchTreeAndOccupancy = async (facilityId?: number | null) => {
    setLoading(true);
    try {
      const url = (facilityId && facilityId !== 0) ? `/wms/locations/tree?facility_id=${facilityId}` : '/wms/locations/tree';
      const [treeRes, occRes] = await Promise.all([
        api.get(url).catch(() => ({ data: [] })),
        api.get('/wms/locations/occupancy').catch(() => ({ data: [] }))
      ]);

      const tree = treeRes.data || [];
      setTreeData(tree);
      
      const occMap: any = {};
      (occRes.data || []).forEach((item: any) => {
        occMap[item.id] = item;
      });
      setOccupancyData(occMap);

      if (tree && tree.length > 0 && !newLocWarehouseId) {
        setNewLocWarehouseId(tree[0].id);
      }
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el mapa de almacenes.' });
    }
    setLoading(false);
  };

  const productFilterTimeoutRef = useRef<any>(null);
  const handleProductFilter = (filterText: string) => {
    if (productFilterTimeoutRef.current) clearTimeout(productFilterTimeoutRef.current);
    productFilterTimeoutRef.current = setTimeout(async () => {
      try {
        const q = (filterText || '').trim();
        const url = q ? `/products/selector?q=${encodeURIComponent(q)}&limit=100` : '/products/selector?limit=300';
        const res = await api.get(url);
        const list = Array.isArray(res.data) ? res.data : (res.data?.items || res.data?.data || []);
        setProductsList(prev => {
          const sel = prev.find((p: any) => p.value === variantId);
          if (sel && !list.some((m: any) => m.value === sel.value)) {
            return [sel, ...list];
          }
          return list;
        });
      } catch (e) {
        console.error(e);
      }
    }, 200);
  };

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products/selector?limit=300');
      const prodList = Array.isArray(res.data) ? res.data : (res.data?.items || res.data?.data || []);
      setProductsList(prodList);
    } catch (e) {
      console.error("Error cargando productos:", e);
    }
  };

  useEffect(() => {
    initUserAndFacilities();
    fetchProducts();
  }, []);

  const handleFacilityFilterChange = (facId: number) => {
    setSelectedFacilityFilter(facId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('morpheus_wms_facility', String(facId));
    }
    if (facId && facId !== 0) {
      setNewWhFacilityId(facId);
      setNewLocFacilityId(facId);
    }
    fetchTreeAndOccupancy(facId);
  };

  // =========================================================================
  // CONSULTA DE INVENTARIO (DOBLE NIVEL: UBICACIÓN Y ALMACÉN)
  // =========================================================================
  const openStockDialog = async (wh: any, loc: any = null) => {
    setCurrentStockWarehouse(wh);
    setCurrentStockLocation(loc);
    setStockSearchQuery('');
    setStockDialogVisible(true);
    await fetchWarehouseStock(wh.id, loc?.id || null);
  };

  const fetchWarehouseStock = async (warehouseId: number, locationId: number | null) => {
    setLoadingStock(true);
    try {
      let url = `/wms/warehouses/${warehouseId}/stock`;
      if (locationId) {
        url += `?location_id=${locationId}`;
      }
      const res = await api.get(url);
      setStockData(res.data);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Error de Consulta',
        detail: extractErrorMessage(e, 'No se pudo consultar el stock del almacén.')
      });
      setStockData(null);
    }
    setLoadingStock(false);
  };

  const filteredStockItems = useMemo(() => {
    if (!stockData || !Array.isArray(stockData.items)) return [];
    if (!stockSearchQuery.trim()) return stockData.items;
    const q = stockSearchQuery.toLowerCase().trim();
    return stockData.items.filter((item: any) =>
      (item.sku && item.sku.toLowerCase().includes(q)) ||
      (item.barcode && item.barcode.toLowerCase().includes(q)) ||
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.location_name && item.location_name.toLowerCase().includes(q)) ||
      (item.location_code && item.location_code.toLowerCase().includes(q)) ||
      (item.lot_number && item.lot_number.toLowerCase().includes(q))
    );
  }, [stockData, stockSearchQuery]);

  const fetchVariantPackagings = async (vId: number) => {
    if (!vId) {
      setAvailablePackagings([]);
      setCurrentProductUom('UND');
      return;
    }
    setLoadingPackagings(true);
    try {
      const res = await api.get(`/wms/variants/${vId}/packagings`);
      if (res.data) {
        setAvailablePackagings(res.data.packagings || []);
        setCurrentProductUom(res.data.uom || 'UND');
      }
    } catch (e) {
      console.error("Error cargando empaques de variante:", e);
      setAvailablePackagings([]);
      setCurrentProductUom('UND');
    }
    setLoadingPackagings(false);
  };

  const handleReubicarFromStock = (item: any) => {
    if (!currentStockWarehouse) return;
    openPutaway(
      currentStockWarehouse,
      item.location_id || null,
      item.variant_id,
      item.batch_id || null,
      item.quantity || 1,
      item.packagings || [],
      item.uom || 'UND'
    );
  };

  // =========================================================================
  // REUBICACIÓN (PUTAWAY) INTRA E INTER ALMACÉN
  // =========================================================================
  const openPutaway = (
    wh: any, 
    preselectedLocId: number | null = null, 
    preselectedVariantId: number | null = null,
    preselectedBatchId: number | null = null,
    preselectedQty: number = 1,
    preselectedPackagings: any[] | null = null,
    preselectedUom: string = 'UND'
  ) => {
    if (!wh) return;
    setSourceWarehouse(wh);
    const defaultTargetWh = wh.is_active !== false
      ? wh
      : (treeData.find((w: any) => w.facility_id === wh.facility_id && w.is_active !== false) || null);
    setDestWarehouseId(defaultTargetWh ? defaultTargetWh.id : null);
    setSourceLocationId(preselectedLocId ? Number(preselectedLocId) : 0);
    
    // Si el almacén destino tiene ubicaciones y preselectedLocId está definido, sugerir otra si existe
    const targetWhLocs = defaultTargetWh?.locations || [];
    if (preselectedLocId && targetWhLocs.length > 1) {
      const otherLoc = targetWhLocs.find((l: any) => l.id !== preselectedLocId);
      setDestLocationId(otherLoc ? otherLoc.id : (targetWhLocs[0]?.id || 0));
    } else if (targetWhLocs.length > 0) {
      setDestLocationId(targetWhLocs[0].id);
    } else {
      setDestLocationId(0);
    }

    setVariantId(preselectedVariantId);
    setBatchId(preselectedBatchId);
    setPutawayQty(preselectedQty > 0 ? preselectedQty : 1);

    // Por defecto siempre Unidad (factor 1.0)
    setSelectedPackagingId(0);
    if (preselectedPackagings !== null) {
      setAvailablePackagings(preselectedPackagings);
      setCurrentProductUom(preselectedUom || 'UND');
    } else if (preselectedVariantId) {
      fetchVariantPackagings(preselectedVariantId);
    } else {
      setAvailablePackagings([]);
      setCurrentProductUom('UND');
    }

    if (preselectedVariantId) {
      setRelocationMode('single');
    } else {
      setRelocationMode('batch');
      setBatchLines([]);
      setFastCodeInput('');
      setFastSelectedProd(null);
      setFastQty(1);
      setFastPackagingId(0);
      setFastPackagings([]);
      setTimeout(() => fastCodeInputRef.current?.focus(), 120);
    }

    setPutawayDialogVisible(true);
  };

  const handleFastLookup = async (rawCode: string) => {
    const clean = (rawCode || '').trim().toLowerCase();
    if (!clean) {
      openF2SearchModal('');
      return;
    }

    const candidates = buildCodeCandidates(clean);
    const exactMatches = (p: any) => {
      const pSku = (p.sku || '').toLowerCase();
      const pPrimary = (p.primary_barcode || '').toLowerCase();
      const pBarcodes = (p.barcodes || []).map((b: string) => b.toLowerCase());
      return candidates.some(c => c === pSku || c === pPrimary || pBarcodes.includes(c));
    };

    // 1. Buscar en memoria local
    const localExact = productsList.find(exactMatches);
    if (localExact) {
      selectProductForFastEntry(localExact);
      return;
    }

    // 2. Buscar en backend
    setFastSearching(true);
    try {
      const res = await api.get(`/products/selector?q=${encodeURIComponent(rawCode.trim())}&limit=25`);
      const remoteList = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.items || []);
      if (remoteList.length === 1) {
        selectProductForFastEntry(remoteList[0]);
      } else if (remoteList.length > 1) {
        setF2SearchResults(remoteList);
        setF2SelectedIndex(0);
        setF2SearchQuery(rawCode);
        setF2SearchDialogVisible(true);
        setTimeout(() => f2InputRef.current?.focus(), 60);
      } else {
        toast.current?.show({ 
          severity: 'warn', 
          summary: 'Sin Coincidencias', 
          detail: `No se encontró producto con código o barra "${rawCode}".` 
        });
      }
    } catch (err) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Error al buscar producto.' });
    } finally {
      setFastSearching(false);
    }
  };

  const selectProductForFastEntry = async (prod: any) => {
    setFastSelectedProd(prod);
    setFastQty(1);
    setFastPackagingId(0);
    setFastLoadingPackagings(true);
    try {
      const vId = prod.value || prod.id;
      const res = await api.get(`/wms/packagings/${vId}`);
      const pkgs = res.data?.packagings || [];
      setFastPackagings(pkgs);
    } catch (e) {
      setFastPackagings([]);
    } finally {
      setFastLoadingPackagings(false);
    }
    setTimeout(() => {
      if (fastQtyInputRef.current?.getInput) {
        fastQtyInputRef.current.getInput()?.focus();
        fastQtyInputRef.current.getInput()?.select();
      }
    }, 60);
  };

  const handleFastAdd = () => {
    if (!fastSelectedProd) return;
    const vId = fastSelectedProd.value || fastSelectedProd.id;
    const qty = Number(fastQty) || 1;
    if (qty <= 0) {
      toast.current?.show({ severity: 'warn', summary: 'Cantidad Inválida', detail: 'La cantidad debe ser mayor a 0.' });
      return;
    }

    const pkg = fastPackagings.find(p => p.id === fastPackagingId);
    const multiplier = pkg ? Number(pkg.qty_per_unit) : 1;
    const factorName = pkg ? `${pkg.name} (x${pkg.qty_per_unit})` : `Unidad (${fastSelectedProd.uom_base || 'UND'})`;
    const totalBase = Math.round(((qty * multiplier)) * 10000) / 10000;

    setBatchLines(prev => {
      const existingIdx = prev.findIndex(l => 
        l.variant_id === vId && 
        l.packaging_id === fastPackagingId && 
        l.source_location_id === sourceLocationId && 
        l.dest_location_id === destLocationId && 
        l.dest_warehouse_id === (destWarehouseId || sourceWarehouse.id)
      );

      if (existingIdx >= 0) {
        const updated = [...prev];
        const currentQty = updated[existingIdx].qty;
        const newQty = currentQty + qty;
        const newTotalBase = Math.round(((newQty * multiplier)) * 10000) / 10000;
        updated[existingIdx] = {
          ...updated[existingIdx],
          qty: newQty,
          total_base_qty: newTotalBase
        };
        return updated;
      }

      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          variant_id: vId,
          product: fastSelectedProd,
          source_warehouse_id: sourceWarehouse.id,
          dest_warehouse_id: destWarehouseId || sourceWarehouse.id,
          source_location_id: sourceLocationId,
          dest_location_id: destLocationId,
          packaging_id: fastPackagingId,
          packaging_name: factorName,
          multiplier: multiplier,
          qty: qty,
          total_base_qty: totalBase,
          uom_base: fastSelectedProd.uom_base || 'UND',
          available_packagings: fastPackagings
        }
      ];
    });

    setFastSelectedProd(null);
    setFastCodeInput('');
    setFastPackagings([]);
    setFastPackagingId(0);
    setFastQty(1);

    setTimeout(() => {
      fastCodeInputRef.current?.focus();
    }, 60);
  };

  const updateBatchLineQty = (idx: number, newQty: number) => {
    if (newQty <= 0) {
      removeBatchLine(idx);
      return;
    }
    setBatchLines(prev => {
      const updated = [...prev];
      const item = updated[idx];
      if (!item) return prev;
      const totalBase = Math.round(((newQty * item.multiplier)) * 10000) / 10000;
      updated[idx] = { ...item, qty: newQty, total_base_qty: totalBase };
      return updated;
    });
  };

  const removeBatchLine = (idx: number) => {
    setBatchLines(prev => prev.filter((_, i) => i !== idx));
  };

  const openF2SearchModal = (initialQuery: string = '') => {
    const cleanQ = (initialQuery || '').trim();
    setF2SearchQuery(cleanQ);
    setF2SearchDialogVisible(true);
    runF2Search(cleanQ);
    setTimeout(() => {
      f2InputRef.current?.focus();
    }, 60);
  };

  const runF2Search = async (q: string) => {
    const clean = (q || '').trim();
    setF2Loading(true);
    try {
      const url = clean 
        ? `/products/selector?q=${encodeURIComponent(clean)}&limit=35` 
        : '/products/selector?limit=35';
      const res = await api.get(url);
      const list = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.items || []);
      setF2SearchResults(list);
      setF2SelectedIndex(0);
    } catch (e) {
      setF2SearchResults([]);
    } finally {
      setF2Loading(false);
    }
  };

  const packagingOptions = useMemo(() => {
    const baseOpt = {
      id: 0,
      name: 'Unidad',
      qty_per_unit: 1.0,
      label: `Unidad (${currentProductUom}) (x1)`,
      value: 0
    };
    const extraOpts = (availablePackagings || []).map((pkg: any) => ({
      id: pkg.id,
      name: pkg.name,
      qty_per_unit: Number(pkg.qty_per_unit) || 1,
      label: `📦 ${pkg.name} (${pkg.qty_per_unit} ${currentProductUom})`,
      value: pkg.id
    }));
    return [baseOpt, ...extraOpts];
  }, [availablePackagings, currentProductUom]);

  const selectedPackaging = useMemo(() => {
    return packagingOptions.find(p => p.value === selectedPackagingId) || packagingOptions[0];
  }, [packagingOptions, selectedPackagingId]);

  const totalBaseQty = useMemo(() => {
    const factor = selectedPackaging?.qty_per_unit || 1;
    return Math.round(((putawayQty || 0) * factor) * 10000) / 10000;
  }, [selectedPackaging, putawayQty]);

  const submitPutaway = async () => {
    if (relocationMode === 'batch') {
      if (batchLines.length === 0) {
        toast.current?.show({ 
          severity: 'warn', 
          summary: 'Lote Vacío', 
          detail: 'Agregue al menos un producto al lote antes de confirmar.' 
        });
        return;
      }

      setExecutingPutaway(true);
      try {
        const payload = {
          source_warehouse_id: sourceWarehouse.id,
          dest_warehouse_id: destWarehouseId || sourceWarehouse.id,
          source_location_id: sourceLocationId || null,
          dest_location_id: destLocationId || null,
          items: batchLines.map(line => ({
            variant_id: line.variant_id,
            qty: line.qty,
            packaging_id: line.packaging_id > 0 ? line.packaging_id : null,
            factor: line.multiplier,
            source_location_id: line.source_location_id || null,
            dest_warehouse_id: line.dest_warehouse_id || null,
            dest_location_id: line.dest_location_id || null
          }))
        };

        const res = await api.post('/wms/putaway/batch', payload);

        toast.current?.show({ 
          severity: 'success', 
          summary: 'Reubicación por Lote Exitosa', 
          detail: `Se reubicaron ${res.data.total_skus} SKUs (${res.data.total_units} unidades) satisfactoriamente.` 
        });

        setBatchLines([]);
        setPutawayDialogVisible(false);
        fetchTreeAndOccupancy(selectedFacilityFilter);

        if (stockDialogVisible && currentStockWarehouse) {
          fetchWarehouseStock(currentStockWarehouse.id, currentStockLocation?.id || null);
        }
      } catch (e: any) {
        toast.current?.show({ 
          severity: 'error', 
          summary: 'Error en Reubicación de Lote', 
          detail: extractErrorMessage(e, 'No se pudo procesar el lote de reubicación.') 
        });
      } finally {
        setExecutingPutaway(false);
      }
      return;
    }

    // Modo Individual
    if (!sourceWarehouse || !variantId || putawayQty <= 0) {
      toast.current?.show({ severity: 'warn', summary: 'Campos incompletos', detail: 'Complete el producto y la cantidad a reubicar.' });
      return;
    }

    const finalSrcLocId = (typeof sourceLocationId === 'object' && sourceLocationId !== null)
      ? Number((sourceLocationId as any).value) || null
      : (sourceLocationId && Number(sourceLocationId) > 0 ? Number(sourceLocationId) : null);

    const finalDestLocId = (typeof destLocationId === 'object' && destLocationId !== null)
      ? Number((destLocationId as any).value) || null
      : (destLocationId && Number(destLocationId) > 0 ? Number(destLocationId) : null);

    const targetDestWhId = (typeof destWarehouseId === 'object' && destWarehouseId !== null)
      ? Number((destWarehouseId as any).value) || sourceWarehouse.id
      : (destWarehouseId || sourceWarehouse.id);

    if (sourceWarehouse.id === targetDestWhId && finalSrcLocId && finalDestLocId && finalSrcLocId === finalDestLocId) {
      toast.current?.show({ 
        severity: 'warn', 
        summary: 'Ubicación Inválida', 
        detail: 'La ubicación de origen y destino no pueden ser la misma en el mismo almacén.' 
      });
      return;
    }

    if (sourceWarehouse.id === targetDestWhId && !finalSrcLocId && !finalDestLocId && (sourceWarehouse.locations?.length || 0) > 1) {
      toast.current?.show({ 
        severity: 'warn', 
        summary: 'Ubicación Inválida', 
        detail: 'Para reubicar dentro del mismo almacén, debe seleccionar una ubicación de destino diferente a la de origen.' 
      });
      return;
    }

    setExecutingPutaway(true);
    try {
      const factor = selectedPackaging?.qty_per_unit || 1;
      await api.post('/wms/putaway', {
        source_warehouse_id: sourceWarehouse.id,
        dest_warehouse_id: targetDestWhId,
        source_location_id: finalSrcLocId,
        dest_location_id: finalDestLocId,
        variant_id: variantId,
        qty: putawayQty,
        batch_id: batchId || null,
        packaging_id: selectedPackagingId > 0 ? selectedPackagingId : null,
        factor: factor
      });

      toast.current?.show({ 
        severity: 'success', 
        summary: 'Reubicación Exitosa', 
        detail: `Mercancía reubicada satisfactoriamente: ${totalBaseQty.toLocaleString()} ${currentProductUom}.` 
      });
      setPutawayDialogVisible(false);
      fetchTreeAndOccupancy(selectedFacilityFilter);

      // Si la consulta de stock está abierta, actualizarla al instante
      if (stockDialogVisible && currentStockWarehouse) {
        fetchWarehouseStock(currentStockWarehouse.id, currentStockLocation?.id || null);
      }
    } catch (e: any) {
      toast.current?.show({ 
        severity: 'error', 
        summary: 'Error de Reubicación', 
        detail: extractErrorMessage(e, 'No se pudo realizar el movimiento.') 
      });
    }
    setExecutingPutaway(false);
  };

  // =========================================================================
  // CREACIÓN DE ALMACENES Y UBICACIONES
  // =========================================================================
  const handleCreateWarehouse = async () => {
    if (!newWhFacilityId || !newWhName.trim() || !newWhCode.trim()) {
      toast.current?.show({ severity: 'warn', summary: 'Campos Incompletos', detail: 'Por favor complete sucursal, nombre y código de almacén.' });
      return;
    }

    setCreatingWarehouse(true);
    try {
      await api.post('/warehouses/', {
        facility_id: newWhFacilityId,
        name: newWhName.trim(),
        code: newWhCode.trim().toUpperCase(),
        is_active: true
      });
      toast.current?.show({ severity: 'success', summary: 'Almacén Creado', detail: `Almacén ${newWhName} registrado y habilitado con éxito.` });
      setNewWhDialogVisible(false);
      setNewWhName('');
      setNewWhCode('');
      fetchTreeAndOccupancy(selectedFacilityFilter);
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error al Crear', detail: extractErrorMessage(e, 'No se pudo registrar el almacén.') });
    }
    setCreatingWarehouse(false);
  };

  const openEditWarehouseDialog = (wh: any) => {
    setEditingWarehouse(wh);
    setEditWhName(wh.name || '');
    setEditWhDialogVisible(true);
  };

  const handleUpdateWarehouseName = async () => {
    if (!editingWarehouse || !editWhName.trim()) {
      toast.current?.show({ severity: 'warn', summary: 'Nombre Requerido', detail: 'El nombre del almacén no puede estar vacío.' });
      return;
    }

    setSavingEditWh(true);
    try {
      await api.put(`/warehouses/${editingWarehouse.id}`, {
        name: editWhName.trim()
      });
      toast.current?.show({
        severity: 'success',
        summary: 'Nombre Actualizado',
        detail: `El almacén ahora se llama "${editWhName.trim()}".`
      });
      setEditWhDialogVisible(false);
      setEditingWarehouse(null);
      fetchTreeAndOccupancy(selectedFacilityFilter);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Error al Actualizar',
        detail: extractErrorMessage(e, 'No se pudo actualizar el nombre del almacén.')
      });
    }
    setSavingEditWh(false);
  };

  const handleToggleWarehouseStatus = async (wh: any) => {
    const currentlyActive = wh.is_active !== false;
    const nextStatus = !currentlyActive;
    const actionLabel = nextStatus ? 'habilitar' : 'inhabilitar';

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        nextStatus
          ? `¿Desea habilitar nuevamente el almacén "${wh.name}" (${wh.code}) para permitir asignarle inventario?`
          : `¿Está seguro de inhabilitar el almacén "${wh.name}" (${wh.code})?\n\nMientras esté inhabilitado no se le podrá asignar inventario ni crear nuevas ubicaciones.`
      );
      if (!confirmed) return;
    }

    setTogglingWhId(wh.id);
    try {
      await api.put(`/warehouses/${wh.id}`, {
        is_active: nextStatus
      });
      toast.current?.show({
        severity: nextStatus ? 'success' : 'warn',
        summary: nextStatus ? 'Almacén Habilitado' : 'Almacén Inhabilitado',
        detail: nextStatus
          ? `El almacén "${wh.name}" está nuevamente habilitado para recibir inventario.`
          : `El almacén "${wh.name}" fue inhabilitado. No se permitirá asignarle inventario.`
      });
      fetchTreeAndOccupancy(selectedFacilityFilter);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: `Error al ${actionLabel}`,
        detail: extractErrorMessage(e, `No se pudo ${actionLabel} el almacén.`)
      });
    }
    setTogglingWhId(null);
  };

  const handleDeleteWarehouse = async (wh: any) => {
    if (wh.has_movements) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Eliminación Bloqueada',
        detail: 'Este almacén tiene movimientos históricos y no puede eliminarse. Utilice el botón de Inhabilitar.'
      });
      return;
    }

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        `¿Está seguro de eliminar definitivamente el almacén "${wh.name}" (${wh.code})?`
      );
      if (!confirmed) return;
    }

    setDeletingWhId(wh.id);
    try {
      await api.delete(`/warehouses/${wh.id}`);
      toast.current?.show({
        severity: 'success',
        summary: 'Almacén Eliminado',
        detail: `El almacén "${wh.name}" fue eliminado correctamente.`
      });
      fetchTreeAndOccupancy(selectedFacilityFilter);
    } catch (e: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'No se puede eliminar',
        detail: extractErrorMessage(e, 'No se pudo eliminar el almacén.')
      });
    }
    setDeletingWhId(null);
  };

  const handleCreateLocation = async () => {
    if (!newLocWarehouseId || !newLocName.trim() || !newLocCode.trim()) {
      toast.current?.show({ severity: 'warn', summary: 'Campos Incompletos', detail: 'Por favor complete almacén, nombre y código de ubicación.' });
      return;
    }

    setCreatingLocation(true);
    try {
      const parsedCapacity = typeof newLocCapacity === 'number' ? newLocCapacity : (parseFloat(String(newLocCapacity).replace(',', '.')) || 100.0);
      await api.post('/locations/', {
        warehouse_id: newLocWarehouseId,
        name: newLocName.trim(),
        code: newLocCode.trim().toUpperCase(),
        capacity_volume: parsedCapacity,
        location_type: (newLocType || 'SHELF').toUpperCase(),
        usage: 'INTERNAL'
      });
      toast.current?.show({ severity: 'success', summary: 'Ubicación Creada', detail: `Ubicación ${newLocName} registrada con capacidad de ${parsedCapacity} m³.` });
      setNewLocDialogVisible(false);
      setNewLocName('');
      setNewLocCode('');
      setNewLocCapacity(100);
      fetchTreeAndOccupancy(selectedFacilityFilter);
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error al Crear', detail: extractErrorMessage(e, 'No se pudo registrar la ubicación.') });
    }
    setCreatingLocation(false);
  };

  const getLocationTypeSeverity = (type: string): 'success' | 'info' | 'warning' | 'danger' | 'secondary' | 'contrast' => {
    switch (type) {
      case 'DOCK': return 'warning';
      case 'LOSS': return 'danger';
      case 'SHELF': return 'info';
      case 'PICKING': return 'success';
      case 'PRODUCTION': return 'contrast';
      case 'INTERNAL': return 'info';
      case 'ROW': return 'secondary';
      case 'BIN': return 'info';
      default: return 'secondary';
    }
  };

  const occupancyTemplate = (loc: any) => {
    if (!loc) return null;
    const occ = occupancyData[loc.id] || { percentage_used: 0, thermal_status: 'LOW' };
    const pct = occ.percentage_used || 0;
    
    let colorClass = "bg-emerald-500";
    let tagSeverity: any = "success";
    let tagLabel = "DESPEJADO";

    if (pct >= 90) {
      colorClass = "bg-red-500";
      tagSeverity = "danger";
      tagLabel = "SATURADO";
    } else if (pct >= 70) {
      colorClass = "bg-amber-500";
      tagSeverity = "warning";
      tagLabel = "OCUPADO";
    }

    return (
      <div className="w-36">
        <div className="flex justify-between items-center mb-1 text-[10px]">
          <span className="font-bold text-slate-700">{pct}%</span>
          <Tag value={tagLabel} severity={tagSeverity} className="text-[8px] px-1 py-0.2" />
        </div>
        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden border border-slate-300">
          <div className={`h-full ${colorClass} transition-all duration-500`} style={{ width: `${Math.min(100, pct)}%` }}></div>
        </div>
      </div>
    );
  };

  // Opciones de Almacén Destino (misma sucursal y únicamente HABILITADOS)
  const destWarehouseOptions = useMemo(() => {
    if (!sourceWarehouse) return [];
    return treeData
      .filter(wh => wh.facility_id === sourceWarehouse.facility_id && wh.is_active !== false)
      .map(wh => ({
        label: `${wh.name} (${wh.code})${wh.id === sourceWarehouse.id ? ' [Mismo Almacén]' : ''}`,
        value: wh.id
      }));
  }, [treeData, sourceWarehouse]);

  // Opciones de Ubicación Origen
  const sourceLocationOptions = useMemo(() => {
    if (!sourceWarehouse || !Array.isArray(sourceWarehouse.locations) || sourceWarehouse.locations.length === 0) {
      return [{ label: 'Muelle / Entrada General', value: 0 }];
    }
    return [
      { label: 'Cualquiera / Muelle de Descarga', value: 0 },
      ...sourceWarehouse.locations.map((l: any) => ({
        label: `${l.name} (${l.code}) [${l.location_type || 'SHELF'}]`,
        value: l.id
      }))
    ];
  }, [sourceWarehouse]);

  // Opciones de Ubicación Destino dinámicas
  const destLocationOptions = useMemo(() => {
    if (!destWarehouseId) return [];
    const targetWh = treeData.find(wh => wh.id === destWarehouseId);
    if (!targetWh || !targetWh.locations || targetWh.locations.length === 0) {
      return [{
        label: `✨ Ubicación General (${targetWh?.code || 'WH'}-STOCK)`,
        value: 0
      }];
    }
    return targetWh.locations.map((l: any) => ({
      label: `${l.name} (${l.code}) [${l.location_type || 'SHELF'}]`,
      value: l.id
    }));
  }, [treeData, destWarehouseId]);

  // Almacenes filtrados para el modal de Nueva Ubicación (solo habilitados)
  const filteredWarehousesForNewLoc = useMemo(() => {
    const activeWhs = treeData.filter(wh => wh.is_active !== false);
    if (!newLocFacilityId) return activeWhs;
    return activeWhs.filter(wh => wh.facility_id === newLocFacilityId);
  }, [treeData, newLocFacilityId]);

  // Selector de Sucursales (RBAC)
  const facilityDropdownOptions = useMemo(() => {
    if (isSuperUser) {
      return [
        { label: '🌐 Todas las Sucursales', value: 0 },
        ...facilities.map(f => ({ label: `🏢 ${f.name}`, value: f.id }))
      ];
    }
    // Usuario no superusuario: EXCLUSIVAMENTE sus sedes
    return facilities.map(f => ({ label: `🏢 ${f.name}`, value: f.id }));
  }, [facilities, isSuperUser]);

  const locationTypeOptions = [
    { label: 'Estante / Rack (SHELF)', value: 'SHELF' },
    { label: 'Zona de Picking / Nivel Piso (PICKING)', value: 'PICKING' },
    { label: 'Pasillo / Fila (ROW)', value: 'ROW' },
    { label: 'Bin / Gaveta (BIN)', value: 'BIN' },
    { label: 'Muelle de Carga / Descarga (DOCK)', value: 'DOCK' },
    { label: 'Área de Merma / Averías (LOSS)', value: 'LOSS' },
    { label: 'Área de Producción (PRODUCTION)', value: 'PRODUCTION' },
    { label: 'Ubicación de Tránsito (TRANSIT)', value: 'TRANSIT' },
    { label: 'Ubicación Interna General (INTERNAL)', value: 'INTERNAL' }
  ];

  return (
    <div className="p-4 sm:p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />
      
      {/* Header Principal */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>
        
        {/* Fila 1: Título de Pantalla */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 border-b border-slate-100 gap-2">
          <div className="pl-3">
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
              <i className="pi pi-sitemap text-emerald-500 mr-3"></i>Mapa Térmico de Almacenes y Reubicación
            </h1>
            <p className="text-slate-500 text-sm mt-1">Estructura jerárquica por sucursales, depósitos y estantes con auditoría y consulta de existencias en partida doble.</p>
          </div>

          <Button
            icon="pi pi-refresh"
            rounded
            outlined
            title="Actualizar Mapa"
            className="font-bold text-slate-600 border-slate-300 hover:bg-slate-50 self-end md:self-auto"
            onClick={() => fetchTreeAndOccupancy(selectedFacilityFilter)}
          />
        </div>

        {/* Fila 2: Barra Integrada de Filtros y Acciones Directas */}
        <div className="pt-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100 mt-2">
          {/* Selector de Sucursal (RBAC) */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 whitespace-nowrap flex items-center">
              <i className="pi pi-building text-slate-400 mr-1.5 text-sm"></i>Sucursal:
            </span>
            <Dropdown
              value={selectedFacilityFilter}
              options={facilityDropdownOptions}
              optionLabel="label"
              optionValue="value"
              onChange={(e) => handleFacilityFilterChange(e.value)}
              placeholder="Filtrar Sucursal..."
              className="w-64 text-xs font-bold shadow-none border-slate-300"
            />
          </div>

          {/* Botones de Acción */}
          <div className="flex items-center gap-2.5">
            <Button 
              label="Nuevo Almacén" 
              icon="pi pi-building" 
              outlined
              className="font-bold text-xs border-slate-300 text-slate-700 hover:bg-white shadow-sm"
              onClick={() => setNewWhDialogVisible(true)} 
            />

            <Button 
              label="Nueva Ubicación / Estante" 
              icon="pi pi-plus" 
              severity="success" 
              className="font-bold text-xs shadow-sm bg-emerald-600 border-emerald-600"
              onClick={() => {
                if (filteredWarehousesForNewLoc.length > 0) {
                  setNewLocWarehouseId(filteredWarehousesForNewLoc[0].id);
                }
                setNewLocDialogVisible(true);
              }} 
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-slate-500 font-bold flex items-center"><i className="pi pi-spin pi-spinner text-2xl mr-3 text-emerald-500"></i> Cargando mapa térmico de almacenes...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {treeData.map((wh) => {
            const isWhActive = wh.is_active !== false;
            return (
            <div key={wh.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col transition-all ${isWhActive ? 'border-slate-200' : 'border-red-200 opacity-85'}`}>
              <div className={`p-5 border-b border-slate-100 text-white flex justify-between items-center flex-wrap gap-2 ${isWhActive ? 'bg-slate-800' : 'bg-slate-700'}`}>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={`font-black text-lg flex items-center gap-2 ${isWhActive ? 'text-white' : 'text-slate-300 line-through'}`}>
                      <i className={`pi pi-building ${isWhActive ? 'text-emerald-400' : 'text-red-400'}`}></i> {wh.name}
                    </h3>
                    <Button
                      icon="pi pi-pencil"
                      rounded
                      text
                      size="small"
                      title="Editar nombre del almacén"
                      className="!w-7 !h-7 !p-0 text-slate-300 hover:text-white hover:bg-slate-700"
                      onClick={() => openEditWarehouseDialog(wh)}
                    />
                    <Tag 
                      value={`🏢 ${wh.facility_name || 'General'}`} 
                      severity="info" 
                      className="text-[10px] font-bold uppercase bg-slate-700 border border-slate-600 text-emerald-300 px-2 py-0.5" 
                    />
                    <Tag
                      value={isWhActive ? 'HABILITADO' : 'INHABILITADO'}
                      severity={isWhActive ? 'success' : 'danger'}
                      className="text-[10px] font-bold uppercase px-2 py-0.5"
                    />
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">CÓDIGO ALMACÉN: {wh.code}</p>
                </div>
                
                <div className="flex items-center gap-2 flex-wrap">
                  {wh.requires_dock_staging && (
                    <Tag value="CD (DOCK)" severity="warning" className="text-[10px] font-bold" />
                  )}
                  {/* Botón de Consulta Global del Almacén */}
                  <Button 
                    label="Consultar Almacén" 
                    icon="pi pi-box" 
                    size="small" 
                    outlined
                    className="font-bold text-xs border-emerald-400 text-emerald-300 hover:bg-emerald-950" 
                    onClick={() => openStockDialog(wh, null)} 
                  />
                  {/* Botón de Reubicación Directa */}
                  <Button 
                    label="Reubicar Mercancía" 
                    icon="pi pi-arrow-right-arrow-left" 
                    size="small" 
                    severity="success"
                    className="font-bold text-xs" 
                    onClick={() => openPutaway(wh)} 
                  />
                  {/* Botón Habilitar / Inhabilitar */}
                  <Button
                    icon={isWhActive ? "pi pi-ban" : "pi pi-check-circle"}
                    label={isWhActive ? "Inhabilitar" : "Habilitar"}
                    size="small"
                    outlined
                    loading={togglingWhId === wh.id}
                    severity={isWhActive ? "warning" : "success"}
                    title={isWhActive ? "Inhabilitar almacén (no permitirá asignarle inventario)" : "Habilitar almacén"}
                    className={`font-bold text-xs ${isWhActive ? 'border-amber-400 text-amber-300 hover:bg-amber-950' : 'border-emerald-400 text-emerald-300 hover:bg-emerald-950'}`}
                    onClick={() => handleToggleWarehouseStatus(wh)}
                  />
                  {/* Botón Eliminar (solo si no tiene movimientos) */}
                  {!wh.has_movements && (
                    <Button
                      icon="pi pi-trash"
                      size="small"
                      outlined
                      severity="danger"
                      loading={deletingWhId === wh.id}
                      title="Eliminar almacén sin movimientos"
                      className="font-bold text-xs border-red-400 text-red-300 hover:bg-red-950"
                      onClick={() => handleDeleteWarehouse(wh)}
                    />
                  )}
                </div>
              </div>

              {!isWhActive && (
                <div className="bg-red-50 border-b border-red-100 px-4 py-2 text-xs text-red-700 font-semibold flex items-center gap-2">
                  <i className="pi pi-ban text-red-600"></i>
                  <span>Almacén inhabilitado: No se permite asignarle nuevo inventario ni registrar estantes adicionales.</span>
                </div>
              )}

              <div className="p-4 flex-1">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Ubicaciones y Pasillos ({wh.locations?.length || 0})</h4>
                <DataTable 
                  value={wh.locations || []} 
                  size="small" 
                  className="p-datatable-sm text-slate-700 text-xs" 
                  stripedRows 
                  emptyMessage="No hay ubicaciones en este almacén. Use 'Consultar Almacén' para ver el inventario o cree la primera ubicación."
                >
                  <Column header="CÓDIGO" field="code" body={l => <span className="font-mono text-[11px] font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{l.code}</span>} sortable style={{ width: '16%' }} />
                  <Column header="UBICACIÓN" field="name" body={l => <span className="font-bold text-slate-800 text-xs">{l.name}</span>} sortable style={{ width: '26%' }} />
                  <Column header="TIPO" body={l => <Tag severity={getLocationTypeSeverity(l.location_type)} value={l.location_type} className="text-[9px] font-bold px-1 py-0.5" />} sortable style={{ width: '14%' }} />
                  <Column header="CAPACIDAD" body={l => <span className="font-mono text-xs text-slate-600 font-semibold">{l.capacity_volume || 10.0} m³</span>} sortable style={{ width: '14%' }} />
                  <Column header="SATURACIÓN" body={occupancyTemplate} style={{ width: '18%' }} />
                  {/* Botón Quirúrgico de Consulta por Ubicación */}
                  <Column 
                    header="STOCK" 
                    body={l => (
                      <Button 
                        icon="pi pi-eye" 
                        rounded 
                        text 
                        severity="info" 
                        size="small"
                        title="Consultar existencias de este estante"
                        onClick={() => openStockDialog(wh, l)} 
                      />
                    )} 
                    style={{ width: '12%', textAlign: 'center' }} 
                  />
                </DataTable>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* DIÁLOGO CONSULTA DE INVENTARIO (DOBLE NIVEL: UBICACIÓN Y ALMACÉN) */}
      <Dialog
        header={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
              <i className={currentStockLocation ? "pi pi-eye text-xl" : "pi pi-box text-xl"}></i>
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 tracking-tight leading-tight">
                {currentStockLocation 
                  ? `Existencias en Estante: ${currentStockLocation.name} (${currentStockLocation.code})`
                  : `Inventario Consolidado: ${currentStockWarehouse?.name || 'Almacén'}`
                }
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {currentStockWarehouse?.name} • Sucursal: {currentStockWarehouse?.facility_name || 'General'}
              </p>
            </div>
          </div>
        }
        visible={stockDialogVisible}
        onHide={() => setStockDialogVisible(false)}
        style={{ width: '92vw', maxWidth: '1100px' }}
        className="rounded-2xl overflow-hidden"
      >
        <div className="flex flex-col gap-4 py-2">
          {/* Tarjetas de KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Total SKUs Únicos</p>
                <h4 className="text-2xl font-black text-slate-800 mt-0.5">
                  {stockData?.summary?.total_skus || 0}
                </h4>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <i className="pi pi-tags text-lg"></i>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Total Unidades</p>
                <h4 className="text-2xl font-black text-emerald-600 mt-0.5">
                  {(stockData?.summary?.total_units || 0).toLocaleString()}
                </h4>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <i className="pi pi-box text-lg"></i>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Lotes Trazables</p>
                <h4 className="text-2xl font-black text-purple-600 mt-0.5">
                  {stockData?.summary?.total_lots || 0}
                </h4>
              </div>
              <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <i className="pi pi-calendar text-lg"></i>
              </div>
            </div>
          </div>

          {/* Barra de Filtro en Vivo */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <div className="relative flex-1">
              <i className="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none z-10"></i>
              <InputText
                value={stockSearchQuery}
                onChange={(e) => setStockSearchQuery(e.target.value)}
                placeholder="Buscar por SKU, código de barras, nombre de producto, lote o ubicación..."
                className="w-full !pl-9 text-xs font-medium"
                style={{ paddingLeft: '2.25rem' }}
              />
            </div>
            <Button
              icon="pi pi-refresh"
              outlined
              size="small"
              className="text-xs font-bold border-slate-300 text-slate-700"
              label="Refrescar"
              loading={loadingStock}
              onClick={() => fetchWarehouseStock(currentStockWarehouse.id, currentStockLocation?.id || null)}
            />
          </div>

          {/* Tabla de Existencias */}
          <DataTable
            value={filteredStockItems}
            loading={loadingStock}
            paginator
            rows={8}
            size="small"
            className="p-datatable-sm text-xs"
            stripedRows
            emptyMessage="No se encontraron existencias en esta consulta con los filtros seleccionados."
          >
            <Column
              header="SKU / CÓDIGO"
              body={(item) => (
                <div>
                  <span className="font-mono font-bold text-slate-800">{item.sku}</span>
                  {item.barcode && (
                    <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                      <i className="pi pi-barcode text-[9px]"></i> {item.barcode}
                    </p>
                  )}
                </div>
              )}
              sortable
              field="sku"
              style={{ width: '18%' }}
            />
            <Column
              header="PRODUCTO"
              body={(item) => (
                <span className="font-bold text-slate-800 leading-tight block">{item.name}</span>
              )}
              sortable
              field="name"
              style={{ width: '28%' }}
            />
            <Column
              header="UBICACIÓN"
              body={(item) => (
                <div className="flex flex-col">
                  <span className="font-bold text-slate-700 text-[11px]">{item.location_name}</span>
                  <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1 py-0.5 rounded w-max">
                    {item.location_code}
                  </span>
                </div>
              )}
              sortable
              field="location_name"
              style={{ width: '18%' }}
            />
            <Column
              header="LOTE / VENC."
              body={(item) => (
                item.lot_number ? (
                  <div className="flex flex-col gap-0.5">
                    <Tag severity="info" value={`Lote: ${item.lot_number}`} className="text-[9px] font-bold px-1 py-0.5" />
                    {item.expiration_date && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        Vence: {item.expiration_date}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-400 italic text-[11px]">Sin lote</span>
                )
              )}
              style={{ width: '14%' }}
            />
            <Column
              header="CANTIDAD"
              body={(item) => (
                <span className="font-mono font-black text-emerald-700 text-sm">
                  {(item.quantity ?? 0).toLocaleString()} <span className="text-[10px] font-normal text-slate-500">{item.uom || 'UND'}</span>
                </span>
              )}
              sortable
              field="quantity"
              style={{ width: '12%', textAlign: 'right' }}
            />
            <Column
              header="ACCIÓN"
              body={(item) => (
                <Button
                  icon="pi pi-arrow-right-arrow-left"
                  size="small"
                  outlined
                  severity="success"
                  title="Reubicar este producto"
                  label="Reubicar"
                  className="text-[10px] font-bold py-1 px-2"
                  onClick={() => handleReubicarFromStock(item)}
                />
              )}
              style={{ width: '10%', textAlign: 'center' }}
            />
          </DataTable>

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button
              label="Cerrar"
              text
              severity="secondary"
              onClick={() => setStockDialogVisible(false)}
            />
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO REUBICACIÓN (PUTAWAY) INTRA E INTER-ALMACÉN */}
      <Dialog 
        header={`Reubicación de Mercancía (${sourceWarehouse?.name || ''})`} 
        visible={putawayDialogVisible} 
        onHide={() => setPutawayDialogVisible(false)} 
        style={{ width: relocationMode === 'batch' ? '880px' : '540px', maxWidth: '96vw' }}
      >
        <div className="flex flex-col gap-3 py-1">
          {/* Selector de Modo: Por Lote vs Individual */}
          <div className="flex items-center justify-between bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setRelocationMode('batch');
                setTimeout(() => fastCodeInputRef.current?.focus(), 100);
              }}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                relocationMode === 'batch' 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <i className="pi pi-box"></i>
              <span>Por Lote / Multirrenglón (Rápido con Teclado)</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${relocationMode === 'batch' ? 'bg-emerald-800 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {batchLines.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRelocationMode('single')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                relocationMode === 'single' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <i className="pi pi-tag"></i>
              <span>Individual (1 Producto)</span>
            </button>
          </div>

          {/* Banner explicativo */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-xs text-blue-800 font-medium flex items-center">
            <i className="pi pi-arrow-right-arrow-left text-blue-600 text-base mr-2 shrink-0"></i>
            <span>Reubique existencias entre estantes del mismo depósito o transfiera a otros almacenes de la <strong>misma sucursal</strong>.</span>
          </div>

          {/* RUTA COMÚN: Origen y Destino */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            {/* Origen */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold text-slate-700">Almacén Origen:</label>
                <span className="text-[10px] text-slate-500 font-mono">Fijo</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <i className="pi pi-building text-slate-400"></i>
                <span className="truncate">{sourceWarehouse?.name || 'Origen'}</span>
              </div>
              <Dropdown 
                value={sourceLocationId}
                options={sourceLocationOptions}
                optionLabel="label"
                optionValue="value"
                onChange={(e) => setSourceLocationId(e.value)}
                placeholder="Muelle / Estante origen..."
                className="w-full text-xs font-bold"
              />
            </div>

            {/* Destino */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-700">Almacén Destino:</label>
              <Dropdown 
                value={destWarehouseId}
                options={destWarehouseOptions}
                optionLabel="label"
                optionValue="value"
                onChange={(e) => {
                  const newWhId = e.value;
                  setDestWarehouseId(newWhId);
                  const targetWh = treeData.find(w => w.id === newWhId);
                  if (targetWh && targetWh.locations && targetWh.locations.length > 0) {
                    setDestLocationId(targetWh.locations[0].id);
                  } else {
                    setDestLocationId(0);
                  }
                }}
                placeholder="Seleccionar almacén destino..."
                className="w-full text-xs font-bold"
              />
              <Dropdown 
                value={destLocationId}
                options={destLocationOptions}
                optionLabel="label"
                optionValue="value"
                onChange={(e) => setDestLocationId(e.value)}
                placeholder="Seleccionar estante destino..."
                className="w-full text-xs font-bold"
              />
            </div>
          </div>

          {/* CONTENIDO SEGÚN MODO */}
          {relocationMode === 'single' ? (
            /* MODO INDIVIDUAL */
            <div className="flex flex-col gap-3">
              {/* Selector de Producto */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Producto a Reubicar:</label>
                <Dropdown 
                  value={variantId}
                  options={productsList}
                  optionLabel="label"
                  optionValue="value"
                  onChange={(e) => {
                    const newVId = e.value;
                    setVariantId(newVId);
                    setSelectedPackagingId(0);
                    if (newVId) {
                      fetchVariantPackagings(newVId);
                    } else {
                      setAvailablePackagings([]);
                      setCurrentProductUom('UND');
                    }
                  }}
                  placeholder="Buscar por nombre, SKU o cualquier código..."
                  filter
                  filterBy="search_key,label,sku,name,product_name,barcodes_str"
                  onFilter={(e) => handleProductFilter(e.filter)}
                  showClear
                  className="w-full text-xs font-bold"
                />
              </div>

              {/* Presentación / Empaque y Cantidad */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">Presentación / Empaque:</label>
                    {loadingPackagings && <i className="pi pi-spin pi-spinner text-xs text-blue-500"></i>}
                  </div>
                  <Dropdown 
                    value={selectedPackagingId}
                    options={packagingOptions}
                    optionLabel="label"
                    optionValue="value"
                    onChange={(e) => setSelectedPackagingId(e.value ?? 0)}
                    placeholder="Seleccionar empaque..."
                    className="w-full text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cantidad a Mover {selectedPackagingId > 0 ? `(${selectedPackaging?.name || 'Empaques'})` : `(${currentProductUom})`}:
                  </label>
                  <InputNumber 
                    value={putawayQty}
                    onValueChange={(e) => setPutawayQty(e.value || 1)}
                    min={0.0001}
                    maxFractionDigits={4}
                    className="w-full"
                  />
                </div>

                {/* Cálculo en Vivo de Equivalencia en Kardex */}
                <div className="sm:col-span-2 bg-blue-50/70 border border-blue-200 rounded-lg p-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-blue-900 font-bold">
                    <i className="pi pi-calculator text-blue-600 text-sm"></i>
                    <span>Total a Reubicar en Kardex:</span>
                  </div>
                  <div className="font-mono font-black text-blue-700 text-sm flex items-center gap-1.5">
                    <span>{totalBaseQty.toLocaleString()}</span>
                    <span className="text-xs font-bold text-blue-600">{currentProductUom}</span>
                    {selectedPackagingId > 0 && (
                      <span className="text-[11px] font-normal text-slate-500 ml-1">
                        ({putawayQty} x {selectedPackaging?.qty_per_unit} {currentProductUom})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <Button label="Cancelar" text severity="secondary" onClick={() => setPutawayDialogVisible(false)} />
                <Button 
                  label="Confirmar Reubicación" 
                  icon="pi pi-check" 
                  severity="success" 
                  loading={executingPutaway}
                  onClick={submitPutaway} 
                  className="font-bold text-xs shadow-md" 
                />
              </div>
            </div>
          ) : (
            /* MODO POR LOTE / MULTIRRENGLÓN (RÁPIDO POR TECLADO) */
            <div className="flex flex-col gap-3">
              {/* Barra de Transcripción Rápida (Estilo Ajustes) */}
              <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <i className="pi pi-barcode text-emerald-600 text-sm"></i>
                    Transcripción Rápida con Pistola / Teclado:
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Presione <kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-800 font-bold shadow-xs">F2</kbd> para catálogo visual
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  {/* Input Código / Barra */}
                  <div className="sm:col-span-5 relative">
                    <i className={`pi ${fastSearching ? 'pi-spin pi-spinner text-emerald-600' : 'pi-search text-slate-400'} absolute left-3 top-1/2 -translate-y-1/2 text-xs z-10 pointer-events-none`}></i>
                    <InputText
                      ref={fastCodeInputRef}
                      value={fastCodeInput}
                      onChange={(e) => setFastCodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleFastLookup(fastCodeInput);
                        } else if (e.key === 'F2') {
                          e.preventDefault();
                          openF2SearchModal(fastCodeInput);
                        }
                      }}
                      placeholder="Barra, SKU o Código Neo... (Enter o F2)"
                      className="w-full text-xs font-bold !pl-9"
                    />
                  </div>

                  {/* Selector Empaque */}
                  <div className="sm:col-span-3">
                    <Dropdown
                      value={fastPackagingId}
                      options={[
                        { label: `Unidad (${fastSelectedProd?.uom_base || 'UND'}) (x1)`, value: 0 },
                        ...fastPackagings.map(p => ({
                          label: `📦 ${p.name} (x${p.qty_per_unit})`,
                          value: p.id
                        }))
                      ]}
                      optionLabel="label"
                      optionValue="value"
                      onChange={(e) => setFastPackagingId(e.value ?? 0)}
                      disabled={!fastSelectedProd}
                      placeholder="Empaque..."
                      className="w-full text-xs font-bold"
                    />
                  </div>

                  {/* Cantidad */}
                  <div className="sm:col-span-2">
                    <InputNumber
                      ref={fastQtyInputRef}
                      value={fastQty}
                      onValueChange={(e) => setFastQty(e.value || 1)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleFastAdd();
                        }
                      }}
                      min={0.0001}
                      maxFractionDigits={4}
                      disabled={!fastSelectedProd}
                      placeholder="Cant."
                      className="w-full"
                      inputClassName="text-xs font-bold text-center w-full"
                    />
                  </div>

                  {/* Botón Agregar */}
                  <div className="sm:col-span-2">
                    <Button
                      type="button"
                      label="Agregar ↵"
                      icon="pi pi-plus"
                      severity="success"
                      disabled={!fastSelectedProd}
                      onClick={handleFastAdd}
                      className="w-full text-xs font-bold h-full"
                    />
                  </div>
                </div>

                {/* Card de Producto Seleccionado */}
                {fastSelectedProd && (
                  <div className="flex items-center justify-between bg-white border border-emerald-300 rounded-lg px-3 py-1.5 text-xs animate-fade-in shadow-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-extrabold text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-300 shrink-0">
                        {fastSelectedProd.sku}
                      </span>
                      <span className="font-bold text-slate-800 truncate">
                        {fastSelectedProd.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[11px] text-emerald-800 font-bold">
                        Equiv: {(Number(fastQty || 1) * (fastPackagings.find(p => p.id === fastPackagingId)?.qty_per_unit || 1)).toLocaleString()} {fastSelectedProd.uom_base || 'UND'}
                      </span>
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 font-mono font-bold">
                        Enter en Cantidad para sumar ↵
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Grid / Tabla Dinámica del Lote */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-xs text-left text-slate-700">
                  <thead className="bg-slate-100 uppercase text-[10px] font-bold text-slate-600 border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5 w-[5%] text-center">#</th>
                      <th className="p-2.5 w-[40%]">PRODUCTO / SKU</th>
                      <th className="p-2.5 w-[20%] text-center">EMPAQUE</th>
                      <th className="p-2.5 w-[15%] text-center">CANTIDAD</th>
                      <th className="p-2.5 w-[13%] text-right">TOTAL KARDEX</th>
                      <th className="p-2.5 w-[7%] text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batchLines.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 bg-slate-50/50">
                          <i className="pi pi-box text-3xl mb-1 text-slate-300 block"></i>
                          <p className="font-bold text-slate-600 text-xs">No hay productos en este lote de reubicación.</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Escanee el código de barras o digite el SKU arriba y presione <b className="text-emerald-700">Enter</b>.</p>
                        </td>
                      </tr>
                    ) : (
                      batchLines.map((line, idx) => (
                        <tr key={line.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-2 text-center font-mono text-slate-400 text-[11px]">{idx + 1}</td>
                          <td className="p-2">
                            <div className="font-bold text-slate-800 text-xs truncate max-w-sm">{line.product.name}</div>
                            <div className="font-mono text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <span className="bg-slate-100 px-1 rounded border border-slate-200 text-slate-700 font-bold">{line.product.sku}</span>
                              {line.product.primary_barcode && (
                                <span className="text-slate-400">|| {line.product.primary_barcode}</span>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            <span className="inline-block bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[11px] font-bold border border-blue-200">
                              {line.packaging_name}
                            </span>
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs"
                                onClick={() => updateBatchLineQty(idx, line.qty - 1)}
                              >-</button>
                              <span className="font-mono font-bold text-xs px-2 min-w-8 text-center">{line.qty}</span>
                              <button
                                type="button"
                                className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs"
                                onClick={() => updateBatchLineQty(idx, line.qty + 1)}
                              >+</button>
                            </div>
                          </td>
                          <td className="p-2 text-right">
                            <span className="font-mono font-extrabold text-blue-700 text-xs">
                              {line.total_base_qty.toLocaleString()}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 ml-1">{line.uom_base}</span>
                          </td>
                          <td className="p-2 text-center">
                            <Button
                              icon="pi pi-trash"
                              text
                              rounded
                              severity="danger"
                              size="small"
                              onClick={() => removeBatchLine(idx)}
                              title="Eliminar de lote"
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Resumen y Acciones Finales del Lote */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 mt-1">
                <div className="flex items-center gap-4 text-xs">
                  <span className="font-bold text-slate-600">
                    Renglones: <b className="text-slate-900 font-mono text-sm">{batchLines.length}</b> SKUs
                  </span>
                  <span className="font-bold text-slate-600">
                    Total a Mover: <b className="text-blue-700 font-mono text-sm">
                      {batchLines.reduce((acc, l) => acc + l.total_base_qty, 0).toLocaleString()}
                    </b> unidades
                  </span>
                  {batchLines.length > 0 && (
                    <Button
                      label="Vaciar Lote"
                      icon="pi pi-times"
                      text
                      severity="danger"
                      className="text-[11px] p-0 font-bold"
                      onClick={() => setBatchLines([])}
                    />
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Button
                    label="Cancelar"
                    text
                    severity="secondary"
                    onClick={() => setPutawayDialogVisible(false)}
                  />
                  <Button
                    label={`Confirmar Reubicación (${batchLines.length} SKUs)`}
                    icon="pi pi-check"
                    severity="success"
                    loading={executingPutaway}
                    disabled={batchLines.length === 0}
                    onClick={submitPutaway}
                    className="font-bold text-xs shadow-md"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* DIÁLOGO NUEVO ALMACÉN / DEPÓSITO */}
      <Dialog 
        header="Crear Nuevo Almacén / Depósito" 
        visible={newWhDialogVisible} 
        onHide={() => setNewWhDialogVisible(false)} 
        style={{ width: '500px' }}
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 font-medium flex items-center">
            <i className="pi pi-building text-blue-600 text-lg mr-2"></i>
            <span>Registre un nuevo almacén asignándolo explícitamente a su <strong>Sucursal / Sede</strong>.</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Sucursal / Sede Propietaria:</label>
            <Dropdown 
              value={newWhFacilityId}
              options={facilities.map(f => ({ label: `🏢 ${f.name}`, value: f.id }))}
              optionLabel="label"
              optionValue="value"
              onChange={(e) => setNewWhFacilityId(e.value)}
              className="w-full text-xs font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nombre del Almacén:</label>
            <InputText 
              value={newWhName}
              onChange={(e) => setNewWhName(e.target.value)}
              placeholder="Ej. Depósito Principal, Cámara Fría, Almacén de Cambios..."
              className="w-full text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Código del Almacén:</label>
            <InputText 
              value={newWhCode}
              onChange={(e) => setNewWhCode(e.target.value)}
              placeholder="Ej. ALM-PRINCIPAL, CAM-FRIA"
              className="w-full text-xs font-mono font-bold"
            />
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <Button label="Cancelar" text severity="secondary" onClick={() => setNewWhDialogVisible(false)} />
            <Button 
              label="Guardar Almacén" 
              icon="pi pi-check" 
              severity="info" 
              loading={creatingWarehouse}
              onClick={handleCreateWarehouse} 
              className="font-bold text-xs shadow-md" 
            />
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO EDITAR NOMBRE DE ALMACÉN */}
      <Dialog
        header="Editar Almacén / Depósito"
        visible={editWhDialogVisible}
        onHide={() => {
          setEditWhDialogVisible(false);
          setEditingWarehouse(null);
        }}
        style={{ width: '480px', maxWidth: '95vw' }}
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 font-medium flex items-center">
            <i className="pi pi-info-circle text-amber-600 text-lg mr-2"></i>
            <span>Por integridad de trazabilidad, al editar un almacén <strong>solo se permite modificar su nombre</strong>.</span>
          </div>

          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Sucursal / Sede:</label>
              <InputText
                value={editingWarehouse?.facility_name || ''}
                disabled
                className="w-full text-xs font-bold bg-slate-100 text-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Código de Almacén:</label>
              <InputText
                value={editingWarehouse?.code || ''}
                disabled
                className="w-full text-xs font-mono font-bold bg-slate-100 text-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nombre del Almacén:</label>
            <InputText
              value={editWhName}
              onChange={(e) => setEditWhName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleUpdateWarehouseName();
                }
              }}
              placeholder="Ej. Almacén Principal CUMBOTO"
              className="w-full text-xs font-bold"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <Button
              label="Cancelar"
              text
              severity="secondary"
              onClick={() => {
                setEditWhDialogVisible(false);
                setEditingWarehouse(null);
              }}
            />
            <Button
              label="Guardar Nombre"
              icon="pi pi-check"
              severity="success"
              loading={savingEditWh}
              onClick={handleUpdateWarehouseName}
              className="font-bold text-xs shadow-md"
            />
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO NUEVA UBICACIÓN / ESTANTE */}
      <Dialog 
        header="Crear Nueva Ubicación en Almacén" 
        visible={newLocDialogVisible} 
        onHide={() => setNewLocDialogVisible(false)} 
        style={{ width: '520px' }}
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 font-medium flex items-center">
            <i className="pi pi-plus-circle text-emerald-600 text-lg mr-2"></i>
            <span>Agregue un nuevo pasillo, estante o posición definiendo su <strong>capacidad volumétrica máxima</strong>.</span>
          </div>

          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Sucursal / Sede:</label>
              <Dropdown 
                value={newLocFacilityId}
                options={facilities.map(f => ({ label: `🏢 ${f.name}`, value: f.id }))}
                optionLabel="label"
                optionValue="value"
                onChange={(e) => {
                  setNewLocFacilityId(e.value);
                  const firstWh = treeData.find(wh => wh.facility_id === e.value);
                  if (firstWh) setNewLocWarehouseId(firstWh.id);
                }}
                className="w-full text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Almacén / Depósito:</label>
              <Dropdown 
                value={newLocWarehouseId}
                options={filteredWarehousesForNewLoc.map(wh => ({ label: `${wh.name} (${wh.code})`, value: wh.id }))}
                optionLabel="label"
                optionValue="value"
                onChange={(e) => setNewLocWarehouseId(e.value)}
                placeholder="Seleccionar Almacén..."
                className="w-full text-xs font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nombre de la Ubicación:</label>
            <InputText 
              value={newLocName}
              onChange={(e) => setNewLocName(e.target.value)}
              placeholder="Ej. Pasillo A - Estante 01 - Nivel 2"
              className="w-full text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Código de Ubicación:</label>
              <InputText 
                value={newLocCode}
                onChange={(e) => setNewLocCode(e.target.value)}
                placeholder="Ej. PAS-A-EST01"
                className="w-full text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Capacidad Máxima (m³):</label>
              <InputNumber 
                value={newLocCapacity}
                onValueChange={(e) => setNewLocCapacity(e.value || 100)}
                min={0.1}
                maxFractionDigits={2}
                placeholder="Ej. 5.0"
                className="w-full text-xs font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Ubicación:</label>
            <Dropdown 
              value={newLocType}
              options={locationTypeOptions}
              optionLabel="label"
              optionValue="value"
              onChange={(e) => setNewLocType(e.value)}
              className="w-full text-xs font-bold"
            />
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <Button label="Cancelar" text severity="secondary" onClick={() => setNewLocDialogVisible(false)} />
            <Button 
              label="Guardar Ubicación" 
              icon="pi pi-check" 
              severity="success" 
              loading={creatingLocation}
              onClick={handleCreateLocation} 
              className="font-bold text-xs shadow-md" 
            />
          </div>
        </div>
      </Dialog>

      {/* DIÁLOGO BÚSQUEDA RÁPIDA F2 */}
      <Dialog
        header="Búsqueda Rápida de Productos (F2)"
        visible={f2SearchDialogVisible}
        onHide={() => setF2SearchDialogVisible(false)}
        style={{ width: '680px', maxWidth: '95vw' }}
      >
        <div className="flex flex-col gap-3 py-1">
          <div className="relative">
            <i className={`pi ${f2Loading ? 'pi-spin pi-spinner text-emerald-600' : 'pi-search text-slate-400'} absolute left-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none z-10`}></i>
            <InputText
              ref={f2InputRef}
              value={f2SearchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setF2SearchQuery(val);
                runF2Search(val);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setF2SelectedIndex(prev => Math.min(prev + 1, f2SearchResults.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setF2SelectedIndex(prev => Math.max(prev - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (f2SearchResults[f2SelectedIndex]) {
                    selectProductForFastEntry(f2SearchResults[f2SelectedIndex]);
                    setF2SearchDialogVisible(false);
                  }
                } else if (e.key === 'Escape') {
                  setF2SearchDialogVisible(false);
                }
              }}
              placeholder="Escriba código, SKU, nombre de producto..."
              className="w-full text-xs font-bold !pl-9"
              autoFocus
            />
          </div>

          <div ref={f2ListContainerRef} className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
            {f2SearchResults.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                {f2Loading ? 'Buscando productos...' : 'No se encontraron productos coincidentes.'}
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-[10px] font-bold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-2 w-28">SKU</th>
                    <th className="p-2">DESCRIPCIÓN</th>
                    <th className="p-2 w-20 text-center">UOM</th>
                    <th className="p-2 w-20 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {f2SearchResults.map((prod, idx) => {
                    const isSelected = idx === f2SelectedIndex;
                    return (
                      <tr
                        key={prod.value || prod.id}
                        data-f2-index={idx}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50 text-emerald-900 font-bold' : 'hover:bg-slate-50'}`}
                        onClick={() => {
                          selectProductForFastEntry(prod);
                          setF2SearchDialogVisible(false);
                        }}
                      >
                        <td className="p-2 font-mono text-[11px]">{prod.sku}</td>
                        <td className="p-2">{prod.name || prod.label}</td>
                        <td className="p-2 text-center text-slate-500 font-mono text-[10px]">{prod.uom_base || 'UND'}</td>
                        <td className="p-2 text-center">
                          <Button
                            icon="pi pi-check"
                            label="Elegir"
                            size="small"
                            severity={isSelected ? 'success' : 'secondary'}
                            text={!isSelected}
                            className="text-[10px] py-0.5 px-2 font-bold"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Use las flechas <kbd className="bg-slate-100 border px-1 rounded">↑</kbd> <kbd className="bg-slate-100 border px-1 rounded">↓</kbd> y presione <kbd className="bg-slate-100 border px-1 rounded">Enter</kbd> para seleccionar.</span>
            <span>ESC para cerrar</span>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
