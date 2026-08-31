"use client";
import React from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import Link from 'next/link';

export default function RequisitionsPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Requisiciones Internas de Compra</h1>
          <p className="text-sm text-slate-500 mt-1">Gestión y consolidación de solicitudes de reabastecimiento desde sucursales</p>
        </div>
        <Link href="/orders/new">
          <Button label="Nueva Orden Directa" icon="pi pi-plus" className="p-button-emerald text-sm" />
        </Link>
      </div>

      <Card className="shadow-sm border border-slate-200 rounded-xl bg-white text-center py-12">
        <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 text-2xl shadow-inner">
          <i className="pi pi-inbox"></i>
        </div>
        <h3 className="text-lg font-bold text-slate-700">Flujo de Requisiciones en Preparación</h3>
        <p className="text-slate-500 max-w-md mx-auto mt-2 text-sm">
          Este módulo permitirá a los encargados de sucursal solicitar mercancía para que el comprador consolide las solicitudes en una sola ODC a proveedor.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/orders">
            <Button label="Ir a Órdenes de Compra" icon="pi pi-file" className="p-button-outlined p-button-secondary text-sm" />
          </Link>
        </div>
      </Card>
    </div>
  );
}
