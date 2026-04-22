'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

export function AppSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const apps = [
    { name: "Inventario", icon: "pi pi-box", color: "text-blue-600", bg: "bg-blue-50", href: "/inventario/products" },
    { name: "Compras", icon: "pi pi-shopping-cart", color: "text-emerald-600", bg: "bg-emerald-50", href: "http://localhost:4000/compras/" },
    { name: "WMS", icon: "pi pi-truck", color: "text-purple-600", bg: "bg-purple-50", href: "#", disabled: true },
    { name: "Nómina", icon: "pi pi-users", color: "text-rose-600", bg: "bg-rose-50", href: "http://localhost:3002" },
    { name: "Ventas", icon: "pi pi-dollar", color: "text-amber-600", bg: "bg-amber-50", href: "#", disabled: true },
    { name: "Reportes", icon: "pi pi-chart-bar", color: "text-indigo-600", bg: "bg-indigo-50", href: "#", disabled: true },
  ];

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`relative w-10 h-10 flex items-center justify-center rounded-full transition-all duration-200 active:scale-95 hover:bg-gray-100 ${isOpen ? 'bg-gray-100 text-gray-800' : 'text-gray-600'}`}
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
        <div className="absolute right-0 mt-3 w-80 bg-white/90 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/50 z-50 animate-fade-in-up origin-top-right overflow-hidden p-4">
          <div className="flex items-center justify-between px-2 mb-4">
             <h3 className="font-bold text-slate-800 text-lg">Módulos Neo</h3>
             <a href="http://localhost:4000/" className="text-indigo-600 text-sm font-semibold hover:underline bg-indigo-50 px-3 py-1 rounded-lg">Hub Principal</a>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {apps.map((app, idx) => (
              app.disabled ? (
                <div key={idx} className="flex flex-col items-center justify-center p-3 rounded-2xl cursor-not-allowed opacity-50 grayscale hover:bg-slate-50 transition-colors" title="Próximamente">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${app.bg} mb-2 shadow-inner ring-1 ring-black/5`}>
                    <i className={`${app.icon} text-xl ${app.color}`}></i>
                  </div>
                  <span className="text-xs font-semibold text-slate-600 text-center">{app.name}</span>
                </div>
              ) : (
                <a key={idx} href={app.href} className="group flex flex-col items-center justify-center p-3 rounded-2xl hover:bg-slate-50 hover:shadow-sm transition-all duration-200 cursor-pointer border border-transparent hover:border-slate-100">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${app.bg} mb-2 shadow-inner ring-1 ring-black/5 group-hover:scale-110 transition-transform`}>
                    <i className={`${app.icon} text-xl ${app.color}`}></i>
                  </div>
                  <span className="text-xs font-semibold text-slate-700 text-center">{app.name}</span>
                </a>
              )
            ))}
          </div>
          
          <div className="mt-4 pt-3 border-t border-slate-100">
             <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-3 border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center shadow-inner text-white font-bold text-xs ring-2 ring-white">
                  AZ
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-800">Almacén Principal</span>
                  <span className="text-[10px] text-slate-500">Sesión Activa</span>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
