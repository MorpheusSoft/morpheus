import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TreeTableModule } from 'primeng/treetable';
import { TreeNode } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { CheckboxModule } from 'primeng/checkbox';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { CategoryService } from '@morpheus/core-services';
import { Category } from '@morpheus/models';

@Component({
  selector: 'app-category-list',
  standalone: true,
  imports: [
    CommonModule, RouterModule, ReactiveFormsModule, 
    TreeTableModule, ButtonModule, DialogModule, InputTextModule, DropdownModule, CheckboxModule, IconFieldModule, InputIconModule
  ],
  template: `
    <div class="card p-4">
        <div class="flex justify-content-between align-items-center mb-4">
            <h2>Jerarquía de Categorías</h2>
            <div class="flex flex-column sm:flex-row align-items-center gap-3">
                <p-iconfield class="w-full sm:w-auto">
                    <p-inputicon class="pi pi-search" />
                    <input pInputText type="text" (input)="onSearch($event, tt)" placeholder="Ej: Viveres, Cereales..." class="w-full" />
                </p-iconfield>
                <p-button label="Nueva Categoría" icon="pi pi-plus" (onClick)="showDialog()"></p-button>
            </div>
        </div>

        <p-treeTable #tt [value]="categoryNodes" [globalFilterFields]="['name']" [scrollable]="true" scrollHeight="600px" [paginator]="true" [rows]="20" dataKey="id">
            <ng-template pTemplate="header">
                <tr>
                    <th>Nombre</th>
                    <th style="width: 15rem">Estado</th>
                    <th style="width: 15rem">Acciones</th>
                </tr>
            </ng-template>
            <ng-template pTemplate="body" let-rowNode let-rowData="rowData">
                <tr [ttRow]="rowNode">
                    <td>
                        <p-treeTableToggler [rowNode]="rowNode"></p-treeTableToggler>
                        {{rowData.name}}
                        <span *ngIf="rowData.is_liquor" class="ml-2 px-2 py-1 text-xs border-round bg-purple-100 text-purple-700 font-bold" pTooltip="Alcohol/Licor">LICOR</span>
                    </td>
                    <td style="width: 15rem">
                        <span class="p-tag p-component" [ngClass]="{'p-tag-success': rowData.is_active, 'p-tag-danger': !rowData.is_active}">
                            {{rowData.is_active ? 'Activo' : 'Inactivo'}}
                        </span>
                    </td>
                    <td style="width: 15rem">
                        <div class="flex gap-2">
                           <p-button icon="pi pi-plus" severity="success" [rounded]="true" [text]="true" pTooltip="Añadir Subcategoría" tooltipPosition="bottom" (onClick)="showDialog(rowData.id)"></p-button>
                           <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" pTooltip="Editar" tooltipPosition="bottom" (onClick)="showDialog(null, rowData)"></p-button>
                        </div>
                    </td>
                </tr>
            </ng-template>
            <ng-template pTemplate="emptymessage">
                <tr>
                    <td colspan="3" class="text-center p-4">Aún no hay categorías configuradas.</td>
                </tr>
            </ng-template>
        </p-treeTable>
        
        <!-- Quick Create/Edit Dialog overlay -->
        <p-dialog [(visible)]="displayDialog" [header]="isEditMode ? 'Editar Categoría' : 'Nueva Categoría'" [modal]="true" [style]="{width: '450px'}" [closable]="true" styleClass="p-fluid">
            <ng-template pTemplate="content">
                <form [formGroup]="categoryForm" (submit)="$event.preventDefault()" autocomplete="off" class="flex flex-column gap-4 mt-2">
                    
                    <div class="flex flex-column gap-2">
                        <label for="name" class="font-bold text-700">Nombre de la Categoría <span class="text-red-500">*</span></label>
                        <input id="name" type="text" pInputText formControlName="name" autofocus placeholder="Ej. Lácteos, Cereales..." autocomplete="off" />
                        <small class="text-red-500" *ngIf="categoryForm.get('name')?.invalid && categoryForm.get('name')?.dirty">
                            El nombre es obligatorio.
                        </small>
                    </div>
                    
                    <div class="flex flex-column gap-2">
                        <label for="parent" class="font-bold text-700">Dependencia (Categoría Padre)</label>
                        <p-dropdown id="parent" [options]="flatCategories" formControlName="parent_id" optionLabel="name" optionValue="id" [showClear]="true" placeholder="Sin Padre (Categoría Raíz)"></p-dropdown>
                    </div>

                    <div class="surface-50 border-round p-3 flex align-items-center gap-3 border-1 surface-border mt-2">
                        <p-checkbox formControlName="is_liquor" [binary]="true" inputId="is_liquor"></p-checkbox>
                        <div>
                           <label for="is_liquor" class="font-bold text-900 cursor-pointer block mb-1">¿Categoría Protegida (Licor)?</label>
                           <small class="text-600">Al marcarse, los productos heredarán exclusión de retenciones.</small>
                        </div>
                    </div>

                </form>
            </ng-template>

            <ng-template pTemplate="footer">
                <div class="flex justify-content-end gap-2 pt-3">
                    <p-button label="Cancelar" severity="secondary" [outlined]="true" (onClick)="displayDialog = false"></p-button>
                    <p-button label="Guardar" icon="pi pi-check" (onClick)="saveCategory()" [disabled]="categoryForm.invalid" [loading]="isSaving"></p-button>
                </div>
            </ng-template>
        </p-dialog>
    </div>
  `
})
export class CategoryListComponent implements OnInit {
  categoryNodes: TreeNode[] = [];
  flatCategories: Category[] = [];
  
  displayDialog = false;
  isEditMode = false;
  isSaving = false;
  currentEditingId: number | null = null;
  
  // Memoria de ramas expandidas
  expandedNodeIds = new Set<number>();
  
  private categoryService = inject(CategoryService);
  private fb = inject(FormBuilder);
  
  categoryForm: FormGroup = this.fb.group({
      name: ['', Validators.required],
      parent_id: [null],
      is_liquor: [false]
  });

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.captureExpandedNodes(this.categoryNodes);

    this.categoryService.getTree().subscribe({
       next: (tree) => {
           this.categoryNodes = this.convertToTreeNodes(tree);
       },
       error: (err) => console.error("Error loading category tree", err)
    });
    
    this.categoryService.getList().subscribe(list => this.flatCategories = list);
  }

  // Guardar qué nodos estaban abiertos antes de refrescar la pantalla
  private captureExpandedNodes(nodes: TreeNode[]) {
      for (const node of nodes) {
          if (node.expanded && node.data?.id) {
              this.expandedNodeIds.add(node.data.id);
          } else if (node.data?.id) {
              this.expandedNodeIds.delete(node.data.id);
          }
          if (node.children && node.children.length > 0) {
              this.captureExpandedNodes(node.children);
          }
      }
  }

  private convertToTreeNodes(categories: Category[]): TreeNode[] {
      return categories.map(cat => ({
          data: { 
             id: cat.id, 
             name: cat.name, 
             is_active: cat.is_active,
             is_liquor: (cat as any).is_liquor || false, // Fallback if interface missing
             parent_id: cat.parent_id 
          },
          children: cat.children ? this.convertToTreeNodes(cat.children) : [],
          expanded: this.expandedNodeIds.has(cat.id)
      }));
  }

  onSearch(event: Event, tt: any) {
      const val = (event.target as HTMLInputElement).value;
      tt.filterGlobal(val, 'contains');
      
      // Auto-expand on search, collapse on empty string
      const isSearching = val.trim().length > 0;
      this.toggleAllNodes(this.categoryNodes, isSearching);
  }

  private toggleAllNodes(nodes: TreeNode[], expanded: boolean) {
      for (let node of nodes) {
          node.expanded = expanded;
          if (node.children && node.children.length > 0) {
              this.toggleAllNodes(node.children, expanded);
          }
      }
  }

  showDialog(preselectParentId: number | null = null, editData?: any) {
      this.isEditMode = !!editData;
      
      if (editData) {
          this.currentEditingId = editData.id;
          this.categoryForm.patchValue({
              name: editData.name,
              parent_id: editData.parent_id || null,
              is_liquor: editData.is_liquor || false
          });
      } else {
          this.currentEditingId = null;
          this.categoryForm.reset({
              name: '',
              parent_id: null,
              is_liquor: false
          });
          if (preselectParentId) {
              this.categoryForm.patchValue({ parent_id: preselectParentId });
          }
      }
      this.displayDialog = true;
  }

  saveCategory() {
      if (this.categoryForm.invalid) return;
      this.isSaving = true;
      
      // Sanitizar datos antes de enviar al backend Pydantic
      const rawValues = this.categoryForm.value;
      const data: any = {
          name: rawValues.name,
          parent_id: rawValues.parent_id ? Number(rawValues.parent_id) : null,
          is_liquor: !!rawValues.is_liquor
      };
      
      const req = this.isEditMode && this.currentEditingId
         ? this.categoryService.update(this.currentEditingId, data)
         : this.categoryService.create(data);
         
      req.subscribe({
          next: () => {
              this.displayDialog = false;
              this.isSaving = false;
              this.loadData(); // Re-fetch the tree to see the new addition
          },
          error: (err) => {
              console.error("Save failed", err);
              this.isSaving = false;
          }
      });
  }
}
