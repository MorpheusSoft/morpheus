'use client';
import { useState, useRef, useEffect } from 'react';

export function AppSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [isProd, setIsProd] = useState(false);

  useEffect(() => {
    setIsProd(window.location.hostname.includes('.morpheussoft.net'));
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const apps = [
    { name: "Neo Core", icon: "pi pi-desktop", color: "text-indigo-600", bg: "bg-indigo-50", href: isProd ? "http://hub.qa.morpheussoft.net/dashboard" : "http://localhost:4000/dashboard" },
    { name: "Neo Inventario", icon: "pi pi-box", color: "text-blue-600", bg: "bg-blue-50", href: isProd ? "http://inventario.qa.morpheussoft.net/products" : "http://localhost:4001/products" },
    { name: "Neo Compras", icon: "pi pi-shopping-cart", color: "text-emerald-600", bg: "bg-emerald-50", href: isProd ? "http://compras.qa.morpheussoft.net/" : "http://localhost:4002/" },
    { name: "Neo Logística", icon: "pi pi-truck", color: "text-purple-600", bg: "bg-purple-50", href: isProd ? "http://logistica.qa.morpheussoft.net/" : "http://localhost:4003/" },
    { name: "Ventas", icon: "pi pi-dollar", color: "text-amber-600", bg: "bg-amber-50", href: "#", disabled: true },
    { name: "Reportes", icon: "pi pi-chart-bar", color: "text-slate-600", bg: "bg-slate-50", href: "#", disabled: true },
  ];

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`relative w-10 h-10 flex items-center justify-center rounded-full transition-all duration-200 active:scale-95 hover:bg-gray-800 ${isOpen ? 'bg-gray-800 text-white' : 'text-gray-400'}`}
        title="Aplicaciones de Neo (Hub)"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="4" cy="4" r="2" />
          <circle cx="12" cy="4" r="2" />
          <circle cx="20" cy="4" r="2" />
          <circle cx="4" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="20" cy="12" r="2" />
          <circle cx="4" cy="20" r="2" />
          <circle cx="12" cy="20" r="2" />
          <circle cx="20" cy="20" r="2" />
        </svg>
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute left-0 lg:left-auto lg:right-0 mt-3 w-80 bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-gray-200 z-50 origin-top-left lg:origin-top-right overflow-hidden p-4">
          <div className="flex items-center justify-between px-2 mb-4">
             <h3 className="font-bold text-slate-800 text-lg">Módulos Neo</h3>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {apps.map((app, idx) => (
              app.disabled ? (
                <div key={idx} className="flex flex-col items-center justify-center p-3 rounded-2xl cursor-not-allowed opacity-50 grayscale hover:bg-slate-50 transition-colors" title="Próximamente">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${app.bg} mb-2 shadow-inner ring-1 ring-black/5`}>
                     <span className={`${app.icon} text-xl ${app.color}`}></span>
                  </div>
                  <span className="text-xs font-semibold text-slate-600 text-center">{app.name}</span>
                </div>
              ) : (
                <a key={idx} href={app.href} className="group flex flex-col items-center justify-center p-3 rounded-2xl hover:bg-slate-50 hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all duration-300 cursor-pointer border border-transparent hover:border-slate-100">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${app.bg} mb-2 shadow-inner ring-1 ring-black/5 group-hover:scale-110 transition-transform`}>
                    <span className={`${app.icon} text-xl ${app.color}`}></span>
                  </div>
                  <span className="text-xs font-semibold text-slate-700 text-center">{app.name}</span>
                </a>
              )
            ))}
          </div>
          
          <div className="mt-4 pt-3 border-t border-gray-100">
             <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-3 border border-slate-100 cursor-not-allowed transition-colors relative overflow-hidden">
                <div className="absolute top-0 right-0 h-full w-2 bg-gradient-to-b from-blue-400 to-indigo-500"></div>
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center shadow-inner text-white font-bold text-xs ring-2 ring-white">
                  AD
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-800">Admin General</span>
                  <span className="text-[10px] text-green-600 font-semibold">• Sesión Global</span>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
