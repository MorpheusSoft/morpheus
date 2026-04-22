import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductService, Product } from '../services/product.service';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { SelectModule } from 'primeng/select'; // PrimeNG 18 replaces Dropdown with Select

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [
    CommonModule, 
    RouterModule, 
    FormsModule, 
    TableModule, 
    ButtonModule, 
    InputTextModule, 
    TagModule, 
    IconFieldModule, 
    InputIconModule,
    SelectModule
  ],
  template: `
    <div class="card p-4 border-0 shadow-sm mt-3">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h2 class="m-0 fw-bold">Productos</h2>
            <p-button label="Nuevo Producto" icon="pi pi-plus" routerLink="/catalog/products/new"></p-button>
        </div>

        <p-table 
            #dt 
            [value]="products" 
            [rows]="10" 
            [paginator]="true" 
            [globalFilterFields]="['name','brand','model']"
            [tableStyle]="{ 'min-width': '50rem' }"
            [rowHover]="true"
            dataKey="id"
            currentPageReportTemplate="Mostrando {first} a {last} de {totalRecords} productos"
            [showCurrentPageReport]="true">
            
            <ng-template pTemplate="caption">
                <div class="d-flex justify-content-end">
                    <p-iconField iconPosition="left">
                        <p-inputIcon>
                            <i class="pi pi-search"></i>
                        </p-inputIcon>
                        <input 
                            pInputText 
                            type="text" 
                            (input)="dt.filterGlobal($any($event.target).value, 'contains')" 
                            placeholder="Buscar en todos los campos..." />
                    </p-iconField>
                </div>
            </ng-template>

            <ng-template pTemplate="header">
                <tr>
                    <th pSortableColumn="id" style="width:5%">ID <p-sortIcon field="id"></p-sortIcon></th>
                    <th pSortableColumn="name" style="width:25%">Nombre <p-sortIcon field="name"></p-sortIcon></th>
                    <th pSortableColumn="brand" style="width:15%">Marca <p-sortIcon field="brand"></p-sortIcon></th>
                    <th pSortableColumn="model" style="width:15%">Modelo <p-sortIcon field="model"></p-sortIcon></th>
                    <th>Tipo</th>
                    <th pSortableColumn="is_active" style="width:10%">Estado <p-sortIcon field="is_active"></p-sortIcon></th>
                    <th style="width:10%">Acciones</th>
                </tr>
            </ng-template>

            <ng-template pTemplate="body" let-prod>
                <tr>
                    <td>{{ prod.id }}</td>
                    <td>
                        <div class="fw-bold">{{ prod.name }}</div>
                        <small class="text-secondary" *ngIf="prod.has_variants">Con Variantes</small>
                    </td>
                    <td>{{ prod.brand || '-' }}</td>
                    <td>{{ prod.model || '-' }}</td>
                    <td><p-tag value="STOCK" severity="info"></p-tag></td>
                    <td>
                        <p-tag [value]="prod.is_active ? 'Activo' : 'Inactivo'" [severity]="prod.is_active ? 'success' : 'secondary'"></p-tag>
                    </td>
                    <td>
                        <div class="d-flex gap-2">
                            <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" [routerLink]="['/catalog/products/edit', prod.id]"></p-button>
                            <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" (onClick)="onDelete(prod.id)"></p-button>
                        </div>
                    </td>
                </tr>
            </ng-template>
            <ng-template pTemplate="emptymessage">
                <tr>
                    <td colspan="7">No se encontraron productos.</td>
                </tr>
            </ng-template>
        </p-table>
    </div>
  `,
  styles: [`
    :host ::ng-deep .p-datatable .p-datatable-header {
      background: transparent;
      border: none;
      padding: 1rem 0;
    }
  `]
})
export class ProductListComponent implements OnInit {
  products: Product[] = [];
  searchTerm: string = '';

  constructor(private productService: ProductService) { }

  ngOnInit(): void {
    this.loadProducts();
  }

  loadProducts(): void {
    this.productService.getProducts().subscribe({
      next: (data) => this.products = data,
      error: (err) => console.error('Error loading products', err)
    });
  }

  onDelete(id: number): void {
    if (confirm('¿Estás seguro de que deseas eliminar este producto?')) {
      this.productService.deleteProduct(id).subscribe({
        next: () => {
          this.products = this.products.filter(p => p.id !== id);
        },
        error: (err) => {
          console.error('Error removing product', err);
          alert('Error al eliminar el producto: ' + (err.error?.detail || err.message));
        }
      });
    }
  }
}
