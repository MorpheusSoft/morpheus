'use client';
import { AppSwitcher } from './AppSwitcher';
import { useSidebar } from '@/context/SidebarContext';

export function AppTopbar() {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="h-16 bg-white/70 backdrop-blur-xl border-b border-gray-200/50 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10 shadow-sm transition-all duration-300">
      <div className="flex items-center gap-3">
        <button 
          onClick={toggleSidebar}
          className="p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors flex items-center justify-center cursor-pointer"
          title="Alternar menú lateral"
          type="button"
        >
          <i className="pi pi-bars text-lg"></i>
        </button>
        <div className="hidden sm:flex items-center gap-2.5">
          <h2 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight">
            Producción y Transformación
          </h2>
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-sm">
            Fase 3 Activa
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <AppSwitcher />
        <button 
          className="relative w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-orange-50 hover:text-orange-600 rounded-full transition-all duration-200 active:scale-95 cursor-pointer"
          title="Notificaciones de Planta"
          type="button"
        >
          <i className="pi pi-bell text-xl"></i>
          <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-orange-500 border-2 border-white rounded-full animate-pulse"></span>
        </button>
        <button 
          className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-orange-50 hover:text-orange-600 rounded-full transition-all duration-200 active:scale-95 cursor-pointer"
          title="Configuración de Planta"
          type="button"
        >
          <i className="pi pi-cog text-xl transform hover:rotate-90 transition-transform duration-500"></i>
        </button>
      </div>
    </header>
  );
}
