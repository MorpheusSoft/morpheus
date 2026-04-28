'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AppSidebar() {

  // Agregar estado para usuario logueado
  const [userName, setUserName] = React.useState('Cargando...');
  const [userRole, setUserRole] = React.useState('Verificando...');
  const [userInitials, setUserInitials] = React.useState('--');

  React.useEffect(() => {
      import('@/lib/api').then(({ default: api }) => {
          api.get('/users/me')
              .then(res => {
                  if (res.data && res.data.full_name) {
                      const nameParts = res.data.full_name.split(' ');
                      const initials = nameParts.length > 1 ? nameParts[0][0] + nameParts[1][0] : nameParts[0].substring(0, 2);
                      setUserName(res.data.full_name);
                      setUserInitials(initials.toUpperCase());
                      if (res.data.active_role) {
                          setUserRole(res.data.active_role.name);
                      } else {
                          setUserRole("Staff");
                      }
                  }
              })
              .catch(err => console.error("Error cargando usuario: ", err));
      });
  }, []);

  const pathname = usePathname() || '';

  const menuItems = [
    { label: 'Dashboard', icon: 'pi pi-home', href: '/' },
    { label: 'Proveedores', icon: 'pi pi-users', href: '/suppliers' },
    { label: 'Órdenes de Compra', icon: 'pi pi-file', href: '/orders' },
    { label: 'Recepción (WMS)', icon: 'pi pi-check-square', href: '/receipts' },
    { label: 'Facturas', icon: 'pi pi-wallet', href: '/invoices' },
  ];

  const coreItems = [
    { label: 'Productos', icon: 'pi pi-box', href: '/products' },
    { label: 'Auditoría de Precios', icon: 'pi pi-bolt', href: '/pricing' },
    { label: 'Categorías', icon: 'pi pi-tags', href: '/categories' },
    { label: 'Perfiles de Compradores', icon: 'pi pi-id-card', href: '/buyers' },
    { label: 'Reglas Logísticas', icon: 'pi pi-cog', href: '#rules' },
  ];

  const isActivePath = (href: string) => {
    return pathname === href || (pathname.startsWith(href) && href !== '/');
  };

  return (
    <div className="w-[256px] h-screen bg-[#0f172a] border-r border-[#1e293b] text-slate-300 flex flex-col transition-all duration-300 z-20 sticky top-0 flex-shrink-0" style={{boxSizing: 'border-box'}}>
      <div className="h-[64px] flex items-center px-[24px] border-b border-[#1e293b] bg-[#0f172a]">
        <i className="pi pi-compass text-[20px] text-emerald-500 mr-[12px]"></i>
        <div className="flex items-baseline gap-[6px] whitespace-nowrap">
          <span className="text-[17.6px] font-bold text-white tracking-widest">NEO</span>
          <span className="font-normal text-slate-400 text-[14px]">Purchases</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-[24px] px-[16px] custom-scrollbar">
        <div className="text-[11px] font-bold text-slate-500 tracking-widest uppercase mb-[16px] px-[8px]">Gestión de Compras</div>
        <ul className="flex flex-col gap-[6px] mb-[32px]">
          {menuItems.map((item) => {
            const isActive = isActivePath(item.href);
            return (
              <li key={item.href}>
                <Link href={item.href} className={`flex items-center gap-[12px] px-[12px] py-[10px] rounded-lg transition-all duration-300 group relative overflow-hidden ${isActive ? 'bg-[#1e293b]/60 text-white font-medium' : 'text-slate-400 hover:bg-[#1e293b]/40 hover:text-slate-200'}`}>
                  {isActive && (
                    <>
                      <div className="absolute left-0 top-0 h-full w-[4px] bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)] z-20"></div>
                      <div className="absolute left-0 top-0 h-full w-[96px] bg-gradient-to-r from-emerald-500/15 to-transparent z-10"></div>
                    </>
                  )}
                  <i className={`${item.icon} text-[18px] transition-transform duration-300 z-30 ${isActive ? 'text-emerald-400 scale-110 drop-shadow-sm' : 'text-slate-500 group-hover:text-slate-400 group-hover:scale-110'}`}></i>
                  <span className="text-[14px] z-30">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="text-[11px] font-bold text-slate-500 tracking-widest uppercase mb-[16px] px-[8px]">Configuración</div>
        <ul className="flex flex-col gap-[6px]">
          {coreItems.map((item) => {
            const isActive = isActivePath(item.href);
            return (
               <li key={item.href}>
                 <Link href={item.href} className={`flex items-center gap-[12px] px-[12px] py-[10px] rounded-lg transition-all duration-300 group relative overflow-hidden ${isActive ? 'bg-[#1e293b]/60 text-white font-medium' : 'text-slate-400 hover:bg-[#1e293b]/40 hover:text-slate-200'}`}>
                   {isActive && (
                    <>
                      <div className="absolute left-0 top-0 h-full w-[4px] bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.5)] z-20"></div>
                      <div className="absolute left-0 top-0 h-full w-[96px] bg-gradient-to-r from-teal-500/15 to-transparent z-10"></div>
                    </>
                   )}
                   <i className={`${item.icon} text-[18px] transition-transform duration-300 z-30 ${isActive ? 'text-teal-400 scale-110 drop-shadow-sm' : 'text-slate-500 group-hover:text-slate-400 group-hover:scale-110'}`}></i>
                   <span className="text-[14px] z-30">{item.label}</span>
                 </Link>
               </li>
            );
          })}
        </ul>
      </div>

      <div className="p-[16px] border-t border-[#1e293b] bg-[#0f172a]">
        <div className="rounded-xl p-[8px] flex items-center gap-[12px] hover:bg-[#1e293b] transition-colors cursor-pointer">
          <div className="w-[36px] h-[36px] rounded-full bg-[#1e293b] border border-slate-700 flex items-center justify-center text-slate-300 font-semibold text-[14px]">
            LZ
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium text-slate-200 truncate">{userName}</p>
            <p className="text-[12px] text-slate-500 truncate">{userRole}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
