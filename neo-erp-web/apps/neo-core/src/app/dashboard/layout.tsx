import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppTopbar } from '@/components/layout/AppTopbar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar Fijo */}
      <AppSidebar />
      
      {/* Contenedor Principal */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar Fija */}
        <AppTopbar />
        
        {/* Espacio para contenido (con scroll propio) */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
