'use client';
import React, { Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

function AppSidebarContent() {
  const [userName, setUserName] = React.useState('Cargando...');
  const [userRole, setUserRole] = React.useState('Verificando...');
  const [userInitials, setUserInitials] = React.useState('--');
  const [isOperator, setIsOperator] = React.useState(false);

  React.useEffect(() => {
      import('@/lib/api').then(({ default: api }) => {
          api.get('/users/me')
              .then(res => {
                  if (res.data && res.data.full_name) {
                      const nameParts = res.data.full_name.split(' ');
                      const initials = nameParts.length > 1 ? nameParts[0][0] + nameParts[1][0] : nameParts[0].substring(0, 2);
                      setUserName(res.data.full_name);
                      setUserInitials(initials.toUpperCase());
                      
                      const userRoles = res.data.roles || [];
                      if (userRoles.length > 0) {
                          setUserRole(userRoles[0].name);
                      } else {
                          setUserRole("Staff");
                      }

                      const isOp = userRoles.some((r: any) => {
                          const name = r.name.toLowerCase();
                          return name.includes('operador') || name.includes('operator') || name.includes('cajero');
                      });
                      setIsOperator(isOp);
                  }
              })
              .catch(err => console.error("Error cargando usuario: ", err));
      });
  }, []);

  const pathname = usePathname() || '';

  const analyticsItems = [
    { label: 'Análisis y Métricas', icon: 'pi pi-chart-pie', href: '/' },
    { label: 'Reportes de Precios', icon: 'pi pi-file', href: '/reportes' },
    { label: 'Ventas por Tienda', icon: 'pi pi-chart-line', href: '/reportes/ventas-tienda' },
    { label: 'Asistente IA', icon: 'pi pi-sparkles', href: '/asistente-ia' },
  ];

  const pricingItems = [
    { label: 'Actualizar Costos', icon: 'pi pi-percentage', href: '/costos' },
    { label: 'Actualizar Precios', icon: 'pi pi-tags', href: '/precios' },
    { label: 'Planificar Ofertas', icon: 'pi pi-calendar-plus', href: '/precios/ofertas' },
  ];

  const storeItems = [
    { label: 'Consulta Productos', icon: 'pi pi-search', href: '/productos' },
    { label: 'Impresión Habladores', icon: 'pi pi-print', href: '/habladores' },
    { label: 'Modo Kiosco', icon: 'pi pi-tablet', href: '/kiosco' },
  ];

  const isActivePath = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href === '/reportes') return pathname === '/reportes';
    if (href === '/precios') return pathname.startsWith('/precios') && pathname !== '/precios/ofertas';
    return pathname === href || (pathname.startsWith(href) && href !== '/');
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
                    <div className="absolute left-0 top-0 h-full w-[4px] bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)] z-20"></div>
                    <div className="absolute left-0 top-0 h-full w-[96px] bg-gradient-to-r from-rose-500/25 to-transparent z-10"></div>
                  </>
                 )}
                 <i className={`${item.icon} text-[18px] transition-transform duration-300 z-30 ${isActive ? 'text-rose-400 scale-110 drop-shadow-sm' : 'text-slate-500 group-hover:text-slate-400 group-hover:scale-110'}`}></i>
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
      {/* Header */}
      <div className="h-[64px] flex items-center px-[24px] border-b border-[#1e293b] bg-[#0f172a] mb-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/30 mr-[12px]">
           <i className="pi pi-percentage text-white text-sm"></i>
        </div>
        <div className="flex items-baseline gap-[6px] whitespace-nowrap">
          <span className="text-[18px] font-extrabold text-white tracking-widest">NEO</span>
          <span className="font-medium text-rose-400 text-[13px] tracking-wide">PRICING</span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-[16px] custom-scrollbar">
        {isOperator ? (
          renderNavGroup("Módulo de Tienda", [{ label: 'Impresión Habladores', icon: 'pi pi-print', href: '/habladores' }])
        ) : (
          <>
            {renderNavGroup("Mando y Análisis", analyticsItems)}
            {renderNavGroup("Gestión de Costos y Precios", pricingItems)}
            {renderNavGroup("Operaciones en Tienda", storeItems)}
          </>
        )}
      </div>

      {/* User Footer */}
      <div className="p-[16px] border-t border-[#1e293b] bg-[#0f172a]">
        <div className="rounded-xl p-[8px] flex items-center gap-[12px] bg-[#1e293b]/50 border border-[#1e293b] hover:bg-[#1e293b] transition-colors cursor-pointer">
          <div className="w-[36px] h-[36px] rounded-full bg-rose-950 border border-rose-500/50 flex items-center justify-center text-rose-300 font-bold text-[14px] shadow-inner shadow-rose-500/20">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-white truncate">{userName}</p>
            <p className="text-[11px] font-medium text-rose-400 truncate flex items-center gap-1">
               <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
               {userRole}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <Suspense fallback={<div className="w-[256px] h-screen bg-[#0f172a] border-r border-[#1e293b]"></div>}>
      <AppSidebarContent />
    </Suspense>
  );
}
