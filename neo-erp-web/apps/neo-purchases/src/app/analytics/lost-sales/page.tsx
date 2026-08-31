"use client";
import React from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import Link from 'next/link';

export default function LostSalesPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Ventas Perdidas por Quiebre</h1>
          <p className="text-sm text-slate-500 mt-1">Impacto comercial y financiero por falta de inventario en sucursales</p>
        </div>
      </div>

      <Card className="shadow-sm border border-slate-200 rounded-xl bg-white text-center py-12">
        <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 text-2xl shadow-inner">
          <i className="pi pi-exclamation-triangle"></i>
        </div>
        <h3 className="text-lg font-bold text-slate-700">Analítica de Quiebres y Ventas Perdidas</h3>
        <p className="text-slate-500 max-w-md mx-auto mt-2 text-sm">
          Este informe cuantifica los ingresos no percibidos calculando los días en stock cero multiplicados por la venta promedio diaria (ADS) de cada SKU.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/orders?status=draft">
            <Button label="Ver Sugeridos de Reposición" icon="pi pi-shopping-bag" className="p-button-emerald text-sm" />
          </Link>
        </div>
      </Card>
    </div>
  );
}
