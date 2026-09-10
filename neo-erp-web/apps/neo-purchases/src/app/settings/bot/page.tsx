"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card } from 'primereact/card';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Toast } from 'primereact/toast';
import { Dropdown } from 'primereact/dropdown';
import Link from 'next/link';
import api from '@/lib/api';

interface DiagnosisItem {
  variant_id: number;
  sku: string;
  product_name: string;
  facility_id: number;
  facility_name: string;
  stock_qty: number;
  transit_qty: number;
  available_qty: number;
  run_rate: number;
  days_of_stock: number;
  critical_threshold: number;
  urgency: 'CRITICAL' | 'WARNING' | 'HEALTHY';
  boxes_needed: number;
  suggested_base_qty: number;
  pack_name?: string;
  qty_per_pack: number;
  moq: number;
  unit_cost: number;
  estimated_subtotal: number;
}

interface SupplierDiagnosis {
  supplier_id: number;
  supplier_name: string;
  lead_time_days: number;
  urgency: 'CRITICAL' | 'WARNING' | 'HEALTHY';
  total_skus: number;
  skus_in_breach: number;
  critical_skus_count: number;
  warning_skus_count: number;
  estimated_total_cost: number;
  existing_draft_po_id?: number | null;
  existing_draft_po_reference?: string | null;
  items: DiagnosisItem[];
}

interface DiagnosisSummary {
  evaluated_at: string;
  total_suppliers_evaluated: number;
  total_items_evaluated: number;
  critical_suppliers_count: number;
  warning_suppliers_count: number;
  healthy_suppliers_count: number;
  total_capital_required: number;
  suppliers: SupplierDiagnosis[];
}

export default function ClaraComprasConsolePage() {
  const [diagnosis, setDiagnosis] = useState<DiagnosisSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [generatingSupplierId, setGeneratingSupplierId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('BREACH'); // 'BREACH', 'ALL', 'CRITICAL', 'WARNING'
  const [expandedSuppliers, setExpandedSuppliers] = useState<Record<number, boolean>>({});
  
  // Modal de auditoría
  const [showLogsDialog, setShowLogsDialog] = useState<boolean>(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

  const toast = useRef<Toast>(null);

  const fetchDiagnosis = async () => {
    setLoading(true);
    try {
      const res = await api.get('/mrp/diagnosis');
      setDiagnosis(res.data);
      // Expandir por defecto los primeros 3 proveedores críticos
      const initialExpanded: Record<number, boolean> = {};
      (res.data?.suppliers || []).slice(0, 3).forEach((s: SupplierDiagnosis) => {
        initialExpanded[s.supplier_id] = true;
      });
      setExpandedSuppliers(initialExpanded);
    } catch (e: any) {
      console.error('Error fetching MRP diagnosis:', e);
      toast.current?.show({
        severity: 'error',
        summary: 'Error de Diagnóstico',
        detail: e.response?.data?.detail || 'No se pudo cargar el diagnóstico predictivo de compras.'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await api.get('/mrp/bot/logs');
      setLogs(res.data || []);
    } catch (e) {
      console.error('Error fetching logs:', e);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchDiagnosis();
  }, []);

  const handleGenerateOrder = async (supplier: SupplierDiagnosis) => {
    setGeneratingSupplierId(supplier.supplier_id);
    try {
      const res = await api.post('/mrp/generate-supplier-order', {
        supplier_id: supplier.supplier_id,
        facility_id: supplier.items[0]?.facility_id || 1,
        notes: `Generado desde Consola Clara Compras para ${supplier.supplier_name}`
      });

      toast.current?.show({
        severity: 'success',
        summary: 'ODC Borrador Creada',
        detail: `Se generó ${res.data.order_reference} para ${supplier.supplier_name} por $${res.data.total_amount?.toLocaleString()} USD (${res.data.lines_count} renglones).`,
        life: 5000
      });

      // Actualizar el estado local para reflejar la orden creada
      setDiagnosis(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          suppliers: prev.suppliers.map(s => {
            if (s.supplier_id === supplier.supplier_id) {
              return {
                ...s,
                existing_draft_po_id: res.data.order_id,
                existing_draft_po_reference: res.data.order_reference
              };
            }
            return s;
          })
        };
      });
    } catch (e: any) {
      console.error('Error generating surgical order:', e);
      toast.current?.show({
        severity: 'error',
        summary: 'Fallo al Crear Orden',
        detail: e.response?.data?.detail || 'No se pudo generar la orden de compra.'
      });
    } finally {
      setGeneratingSupplierId(null);
    }
  };

  const toggleSupplierExpand = (id: number) => {
    setExpandedSuppliers(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Filtrado de proveedores
  const filteredSuppliers = (diagnosis?.suppliers || []).filter(s => {
    const matchesSearch = s.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.items.some(i => i.sku.toLowerCase().includes(searchTerm.toLowerCase()) || i.product_name.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (urgencyFilter === 'BREACH') return s.urgency === 'CRITICAL' || s.urgency === 'WARNING';
    if (urgencyFilter === 'CRITICAL') return s.urgency === 'CRITICAL';
    if (urgencyFilter === 'WARNING') return s.urgency === 'WARNING';
    if (urgencyFilter === 'HEALTHY') return s.urgency === 'HEALTHY';
    return true; // 'ALL'
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <Toast ref={toast} />

      {/* ENCABEZADO PRINCIPAL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl shadow-xl border border-indigo-500/20 text-white">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-400">
              <i className="pi pi-sparkles text-2xl" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Consola Clara Compras</h1>
              <p className="text-sm text-indigo-200/80">
                Diagnóstico Predictivo de Quiebres y Reposición Asistida (Human-in-the-Loop)
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            label="Auditoría y Bitácora"
            icon="pi pi-history"
            className="p-button-outlined p-button-sm border-indigo-400/40 text-indigo-200 hover:bg-indigo-900/40"
            onClick={() => {
              fetchLogs();
              setShowLogsDialog(true);
            }}
          />
          <Button
            label={loading ? 'Analizando...' : 'Diagnosticar en Tiempo Real'}
            icon={loading ? 'pi pi-spin pi-spinner' : 'pi pi-bolt'}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold p-button-sm px-4 shadow-lg shadow-indigo-600/30"
            onClick={fetchDiagnosis}
            disabled={loading}
          />
        </div>
      </div>

      {/* TARJETAS KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Proveedores Críticos */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-red-200 dark:border-red-900/40 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
              Quiebre Inmediato
            </span>
            <div className="text-3xl font-black text-slate-900 dark:text-white mt-1">
              {loading ? '-' : diagnosis?.critical_suppliers_count || 0}
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Proveedores sin stock o cobertura &lt; Lead Time
            </span>
          </div>
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 text-xl font-bold">
            🔴
          </div>
        </div>

        {/* Proveedores en Riesgo */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-amber-200 dark:border-amber-900/40 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Quiebre Proyectado
            </span>
            <div className="text-3xl font-black text-slate-900 dark:text-white mt-1">
              {loading ? '-' : diagnosis?.warning_suppliers_count || 0}
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Proveedores bajo stock de seguridad
            </span>
          </div>
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 text-xl font-bold">
            🟡
          </div>
        </div>

        {/* Capital Estimado Requerido */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-indigo-200 dark:border-indigo-900/40 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
              Inversión Estimada
            </span>
            <div className="text-3xl font-black text-indigo-700 dark:text-indigo-400 mt-1">
              {loading ? '-' : `$${(diagnosis?.total_capital_required || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              USD total para cubrir umbral crítico
            </span>
          </div>
          <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 text-xl font-bold">
            💵
          </div>
        </div>

        {/* Proveedores Evaluados */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Catálogo Evaluado
            </span>
            <div className="text-3xl font-black text-slate-900 dark:text-white mt-1">
              {loading ? '-' : diagnosis?.total_suppliers_evaluated || 0}
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Proveedores activos con rotación 90d
            </span>
          </div>
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 text-xl font-bold">
            🏢
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex-1 w-full md:w-auto relative">
          <i className="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <InputText
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por proveedor o SKU..."
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Dropdown
            value={urgencyFilter}
            options={[
              { label: '⚠️ Solo Quiebres y Alertas', value: 'BREACH' },
              { label: '🔴 Solo Quiebre Inmediato', value: 'CRITICAL' },
              { label: '🟡 Solo En Riesgo', value: 'WARNING' },
              { label: '🟢 Solo Saludables', value: 'HEALTHY' },
              { label: '🌐 Todos los Proveedores', value: 'ALL' },
            ]}
            onChange={(e) => setUrgencyFilter(e.value)}
            className="w-full md:w-64 text-sm"
          />
        </div>
      </div>

      {/* LISTA DE PROVEEDORES DIAGNOSTICADOS */}
      {loading ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <i className="pi pi-spin pi-spinner text-4xl text-indigo-600 mb-3" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">Clara Compras está diagnosticando el inventario...</h3>
          <p className="text-sm text-slate-500">Analizando consumo diario de 90 días, plazos de entrega y tránsitos abiertos.</p>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl mb-4">
            ✓
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">No se encontraron proveedores para los filtros seleccionados</h3>
          <p className="text-sm text-slate-500 mt-1">Los proveedores evaluados se encuentran abastecidos o no coinciden con la búsqueda.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSuppliers.map((supplier) => {
            const isExpanded = !!expandedSuppliers[supplier.supplier_id];
            const isCritical = supplier.urgency === 'CRITICAL';
            const isWarning = supplier.urgency === 'WARNING';
            const isGenerating = generatingSupplierId === supplier.supplier_id;

            return (
              <div
                key={supplier.supplier_id}
                className={`bg-white dark:bg-slate-800 rounded-2xl border transition-all duration-200 overflow-hidden shadow-sm hover:shadow-md ${
                  isCritical 
                    ? 'border-red-200 dark:border-red-900/40' 
                    : isWarning 
                    ? 'border-amber-200 dark:border-amber-900/40' 
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                {/* CABECERA DE LA TARJETA DEL PROVEEDOR */}
                <div className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5 flex-1">
                    <button
                      onClick={() => toggleSupplierExpand(supplier.supplier_id)}
                      className="mt-1 w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors"
                    >
                      <i className={`pi pi-chevron-${isExpanded ? 'up' : 'down'} text-xs font-bold`} />
                    </button>
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {isCritical && (
                          <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200">
                            🔴 QUIEBRE INMEDIATO
                          </span>
                        )}
                        {isWarning && (
                          <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200">
                            🟡 EN RIESGO PROYECTADO
                          </span>
                        )}
                        {!isCritical && !isWarning && (
                          <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200">
                            🟢 ABASTECIDO
                          </span>
                        )}
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                          {supplier.supplier_name}
                        </h2>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex-wrap">
                        <span>⏱️ Lead Time: <strong>{supplier.lead_time_days} días</strong></span>
                        <span>•</span>
                        <span>📦 <strong>{supplier.skus_in_breach}</strong> SKUs en déficit</span>
                        <span>•</span>
                        <span>💵 Inversión: <strong className="text-indigo-600 dark:text-indigo-400 font-bold">${supplier.estimated_total_cost.toLocaleString()} USD</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* ACCIONES DEL PROVEEDOR */}
                  <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                    {supplier.existing_draft_po_id ? (
                      <Link
                        href={`/orders/${supplier.existing_draft_po_id}`}
                        className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-lg text-xs font-black hover:bg-emerald-100 transition-colors"
                      >
                        <i className="pi pi-check-circle" />
                        <span>Ver Borrador {supplier.existing_draft_po_reference || `ODC-${supplier.existing_draft_po_id}`}</span>
                      </Link>
                    ) : (
                      <Button
                        label={isGenerating ? 'Generando...' : 'Generar Borrador ODC'}
                        icon={isGenerating ? 'pi pi-spin pi-spinner' : 'pi pi-bolt'}
                        className={`p-button-sm text-xs font-bold px-4 rounded-lg shadow-sm ${
                          isCritical
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                        onClick={() => handleGenerateOrder(supplier)}
                        disabled={isGenerating || supplier.items.length === 0}
                      />
                    )}
                  </div>
                </div>

                {/* DESGLOSE EXPANDIBLE DE PRODUCTOS */}
                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 p-4">
                    {supplier.items.length === 0 ? (
                      <div className="text-center py-4 text-xs text-slate-400">
                        Todos los productos de este proveedor se encuentran con stock óptimo.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-slate-700">
                              <th className="py-2.5 px-3">SKU / Producto</th>
                              <th className="py-2.5 px-3">Sede</th>
                              <th className="py-2.5 px-3 text-right">Stock Físico</th>
                              <th className="py-2.5 px-3 text-right">Tránsito</th>
                              <th className="py-2.5 px-3 text-right">Venta/Día</th>
                              <th className="py-2.5 px-3 text-right">Días Stock</th>
                              <th className="py-2.5 px-3 text-right">Sugerido</th>
                              <th className="py-2.5 px-3 text-right">Costo Unit.</th>
                              <th className="py-2.5 px-3 text-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {supplier.items.map((item) => (
                              <tr key={item.variant_id} className="hover:bg-white dark:hover:bg-slate-800/60 transition-colors">
                                <td className="py-2.5 px-3">
                                  <div className="font-bold text-slate-800 dark:text-slate-200">{item.product_name}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">{item.sku}</div>
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{item.facility_name}</td>
                                <td className="py-2.5 px-3 text-right font-medium text-slate-700 dark:text-slate-300">
                                  {item.stock_qty.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-3 text-right text-slate-500">
                                  {item.transit_qty > 0 ? `+${item.transit_qty.toLocaleString()}` : '-'}
                                </td>
                                <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-400">
                                  {item.run_rate.toFixed(1)} /d
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold">
                                  <span className={item.days_of_stock <= supplier.lead_time_days ? 'text-red-600 font-black' : 'text-amber-600'}>
                                    {item.days_of_stock.toFixed(1)} d
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <div className="font-black text-indigo-600 dark:text-indigo-400">
                                    {item.boxes_needed} {item.pack_name || 'cajas'}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    ({item.suggested_base_qty.toLocaleString()} uds)
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-300 font-mono">
                                  ${item.unit_cost.toFixed(2)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-black text-slate-900 dark:text-white font-mono">
                                  ${item.estimated_subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* DIÁLOGO DE BITÁCORA Y AUDITORÍA */}
      <Dialog
        header="Bitácora de Ejecuciones del Autómata MRP"
        visible={showLogsDialog}
        style={{ width: '80vw', maxWidth: '1000px' }}
        onHide={() => setShowLogsDialog(false)}
        className="rounded-2xl"
      >
        <DataTable
          value={logs}
          loading={loadingLogs}
          paginator
          rows={8}
          emptyMessage="No hay registros históricos de ejecución."
          className="text-xs"
        >
          <Column
            field="executed_at"
            header="Fecha y Hora"
            body={(row) => (
              <div>
                <div className="font-bold text-slate-700">{new Date(row.executed_at).toLocaleDateString()}</div>
                <div className="text-[10px] text-slate-400 font-mono">{new Date(row.executed_at).toLocaleTimeString()}</div>
              </div>
            )}
          />
          <Column
            field="status"
            header="Estado"
            body={(row) => (
              <Tag
                value={row.status?.toUpperCase()}
                severity={row.status === 'success' ? 'success' : 'danger'}
                className="font-black text-[10px] px-2.5 py-0.5 rounded-full"
              />
            )}
          />
          <Column
            field="items_evaluated"
            header="Ítems Evaluados"
            body={(row) => <span className="font-mono font-bold">{row.items_evaluated}</span>}
          />
          <Column
            field="orders_generated"
            header="ODCs Generadas"
            body={(row) => (
              <span className="font-mono font-bold text-indigo-600">
                {row.orders_generated}
              </span>
            )}
          />
        </DataTable>
      </Dialog>
    </div>
  );
}
