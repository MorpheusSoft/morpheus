'use client';

import React, { useState, useEffect } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Supplier {
    id: number;
    name: string;
    tax_id: string;
    commercial_email: string;
    financial_email: string;
    lead_time_days: number;
    minimum_order_qty: number;
    is_active: boolean;
}

export default function SuppliersCatalog() {
    const router = useRouter();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [globalFilter, setGlobalFilter] = useState('');

    useEffect(() => {
        fetch('http://localhost:8000/api/v1/suppliers/')
            .then(res => res.json())
            .then(data => {
                setSuppliers(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error fetching suppliers", err);
                setLoading(false);
            });
    }, []);

    const statusBodyTemplate = (rowData: Supplier) => {
        return <Tag value={rowData.is_active ? 'Activo' : 'Inactivo'} severity={rowData.is_active ? 'success' : 'danger'}></Tag>;
    };

    const header = (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative w-full md:w-auto flex items-center">
                <i className="pi pi-search absolute left-3 text-slate-400 z-10" />
                <InputText 
                    type="search" 
                    onInput={(e) => setGlobalFilter(e.currentTarget.value)} 
                    placeholder="Buscar proveedor..." 
                    className="w-full md:w-[20rem] !pl-10" 
                />
            </div>
            <Link href="/suppliers/new" passHref>
                <Button label="Nuevo Proveedor" icon="pi pi-plus" className="bg-emerald-600 hover:bg-emerald-700 border-none px-4 py-2 text-white font-medium rounded-lg" />
            </Link>
        </div>
    );

    return (
        <div className="p-6 h-full flex flex-col bg-slate-50">
            <div className="mb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800">Maestro de Proveedores</h1>
                    <p className="text-slate-500 mt-2">Catálogo unificado de proveedores y reglas logísticas.</p>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex-1 flex flex-col min-h-0">
                <DataTable 
                    value={suppliers} 
                    paginator 
                    rows={10} 
                    dataKey="id" 
                    filters={{ global: { value: globalFilter, matchMode: 'contains' } }}
                    loading={loading}
                    emptyMessage="No se encontraron proveedores."
                    header={header}
                    className="p-datatable-sm"
                    responsiveLayout="scroll"
                >
                    <Column field="tax_id" header="RUC / NIT" sortable style={{ minWidth: '10rem' }}></Column>
                    <Column field="name" header="Razón Social" sortable style={{ minWidth: '15rem' }}></Column>
                    <Column field="commercial_email" header="Email Comercial" style={{ minWidth: '15rem' }}></Column>
                    <Column field="lead_time_days" header="Lead Time (Días)" sortable style={{ minWidth: '10rem' }}></Column>
                    <Column body={statusBodyTemplate} header="Estado" style={{ minWidth: '8rem' }}></Column>
                    <Column 
                        body={(rowData) => (
                            <div className="flex justify-end gap-2">
                                <Button icon="pi pi-pencil" rounded text severity="info" aria-label="Editar" onClick={() => router.push(`/suppliers/${rowData.id}`)} />
                            </div>
                        )} 
                        exportable={false} 
                        style={{ minWidth: '5rem' }}
                    ></Column>
                </DataTable>
            </div>
        </div>
    );
}
