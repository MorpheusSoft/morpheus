'use client';
import { AppSwitcher } from './AppSwitcher';
import { useRouter } from 'next/navigation';
import { logoutAction } from '@/app/actions/auth';

export function AppTopbar() {
  const router = useRouter();

  const handleLogout = async () => {
    await logoutAction();
  };

  return (
    <div className="h-[64px] bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-10">
      
      {/* Left side spacer or mobile menu trigger */}
      <div className="flex items-center gap-4">
         <h2 className="text-xl font-bold text-gray-800 tracking-tight hidden sm:block">Centro de Operaciones</h2>
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
          className="w-10 h-10 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors duration-200"
          title="Cerrar Sesión"
        >
          <i className="pi pi-power-off text-lg"></i>
        </button>

      </div>
    </div>
  );
}
