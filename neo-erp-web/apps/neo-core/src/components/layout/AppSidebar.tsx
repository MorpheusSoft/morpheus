'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AppSidebar() {
  const pathname = usePathname() || '';

  const dashboardItems = [
    { label: 'Visión Global', icon: 'pi pi-chart-pie', href: '/dashboard' },
  ];

  const securityItems = [
    { label: 'Usuarios del Sistema', icon: 'pi pi-users', href: '/dashboard/users' },
    { label: 'Roles y Privilegios', icon: 'pi pi-id-card', href: '/dashboard/roles' },
  ];

  const orgItems = [
    { label: 'Empresas Base', icon: 'pi pi-building', href: '/dashboard/companies' },
    { label: 'Sucursales / Sedes', icon: 'pi pi-sitemap', href: '/dashboard/facilities' },
  ];

  const settingsItems = [
    { label: 'Monedas / Divisas', icon: 'pi pi-money-bill', href: '/dashboard/currencies' },
    { label: 'Trabajos en Segundo Plano', icon: 'pi pi-server', href: '/dashboard/jobs' },
  ];

  const isActivePath = (href: string) => {
    return pathname === href;
  };

  const renderNavGroup = (title: string, items: {label: string, icon: string, href: string}[]) => (
    <div className="mb-6">
      <div className="text-[11px] font-bold text-slate-500 tracking-widest uppercase mb-[10px] px-[8px]">
        {title}
      </div>
      <ul className="flex flex-col gap-[4px]">
        {items.map((item) => {
          const isActive = isActivePath(item.href);
          return (
            <li key={item.href}>
               <Link href={item.href} className={`flex items-center gap-[12px] px-[12px] py-[10px] rounded-lg transition-all duration-300 group relative overflow-hidden ${isActive ? 'bg-[#1e293b]/60 text-white font-medium' : 'text-slate-400 hover:bg-[#1e293b]/40 hover:text-slate-200'}`}>
                 {isActive && (
                  <>
                    <div className="absolute left-0 top-0 h-full w-[4px] bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] z-20"></div>
                    <div className="absolute left-0 top-0 h-full w-[96px] bg-gradient-to-r from-indigo-500/25 to-transparent z-10"></div>
                  </>
                 )}
                 <i className={`${item.icon} text-[18px] transition-transform duration-300 z-30 ${isActive ? 'text-indigo-400 scale-110 drop-shadow-sm' : 'text-slate-500 group-hover:text-slate-400 group-hover:scale-110'}`}></i>
                 <span className="text-[14px] z-30">{item.label}</span>
               </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="w-[256px] h-screen bg-[#0f172a] border-r border-[#1e293b] text-slate-300 flex flex-col transition-all duration-300 z-20 sticky top-0 flex-shrink-0" style={{boxSizing: 'border-box'}}>
      <div className="h-[64px] flex items-center px-[24px] border-b border-[#1e293b] bg-[#0f172a] mb-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 mr-[12px]">
           <i className="pi pi-th-large text-white text-sm"></i>
        </div>
        <div className="flex items-baseline gap-[6px] whitespace-nowrap">
          <span className="text-[18px] font-extrabold text-white tracking-widest">NEO</span>
          <span className="font-medium text-indigo-400 text-[13px] tracking-wide">CORE</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-[16px] custom-scrollbar">
        {renderNavGroup("Mando Central", dashboardItems)}
        {renderNavGroup("Estructura", orgItems)}
        {renderNavGroup("Seguridad y Acceso", securityItems)}
        {renderNavGroup("Parámetros Globales", settingsItems)}
      </div>

      <div className="p-[16px] border-t border-[#1e293b] bg-[#0f172a]">
        <div className="rounded-xl p-[8px] flex items-center gap-[12px] bg-[#1e293b]/50 border border-[#1e293b] hover:bg-[#1e293b] transition-colors cursor-pointer">
          <div className="w-[36px] h-[36px] rounded-full bg-indigo-900 border border-indigo-500/50 flex items-center justify-center text-indigo-200 font-bold text-[14px] shadow-inner shadow-indigo-500/20">
            AD
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-white truncate">Administrador</p>
            <p className="text-[11px] font-medium text-emerald-400 truncate flex items-center gap-1">
               <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
               Sesión Activa
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
