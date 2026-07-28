'use client';
import { usePathname } from 'next/navigation';
import { AppSidebar } from './AppSidebar';
import { AppTopbar } from './AppTopbar';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicRoute = pathname?.includes('/public/');

  if (isPublicRoute) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-blue-200">
        <main className="min-h-screen overflow-x-hidden animate-fade-in">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-blue-200">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        <AppTopbar />
        <main className="flex-1 p-3 md:p-5 lg:p-6 overflow-x-hidden animate-fade-in-up">
          {children}
        </main>
      </div>
    </div>
  );
}
