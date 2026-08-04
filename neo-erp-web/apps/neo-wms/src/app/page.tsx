import Link from "next/link";

export default function WmsDashboard() {
  return (
    <div className="p-4 sm:p-8 w-full max-w-[1400px] mx-auto fade-in">
      {/* HEADER EJECUTIVO WMS */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-slate-800"></div>
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center">
             <i className="pi pi-box mr-3 text-slate-500"></i>
             Central de Almacén (WMS)
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Recepción, control de ubicaciones, lotes y despachos.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href="/receipts" className="block">
              <div className="bg-gradient-to-br from-slate-700 to-slate-900 rounded-2xl p-6 text-white shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all cursor-pointer border border-slate-600 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-white/20 transition-all duration-500"></div>
                  <i className="pi pi-truck text-4xl mb-4 text-slate-300"></i>
                  <h2 className="text-2xl font-black tracking-tight">Muelle de Recepción</h2>
                  <p className="text-slate-300 mt-2 text-sm leading-relaxed">
                      Escanea e ingresa físicamente la mercancía proveniente de las Órdenes de Compra.
                  </p>
              </div>
          </Link>

          <Link href="/locations" className="block">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-md hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer relative overflow-hidden group">
                  <i className="pi pi-sitemap text-4xl mb-4 text-emerald-600"></i>
                  <h2 className="text-xl font-bold tracking-tight text-slate-800">Mapa de Almacén</h2>
                  <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                      Control jerárquico de pasillos, racks y movimientos Putaway.
                  </p>
              </div>
          </Link>

          <Link href="/transfers" className="block">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-md hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer relative overflow-hidden group">
                  <i className="pi pi-arrow-right-arrow-left text-4xl mb-4 text-blue-600"></i>
                  <h2 className="text-xl font-bold tracking-tight text-slate-800">Transferencias (Outbound)</h2>
                  <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                      Despacho y traslado de mercancía entre tiendas y sucursales.
                  </p>
              </div>
          </Link>

          <Link href="/lots" className="block">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-md hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer relative overflow-hidden group">
                  <i className="pi pi-calendar-plus text-4xl mb-4 text-teal-600"></i>
                  <h2 className="text-xl font-bold tracking-tight text-slate-800">Control de Lotes & FEFO</h2>
                  <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                      Trazabilidad por lote y monitor de vencimientos.
                  </p>
              </div>
          </Link>

          <Link href="/adjustments" className="block">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-md hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer relative overflow-hidden group">
                  <i className="pi pi-sort-alt text-4xl mb-4 text-indigo-600"></i>
                  <h2 className="text-xl font-bold tracking-tight text-slate-800">Ajustes & Tomas Físicas</h2>
                  <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                      Auditoría ciega e inventarios por ubicación.
                  </p>
              </div>
          </Link>
      </div>
    </div>
  );
}
