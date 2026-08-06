"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Calendar } from 'primereact/calendar';
import { Dropdown } from 'primereact/dropdown';
import { Dialog } from 'primereact/dialog';
import { Tag } from 'primereact/tag';
import api from '@/lib/api';
import { format } from 'date-fns';

export default function ReceiptExecutionPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id;
  
  const [order, setOrder] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useRef<Toast>(null);

  // Warehouse selection
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);

  // Dialogs
  const [ticketDialogVisible, setTicketDialogVisible] = useState(false);
  const [ticketData, setTicketData] = useState<any>(null);

  const [discrepancyDialogVisible, setDiscrepancyDialogVisible] = useState(false);
  const [discrepancyLine, setDiscrepancyLine] = useState<any>(null);
  const [discrepancyDamagedQty, setDiscrepancyDamagedQty] = useState<number>(0);
  const [discrepancyReason, setDiscrepancyReason] = useState<string>('');

  const [unplannedDialogVisible, setUnplannedDialogVisible] = useState(false);
  const [productSearch, setProductSearch] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/purchase-orders/${orderId}/details`);
      setOrder(res.data);
      
      const initialLines = res.data.lines.map((l: any) => ({
          ...l,
          received_qty: l.expected_base_qty,
          damaged_qty: 0,
          lot_number: '',
          expiration_date: null,
          is_unplanned: false
      }));
      setLines(initialLines);

      // Cargar almacenes de la sucursal de destino
      const facilityId = res.data.dest_facility_id || res.data.dest_facility?.id;
      try {
          const whRes = await api.get('/warehouses/');
          const allWhs = whRes.data || [];
          const facilityWhs = facilityId 
              ? allWhs.filter((w: any) => Number(w.facility_id) === Number(facilityId) && !w.is_scrap)
              : allWhs.filter((w: any) => !w.is_scrap);
          
          const finalWhs = facilityWhs.length > 0 ? facilityWhs : allWhs;
          setWarehouses(finalWhs);
          if (finalWhs.length > 0) {
              setSelectedWarehouseId(finalWhs[0].id);
          }
      } catch(err) {
          console.error("Error cargando almacenes:", err);
      }
    } catch (e) {
      toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar la orden.' });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (orderId) fetchOrder();
  }, [orderId]);

  const handleQtyChange = (rowIndex: number, val: any) => {
      setLines(prev => {
          const updated = [...prev];
          const parsed = isNaN(parseFloat(val)) ? '' : val;
          updated[rowIndex] = { ...updated[rowIndex], received_qty: parsed };
          return updated;
      });
  };

  const handleTextChange = (rowIndex: number, field: string, val: string) => {
      setLines(prev => {
          const updated = [...prev];
          updated[rowIndex] = { ...updated[rowIndex], [field]: val };
          return updated;
      });
  };

  const handleDateChange = (rowIndex: number, val: Date | null) => {
      setLines(prev => {
          const updated = [...prev];
          updated[rowIndex] = { ...updated[rowIndex], expiration_date: val };
          return updated;
      });
  };

  const handleSearchProducts = async () => {
      if (!productSearch.trim()) return;
      setSearchingProducts(true);
      try {
          const res = await api.get(`/products/?query=${encodeURIComponent(productSearch)}`);
          setSearchResults(res.data || []);
      } catch (e) {
          toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Fallo al buscar productos.' });
      }
      setSearchingProducts(false);
  };

  const addUnplannedProduct = (variant: any) => {
      const newLine = {
          id: 0,
          variant_id: variant.id || variant.variant_id,
          sku: variant.sku || 'N/A',
          product_name: variant.name || variant.product_name || 'Producto Inesperado',
          expected_base_qty: 0,
          received_qty: 1,
          damaged_qty: 0,
          lot_number: '',
          expiration_date: null,
          is_unplanned: true
      };
      setLines(prev => [...prev, newLine]);
      setUnplannedDialogVisible(false);
      toast.current?.show({ severity: 'info', summary: 'Producto Inesperado Agregado', detail: `${newLine.product_name} añadido al manifiesto.` });
  };

  const openTicketDialog = async () => {
      try {
          const res = await api.get(`/wms/receipts/${orderId}/ticket-80mm`);
          setTicketData(res.data);
          setTicketDialogVisible(true);
      } catch(e) {
          toast.current?.show({ severity: 'error', summary: 'Error Ticket', detail: 'No se pudo generar el ticket de 80mm.' });
      }
  };

  const openDiscrepancyDialog = (line: any) => {
      setDiscrepancyLine(line);
      setDiscrepancyDamagedQty(0);
      setDiscrepancyReason('');
      setDiscrepancyDialogVisible(true);
  };

  const submitDiscrepancy = async () => {
      if (!discrepancyLine || discrepancyDamagedQty <= 0) {
          toast.current?.show({ severity: 'warn', summary: 'Cantidad inválida', detail: 'Ingrese una cantidad averiada mayor a 0.' });
          return;
      }
      try {
          await api.post(`/wms/receipts/${orderId}/discrepancy`, {
              variant_id: discrepancyLine.variant_id,
              warehouse_id: selectedWarehouseId,
              damaged_qty: discrepancyDamagedQty,
              reason: discrepancyReason || 'Avería reportada en muelle',
              lot_number: discrepancyLine.lot_number || null
          });
          
          setLines(prev => prev.map(l => {
              if (l.variant_id === discrepancyLine.variant_id) {
                  return { ...l, damaged_qty: discrepancyDamagedQty };
              }
              return l;
          }));

          setDiscrepancyDialogVisible(false);
          toast.current?.show({ severity: 'success', summary: 'Avería Registrada', detail: 'Mercancía desviada a la zona SCRAP.' });
      } catch (e: any) {
          toast.current?.show({ severity: 'error', summary: 'Error', detail: e.response?.data?.detail || 'No se pudo registrar la avería.' });
      }
  };

  const confirmReceipt = async () => {
      setSaving(true);
      try {
          const payload = {
              warehouse_id: selectedWarehouseId,
              lines: lines.map(l => ({
                  po_line_id: l.id > 0 ? l.id : null,
                  variant_id: l.variant_id,
                  received_qty: l.received_qty,
                  damaged_qty: l.damaged_qty || 0,
                  lot_number: l.lot_number || null,
                  expiration_date: l.expiration_date ? format(l.expiration_date, 'yyyy-MM-dd') : null
              }))
          };
          const res = await api.post(`/wms/receipts/${orderId}`, payload);
          toast.current?.show({ 
              severity: 'success', 
              summary: 'Recepción Confirmada', 
              detail: `Mercancía ingresada a inventario. Abriendo Acta Definitiva...` 
          });
          
          setOrder((prev: any) => ({ ...prev, status: 'received' }));
          await openTicketDialog();
      } catch(e: any) {
          toast.current?.show({ severity: 'error', summary: 'Error de Recepción', detail: e.response?.data?.detail || 'Fallo de conexión WMS' });
      }
      setSaving(false);
  };

  if (loading && !order) return <div className="p-8 text-slate-500 font-bold flex items-center"><i className="pi pi-spin pi-spinner text-2xl mr-3 text-blue-500"></i> Localizando Manifiesto WMS...</div>;
  if (!order) return <div className="p-8 text-red-500 font-black text-2xl">ODC no encontrada en el Muelle.</div>;

  const selectedWarehouse = warehouses.find(w => w.id === selectedWarehouseId);
  const isReadOnly = order?.status === 'received';

  return (
    <div className="p-4 sm:p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />
      
      {/* HEADER EJECUTIVO CIEGO CON SELECCIÓN DE ALMACÉN */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>
          <div>
              <div className="flex items-center gap-3 mb-1">
                 <Button icon="pi pi-arrow-left" rounded text aria-label="Volver" onClick={() => router.push('/receipts')} />
                 <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
                    <i className="pi pi-box mr-3 text-blue-500"></i>Recepcionando: {order.reference}
                 </h1>
              </div>
              <p className="text-slate-500 ml-12 text-sm mt-2 flex flex-col sm:flex-row gap-4">
                  <span><i className="pi pi-building mr-2 text-slate-400"></i> Proveedor: <span className="font-bold text-slate-700">{order.supplier.name}</span></span>
                  <span><i className="pi pi-clock mr-2 text-slate-400"></i> Vencimiento ODC: <span className="font-bold text-slate-700">{order.expiration_date ? format(new Date(order.expiration_date + 'T00:00:00'), 'dd/MM/yyyy') : 'Sin Límite'}</span></span>
              </p>
          </div>
          
          {/* Opciones de Almacén e Impresión */}
          <div className="flex flex-col sm:flex-row items-end gap-3">
              <div className="flex flex-col gap-1 bg-slate-50 p-3 rounded-xl border border-slate-200 min-w-[220px]">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Depósito de Ingreso:</span>
                  <Dropdown 
                      value={selectedWarehouseId} 
                      options={warehouses.map(w => ({ label: w.name + (w.requires_dock_staging ? ' (CD - Bahía)' : ' (Directo)'), value: w.id }))} 
                      onChange={(e) => setSelectedWarehouseId(e.value)} 
                      placeholder="Seleccionar Depósito"
                      className="w-full text-xs font-bold"
                  />
              </div>

              <Button 
                  icon="pi pi-print" 
                  rounded 
                  severity="secondary" 
                  outlined 
                  onClick={openTicketDialog} 
                  tooltip="Imprimir Ticket 80mm" 
                  tooltipOptions={{ position: 'top' }}
                  className="font-bold border-slate-300 text-slate-700 hover:bg-slate-100 shadow-sm"
              />
          </div>
      </div>

      {/* BANNER DE RECEPCIÓN CERRADA Y CONFIRMADA */}
      {isReadOnly && (
        <div className="bg-emerald-50 border-2 border-emerald-500 text-emerald-800 p-5 rounded-2xl mb-6 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <i className="pi pi-check-circle text-3xl text-emerald-600"></i>
            <div>
              <h3 className="font-black text-lg text-emerald-900">RECEPCIÓN REGISTRADA Y ASENTADA EN INVENTARIO</h3>
              <p className="text-xs text-emerald-700 font-medium">Esta orden fue recibida y cerrada. No se permiten modificaciones para preservar la validez legal del acta impresa.</p>
            </div>
          </div>
          <Button label="Imprimir Acta Definitiva 🖨️" icon="pi pi-print" severity="success" onClick={openTicketDialog} className="font-bold bg-emerald-600 text-white border-none px-6 py-3 shadow-md hover:bg-emerald-700 shrink-0" />
        </div>
      )}

      {/* MATRIZ DE RECEPCIÓN (CIEGA) */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700 tracking-tight flex items-center">
                <i className="pi pi-list mr-2 text-blue-500"></i>Manifiesto de Conteo Físico
                {selectedWarehouse?.requires_dock_staging && (
                    <Tag value="REGLA: INGRESO A BAHÍA (DOCK)" severity="warning" className="ml-3 font-extrabold text-[10px]" />
                )}
            </h3>

            {!isReadOnly && (
                <Button 
                    label="Agregar Producto Inesperado" 
                    icon="pi pi-plus-circle" 
                    severity="info" 
                    text 
                    className="font-bold text-xs" 
                    onClick={() => setUnplannedDialogVisible(true)} 
                />
            )}
        </div>
        
        <DataTable dataKey="id" value={lines} emptyMessage="No hay productos para recibir." size="small" stripedRows rowHover className="text-sm">
          <Column header="SKU" field="sku" body={r => (
              <div className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-600 font-bold border border-slate-200">{r.sku}</span>
                  {r.is_unplanned && <Tag value="INESPERADO" severity="danger" className="text-[8px] uppercase font-black" />}
              </div>
          )} />
          
          <Column header="Producto" field="product_name" body={r => <span className="font-bold text-slate-800">{r.product_name}</span>} />
          
          <Column header="Esperado (Base)" body={r => {
             const isWeight = ['KG', 'LBS', 'GR', 'L', 'LT', 'MT', 'KGS'].includes(r.uom_base?.toUpperCase());
             const dec = isWeight ? 3 : 0;
             const val = Number(r.expected_base_qty) || 0;
             return <span className="font-semibold text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-200">{val.toLocaleString('en-US', {minimumFractionDigits: dec, maximumFractionDigits: dec})} Unds</span>;
          }} align="right" />
          
          {/* CAMPOS INTERACTIVOS WMS */}
          <Column header="Físico Recibido" body={(r, options) => {
             const isWeight = ['KG', 'LBS', 'GR', 'L', 'LT', 'MT', 'KGS'].includes(r.uom_base?.toUpperCase());
             const dec = isWeight ? 3 : 0;
             return (
                 <div className="flex justify-end">
                     <InputNumber 
                        value={r.received_qty === '' ? null : r.received_qty} 
                        onValueChange={(e) => handleQtyChange(options.rowIndex, e.value === null ? '' : e.value)}
                        minFractionDigits={dec}
                        maxFractionDigits={dec}
                        disabled={isReadOnly}
                        inputClassName="w-24 text-right text-lg font-black p-2 rounded-lg border-2 border-blue-200 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 bg-blue-50/50 transition-all text-blue-700 shadow-inner disabled:bg-slate-100 disabled:border-slate-300 disabled:text-slate-700" 
                     />
                 </div>
             )
          }} align="right" />

          {/* BALANCE Y DISCREPANCIA */}
          <Column header="Estado Conteo" body={r => {
              const exp = Number(r.expected_base_qty) || 0;
              const rec = Number(r.received_qty) || 0;
              const dam = Number(r.damaged_qty) || 0;
              const diff = (rec + dam) - exp;

              if (r.is_unplanned) return <Tag value="NO PLANIFICADO" severity="info" className="font-extrabold text-[9px]" />;
              if (diff === 0) return <Tag value="COMPLETO (OK)" severity="success" className="font-extrabold text-[9px]" />;
              if (diff > 0) return <Tag value={`SOBRANTE (+${diff})`} severity="warning" className="font-extrabold text-[9px]" />;
              return <Tag value={`FALTANTE (${diff})`} severity="danger" className="font-extrabold text-[9px]" />;
          }} align="center" />

          <Column header="Trazabilidad (Lote)" body={(r, options) => (
             <InputText 
                 value={r.lot_number} 
                 onChange={(e) => handleTextChange(options.rowIndex, 'lot_number', e.target.value)} 
                 placeholder="Ej: L-204" 
                 disabled={isReadOnly}
                 className="w-28 text-xs font-bold text-center uppercase disabled:bg-slate-100 disabled:border-slate-300" 
             />
          )} align="center" />

          <Column header="Vencimiento (FEFO)" body={(r, options) => (
             <Calendar 
                 value={r.expiration_date} 
                 onChange={(e) => handleDateChange(options.rowIndex, e.value as Date)} 
                 dateFormat="dd/mm/yy" 
                 placeholder="Opcional" 
                 disabled={isReadOnly}
                 className="w-32 p-inputtext-sm text-xs" 
             />
          )} align="center" />

          <Column header="Avería" body={r => (
             <Button 
                 icon="pi pi-exclamation-triangle" 
                 rounded 
                 text 
                 disabled={isReadOnly}
                 severity={r.damaged_qty > 0 ? "danger" : "secondary"} 
                 tooltip={r.damaged_qty > 0 ? `${r.damaged_qty} unds dañadas` : "Reportar Avería"}
                 onClick={() => openDiscrepancyDialog(r)} 
             />
          )} align="center" />
        </DataTable>
      </div>

      <div className="flex justify-end gap-4 p-6 bg-white rounded-2xl shadow-sm border border-slate-200 mt-6">
         {isReadOnly ? (
             <div className="flex items-center gap-4">
                 <Tag value="✓ RECEPCIÓN COMPLETADA Y CERRADA" severity="success" className="font-extrabold px-4 py-2 text-xs tracking-wider" />
                 <Button label="Imprimir Comprobante Definitivo 🖨️" icon="pi pi-print" severity="info" onClick={openTicketDialog} className="font-bold px-6 shadow-md" />
             </div>
         ) : (
             <Button label="Confirmar e Ingresar a Inventario" icon="pi pi-check-circle" severity="success" onClick={confirmReceipt} disabled={saving} className="font-bold px-8 shadow-lg hover:shadow-xl transition-all shadow-emerald-500/30 text-lg bg-emerald-600 border-none" />
         )}
      </div>

      {/* DIÁLOGO TICKET Y ACTA DE RECEPCIÓN 80MM */}
      <Dialog header="Vista Previa Ticket / Acta de Recepción 80mm" visible={ticketDialogVisible} onHide={() => setTicketDialogVisible(false)} style={{ width: '420px' }}>
          {ticketData && (
              <div className="font-mono text-xs p-4 bg-white border border-slate-300 rounded shadow-inner text-slate-900 leading-tight">
                  <div className="text-center font-black text-sm mb-1">NEO WMS LOGÍSTICA</div>
                  <div className="text-center font-bold text-[11px] mb-2 border-b pb-2 border-dashed border-slate-400">
                      ACTA DE RECEPCIÓN Y DISCREPANCIAS
                  </div>
                  <p><strong>ODC:</strong> {ticketData.order_reference}</p>
                  <p><strong>FECHA:</strong> {ticketData.created_at}</p>
                  <p><strong>PROVEEDOR:</strong> {ticketData.supplier_name}</p>
                  <p><strong>SUCURSAL:</strong> {ticketData.facility_name}</p>
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
                          {ticketData.items.map((it: any, idx: number) => (
                              <tr key={idx} className="border-b border-slate-200">
                                  <td className="py-1 max-w-[150px]">
                                      <div className="font-bold text-[11px]">{it.sku}</div>
                                      <div className="text-[9px] text-slate-600 truncate">{it.product_name}</div>
                                  </td>
                                  <td className="py-1 text-center font-bold">{it.expected_qty}</td>
                                  <td className="py-1 text-center font-bold text-emerald-700">{it.received_qty}</td>
                                  <td className="py-1 text-right font-black text-red-600">{it.rejected_qty > 0 ? `-${it.rejected_qty}` : '0'}</td>
                              </tr>
                          ))}
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
                      </div>
                  </div>

                  <div className="mt-5 flex justify-center">
                      <Button label="Imprimir Comprobante" icon="pi pi-print" severity="info" size="small" onClick={() => window.print()} className="font-bold" />
                  </div>
              </div>
          )}
      </Dialog>

      {/* DIÁLOGO REPORTAR AVERÍA / RECHAZO */}
      <Dialog header="Reportar Avería o Rechazo en Muelle" visible={discrepancyDialogVisible} onHide={() => setDiscrepancyDialogVisible(false)} style={{ width: '420px' }}>
          {discrepancyLine && (
              <div className="flex flex-col gap-4 py-2">
                  <div className="bg-slate-50 p-3 rounded border border-slate-200">
                      <p className="font-bold text-slate-800">{discrepancyLine.product_name}</p>
                      <p className="text-xs text-slate-500">SKU: {discrepancyLine.sku}</p>
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Evento:</label>
                      <div className="flex flex-col gap-2 p-2 bg-blue-50/50 border border-blue-200 rounded text-xs">
                          <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                              <input type="radio" name="reject_type" checked={true} readOnly />
                              Devolver al Chofer (Rechazo en Puerta - NO entra a Inventario)
                          </label>
                      </div>
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Cantidad Devuelta / Rechazada:</label>
                      <InputNumber 
                          value={discrepancyDamagedQty} 
                          onValueChange={(e) => setDiscrepancyDamagedQty(e.value || 0)} 
                          className="w-full"
                          min={0}
                      />
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Motivo / Observación del Rechazo:</label>
                      <InputText 
                          value={discrepancyReason} 
                          onChange={(e) => setDiscrepancyReason(e.target.value)} 
                          placeholder="Ej: Devuelto por empaque roto / mala calidad" 
                          className="w-full text-xs"
                      />
                  </div>

                  <div className="flex justify-end gap-2 mt-2">
                      <Button label="Cancelar" text severity="secondary" onClick={() => setDiscrepancyDialogVisible(false)} />
                      <Button label="Registrar Rechazo" severity="danger" onClick={submitDiscrepancy} className="font-bold" />
                  </div>
              </div>
          )}
      </Dialog>

      {/* DIÁLOGO PRODUCTO INESPERADO */}
      <Dialog header="Agregar Producto Inesperado (No Planificado)" visible={unplannedDialogVisible} onHide={() => setUnplannedDialogVisible(false)} style={{ width: '500px' }}>
          <div className="flex flex-col gap-4 py-2">
              <div className="flex gap-2">
                  <InputText 
                      value={productSearch} 
                      onChange={(e) => setProductSearch(e.target.value)} 
                      placeholder="Buscar por Nombre, SKU o Código de Barras..." 
                      className="flex-1 text-xs"
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchProducts()}
                  />
                  <Button label="Buscar" icon="pi pi-search" onClick={handleSearchProducts} loading={searchingProducts} />
              </div>
              <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded">
                  {searchResults.map((p, idx) => (
                      <div key={idx} className="p-3 border-b border-slate-100 flex justify-between items-center hover:bg-slate-50">
                          <div>
                              <p className="font-bold text-sm text-slate-800">{p.name || p.product_name}</p>
                              <p className="text-xs text-slate-500 font-mono">SKU: {p.sku || p.code || 'N/A'}</p>
                          </div>
                          <Button label="Agregar" icon="pi pi-plus" size="small" severity="success" onClick={() => addUnplannedProduct(p)} />
                      </div>
                  ))}
                  {searchResults.length === 0 && !searchingProducts && (
                      <p className="p-4 text-xs text-slate-400 text-center">Ingrese término para buscar en catálogo.</p>
                  )}
              </div>
          </div>
      </Dialog>
    </div>
  );
}
