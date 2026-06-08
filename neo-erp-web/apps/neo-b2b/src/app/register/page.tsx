'use client';
import { useState } from 'react';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import api from '@/lib/api';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    rif: '',
    name: '',
    email: '',
    phone: '',
    shipping_address: '',
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  const handleInputChange = (e: any) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileUploadMock = (e: any) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const names: string[] = [];
      for (let i = 0; i < files.length; i++) {
        names.push(files[i].name);
      }
      setUploadedFiles(prev => [...prev, ...names]);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    // Validation
    if (!formData.rif || !formData.name || !formData.email || !formData.phone || !formData.shipping_address) {
      setErrorMsg('Por favor complete todos los campos obligatorios.');
      setLoading(false);
      return;
    }

    try {
      await api.post('/b2b/register', {
        rif: formData.rif,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        shipping_address: formData.shipping_address
      });
      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.response?.data?.detail || 'Error al procesar el registro. Intente de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="sm:mx-auto sm:w-full sm:max-w-md animate-fade-in-up">
        <div className="bg-white py-10 px-8 shadow-xl shadow-slate-200/50 rounded-[2.5rem] border border-slate-100/80 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-6">
            <i className="pi pi-check text-2xl text-emerald-600"></i>
          </div>
          
          <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-2">
            ¡Registro Enviado!
          </h2>
          
          <p className="text-sm text-slate-500 font-medium leading-relaxed mb-6">
            Su solicitud de afiliación para <strong className="text-slate-800 font-bold">{formData.name}</strong> (RIF: {formData.rif}) ha sido recibida correctamente.
          </p>

          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 text-left mb-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
              <span className="text-xs font-extrabold text-amber-700 uppercase tracking-wider">Estado de la Solicitud</span>
            </div>
            <p className="text-xs text-slate-600 font-semibold mb-1 leading-snug">
              PENDIENTE DE APROBACIÓN
            </p>
            <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
              Nuestro departamento de Ventas y Crédito validará el RIF y documentos cargados. Se le enviará un correo electrónico a <span className="font-mono text-slate-500">{formData.email}</span> con sus credenciales tan pronto sea aprobado.
            </p>
          </div>

          <Button
            label="Volver al Login"
            icon="pi pi-arrow-left"
            onClick={() => {
              if (typeof window !== 'undefined') {
                const isProd = window.location.hostname.includes('.morpheussoft.net');
                window.location.href = isProd ? 'http://hub.qa.morpheussoft.net/login' : 'http://localhost:4000/login';
              }
            }}
            className="w-full !rounded-xl !bg-slate-900 border-none text-white hover:!bg-slate-800 !py-2.5 shadow-sm text-xs font-bold"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="sm:mx-auto sm:w-full sm:max-w-xl animate-fade-in-up">
      <div className="bg-white py-10 px-8 shadow-xl shadow-slate-200/50 rounded-[2.5rem] border border-slate-100/80">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4 border border-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.4)]">
            <i className="pi pi-shopping-bag text-xl text-white"></i>
          </div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">
            Afiliación de Mayoristas B2B
          </h2>
          <p className="text-xs text-slate-400 font-medium tracking-wide mt-1 uppercase">
            Complete los datos para solicitar su cuenta de acceso
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6">
            <Message severity="error" text={errorMsg} className="w-full !justify-start !rounded-xl" />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* RIF & Razón Social */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">RIF de la Empresa *</label>
              <InputText
                name="rif"
                value={formData.rif}
                onChange={handleInputChange}
                placeholder="Ej: J-31234567-8"
                autoComplete="off"
                className="w-full !rounded-xl border-slate-200 focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 shadow-sm !py-2.5 text-sm"
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Razón Social *</label>
              <InputText
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Ej: Distribuidora Morpheus C.A."
                autoComplete="off"
                className="w-full !rounded-xl border-slate-200 focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 shadow-sm !py-2.5 text-sm"
              />
            </div>
          </div>

          {/* Email & Teléfono */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Correo Corporativo *</label>
              <InputText
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="Ej: compras@empresa.com"
                autoComplete="off"
                className="w-full !rounded-xl border-slate-200 focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 shadow-sm !py-2.5 text-sm"
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Teléfono de Contacto *</label>
              <InputText
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                placeholder="Ej: +58 424-1234567"
                autoComplete="off"
                className="w-full !rounded-xl border-slate-200 focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 shadow-sm !py-2.5 text-sm"
              />
            </div>
          </div>

          {/* Dirección */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">Dirección de Despacho *</label>
            <InputText
              name="shipping_address"
              value={formData.shipping_address}
              onChange={handleInputChange}
              placeholder="Dirección física completa para envíos logísticos..."
              autoComplete="off"
              className="w-full !rounded-xl border-slate-200 focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 shadow-sm !py-2.5 text-sm"
            />
          </div>

          {/* Document Upload (RIF / Acta Constitutiva) */}
          <div className="flex flex-col gap-1.5 bg-slate-50 p-4 rounded-2xl border border-dashed border-slate-250">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1 block">Carga de Documentación Legal *</label>
            <span className="text-[10px] text-slate-400 block mb-3 leading-none">Adjunte su Registro de Información Fiscal y Acta Constitutiva (PDF o Imagen)</span>
            
            <div className="flex flex-col items-center justify-center py-4 bg-white rounded-xl border border-slate-200 shadow-sm cursor-pointer relative hover:bg-slate-50/50 transition-colors">
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileUploadMock}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <i className="pi pi-cloud-upload text-2xl text-blue-500 mb-2"></i>
              <span className="text-xs font-bold text-slate-600">Seleccionar archivos</span>
              <span className="text-[10px] text-slate-400 mt-1">Soporta PDF, PNG, JPG hasta 5MB</span>
            </div>

            {uploadedFiles.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Archivos Seleccionados:</span>
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs text-xs font-medium">
                    <span className="truncate max-w-[280px] text-slate-700"><i className="pi pi-file text-blue-500 mr-1.5"></i>{f}</span>
                    <i className="pi pi-check-circle text-emerald-500 text-sm"></i>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Button */}
          <Button
            type="submit"
            label="Enviar Solicitud de Registro"
            icon={loading ? "pi pi-spinner pi-spin" : "pi pi-send"}
            disabled={loading}
            className="w-full !rounded-xl !bg-blue-600 border-none text-white hover:!bg-blue-700 !py-3 shadow-md shadow-blue-500/10 text-sm font-bold uppercase tracking-wider"
          />

          <div className="text-center pt-2">
            <span className="text-[11px] font-medium text-slate-400">
              ¿Ya tiene cuenta?{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (typeof window !== 'undefined') {
                    const isProd = window.location.hostname.includes('.morpheussoft.net');
                    window.location.href = isProd ? 'http://hub.qa.morpheussoft.net/login' : 'http://localhost:4000/login';
                  }
                }}
                className="text-blue-500 hover:text-blue-600 font-bold"
              >
                Inicie Sesión aquí
              </a>
            </span>
          </div>

        </form>
      </div>
    </div>
  );
}
