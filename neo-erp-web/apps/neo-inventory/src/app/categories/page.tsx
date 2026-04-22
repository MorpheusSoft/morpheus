'use client';

import { useState, useEffect } from 'react';
import { TreeTable } from 'primereact/treetable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { Checkbox } from 'primereact/checkbox';
import { CategoryService } from '@/services/category.service';

interface CategoryNode {
  key: string;
  data: any;
  children?: CategoryNode[];
}

export default function CategoriesPage() {
  const [nodes, setNodes] = useState<CategoryNode[]>([]);
  const [flatCategories, setFlatCategories] = useState<any[]>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  
  const [displayDialog, setDisplayDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentEditingId, setCurrentEditingId] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<number | null>(null);
  const [isLiquor, setIsLiquor] = useState(false);

  useEffect(() => { loadData(); }, []);

  const formatTreeNodes = (categories: any[]): CategoryNode[] => {
    return categories.map(cat => ({
      key: cat.id.toString(),
      data: { id: cat.id, name: cat.name, is_active: cat.is_active, is_liquor: cat.is_liquor || false, parent_id: cat.parent_id },
      children: cat.children && cat.children.length > 0 ? formatTreeNodes(cat.children) : []
    }));
  };

  const loadData = async () => {
    try {
      const tree = await CategoryService.getTree();
      setNodes(formatTreeNodes(tree));
      const list = await CategoryService.getList();
      setFlatCategories(list);
    } catch (err) {
      console.error('Error loading categories', err);
    }
  };

  const openDialog = (preselectParentId: number | null = null, editData?: any) => {
    setIsEditMode(!!editData);
    if (editData) {
      setCurrentEditingId(editData.id);
      setName(editData.name || '');
      setParentId(editData.parent_id || null);
      setIsLiquor(editData.is_liquor || false);
    } else {
      setCurrentEditingId(null);
      setName('');
      setParentId(preselectParentId);
      setIsLiquor(false);
    }
    setDisplayDialog(true);
  };

  const saveCategory = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    const payload = { name, parent_id: parentId || null, is_liquor: isLiquor };
    try {
      if (isEditMode && currentEditingId) {
        await CategoryService.update(currentEditingId, payload);
      } else {
        await CategoryService.create(payload);
      }
      setDisplayDialog(false);
      loadData();
    } catch (err) {
      console.error('Save failed', err);
    } finally {
      setIsSaving(false);
    }
  };

  const nameTemplate = (node: CategoryNode) => {
    // inline-flex and align-middle ensures this text aligns perfectly with the toggler <i> chevron in PrimeReact
    return (
      <span className="inline-flex items-center gap-3 align-middle">
        <span className="font-semibold text-slate-800 text-[15px]">{node.data.name}</span>
        {node.data.is_liquor && (
          <span className="bg-purple-50 text-purple-600 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border border-purple-200">
            Licor
          </span>
        )}
      </span>
    );
  };

  const statusTemplate = (node: CategoryNode) => {
    const active = node.data.is_active !== false;
    return (
      <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold ${active ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/60' : 'bg-rose-50 text-rose-600 border border-rose-200/60'}`}>
        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${active ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
        {active ? 'Activo' : 'Inactivo'}
      </span>
    );
  };

  const actionsTemplate = (node: CategoryNode) => {
    return (
      <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity justify-end pr-4">
        <Button icon="pi pi-plus" rounded text onClick={(e) => { e.stopPropagation(); openDialog(node.data.id); }} title="Añadir Subcategoría" className="w-9 h-9 hover:bg-slate-100 text-slate-400 hover:text-emerald-500 transition-colors" />
        <Button icon="pi pi-pencil" rounded text onClick={(e) => { e.stopPropagation(); openDialog(null, node.data); }} title="Editar Categoría" className="w-9 h-9 hover:bg-slate-100 text-slate-400 hover:text-blue-500 transition-colors" />
      </div>
    );
  };

  const header = (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 m-0 tracking-tight">Estructura de Categorías</h2>
        <p className="text-slate-500 text-sm mt-1 font-medium">Gestión jerárquica de inventario</p>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
        <span className="p-input-icon-left w-full sm:w-64">
           <i className="pi pi-search text-slate-400 z-10" />
           <InputText 
             type="search" 
             autoComplete="off"
             onInput={(e: any) => setGlobalFilter(e.target.value)} 
             placeholder="Buscar categoría..." 
             className="w-full !pl-10 !rounded-full !bg-slate-50 border-transparent focus:!border-blue-400 focus:!ring-4 focus:!ring-blue-500/10 transition-all !py-2.5 shadow-sm"
           />
        </span>
        <Button 
          label="Nueva Categoría" 
          icon="pi pi-plus" 
          onClick={() => openDialog()} 
          className="!bg-blue-600 !border-none !rounded-full !shadow-md hover:!bg-blue-700 hover:!shadow-lg transition-all !px-6 !py-2.5 w-full sm:w-auto shrink-0 whitespace-nowrap font-medium text-sm" 
        />
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-[1800px] mx-auto animate-fade-in-up">
      <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden relative backdrop-blur-3xl">
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-90"></div>
        <div className="p-5 md:p-6">
          {header}
          
          <style dangerouslySetInnerHTML={{__html: `
            .premium-treetable .p-treetable-thead > tr > th {
              background-color: transparent !important;
              border-bottom: 2px solid #e2e8f0 !important;
              color: #94a3b8 !important;
              font-weight: 700 !important;
              text-transform: uppercase;
              font-size: 0.65rem;
              letter-spacing: 0.1em;
              padding: 1rem 0 0.75rem 0 !important;
              border-top: none !important;
              border-left: none !important;
              border-right: none !important;
            }
            .premium-treetable .p-treetable-tbody > tr {
              background-color: transparent !important;
              transition: background-color 0.2s ease;
            }
            .premium-treetable .p-treetable-tbody > tr:hover {
              background-color: #f8fafc !important;
            }
            .premium-treetable .p-treetable-tbody > tr > td {
              border-bottom: 1px solid #f1f5f9 !important;
              border-top: none !important;
              border-left: none !important;
              border-right: none !important;
              padding: 1rem 0 !important;
            }
            /* Align the toggler properly alongside text */
            .premium-treetable .p-treetable-toggler {
              display: inline-flex !important;
              align-items: center;
              justify-content: center;
              vertical-align: middle;
              color: #94a3b8;
              width: 1.5rem;
              height: 1.5rem;
              border-radius: 0.25rem;
              transition: all 0.2s ease;
              margin-right: 0.5rem;
            }
            .premium-treetable .p-treetable-toggler:hover {
              background-color: #e2e8f0;
              color: #3b82f6;
            }
            /* Clean hierarchical indentation */
            .premium-treetable .p-treetable-tbody > tr[aria-level="1"] > td:first-child {
              padding-left: 0.5rem !important;
            }
            .premium-treetable .p-treetable-tbody > tr[aria-level="2"] > td:first-child {
              padding-left: 2.5rem !important;
            }
            .premium-treetable .p-treetable-tbody > tr[aria-level="3"] > td:first-child {
              padding-left: 4.5rem !important;
            }
            .premium-treetable .p-treetable-tbody > tr[aria-level="4"] > td:first-child {
              padding-left: 6.5rem !important;
            }
            /* Make the action buttons right aligned */
            .premium-treetable .p-treetable-thead > tr > th:last-child {
              text-align: right !important;
              padding-right: 1.5rem !important;
            }
            .premium-treetable .p-treetable-tbody > tr > td:last-child {
              text-align: right !important;
            }
          `}} />

          <TreeTable 
            value={nodes} 
            globalFilter={globalFilter} 
            paginator 
            rows={20}
            className="premium-treetable mt-4"
            emptyMessage={
              <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                <i className="pi pi-folder-open text-5xl mb-4 opacity-50"></i>
                <p className="font-medium text-lg">Aún no hay categorías configuradas.</p>
              </div>
            }
          >
            <Column field="name" header="NOMBRE Y JERARQUÍA" body={nameTemplate} expander style={{ width: '60%' }}></Column>
            <Column header="ESTADO" body={statusTemplate} style={{ width: '20%' }}></Column>
            <Column header="ACCIONES" body={actionsTemplate} style={{ width: '20%' }}></Column>
          </TreeTable>
        </div>
      </div>

      <Dialog 
        visible={displayDialog} 
        onHide={() => setDisplayDialog(false)} 
        showHeader={false}
        modal 
        className="w-full max-w-2xl shadow-2xl mx-4"
        contentClassName="p-0 bg-transparent"
        style={{ borderRadius: '1.25rem', overflow: 'hidden', border: 'none' }}
      >
        <div className="bg-white rounded-[1.25rem] overflow-hidden flex flex-col relative w-full">
          {/* Subtle top border instead of heavy gradient bar to save vertical space */}
          <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-indigo-500"></div>
          
          {/* Header */}
          <div className="px-8 pt-6 pb-2">
            <h3 className="text-xl font-extrabold text-slate-900 tracking-tight m-0">
              {isEditMode ? 'Editar Categoría' : 'Nueva Categoría'}
            </h3>
            <p className="text-slate-500 text-xs mt-1">Configura las propiedades de jerarquía en el catálogo.</p>
          </div>

          {/* Form Body - Reduced padding and gaps to make it less "largo" */}
          <div className="px-8 py-2 w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
              <div className="flex flex-col gap-1.5 w-full">
                <label htmlFor="name" className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nombre <span className="text-rose-500">*</span></label>
                <InputText 
                  id="name" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="Línea Blanca, Avenas..." 
                  autoComplete="off"
                  autoFocus 
                  className="w-full !rounded-lg !border-slate-200 !bg-slate-50 focus:!bg-white focus:!border-blue-500 focus:!ring-2 focus:!ring-blue-500/20 transition-all !py-2.5 !px-3 text-sm text-slate-800 font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5 w-full">
                <label htmlFor="parent" className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Dependencia (Padre)</label>
                <Dropdown 
                  id="parent" 
                  value={parentId} 
                  onChange={(e) => setParentId(e.value)} 
                  options={flatCategories} 
                  optionLabel="name" 
                  optionValue="id" 
                  showClear 
                  filter
                  filterPlaceholder="Buscar..."
                  placeholder="Ninguna (Categoría Raíz)"
                  className="w-full !rounded-lg !border-slate-200 !bg-slate-50 focus:!bg-white transition-all shadow-none"
                  panelClassName="!rounded-xl !shadow-xl !border-slate-100"
                  pt={{
                    input: { className: '!py-2.5 !px-3 text-sm text-slate-800 font-medium' },
                    trigger: { className: 'text-slate-400' }
                  }}
                />
              </div>
            </div>

            {/* Custom Interactive Switch Card */}
            <div 
              className={`mt-5 rounded-xl p-4 border transition-all cursor-pointer flex gap-3 items-center select-none ${isLiquor ? 'bg-indigo-50/30 border-indigo-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}
              onClick={() => setIsLiquor(!isLiquor)}
            >
              <div className="pointer-events-none">
                <Checkbox checked={isLiquor} className={isLiquor ? '!border-indigo-500' : ''} />
              </div>
              <div className="flex-1">
                <p className={`font-bold text-sm leading-none mb-1 ${isLiquor ? 'text-indigo-800' : 'text-slate-700'}`}>Categoría Restringida (Licor, Controlados)</p>
                <p className={`text-xs ${isLiquor ? 'text-indigo-600/80' : 'text-slate-400'}`}>
                  Habilita validaciones estrictas y exime de descuentos automáticos a sus productos.
                </p>
              </div>
            </div>
          </div>

          {/* Footer Actions - Compact height */}
          <div className="px-8 py-4 mt-4 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3 w-full">
            <Button 
              label="Cerrar Ventana" 
              onClick={() => setDisplayDialog(false)} 
              className="!bg-white !text-slate-600 !border !border-slate-200 hover:!bg-slate-100 hover:!text-slate-900 !rounded-lg !px-4 !py-2 text-sm font-bold transition-colors" 
            />
            <Button 
              label="Guardar Categoría" 
              icon="pi pi-check" 
              onClick={saveCategory} 
              loading={isSaving} 
              disabled={!name.trim()} 
              className="!bg-gradient-to-br !from-slate-800 !to-slate-900 hover:!from-slate-900 hover:!to-black !border-none !text-white !rounded-lg !px-5 !py-2 !shadow-md transition-all text-sm font-bold whitespace-nowrap disabled:!opacity-50 disabled:!shadow-none" 
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
