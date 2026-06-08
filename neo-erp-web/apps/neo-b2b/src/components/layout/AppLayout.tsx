'use client';
import React from 'react';
import { usePathname } from 'next/navigation';
import api from '@/lib/api';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const isRegisterPage = pathname.includes('/register');

  const [customerInfo, setCustomerInfo] = React.useState<any>(null);

  React.useEffect(() => {
    if (!isRegisterPage) {
      api.get('/users/me')
        .then(res => {
          if (res.data) {
            setCustomerInfo(res.data);
          }
        })
        .catch(err => {
          console.error("Error cargando perfil del cliente: ", err);
        });
    }
  }, [isRegisterPage]);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      const isProd = window.location.hostname.includes('.morpheussoft.net');
      const domain = isProd ? 'domain=.morpheussoft.net;' : '';
      document.cookie = `access_token=; Max-Age=0; path=/; ${domain}`;
      
      const loginUrl = isProd 
        ? 'http://hub.qa.morpheussoft.net/login' 
        : 'http://localhost:4000/login';
        
      window.location.href = loginUrl;
    }
  };

  if (isRegisterPage) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        {children}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-blue-200">
      {/* Premium Top Navigation */}
      <header className="sticky top-0 z-50 bg-[#0f172a] border-b border-[#1e293b] text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Logo and Branding */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center border border-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.4)]">
                <i className="pi pi-shopping-bag text-lg text-white"></i>
              </div>
              <div className="flex flex-col">
                <span className="text-md font-black tracking-widest leading-none">MORPHEUS B2B</span>
                <span className="text-[10px] text-slate-400 font-medium tracking-wider mt-0.5 uppercase">Wholesale Store</span>
              </div>
            </div>

            {/* Profile & Controls */}
            {customerInfo && (
              <div className="flex items-center gap-4">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-sm font-semibold text-slate-100 truncate max-w-[200px]">
                    {customerInfo.full_name || 'Mayorista'}
                  </span>
                  <span className="text-xs text-slate-400 font-medium font-mono">
                    {customerInfo.email}
                  </span>
                </div>

                <div className="h-8 w-px bg-slate-800"></div>

                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all duration-200 border border-slate-700"
                >
                  <i className="pi pi-sign-out"></i>
                  <span className="hidden sm:inline">Cerrar Sesión</span>
                </button>
              </div>
            )}

          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 md:py-8 overflow-x-hidden animate-fade-in-up">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-400 font-medium">
        <div className="max-w-7xl mx-auto px-4">
          &copy; {new Date().getFullYear()} Morpheus Soft ERP. Todos los derechos reservados.
        </div>
      </footer>
    </div>
  );
}
