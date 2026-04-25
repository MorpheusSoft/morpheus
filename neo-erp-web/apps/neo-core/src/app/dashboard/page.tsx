import { cookies } from "next/headers"

export const metadata = {
  title: "Hub Principal | Neo Core",
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  const stats = [
    { label: "Usuarios Activos", value: "1,204", change: "+12.5%", color: "text-emerald-500", icon: "pi-users" },
    { label: "Sucursales Operativas", value: "32", change: "+2", color: "text-blue-500", icon: "pi-building" },
    { label: "Empresas en Holding", value: "5", change: "Estable", color: "text-indigo-500", icon: "pi-briefcase" },
    { label: "Tareas en Cola (Jobs)", value: "8", change: "-4", color: "text-amber-500", icon: "pi-server" },
  ];

  return (
    <div className="w-full h-full pb-10 fade-in-up">
      <div className="flex flex-col gap-8 max-w-7xl mx-auto">
        
        {/* Encabezado */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
             <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Centro de Mando</h1>
             <p className="text-slate-500 text-sm mt-1">Visión global de configuración y accesos del ecosistema NEO.</p>
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
             <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
             </span>
             Red Segura Cifrada
          </div>
        </div>

        {/* Tarjetas de Métricas (Dummy) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-slate-50 ${stat.color} shadow-inner`}>
                  <i className={`pi ${stat.icon} text-lg`}></i>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-md ${stat.change.startsWith('+') ? 'bg-emerald-50 text-emerald-600' : stat.change.startsWith('-') ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>
                  {stat.change}
                </span>
              </div>
              <div className="flex flex-col">
                <h3 className="text-[28px] font-black text-slate-800 leading-none mb-1">{stat.value}</h3>
                <span className="text-sm font-medium text-slate-500">{stat.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Panel Inferior */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="lg:col-span-2 bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl shadow-indigo-900/20">
             <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl -mr-20 -mt-20"></div>
             <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl -ml-20 -mb-20"></div>
             
             <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                   <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full backdrop-blur-md border border-white/20 mb-6">
                      <i className="pi pi-sparkles text-blue-300 text-xs"></i>
                      <span className="text-xs font-bold tracking-wide text-blue-200">INTRODUCIENDO</span>
                   </div>
                   <h2 className="text-4xl font-extrabold mb-4 tracking-tight leading-tight max-w-lg">Configuración Dinámica Multiempreas</h2>
                   <p className="text-indigo-200 text-base max-w-md leading-relaxed">
                     El Guardián ahora protege todas las rutas. Gestiona los Roles, Usuarios e Inteligencia Artificial (Oráculo) directamente desde el Menú Lateral.
                   </p>
                </div>
                
                <div className="mt-8 flex gap-4">
                   <button className="bg-white text-indigo-950 font-bold px-6 py-3 rounded-xl hover:bg-slate-50 transition-colors shadow-lg">
                      Gestionar Roles
                   </button>
                   <button className="bg-white/10 backdrop-blur-md border border-white/20 text-white font-bold px-6 py-3 rounded-xl hover:bg-white/20 transition-colors">
                      Logs de Acceso
                   </button>
                </div>
             </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col">
             <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                <i className="pi pi-server text-indigo-500"></i>
                Estatus de Nodos Neo
             </h3>
             <ul className="flex-1 flex flex-col gap-4">
                {[
                  { name: "Neo Core", active: true, port: 4000 },
                  { name: "Neo Inventario", active: true, port: 4001 },
                  { name: "Neo Compras", active: true, port: 4002 },
                  { name: "Neo Logística (WMS)", active: true, port: 4003 },
                  { name: "Neo Ventas", active: false, port: null }
                ].map((node, i) => (
                  <li key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                     <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${node.active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-slate-300'}`}></div>
                        <span className={`font-semibold text-sm ${node.active ? 'text-slate-700' : 'text-slate-400'}`}>{node.name}</span>
                     </div>
                     <span className={`text-xs font-mono font-medium px-2 py-1 rounded-md ${node.active ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-400'}`}>
                        {node.active ? `:${node.port}` : 'Inactivo'}
                     </span>
                  </li>
                ))}
             </ul>
          </div>

        </div>
      </div>
    </div>
  )
}
