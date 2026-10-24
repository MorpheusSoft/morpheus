'use client';
import { useState, useRef, useEffect } from 'react';
import { resolveDomain, type DomainConfig } from '@/lib/domain';
import { canAccessModule, canReadFeature } from '@/lib/rbac';

export function AppSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userLoaded, setUserLoaded] = useState(false);

  const [domainConfig, setDomainConfig] = useState<DomainConfig>(() => resolveDomain());

  useEffect(() => {
    setDomainConfig(resolveDomain());
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    import('@/lib/api').then(({ default: api }) => {
      api.get('/users/me')
        .then(res => {
          if (res.data) {
            setCurrentUser(res.data);
          }
          setUserLoaded(true);
        })
        .catch(() => {
          setUserLoaded(true);
        });
    });

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const allApps = [
    { name: "Neo Core", rbacKey: "neo_core", icon: "pi pi-desktop", color: "text-indigo-600", bg: "bg-indigo-50", href: domainConfig.apps.core, disabled: false },
    { name: "Neo Inventory", rbacKey: "neo_inventory", icon: "pi pi-box", color: "text-blue-600", bg: "bg-blue-50", href: domainConfig.apps.inventory, disabled: false },
    { name: "Neo Purchases", rbacKey: "neo_purchases", icon: "pi pi-shopping-cart", color: "text-emerald-600", bg: "bg-emerald-50", href: domainConfig.apps.purchases, disabled: false },
    { name: "Neo WMS", rbacKey: "neo_wms", icon: "pi pi-truck", color: "text-purple-600", bg: "bg-purple-50", href: domainConfig.apps.wms, disabled: false },
    { name: "Neo Pricing", rbacKey: "neo_pricing", icon: "pi pi-percentage", color: "text-rose-600", bg: "bg-rose-50", href: domainConfig.apps.pricing, disabled: false },
    { name: "Neo Producción", rbacKey: "neo_production", icon: "pi pi-cog", color: "text-orange-600", bg: "bg-orange-50", href: domainConfig.apps.production, disabled: false },
    { name: "Catálogo B2B", rbacKey: "neo_b2b", icon: "pi pi-globe", color: "text-teal-600", bg: "bg-teal-50", href: domainConfig.apps.b2b, disabled: false },
  ];

  const allExtraApps = [
    { name: "Kiosco (Habladores)", rbacKey: "neo_pricing", featureKey: "pricing_kiosk", icon: "pi pi-tablet", color: "text-violet-600", bg: "bg-violet-50", href: domainConfig.apps.kiosco, disabled: false },
    { name: "Consultor Móvil", rbacKey: "neo_pricing", featureKey: "pricing_kiosk", icon: "pi pi-mobile", color: "text-indigo-600", bg: "bg-indigo-50", href: domainConfig.apps.consultor, disabled: false },
  ];

  const apps = userLoaded && currentUser
    ? allApps.filter(app => canAccessModule(currentUser, app.rbacKey))
    : allApps;

  const extraApps = userLoaded && currentUser
    ? allExtraApps.filter(app => canReadFeature(currentUser, app.rbacKey, app.featureKey) || canAccessModule(currentUser, app.rbacKey))
    : allExtraApps;

  const userName = currentUser?.full_name || currentUser?.email || 'Sesión Activa';
  const userRole = currentUser?.is_superuser
    ? 'Superusuario Global'
    : (currentUser?.active_role?.name || currentUser?.roles?.[0]?.name || 'Personal Operativo');
  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p: string) => p[0])
    .join('')
    .toUpperCase() || 'NE';

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`relative w-10 h-10 flex items-center justify-center rounded-full transition-all duration-200 active:scale-95 hover:bg-gray-800 ${isOpen ? 'bg-gray-800 text-white' : 'text-gray-400'}`}
        title="Aplicaciones de Neo ERP"
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
        <div className="absolute right-0 mt-3 w-80 max-w-[calc(100vw-2rem)] bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-gray-200 z-50 origin-top-right overflow-hidden p-4">
          <div className="flex items-center justify-between px-2 mb-4">
             <h3 className="font-bold text-slate-800 text-lg">Módulos Neo</h3>
             <a
               href={domainConfig.hubUrl}
               className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
             >
               <i className="pi pi-th-large text-[10px]"></i> Hub Central
             </a>
          </div>

          {apps.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              No tienes módulos asignados a tu rol.
            </div>
          ) : (
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
          )}

          {extraApps.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
               <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">
                 Servicios Auxiliares
               </h4>
               <div className="grid grid-cols-3 gap-2">
                 {extraApps.map((app, idx) => (
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
            </div>
          )}
          
          <div className="mt-4 pt-3 border-t border-gray-100">
             <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-3 border border-slate-100 transition-colors relative overflow-hidden">
                <div className="absolute top-0 right-0 h-full w-2 bg-gradient-to-b from-blue-400 to-indigo-500"></div>
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center shadow-inner text-white font-bold text-xs ring-2 ring-white shrink-0">
                  {initials}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold text-slate-800 truncate">{userName}</span>
                  <span className="text-[10px] text-green-600 font-semibold truncate">• {userRole}</span>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
