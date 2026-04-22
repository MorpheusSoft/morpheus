'use client';
import { InputText } from 'primereact/inputtext';
import { AppSwitcher } from './AppSwitcher';

export function AppTopbar() {
  return (
    <header className="h-16 bg-white/70 backdrop-blur-xl border-b border-gray-200/50 flex items-center justify-between px-6 sticky top-0 z-10 shadow-sm transition-all duration-300">


      <div className="flex items-center gap-3 ml-auto">
        <AppSwitcher />
        <button className="relative w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded-full transition-all duration-200 active:scale-95">
          <i className="pi pi-bell text-xl"></i>
          <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-rose-500 border-2 border-white rounded-full animate-pulse"></span>
        </button>
        <button className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded-full transition-all duration-200 active:scale-95">
          <i className="pi pi-cog text-xl transform hover:rotate-90 transition-transform duration-500"></i>
        </button>
      </div>
    </header>
  );
}
