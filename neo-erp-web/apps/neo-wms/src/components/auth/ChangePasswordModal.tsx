'use client';

import React, { useState } from 'react';
import api from '@/lib/api';
import { clearAuthCookies, getLogoutUrl } from '@/lib/domain';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose?: () => void;
  isForced?: boolean;
  onSuccess?: () => void;
}

export function ChangePasswordModal({
  isOpen,
  onClose,
  isForced = false,
  onSuccess,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleCancelAndLogout = () => {
    resetForm();
    clearAuthCookies();
    if (typeof window !== 'undefined') {
      window.location.href = getLogoutUrl();
    }
  };

  const handleClose = () => {
    if (isForced) {
      handleCancelAndLogout();
      return;
    }
    resetForm();
    if (onClose) onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentPassword) {
      setErrorMsg('Debes ingresar tu contraseña actual.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMsg('La nueva contraseña no puede ser idéntica a la actual.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Las nuevas contraseñas no coinciden.');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/users/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });

      setSuccessMsg(response.data?.message || 'Contraseña actualizada exitosamente.');
      
      setTimeout(() => {
        resetForm();
        if (onSuccess) onSuccess();
        if (!isForced && onClose) onClose();
      }, 1200);
    } catch (err: unknown) {
      console.error('Error changing password:', err);
      const errObj = err as { response?: { data?: { detail?: string | Array<{ msg?: string }> } } };
      const detail = errObj?.response?.data?.detail;
      if (typeof detail === 'string') {
        setErrorMsg(detail);
      } else if (Array.isArray(detail)) {
        setErrorMsg(detail[0]?.msg || 'Error al actualizar contraseña.');
      } else {
        setErrorMsg('Error de comunicación con el servidor. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity ${
          isForced ? 'pointer-events-none' : 'cursor-pointer'
        }`}
        onClick={!isForced ? handleClose : undefined}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-10 animate-slide-up">
        {/* Top Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg ${
              isForced 
                ? 'bg-amber-500/20 border border-amber-400/40 text-amber-400 shadow-amber-500/10'
                : 'bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 shadow-indigo-500/10'
            }`}>
              <i className={`pi ${isForced ? 'pi-shield' : 'pi-key'} text-lg`}></i>
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {isForced ? 'Cambio de Clave Obligatorio' : 'Actualizar Contraseña'}
              </h3>
              <p className="text-xs text-slate-300">
                {isForced ? 'Neo ERP • Seguridad de Acceso' : 'Credenciales de tu cuenta'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            title={isForced ? 'Cancelar y volver al inicio de sesión' : 'Cerrar'}
            className="w-8 h-8 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer"
          >
            <i className="pi pi-times text-sm"></i>
          </button>
        </div>

        {/* Notice for Forced Mode */}
        {isForced && (
          <div className="bg-amber-50 border-b border-amber-100 px-6 py-3 flex items-start gap-2.5">
            <i className="pi pi-exclamation-circle text-amber-600 text-sm mt-0.5 shrink-0"></i>
            <p className="text-xs text-amber-900 leading-relaxed font-medium">
              Por políticas de seguridad, debes actualizar tu clave personal para continuar usando el sistema. Una vez cambiada, este requisito se desactivará automáticamente.
            </p>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-start gap-2">
              <i className="pi pi-exclamation-triangle text-rose-500 text-sm mt-0.5 shrink-0"></i>
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium flex items-start gap-2">
              <i className="pi pi-check-circle text-emerald-500 text-sm mt-0.5 shrink-0"></i>
              <span>{successMsg}</span>
            </div>
          )}

          {/* Current Password */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
              Contraseña Actual
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-4 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:border-transparent outline-none transition-all placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <i className={`pi ${showCurrent ? 'pi-eye-slash' : 'pi-eye'} text-sm`}></i>
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
              Nueva Contraseña
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full pl-4 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:border-transparent outline-none transition-all placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <i className={`pi ${showNew ? 'pi-eye-slash' : 'pi-eye'} text-sm`}></i>
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
              Confirmar Nueva Contraseña
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la nueva contraseña"
                className="w-full pl-4 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:border-transparent outline-none transition-all placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <i className={`pi ${showConfirm ? 'pi-eye-slash' : 'pi-eye'} text-sm`}></i>
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isForced && <i className="pi pi-sign-out text-xs"></i>}
              <span>Cancelar</span>
            </button>
            <button
              type="submit"
              disabled={loading || !!successMsg}
              className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-sm text-white shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                isForced
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20'
              } disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {loading ? (
                <>
                  <i className="pi pi-spinner animate-spin text-sm"></i>
                  <span>Guardando...</span>
                </>
              ) : successMsg ? (
                <>
                  <i className="pi pi-check text-sm"></i>
                  <span>¡Listo!</span>
                </>
              ) : (
                <>
                  <i className="pi pi-save text-sm"></i>
                  <span>Actualizar Contraseña</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
