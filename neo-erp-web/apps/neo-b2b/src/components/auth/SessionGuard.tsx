'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  clearAuthCookies,
  getLoginUrl,
  setAuthTokenCookie,
  recordSharedActivity,
  getSharedLastActivity,
} from '@/lib/domain';

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
  const [warningSecondsLeft, setWarningSecondsLeft] = useState<number | null>(null);

  const redirectingRef = useRef(false);
  const lastActivityRef = useRef<number>(Date.now());
  const lastSharedWriteRef = useRef<number>(0);
  const lastTokenRefreshRef = useRef<number>(Date.now());
  const refreshingTokenRef = useRef<boolean>(false);
  const warningActiveRef = useRef<boolean>(false);

  const isPublic =
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.includes('/public/') ||
    pathname.includes('/register');

  const redirectToLogin = useCallback(() => {
    if (redirectingRef.current || isPublic) return;
    redirectingRef.current = true;
    setWarningSecondsLeft(null);
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

  const refreshSlidingToken = useCallback(async () => {
    if (refreshingTokenRef.current || isPublic) return;
    refreshingTokenRef.current = true;
    try {
      const { default: api } = await import('@/lib/api');
      const res = await api.post('/login/refresh-token');
      if (res?.data?.access_token) {
        setAuthTokenCookie(res.data.access_token);
        lastTokenRefreshRef.current = Date.now();
      }
    } catch {
      // Ignorar fallos transitorios de red
    } finally {
      refreshingTokenRef.current = false;
    }
  }, [isPublic]);

  const handleKeepSessionAlive = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    lastSharedWriteRef.current = now;
    warningActiveRef.current = false;
    setWarningSecondsLeft(null);
    recordSharedActivity(now);
    refreshSlidingToken();
  }, [refreshSlidingToken]);

  useEffect(() => {
    if (isPublic) return;

    const maxInactivityMs = inactivityTimeoutMinutes * 60 * 1000;
    const warningWindowMs = 60 * 1000;

    const initialNow = Date.now();
    const sharedTs = getSharedLastActivity();
    if (sharedTs > 0 && initialNow - sharedTs < maxInactivityMs) {
      lastActivityRef.current = sharedTs;
    } else {
      lastActivityRef.current = initialNow;
      recordSharedActivity(initialNow);
      lastSharedWriteRef.current = initialNow;
    }

    const registerActivity = (isExplicitAction: boolean) => {
      if (warningActiveRef.current && !isExplicitAction) {
        return;
      }
      const now = Date.now();
      lastActivityRef.current = now;
      if (warningActiveRef.current) {
        warningActiveRef.current = false;
        setWarningSecondsLeft(null);
      }
      if (now - lastSharedWriteRef.current >= 10000) {
        lastSharedWriteRef.current = now;
        recordSharedActivity(now);
      }
    };

    const onPassiveMove = () => registerActivity(false);
    const onExplicitInteraction = () => registerActivity(true);

    window.addEventListener('mousemove', onPassiveMove, { passive: true });
    window.addEventListener('scroll', onPassiveMove, { passive: true });
    window.addEventListener('mousedown', onExplicitInteraction, { passive: true });
    window.addEventListener('keydown', onExplicitInteraction, { passive: true });
    window.addEventListener('touchstart', onExplicitInteraction, { passive: true });
    window.addEventListener('click', onExplicitInteraction, { passive: true });

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

      const now = Date.now();
      const latestShared = getSharedLastActivity();
      if (latestShared > lastActivityRef.current) {
        lastActivityRef.current = latestShared;
      }

      const inactiveMs = now - lastActivityRef.current;
      const remainingInactivityMs = maxInactivityMs - inactiveMs;

      if (inactivityTimeoutMinutes > 0 && remainingInactivityMs <= 0) {
        redirectToLogin();
        return;
      }

      if (inactivityTimeoutMinutes > 0 && remainingInactivityMs <= warningWindowMs) {
        warningActiveRef.current = true;
        setWarningSecondsLeft(Math.max(1, Math.ceil(remainingInactivityMs / 1000)));
      } else if (warningActiveRef.current) {
        warningActiveRef.current = false;
        setWarningSecondsLeft(null);
      }

      const payload = parseJwt(token);
      if (!payload || !payload.exp) {
        redirectToLogin();
        return;
      }

      const expiresAtMs = payload.exp * 1000;
      const remainingTokenMs = expiresAtMs - now;

      if (remainingTokenMs <= 0) {
        redirectToLogin();
        return;
      }

      const timeSinceLastRefresh = now - lastTokenRefreshRef.current;
      if (
        inactiveMs < maxInactivityMs - warningWindowMs &&
        (timeSinceLastRefresh >= 10 * 60 * 1000 || remainingTokenMs < 60 * 60 * 1000)
      ) {
        refreshSlidingToken();
      }
    };

    checkSession();
    const intervalId = setInterval(checkSession, 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkSession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', checkSession);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('mousemove', onPassiveMove);
      window.removeEventListener('scroll', onPassiveMove);
      window.removeEventListener('mousedown', onExplicitInteraction);
      window.removeEventListener('keydown', onExplicitInteraction);
      window.removeEventListener('touchstart', onExplicitInteraction);
      window.removeEventListener('click', onExplicitInteraction);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', checkSession);
    };
  }, [isPublic, redirectToLogin, refreshSlidingToken, inactivityTimeoutMinutes]);

  if (isExpired) {
    return (
      <div className="fixed inset-0 z-[99999] bg-slate-950 flex flex-col items-center justify-center text-white p-6 font-sans">
        <div className="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mb-4 animate-pulse">
          <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2">Sesión Finalizada por Inactividad</h2>
        <p className="text-slate-400 text-sm mb-6 text-center max-w-sm">
          Se alcanzó el tiempo máximo de inactividad (30 min). Redirigiendo al inicio de sesión de Neo ERP...
        </p>
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <>
      {warningSecondsLeft !== null && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="inactivity-modal-title"
          className="fixed inset-0 z-[99998] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 font-sans"
        >
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 id="inactivity-modal-title" className="text-lg font-extrabold text-slate-900 mb-1">
              ¿Sigues trabajando en Neo ERP?
            </h3>
            <p className="text-slate-600 text-sm mb-4">
              No hemos detectado actividad reciente. Por seguridad, tu sesión se cerrará automáticamente en:
            </p>
            <div className="inline-flex items-center justify-center px-5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 font-mono text-2xl font-black mb-6">
              {warningSecondsLeft}s
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={redirectToLogin}
                className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-sm transition-all cursor-pointer"
              >
                Cerrar sesión ahora
              </button>
              <button
                type="button"
                onClick={handleKeepSessionAlive}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
              >
                Mantener sesión activa
              </button>
            </div>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
