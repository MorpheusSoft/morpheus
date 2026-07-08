'use client';
import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AppSidebar } from './AppSidebar';
import { AppTopbar } from './AppTopbar';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = React.useState(true);
  const isPrintPage = pathname === '/habladores/imprimir';

  React.useEffect(() => {
    if (isPrintPage) {
      setCheckingAuth(false);
      return;
    }

    import('@/lib/api').then(({ default: api }) => {
      api.get('/users/me')
        .then(res => {
          if (res.data) {
            const userRoles = res.data.roles || [];
            const isOperator = userRoles.some((r: any) => {
              const name = r.name.toLowerCase();
              return name.includes('operador') || name.includes('operator') || name.includes('cajero');
            });

            if (isOperator) {
              // Cashiers/Operators can only access printing page /habladores
              // and they CANNOT access designer /habladores/plantillas
              const allowedPages = ['/habladores', '/habladores/imprimir', '/habladores/tienda', '/kiosco/consultor'];
              const isAllowed = allowedPages.includes(pathname || '');

              if (!isAllowed) {
                router.push('/habladores/tienda');
                return;
              }
            }
          }
          setCheckingAuth(false);
        })
        .catch(err => {
          console.error("Auth check failed:", err);
          // If auth check fails, don't block render (let middleware handle auth redirects)
          setCheckingAuth(false);
        });
    });
  }, [pathname, isPrintPage, router]);

  if (checkingAuth) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-900 text-white flex-col gap-4 select-none">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest animate-pulse">Verificando permisos de acceso...</p>
      </div>
    );
  }

  if (isPrintPage) {
    return <main className="flex-1 bg-white min-h-screen">{children}</main>;
  }

  const isKioskMode = pathname === '/habladores/tienda' || pathname === '/kiosco/consultor';

  if (isKioskMode) {
    return (
      <div className="flex min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-rose-200">
        <main className="flex-1 p-3 md:p-5 lg:p-6 overflow-x-hidden animate-fade-in-up">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-rose-200">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        <AppTopbar />
        <main className="flex-1 p-3 md:p-5 lg:p-6 overflow-x-hidden animate-fade-in-up">
          {children}
        </main>
      </div>
    </div>
  );
}
