'use client';

import React, { useState } from 'react';
import { Controller, Control, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Button } from 'primereact/button';

interface SupplierReturnPolicyTabProps {
  control: Control<any>;
  setValue: UseFormSetValue<any>;
  watch: UseFormWatch<any>;
}

const DEFAULT_SUGGESTIONS = [
  'Avería de Fábrica / Defecto',
  'Daño en Transporte / Golpes',
  'Faltante en Bulto Cerrado',
  'Cercano a Vencimiento (< 90 días)',
  'Error de Despacho (Ítem No Pedido)',
  'Rotación Lenta / Sin Salida',
  'Empaque Roto o Manchado',
  'Diferencia de Peso / Contenido',
];

const ALLOWS_RETURNS_OPTIONS = [
  { label: '✓ Sí (Acepta Cambios y Devoluciones)', value: 'YES' },
  { label: '⚠️ Parcial (Solo Causales Específicas)', value: 'PARTIAL' },
  { label: '⛔ No Acepta (Venta en Firme / Sin Cambios)', value: 'NO' },
  { label: '🔍 Previa Evaluación Técnica / Garantía', value: 'EVALUATION' },
];

const COMPENSATION_OPTIONS = [
  { label: '🔄 Reposición Física (Canje 1 a 1 en Próxima Entrega)', value: 'REPLACEMENT' },
  { label: '📄 Nota de Crédito (Deducción en Pago / Cuenta por Pagar)', value: 'CREDIT_NOTE' },
  { label: '🏷️ Descuento Comercial en Próxima Orden', value: 'NEXT_ORDER_DISCOUNT' },
  { label: '🗑️ Destrucción en Sitio con Acta de Supervisor', value: 'ON_SITE_DESTRUCTION' },
  { label: '📌 Otro Acuerdo Particular', value: 'OTHER' },
];

const FREIGHT_OPTIONS = [
  { label: '🚚 Asume Proveedor (Transporte o Flete)', value: 'SUPPLIER' },
  { label: '🏢 Asume Cliente / Neo (Flete a cargo del comprador)', value: 'BUYER' },
  { label: '🏬 Retiro en Tienda / Muelle por Chofer del Proveedor', value: 'SUPPLIER_PICKUP' },
  { label: '🤝 Flete Compartido (50% / 50%)', value: 'SHARED' },
];

export default function SupplierReturnPolicyTab({ control, setValue, watch }: SupplierReturnPolicyTabProps) {
  const [newReasonText, setNewReasonText] = useState('');
  
  const currentReasons: string[] = watch('return_policy.accepted_reasons') || [];

  const handleAddReason = (reasonToAdd: string) => {
    const trimmed = reasonToAdd.trim();
    if (!trimmed) return;
    if (!currentReasons.includes(trimmed)) {
      const updated = [...currentReasons, trimmed];
      setValue('return_policy.accepted_reasons', updated, { shouldDirty: true });
    }
    setNewReasonText('');
  };

  const handleRemoveReason = (reasonToRemove: string) => {
    const updated = currentReasons.filter((r) => r !== reasonToRemove);
    setValue('return_policy.accepted_reasons', updated, { shouldDirty: true });
  };

  return (
    <div className="flex flex-col gap-6 pt-4 text-slate-700">
      {/* Header Banner Informativo */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50/60 p-5 rounded-2xl border border-amber-200/80 flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
          <i className="pi pi-shield text-xl"></i>
        </div>
        <div className="flex-1">
          <h3 className="font-extrabold text-amber-950 text-base mb-1">Políticas de Cambio, Devolución y Reclamos</h3>
          <p className="text-xs text-amber-800 leading-relaxed">
            Esta información es de carácter <strong>consultivo y operativo</strong>. Permite al comprador conocer los acuerdos pactados y al personal de almacén en <strong>Neo WMS</strong> saber cómo proceder ante averías, mermas o productos rechazados en muelle.
          </p>
        </div>
      </div>

      {/* 1. Reglas Rápidas y Acuerdos Principales */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-5">
        <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
          <i className="pi pi-sliders-h text-indigo-600"></i>
          <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Reglas Rápidas de Cambio</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Acepta Cambios */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-600">Acepta Cambios / Devoluciones</label>
            <Controller
              name="return_policy.allows_returns"
              control={control}
              defaultValue="YES"
              render={({ field }) => (
                <Dropdown
                  value={field.value || 'YES'}
                  options={ALLOWS_RETURNS_OPTIONS}
                  onChange={(e) => field.onChange(e.value)}
                  className="w-full text-xs border rounded-xl"
                />
              )}
            />
            <small className="text-[11px] text-slate-400">Postura general del proveedor.</small>
          </div>

          {/* Plazo Máximo */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-600">Plazo Máximo para Reclamos</label>
            <Controller
              name="return_policy.max_claim_days"
              control={control}
              defaultValue={7}
              render={({ field }) => (
                <InputNumber
                  value={field.value}
                  onValueChange={(e) => field.onChange(e.value)}
                  suffix=" días"
                  min={0}
                  max={365}
                  className="w-full"
                  inputClassName="p-2 border rounded-xl w-full text-xs font-bold"
                  placeholder="Ej. 7 días"
                />
              )}
            />
            <small className="text-[11px] text-slate-400">Días continuos tras recepción física.</small>
          </div>

          {/* Modalidad de Compensación */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-600">Compensación Habitual</label>
            <Controller
              name="return_policy.compensation_method"
              control={control}
              defaultValue="REPLACEMENT"
              render={({ field }) => (
                <Dropdown
                  value={field.value || 'REPLACEMENT'}
                  options={COMPENSATION_OPTIONS}
                  onChange={(e) => field.onChange(e.value)}
                  className="w-full text-xs border rounded-xl"
                />
              )}
            />
            <small className="text-[11px] text-slate-400">Vía de restitución económica.</small>
          </div>

          {/* Flete / Retiro */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-600">Responsable del Flete</label>
            <Controller
              name="return_policy.freight_responsibility"
              control={control}
              defaultValue="SUPPLIER"
              render={({ field }) => (
                <Dropdown
                  value={field.value || 'SUPPLIER'}
                  options={FREIGHT_OPTIONS}
                  onChange={(e) => field.onChange(e.value)}
                  className="w-full text-xs border rounded-xl"
                />
              )}
            />
            <small className="text-[11px] text-slate-400">Quién asume la logística de retorno.</small>
          </div>
        </div>
      </div>

      {/* 2. Causales Aceptadas (Dinámicas y Extensibles) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
        <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <i className="pi pi-tags text-amber-600"></i>
            <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Causales de Cambio Aceptadas</h4>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
            {currentReasons.length} {currentReasons.length === 1 ? 'causal activa' : 'causales activas'}
          </span>
        </div>

        <p className="text-xs text-slate-500 m-0">
          Haz clic en las sugerencias frecuentes o escribe causales particulares acordadas con este proveedor:
        </p>

        {/* Sugerencias Rápidas */}
        <div className="flex flex-wrap gap-2 pt-1">
          {DEFAULT_SUGGESTIONS.map((sug) => {
            const isSelected = currentReasons.includes(sug);
            return (
              <button
                key={sug}
                type="button"
                onClick={() => isSelected ? handleRemoveReason(sug) : handleAddReason(sug)}
                className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 cursor-pointer border ${
                  isSelected
                    ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <i className={`pi ${isSelected ? 'pi-check' : 'pi-plus'} text-[10px]`}></i>
                {sug}
              </button>
            );
          })}
        </div>

        {/* Input para agregar Causal Libre / Personalizada */}
        <div className="flex gap-2 pt-2">
          <div className="relative flex-1">
            <InputText
              value={newReasonText}
              onChange={(e) => setNewReasonText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddReason(newReasonText);
                }
              }}
              placeholder="Escribe otra causal personalizada (Ej: Envase abollado, precinto roto, etc.)..."
              className="w-full p-2.5 text-xs border rounded-xl"
            />
          </div>
          <Button
            type="button"
            label="Añadir Causal"
            icon="pi pi-plus-circle"
            severity="warning"
            onClick={() => handleAddReason(newReasonText)}
            disabled={!newReasonText.trim()}
            className="text-xs font-bold px-4 rounded-xl"
          />
        </div>

        {/* Causales Configuradas / Chips Activos */}
        <div className="mt-2 p-4 bg-slate-50 rounded-xl border border-slate-200 min-h-[70px] flex flex-wrap gap-2 items-center">
          {currentReasons.length === 0 ? (
            <span className="text-xs text-slate-400 italic flex items-center gap-2">
              <i className="pi pi-info-circle"></i>
              No hay causales configuradas para este proveedor. Selecciona arriba o añade una personalizada.
            </span>
          ) : (
            currentReasons.map((reason, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 shadow-2xs"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                {reason}
                <button
                  type="button"
                  onClick={() => handleRemoveReason(reason)}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors ml-1 cursor-pointer"
                  title="Eliminar causal"
                >
                  <i className="pi pi-times text-[10px]"></i>
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {/* 3. Contacto Exclusivo de Reclamos y Postventa */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
        <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
          <i className="pi pi-envelope text-blue-600"></i>
          <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Canal Directo de Reclamos y Postventa</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-600">Encargado de Reclamos / Postventa</label>
            <Controller
              name="return_policy.claims_contact_name"
              control={control}
              defaultValue=""
              render={({ field }) => (
                <InputText
                  {...field}
                  value={field.value || ''}
                  className="p-2.5 text-xs border rounded-xl"
                  placeholder="Ej: Ing. Carlos Méndez (Garantías)"
                />
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-600">Teléfono / WhatsApp de Reclamos</label>
            <Controller
              name="return_policy.claims_contact_phone"
              control={control}
              defaultValue=""
              render={({ field }) => (
                <InputText
                  {...field}
                  value={field.value || ''}
                  className="p-2.5 text-xs border rounded-xl"
                  placeholder="Ej: +58 414 1234567"
                />
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-600">Correo para Envío de Actas / Fotos</label>
            <Controller
              name="return_policy.claims_contact_email"
              control={control}
              defaultValue=""
              render={({ field }) => (
                <InputText
                  type="email"
                  {...field}
                  value={field.value || ''}
                  className="p-2.5 text-xs border rounded-xl"
                  placeholder="Ej: reclamos@distribuidora.com"
                />
              )}
            />
          </div>
        </div>
      </div>

      {/* 4. Procedimiento Detallado y Condiciones Especiales */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
        <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
          <i className="pi pi-align-left text-slate-600"></i>
          <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Procedimiento y Términos Contractuales</h4>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-600">Instrucciones y Requisitos para Procesar Cambios:</label>
          <Controller
            name="return_policy.procedure_notes"
            control={control}
            defaultValue=""
            render={({ field }) => (
              <InputTextarea
                {...field}
                value={field.value || ''}
                rows={4}
                autoResize
                className="w-full p-3 text-xs border rounded-xl leading-relaxed"
                placeholder="Describe el procedimiento exigido por el proveedor. Ej: Requiere fotografías del número de lote visible y empaque primario. El chofer del proveedor retira el producto en el siguiente despacho semanal con copia de la recepción..."
              />
            )}
          />
          <small className="text-[11px] text-slate-400">
            Este texto se mostrará como guía rápida para el recepcionista de almacén y compras.
          </small>
        </div>
      </div>
    </div>
  );
}
