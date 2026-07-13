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
import { InputSwitch } from 'primereact/inputswitch';

export default function MRPBotSettingsPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [selectedLog, setSelectedLog] = useState<any>(null);
    const [showDetailDialog, setShowDetailDialog] = useState(false);
    const [detailSearch, setDetailSearch] = useState('');
    const [showOnlyPurchased, setShowOnlyPurchased] = useState(false);
    const toast = useRef<Toast>(null);

    // Dynamic configuration variables (Bot params mock)
    const [botEnabled, setBotEnabled] = useState(true);
    const [targetServiceLevel, setTargetServiceLevel] = useState(95);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const { default: api } = await import('@/lib/api');
            const res = await api.get('/mrp/bot/logs');
            // Sort by executed_at desc
            const sorted = (res.data || []).sort((a: any, b: any) => 
                new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime()
            );
            setLogs(sorted);
        } catch (e) {
            console.error(e);
            toast.current?.show({ 
                severity: 'error', 
                summary: 'Error', 
                detail: 'No se pudo cargar la bitácora del autómata' 
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const handleRunBot = async () => {
        const confirmed = window.confirm(
            '¿Está seguro de que desea ejecutar el bot de reabastecimiento ahora?\n' +
            'Esto analizará el stock de todos los productos y generará Órdenes de Compra (ODC) en borrador para aquellos que estén bajo el umbral crítico.'
        );
        if (!confirmed) return;

        setRunning(true);
        toast.current?.show({
            severity: 'info',
            summary: 'Procesando',
            detail: 'El motor de inteligencia artificial de compras está analizando el stock...',
            life: 5000
        });

        try {
            const { default: api } = await import('@/lib/api');
            const res = await api.post('/mrp/bot/run');
            toast.current?.show({
                severity: 'success',
                summary: 'Ejecución exitosa',
                detail: `El bot finalizó con éxito. Evaluó ${res.data.items_evaluated} ítems y generó ${res.data.orders_generated} Órdenes de Compra (ODC).`
            });
            fetchLogs();
        } catch (e: any) {
            console.error(e);
            toast.current?.show({
                severity: 'error',
                summary: 'Fallo de ejecución',
                detail: e.response?.data?.detail || 'Ocurrió un error inesperado al correr el bot.'
            });
        } finally {
            setRunning(false);
        }
    };

    const handleViewDetails = (log: any) => {
        setSelectedLog(log);
        setShowDetailDialog(true);
    };

    const statusBodyTemplate = (rowData: any) => {
        const status = rowData.status?.toLowerCase();
        if (status === 'success') {
            return <Tag value="COMPLETO" severity="success" className="px-3 py-1 font-black text-xs rounded-full" />;
        } else if (status === 'failed') {
            return <Tag value="ERROR" severity="danger" className="px-3 py-1 font-black text-xs rounded-full" />;
        } else {
            return <Tag value="CORRIENDO" severity="info" className="px-3 py-1 font-black text-xs rounded-full" />;
        }
    };

    const dateBodyTemplate = (rowData: any) => {
        return (
            <div className="flex flex-col">
                <span className="font-bold text-slate-700">
                    {new Date(rowData.executed_at).toLocaleDateString()}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                    {new Date(rowData.executed_at).toLocaleTimeString()}
                </span>
            </div>
        );
    };

    const actionsBodyTemplate = (rowData: any) => {
        return (
            <Button
                icon="pi pi-search-plus"
                label="Auditar"
                onClick={() => handleViewDetails(rowData)}
                className="p-button-text p-button-sm text-indigo-600 hover:text-indigo-800 font-black"
            />
        );
    };

    // Parsing the details log JSON
    let parsedDetails: any[] = [];
    if (selectedLog && selectedLog.details) {
        try {
            const raw = typeof selectedLog.details === 'string' ? JSON.parse(selectedLog.details) : selectedLog.details;
            parsedDetails = Array.isArray(raw) ? raw : [];
        } catch (e) {
            console.error("Error parsing details JSON", e);
        }
    }

    // Apply client filters to the details datatable
    const filteredDetails = parsedDetails.filter((item: any) => {
        const matchesSearch = 
            (item.sku || '').toLowerCase().includes(detailSearch.toLowerCase()) ||
            (item.product_name || '').toLowerCase().includes(detailSearch.toLowerCase()) ||
            (item.supplier_name || '').toLowerCase().includes(detailSearch.toLowerCase()) ||
            (item.facility_name || '').toLowerCase().includes(detailSearch.toLowerCase());
        
        if (showOnlyPurchased) {
            return matchesSearch && item.status === 'purchased';
        }
        return matchesSearch;
    });

    const detailStatusTemplate = (rowData: any) => {
        const isPurchased = rowData.status === 'purchased';
        return (
            <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${
                isPurchased ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
                {isPurchased ? 'ORDENADO' : 'IGNORADO'}
            </span>
        );
    };

    return (
        <div className="p-6 sm:p-8 bg-slate-50 min-h-screen flex flex-col">
            <Toast ref={toast} />
            
            {/* Header section */}
            <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                        <i className="pi pi-sparkles text-emerald-500 text-3xl"></i> Autómata de Compras (AI Bot)
                    </h1>
                    <p className="text-slate-500 font-medium mt-1">
                        Controla el demonio de abastecimiento automatizado y audita cada cálculo predictivo del MRP.
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button 
                        label="Ejecutar Ahora" 
                        icon="pi pi-play" 
                        loading={running}
                        onClick={handleRunBot}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold border-none px-5 py-3 rounded-xl shadow-md transition-all duration-300"
                    />
                    <Button 
                        icon="pi pi-refresh" 
                        outlined 
                        onClick={fetchLogs} 
                        className="border-slate-300 text-slate-600 hover:bg-slate-100 rounded-xl"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                {/* Configuration Panel */}
                <Card className="lg:col-span-1 shadow-sm border border-slate-200 rounded-2xl bg-white">
                    <h2 className="text-lg font-black text-slate-800 tracking-tight mb-6 flex items-center gap-2">
                        <i className="pi pi-cog text-slate-500"></i> Parámetros de Operación
                    </h2>
                    
                    <div className="flex flex-col gap-6">
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div className="flex flex-col">
                                <span className="font-bold text-slate-700 text-sm">Ejecución Nocturna</span>
                                <span className="text-xs text-slate-400">Trigger automático diario 3:00 AM</span>
                            </div>
                            <InputSwitch 
                                checked={botEnabled} 
                                onChange={(e) => {
                                    setBotEnabled(e.value);
                                    toast.current?.show({
                                        severity: 'success',
                                        summary: 'Configuración Guardada',
                                        detail: `El bot nocturno ha sido ${e.value ? 'activado' : 'desactivado'}.`
                                    });
                                }} 
                            />
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <span className="font-bold text-slate-700 text-sm block mb-1">Nivel de Servicio AI</span>
                            <span className="text-xs text-slate-400 block mb-3">Z-Score para el cálculo de stock de seguridad</span>
                            <div className="flex items-center justify-between">
                                <span className="font-black text-slate-800 text-lg">{targetServiceLevel}% <span className="text-xs font-normal text-slate-500">(Z = 1.65)</span></span>
                                <div className="flex gap-1">
                                    <Button icon="pi pi-minus" className="p-button-sm p-button-outlined border-slate-300 text-slate-600 p-1" onClick={() => setTargetServiceLevel(Math.max(80, targetServiceLevel - 5))} />
                                    <Button icon="pi pi-plus" className="p-button-sm p-button-outlined border-slate-300 text-slate-600 p-1" onClick={() => setTargetServiceLevel(Math.min(99, targetServiceLevel + 5))} />
                                </div>
                            </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex gap-3 text-xs leading-relaxed font-medium">
                            <i className="pi pi-info-circle text-amber-600 text-lg flex-shrink-0 mt-0.5"></i>
                            <div>
                                <strong className="block mb-1">Cálculo Dinámico de Seguridad:</strong>
                                La Inteligencia Artificial calcula el stock de seguridad dinámicamente usando la variabilidad de la demanda diaria y la confiabilidad en la puntualidad de cada proveedor.
                            </div>
                        </div>
                    </div>
                </Card>

                {/* History Log grid */}
                <Card className="lg:col-span-2 shadow-sm border border-slate-200 rounded-2xl bg-white flex flex-col">
                    <h2 className="text-lg font-black text-slate-800 tracking-tight mb-6 flex items-center gap-2">
                        <i className="pi pi-history text-slate-500"></i> Bitácora de Ejecuciones
                    </h2>
                    
                    <DataTable
                        value={logs}
                        loading={loading}
                        paginator
                        rows={10}
                        emptyMessage="No hay registros en la bitácora del bot."
                        className="p-datatable-sm"
                        responsiveLayout="scroll"
                    >
                        <Column body={dateBodyTemplate} header="Fecha y Hora" style={{ minWidth: '10rem' }} />
                        <Column body={statusBodyTemplate} header="Estado" style={{ minWidth: '8rem' }} />
                        <Column field="items_evaluated" header="Evaluados" sortable style={{ minWidth: '7rem' }} />
                        <Column field="orders_generated" header="ODC Creadas" sortable style={{ minWidth: '8rem' }} />
                        <Column body={actionsBodyTemplate} header="Acción" style={{ minWidth: '8rem' }} align="center" />
                    </DataTable>
                </Card>
            </div>

            {/* Audit details Dialog */}
            <Dialog
                header={
                    <div className="flex items-center gap-3">
                        <i className="pi pi-file-edit text-indigo-500 text-2xl"></i>
                        <div>
                            <span className="font-black text-slate-800 text-xl block">
                                Auditoría de Cálculos Predictivos
                            </span>
                            <span className="text-xs text-slate-400 font-medium block mt-0.5">
                                Corrida del {selectedLog && new Date(selectedLog.executed_at).toLocaleString()} | ID #{selectedLog?.id}
                            </span>
                        </div>
                    </div>
                }
                visible={showDetailDialog}
                onHide={() => setShowDetailDialog(false)}
                modal
                className="w-full max-w-[1200px]"
                contentClassName="p-6 bg-slate-50"
            >
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-4">
                    {/* Filters header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-2">
                        <div className="relative flex-1 max-w-md flex items-center">
                            <i className="pi pi-search absolute left-3 text-slate-400" />
                            <InputText
                                value={detailSearch}
                                onChange={(e) => setDetailSearch(e.target.value)}
                                placeholder="Filtrar por SKU, Producto, Proveedor o Tienda..."
                                className="w-full !pl-10 rounded-lg"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-slate-600">Mostrar solo compras generadas:</span>
                            <InputSwitch
                                checked={showOnlyPurchased}
                                onChange={(e) => setShowOnlyPurchased(e.value)}
                            />
                        </div>
                    </div>

                    {/* Details table */}
                    <DataTable
                        value={filteredDetails}
                        paginator
                        rows={10}
                        emptyMessage="No se encontraron registros de auditoría para esta búsqueda."
                        className="p-datatable-sm text-sm"
                        responsiveLayout="scroll"
                    >
                        <Column field="sku" header="SKU" sortable className="font-bold font-mono text-slate-700" style={{ minWidth: '7rem' }} />
                        <Column field="product_name" header="Producto" sortable style={{ minWidth: '15rem' }} />
                        <Column field="supplier_name" header="Proveedor" sortable style={{ minWidth: '10rem' }} />
                        <Column field="facility_name" header="Tienda" sortable style={{ minWidth: '8rem' }} />
                        <Column 
                            header="Stock Total (Fis + Tran)" 
                            body={(rowData) => (
                                <div className="text-slate-600 font-medium">
                                    {rowData.available_qty} <span className="text-[10px] text-slate-400">({rowData.stock_qty} + {rowData.transit_qty})</span>
                                </div>
                            )}
                            style={{ minWidth: '11rem' }}
                        />
                        <Column 
                            header="U. Crítico (Dem + Sec)" 
                            body={(rowData) => (
                                <div className="text-slate-600 font-medium">
                                    {rowData.critical_threshold} <span className="text-[10px] text-slate-400">({rowData.predicted_demand} + {rowData.safety_stock})</span>
                                </div>
                            )}
                            style={{ minWidth: '11rem' }}
                        />
                        <Column 
                            header="Compra" 
                            body={(rowData) => (
                                <span className={`font-black ${rowData.purchase_qty > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                    {rowData.purchase_qty > 0 ? `${rowData.purchase_qty} Unids.` : '0.0'}
                                    {rowData.boxes_count > 0 && <span className="text-[10px] font-normal text-slate-500 block">({rowData.boxes_count} Cajas)</span>}
                                </span>
                            )}
                            style={{ minWidth: '9rem' }} 
                        />
                        <Column body={detailStatusTemplate} header="Estado" align="center" style={{ minWidth: '8rem' }} />
                        <Column field="reason" header="Explicación / Detalle de Decisión" style={{ minWidth: '18rem' }} />
                    </DataTable>
                </div>
            </Dialog>
        </div>
    );
}
