'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { clearAuthCookies, getLoginUrl, resolveDomain } from '@/lib/domain';
import { canAccessModule } from '@/lib/rbac';
import { ChangePasswordModal } from './ChangePasswordModal';

const MODULE_KEY = 'neo_core';
const MODULE_LABEL = 'Neo Core (Mando Central)';

interface SessionGuardProps {
  children: React.ReactNode;
  inactivityTimeoutMinutes?: number;
}

function parseJwt(token: string): { exp?: number; sub?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function SessionGuard({ children, inactivityTimeoutMinutes = 30 }: SessionGuardProps) {
  const pathname = usePathname() || '';
  const [isExpired, setIsExpired] = useState(false);
  const [isForbidden, setIsForbidden] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const redirectingRef = useRef(false);

  // Determinar si la ruta es pública o es el Portal Hub Central (/)
  const isPublic = 
    pathname === '/' ||
    pathname.startsWith('/login') || 
    pathname.includes('/public/') || 
    pathname.includes('/register');

  const redirectToLogin = useCallback(() => {
    if (redirectingRef.current || isPublic) return;
    redirectingRef.current = true;
    setIsExpired(true);

    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('token');
        clearAuthCookies();
        const currentUrl = window.location.href;
        const loginUrl = getLoginUrl(currentUrl);
        window.location.href = loginUrl;
      } catch (err) {
        console.error('Error durante redirección por desconexión:', err);
      }
    }
  }, [isPublic]);

  useEffect(() => {
    if (isPublic) {
      setIsForbidden(false);
      return;
    }

    import('@/lib/api').then(({ default: api }) => {
      api.get('/users/me')
        .then(res => {
          const user = res.data;
          setCurrentUser(user);
          if (user && !canAccessModule(user, MODULE_KEY)) {
            if (pathname === '/dashboard') {
              // Redirigir suavemente al Portal Hub Central cuando viene de /login
              window.location.href = '/';
              return;
            }
            setIsForbidden(true);
          } else {
            setIsForbidden(false);
          }
        })
        .catch(() => {
          // Si falla por 401, el interceptor o checkSession manejará la sesión
        });
    });
  }, [isPublic, pathname]);

  useEffect(() => {
    if (isPublic) return;

    let timeoutTimer: NodeJS.Timeout | null = null;
    let lastActivityTime = Date.now();
    const maxInactivityMs = inactivityTimeoutMinutes * 60 * 1000;

    const checkSession = () => {
      if (typeof window === 'undefined') return;

      let token: string | null = null;
      const match = document.cookie.match(/(?:^|;\s*)access_token=([^;]*)/);
      if (match && match[1]) {
        token = match[1];
      } else {
        token = localStorage.getItem('token');
      }

      if (!token) {
        redirectToLogin();
        return;
      }

      const payload = parseJwt(token);
      if (!payload || !payload.exp) {
        redirectToLogin();
        return;
      }

      const now = Date.now();
      const expiresAtMs = payload.exp * 1000;
      const remainingMs = expiresAtMs - now;

      if (remainingMs <= 0) {
        redirectToLogin();
        return;
      }

      if (inactivityTimeoutMinutes > 0 && now - lastActivityTime >= maxInactivityMs) {
        redirectToLogin();
        return;
      }

      if (timeoutTimer) clearTimeout(timeoutTimer);
      const remainingInactivity = maxInactivityMs - (now - lastActivityTime);
      const nextDelay = Math.min(
        remainingMs,
        remainingInactivity > 0 ? remainingInactivity : remainingMs
      );
      
      const safeDelay = Math.max(100, Math.min(nextDelay, 2147483647));
      timeoutTimer = setTimeout(() => {
        checkSession();
      }, safeDelay);
    };

    const onUserActivity = () => {
      lastActivityTime = Date.now();
    };

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach((event) => {
      window.addEventListener(event, onUserActivity, { passive: true });
    });

    checkSession();

    const heartbeatInterval = setInterval(checkSession, 10000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkSession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', checkSession);

    return () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      clearInterval(heartbeatInterval);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, onUserActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', checkSession);
    };
  }, [isPublic, redirectToLogin, inactivityTimeoutMinutes]);

  if (isExpired) {
    return (
      <div className="fixed inset-0 z-[99999] bg-slate-950 flex flex-col items-center justify-center text-white p-6 font-sans">
        <div className="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mb-4 animate-pulse">
          <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2">Sesión Finalizada</h2>
        <p className="text-slate-400 text-sm mb-6 text-center max-w-sm">
          El tiempo de conexión ha expirado por seguridad. Redirigiendo al inicio de sesión...
        </p>
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (isForbidden) {
    const hubUrl = resolveDomain().hubUrl || '/';
    const roleName = currentUser?.active_role?.name || currentUser?.roles?.[0]?.name || 'Sin Rol';
    return (
      <div className="fixed inset-0 z-[99999] bg-slate-950 flex flex-col items-center justify-center text-white p-6 font-sans">
        <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto mb-5">
            <i className="pi pi-shield text-2xl text-rose-400"></i>
          </div>
          <h2 className="text-xl font-extrabold text-white mb-2">Acceso Restringido</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            Tu perfil actual (<span className="text-slate-200 font-bold">{roleName}</span>) no cuenta con privilegios habilitados para acceder a <span className="text-indigo-400 font-bold">{MODULE_LABEL}</span>.
          </p>
          <p className="text-xs text-slate-500 mb-6">
            Si necesitas acceso a este módulo, solicita la habilitación en <strong>Neo Core → Roles y Privilegios</strong>.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={hubUrl}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
            >
              <i className="pi pi-th-large text-xs"></i> Ir al Hub Central
            </a>
          </div>
        </div>
      </div>
    );
  }

  const handlePasswordChanged = () => {
    setCurrentUser((prev: any) => (prev ? { ...prev, must_change_password: false } : null));
  };

  return (
    <>
      {currentUser?.must_change_password && (
        <ChangePasswordModal
          isOpen={true}
          isForced={true}
          onSuccess={handlePasswordChanged}
        />
      )}
      {children}
    </>
  );
}
