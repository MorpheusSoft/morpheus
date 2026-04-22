import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ProductService } from '@morpheus/core-services';
import { Product } from '@morpheus/models';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, RouterModule, TableModule, ButtonModule, InputTextModule, IconFieldModule, InputIconModule],
  template: `
    <div class="card">
        <h2 class="mb-4">Catálogo de Productos Maestro</h2>
        
        <p-table 
            #dt 
            [value]="products" 
            [paginator]="true" 
            [rows]="10" 
            [rowHover]="true"
            [globalFilterFields]="['name','brand','model']"
            dataKey="id"
            currentPageReportTemplate="Mostrando del {first} al {last} de {totalRecords} registros"
            [showCurrentPageReport]="true">
            
            <ng-template #caption>
                <div class="flex flex-column sm:flex-row align-items-center gap-4">
                    <p-iconfield class="w-full sm:w-auto">
                        <p-inputicon class="pi pi-search" />
                        <input pInputText type="text" (input)="dt.filterGlobal($any($event.target).value, 'contains')" placeholder="Buscar por Nombre, Marca o Modelo..." class="w-full"/>
                    </p-iconfield>
                    <p-button label="Nuevo Producto" icon="pi pi-plus" severity="primary" routerLink="/inventory/products/new"></p-button>
                </div>
            </ng-template>

            <ng-template #header>
                <tr>
                    <th pSortableColumn="name">Producto <p-sortIcon field="name"></p-sortIcon></th>
                    <th pSortableColumn="brand">Marca <p-sortIcon field="brand"></p-sortIcon></th>
                    <th pSortableColumn="model">Modelo <p-sortIcon field="model"></p-sortIcon></th>
                    <th>Variantes</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                </tr>
            </ng-template>

            <ng-template #body let-product>
                <tr>
                    <td>{{ product.name }}</td>
                    <td>{{ product.brand || '---' }}</td>
                    <td>{{ product.model || '---' }}</td>
                    <td>
                        <span class="px-2 py-1 bg-surface-100 dark:bg-surface-700 rounded-md text-sm border border-surface-200 dark:border-surface-600">
                             {{ product.has_variants ? 'Múltiples SKU' : 'Normal (1 SKU)' }}
                        </span>
                    </td>
                    <td>
                        <i class="pi" [ngClass]="{'true-icon pi-check-circle text-green-500': product.is_active, 'false-icon pi-times-circle text-red-500': !product.is_active}"></i>
                    </td>
                    <td class="flex gap-2">
                        <p-button icon="pi pi-pencil" [rounded]="true" [outlined]="true" [routerLink]="['/inventory/products', product.id]"></p-button>
                        <p-button *if="product.has_variants" icon="pi pi-th-large" [rounded]="true" [outlined]="true" severity="info" [routerLink]="['/inventory/products', product.id, 'variants']" pTooltip="Gestionar Tallas/Colores"></p-button>
                    </td>
                </tr>
            </ng-template>

            <ng-template #emptymessage>
                <tr>
                    <td colspan="6" class="text-center p-4">No se encontraron productos. Registra el primero.</td>
                </tr>
            </ng-template>
        </p-table>
    </div>
  `
})
export class ProductListComponent implements OnInit {
  products: Product[] = [];
  productService = inject(ProductService);

  ngOnInit() {
    this.loadProducts();
  }

  loadProducts() {
    this.productService.getProducts().subscribe({
      next: (data) => {
          this.products = data;
      },
      error: (err) => console.error('Error loading products', err)
    });
  }
}

