'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Dropdown } from 'primereact/dropdown';
import { Checkbox } from 'primereact/checkbox';
import { Button } from 'primereact/button';
import { TabView, TabPanel } from 'primereact/tabview';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import SupplierCatalogTab from './SupplierCatalogTab';
import SupplierReturnPolicyTab from '@/components/suppliers/SupplierReturnPolicyTab';
import { useRouter, useParams } from 'next/navigation';
import api from '@/lib/api';

interface Currency {
  id: number;
  code: string;
  name: string;
}

export default function SupplierEdit() {
  const router = useRouter();
  const params = useParams();
  const supplierId = params.id;
  const catalogRef = useRef<any>(null);
  
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [claraAudit, setClaraAudit] = useState<any>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [facilities, setFacilities] = useState<any[]>([]);
  const [buyers, setBuyers] = useState<any[]>([]);

  const { control, handleSubmit, reset, setValue, watch } = useForm<any>({
    defaultValues: {
      name: '',
      commercial_name: '',
      tax_id: '',
      international_tax_id: '',
      fiscal_address: '',
      is_active: true,
      buyer_id: null,

      currency_id: null,
      default_facility_id: null,
      credit_days: 0,
      credit_limit: 0,
      early_payment_days: 0,
      early_payment_discount_pct: 0,
      lead_time_days: 0,
      restock_coverage_days: 0,
      sales_analysis_days: 0,
      minimum_order_qty: 0,
      auto_tune_logistics: false,


      commercial_contact_name: '',
      commercial_contact_phone: '',
      commercial_email: '',
      financial_contact_name: '',
      financial_contact_phone: '',
      financial_email: '',

      return_policy: {
        allows_returns: 'YES',
        max_claim_days: 7,
        compensation_method: 'REPLACEMENT',
        freight_responsibility: 'SUPPLIER',
        accepted_reasons: ['Avería de Fábrica', 'Daño en Transporte'],
        claims_contact_name: '',
        claims_contact_phone: '',
        claims_contact_email: '',
        procedure_notes: '',
      },

      banks: []
    }
  });

  const { fields: bankFields, append: appendBank, remove: removeBank } = useFieldArray({
    control,
    name: "banks" as any
  });

  useEffect(() => {
    Promise.all([
      api.get('/currencies/').catch(() => ({ data: [] })),
      api.get('/facilities/').catch(() => ({ data: [] })),
      api.get('/buyers/').catch(() => ({ data: [] })),
      api.get('/users/').catch(() => ({ data: [] })),
      api.get(`/suppliers/${supplierId}`),
      api.get(`/suppliers/${supplierId}/logistics-audit`).catch(() => ({ data: null }))
    ]).then(([currRes, facRes, buyersRes, usersRes, suppRes, auditRes]) => {
      setCurrencies(currRes.data || []);
      setFacilities(facRes.data || []);
      if (auditRes.data) {
        setClaraAudit(auditRes.data);
      }
      
      const buyersList = Array.isArray(buyersRes.data) ? buyersRes.data : [];
      const usersList = Array.isArray(usersRes.data) ? usersRes.data : [];
      const mappedBuyers = buyersList.map((b: any) => {
        const u = usersList.find((x: any) => x.id === b.user_id);
        return {
          id: b.id,
          name: u ? u.full_name || u.email : `Comprador ID ${b.id}`
        };
      });
      setBuyers(mappedBuyers);

      const parsedData = {
        ...suppRes.data,
        auto_tune_logistics: !!suppRes.data.auto_tune_logistics,
        buyer_id: suppRes.data.buyer_id || null,
        commercial_name: suppRes.data.commercial_name || '',
        international_tax_id: suppRes.data.international_tax_id || '',
        fiscal_address: suppRes.data.fiscal_address || '',
        commercial_contact_name: suppRes.data.commercial_contact_name || '',
        commercial_contact_phone: suppRes.data.commercial_contact_phone || '',
        commercial_email: suppRes.data.commercial_email || '',
        financial_contact_name: suppRes.data.financial_contact_name || '',
        financial_contact_phone: suppRes.data.financial_contact_phone || '',
        financial_email: suppRes.data.financial_email || '',
        return_policy: suppRes.data.return_policy && Object.keys(suppRes.data.return_policy).length > 0 ? suppRes.data.return_policy : {
          allows_returns: 'YES',
          max_claim_days: 7,
          compensation_method: 'REPLACEMENT',
          freight_responsibility: 'SUPPLIER',
          accepted_reasons: ['Avería de Fábrica', 'Daño en Transporte'],
          claims_contact_name: '',
          claims_contact_phone: '',
          claims_contact_email: '',
          procedure_notes: '',
        },
      };
      reset(parsedData);
      setFetching(false);
    }).catch(err => {
      console.error(err);
      alert('Error cargando el proveedor');
      setFetching(false);
    });
  }, [supplierId, reset]);

  const handleApplyClaraCalibration = async () => {
    setCalibrating(true);
    try {
      const res = await api.post(`/suppliers/${supplierId}/apply-calibration`, {
        apply_lead_time: true,
        apply_restock: true,
        apply_default_facility: !!claraAudit?.suggested_facility_id
      });
      if (res.data?.ok) {
        if (res.data.updated_lead_time_days !== undefined) {
          setValue('lead_time_days', res.data.updated_lead_time_days);
        }
        if (res.data.updated_restock_coverage_days !== undefined) {
          setValue('restock_coverage_days', res.data.updated_restock_coverage_days);
        }
        if (res.data.updated_default_facility_id !== undefined && res.data.updated_default_facility_id !== null) {
          setValue('default_facility_id', res.data.updated_default_facility_id);
        }
        const auditRes = await api.get(`/suppliers/${supplierId}/logistics-audit`);
        setClaraAudit(auditRes.data);
        alert('✨ Calibración de Clara aplicada con éxito a la ficha.');
      }
    } catch (e: any) {
      alert('Error al aplicar calibración: ' + (e.response?.data?.detail || e.message));
    } finally {
      setCalibrating(false);
    }
  };


  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      await api.put(`/suppliers/${supplierId}`, data);
      
      const catData = catalogRef.current?.getCatalog();
      if (catData) {
          await api.put(`/suppliers/${supplierId}/catalog`, catData);
      }
      
      alert('Proveedor actualizado exitosamente.');
      router.push('/suppliers');
    } catch (e: any) {
      alert('Error al actualizar: ' + (e.response?.data?.detail || e.message));
    }
    setLoading(false);
  };

  const addBankRow = () => {
    appendBank({
      bank_name: '',
      account_number: '',
      swift_code: '',
      aba_code: '',
      currency_id: currencies.length > 0 ? currencies[0].id : 0
    });
  };

  if (fetching) return <div className="p-6 text-slate-500">Cargando proveedor...</div>;

  return (
    <div className="p-2 sm:p-6 bg-slate-50 min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Maestro de Proveedores</h1>
          <p className="text-slate-500 text-sm mt-1">Editando código fiscal: {supplierId}</p>
        </div>
        <div className="flex gap-3">
          <Button 
            type="button"
            label="Cancelar" 
            icon="pi pi-times" 
            className="p-button-text text-slate-500"
            onClick={() => router.push('/suppliers')}
          />
          <Button 
            label="Guardar" 
            icon="pi pi-check" 
            loading={loading}
            onClick={handleSubmit(onSubmit)} 
            className="bg-emerald-600 hover:bg-emerald-700 border-none text-white font-medium px-6 py-2 rounded-lg transition-all shadow-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <TabView className="modern-tabs p-4 sm:p-6">
          
          {/* TAB 1: Información Legal */}
          <TabPanel header="1. Info General" leftIcon="pi pi-building mr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              <div className="flex items-center gap-3 col-span-1 md:col-span-2 bg-slate-50 p-4 rounded-lg border border-slate-100">
                <Controller name="is_active" control={control} render={({ field }) => (
                  <Checkbox inputId="is_active" onChange={e => field.onChange(e.checked)} checked={field.value} />
                )} />
                <label htmlFor="is_active" className="font-medium text-slate-700 cursor-pointer">Proveedor Activo para Compras</label>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Razón Social *</label>
                <Controller name="name" control={control} rules={{required: true}} render={({ field }) => (
                  <InputText {...field} className="p-2.5 border rounded-lg w-full focus:ring-2 focus:ring-emerald-500" placeholder="Razón social fiscal" />
                )} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Nombre Comercial</label>
                <Controller name="commercial_name" control={control} render={({ field }) => (
                  <InputText {...field} className="p-2.5 border rounded-lg w-full" placeholder="Nombre de marca / fantasía" />
                )} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">RIF * (Nacional)</label>
                <Controller name="tax_id" control={control} rules={{required: true}} render={({ field }) => (
                  <InputText {...field} className="p-2.5 border rounded-lg w-full" placeholder="J-12345678-9" />
                )} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">RUC / NIT (Internacional)</label>
                <Controller name="international_tax_id" control={control} render={({ field }) => (
                  <InputText {...field} className="p-2.5 border rounded-lg w-full" placeholder="Id fiscal exterior (opcional)" />
                )} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Comprador Responsable</label>
                <Controller name="buyer_id" control={control} render={({ field }) => (
                  <Dropdown 
                    value={field.value} 
                    onChange={(e) => field.onChange(e.value)} 
                    options={buyers} 
                    optionLabel="name" 
                    optionValue="id" 
                    placeholder="Sin comprador asignado (Acceso Libre)" 
                    showClear 
                    className="w-full border rounded-lg p-inputtext-sm" 
                  />
                )} />
              </div>

              <div className="hidden md:block"></div>

              <div className="flex flex-col gap-2 col-span-1 md:col-span-2">
                <label className="text-sm font-semibold text-slate-700">Dirección Fiscal / Principal</label>
                <Controller name="fiscal_address" control={control} render={({ field }) => (
                  <InputText {...field} className="p-2.5 border rounded-lg w-full" placeholder="Dirección completa" />
                )} />
              </div>
            </div>
          </TabPanel>

          {/* TAB 2: Reglas Logísticas y Financieras */}
          <TabPanel header="2. Reglas Logísticas" leftIcon="pi pi-box mr-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
              
              <div className="col-span-1 md:col-span-3 pb-2 border-b border-slate-100">
                <h3 className="text-emerald-700 font-bold text-sm tracking-widest uppercase">Acuerdos Financieros</h3>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Moneda Base</label>
                <Controller name="currency_id" control={control} render={({ field }) => (
                  <Dropdown value={field.value} onChange={(e) => field.onChange(e.value)} options={currencies} optionLabel="code" optionValue="id" placeholder="Seleccione Moneda" className="w-full border rounded-lg" />
                )} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Despacho Predeterminado</label>
                <Controller name="default_facility_id" control={control} render={({ field }) => (
                  <Dropdown value={field.value} onChange={(e) => field.onChange(e.value)} options={facilities} optionLabel="name" optionValue="id" placeholder="Directo a Tienda (Libre)" showClear className="w-full border rounded-lg" />
                )} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Límite de Crédito</label>
                <Controller name="credit_limit" control={control} render={({ field }) => (
                  <InputNumber value={field.value} onValueChange={(e) => field.onChange(e.value)} mode="currency" currency="USD" locale="en-US" className="w-full" inputClassName="p-2.5 border rounded-lg w-full" />
                )} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Días de Crédito Plazo</label>
                <Controller name="credit_days" control={control} render={({ field }) => (
                  <div className="p-inputgroup">
                    <InputNumber value={field.value} onValueChange={(e) => field.onChange(e.value)} className="w-full" inputClassName="p-2.5 border rounded-l-lg w-full" />
                    <span className="p-inputgroup-addon rounded-r-lg bg-slate-50 text-sm">Días</span>
                  </div>
                )} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Días de Pronto Pago</label>
                <Controller name="early_payment_days" control={control} render={({ field }) => (
                  <InputNumber value={field.value} onValueChange={(e) => field.onChange(e.value)} className="w-full" inputClassName="p-2.5 border rounded-lg w-full" />
                )} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">% Dscto. Pronto Pago</label>
                <Controller name="early_payment_discount_pct" control={control} render={({ field }) => (
                  <div className="p-inputgroup">
                    <InputNumber value={field.value} onValueChange={(e) => field.onChange(e.value)} maxFractionDigits={2} className="w-full" inputClassName="p-2.5 border rounded-l-lg w-full" />
                    <span className="p-inputgroup-addon rounded-r-lg bg-slate-50 text-sm">%</span>
                  </div>
                )} />
              </div>
              
              <div className="hidden md:block"></div>

              {/* CLARA DIGITAL WORKER: Banner de Auditoría y Calibración Logística Adaptativa */}
              <div className="col-span-1 md:col-span-3 bg-gradient-to-r from-indigo-900/5 via-purple-900/5 to-slate-50 border border-indigo-200/80 rounded-2xl p-5 shadow-sm mt-2">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-indigo-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md flex-shrink-0">
                      <i className="pi pi-sparkles text-lg" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-800">Clara (IA de Compras) • Calibración Logística</h3>
                        {claraAudit?.requires_attention ? (
                          <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-amber-300 flex items-center gap-1">
                            <i className="pi pi-exclamation-triangle text-xs" /> Desvío Detectado
                          </span>
                        ) : claraAudit?.deliveries_analyzed >= 3 ? (
                          <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-emerald-300 flex items-center gap-1">
                            <i className="pi pi-check-circle text-xs" /> Calibrado
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-700 text-xs px-2.5 py-0.5 rounded-full font-medium border border-slate-200 flex items-center gap-1">
                            <i className="pi pi-info-circle text-xs" /> Observación Pasiva
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Medición de Lead Time real (días de despacho) y cadencia de reposición basada en WMS.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      label="Aplicar Calibración de Clara"
                      icon="pi pi-sparkles"
                      loading={calibrating}
                      disabled={!claraAudit || !claraAudit.requires_attention}
                      onClick={handleApplyClaraCalibration}
                      className="bg-indigo-600 hover:bg-indigo-700 border-none text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow transition-all disabled:opacity-40"
                    />
                  </div>
                </div>

                {/* Metric Cards Comparison */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Lead Time (Despacho)</span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-xl font-black text-slate-800">
                        {claraAudit?.real_lead_time !== null && claraAudit?.real_lead_time !== undefined ? `${claraAudit.real_lead_time}d` : '---'}
                      </span>
                      <span className="text-xs text-slate-500">real vs {watch('lead_time_days') || 0}d ficha</span>
                    </div>
                    <div className="mt-1 text-[11px]">
                      {claraAudit && claraAudit.lead_time_deviation > 0 ? (
                        <span className="text-rose-600 font-semibold">+{claraAudit.lead_time_deviation}d de retraso</span>
                      ) : claraAudit && claraAudit.lead_time_deviation < 0 ? (
                        <span className="text-emerald-600 font-semibold">{claraAudit.lead_time_deviation}d más rápido</span>
                      ) : (
                        <span className="text-slate-500">Sin variación</span>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Cadencia (Reposición)</span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-xl font-black text-slate-800">
                        {claraAudit?.real_restock_days !== null && claraAudit?.real_restock_days !== undefined ? `${claraAudit.real_restock_days}d` : '---'}
                      </span>
                      <span className="text-xs text-slate-500">real vs {watch('restock_coverage_days') || 0}d ficha</span>
                    </div>
                    <div className="mt-1 text-[11px]">
                      {claraAudit && claraAudit.restock_deviation !== 0 && claraAudit.restock_deviation !== undefined ? (
                        <span className="text-amber-600 font-semibold">
                          {claraAudit.restock_deviation > 0 ? `+${claraAudit.restock_deviation}d` : `${claraAudit.restock_deviation}d`} desfase
                        </span>
                      ) : (
                        <span className="text-slate-500">Cadencia alineada</span>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Puntualidad OTIF</span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-xl font-black text-slate-800">
                        {claraAudit?.on_time_score ?? 100}%
                      </span>
                      <span className="text-xs text-slate-500">a tiempo</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {claraAudit?.deliveries_analyzed || 0} entregas analizadas
                    </div>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Modo Autónomo</span>
                      <div className="flex items-center gap-2 mt-2">
                        <Controller
                          name="auto_tune_logistics"
                          control={control}
                          render={({ field }) => (
                            <Checkbox
                              inputId="auto_tune_logistics"
                              checked={field.value}
                              onChange={(e) => field.onChange(e.checked)}
                            />
                          )}
                        />
                        <label htmlFor="auto_tune_logistics" className="text-xs font-semibold text-slate-700 cursor-pointer">
                          Auto-calibrar por Clara
                        </label>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1">Ajuste periódico en escaneo de fondo</span>
                  </div>
                </div>

                {/* Clara's Recommendation Message */}
                {claraAudit?.clara_recommendation && (
                  <div className="mt-4 bg-indigo-50/70 border border-indigo-100 rounded-xl p-3 flex items-start gap-3">
                    <i className="pi pi-comment text-indigo-500 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-indigo-950 leading-relaxed font-medium">
                      <span className="font-bold text-indigo-900">Diagnóstico de Clara: </span>
                      {claraAudit.clara_recommendation}
                    </div>
                  </div>
                )}
              </div>

              <div className="col-span-1 md:col-span-3 pb-2 border-b border-slate-100 mt-4">
                <h3 className="text-orange-600 font-bold text-sm tracking-widest uppercase">Ciclo de Compra y MRP</h3>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Lead Time (Días de Despacho)</label>
                <Controller name="lead_time_days" control={control} render={({ field }) => (
                  <InputNumber value={field.value} onValueChange={(e) => field.onChange(e.value)} className="w-full" inputClassName="p-2.5 border rounded-lg w-full" />
                )} />
                <small className="text-slate-500">¿Cuánto tarda en entregar?</small>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Días para Reposición</label>
                <Controller name="restock_coverage_days" control={control} render={({ field }) => (
                  <InputNumber value={field.value} onValueChange={(e) => field.onChange(e.value)} className="w-full" inputClassName="p-2.5 border rounded-lg w-full" />
                )} />
                <small className="text-slate-500">¿Cuántos días de venta quiero cubrir?</small>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Días de Análisis</label>
                <Controller name="sales_analysis_days" control={control} render={({ field }) => (
                  <InputNumber value={field.value} onValueChange={(e) => field.onChange(e.value)} className="w-full" inputClassName="p-2.5 border rounded-lg w-full" />
                )} />
                <small className="text-slate-500">Lookback temporal para promedios.</small>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">MOQ (Cantidad Mínima de Orden)</label>
                <Controller name="minimum_order_qty" control={control} render={({ field }) => (
                  <InputNumber value={field.value} onValueChange={(e) => field.onChange(e.value)} className="w-full" inputClassName="p-2.5 border rounded-lg w-full" />
                )} />
                <small className="text-slate-500">Restricción de umbral inferior.</small>
              </div>

            </div>
          </TabPanel>

          {/* TAB 3: Contactos */}
          <TabPanel header="3. Contactos" leftIcon="pi pi-users mr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
              
              <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-100 flex flex-col gap-4">
                <h4 className="font-bold text-blue-800 border-b border-blue-200 pb-2">Representante Comercial</h4>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500">Nombre Completo</label>
                  <Controller name="commercial_contact_name" control={control} render={({ field }) => <InputText {...field} className="p-2 border rounded-md" />} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500">Teléfono</label>
                  <Controller name="commercial_contact_phone" control={control} render={({ field }) => <InputText {...field} className="p-2 border rounded-md" />} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500">Correo Electrónico *</label>
                  <Controller name="commercial_email" control={control} render={({ field }) => <InputText type="email" {...field} className="p-2 border rounded-md" placeholder="Recepción de Órdenes de Compra" />} />
                </div>
              </div>

              <div className="bg-emerald-50/50 p-6 rounded-xl border border-emerald-100 flex flex-col gap-4">
                <h4 className="font-bold text-emerald-800 border-b border-emerald-200 pb-2">Representante Financiero</h4>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500">Nombre Completo</label>
                  <Controller name="financial_contact_name" control={control} render={({ field }) => <InputText {...field} className="p-2 border rounded-md" />} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500">Teléfono</label>
                  <Controller name="financial_contact_phone" control={control} render={({ field }) => <InputText {...field} className="p-2 border rounded-md" />} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500">Correo Electrónico *</label>
                  <Controller name="financial_email" control={control} render={({ field }) => <InputText type="email" {...field} className="p-2 border rounded-md" placeholder="Recepción de Soporte de Pagos" />} />
                </div>
              </div>

            </div>
          </TabPanel>

          {/* TAB 4: Catálogo de Insumos */}
          <TabPanel header="4. Catálogo de Insumos" leftIcon="pi pi-box mr-2">
            <SupplierCatalogTab supplierId={Number(supplierId)} ref={catalogRef} />
          </TabPanel>

          {/* TAB 5: Catálogo Bancario */}
          <TabPanel header="5. Cuentas Bancarias" leftIcon="pi pi-credit-card mr-2">
             <div className="pt-4">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-slate-600">Catálogo antifraude. Registre aquí las cuentas aprobadas para el pago a este proveedor.</p>
                  <Button type="button" label="Añadir Cuenta" icon="pi pi-plus" onClick={addBankRow} className="p-button-outlined p-button-sm p-button-success" />
                </div>

                {bankFields.length === 0 ? (
                  <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 mt-4">
                    <i className="pi pi-shield text-4xl text-slate-300 mb-3"></i>
                    <h3 className="text-lg font-bold text-slate-500">Sin cuentas registradas</h3>
                    <p className="text-sm text-slate-400 mt-1">Haga clic en 'Añadir Cuenta' para comenzar a blindar este proveedor.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl align-top">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600 uppercase">
                          <th className="p-3 font-semibold">Banco</th>
                          <th className="p-3 font-semibold">No. de Cuenta</th>
                          <th className="p-3 font-semibold w-32">SWIFT</th>
                          <th className="p-3 font-semibold w-32">ABA</th>
                          <th className="p-3 font-semibold w-40">Moneda</th>
                          <th className="p-3 font-semibold w-16 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bankFields.map((item, index) => (
                          <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                            <td className="p-2">
                              <Controller name={`banks.${index}.bank_name`} control={control} render={({ field }) => (
                                <InputText {...field} className="w-full p-2 border rounded-md text-sm" placeholder="Ej. Banesco Panama" />
                              )} />
                            </td>
                            <td className="p-2">
                              <Controller name={`banks.${index}.account_number`} control={control} render={({ field }) => (
                                <InputText {...field} className="w-full p-2 border rounded-md text-sm" placeholder="0000 0000 00..." />
                              )} />
                            </td>
                            <td className="p-2">
                              <Controller name={`banks.${index}.swift_code`} control={control} render={({ field }) => (
                                <InputText {...field} className="w-full p-2 border rounded-md text-sm" placeholder="Opcional" />
                              )} />
                            </td>
                            <td className="p-2">
                              <Controller name={`banks.${index}.aba_code`} control={control} render={({ field }) => (
                                <InputText {...field} className="w-full p-2 border rounded-md text-sm" placeholder="Opcional" />
                              )} />
                            </td>
                            <td className="p-2">
                              <Controller name={`banks.${index}.currency_id`} control={control} render={({ field }) => (
                                <Dropdown value={field.value} onChange={(e) => field.onChange(e.value)} options={currencies} optionLabel="code" optionValue="id" className="w-full text-sm border rounded-md" />
                              )} />
                            </td>
                            <td className="p-2 text-center">
                              <Button type="button" icon="pi pi-trash" className="p-button-rounded p-button-danger p-button-text p-button-sm" onClick={() => removeBank(index)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
          </TabPanel>

          {/* TAB 6: Políticas de Cambio y Devolución */}
          <TabPanel header="6. Políticas de Cambio" leftIcon="pi pi-replay mr-2">
            <SupplierReturnPolicyTab control={control} setValue={setValue} watch={watch} />
          </TabPanel>
        </TabView>
      </div>

      <style jsx global>{`
        .modern-tabs .p-tabview-nav {
          border-bottom: 2px solid #e2e8f0;
          background: transparent;
        }
        .modern-tabs .p-tabview-nav li .p-tabview-nav-link {
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: #64748b;
          font-weight: 600;
          padding: 1rem 1.5rem;
          margin-bottom: -2px;
          transition: all 0.2s ease;
        }
        .modern-tabs .p-tabview-nav li:not(.p-highlight):not(.p-disabled):hover .p-tabview-nav-link {
          background: #f8fafc;
          border-color: #cbd5e1;
          color: #334155;
        }
        .modern-tabs .p-tabview-nav li.p-highlight .p-tabview-nav-link {
          background: transparent;
          border-color: #059669; /* emerald-600 */
          color: #059669;
        }
      `}</style>
    </div>
  );
}
