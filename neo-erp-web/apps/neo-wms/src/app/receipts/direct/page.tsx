"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Calendar } from 'primereact/calendar';
import { Dropdown } from 'primereact/dropdown';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Toast } from 'primereact/toast';
import { Dialog } from 'primereact/dialog';
import { Tag } from 'primereact/tag';
import api from '@/lib/api';
import { isWeightUom, sanitizeQuantity, preventDecimalKey } from '@/lib/uom';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

export default function DirectReceiptPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [allWarehouses, setAllWarehouses] = useState<any[]>([]);
  const [filteredWarehouses, setFilteredWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [receiptDate, setReceiptDate] = useState<Date | null>(new Date());
  const [notes, setNotes] = useState('');

  // Moneda y Tasa de Cambio del Documento (Factura)
  const [docCurrency, setDocCurrency] = useState<'VES' | 'USD'>('VES');
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [exchangeRateText, setExchangeRateText] = useState<string>('1');
  const [bcvRateRef, setBcvRateRef] = useState<number>(1);

  // Table Lines
  const [lines, setLines] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [receiptVoucher, setReceiptVoucher] = useState<any | null>(null);
  const [ticketData, setTicketData] = useState<any | null>(null);
  const [ticketDialogVisible, setTicketDialogVisible] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<any | null>(null);

  const formatReceiptQty = (val: number | string | null | undefined, uom?: string | null): string => {
    const num = Number(val || 0);
    if (isNaN(num)) return isWeightUom(uom) ? '0.000' : '0';
    return isWeightUom(uom) ? num.toFixed(3) : String(Math.round(num));
  };

  // Modal: Agregar Producto
  const [addProductModalVisible, setAddProductModalVisible] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const productFilterTimeoutRef = useRef<any>(null);

  // Empaque y Modo de Costo en el Modal
  const [selectedPackId, setSelectedPackId] = useState<number | null>(null); // null = Unidad Base, -1 = Empaque personalizado, >0 = ID de ProductPackaging
  const [selectedPackName, setSelectedPackName] = useState<string>('UND');
  const [inputUnitsPerPack, setInputUnitsPerPack] = useState<number>(1);
  const [costEntryMode, setCostEntryMode] = useState<'PACK' | 'UNIT'>('PACK');
  const [inputExpectedQty, setInputExpectedQty] = useState<number>(1);
  const [inputQty, setInputQty] = useState<number>(1);
  const [inputRawCost, setInputRawCost] = useState<number>(0); // Monto digitado en la moneda del documento (por empaque o por unidad)
  const [inputRawCostText, setInputRawCostText] = useState<string>(''); // Texto libre para evitar saltos de cursor al escribir decimales
  const [inputLotNumber, setInputLotNumber] = useState<string>('');
  const [inputExpirationDate, setInputExpirationDate] = useState<Date | null>(null);

  // Calculadora de Transformación (Piezas / Gramos -> Kilos y Costo por KG)
  const [calcVisible, setCalcVisible] = useState<boolean>(false);
  const [calcPiecesText, setCalcPiecesText] = useState<string>('1');
  const [calcWeightMode, setCalcWeightMode] = useState<'PER_PIECE' | 'TOTAL_WEIGHT'>('PER_PIECE');
  const [calcWeightUnit, setCalcWeightUnit] = useState<'KG' | 'G'>('KG');
  const [calcWeightText, setCalcWeightText] = useState<string>('');
  const [calcCostMode, setCalcCostMode] = useState<'PER_PIECE' | 'TOTAL_LINE'>('PER_PIECE');
  const [calcCostText, setCalcCostText] = useState<string>('');

  // Modal: Reportar Avería / Devolución por Calidad
  const [discrepancyDialogVisible, setDiscrepancyDialogVisible] = useState(false);
  const [discrepancyIndex, setDiscrepancyIndex] = useState<number | null>(null);
  const [discrepancyDamagedQty, setDiscrepancyDamagedQty] = useState<number>(0);
  const [discrepancyReason, setDiscrepancyReason] = useState<string>('');

  const toast = useRef<Toast>(null);
  const router = useRouter();

  const fetchProductsSelector = async (queryText: string = '') => {
    setSearchingProducts(true);
    try {
      const qParam = queryText.trim() ? `&q=${encodeURIComponent(queryText.trim())}` : '';
      const prodRes = await api.get(`/products/selector?limit=150${qParam}`);
      const list = Array.isArray(prodRes.data) ? prodRes.data : (prodRes.data?.data || prodRes.data?.items || []);
      const mapped = list.map((item: any) => ({
        ...item,
        label: item.label || `[${item.sku}] ${item.name || item.product_name}`,
        value: item.value || item.variant_id || item.id,
        sku: item.sku || `PRD-${item.variant_id || item.id}`,
        product_name: item.product_name || item.name || 'Producto',
        name: item.name || item.product_name || 'Producto',
        uom_base: item.uom_base || 'UND',
        cost: parseFloat(item.cost || 0),
        packagings: Array.isArray(item.packagings) ? item.packagings : [],
        barcodes_str: item.barcodes_str || '',
        search_key: item.search_key || `${item.sku || ''} ${item.name || ''} ${item.barcodes_str || ''} ${queryText}`.toLowerCase()
      }));
      setProducts(prev => {
        if (selectedVariant && !mapped.some((m: any) => m.value === selectedVariant.value)) {
          return [selectedVariant, ...mapped];
        }
        return mapped;
      });
    } catch (e) {
      console.error("Error loading products selector:", e);
    } finally {
      setSearchingProducts(false);
    }
  };

  const handleProductFilter = (filterText: string) => {
    if (productFilterTimeoutRef.current) clearTimeout(productFilterTimeoutRef.current);
    productFilterTimeoutRef.current = setTimeout(() => {
      fetchProductsSelector(filterText || '');
    }, 200);
  };

  const loadFormData = async () => {
    // 0. Fetch Usuario Activo de Sesión
    try {
      const meRes = await api.get('/users/me');
      setCurrentUser(meRes.data || null);
    } catch (e) {
      console.error("Error loading active user:", e);
    }

    // 1. Fetch Currencies (Tasa BCV actual por defecto)
    try {
      const curRes = await api.get('/currencies/');
      const curList = Array.isArray(curRes.data) ? curRes.data : (curRes.data?.data || curRes.data?.items || []);
      const ves = curList.find((c: any) => (c.code || '').toUpperCase() === 'VES');
      if (ves && Number(ves.exchange_rate) > 0) {
        const rateVal = Number(ves.exchange_rate);
        setExchangeRate(rateVal);
        setExchangeRateText(String(rateVal));
        setBcvRateRef(rateVal);
      }
    } catch (e) {
      console.error("Error loading currencies:", e);
    }

    // 2. Fetch Suppliers
    try {
      const supRes = await api.get('/suppliers/?limit=5000');
      const suppliersList = Array.isArray(supRes.data) ? supRes.data : (supRes.data?.data || supRes.data?.items || []);
      setSuppliers(suppliersList.map((s: any) => ({ label: `${s.name} ${s.tax_id ? `(${s.tax_id})` : ''}`, value: s.id })));
    } catch(e) {
      console.error("Error loading suppliers:", e);
    }

    // 3. Fetch Facilities
    try {
      const facRes = await api.get('/facilities/');
      const facilitiesList = Array.isArray(facRes.data) ? facRes.data : (facRes.data?.data || facRes.data?.items || []);
      setFacilities(facilitiesList.map((f: any) => ({ label: f.name, value: f.id })));
    } catch(e) {
      console.error("Error loading facilities:", e);
    }

    // 4. Fetch Initial Products via fast selector
    await fetchProductsSelector('');
  };

  useEffect(() => {
    loadFormData();
  }, []);

  // Dynamically load warehouses whenever selected facility changes
  useEffect(() => {
    const fetchWarehouses = async () => {
      if (!selectedFacilityId) {
        setFilteredWarehouses([]);
        setSelectedWarehouseId(null);
        return;
      }

      try {
        const res = await api.get(`/warehouses/?facility_id=${selectedFacilityId}`);
        const whList = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        let whOptions = whList.map((w: any) => ({
          label: `${w.name} ${w.code ? `(${w.code})` : ''}`,
          value: w.id
        }));

        if (whOptions.length === 0) {
          const facName = facilities.find(f => Number(f.value) === Number(selectedFacilityId))?.label || '';
          whOptions = [{ label: `Almacén Principal ${facName} (Predeterminado)`, value: null }];
        }

        setFilteredWarehouses(whOptions);
        setSelectedWarehouseId(whOptions[0].value);
      } catch (e) {
        console.error("Error fetching facility warehouses:", e);
        setFilteredWarehouses([]);
        setSelectedWarehouseId(null);
      }
    };

    fetchWarehouses();
  }, [selectedFacilityId, facilities]);

  const safeRate = Number(exchangeRate) > 0 ? Number(exchangeRate) : 1;

  const computeSuggestedRawCost = (
    baseUnitCostUsd: number,
    factor: number,
    mode: 'PACK' | 'UNIT',
    curr: 'VES' | 'USD',
    rate: number
  ) => {
    const unitUsd = Number(baseUnitCostUsd || 0);
    const mult = mode === 'PACK' ? Math.max(1, Number(factor || 1)) : 1;
    const baseUsd = unitUsd * mult;
    const raw = curr === 'VES' ? baseUsd * Math.max(1, Number(rate || 1)) : baseUsd;
    return Number(raw.toFixed(4));
  };

  const applySuggestedRawCost = (val: number) => {
    const cleanVal = Number(val || 0);
    setInputRawCost(cleanVal);
    setInputRawCostText(cleanVal > 0 ? String(Number(cleanVal.toFixed(2))) : '');
  };

  const handleSelectVariant = (variantId: number) => {
    const item = products.find(p => p.value === variantId);
    if (item) {
      setSelectedVariant(item);
      const packs = Array.isArray(item.packagings) ? item.packagings : [];
      const firstPack = packs.find((pk: any) => Number(pk.qty_per_unit) > 1) || packs[0] || null;
      if (firstPack && Number(firstPack.qty_per_unit) > 1) {
        const factor = Number(firstPack.qty_per_unit);
        setSelectedPackId(firstPack.id);
        setSelectedPackName(firstPack.name || 'EMPAQUE');
        setInputUnitsPerPack(factor);
        setCostEntryMode('PACK');
        applySuggestedRawCost(computeSuggestedRawCost(item.cost, factor, 'PACK', docCurrency, safeRate));
      } else {
        setSelectedPackId(null);
        setSelectedPackName(item.uom_base || 'UND');
        setInputUnitsPerPack(1);
        setCostEntryMode('UNIT');
        applySuggestedRawCost(computeSuggestedRawCost(item.cost, 1, 'UNIT', docCurrency, safeRate));
      }
    }
  };

  const handleSelectPackagingOption = (packVal: number | null) => {
    if (!selectedVariant) return;
    const packs = Array.isArray(selectedVariant.packagings) ? selectedVariant.packagings : [];
    if (packVal === null) {
      setSelectedPackId(null);
      setSelectedPackName(selectedVariant.uom_base || 'UND');
      setInputUnitsPerPack(1);
      setCostEntryMode('UNIT');
      applySuggestedRawCost(computeSuggestedRawCost(selectedVariant.cost, 1, 'UNIT', docCurrency, safeRate));
    } else if (packVal === -1) {
      const factor = inputUnitsPerPack > 1 ? inputUnitsPerPack : 12;
      setSelectedPackId(-1);
      setSelectedPackName('EMPAQUE');
      setInputUnitsPerPack(factor);
      setCostEntryMode('PACK');
      applySuggestedRawCost(computeSuggestedRawCost(selectedVariant.cost, factor, 'PACK', docCurrency, safeRate));
    } else {
      const found = packs.find((pk: any) => Number(pk.id) === Number(packVal));
      const factor = found ? Number(found.qty_per_unit || 1) : 1;
      const mode = factor > 1 ? 'PACK' : 'UNIT';
      setSelectedPackId(found ? found.id : null);
      setSelectedPackName(found?.name || 'EMPAQUE');
      setInputUnitsPerPack(factor);
      setCostEntryMode(mode);
      applySuggestedRawCost(computeSuggestedRawCost(selectedVariant.cost, factor, mode, docCurrency, safeRate));
    }
  };

  // Cálculos en vivo dentro del Modal
  const activeFactor = selectedPackId !== null ? Math.max(1, Number(inputUnitsPerPack || 1)) : 1;
  const modalExpectedBaseQty = sanitizeQuantity((Number(inputExpectedQty) || 0) * activeFactor, selectedVariant?.uom_base);
  const modalReceivedBaseQty = sanitizeQuantity((Number(inputQty) || 0) * activeFactor, selectedVariant?.uom_base);

  const modalRawCostNum = Number(inputRawCost || 0);
  const modalPackCostDocCurr = costEntryMode === 'PACK' ? modalRawCostNum : modalRawCostNum * activeFactor;
  const modalUnitCostDocCurr = costEntryMode === 'PACK' ? (modalRawCostNum / activeFactor) : modalRawCostNum;
  const modalUnitCostUsd = docCurrency === 'VES' ? (modalUnitCostDocCurr / safeRate) : modalUnitCostDocCurr;
  const modalUnitCostVes = docCurrency === 'VES' ? modalUnitCostDocCurr : (modalUnitCostDocCurr * safeRate);
  const modalPackCostUsd = modalUnitCostUsd * activeFactor;
  const modalPackCostVes = modalUnitCostVes * activeFactor;

  // Cálculos en vivo de la Calculadora de Transformación (Piezas / Gramos <-> Kilos)
  const calcPiecesNum = Math.max(0, parseFloat(calcPiecesText.replace(',', '.')) || 0);
  const calcWeightRawNum = Math.max(0, parseFloat(calcWeightText.replace(',', '.')) || 0);
  const calcWeightInKg = calcWeightUnit === 'G' ? (calcWeightRawNum / 1000) : calcWeightRawNum;
  const calcKgPerPiece = calcWeightMode === 'PER_PIECE'
    ? calcWeightInKg
    : (calcPiecesNum > 0 ? (calcWeightInKg / calcPiecesNum) : 0);
  const calcTotalKg = calcWeightMode === 'PER_PIECE'
    ? (calcPiecesNum * calcWeightInKg)
    : calcWeightInKg;

  const calcCostRawNum = Math.max(0, parseFloat(calcCostText.replace(',', '.')) || 0);
  const calcTotalLineCostDoc = calcCostMode === 'PER_PIECE'
    ? (calcCostRawNum * (calcPiecesNum > 0 ? calcPiecesNum : 1))
    : calcCostRawNum;
  const calcCostPerPieceDoc = calcCostMode === 'PER_PIECE'
    ? calcCostRawNum
    : (calcPiecesNum > 0 ? (calcCostRawNum / calcPiecesNum) : 0);
  const calcCostPerKgDoc = calcTotalKg > 0 ? (calcTotalLineCostDoc / calcTotalKg) : 0;
  const calcCostPerKgUsd = docCurrency === 'VES' ? (calcCostPerKgDoc / safeRate) : calcCostPerKgDoc;
  const calcCostPerKgVes = docCurrency === 'VES' ? calcCostPerKgDoc : (calcCostPerKgDoc * safeRate);

  const openTransformCalculator = () => {
    setCalcPiecesText(String(inputQty > 0 ? inputQty : 1));
    if (inputRawCostText && parseFloat(inputRawCostText.replace(',', '.')) > 0) {
      setCalcCostText(inputRawCostText);
    }
    setCalcVisible(true);
  };

  const handleApplyTransformCalculator = () => {
    if (calcTotalKg <= 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Peso requerido',
        detail: 'Indique el peso en Kilos o Gramos para calcular la transformación.'
      });
      return;
    }
    const finalKg = Number(calcTotalKg.toFixed(3));
    setSelectedPackId(null);
    setSelectedPackName(selectedVariant?.uom_base || 'KG');
    setInputUnitsPerPack(1);
    setInputExpectedQty(finalKg);
    setInputQty(finalKg);
    setCostEntryMode('UNIT');

    if (calcCostPerKgDoc > 0) {
      const cleanCostPerKg = Number(calcCostPerKgDoc.toFixed(4));
      setInputRawCost(cleanCostPerKg);
      setInputRawCostText(String(cleanCostPerKg));
    }

    setCalcVisible(false);
    toast.current?.show({
      severity: 'info',
      summary: 'Transformación Aplicada',
      detail: `Se aplicaron ${finalKg} KG${calcCostPerKgDoc > 0 ? ` a ${docCurrency === 'VES' ? 'Bs.' : '$'} ${calcCostPerKgDoc.toFixed(2)} / KG` : ''}.`
    });
  };

  const handleAddProductFromModal = () => {
    if (!selectedVariant) {
      toast.current?.show({ severity: 'warn', summary: 'Atención', detail: 'Seleccione un producto.' });
      return;
    }
    if (inputExpectedQty <= 0 || inputQty < 0) {
      toast.current?.show({ severity: 'warn', summary: 'Atención', detail: 'Verifique las cantidades ingresadas.' });
      return;
    }
    if (docCurrency === 'VES' && (!exchangeRate || exchangeRate <= 0)) {
      toast.current?.show({ severity: 'warn', summary: 'Tasa Requerida', detail: 'Indique una tasa de cambio válida para el documento en Bolívares.' });
      return;
    }

    const cleanExpectedBase = modalExpectedBaseQty;
    const cleanReceivedBase = modalReceivedBaseQty;
    const finalUnitCostUsd = Number(modalUnitCostUsd.toFixed(6));
    const finalPackId = (selectedPackId && selectedPackId > 0) ? selectedPackId : null;
    const finalPackName = activeFactor > 1 ? (selectedPackName || 'EMPAQUE') : (selectedVariant.uom_base || 'UND');

    const existingIndex = lines.findIndex(l => l.variant_id === selectedVariant.value);
    if (existingIndex >= 0) {
      const updated = [...lines];
      updated[existingIndex].expected_qty = sanitizeQuantity(updated[existingIndex].expected_qty + cleanExpectedBase, updated[existingIndex].uom_base);
      updated[existingIndex].received_qty = sanitizeQuantity(updated[existingIndex].received_qty + cleanReceivedBase, updated[existingIndex].uom_base);
      updated[existingIndex].pack_expected_qty = Number(updated[existingIndex].pack_expected_qty || 0) + Number(inputExpectedQty || 0);
      updated[existingIndex].pack_received_qty = Number(updated[existingIndex].pack_received_qty || 0) + Number(inputQty || 0);
      updated[existingIndex].pack_id = finalPackId;
      updated[existingIndex].pack_name = finalPackName;
      updated[existingIndex].qty_per_pack = activeFactor;
      if (finalUnitCostUsd > 0) {
        updated[existingIndex].unit_cost = finalUnitCostUsd;
        updated[existingIndex].billed_unit_cost = modalRawCostNum;
      }
      setLines(updated);
    } else {
      setLines([
        ...lines,
        {
          variant_id: selectedVariant.value,
          sku: selectedVariant.sku,
          product_name: selectedVariant.product_name,
          uom_base: selectedVariant.uom_base || 'UND',
          pack_id: finalPackId,
          pack_name: finalPackName,
          qty_per_pack: activeFactor,
          pack_expected_qty: Number(inputExpectedQty || 0),
          pack_received_qty: Number(inputQty || 0),
          expected_qty: cleanExpectedBase,
          received_qty: cleanReceivedBase,
          damaged_qty: 0,
          unit_cost: finalUnitCostUsd,
          billed_unit_cost: modalRawCostNum,
          lot_number: inputLotNumber || '',
          expiration_date: inputExpirationDate,
          rejection_reason: ''
        }
      ]);
    }

    // Reset modal fields
    setSelectedVariant(null);
    setSelectedPackId(null);
    setSelectedPackName('UND');
    setInputUnitsPerPack(1);
    setCostEntryMode('PACK');
    setInputExpectedQty(1);
    setInputQty(1);
    setInputRawCost(0);
    setInputRawCostText('');
    setCalcVisible(false);
    setCalcPiecesText('1');
    setCalcWeightText('');
    setCalcCostText('');
    setInputLotNumber('');
    setInputExpirationDate(null);
    setAddProductModalVisible(false);

    toast.current?.show({ severity: 'success', summary: 'Producto Añadido', detail: 'Producto ingresado al manifiesto directo.' });
  };

  // Row inline edits
  const handleQtyChange = (index: number, val: any) => {
    setLines(prev => {
      const updated = [...prev];
      const row = updated[index];
      if (!row) return prev;
      const clean = sanitizeQuantity(val, row.uom_base);
      const factor = Math.max(1, Number(row.qty_per_pack || 1));
      updated[index] = {
        ...row,
        received_qty: clean,
        pack_received_qty: Number((clean / factor).toFixed(3))
      };
      return updated;
    });
  };

  const handleExpectedQtyChange = (index: number, val: any) => {
    setLines(prev => {
      const updated = [...prev];
      const row = updated[index];
      if (!row) return prev;
      const clean = sanitizeQuantity(val, row.uom_base);
      const factor = Math.max(1, Number(row.qty_per_pack || 1));
      updated[index] = {
        ...row,
        expected_qty: clean,
        pack_expected_qty: Number((clean / factor).toFixed(3))
      };
      return updated;
    });
  };

  const handleCostChange = (index: number, val: any) => {
    setLines(prev => {
      const updated = [...prev];
      const parsed = isNaN(parseFloat(val)) ? 0 : parseFloat(val);
      updated[index] = { ...updated[index], unit_cost: parsed };
      return updated;
    });
  };

  const handleTextChange = (index: number, field: string, val: string) => {
    setLines(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };
      return updated;
    });
  };

  const handleDateChange = (index: number, val: Date | null) => {
    setLines(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], expiration_date: val };
      return updated;
    });
  };

  const removeLine = (index: number) => {
    const copy = [...lines];
    copy.splice(index, 1);
    setLines(copy);
  };

  // Discrepancy Dialog
  const openDiscrepancyDialog = (line: any, index: number) => {
    setDiscrepancyIndex(index);
    setDiscrepancyDamagedQty(line.damaged_qty || 0);
    setDiscrepancyReason(line.rejection_reason || '');
    setDiscrepancyDialogVisible(true);
  };

  const saveDiscrepancy = () => {
    if (discrepancyIndex === null) return;
    setLines(prev => {
      const updated = [...prev];
      updated[discrepancyIndex] = {
        ...updated[discrepancyIndex],
        damaged_qty: discrepancyDamagedQty,
        rejection_reason: discrepancyReason || 'Avería / Devolución por calidad reportada en muelle'
      };
      return updated;
    });
    setDiscrepancyDialogVisible(false);
    toast.current?.show({ severity: 'info', summary: 'Avería / Devolución Guardada', detail: 'Registro actualizado en el manifiesto.' });
  };

  const formatDateSafe = (d: any): string | null => {
    if (!d) return null;
    try {
      if (d instanceof Date && !isNaN(d.getTime())) {
        return format(d, 'yyyy-MM-dd');
      }
      if (typeof d === 'string' && d.trim().length >= 10) {
        return d.substring(0, 10);
      }
    } catch (e) {
      console.error("Error formatting date:", e);
    }
    return null;
  };

  const handleSubmitDirectReceipt = async () => {
    if (!selectedSupplierId) {
      toast.current?.show({ severity: 'warn', summary: 'Requerido', detail: 'Seleccione el proveedor de origen.' });
      return;
    }
    if (!selectedFacilityId) {
      toast.current?.show({ severity: 'warn', summary: 'Requerido', detail: 'Seleccione la sucursal de destino.' });
      return;
    }
    if (lines.length === 0) {
      toast.current?.show({ severity: 'warn', summary: 'Requerido', detail: 'Ingrese al menos un producto a recibir.' });
      return;
    }
    if (!exchangeRate || exchangeRate <= 0) {
      toast.current?.show({ severity: 'warn', summary: 'Tasa Requerida', detail: 'Indique la tasa de cambio válida del documento.' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        supplier_id: Number(selectedSupplierId),
        facility_id: Number(selectedFacilityId),
        warehouse_id: selectedWarehouseId ? Number(selectedWarehouseId) : null,
        invoice_number: invoiceNumber || '',
        receipt_date: formatDateSafe(receiptDate),
        currency_code: docCurrency,
        exchange_rate: Number(safeRate),
        notes: notes || '',
        lines: lines.map(l => ({
          variant_id: Number(l.variant_id),
          pack_id: l.pack_id ? Number(l.pack_id) : null,
          pack_name: l.pack_name || null,
          qty_per_pack: Number(l.qty_per_pack || 1),
          pack_expected_qty: Number(l.pack_expected_qty || l.expected_qty || 1),
          pack_received_qty: Number(l.pack_received_qty || l.received_qty || 0),
          expected_qty: sanitizeQuantity(l.expected_qty || l.received_qty || 1, l.uom_base),
          received_qty: sanitizeQuantity(l.received_qty || 0, l.uom_base),
          unit_cost: Number(l.unit_cost || 0),
          billed_unit_cost: l.billed_unit_cost !== undefined ? Number(l.billed_unit_cost) : Number(l.unit_cost || 0),
          damaged_qty: sanitizeQuantity(l.damaged_qty || 0, l.uom_base),
          rejection_reason: l.rejection_reason || null,
          lot_number: l.lot_number || null,
          expiration_date: formatDateSafe(l.expiration_date)
        }))
      };

      const res = await api.post('/wms/receipts/direct', payload);
      toast.current?.show({ severity: 'success', summary: 'Procesado', detail: res.data?.message || 'Recepción efectuada con éxito.' });
      
      const createdOrderId = res.data?.id || res.data?.order_id;
      if (createdOrderId) {
        try {
          const ticketRes = await api.get(`/wms/receipts/${createdOrderId}/ticket-80mm`);
          setTicketData(ticketRes.data);
          setTicketDialogVisible(true);
        } catch(err) {
          console.error("Error fetching 80mm ticket:", err);
          router.push('/receipts');
        }
      } else {
        router.push('/receipts');
      }

    } catch (e: any) {
      let detailMsg = 'Fallo al registrar recepción directa.';
      if (e.response?.data?.detail) {
        if (typeof e.response.data.detail === 'string') {
          detailMsg = e.response.data.detail;
        } else if (Array.isArray(e.response.data.detail)) {
          detailMsg = e.response.data.detail.map((err: any) => `${err.loc?.join('.') || ''}: ${err.msg}`).join(', ');
        } else if (typeof e.response.data.detail === 'object') {
          detailMsg = JSON.stringify(e.response.data.detail);
        }
      }
      toast.current?.show({ severity: 'error', summary: 'Error al Registrar', detail: detailMsg });
    } finally {
      setSubmitting(false);
    }
  };

  const totalAmountUsd = lines.reduce((acc, l) => acc + ((Number(l.received_qty) || 0) * (Number(l.unit_cost) || 0)), 0);
  const totalAmountVes = totalAmountUsd * safeRate;

  return (
    <div className="p-4 sm:p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />

      {/* ENCABEZADO */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-emerald-600"></div>
        
        <div>
          <div className="flex items-center gap-3 mb-1">
             <Button icon="pi pi-arrow-left" rounded text aria-label="Volver" onClick={() => router.push('/receipts')} />
             <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
                <i className="pi pi-plus-circle text-emerald-600 mr-3"></i>Recepción Directa (Sin ODC)
             </h1>
          </div>
          <p className="text-slate-500 ml-12 text-xs mt-1">Ingreso de mercancía no planificada por entregas directas o compras locales en muelle.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button label="Volver al Muelle" icon="pi pi-arrow-left" outlined severity="secondary" onClick={() => router.push('/receipts')} className="font-bold text-xs" />
        </div>
      </div>

      {/* BLOQUE DE DATOS DE CABECERA */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="flex flex-col gap-1 relative">
             <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">1. Proveedor Origen (*)</label>
             <Dropdown 
                value={selectedSupplierId} 
                onChange={e => setSelectedSupplierId(e.value)} 
                options={suppliers} 
                placeholder="Seleccione Proveedor" 
                filter
                appendTo="self"
                panelClassName="!w-full !min-w-[320px] shadow-2xl rounded-xl border border-slate-200"
                className="w-full text-xs font-bold border-slate-200" 
             />
          </div>

          <div className="flex flex-col gap-1 relative">
             <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">2. Sucursal Destino (*)</label>
             <Dropdown 
                value={selectedFacilityId} 
                onChange={e => setSelectedFacilityId(e.value)} 
                options={facilities} 
                placeholder="Seleccione Sucursal" 
                filter
                appendTo="self"
                panelClassName="!w-full !min-w-[280px] shadow-2xl rounded-xl border border-slate-200"
                className="w-full text-xs font-bold border-slate-200" 
             />
          </div>

          <div className="flex flex-col gap-1 relative">
             <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">3. Depósito de Ingreso (*)</label>
             <Dropdown 
                value={selectedWarehouseId} 
                onChange={e => setSelectedWarehouseId(e.value)} 
                options={filteredWarehouses} 
                placeholder={selectedFacilityId ? "Seleccione Depósito" : "Primero seleccione Sucursal"} 
                disabled={!selectedFacilityId}
                filter
                appendTo="self"
                panelClassName="!w-full !min-w-[280px] shadow-2xl rounded-xl border border-slate-200"
                className="w-full text-xs font-bold border-slate-200" 
             />
          </div>

          <div className="flex flex-col gap-1">
             <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">4. N° Factura / Guía</label>
             <InputText 
                value={invoiceNumber} 
                onChange={e => setInvoiceNumber(e.target.value)} 
                placeholder="Ej: FACT-99012" 
                className="w-full text-xs font-bold border-slate-200" 
             />
          </div>

          <div className="flex flex-col gap-1">
             <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">5. Fecha Recepción (*)</label>
             <Calendar 
                value={receiptDate} 
                onChange={e => setReceiptDate(e.value as Date)} 
                dateFormat="dd/mm/yy" 
                placeholder="Seleccionar Fecha" 
                className="w-full p-inputtext-sm text-xs font-bold" 
             />
          </div>
        </div>

        {/* SUB-BARRA FINANCIERA DE FACTURA: MONEDA Y TASA DEL DOCUMENTO */}
        <div className="pt-3 border-t border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-50/70 p-3 rounded-xl border border-slate-200/70">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">6. Moneda de la Factura (*)</label>
              <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-xs">
                <button
                  type="button"
                  onClick={() => setDocCurrency('VES')}
                  className={`px-3 py-1.5 rounded-md text-xs font-black transition-all ${
                    docCurrency === 'VES'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Bs. Bolívares (VES)
                </button>
                <button
                  type="button"
                  onClick={() => setDocCurrency('USD')}
                  className={`px-3 py-1.5 rounded-md text-xs font-black transition-all ${
                    docCurrency === 'USD'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  $ Dólares (USD)
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                7. Tasa de Cambio del Documento (Bs / $) (*)
              </label>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
                  <span className="px-2.5 py-1.5 bg-slate-100 text-slate-600 font-black text-xs border-r border-slate-200 select-none">
                    Bs.
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={exchangeRateText}
                    onFocus={e => e.target.select()}
                    onChange={e => {
                      const raw = e.target.value.replace(/[^0-9.,]/g, '');
                      setExchangeRateText(raw);
                      const parsed = parseFloat(raw.replace(',', '.'));
                      if (!isNaN(parsed) && parsed > 0) {
                        setExchangeRate(parsed);
                      }
                    }}
                    placeholder="0.00"
                    className="w-28 px-2.5 py-1.5 text-xs font-black text-slate-800 bg-white outline-none"
                  />
                </div>
                {bcvRateRef > 1 && Math.abs(safeRate - bcvRateRef) > 0.01 && (
                  <button
                    type="button"
                    onClick={() => {
                      setExchangeRate(bcvRateRef);
                      setExchangeRateText(String(bcvRateRef));
                    }}
                    className="text-[10px] font-bold text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded border border-blue-200"
                    title="Restaurar tasa BCV del día"
                  >
                    Usar BCV Hoy ({bcvRateRef.toFixed(2)})
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-2">
            <i className="pi pi-info-circle text-emerald-600"></i>
            <span>
              Si la factura es de días anteriores, ajuste la <strong>Tasa del Documento</strong> impresa en la factura. El Kardex registrará los costos convertidos a <strong>USD ($/UND)</strong>.
            </span>
          </div>
        </div>
      </div>

      {/* MANIFIESTO DE CONTEO FÍSICO */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700 tracking-tight flex items-center text-sm">
                <i className="pi pi-list mr-2 text-emerald-600"></i>Manifiesto de Conteo Físico Directo ({lines.length} Productos)
            </h3>

            <Button 
                label="Agregar Producto a Recepción" 
                icon="pi pi-plus-circle" 
                severity="success" 
                text 
                className="font-bold text-xs" 
                onClick={() => setAddProductModalVisible(true)} 
            />
        </div>
        
        <DataTable dataKey="variant_id" value={lines} emptyMessage="No ha agregado productos a esta recepción directa." size="small" stripedRows rowHover className="text-sm">
          <Column header="SKU" field="sku" body={r => (
              <div className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-600 font-bold border border-slate-200">{r.sku}</span>
              </div>
          )} style={{ width: '7rem' }} />
          
          <Column header="Producto / Presentación" field="product_name" body={r => (
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-slate-800">{r.product_name}</span>
                {Number(r.qty_per_pack || 1) > 1 ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 w-fit">
                    📦 {r.pack_received_qty ?? (Number(r.received_qty || 0) / Number(r.qty_per_pack)).toFixed(2)} {r.pack_name || 'EMPAQUE'} × {r.qty_per_pack} {r.uom_base}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 font-semibold">Unidad Base ({r.uom_base || 'UND'})</span>
                )}
              </div>
          )} />
          
          <Column header="Cant. Factura (Base)" body={(r, options) => {
             const isWeight = isWeightUom(r.uom_base);
             const dec = isWeight ? 3 : 0;
             return (
                <div className="flex flex-col items-center gap-0.5">
                  <InputNumber 
                     value={r.expected_qty} 
                     onValueChange={e => handleExpectedQtyChange(options.rowIndex, e.value)} 
                     min={0} 
                     minFractionDigits={dec}
                     maxFractionDigits={dec}
                     step={isWeight ? 0.001 : 1}
                     className="w-20 text-center font-bold" 
                     inputClassName="w-20 text-center text-xs font-bold border-slate-200"
                  />
                  <span className="text-[9px] text-slate-400 font-bold">{r.uom_base || 'UND'}</span>
                </div>
             );
          }} align="center" style={{ width: '7rem' }} />

          {/* FÍSICO RECIBIDO BUENO */}
          <Column header="Físico Recibido (Base)" body={(r, options) => {
             const isWeight = isWeightUom(r.uom_base);
             const dec = isWeight ? 3 : 0;
             return (
                <div className="flex flex-col items-end gap-0.5">
                    <InputNumber 
                       value={r.received_qty} 
                       onValueChange={e => handleQtyChange(options.rowIndex, e.value)} 
                       min={0} 
                       minFractionDigits={dec}
                       maxFractionDigits={dec}
                       step={isWeight ? 0.001 : 1}
                       inputClassName="w-24 text-right text-base font-black p-2 rounded-lg border-2 border-emerald-200 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 bg-emerald-50/50 transition-all text-emerald-700 shadow-inner" 
                    />
                    <span className="text-[9px] text-emerald-700 font-bold">{r.uom_base || 'UND'}</span>
                </div>
             );
          }} align="right" style={{ width: '8rem' }} />

          {/* ESTADO CONTEO */}
          <Column header="Estado Conteo" body={r => {
              const isWeight = isWeightUom(r.uom_base);
              const exp = Number(r.expected_qty) || 0;
              const rec = Number(r.received_qty) || 0;
              const dam = Number(r.damaged_qty) || 0;
              const diff = Number(((rec + dam) - exp).toFixed(isWeight ? 3 : 0));
              const damFmt = formatReceiptQty(dam, r.uom_base);
              const diffFmt = formatReceiptQty(diff, r.uom_base);

              if (diff === 0 && dam === 0) return <Tag value="COMPLETO (OK)" severity="success" className="font-extrabold text-[9px]" />;
              if (dam > 0) return <Tag value={`CON DEVOLUCIÓN (${damFmt})`} severity="warning" className="font-extrabold text-[9px]" />;
              if (diff > 0) return <Tag value={`SOBRANTE (+${diffFmt})`} severity="info" className="font-extrabold text-[9px]" />;
              return <Tag value={`FALTANTE (${diffFmt})`} severity="danger" className="font-extrabold text-[9px]" />;
          }} align="center" style={{ width: '9rem' }} />

          <Column header="Trazabilidad (Lote)" body={(r, options) => (
             <InputText 
                 value={r.lot_number || ''} 
                 onChange={(e) => handleTextChange(options.rowIndex, 'lot_number', e.target.value)} 
                 placeholder="Ej: L-204" 
                 className="w-24 text-xs font-bold text-center uppercase" 
             />
          )} align="center" style={{ width: '7.5rem' }} />

          <Column header="Vencimiento (FEFO)" body={(r, options) => (
             <Calendar 
                 value={r.expiration_date} 
                 onChange={(e) => handleDateChange(options.rowIndex, e.value as Date)} 
                 dateFormat="dd/mm/yy" 
                 placeholder="Opcional" 
                 className="w-28 p-inputtext-sm text-xs" 
             />
          )} align="center" style={{ width: '8.5rem' }} />

          {/* AVERÍA Y DEVOLUCIÓN POR CALIDAD */}
          <Column header="Avería / Calidad" body={(r, options) => (
             <Button 
                 icon="pi pi-exclamation-triangle" 
                 rounded 
                 text 
                 severity={r.damaged_qty > 0 ? "danger" : "secondary"} 
                 title={r.damaged_qty > 0 ? `${r.damaged_qty} unds devueltas por calidad: ${r.rejection_reason || ''}` : "Reportar Avería o Devolución"}
                 onClick={() => openDiscrepancyDialog(r, options.rowIndex)} 
             />
          )} align="center" style={{ width: '5rem' }} />

          <Column header="Costo Unit ($ / Bs)" body={(r, options) => {
             const unitUsd = Number(r.unit_cost || 0);
             const unitVes = unitUsd * safeRate;
             return (
                <div className="flex flex-col items-end gap-0.5">
                  <InputNumber 
                     value={r.unit_cost} 
                     onValueChange={e => handleCostChange(options.rowIndex, e.value)} 
                     minFractionDigits={2} 
                     maxFractionDigits={4} 
                     prefix="$"
                     inputClassName="w-24 text-right text-xs font-bold border-slate-200"
                  />
                  <span className="text-[10px] font-bold text-slate-500">
                    Bs. {unitVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
             );
          }} align="right" style={{ width: '8.5rem' }} />

          <Column header="Subtotal ($ / Bs)" align="right" body={r => {
             const subUsd = (Number(r.received_qty) || 0) * (Number(r.unit_cost) || 0);
             const subVes = subUsd * safeRate;
             return (
                <div className="flex flex-col items-end">
                  <span className="font-black text-slate-800 text-xs">${subUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="font-bold text-emerald-700 text-[10px]">Bs. {subVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
             );
          }} style={{ width: '8.5rem' }} />

          <Column header="" align="center" body={(r, options) => (
             <Button icon="pi pi-trash" rounded severity="danger" text onClick={() => removeLine(options.rowIndex)} title="Quitar" />
          )} style={{ width: '3rem' }} />
        </DataTable>
      </div>

      {/* BARRA INFERIOR DE TOTAL Y CONFIRMACIÓN */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-6 bg-white rounded-2xl shadow-sm border border-slate-200 mt-6">
         <div className="flex flex-wrap items-center gap-8">
            <div>
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Total Factura en Bolívares (Tasa {safeRate.toFixed(2)})</span>
               <h2 className="text-2xl font-black text-slate-800">
                  Bs. {totalAmountVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
               </h2>
            </div>
            <div className="pl-6 border-l border-slate-200">
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Monto Total Valorizado Inventario ($)</span>
               <h2 className="text-3xl font-black text-emerald-600">
                  ${totalAmountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
               </h2>
            </div>
         </div>

         <Button 
            label="Confirmar e Ingresar a Inventario" 
            icon="pi pi-check-circle" 
            severity="success" 
            loading={submitting} 
            onClick={handleSubmitDirectReceipt} 
            className="font-bold px-8 shadow-lg hover:shadow-xl transition-all shadow-emerald-500/30 text-lg bg-emerald-600 border-none rounded-xl py-3" 
         />
      </div>

      {/* MODAL: AGREGAR PRODUCTO A RECEPCIÓN DIRECTA */}
      <Dialog 
         header="Agregar Producto a Recepción Directa" 
         visible={addProductModalVisible} 
         onHide={() => setAddProductModalVisible(false)} 
         style={{ width: '600px' }} 
         modal
      >
         <div className="flex flex-col gap-4 p-2 text-slate-800">
            {/* 1. BUSCADOR DE PRODUCTO */}
            <div className="flex flex-col gap-1 relative">
               <label className="text-xs font-bold text-slate-600 uppercase">1. Buscar Producto (Nombre, SKU, Código de Barras o Alterno) (*)</label>
               <Dropdown 
                  value={selectedVariant?.value} 
                  onChange={e => handleSelectVariant(e.value)} 
                  options={products} 
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Escriba nombre, SKU o cualquier código..." 
                  filter
                  filterBy="search_key,label,sku,name,product_name,barcodes_str"
                  filterMatchMode="contains"
                  filterPlaceholder="Buscar por nombre, SKU, código de barras o alterno..."
                  emptyFilterMessage={searchingProducts ? "Buscando en el catálogo..." : "No se encontraron productos"}
                  onFilter={e => handleProductFilter(e.filter)}
                  itemTemplate={(option: any) => (
                     <div className="flex flex-col gap-0.5 py-1">
                        <div className="flex items-center justify-between gap-2">
                           <span className="font-bold text-slate-800 text-xs">{option.product_name || option.name}</span>
                           <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">{option.sku}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                           {option.barcodes && option.barcodes.length > 0 ? (
                              <span className="text-[10px] text-slate-500 font-mono">
                                 Cód: {option.barcodes.slice(0, 4).join(', ')}
                              </span>
                           ) : <span />}
                           {option.packagings && option.packagings.length > 0 && (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                 📦 {option.packagings[0].name} × {Number(option.packagings[0].qty_per_unit)} {option.uom_base || 'UND'}
                              </span>
                           )}
                        </div>
                     </div>
                  )}
                  appendTo="self"
                  panelClassName="!w-full shadow-2xl rounded-xl border border-slate-200"
                  className="w-full text-sm font-bold border-slate-200" 
               />
            </div>

            {/* 2. SELECCIÓN DE PRESENTACIÓN / EMPAQUE */}
            {selectedVariant && (() => {
               const uomLabel = selectedVariant?.uom_base || 'UND';
               const packs = Array.isArray(selectedVariant.packagings) ? selectedVariant.packagings : [];
               const packOptions = [
                  ...packs.map((pk: any) => ({
                     label: `📦 ${pk.name || 'EMPAQUE'} (${Number(pk.qty_per_unit)} ${uomLabel})`,
                     value: pk.id
                  })),
                  { label: `🔹 Unidad Base Suelta (1 ${uomLabel})`, value: null },
                  { label: `➕ Otro Empaque / Bulto Personalizado`, value: -1 }
               ];

               return (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-3">
                     <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-600 uppercase">2. Presentación / Empaque Recibido (*)</span>
                        <button
                           type="button"
                           onClick={() => calcVisible ? setCalcVisible(false) : openTransformCalculator()}
                           className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black border transition-all cursor-pointer ${
                              calcVisible
                                 ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                                 : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                           }`}
                           title="Abrir Calculadora de Transformación (Piezas / Gramos a Kilos y Costo por KG)"
                        >
                           <i className="pi pi-calculator text-xs"></i>
                           <span>Calculadora Pieza ↔ Kilo</span>
                        </button>
                     </div>
                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div className="sm:col-span-2 flex flex-col gap-1">
                           <Dropdown
                              value={selectedPackId}
                              options={packOptions}
                              onChange={e => handleSelectPackagingOption(e.value)}
                              className="w-full text-xs font-bold border-slate-300 bg-white"
                           />
                        </div>

                        <div className="flex flex-col gap-1">
                           <label className="text-[11px] font-bold text-slate-600 uppercase">Unids. por Empaque</label>
                           <div className="flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
                              <input
                                 type="number"
                                 step="any"
                                 min={1}
                                 disabled={selectedPackId === null}
                                 value={selectedPackId === null ? 1 : inputUnitsPerPack}
                                 onFocus={e => e.target.select()}
                                 onChange={e => {
                                    const val = Math.max(1, parseFloat(e.target.value) || 1);
                                    setInputUnitsPerPack(val);
                                 }}
                                 className="w-full px-2.5 py-2 text-xs font-black text-center bg-white outline-none disabled:bg-slate-100 disabled:text-slate-400"
                              />
                              <span className="px-2 py-2 bg-slate-100 text-slate-600 font-bold text-[10px] border-l border-slate-200 select-none">
                                 {uomLabel}
                              </span>
                           </div>
                        </div>
                     </div>

                     {/* PANEL DESPLEGABLE: CALCULADORA DE TRANSFORMACIÓN (PIEZAS / GRAMOS -> KILOS Y COSTO/KG) */}
                     {calcVisible && (
                        <div className="mt-1 p-3.5 bg-amber-50/90 border-2 border-amber-300 rounded-xl flex flex-col gap-3 shadow-sm">
                           <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                              <div className="flex items-center gap-2">
                                 <span className="p-1.5 rounded-lg bg-amber-500 text-white font-black text-xs flex items-center justify-center">
                                    <i className="pi pi-calculator"></i>
                                 </span>
                                 <div>
                                    <h4 className="text-xs font-black text-amber-950 uppercase leading-none">
                                       Calculadora de Transformación (Piezas / Gramos ➔ Kilos)
                                    </h4>
                                    <p className="text-[10px] text-amber-800 font-semibold mt-0.5">
                                       Convierte piezas pesadas a Kilos (KG) y calcula automáticamente el costo exacto por Kilo.
                                    </p>
                                 </div>
                              </div>
                              <button
                                 type="button"
                                 onClick={() => setCalcVisible(false)}
                                 className="text-amber-700 hover:text-amber-950 p-1 rounded cursor-pointer"
                                 title="Cerrar calculadora"
                              >
                                 <i className="pi pi-times text-xs"></i>
                              </button>
                           </div>

                           <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                              {/* 1. CANTIDAD DE PIEZAS */}
                              <div className="sm:col-span-4 flex flex-col gap-1">
                                 <label className="text-[10px] font-black text-amber-900 uppercase">
                                    1. Cant. de Piezas
                                 </label>
                                 <div className="flex items-center rounded-lg border border-amber-300 bg-white overflow-hidden focus-within:border-amber-600">
                                    <input
                                       type="text"
                                       inputMode="decimal"
                                       value={calcPiecesText}
                                       placeholder="1"
                                       onFocus={e => e.target.select()}
                                       onChange={e => setCalcPiecesText(e.target.value.replace(/[^0-9.,]/g, ''))}
                                       className="w-full px-2.5 py-2 text-sm font-black text-slate-900 bg-white outline-none text-center"
                                    />
                                    <span className="px-2 py-2 bg-amber-100/70 text-amber-900 font-black text-[10px] border-l border-amber-200 select-none">
                                       PZAS
                                    </span>
                                 </div>
                              </div>

                              {/* 2. PESO (POR PIEZA O TOTAL BALANZA, EN KG O GRAMOS) */}
                              <div className="sm:col-span-8 flex flex-col gap-1">
                                 <div className="flex items-center justify-between gap-1">
                                    <label className="text-[10px] font-black text-amber-900 uppercase">
                                       2. Peso ({calcWeightMode === 'PER_PIECE' ? 'Por 1 Pieza' : 'Total Romana'})
                                    </label>
                                    <div className="inline-flex rounded border border-amber-300 bg-white p-0.5 text-[9px] font-bold">
                                       <button
                                          type="button"
                                          onClick={() => setCalcWeightMode('PER_PIECE')}
                                          className={`px-1.5 py-0.5 rounded cursor-pointer ${calcWeightMode === 'PER_PIECE' ? 'bg-amber-600 text-white' : 'text-amber-900'}`}
                                       >
                                          Por 1 Pieza
                                       </button>
                                       <button
                                          type="button"
                                          onClick={() => setCalcWeightMode('TOTAL_WEIGHT')}
                                          className={`px-1.5 py-0.5 rounded cursor-pointer ${calcWeightMode === 'TOTAL_WEIGHT' ? 'bg-amber-600 text-white' : 'text-amber-900'}`}
                                       >
                                          Total Balanza
                                       </button>
                                    </div>
                                 </div>
                                 <div className="flex items-center gap-1.5">
                                    <div className="flex-1 flex items-center rounded-lg border border-amber-300 bg-white overflow-hidden focus-within:border-amber-600">
                                       <input
                                          type="text"
                                          inputMode="decimal"
                                          value={calcWeightText}
                                          placeholder={calcWeightUnit === 'KG' ? "Ej: 3.250" : "Ej: 450"}
                                          onFocus={e => e.target.select()}
                                          onChange={e => setCalcWeightText(e.target.value.replace(/[^0-9.,]/g, ''))}
                                          className="w-full px-3 py-2 text-sm font-black text-slate-900 bg-white outline-none"
                                       />
                                    </div>
                                    <div className="inline-flex rounded-lg border border-amber-300 bg-white p-0.5 shrink-0">
                                       <button
                                          type="button"
                                          onClick={() => setCalcWeightUnit('KG')}
                                          className={`px-2.5 py-1.5 rounded-md text-xs font-black transition-all cursor-pointer ${
                                             calcWeightUnit === 'KG'
                                                ? 'bg-slate-800 text-white'
                                                : 'text-slate-600 hover:bg-slate-100'
                                          }`}
                                       >
                                          KG
                                       </button>
                                       <button
                                          type="button"
                                          onClick={() => setCalcWeightUnit('G')}
                                          className={`px-2.5 py-1.5 rounded-md text-xs font-black transition-all cursor-pointer ${
                                             calcWeightUnit === 'G'
                                                ? 'bg-slate-800 text-white'
                                                : 'text-slate-600 hover:bg-slate-100'
                                          }`}
                                       >
                                          Gramos (g)
                                       </button>
                                    </div>
                                 </div>
                              </div>
                           </div>

                           {/* 3. COSTO DE LA PIEZA O TOTAL EN FACTURA */}
                           <div className="flex flex-col gap-1 pt-1 border-t border-amber-200/80">
                              <div className="flex items-center justify-between">
                                 <label className="text-[10px] font-black text-amber-900 uppercase">
                                    3. Costo en Factura ({docCurrency === 'VES' ? 'Bolívares Bs.' : 'Dólares $'})
                                 </label>
                                 <div className="inline-flex rounded border border-amber-300 bg-white p-0.5 text-[10px] font-bold">
                                    <button
                                       type="button"
                                       onClick={() => setCalcCostMode('PER_PIECE')}
                                       className={`px-2 py-0.5 rounded cursor-pointer ${calcCostMode === 'PER_PIECE' ? 'bg-amber-600 text-white' : 'text-amber-900'}`}
                                    >
                                       Costo de 1 Pieza
                                    </button>
                                    <button
                                       type="button"
                                       onClick={() => setCalcCostMode('TOTAL_LINE')}
                                       className={`px-2 py-0.5 rounded cursor-pointer ${calcCostMode === 'TOTAL_LINE' ? 'bg-amber-600 text-white' : 'text-amber-900'}`}
                                    >
                                       Total de las {calcPiecesNum || 1} Piezas
                                    </button>
                                 </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center mt-1">
                                 <div className="flex items-center rounded-lg border border-amber-400 bg-white overflow-hidden focus-within:border-emerald-600">
                                    <span className="px-2.5 py-2 bg-amber-100/80 text-amber-950 font-black text-xs border-r border-amber-200 select-none">
                                       {docCurrency === 'VES' ? 'Bs.' : '$'}
                                    </span>
                                    <input
                                       type="text"
                                       inputMode="decimal"
                                       value={calcCostText}
                                       placeholder="Monto según factura..."
                                       onFocus={e => e.target.select()}
                                       onChange={e => setCalcCostText(e.target.value.replace(/[^0-9.,]/g, ''))}
                                       className="w-full px-3 py-2 text-sm font-black text-slate-900 bg-white outline-none"
                                    />
                                 </div>

                                 {/* RESUMEN EN VIVO DE LA TRANSFORMACIÓN */}
                                 <div className="bg-white p-2 rounded-lg border border-amber-300 flex flex-col gap-0.5 text-[11px]">
                                    <div className="flex justify-between">
                                       <span className="text-slate-500 font-semibold">Peso a Ingresar:</span>
                                       <span className="font-black text-emerald-700">
                                          {calcTotalKg.toFixed(3)} KG ({calcKgPerPiece.toFixed(3)} KG/pza)
                                       </span>
                                    </div>
                                    <div className="flex justify-between">
                                       <span className="text-slate-500 font-semibold">Costo por 1 KG:</span>
                                       <span className="font-black text-slate-900">
                                          Bs. {calcCostPerKgVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / KG
                                       </span>
                                    </div>
                                    <div className="flex justify-between border-t border-slate-100 pt-0.5">
                                       <span className="text-emerald-800 font-bold">Kardex ($ / KG):</span>
                                       <span className="font-black text-emerald-700">
                                          ${calcCostPerKgUsd.toFixed(4)} / KG
                                       </span>
                                    </div>
                                 </div>
                              </div>
                           </div>

                           <div className="flex justify-end gap-2 pt-1">
                              <button
                                 type="button"
                                 onClick={handleApplyTransformCalculator}
                                 className="w-full sm:w-auto px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                              >
                                 <i className="pi pi-check-circle"></i>
                                 <span>Aplicar Transformación ({calcTotalKg.toFixed(3)} KG)</span>
                              </button>
                           </div>
                        </div>
                     )}
                  </div>
               );
            })()}

            {/* 3. CANTIDADES SEGÚN PRESENTACIÓN ELEGIDA */}
            <div className="flex flex-col gap-2">
               {(() => {
                  const isWeight = isWeightUom(selectedVariant?.uom_base) && selectedPackId === null;
                  const uomLabel = selectedVariant?.uom_base || 'UND';
                  const entryUnitLabel = selectedPackId !== null
                     ? `${selectedPackName || 'EMPAQUE'} x ${activeFactor} ${uomLabel}`
                     : uomLabel;
                  return (
                     <>
                        <div className="grid grid-cols-2 gap-4">
                           <div className="flex flex-col gap-1">
                              <label className="text-xs font-bold text-slate-600 uppercase">3. Cant. según Factura ({entryUnitLabel}) (*)</label>
                              <input
                                 type="number"
                                 step={isWeight ? "0.001" : "1"}
                                 min={0}
                                 value={inputExpectedQty}
                                 onFocus={e => e.target.select()}
                                 onChange={e => {
                                    const val = Math.max(0, parseFloat(e.target.value) || 0);
                                    setInputExpectedQty(val);
                                    setInputQty(val);
                                 }}
                                 className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                              />
                           </div>

                           <div className="flex flex-col gap-1">
                              <label className="text-xs font-bold text-emerald-700 uppercase">4. Cant. Física Recibida ({entryUnitLabel}) (*)</label>
                              <input
                                 type="number"
                                 step={isWeight ? "0.001" : "1"}
                                 min={0}
                                 value={inputQty}
                                 onFocus={e => e.target.select()}
                                 onChange={e => {
                                    const val = Math.max(0, parseFloat(e.target.value) || 0);
                                    setInputQty(val);
                                 }}
                                 className="w-full px-3 py-2 rounded-lg border border-emerald-300 bg-white font-bold text-sm text-emerald-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                              />
                           </div>
                        </div>

                        {activeFactor > 1 && (
                           <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-900 font-bold">
                              <span>
                                 <i className="pi pi-box mr-1.5 text-emerald-600"></i>
                                 Conversión a Inventario (Kardex):
                              </span>
                              <span className="font-black text-emerald-700">
                                 {inputQty} {selectedPackName || 'EMPAQUE'} × {activeFactor} {uomLabel} = {modalReceivedBaseQty} {uomLabel}
                              </span>
                           </div>
                        )}
                     </>
                  );
               })()}
            </div>

            {/* 4. COSTO SEGÚN FACTURA (POR EMPAQUE O POR UNIDAD, EN BS O USD) */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-3">
               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-700 uppercase">
                     5. Costo en Factura ({docCurrency === 'VES' ? `Bolívares Bs. @ Tasa ${safeRate.toFixed(2)}` : 'Dólares USD $'})
                  </label>
                  <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
                     <button
                        type="button"
                        disabled={activeFactor <= 1}
                        onClick={() => setCostEntryMode('PACK')}
                        className={`px-2.5 py-1 rounded text-[11px] font-black transition-all ${
                           costEntryMode === 'PACK'
                              ? 'bg-slate-800 text-white'
                              : 'text-slate-600 hover:bg-slate-100 disabled:opacity-40'
                        }`}
                     >
                        📦 Por Empaque ({activeFactor} {selectedVariant?.uom_base || 'UND'})
                     </button>
                     <button
                        type="button"
                        onClick={() => setCostEntryMode('UNIT')}
                        className={`px-2.5 py-1 rounded text-[11px] font-black transition-all ${
                           costEntryMode === 'UNIT'
                              ? 'bg-slate-800 text-white'
                              : 'text-slate-600 hover:bg-slate-100'
                        }`}
                     >
                        🔹 Por Unidad ({selectedVariant?.uom_base || 'UND'})
                     </button>
                  </div>
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div className="flex flex-col gap-1">
                     <label className="text-[11px] font-bold text-slate-500 uppercase">
                        Monto {costEntryMode === 'PACK' ? `del Empaque (${selectedPackName})` : `de la Unidad`} en {docCurrency === 'VES' ? 'Bs.' : '$'}
                     </label>
                     <div className="flex items-center rounded-lg border-2 border-blue-400 bg-white overflow-hidden focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100 shadow-2xs">
                        <span className="px-3 py-2.5 bg-slate-100 text-slate-700 font-black text-sm border-r border-slate-200 select-none">
                           {docCurrency === 'VES' ? 'Bs.' : '$'}
                        </span>
                        <input
                           type="text"
                           inputMode="decimal"
                           value={inputRawCostText}
                           placeholder="0.00"
                           onFocus={e => e.target.select()}
                           onChange={e => {
                              const raw = e.target.value.replace(/[^0-9.,]/g, '');
                              setInputRawCostText(raw);
                              const parsed = parseFloat(raw.replace(',', '.'));
                              setInputRawCost(isNaN(parsed) ? 0 : parsed);
                           }}
                           className="w-full px-3 py-2.5 font-black text-base text-slate-900 bg-white outline-none"
                        />
                        <button
                           type="button"
                           onClick={() => calcVisible ? setCalcVisible(false) : openTransformCalculator()}
                           className="px-3 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border-l border-slate-200 transition-colors flex items-center justify-center cursor-pointer"
                           title="Abrir Calculadora de Transformación (Piezas / Gramos a Kilos)"
                        >
                           <i className="pi pi-calculator text-base font-bold"></i>
                        </button>
                     </div>
                  </div>

                  {/* Tarjeta de Verificación de Conversión Automática */}
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-200 flex flex-col gap-1 text-xs shadow-2xs">
                     <div className="flex justify-between items-center text-slate-500">
                        <span>Costo Empaque ({activeFactor} {selectedVariant?.uom_base || 'UND'}):</span>
                        <span className="font-bold text-slate-700">
                           ${modalPackCostUsd.toFixed(2)} / Bs. {modalPackCostVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                     </div>
                     <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                        <span className="font-bold text-emerald-800">Costo Unitario (Kardex):</span>
                        <span className="font-black text-emerald-700 text-sm">
                           ${modalUnitCostUsd.toFixed(4)} / {selectedVariant?.uom_base || 'UND'}
                        </span>
                     </div>
                     <div className="flex justify-between items-center text-[10px] text-slate-400">
                        <span>Equivalente Unitario Bs.:</span>
                        <span className="font-bold">
                           Bs. {modalUnitCostVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {selectedVariant?.uom_base || 'UND'}
                        </span>
                     </div>
                  </div>
               </div>
            </div>

            {/* 5. LOTE Y FECHA DE VENCIMIENTO */}
            <div className="grid grid-cols-2 gap-4">
               <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Trazabilidad (Lote)</label>
                  <InputText 
                     value={inputLotNumber} 
                     onChange={e => setInputLotNumber(e.target.value)} 
                     placeholder="Ej: L-204" 
                     className="w-full text-sm font-bold uppercase" 
                  />
               </div>

               <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-600 uppercase">Fecha Vencimiento (FEFO)</label>
                  <Calendar 
                     value={inputExpirationDate} 
                     onChange={e => setInputExpirationDate(e.value as Date)} 
                     dateFormat="dd/mm/yy" 
                     placeholder="Opcional" 
                     className="w-full p-inputtext-sm text-sm" 
                  />
               </div>
            </div>

            <div className="mt-2 flex justify-end gap-2">
               <Button label="Cancelar" outlined severity="secondary" onClick={() => setAddProductModalVisible(false)} className="font-bold text-xs" />
               <Button label="Añadir a Recepción" icon="pi pi-plus" severity="success" onClick={handleAddProductFromModal} className="font-bold text-xs bg-emerald-600 border-none" />
            </div>
         </div>
      </Dialog>

      {/* MODAL: REGISTRO DE AVERÍA / DEVOLUCIÓN POR CALIDAD */}
      <Dialog 
         header="Registro de Avería o Devolución por Calidad" 
         visible={discrepancyDialogVisible} 
         onHide={() => setDiscrepancyDialogVisible(false)} 
         style={{ width: '450px' }} 
         modal
      >
         <div className="flex flex-col gap-4 p-2 text-slate-800">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-xs text-amber-900 font-bold">
               <i className="pi pi-exclamation-triangle text-amber-600 text-xl"></i>
               <span>Desvío de mercancía no conforme o dañada durante la descarga en muelle.</span>
            </div>

            <div className="flex flex-col gap-1">
               <label className="text-xs font-bold text-slate-600 uppercase">Cantidad Devuelta / Dañada (*)</label>
               <InputNumber 
                  value={discrepancyDamagedQty} 
                  onValueChange={e => setDiscrepancyDamagedQty(e.value || 0)} 
                  min={0} 
                  className="w-full font-bold text-red-700" 
               />
            </div>

            <div className="flex flex-col gap-1">
               <label className="text-xs font-bold text-slate-600 uppercase">Motivo de Devolución / Avería</label>
               <InputText 
                  value={discrepancyReason} 
                  onChange={e => setDiscrepancyReason(e.target.value)} 
                  placeholder="Ej: Empaque roto, No conforme por calidad, Vencido..." 
                  className="w-full text-xs font-bold" 
               />
            </div>

            <div className="mt-4 flex justify-end gap-2">
               <Button label="Cancelar" outlined severity="secondary" onClick={() => setDiscrepancyDialogVisible(false)} className="font-bold text-xs" />
               <Button label="Guardar Avería / Devolución" icon="pi pi-check" severity="danger" onClick={saveDiscrepancy} className="font-bold text-xs bg-red-600 border-none" />
            </div>
         </div>
      </Dialog>

      {/* DIÁLOGO TICKET Y ACTA DE RECEPCIÓN 80MM (ESTÁNDAR) */}
      <Dialog header={ticketData?.is_confirmed ? "Vista Previa Acta Definitiva 80mm" : "Vista Previa Guía de Descarga en Muelle"} visible={ticketDialogVisible} onHide={() => { setTicketDialogVisible(false); router.push('/receipts'); }} style={{ width: '420px' }}>
          {ticketData && (
              <div className="font-mono text-xs p-4 bg-white border border-slate-300 rounded shadow-inner text-slate-900 leading-tight">
                  <div className="text-center font-black text-sm mb-1">NEO WMS LOGÍSTICA</div>
                  <div className="text-center font-bold text-[11px] mb-2 border-b pb-2 border-dashed border-slate-400 uppercase">
                      {ticketData.is_confirmed ? "ACTA DE RECEPCIÓN Y DISCREPANCIAS" : "GUÍA DE CONTEO Y DESCARGA EN MUELLE"}
                  </div>
                  <p><strong>ODC:</strong> {ticketData.order_reference}</p>
                  <p><strong>FECHA:</strong> {ticketData.created_at}</p>
                  <p><strong>PROVEEDOR:</strong> {ticketData.supplier_name}</p>
                  <p><strong>SUCURSAL:</strong> {ticketData.facility_name}</p>
                  <p><strong>REGISTRADO POR:</strong> {ticketData.received_by_name || currentUser?.full_name || currentUser?.email || 'Operador WMS'}</p>

                  {ticketData.is_confirmed ? (
                      <>
                          {ticketData.has_discrepancies && (
                              <div className="my-2 p-1.5 bg-slate-100 font-bold text-center border border-slate-400 text-[10px]">
                                  ⚠️ CONTIENE DISCREPANCIAS / RECHAZOS EN MUELLE
                              </div>
                          )}
                          <div className="my-2 border-b border-dashed border-slate-400"></div>
                          <table className="w-full text-left">
                              <thead>
                                  <tr className="border-b border-slate-400 text-[10px]">
                                      <th className="py-1">CÓD/PRODUCTO</th>
                                      <th className="py-1 text-center">PED</th>
                                      <th className="py-1 text-center">REC</th>
                                      <th className="py-1 text-right">DEV</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {ticketData.items.map((it: any, idx: number) => {
                                      const rejNum = Number(it.rejected_qty || 0);
                                      const pedFmt = formatReceiptQty(it.expected_qty, it.uom_base);
                                      const recFmt = formatReceiptQty(it.received_qty, it.uom_base);
                                      const rejFmt = rejNum > 0 ? `-${formatReceiptQty(rejNum, it.uom_base)}` : '0';
                                      return (
                                      <tr key={idx} className="border-b border-slate-200">
                                          <td className="py-1 max-w-[150px]">
                                              <div className="font-bold text-[11px]">{it.sku}</div>
                                              <div className="text-[9px] text-slate-600 truncate">{it.product_name}</div>
                                          </td>
                                          <td className="py-1 text-center font-bold">{pedFmt}</td>
                                          <td className="py-1 text-center font-bold text-emerald-700">{recFmt}</td>
                                          <td className="py-1 text-right font-black text-red-600">{rejFmt}</td>
                                      </tr>
                                  );})}
                              </tbody>
                          </table>
                          <div className="my-4 border-b border-dashed border-slate-400"></div>
                          
                          {/* BLOQUE DE FIRMAS LEGALES */}
                          <div className="mt-6 flex flex-col gap-6 text-[10px]">
                              <div>
                                  <p className="border-b border-slate-400 w-full mb-1"></p>
                                  <p className="font-bold text-center">Firma y Cédula Chofer / Transportista</p>
                              </div>
                              <div>
                                  <p className="border-b border-slate-400 w-full mb-1"></p>
                                  <p className="font-bold text-center">Firma y Cédula Recibidor WMS / Muelle</p>
                                  <p className="text-center text-[9px] text-slate-600 font-semibold mt-0.5">
                                      ({ticketData.received_by_name || currentUser?.full_name || currentUser?.email || 'Operador WMS'})
                                  </p>
                              </div>
                          </div>
                      </>
                  ) : (
                      <>
                          <div className="my-2 p-1.5 bg-blue-50 font-bold text-center border border-blue-300 text-[10px] text-blue-800">
                              📋 CONTROL FÍSICO DE CONTEO EN MUELLE
                          </div>
                          <div className="my-2 border-b border-dashed border-slate-400"></div>
                          <table className="w-full text-left">
                              <thead>
                                  <tr className="border-b border-slate-400 text-[10px]">
                                      <th className="py-1">CÓD/PRODUCTO</th>
                                      <th className="py-1 text-center">ESPERADO</th>
                                      <th className="py-1 text-right">CONTEO FÍSICO</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {ticketData.items.map((it: any, idx: number) => (
                                      <tr key={idx} className="border-b border-slate-200">
                                          <td className="py-1 max-w-[160px]">
                                              <div className="font-bold text-[11px]">{it.sku}</div>
                                              <div className="text-[9px] text-slate-600 truncate">{it.product_name}</div>
                                          </td>
                                          <td className="py-1 text-center font-bold text-slate-800">{formatReceiptQty(it.expected_qty, it.uom_base)}</td>
                                          <td className="py-1 text-right font-bold text-slate-400">[ &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; ]</td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                          <div className="my-4 border-b border-dashed border-slate-400"></div>
                          <div className="mt-4 text-[10px] text-center text-slate-600">
                              <p className="border-b border-slate-400 w-full mb-1 mt-6"></p>
                              <p className="font-bold">Firma Fiscal / Revisor Muelle</p>
                          </div>
                      </>
                  )}

                  <div className="mt-5 flex justify-center">
                      <Button 
                          label="Imprimir Acta Definitiva" 
                          icon="pi pi-print" 
                          severity="success" 
                          size="small" 
                          onClick={() => {
                              const isConfirmed = Boolean(ticketData.is_confirmed);
                              const registeredByName = ticketData.received_by_name || currentUser?.full_name || currentUser?.email || 'Operador WMS';
                              const items = Array.isArray(ticketData.items) ? ticketData.items : [];
                              const rowsHtml = items.map((it: any) => {
                                  const rej = Number(it.rejected_qty || 0);
                                  const pedFmt = formatReceiptQty(it.expected_qty, it.uom_base);
                                  const recFmt = formatReceiptQty(it.received_qty, it.uom_base);
                                  const rejFmt = rej > 0 ? `-${formatReceiptQty(rej, it.uom_base)}` : '0';
                                  return `
                                      <tr>
                                          <td style="padding: 3px 0; border-bottom: 1px dotted #000; max-width: 42mm; word-wrap: break-word;">
                                              <div style="font-weight: 800; font-size: 11px;">${it.sku || ''}</div>
                                              <div style="font-size: 10px;">${it.product_name || ''}</div>
                                          </td>
                                          <td style="padding: 3px 2px; border-bottom: 1px dotted #000; text-align: center; font-weight: 700;">${pedFmt}</td>
                                          <td style="padding: 3px 2px; border-bottom: 1px dotted #000; text-align: center; font-weight: 800;">${recFmt}</td>
                                          <td style="padding: 3px 0; border-bottom: 1px dotted #000; text-align: right; font-weight: 800;">${rejFmt}</td>
                                      </tr>
                                  `;
                              }).join('');

                              const estHeightMm = Math.max(90, 75 + items.length * 10);
                              const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${ticketData.order_reference || 'Ticket 80mm'} - Neo WMS</title>
  <style id="thermal-page-style">
    @page { size: 80mm ${estHeightMm}mm; margin: 0mm; }
  </style>
  <style>
    * { box-sizing: border-box; color: #000000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body {
      width: 72mm;
      max-width: 72mm;
      margin: 0;
      padding: 2mm 2mm 4mm 2mm;
      font-family: Arial, Helvetica, 'Courier New', monospace;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.25;
      background: #ffffff !important;
      color: #000000 !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: hidden !important;
    }
    .no-print-bar {
      background: #0f172a;
      color: #fff !important;
      padding: 8px;
      margin-bottom: 8px;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: sans-serif;
      font-size: 11px;
    }
    .no-print-bar button {
      background: #10b981;
      color: #fff !important;
      border: none;
      padding: 5px 10px;
      border-radius: 4px;
      font-weight: bold;
      cursor: pointer;
    }
    @media print {
      .no-print-bar { display: none !important; }
    }
    .header-title { text-align: center; font-weight: 900; font-size: 14px; margin-bottom: 2px; }
    .header-sub { text-align: center; font-weight: 800; font-size: 10.5px; border-bottom: 1.5px dashed #000; padding-bottom: 4px; margin-bottom: 6px; text-transform: uppercase; }
    .meta-row { margin: 2px 0; font-size: 11px; word-wrap: break-word; font-weight: 700; }
    .alert-box { margin: 6px 0; padding: 4px; border: 1.5px solid #000; text-align: center; font-weight: 900; font-size: 10px; }
    .divider { border-bottom: 1.5px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    th { border-bottom: 1.5px solid #000; padding: 3px 0; font-size: 10px; font-weight: 900; }
    .sig-block { margin-top: 16px; text-align: center; font-size: 10px; font-weight: 800; page-break-inside: avoid; }
    .sig-line { border-bottom: 1.5px solid #000; width: 100%; height: 18px; margin-bottom: 3px; }
    .footer-note { margin-top: 8px; text-align: center; font-size: 9px; font-weight: 700; border-top: 1.5px dashed #000; padding-top: 4px; }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <span style="color:#fff !important;">Ticket 80mm listo</span>
    <button onclick="window.print()">🖨️ Imprimir</button>
  </div>
  <div id="ticket-root">
    <div class="header-title">NEO WMS LOGÍSTICA</div>
    <div class="header-sub">${isConfirmed ? 'ACTA DE RECEPCIÓN Y DISCREPANCIAS' : 'GUÍA DE CONTEO Y DESCARGA EN MUELLE'}</div>
    <div class="meta-row"><strong>ODC:</strong> ${ticketData.order_reference || ''}</div>
    <div class="meta-row"><strong>FECHA:</strong> ${ticketData.created_at || ''}</div>
    <div class="meta-row"><strong>PROVEEDOR:</strong> ${ticketData.supplier_name || ''}</div>
    <div class="meta-row"><strong>SUCURSAL:</strong> ${ticketData.facility_name || ''}</div>
    <div class="meta-row"><strong>REGISTRADO POR:</strong> ${registeredByName}</div>
    ${isConfirmed && ticketData.has_discrepancies ? '<div class="alert-box">CONTIENE DISCREPANCIAS / RECHAZOS EN MUELLE</div>' : ''}
    <div class="divider"></div>
    <table>
      <thead>
        <tr>
          <th style="text-align: left;">CÓD/PRODUCTO</th>
          <th style="text-align: center;">PED</th>
          <th style="text-align: center;">REC</th>
          <th style="text-align: right;">DEV</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="divider"></div>
    <div class="sig-block"><div class="sig-line"></div><div>Firma y Cédula Chofer / Transportista</div></div>
    <div class="sig-block"><div class="sig-line"></div><div>Firma y Cédula Recibidor WMS / Muelle</div><div style="font-size: 9px; font-weight: 700; margin-top: 2px;">(${registeredByName})</div></div>
    <div class="footer-note">Impreso por Neo ERP — ${new Date().toLocaleString('es-VE')}</div>
  </div>
  <script>
    window.onload = function() {
      var root = document.getElementById('ticket-root');
      var hPx = root ? root.offsetHeight : document.body.scrollHeight;
      var exactMm = Math.max(75, Math.ceil((hPx * 25.4) / 96) + 8);
      var pageStyle = document.getElementById('thermal-page-style');
      if (pageStyle) {
        pageStyle.innerHTML = '@page { size: 80mm ' + exactMm + 'mm; margin: 0mm; }';
      }
      setTimeout(function() {
        window.focus();
        window.print();
      }, 200);
    };
  </script>
</body>
</html>`;

                              const printWin = window.open('', '_blank', 'width=420,height=720');
                              if (!printWin) {
                                  toast.current?.show({ severity: 'warn', summary: 'Ventana bloqueada', detail: 'Permita las ventanas emergentes para imprimir en la tickera.' });
                                  return;
                              }
                              printWin.document.open();
                              printWin.document.write(htmlContent);
                              printWin.document.close();
                          }} 
                          className="font-bold bg-emerald-600 border-none" 
                      />
                  </div>
              </div>
          )}
      </Dialog>
    </div>
  );
}
