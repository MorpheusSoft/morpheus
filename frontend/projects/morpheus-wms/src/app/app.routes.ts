import { Routes } from '@angular/router';

export const routes: Routes = [
  {
      path: 'inventory',
      children: [
          {
              path: 'categories',
              loadComponent: () => import('./features/inventory/category-list/category-list.component').then(m => m.CategoryListComponent)
          },
          {
              path: 'products',
              loadComponent: () => import('./features/inventory/product-list/product-list.component').then(m => m.ProductListComponent)
          },
          {
              path: 'products/new',
              loadComponent: () => import('./features/inventory/product-form/product-form.component').then(m => m.ProductFormComponent)
          },
          {
              path: 'products/:id',
              loadComponent: () => import('./features/inventory/product-form/product-form.component').then(m => m.ProductFormComponent)
          },
          {
              path: 'products/:id/variants',
              loadComponent: () => import('./features/inventory/product-variants/product-variants.component').then(m => m.ProductVariantsComponent)
          }
      ]
  },
  {
      path: '',
      redirectTo: 'inventory/products',
      pathMatch: 'full'
  }
];
