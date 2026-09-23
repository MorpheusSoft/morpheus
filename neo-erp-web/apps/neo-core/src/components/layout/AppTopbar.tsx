'use client';
import { AppSwitcher } from './AppSwitcher';
import { useRouter } from 'next/navigation';
import { logoutAction } from '@/app/actions/auth';
import { useSidebar } from '@/context/SidebarContext';

export function AppTopbar() {
  const router = useRouter();
  const { toggleSidebar } = useSidebar();

  const handleLogout = async () => {
    await logoutAction();
  };

  return (
    <header className="h-[64px] bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10">
      
      {/* Left side: hamburger menu trigger & title */}
      <div className="flex items-center gap-3">
        <button 
          onClick={toggleSidebar}
          className="p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors flex items-center justify-center cursor-pointer"
          title="Alternar menú lateral"
          type="button"
        >
          <i className="pi pi-bars text-lg"></i>
        </button>
        <h2 className="text-base sm:text-xl font-bold text-gray-800 tracking-tight truncate">Centro de Operaciones</h2>
      </div>

      {/* Right side icons */}
      <div className="flex items-center gap-4">
        {/* Global App Switcher */}
        <AppSwitcher />

        {/* Divider */}
        <div className="w-[1px] h-8 bg-gray-200 mx-1"></div>

        {/* Logout Button */}
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
