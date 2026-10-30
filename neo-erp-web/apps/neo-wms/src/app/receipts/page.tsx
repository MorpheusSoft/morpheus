"use client";

import React, { useState, useEffect, useRef } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { Tag } from 'primereact/tag';
import { TabView, TabPanel } from 'primereact/tabview';
import { Dropdown } from 'primereact/dropdown';
import { Dialog } from 'primereact/dialog';
import api from '@/lib/api';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

// Global in-memory cache for instant zero-latency page transitions
let globalWmsOrdersCache: any[] | null = null;
let globalWmsCacheTimestamp: number = 0;

export default function WmsReceiptsPage() {
  const [allOrdersList, setAllOrdersList] = useState<any[]>(() => globalWmsOrdersCache || []);
  const [loading, setLoading] = useState<boolean>(!globalWmsOrdersCache);
  
  // Persistir filtros por Sucursal y Proveedor en sessionStorage para el fiscal del muelle
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('wms_selectedSupplier') || null;
    }
    return null;
  });

  const [selectedFacility, setSelectedFacility] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('wms_selectedFacility') || null;
    }
    return null;
  });

  const [activeIndex, setActiveIndex] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const savedTab = sessionStorage.getItem('wms_activeIndex');
      return savedTab ? parseInt(savedTab, 10) : 0;
    }
    return 0;
  });

  const toast = useRef<Toast>(null);
  const router = useRouter();

  const handleSupplierChange = (val: string | null) => {
    setSelectedSupplier(val);
    if (typeof window !== 'undefined') {
      if (val) sessionStorage.setItem('wms_selectedSupplier', val);
      else sessionStorage.removeItem('wms_selectedSupplier');
    }
  };

  const handleFacilityChange = (val: string | null) => {
    setSelectedFacility(val);
    if (typeof window !== 'undefined') {
      if (val) sessionStorage.setItem('wms_selectedFacility', val);
      else sessionStorage.removeItem('wms_selectedFacility');
    }
  };

  const handleTabChange = (index: number) => {
    setActiveIndex(index);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('wms_activeIndex', index.toString());
    }
  };

  const clearAllFilters = () => {
    setSelectedSupplier(null);
    setSelectedFacility(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('wms_selectedSupplier');
      sessionStorage.removeItem('wms_selectedFacility');
    }
  };

  const supplierOptions = React.useMemo(() => {
    const names = Array.from(new Set(allOrdersList.map((o: any) => o.supplier?.name).filter(Boolean)));
    return names.sort().map(name => ({ label: name, value: name }));
  }, [allOrdersList]);

  const facilityOptions = React.useMemo(() => {
    const names = Array.from(new Set(allOrdersList.map((o: any) => o.dest_facility?.name).filter(Boolean)));
    return names.sort().map(name => ({ label: name, value: name }));
  }, [allOrdersList]);

  // 1. Filtrar globalmente por Sucursal Destino y Proveedor Origen
  const baseFilteredOrders = React.useMemo(() => {
    return allOrdersList.filter((o: any) => {
      const matchSupplier = !selectedSupplier || o.supplier?.name === selectedSupplier;
      const matchFacility = !selectedFacility || o.dest_facility?.name === selectedFacility;
      return matchSupplier && matchFacility;
    });
  }, [allOrdersList, selectedSupplier, selectedFacility]);

  // 2. Separar por Estado Logístico tras aplicar filtros de sucursal
  const pendingOrders = React.useMemo(() => {
    return baseFilteredOrders.filter((o: any) => ['approved', 'sent', 'viewed', 'partial'].includes(o.status));
  }, [baseFilteredOrders]);

  const completedOrders = React.useMemo(() => {
    return baseFilteredOrders.filter((o: any) => ['received', 'conciliated'].includes(o.status));
  }, [baseFilteredOrders]);

  const pendingReversalOrders = React.useMemo(() => {
    return completedOrders.filter((o: any) => o.reversal_status === 'PENDING_APPROVAL');
  }, [completedOrders]);

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);
  const [selectedAuditLog, setSelectedAuditLog] = useState<any>(null);

  const fetchAuditLogs = async () => {
    setLoadingAudit(true);
    try {
      const res = await api.get('/wms/audit-logs?module=WMS&limit=100');
      setAuditLogs(res.data || []);
    } catch (e) {
      console.error('Error cargando bitácora de auditoría:', e);
    } finally {
      setLoadingAudit(false);
    }
  };

  const fetchOrders = async (silent: boolean = false) => {
    if (!silent && !globalWmsOrdersCache) setLoading(true);
    try {
      const res = await api.get('/purchase-orders/');
      const data = res.data || [];
      globalWmsOrdersCache = data;
      globalWmsCacheTimestamp = Date.now();
      setAllOrdersList(data);
    } catch (e) {
      if (!silent) {
        toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Fallo al conectar con la base de logística.' });
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    const isFresh = (Date.now() - globalWmsCacheTimestamp) < 30000;
    if (globalWmsOrdersCache && isFresh) {
      setAllOrdersList(globalWmsOrdersCache);
      setLoading(false);
      fetchOrders(true); // Revalidación en segundo plano
    } else {
      fetchOrders(false);
    }
  }, []);

  const getStatusSeverity = (status: string) => {
      switch(status) {
          case 'approved': return 'info';
          case 'sent': return 'warning';
          case 'viewed': return 'success';
          case 'partial': return 'danger';
          case 'received': return 'success';
          default: return 'info';
      }
  };

  const getStatusName = (status: string) => {
      switch(status) {
          case 'approved': return 'Lista p/ Recibir';
          case 'sent': return 'En Tránsito (Email Emitido)';
          case 'viewed': return 'En Tránsito (Proveedor Confirmó)';
          case 'partial': return 'Recepción Parcial (Backorder)';
          case 'received': return 'Recepción Completada';
          default: return status.toUpperCase();
      }
  };

  const [currentUser, setCurrentUser] = useState<any>(null);

  const fetchCurrentUser = async () => {
    try {
      const res = await api.get('/users/me');
      setCurrentUser(res.data);
    } catch(e) {
      console.error(e);
    }
  };

  const canDirectReceive = React.useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.is_superuser) return true;
    if (currentUser.roles) {
      for (const r of currentUser.roles) {
        if (r?.is_active === false) continue;
        const perms = r.permissions || {};
        const wmsPerms = perms?.neo_wms || perms?.neo_logistics || perms?.wms || {};
        const dr = wmsPerms?.direct_receipts ?? perms?.neo_logistics?.direct_receipts;
        if (dr !== undefined) {
          if (dr.write || dr.approve || dr.read) return true;
        } else {
          const rec = wmsPerms?.receipts || perms?.neo_logistics?.receipts;
          if (rec && (rec.write || rec.approve)) return true;
        }
      }
    }
    return false;
  }, [currentUser]);

  useEffect(() => {
    fetchCurrentUser();
    fetchAuditLogs();
  }, []);

  return (
    <div className="p-8 w-full max-w-[1400px] mx-auto fade-in">
      <Toast ref={toast} position="bottom-right" />
      
      {/* CABECERA PRINCIPAL */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex justify-between items-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-slate-800"></div>
        <div className="pl-4">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
             <i className="pi pi-truck text-slate-500 mr-3"></i>Muelle de Recepción (Inbound WMS)
          </h1>
          <p className="text-slate-500 text-sm mt-1">Inspección de camiones en muelle y descarga por Sucursal / Tienda de Destino.</p>
        </div>
        <div className="flex items-center gap-3">
          {canDirectReceive && (
             <Button 
                label="Recepción Directa (Sin ODC)" 
                icon="pi pi-plus-circle" 
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold border-none shadow-md shadow-emerald-500/20 px-4" 
                onClick={() => router.push('/receipts/direct')} 
             />
          )}
          <Button icon="pi pi-refresh" rounded outlined aria-label="Actualizar" onClick={() => fetchOrders(false)} className="text-slate-600 border-slate-300 hover:bg-slate-50 font-bold" />
        </div>
      </div>
      
      {/* FILTROS DE MUELLE (SUCURSAL DESTINO Y PROVEEDOR) */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-wrap gap-4 items-center">
         <div className="flex flex-col gap-1 w-full md:w-80 relative">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center">
                <i className="pi pi-building mr-1 text-slate-400"></i>Sucursal / Tienda de Destino:
            </span>
            <Dropdown 
               value={selectedFacility} 
               onChange={e => handleFacilityChange(e.value)} 
               options={facilityOptions} 
               placeholder="Todas las Sucursales" 
               showClear
               filter
               appendTo="self"
               panelClassName="!w-full !min-w-[280px] shadow-2xl rounded-xl border border-slate-200"
               className="w-full text-sm !rounded-xl border-slate-200 font-bold" 
            />
         </div>

         <div className="flex flex-col gap-1 w-full md:w-80 relative">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center">
                <i className="pi pi-users mr-1 text-slate-400"></i>Proveedor Origen:
            </span>
            <Dropdown 
               value={selectedSupplier} 
               onChange={e => handleSupplierChange(e.value)} 
               options={supplierOptions} 
               placeholder="Todos los Proveedores" 
               showClear
               filter
               appendTo="self"
               panelClassName="!w-full !min-w-[280px] shadow-2xl rounded-xl border border-slate-200"
               className="w-full text-sm !rounded-xl border-slate-200 font-bold" 
            />
         </div>

         {(selectedSupplier || selectedFacility) && (
            <Button 
               label="Limpiar Filtros" 
               icon="pi pi-filter-slash" 
               onClick={clearAllFilters} 
               className="p-button-text p-button-sm text-slate-500 font-bold mt-4" 
            />
         )}
      </div>

      {/* BANNER DE MUELLE FILTRADO */}
      {(selectedSupplier || selectedFacility) && (
          <div className="mb-4 p-3 bg-slate-800 text-white rounded-xl flex items-center justify-between text-xs font-bold shadow-md">
              <div className="flex items-center gap-2">
                  <i className="pi pi-filter-fill text-blue-400"></i>
                  <span>
                      Muelle Filtrado: {selectedFacility ? `Sucursal "${selectedFacility}" ` : ''} 
                      {selectedSupplier ? `| Proveedor "${selectedSupplier}" ` : ''} 
                      — {pendingOrders.length} camiones por recibir | {completedOrders.length} recepciones históricas
                  </span>
              </div>
              <Button label="Quitar Filtro" icon="pi pi-times" text size="small" className="p-0 text-slate-300 hover:text-white font-black" onClick={clearAllFilters} />
          </div>
      )}

      {/* ALERTA DE SOLICITUDES DE REVERSO PENDIENTES DE APROBACIÓN */}
      {pendingReversalOrders.length > 0 && (
        <div className="mb-5 p-4 bg-amber-50 border-2 border-amber-400 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <i className="pi pi-undo text-lg"></i>
            </div>
            <div>
              <h4 className="font-black text-amber-950 text-sm uppercase">
                {pendingReversalOrders.length} Solicitud(es) de Reverso de Recepción Pendiente(s) de Aprobación
              </h4>
              <p className="text-xs text-amber-800">
                Órdenes: {pendingReversalOrders.map((o: any) => o.reference).join(', ')} — Requieren revisión de Supervisión / Administración.
              </p>
            </div>
          </div>
          <Button
            label="Ver en Histórico Completadas"
            icon="pi pi-arrow-right"
            severity="warning"
            size="small"
            onClick={() => handleTabChange(1)}
            className="font-bold text-xs shrink-0"
          />
        </div>
      )}

      {/* BANDEJA CON PESTAÑAS */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden p-2">
        <TabView activeIndex={activeIndex} onTabChange={(e) => {
          handleTabChange(e.index);
          if (e.index === 2) fetchAuditLogs();
        }}>
          
          {/* PESTAÑA: POR RECIBIR */}
          <TabPanel header={`Por Recibir en Muelle (${pendingOrders.length})`} leftIcon="pi pi-inbox mr-2">
            <DataTable value={pendingOrders} loading={loading} emptyMessage="Muelle despejado. No hay camiones pendientes para la sucursal seleccionada." size="small" stripedRows rowHover className="text-sm border-t border-slate-100 mt-2">
              <Column header="NÚMERO DE ODC" field="reference" body={r => (
                  <div className="flex items-center gap-1.5">
                    <span className="font-black tracking-widest text-slate-700 bg-slate-100 px-3 py-1.5 rounded text-xs border border-slate-200">{r.reference}</span>
                    {Number(r.reversal_count || 0) > 0 && (
                      <Tag value={`REV #${r.reversal_count}`} severity="warning" className="font-black text-[9px]" />
                    )}
                  </div>
              )} style={{ width: '14rem' }} />
              
              <Column header="FECHA DE EMISIÓN" field="created_at" body={r => (
                 <span className="text-slate-500 font-bold bg-slate-50 px-2 py-1 rounded text-xs">
                    <i className="pi pi-calendar text-[10px] mr-1 text-slate-400"></i> 
                    {format(new Date(r.created_at), 'dd/MM/yyyy')} <span className="text-slate-400 font-normal ml-1">{format(new Date(r.created_at), 'HH:mm')}</span>
                 </span>
              )} />

              <Column header="PROVEEDOR ORIGEN" field="supplier.name" body={r => (
                  <span className="font-bold text-slate-800 flex items-center">
                      <i className="pi pi-building text-slate-400 mr-2"></i>{r.supplier?.name || 'S/N'}
                  </span>
              )} />

              <Column header="SUCURSAL DESTINO" field="dest_facility.name" body={r => (
                  <span className="font-extrabold text-slate-700 bg-slate-100 px-2.5 py-1 rounded border border-slate-200 text-xs inline-flex items-center">
                      <i className="pi pi-map-marker text-blue-500 mr-1.5"></i>
                      {r.dest_facility?.name || 'General'}
                  </span>
              )} />
              
              <Column header="ESTADO LOGÍSTICO" body={r => (
                 <div className="flex flex-col items-center gap-1">
                   <Tag severity={getStatusSeverity(r.status)} value={getStatusName(r.status)} className="font-extrabold tracking-wide uppercase text-[9px] px-2 py-1 shadow-sm border border-black/5" />
                   {Number(r.reversal_count || 0) > 0 && (
                     <span className="text-[10px] font-bold text-indigo-600">Reabierta tras Reverso</span>
                   )}
                 </div>
              )} align="center" />
              
              <Column header="ACCIÓN" body={r => (
                 <div className="flex justify-end gap-2 pr-4">
                     <Button onClick={() => router.push('/receipts/' + r.id)} label="Recibir" icon="pi pi-box" rounded severity="info" size="small" className="shadow-md hover:shadow-lg transition-all font-bold px-4" />
                 </div>
              )} align="right" style={{ width: '10rem' }} />
            </DataTable>
          </TabPanel>

          {/* PESTAÑA: HISTÓRICO COMPLETADAS */}
          <TabPanel header={`Histórico Completadas (${completedOrders.length})`} leftIcon="pi pi-history mr-2">
            <DataTable value={completedOrders} loading={loading} emptyMessage="No hay historial de recepciones completadas para la sucursal seleccionada." size="small" stripedRows rowHover className="text-sm border-t border-slate-100 mt-2">
              <Column header="NÚMERO DE ODC" field="reference" body={r => (
                  <div className="flex items-center gap-1.5">
                    <span className="font-black tracking-widest text-slate-700 bg-slate-100 px-3 py-1.5 rounded text-xs border border-slate-200">{r.reference}</span>
                    {Number(r.reversal_count || 0) > 0 && (
                      <Tag value={`REV #${r.reversal_count}`} severity="info" className="font-black text-[9px]" />
                    )}
                  </div>
              )} style={{ width: '14rem' }} />
              
              <Column header="FECHA CIERRE" field="updated_at" body={r => (
                 <span className="text-slate-500 font-bold bg-slate-50 px-2 py-1 rounded text-xs">
                    <i className="pi pi-check-circle text-[10px] mr-1 text-emerald-500"></i> 
                    {r.updated_at ? format(new Date(r.updated_at), 'dd/MM/yyyy HH:mm') : format(new Date(r.created_at), 'dd/MM/yyyy')}
                 </span>
              )} />

              <Column header="PROVEEDOR ORIGEN" field="supplier.name" body={r => (
                  <span className="font-bold text-slate-800 flex items-center">
                      <i className="pi pi-building text-slate-400 mr-2"></i>{r.supplier?.name || 'S/N'}
                  </span>
              )} />

              <Column header="SUCURSAL DESTINO" field="dest_facility.name" body={r => (
                  <span className="font-extrabold text-slate-700 bg-slate-100 px-2.5 py-1 rounded border border-slate-200 text-xs inline-flex items-center">
                      <i className="pi pi-map-marker text-emerald-600 mr-1.5"></i>
                      {r.dest_facility?.name || 'General'}
                  </span>
              )} />
              
              <Column header="ESTADO / CONCILIACIÓN" body={r => {
                 const isConciliated = r.status === 'conciliated' || Boolean(r.conciliated_at) || ['MATCH_EXACT', 'MATCH_WITH_DEBIT_NOTE'].includes(r.reconciliation_status);
                 if (r.reversal_status === 'PENDING_APPROVAL') {
                   return <Tag severity="warning" value="⚠️ REVERSO PENDIENTE APROBACIÓN" className="font-extrabold tracking-wide uppercase text-[9px] px-2 py-1 shadow-sm" />;
                 }
                 if (isConciliated) {
                   return <Tag severity="info" value="🔒 CONCILIADA (3-WAY MATCH)" className="font-extrabold tracking-wide uppercase text-[9px] px-2 py-1 shadow-sm" />;
                 }
                 return <Tag severity="success" value="COMPLETADO (NO CONCILIADA)" className="font-extrabold tracking-wide uppercase text-[9px] px-2 py-1 shadow-sm border border-emerald-500/20" />;
              }} align="center" />
              
              <Column header="CONSULTA / REVERSO" body={r => (
                 <div className="flex justify-end gap-2 pr-4">
                     <Button
                       onClick={() => router.push('/receipts/' + r.id)}
                       label={r.reversal_status === 'PENDING_APPROVAL' ? 'Aprobar / Ver Reverso' : 'Ver Acta / Reversar'}
                       icon={r.reversal_status === 'PENDING_APPROVAL' ? 'pi pi-exclamation-circle' : 'pi pi-file'}
                       rounded
                       severity={r.reversal_status === 'PENDING_APPROVAL' ? 'warning' : 'secondary'}
                       outlined={r.reversal_status !== 'PENDING_APPROVAL'}
                       size="small"
                       className="font-bold px-3"
                     />
                 </div>
              )} align="right" style={{ width: '14rem' }} />
            </DataTable>
          </TabPanel>

          {/* PESTAÑA: BITÁCORA DE AUDITORÍA Y REVERSOS */}
          <TabPanel header={`Bitácora de Auditoría y Reversos (${auditLogs.length})`} leftIcon="pi pi-shield mr-2">
            <DataTable
              value={auditLogs}
              loading={loadingAudit}
              emptyMessage="No hay registros de auditoría en este momento."
              size="small"
              stripedRows
              rowHover
              paginator
              rows={20}
              className="text-sm border-t border-slate-100 mt-2"
            >
              <Column
                header="FECHA / HORA"
                body={(l: any) => (
                  <span className="font-mono text-xs text-slate-600 font-bold">
                    {l.created_at ? format(new Date(l.created_at), 'dd/MM/yyyy HH:mm:ss') : 'N/A'}
                  </span>
                )}
                style={{ width: '11rem' }}
              />
              <Column
                header="EVENTO"
                body={(l: any) => {
                  if (l.action === 'APPROVE_RECEIPT_REVERSAL') return <Tag value="REVERSO APROBADO" severity="info" className="font-black text-[9px]" />;
                  if (l.action === 'REQUEST_RECEIPT_REVERSAL') return <Tag value="SOLICITUD REVERSO" severity="warning" className="font-black text-[9px]" />;
                  if (l.action === 'REJECT_RECEIPT_REVERSAL') return <Tag value="REVERSO RECHAZADO" severity="danger" className="font-black text-[9px]" />;
                  if (l.action === 'RECEIVE_PURCHASE_ORDER') return <Tag value="RECEPCIÓN ODC" severity="success" className="font-black text-[9px]" />;
                  return <Tag value={l.action} severity="secondary" className="font-black text-[9px]" />;
                }}
                style={{ width: '11rem' }}
              />
              <Column
                header="ORDEN / ENTIDAD"
                body={(l: any) => (
                  <span className="font-black text-slate-800 text-xs">
                    {l.details?.order_reference || `${l.entity_name} #${l.entity_id}`}
                  </span>
                )}
                style={{ width: '10rem' }}
              />
              <Column
                header="USUARIO EJECUTOR"
                body={(l: any) => (
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-800 text-xs">{l.user_name || 'Sistema'}</span>
                    <span className="text-[10px] text-slate-400">{l.user_email || ''}</span>
                  </div>
                )}
              />
              <Column
                header="MOTIVO / TRAZABILIDAD"
                body={(l: any) => {
                  const d = l.details || {};
                  if (d.reversal_reason) {
                    return (
                      <div className="text-xs text-slate-700">
                        <span className="font-bold">{d.reversal_reason}:</span> {d.reversal_notes || ''}
                        {d.requested_by_name && l.action === 'APPROVE_RECEIPT_REVERSAL' && (
                          <div className="text-[10px] text-slate-500">Solicitado por: {d.requested_by_name}</div>
                        )}
                      </div>
                    );
                  }
                  if (d.rejection_reason) {
                    return <span className="text-xs text-rose-700 font-semibold">Rechazo: {d.rejection_reason}</span>;
                  }
                  if (l.action === 'RECEIVE_PURCHASE_ORDER') {
                    return (
                      <span className="text-xs text-slate-600">
                        Guía/Fact: {d.invoice_number || 'S/N'} | Recibido: {d.total_received ?? 0} unds
                      </span>
                    );
                  }
                  return <span className="text-xs text-slate-500">{JSON.stringify(d).slice(0, 80)}</span>;
                }}
              />
              <Column
                header="DETALLE"
                body={(l: any) => (
                  <div className="flex justify-end gap-2">
                    {Array.isArray(l.details?.lines_before_reversal) && (
                      <Button
                        label="Ver Foto"
                        icon="pi pi-eye"
                        size="small"
                        outlined
                        severity="secondary"
                        onClick={() => setSelectedAuditLog(l)}
                        className="text-xs font-bold"
                      />
                    )}
                    {l.details?.order_id && (
                      <Button
                        icon="pi pi-external-link"
                        size="small"
                        text
                        tooltip="Ir a la ODC"
                        onClick={() => router.push('/receipts/' + l.details.order_id)}
                      />
                    )}
                  </div>
                )}
                align="right"
                style={{ width: '9rem' }}
              />
            </DataTable>
          </TabPanel>
        </TabView>
      </div>

      {/* MODAL DETALLE FORENSE DE AUDITORÍA */}
      <Dialog
        header={`Auditoría Forense — ${selectedAuditLog?.details?.order_reference || ''}`}
        visible={Boolean(selectedAuditLog)}
        onHide={() => setSelectedAuditLog(null)}
        style={{ width: '680px' }}
      >
        {selectedAuditLog && (
          <div className="flex flex-col gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <p><strong>Acción:</strong> {selectedAuditLog.action}</p>
              <p><strong>Fecha/Hora:</strong> {selectedAuditLog.created_at ? format(new Date(selectedAuditLog.created_at), 'dd/MM/yyyy HH:mm:ss') : ''}</p>
              <p><strong>Solicitado por:</strong> {selectedAuditLog.details?.requested_by_name || selectedAuditLog.user_name}</p>
              {selectedAuditLog.details?.approved_by_name && (
                <p><strong>Aprobado por:</strong> {selectedAuditLog.details.approved_by_name}</p>
              )}
              <p><strong>Causal:</strong> {selectedAuditLog.details?.reversal_reason} — {selectedAuditLog.details?.reversal_notes}</p>
            </div>
            <div className="max-h-[340px] overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-slate-600 uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">SKU</th>
                    <th className="p-2.5">Producto</th>
                    <th className="p-2.5 text-right">Esperado</th>
                    <th className="p-2.5 text-right">Recibido (Anulado)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(selectedAuditLog.details?.lines_before_reversal || []).map((ln: any, i: number) => (
                    <tr key={i}>
                      <td className="p-2.5 font-mono font-bold text-slate-700">{ln.sku}</td>
                      <td className="p-2.5 font-semibold text-slate-800">{ln.product_name}</td>
                      <td className="p-2.5 text-right text-slate-500">{ln.expected_base_qty}</td>
                      <td className="p-2.5 text-right font-black text-rose-600">{ln.received_base_qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
