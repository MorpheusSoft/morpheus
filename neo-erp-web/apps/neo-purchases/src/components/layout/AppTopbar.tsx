'use client';
import { InputText } from 'primereact/inputtext';
import { AppSwitcher } from './AppSwitcher';

export function AppTopbar() {
  return (
    <header className="h-16 bg-white/70 backdrop-blur-xl border-b border-gray-200/50 flex items-center justify-between px-6 sticky top-0 z-10 shadow-sm transition-all duration-300">


      <div className="flex items-center gap-3 ml-auto">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('toggle-digital-copilot'))}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100/80 border border-emerald-200/70 text-xs font-bold transition-all duration-200 shadow-2xs hover:shadow-xs group active:scale-95 cursor-pointer"
          title="Abrir Asistente Clara (Alt + C)"
        >
          <div className="relative flex items-center justify-center">
            <i className="pi pi-sparkles text-emerald-600 text-xs group-hover:rotate-12 transition-transform"></i>
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
          </div>
          <span className="tracking-wide">Clara Copilot</span>
        </button>

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
