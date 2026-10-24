'use client';
import { AppSwitcher } from './AppSwitcher';
import { useSidebar } from '@/context/SidebarContext';
import { clearAuthCookies, getLogoutUrl } from '@/lib/domain';

export function AppTopbar() {
  const { toggleSidebar } = useSidebar();

  const handleLogout = () => {
    clearAuthCookies();
    window.location.href = getLogoutUrl();
  };

  return (
    <header className="h-16 bg-white/70 backdrop-blur-xl border-b border-gray-200/50 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10 shadow-sm transition-all duration-300">
      
      {/* Left side: toggle button & module name */}
      <div className="flex items-center gap-3">
        <button 
          onClick={toggleSidebar}
          className="p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors flex items-center justify-center cursor-pointer"
          title="Alternar menú lateral"
          type="button"
        >
          <i className="pi pi-bars text-lg"></i>
        </button>
        <h2 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight hidden sm:block">Control de Inventario</h2>
      </div>

      {/* Right side icons */}
      <div className="flex items-center gap-3 ml-auto">
        <AppSwitcher />
        <div className="w-[1px] h-8 bg-gray-200 mx-1"></div>
        <button 
          onClick={handleLogout}
          className="w-10 h-10 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors duration-200 cursor-pointer"
          title="Cerrar Sesión"
          type="button"
        >
          <i className="pi pi-power-off text-lg"></i>
        </button>
      </div>
    </header>
  );
}
