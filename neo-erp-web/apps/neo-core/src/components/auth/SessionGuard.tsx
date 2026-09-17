'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';

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
  const redirectingRef = useRef(false);

  // Determinar si la ruta es pública
  const isPublic = 
    pathname.startsWith('/login') || 
    pathname.includes('/public/') || 
    pathname.includes('/register');

  const redirectToLogin = useCallback(() => {
    if (redirectingRef.current || isPublic) return;
    redirectingRef.current = true;
    setIsExpired(true);

    if (typeof window !== 'undefined') {
      try {
        // Limpiar tokens de almacenamiento y cookies
        localStorage.removeItem('token');
        const isProd = window.location.hostname.includes('.morpheussoft.net');
        
        // Eliminar cookies tanto con dominio compartido como sin él
        if (isProd) {
          document.cookie = 'access_token=; Max-Age=0; path=/; domain=.morpheussoft.net;';
        }
        document.cookie = 'access_token=; Max-Age=0; path=/;';
        
        const currentUrl = window.location.href;
        const loginUrl = isProd 
          ? `https://hub.qa.morpheussoft.net/login?callbackUrl=${encodeURIComponent(currentUrl)}` 
          : `http://localhost:4000/login?callbackUrl=${encodeURIComponent(currentUrl)}`;
        
        // Redirección inmediata y definitiva
        window.location.href = loginUrl;
      } catch (err) {
        console.error('Error durante redirección por desconexión:', err);
      }
    }
  }, [isPublic]);

  useEffect(() => {
    if (isPublic) return;

    let timeoutTimer: NodeJS.Timeout | null = null;
    let lastActivityTime = Date.now();
    const maxInactivityMs = inactivityTimeoutMinutes * 60 * 1000;

    const checkSession = () => {
      if (typeof window === 'undefined') return;

      // 1. Obtener token de acceso
      let token: string | null = null;
      const match = document.cookie.match(/(?:^|;\s*)access_token=([^;]*)/);
      if (match && match[1]) {
        token = match[1];
      } else {
        token = localStorage.getItem('token');
      }

      // Si no existe token en ruta protegida -> desconexión inmediata
      if (!token) {
        redirectToLogin();
        return;
      }

      // 2. Decodificar JWT y verificar expiración matemática
      const payload = parseJwt(token);
      if (!payload || !payload.exp) {
        redirectToLogin();
        return;
      }

      const now = Date.now();
      const expiresAtMs = payload.exp * 1000;
      const remainingMs = expiresAtMs - now;

      // Token JWT ya expiró
      if (remainingMs <= 0) {
        redirectToLogin();
        return;
      }

      // Inactividad del usuario superó el límite permitido
      if (inactivityTimeoutMinutes > 0 && now - lastActivityTime >= maxInactivityMs) {
        redirectToLogin();
        return;
      }

      // Programar temporizador exacto para el próximo vencimiento
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

    // Actualizar actividad del usuario
    const onUserActivity = () => {
      lastActivityTime = Date.now();
    };

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach((event) => {
      window.addEventListener(event, onUserActivity, { passive: true });
    });

    // Verificación inicial inmediata
    checkSession();

    // Heartbeat periódico cada 10 segundos
    const heartbeatInterval = setInterval(checkSession, 10000);

    // Detección al reactivar pestaña o desbloquear equipo
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

  // Si la sesión expiró, desmontar completamente la interfaz protegida para no mostrar datos
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

  return <>{children}</>;
}
