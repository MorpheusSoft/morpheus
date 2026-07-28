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

    const [lazyParams, setLazyParams] = useState({
        first: 0,
        rows: 10,
        page: 0
    });
    const [totalRecords, setTotalRecords] = useState(0);

    const [selectedBuyer, setSelectedBuyer] = useState<number | null>(null);
    const [buyers, setBuyers] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);

    useEffect(() => {
        import('@/lib/api').then(({ default: api }) => {
            Promise.all([
                api.get('/buyers/'),
                api.get('/users/')
            ]).then(([bRes, uRes]) => {
                setBuyers(bRes.data || []);
                setUsers(uRes.data || []);
            }).catch(err => console.error(err));
        });
    }, []);

    const loadLazyData = () => {
        setLoading(true);
        import('@/lib/api').then(({ default: api }) => {
            let url = `/suppliers/?skip=${lazyParams.first}&limit=${lazyParams.rows}`;
            if (globalFilter) {
                url += `&q=${encodeURIComponent(globalFilter)}`;
            }
            if (selectedBuyer !== null) {
                url += `&buyer_id=${selectedBuyer}`;
            }
            api.get(url)
                .then(res => {
                    if (res.data.data) {
                        setSuppliers(res.data.data);
                        setTotalRecords(res.data.total);
                    } else {
                        // Fallback in case backend not updated yet
                        setSuppliers(res.data);
                        setTotalRecords(res.data.length);
                    }
                    setLoading(false);
                })
                .catch(err => {
                    console.error("Error fetching suppliers", err);
                    setLoading(false);
                });
        });
    };

    useEffect(() => {
        loadLazyData();
    }, [lazyParams, selectedBuyer]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            if (lazyParams.first !== 0) {
                setLazyParams(prev => ({ ...prev, first: 0, page: 0 }));
            } else {
                loadLazyData();
            }
        }, 500);
        return () => clearTimeout(timeout);
    }, [globalFilter]);

    const onPage = (event: any) => {
        setLazyParams(event);
    };

    const statusBodyTemplate = (rowData: Supplier) => {
        return <Tag value={rowData.is_active ? 'Activo' : 'Inactivo'} severity={rowData.is_active ? 'success' : 'danger'}></Tag>;
    };

    const header = (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                <div className="relative w-full md:w-auto flex items-center">
                    <i className="pi pi-search absolute left-3 text-slate-400 z-10" />
                    <InputText 
                        type="search" 
                        onInput={(e) => setGlobalFilter(e.currentTarget.value)} 
                        placeholder="Buscar proveedor..." 
                        className="w-full md:w-[15rem] !pl-10 !rounded-xl" 
                    />
                </div>
                
                <select
                    value={selectedBuyer ?? 0}
                    onChange={(e) => {
                        const val = Number(e.target.value);
                        setSelectedBuyer(val === 0 ? null : val);
                    }}
                    className="p-2 border border-slate-200 rounded-xl text-xs bg-slate-50 text-slate-700 font-semibold focus:outline-none"
                    style={{ minWidth: '12rem' }}
                >
                    <option value={0}>Todos los Compradores</option>
                    {buyers.map(b => {
                        const u = users.find(x => x.id === b.user_id);
                        return (
                            <option key={b.id} value={b.id}>
                                {u ? u.full_name || u.email : `Comprador #${b.id}`}
                            </option>
                        );
                    })}
                </select>
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
                    lazy
                    paginator 
                    first={lazyParams.first}
                    rows={lazyParams.rows} 
                    totalRecords={totalRecords}
                    onPage={onPage}
                    dataKey="id" 
                    loading={loading}
                    emptyMessage="No se encontraron proveedores."
                    header={header}
                    className="p-datatable-sm"
                    responsiveLayout="scroll"
                >
                    <Column field="tax_id" header="RUC / NIT" sortable style={{ minWidth: '10rem' }}></Column>
                    <Column field="name" header="Razón Social" sortable style={{ minWidth: '15rem' }}></Column>
                    <Column 
                        header="Comprador" 
                        body={(rowData) => {
                            if (!rowData.buyer_id) return <span className="text-slate-400 italic text-xs">Sin asignar</span>;
                            const b = buyers.find(x => x.id === rowData.buyer_id);
                            if (!b) return <span className="text-slate-500">...</span>;
                            const u = users.find(x => x.id === b.user_id);
                            return <span className="font-semibold text-slate-700">{u ? u.full_name || u.email : `Comprador #${rowData.buyer_id}`}</span>;
                        }} 
                        style={{ minWidth: '12rem' }}
                    ></Column>
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
