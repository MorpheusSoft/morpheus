'use client';

import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppTopbar } from '@/components/layout/AppTopbar';
import { SessionGuard } from '@/components/auth/SessionGuard';
import { SidebarProvider, useSidebar } from '@/context/SidebarContext';

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { isMobileOpen, closeMobile } = useSidebar();

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans relative">
      {/* Backdrop para Drawer Móvil / Tablet */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar Fijo / Colapsable */}
      <AppSidebar />

      {/* Contenedor Principal */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar Fija */}
        <AppTopbar />

        {/* Espacio para contenido (con scroll propio) */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionGuard>
      <SidebarProvider>
        <DashboardLayoutContent>{children}</DashboardLayoutContent>
      </SidebarProvider>
    </SessionGuard>
  );
}
