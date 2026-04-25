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
        
        {/* IA Oracle Button */}
        <button 
          className="group relative flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-500/10 transition-all duration-300 active:scale-95"
          title="Invocar a Oráculo AI"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 opacity-0 group-hover:opacity-10 rounded-xl transition-opacity duration-300"></div>
          <span className="font-semibold text-sm text-indigo-900 group-hover:animate-pulse">Oráculo</span>
        </button>

        {/* Divider */}
        <div className="w-[1px] h-8 bg-gray-200 mx-1"></div>

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
