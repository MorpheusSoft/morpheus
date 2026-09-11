import Link from "next/link"
import { getCoreStats } from "@/app/actions/dashboard"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Hub Principal | Neo Core",
}

export default async function DashboardPage() {
  const data = await getCoreStats()

  // Valores reales desde backend con fallback seguro
  const usersActive = data?.users.active ?? 0
  const usersTotal = data?.users.total ?? 0
  const facilitiesActive = data?.facilities.active ?? 0
  const facilitiesTotal = data?.facilities.total ?? 0
  const companiesTotal = data?.companies.total ?? 0
  const companyPrimary = data?.companies.primary || "Empresa Principal"
  const jobsActive = data?.jobs.active ?? 0
  const jobsTotal = data?.jobs.total ?? 0
  const rolesTotal = data?.roles.total ?? 0
  const workersActive = data?.digital_workers.active ?? 0
  const workersTotal = data?.digital_workers.total ?? 0

  const stats = [
    {
      label: "Usuarios Activos",
      value: usersActive,
      badge: `${usersTotal} registrados`,
      subtext: "En el ecosistema",
      color: "text-emerald-600",
      bgIcon: "bg-emerald-50 text-emerald-600",
      badgeStyle: "bg-emerald-50 text-emerald-700 border-emerald-100",
      icon: "pi-users",
      href: "/dashboard/users",
    },
    {
      label: "Sucursales Operativas",
      value: facilitiesActive,
      badge: `${facilitiesTotal} sedes`,
      subtext: "Operando en vivo",
      color: "text-blue-600",
      bgIcon: "bg-blue-50 text-blue-600",
      badgeStyle: "bg-blue-50 text-blue-700 border-blue-100",
      icon: "pi-building",
      href: "/dashboard/facilities",
    },
    {
      label: "Empresas en Holding",
      value: companiesTotal,
      badge: companyPrimary.length > 18 ? companyPrimary.substring(0, 16) + "..." : companyPrimary,
      subtext: "Multi-empresa",
      color: "text-indigo-600",
      bgIcon: "bg-indigo-50 text-indigo-600",
      badgeStyle: "bg-indigo-50 text-indigo-700 border-indigo-100",
      icon: "pi-briefcase",
      href: "/dashboard/companies",
    },
    {
      label: "Tareas Programadas",
      value: jobsActive,
      badge: `${jobsTotal} configuradas`,
      subtext: "Jobs automáticos",
      color: "text-amber-600",
      bgIcon: "bg-amber-50 text-amber-600",
      badgeStyle: "bg-amber-50 text-amber-700 border-amber-100",
      icon: "pi-server",
      href: "/dashboard/jobs",
    },
  ]

  const nodes = [
    { name: "Neo Core", active: true, port: 4000, desc: "Hub central y seguridad", url: "https://hub.qa.morpheussoft.net" },
    { name: "Neo Inventario", active: true, port: 4001, desc: "Catálogo y existencias", url: "https://inventario.qa.morpheussoft.net" },
    { name: "Neo Compras", active: true, port: 4002, desc: "Órdenes y proveedores", url: "https://compras.qa.morpheussoft.net" },
    { name: "Neo WMS", active: true, port: 4003, desc: "Almacén y transferencias", url: "https://logistica.qa.morpheussoft.net" },
    { name: "Neo Pricing", active: true, port: 4004, desc: "Costos y márgenes", url: "https://costos.qa.morpheussoft.net" },
    { name: "Neo API", active: true, port: 8000, desc: "Motor FastAPI", url: "https://api.qa.morpheussoft.net" },
    { name: "Neo B2B", active: false, port: 4005, desc: "Portal mayorista (Standby)", url: null },
    { name: "Neo POS", active: false, port: 4006, desc: "Punto de venta (Próximamente)", url: null },
  ]

  return (
    <div className="w-full h-full pb-10 fade-in-up">
      <div className="flex flex-col gap-8 max-w-7xl mx-auto">
        
        {/* Encabezado */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Centro de Mando</h1>
            <p className="text-slate-500 text-sm mt-1">
              Visión global de configuración, infraestructura y accesos del ecosistema Neo ERP.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 bg-emerald-50 px-3.5 py-1.5 rounded-xl border border-emerald-100 shadow-sm">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              Red Segura Cifrada
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <i className="pi pi-database text-slate-400"></i>
              PostgreSQL Online
            </div>
          </div>
        </div>

        {/* Tarjetas de Métricas Reales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, i) => (
            <Link
              key={i}
              href={stat.href}
              className="group bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer block"
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${stat.bgIcon} shadow-sm group-hover:scale-105 transition-transform`}>
                  <i className={`pi ${stat.icon} text-xl`}></i>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${stat.badgeStyle}`}>
                  {stat.badge}
                </span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-2 mb-1">
                  <h3 className="text-3xl font-black text-slate-800 tracking-tight">{stat.value}</h3>
                  <span className="text-xs font-medium text-slate-400">{stat.subtext}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-medium text-slate-600">
                  <span>{stat.label}</span>
                  <i className="pi pi-arrow-right text-xs text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all"></i>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Panel Inferior */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Banner Hero Arquitectura */}
          <div className="lg:col-span-2 bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl shadow-indigo-950/20 flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/15 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/15 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none"></div>
            
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full backdrop-blur-md border border-white/20 mb-6">
                <i className="pi pi-sparkles text-amber-300 text-xs"></i>
                <span className="text-xs font-bold tracking-wide text-indigo-200">ARQUITECTURA NEO ERP</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold mb-3 tracking-tight leading-tight max-w-xl">
                Configuración Dinámica Multiempreas
              </h2>
              <p className="text-indigo-200 text-sm md:text-base max-w-lg leading-relaxed mb-6">
                Centro neurálgico del ecosistema. Administra la seguridad perimetral, roles ({rolesTotal} perfiles activos), sucursales y agentes de inteligencia artificial ({workersActive} trabajadores digitales activos).
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-md pt-2 pb-4 border-t border-white/10 text-xs">
                <div>
                  <div className="text-indigo-300 font-medium">Roles de Acceso</div>
                  <div className="text-lg font-bold text-white">{rolesTotal} creados</div>
                </div>
                <div>
                  <div className="text-indigo-300 font-medium">Trabajadores IA</div>
                  <div className="text-lg font-bold text-white">{workersTotal} configurados</div>
                </div>
                <div>
                  <div className="text-indigo-300 font-medium">Seguridad RBAC</div>
                  <div className="text-lg font-bold text-emerald-400">Protegido</div>
                </div>
              </div>
            </div>
            
            <div className="relative z-10 mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard/roles"
                className="inline-flex items-center gap-2 bg-white text-indigo-950 font-bold px-5 py-2.5 rounded-xl hover:bg-slate-100 transition-colors shadow-lg text-sm"
              >
                <i className="pi pi-shield text-indigo-600"></i>
                Gestionar Roles
              </Link>
              <Link
                href="/dashboard/digital-workers"
                className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md border border-white/20 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-white/25 transition-colors text-sm"
              >
                <i className="pi pi-bolt text-amber-300"></i>
                Usuarios Digitales (IA)
              </Link>
              <Link
                href="/dashboard/currencies"
                className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/15 text-white/90 font-medium px-4 py-2.5 rounded-xl hover:bg-white/20 transition-colors text-sm"
              >
                <i className="pi pi-dollar text-emerald-300"></i>
                Tasas y Monedas
              </Link>
            </div>
          </div>

          {/* Panel Lateral: Estatus de Nodos Neo */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                  <i className="pi pi-server text-indigo-600"></i>
                  Estatus de Nodos Neo
                </h3>
                <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                  {nodes.filter(n => n.active).length} Activos
                </span>
              </div>
              
              <ul className="flex flex-col gap-2.5">
                {nodes.map((node, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${node.active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-slate-300'}`}></div>
                      <div>
                        <div className={`font-semibold text-xs ${node.active ? 'text-slate-800' : 'text-slate-400'}`}>
                          {node.name}
                        </div>
                        <div className="text-[10px] text-slate-400 leading-tight">
                          {node.desc}
                        </div>
                      </div>
                    </div>
                    
                    <span className={`text-[11px] font-mono font-medium px-2 py-1 rounded-md ${node.active ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-400'}`}>
                      {node.active ? `:${node.port}` : 'Standby'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span>Ambiente: <strong className="text-slate-600">QA Cloud</strong></span>
              <span>Motor: <strong className="text-indigo-600">Neo Ecosystem</strong></span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
