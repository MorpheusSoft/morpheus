"use client";

import React, { useState, useEffect, useRef } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Calendar } from 'primereact/calendar';
import { Message } from 'primereact/message';
import { Toast } from 'primereact/toast';
import axios from 'axios';
import { format } from 'date-fns';

export default function ConciliationPanel({ order, currencies, currencyId, onConciliated }: { order: any, currencies: any[], currencyId: number | null, onConciliated: () => void }) {
    const toast = useRef<Toast>(null);
    const [invoiceNumber, setInvoiceNumber] = useState("");
    const [invoiceDate, setInvoiceDate] = useState<Date | null>(new Date());
    const [lines, setLines] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (order && order.lines) {
            setLines(order.lines.map((l: any) => ({
                id: l.id,
                sku: l.sku,
                name: l.product_name,
                ordered_qty: Number(l.expected_base_qty),
                received_qty: Number(l.received_base_qty),
                billed_qty: Number(l.received_base_qty), // Default to what was received physically
                unit_cost: Number(l.unit_cost),
                billed_unit_cost: Number(l.unit_cost),
                sales_price: Number(l.sales_price || 0),
                new_sales_price: Number(l.sales_price || 0)
            })));
        }
    }, [order]);

    const handleBilledQtyChange = (rowIndex: number, val: number | null | undefined) => {
        if (val === null || val === undefined) return;
        setLines(prev => {
            const arr = [...prev];
            arr[rowIndex] = { ...arr[rowIndex], billed_qty: val };
            return arr;
        });
    };

    const handleBilledCostChange = (rowIndex: number, val: number | null | undefined) => {
        if (val === null || val === undefined) return;
        setLines(prev => {
            const arr = [...prev];
            arr[rowIndex] = { ...arr[rowIndex], billed_unit_cost: val };
            return arr;
        });
    };

    const handleNewSalesPriceChange = (rowIndex: number, val: number | null | undefined) => {
        if (val === null || val === undefined) return;
        setLines(prev => {
            const arr = [...prev];
            arr[rowIndex] = { ...arr[rowIndex], new_sales_price: val };
            return arr;
        });
    };

    const handleTargetMarginChange = (rowIndex: number, marginPct: number | null | undefined, billedCost: number) => {
        if (marginPct === null || marginPct === undefined) return;
        let safeMargin = marginPct;
        if (safeMargin >= 100) safeMargin = 99.99; // Prevents division by zero or negative prices
        
        // Formula: Price = Cost / (1 - Margin%)
        const newPrice = billedCost / (1 - (safeMargin / 100));
        handleNewSalesPriceChange(rowIndex, newPrice);
    };

    const submitConciliation = async () => {
        if (!invoiceNumber || !invoiceDate) {
            toast.current?.show({ severity: 'error', summary: 'Faltan Datos', detail: 'Debe ingresar el Nro. de Documento de Entrega y la Fecha.' });
            return;
        }

        // Validate Fraud
        const invalid = lines.find(l => l.billed_qty > l.received_qty);
        if (invalid) {
            toast.current?.show({ severity: 'error', summary: 'Fraude Logístico', detail: `La línea ${invalid.sku} intenta relacionar ${invalid.billed_qty} pero el almacén solo recibió ${invalid.received_qty}. Rechace el documento o solicite Nota de Crédito.` });
            return;
        }

        setSaving(true);
        try {
            const payload = {
                invoice_number: invoiceNumber,
                invoice_date: format(invoiceDate, 'yyyy-MM-dd'),
                lines: lines.map(l => ({
                    id: l.id,
                    billed_qty: l.billed_qty,
                    billed_unit_cost: l.billed_unit_cost,
                    new_sales_price: l.new_sales_price !== l.sales_price ? l.new_sales_price : null
                }))
            };
            await axios.post(`http://localhost:8000/api/v1/purchase-orders/${order.id}/conciliate`, payload);
            toast.current?.show({ severity: 'success', summary: 'Cierre Financiero', detail: 'Conciliación 3-Way Match exitosa. Margenes asegurados.' });
            setTimeout(() => onConciliated(), 1500);
        } catch(e: any) {
            toast.current?.show({ severity: 'error', summary: 'Rechazo Contable', detail: e.response?.data?.detail || 'Fallo general en conciliación' });
        }
        setSaving(false);
    };

    const hasMarginErosion = lines.some(l => l.billed_unit_cost > l.unit_cost && l.sales_price > 0);

    return (
        <div className="bg-white rounded-2xl shadow-2xl border-2 border-indigo-400 mt-8 overflow-hidden relative fade-in">
            <Toast ref={toast} />
            
            {hasMarginErosion && (
                <div className="absolute top-0 left-0 w-full bg-red-600 text-white text-center text-xs font-black py-1 uppercase tracking-[0.2em] shadow-md z-10 animate-pulse">
                    🚨 Peligro de Erosión de Margen Detectado 🚨
                </div>
            )}
            
            <div className={`p-6 border-b border-slate-100 ${hasMarginErosion ? 'bg-red-50/30' : 'bg-slate-50'}`}>
                <h2 className="text-2xl font-black tracking-tight text-slate-800 flex items-center mb-1 mt-2">
                    <i className="pi pi-verified text-indigo-500 mr-3 text-3xl"></i> 
                    Conciliación Operativa (3-Way Match)
                </h2>
                <p className="text-slate-500 font-medium text-sm ml-10">Cruce lo pactado (ODC) vs. lo recibido (WMS) vs. lo relacionado en el Documento (Proveedor).</p>
            </div>

            <div className="p-6">
                <div className="flex gap-4 mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">📄 Nro. Documento de Entrega</label>
                        <InputText value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Ej: NE-1029487" className="w-full font-bold text-slate-800" />
                    </div>
                    <div className="flex-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">📅 Fecha del Documento</label>
                        <Calendar value={invoiceDate} onChange={(e) => setInvoiceDate(e.value as Date)} dateFormat="dd/mm/yy" showIcon className="w-full" />
                    </div>
                </div>

                <DataTable value={lines} dataKey="id" size="small" className="text-sm shadow-sm border border-slate-200 rounded-lg overflow-hidden" rowClassName={(r) => (r.billed_unit_cost > r.unit_cost ? 'bg-red-50/50' : '')}>
                    <Column header="SKU / Producto" body={r => (
                        <div>
                           <span className="font-mono text-[9px] bg-slate-200 px-1 py-0.5 rounded text-slate-600 mb-1 block">{r.sku}</span>
                           <span className="font-bold text-slate-800 block leading-tight">{r.name}</span>
                        </div>
                    )} />
                    
                    <Column header="Tránsito Físico" body={r => (
                        <div className="flex flex-col items-end gap-1 px-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Pedido: <span className="text-slate-600">{r.ordered_qty} u</span></span>
                            <span className="text-[11px] uppercase font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">WMS: {r.received_qty} u</span>
                        </div>
                    )} align="right" />

                    <Column header="💰 Cobro Proveedor" body={(r, options) => {
                        const cur = currencies?.find(c => c.id === currencyId) || { symbol: '$', decimal_places: 2, code: 'USD' };
                        return (
                        <div className="flex flex-col items-end gap-2 bg-indigo-50/40 p-2 rounded border border-indigo-100/50">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-500">Q. Relacionada</span>
                                <InputNumber value={r.billed_qty} onValueChange={(e) => handleBilledQtyChange(options.rowIndex, e.value)} mode="decimal" minFractionDigits={0} maxFractionDigits={3} inputClassName="w-20 text-right font-bold py-1 px-2 text-sm" />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-500">$/. Documento</span>
                                <InputNumber value={r.billed_unit_cost} onValueChange={(e) => handleBilledCostChange(options.rowIndex, e.value)} mode="currency" currency={cur.code} minFractionDigits={cur.decimal_places} maxFractionDigits={cur.decimal_places} inputClassName={`w-28 text-right font-black py-1 px-2 text-sm border-2 ${r.billed_unit_cost > r.unit_cost ? 'border-red-400 text-red-700 bg-red-50' : 'border-indigo-200'}`} />
                            </div>
                        </div>
                    )}} align="right" style={{ width: '220px' }} />

                    <Column header="⚖️ Análisis de Margen" body={(r, options) => {
                        const cur = currencies?.find(c => c.id === currencyId) || { symbol: '$', decimal_places: 2, code: 'USD' };
                        const originalMargin = r.sales_price > 0 ? ((r.sales_price - r.unit_cost) / r.sales_price) * 100 : 0;
                        const newMargin = r.new_sales_price > 0 ? ((r.new_sales_price - r.billed_unit_cost) / r.new_sales_price) * 100 : 0;
                        const isErosion = r.billed_unit_cost > r.unit_cost;
                        
                        return (
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-center text-[10px] font-bold">
                                    <span className="text-slate-400">Cost: {cur.symbol}{r.unit_cost.toLocaleString('en-US',{minimumFractionDigits:cur.decimal_places})} → <span className={isErosion ? "text-red-500 font-black" : "text-emerald-500"}>{cur.symbol}{r.billed_unit_cost.toLocaleString('en-US',{minimumFractionDigits:cur.decimal_places})}</span></span>
                                    <span className={newMargin < originalMargin ? "text-red-500" : "text-emerald-500"}>
                                        {originalMargin.toFixed(1)}% → {newMargin.toFixed(1)}%
                                    </span>
                                </div>
                                
                                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded mt-1">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase px-1">PVP:</span>
                                    
                                    <InputNumber 
                                        value={newMargin} 
                                        onValueChange={(e) => handleTargetMarginChange(options.rowIndex, e.value, r.billed_unit_cost)} 
                                        suffix="%" 
                                        minFractionDigits={1} 
                                        maxFractionDigits={1} 
                                        inputClassName="w-16 text-center font-bold py-1 px-1 text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 rounded" 
                                        placeholder="Margen" 
                                        title="Escribe el Margen Deseado para auto-calcular el PVP"
                                    />
                                    
                                    <i className="pi pi-arrows-h text-[8px] text-slate-400 mx-1"></i>
                                    
                                    <InputNumber 
                                        value={r.new_sales_price} 
                                        onValueChange={(e) => handleNewSalesPriceChange(options.rowIndex, e.value)} 
                                        mode="currency" 
                                        currency={cur.code} 
                                        minFractionDigits={cur.decimal_places} 
                                        maxFractionDigits={cur.decimal_places} 
                                        inputClassName={`w-24 text-right font-black py-1 px-1 text-xs ${isErosion ? 'ring-2 ring-red-400 rounded bg-white' : 'bg-white rounded border border-slate-200'}`} 
                                        placeholder="Nuevo P.V.P" 
                                    />
                                </div>
                            </div>
                        )
                    }} />
                </DataTable>

                <div className="flex justify-end mt-6 pb-2">
                    <Button label="Aprobar Conciliación y Absorber Gasto" icon="pi pi-verified" severity={hasMarginErosion ? "danger" : "success"} size="large" className={`font-black tracking-wide px-8 shadow-xl ${hasMarginErosion ? 'shadow-red-500/30' : 'shadow-emerald-500/30'}`} onClick={submitConciliation} loading={saving} />
                </div>
            </div>
        </div>
    );
}
