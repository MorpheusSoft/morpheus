'use client';
import React, { Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from '@/context/SidebarContext';
import { canReadFeature } from '@/lib/rbac';

interface NavItem {
  label: string;
  icon: string;
  href: string;
  badge?: string;
  featureKey?: string | string[];
}

function AppSidebarContent() {
  const { isCollapsed, isMobileOpen, closeMobile } = useSidebar();

  const [userName, setUserName] = React.useState('Cargando...');
  const [userRole, setUserRole] = React.useState('Verificando...');
  const [userInitials, setUserInitials] = React.useState('--');
  const [currentUser, setCurrentUser] = React.useState<any>(null);

  React.useEffect(() => {
    import('@/lib/api').then(({ default: api }) => {
      api.get('/users/me')
        .then(res => {
          if (res.data) {
            setCurrentUser(res.data);
            if (res.data.full_name) {
              const nameParts = res.data.full_name.split(' ');
              const initials = nameParts.length > 1 ? nameParts[0][0] + nameParts[1][0] : nameParts[0].substring(0, 2);
              setUserName(res.data.full_name);
              setUserInitials(initials.toUpperCase());
            }
            if (res.data.is_superuser) {
              setUserRole("Superusuario Global");
            } else if (res.data.active_role) {
              setUserRole(res.data.active_role.name);
            } else if (res.data.roles?.length > 0) {
              setUserRole(res.data.roles[0].name);
            } else {
              setUserRole("Jefe de Planta");
            }
          }
        })
        .catch(() => {
          setUserName("Operador Planta");
          setUserRole("Neo Producción");
          setUserInitials("NP");
        });
    });
  }, []);

  const pathname = usePathname() || '';

  const mandoItems: NavItem[] = [
    { label: 'Visión General Planta', icon: 'pi pi-chart-pie', href: '/' },
  ];

  const engineeringItems: NavItem[] = [
    { label: 'Centros de Trabajo', icon: 'pi pi-sliders-h', href: '/work-centers', featureKey: 'work_centers' },
    { label: 'Recetas y Escandallos', icon: 'pi pi-book', href: '/recipes', featureKey: 'recipes' },
    { label: 'Nueva Fórmula / Simulador', icon: 'pi pi-calculator', href: '/recipes/new', featureKey: 'recipes' },
  ];

  const roadmapItems: NavItem[] = [
    { label: 'Órdenes de Producción', icon: 'pi pi-cog', href: '/orders', featureKey: 'production_orders' },
    { label: 'Sala de Desposte', icon: 'pi pi-percentage', href: '/butchery', badge: 'Fase 3', featureKey: 'butchery' },
  ];

  const isActivePath = (href: string) => {
    if (href === '/') return pathname === '/' || pathname === '/produccion';
    if (href === '/recipes') return pathname === '/recipes';
    return pathname === href || (pathname.startsWith(href) && href !== '/');
  };

  const renderNavGroup = (title: string, items: NavItem[]) => {
    const visibleItems = currentUser
      ? items.filter(item => !item.featureKey || canReadFeature(currentUser, 'neo_production', item.featureKey))
      : items;

    if (visibleItems.length === 0) return null;

    return (
      <div className="mb-6">
        <div className={`text-[11px] font-bold text-slate-500 tracking-widest uppercase mb-[10px] px-[8px] transition-opacity duration-200 ${isCollapsed ? 'lg:hidden' : ''}`}>
          {title}
        </div>
        {isCollapsed && (
          <div className="hidden lg:block w-8 h-[1px] bg-slate-800 mx-auto my-3" />
        )}
        <ul className="flex flex-col gap-[4px]">
          {visibleItems.map((item, idx) => {
            const isActive = isActivePath(item.href);
            return (
              <li key={`${item.href}-${idx}`}>
                <Link 
                  href={item.href} 
                  onClick={closeMobile}
                  title={item.label}
                  className={`flex items-center gap-[12px] py-[10px] rounded-lg transition-all duration-300 group relative overflow-hidden ${
                    isCollapsed ? 'lg:justify-center lg:px-0 px-[12px]' : 'px-[12px]'
                  } ${
                    isActive ? 'bg-[#1e293b]/60 text-white font-medium' : 'text-slate-400 hover:bg-[#1e293b]/40 hover:text-slate-200'
                  }`}
                >
                  {isActive && (
                    <>
                      <div className="absolute left-0 top-0 h-full w-[4px] bg-gradient-to-b from-orange-500 to-red-600 shadow-[0_0_10px_rgba(249,115,22,0.5)] z-20"></div>
                      <div className="absolute left-0 top-0 h-full w-[96px] bg-gradient-to-r from-orange-500/25 to-transparent z-10"></div>
                    </>
                  )}
                  <i className={`${item.icon} text-[18px] transition-transform duration-300 z-30 shrink-0 ${
                    isActive ? 'text-orange-400 scale-110 drop-shadow-sm' : 'text-slate-500 group-hover:text-slate-400 group-hover:scale-110'
                  }`}></i>
                  <span className={`text-[13px] z-30 truncate flex-1 ${isCollapsed ? 'lg:hidden' : ''}`}>
                    {item.label}
                  </span>
                  {item.badge && !isCollapsed && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 z-30">
                      {item.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <aside 
      className={`fixed inset-y-0 left-0 z-50 h-screen bg-[#0f172a] border-r border-[#1e293b] text-slate-300 flex flex-col transition-all duration-300 w-[256px] ${
        isMobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
      } lg:translate-x-0 lg:sticky lg:top-0 lg:z-20 ${
        isCollapsed ? 'lg:w-[72px]' : 'lg:w-[256px]'
      } flex-shrink-0 select-none`}
      style={{ boxSizing: 'border-box' }}
    >
      {/* Header */}
      <div className={`h-[64px] flex items-center border-b border-[#1e293b] bg-[#0f172a] mb-4 transition-all duration-300 ${
        isCollapsed ? 'lg:justify-center lg:px-0 px-6' : 'px-6'
      }`}>
        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30 ${
          isCollapsed ? 'lg:mr-0 mr-3' : 'mr-3'
        } shrink-0`}>
          <i className="pi pi-cog text-white text-sm"></i>
        </div>
        <div className={`flex items-baseline gap-[6px] whitespace-nowrap overflow-hidden ${
          isCollapsed ? 'lg:hidden' : ''
        }`}>
          <span className="text-[18px] font-extrabold text-white tracking-widest">NEO</span>
          <span className="font-bold text-orange-400 text-[12px] tracking-wide uppercase">PRODUCCIÓN</span>
        </div>
      </div>

      {/* Navigation */}
      <div className={`flex-1 overflow-y-auto custom-scrollbar transition-all duration-300 ${
        isCollapsed ? 'lg:px-2 px-[16px]' : 'px-[16px]'
      }`}>
        {renderNavGroup("Mando y Análisis", mandoItems)}
        {renderNavGroup("Ingeniería y Fórmulas (Fase 1)", engineeringItems)}
        {renderNavGroup("Operaciones de Planta", roadmapItems)}
      </div>

      {/* User Footer */}
      <div className={`border-t border-[#1e293b] bg-[#0f172a] transition-all duration-300 ${
        isCollapsed ? 'lg:p-[10px] p-[16px]' : 'p-[16px]'
      }`}>
        <div 
          className={`rounded-xl p-[8px] flex items-center bg-[#1e293b]/50 border border-[#1e293b] hover:bg-[#1e293b] transition-colors cursor-pointer ${
            isCollapsed ? 'lg:justify-center lg:gap-0 gap-[12px]' : 'gap-[12px]'
          }`}
          title={isCollapsed ? `${userName} (${userRole})` : undefined}
        >
          <div className="w-[36px] h-[36px] rounded-full bg-orange-950 border border-orange-500/50 flex items-center justify-center text-orange-300 font-bold text-[14px] shadow-inner shadow-orange-500/20 shrink-0">
            {userInitials}
          </div>
          <div className={`flex-1 min-w-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
            <p className="text-[14px] font-semibold text-white truncate">{userName}</p>
            <p className="text-[11px] font-medium text-orange-400 truncate flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse"></span>
              {userRole}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function AppSidebar() {
  return (
    <Suspense fallback={<aside className="w-[256px] h-screen bg-[#0f172a] border-r border-[#1e293b] flex-shrink-0" />}>
      <AppSidebarContent />
    </Suspense>
  );
}
