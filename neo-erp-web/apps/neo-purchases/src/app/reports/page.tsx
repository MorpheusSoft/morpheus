"use client";
import React from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import Link from 'next/link';

export default function ReportsPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reportes de Compras</h1>
          <p className="text-sm text-slate-500 mt-1">Informes consolidados de volumen de compras, variaciones de costo y gasto por sucursal</p>
        </div>
      </div>

      <Card className="shadow-sm border border-slate-200 rounded-xl bg-white text-center py-12">
        <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 text-2xl shadow-inner">
          <i className="pi pi-chart-bar"></i>
        </div>
        <h3 className="text-lg font-bold text-slate-700">Centro de Reportes Gerenciales de Compras</h3>
        <p className="text-slate-500 max-w-md mx-auto mt-2 text-sm">
          Generación y exportación de reportes de compras por proveedor, evolución de precios unitarios y volumen transaccionado.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/orders">
            <Button label="Ver Órdenes de Compra" icon="pi pi-file" className="p-button-outlined p-button-secondary text-sm" />
          </Link>
        </div>
      </Card>
    </div>
  );
}
