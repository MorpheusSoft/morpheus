import Link from 'next/link';
import { cookies } from 'next/headers';

export default async function AppSwitcher() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  const isLoggedIn = !!token;

  const modules = [
    {
      id: "core",
      title: "Neo Core",
      description: "Centro de Mando, Gestión de Accesos, Oráculo AI y Estructura Organizativa.",
      path: "/dashboard",
      icon: "M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
      color: "from-indigo-600 to-purple-600",
      bgBase: "bg-indigo-50",
      iconColor: "text-indigo-600",
      active: true,
    },
    {
      id: "purchases",
      title: "Neo Compras",
      description: "Ordenes directas, maestro de proveedores y asistente mágico predictivo.",
      path: "http://localhost:4002",
      icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
      color: "from-emerald-500 to-teal-600",
      bgBase: "bg-emerald-50",
      iconColor: "text-emerald-600",
      active: true,
    },
    {
      id: "wms",
      title: "Neo Logística / WMS",
      description: "Recepción, ubicaciones físicas, despachos y control de lotes.",
      path: "http://localhost:4003",
      icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
      color: "from-purple-500 to-fuchsia-600",
      bgBase: "bg-purple-50",
      iconColor: "text-purple-600",
      active: true,
    },
    {
      id: "inventory",
      title: "Neo Inventario",
      description: "Catálogo maestro, matriz de variantes, códigos de barra y precios.",
      path: "http://localhost:4001",
      icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
      color: "from-blue-500 to-sky-600",
      bgBase: "bg-blue-50",
      iconColor: "text-blue-600",
      active: true,
    }
  ];

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-6 sm:p-12 relative overflow-hidden bg-slate-50">
      {/* Decorative background blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-400 rounded-full mix-blend-multiply filter blur-[100px] opacity-30 animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-400 rounded-full mix-blend-multiply filter blur-[100px] opacity-30 animate-pulse" style={{ animationDelay: '2s' }}></div>

      <div className="w-full max-w-6xl z-10 animate-fade-in-up">
        
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center p-4 bg-white rounded-3xl shadow-xl shadow-indigo-100 mb-6 border border-slate-100">
            <svg className="w-10 h-10 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight mb-4">
            Bienvenido a <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">Neo ERP</span>
          </h1>
          <p className="text-lg text-slate-500 font-medium max-w-2xl mx-auto">
            El ecosistema integrado para tu empresa. Selecciona un módulo para acceder al entorno de gestión unificado.
          </p>
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {modules.map((mod) => {
            const finalPath = isLoggedIn ? mod.path : `/login?callbackUrl=${encodeURIComponent(mod.path)}`;
            return (
              <div key={mod.id} className="relative group">
                <div className={`absolute -inset-0.5 bg-gradient-to-r ${mod.color} rounded-[2rem] opacity-0 group-hover:opacity-100 transition duration-500 blur-sm`}></div>
                <Link 
                  href={finalPath}
                  className={`flex flex-col h-full relative glass-card p-8 rounded-[2rem] overflow-hidden ${mod.active ? 'cursor-pointer bg-white' : 'cursor-not-allowed grayscale bg-slate-50'}`}
                >
                  {/* Status Badge */}
                  {!mod.active && (
                     <span className="absolute top-4 right-4 bg-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-widest py-1 px-3 rounded-full">Próximamente</span>
                  )}
                  {mod.active && (
                     <span className="absolute top-4 right-4 bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-black uppercase tracking-widest py-1 px-3 rounded-full">Activo</span>
                  )}

                  <div className={`w-16 h-16 rounded-2xl ${mod.bgBase} flex items-center justify-center mb-6 shadow-inner ring-1 ring-black/5`}>
                    <svg className={`w-8 h-8 ${mod.iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={mod.icon} />
                    </svg>
                  </div>
                  
                  <h3 className="text-xl font-bold text-slate-800 mb-3">{mod.title}</h3>
                  <p className="text-slate-500 text-sm font-medium leading-relaxed flex-grow">
                    {mod.description}
                  </p>

                  <div className="mt-8 flex items-center text-sm font-bold text-slate-400 group-hover:text-indigo-600 transition-colors">
                    {mod.active ? 'Ingresar al módulo' : 'En construcción'}
                    <svg className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="mt-20 text-center">
           <p className="text-slate-400 text-sm font-medium">
             Neo ERP Architecture v2.0 • Sistema Distribuido Multi-Zonas
           </p>
        </div>

      </div>
    </div>
  );
}
