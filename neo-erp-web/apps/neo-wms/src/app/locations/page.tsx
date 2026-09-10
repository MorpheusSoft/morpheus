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

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products/?limit=2000');
      const formattedOptions: any[] = [];
      let prodList: any[] = [];
      if (Array.isArray(res.data)) {
        prodList = res.data;
      } else if (res.data?.items && Array.isArray(res.data.items)) {
        prodList = res.data.items;
      } else if (res.data?.data && Array.isArray(res.data.data)) {
        prodList = res.data.data;
      }

      prodList.forEach((p: any) => {
        if (p && p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
          p.variants.forEach((v: any) => {
            formattedOptions.push({
              label: `${p.name || 'Producto'} ${v.sku ? `(SKU: ${v.sku})` : ''}`,
              value: v.id
            });
          });
        } else if (p && p.id) {
          formattedOptions.push({
            label: `${p.name || 'Producto'} (ID: ${p.id})`,
            value: p.id
          });
        }
      });

      setProductsList(formattedOptions);
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
    setDestWarehouseId(wh.id);
    setSourceLocationId(preselectedLocId ? Number(preselectedLocId) : 0);
    
    // Si el almacén tiene ubicaciones y preselectedLocId está definido, sugerir otra si existe
    const targetWhLocs = wh.locations || [];
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

    setPutawayDialogVisible(true);
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
        code: newWhCode.trim().toUpperCase()
      });
      toast.current?.show({ severity: 'success', summary: 'Almacén Creado', detail: `Almacén ${newWhName} registrado con éxito.` });
      setNewWhDialogVisible(false);
      setNewWhName('');
      setNewWhCode('');
      fetchTreeAndOccupancy(selectedFacilityFilter);
    } catch (e: any) {
      toast.current?.show({ severity: 'error', summary: 'Error al Crear', detail: extractErrorMessage(e, 'No se pudo registrar el almacén.') });
    }
    setCreatingWarehouse(false);
  };

  const handleCreateLocation = async () => {
    if (!newLocWarehouseId || !newLocName.trim() || !newLocCode.trim()) {
      toast.current?.show({ severity: 'warn', summary: 'Campos Incompletos', detail: 'Por favor complete almacén, nombre y código de ubicación.' });
      return;
    }

    setCreatingLocation(true);
    try {
      await api.post('/locations/', {
        warehouse_id: newLocWarehouseId,
        name: newLocName.trim(),
        code: newLocCode.trim().toUpperCase(),
        capacity_volume: newLocCapacity || 100.0,
        location_type: newLocType,
        usage: 'INTERNAL'
      });
      toast.current?.show({ severity: 'success', summary: 'Ubicación Creada', detail: `Ubicación ${newLocName} registrada con capacidad de ${newLocCapacity} m³.` });
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

  const getLocationTypeSeverity = (type: string) => {
    switch (type) {
      case 'DOCK': return 'warning';
      case 'LOSS': return 'danger';
      case 'SHELF': return 'info';
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

  // Opciones de Almacén Destino (misma sucursal)
  const destWarehouseOptions = useMemo(() => {
    if (!sourceWarehouse) return [];
    return treeData
      .filter(wh => wh.facility_id === sourceWarehouse.facility_id)
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

  // Almacenes filtrados para el modal de Nueva Ubicación
  const filteredWarehousesForNewLoc = useMemo(() => {
    if (!newLocFacilityId) return treeData;
    return treeData.filter(wh => wh.facility_id === newLocFacilityId);
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
    { label: 'Muelle Descarga (DOCK)', value: 'DOCK' },
    { label: 'Merma / Dañados (LOSS)', value: 'LOSS' },
    { label: 'Ubicación Interna (INTERNAL)', value: 'INTERNAL' }
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
          {treeData.map((wh) => (
            <div key={wh.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-100 bg-slate-800 text-white flex justify-between items-center flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-black text-lg flex items-center gap-2 text-white">
                      <i className="pi pi-building text-emerald-400"></i> {wh.name}
                    </h3>
                    <Tag 
                      value={`🏢 ${wh.facility_name || 'General'}`} 
                      severity="info" 
                      className="text-[10px] font-bold uppercase bg-slate-700 border border-slate-600 text-emerald-300 px-2 py-0.5" 
                    />
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">CÓDIGO ALMACÉN: {wh.code}</p>
                </div>
                
                <div className="flex items-center gap-2">
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
                </div>
              </div>

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
          ))}
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
              <i className="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <InputText
                value={stockSearchQuery}
                onChange={(e) => setStockSearchQuery(e.target.value)}
                placeholder="Buscar por SKU, código de barras, nombre de producto, lote o ubicación..."
                className="w-full pl-8 text-xs font-medium"
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
        style={{ width: '540px' }}
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 font-medium flex items-center">
            <i className="pi pi-arrow-right-arrow-left text-blue-600 text-lg mr-2"></i>
            <span>Reubique existencias entre estantes del mismo depósito o transfiera a otros almacenes de la <strong>misma sucursal</strong>.</span>
          </div>

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
              placeholder="Seleccionar variante o SKU..."
              filter
              showClear
              className="w-full text-xs font-bold"
            />
          </div>

          {/* Origen: Almacén y Ubicación */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Almacén Origen:</label>
              <div className="bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <i className="pi pi-building text-slate-400"></i>
                <span className="truncate">{sourceWarehouse?.name || 'Origen'}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Ubicación Origen:</label>
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
          </div>

          {/* Destino: Almacén y Ubicación */}
          <div className="grid grid-cols-2 gap-3 bg-emerald-50/50 p-3 rounded-xl border border-emerald-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Almacén Destino:</label>
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
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Ubicación Destino:</label>
              <Dropdown 
                value={destLocationId}
                options={destLocationOptions}
                optionLabel="label"
                optionValue="value"
                onChange={(e) => setDestLocationId(e.value)}
                placeholder="Seleccionar posición destino..."
                className="w-full text-xs font-bold"
              />
            </div>
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

          <div className="flex justify-end gap-2 mt-3">
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
    </div>
  );
}
