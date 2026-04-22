import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { MainLayoutComponent } from './layout/main-layout/main-layout.component';

export const routes: Routes = [
    { path: 'login', component: LoginComponent },
    {
        path: '',
        component: MainLayoutComponent,
        children: [
            { path: 'dashboard', component: DashboardComponent },

            // Catalog Routes
            { path: 'catalog/categories', loadComponent: () => import('./features/catalog/category-list/category-list.component').then(m => m.CategoryListComponent) },
            { path: 'catalog/categories/new', loadComponent: () => import('./features/catalog/category-form/category-form.component').then(m => m.CategoryFormComponent) },
            { path: 'catalog/categories/edit/:id', loadComponent: () => import('./features/catalog/category-form/category-form.component').then(m => m.CategoryFormComponent) },
            { path: 'catalog/products', loadComponent: () => import('./features/catalog/product-list/product-list.component').then(m => m.ProductListComponent) },
            { path: 'catalog/products/new', loadComponent: () => import('./features/catalog/product-form/product-form.component').then(m => m.ProductFormComponent) },
            { path: 'catalog/products/edit/:id', loadComponent: () => import('./features/catalog/product-form/product-form.component').then(m => m.ProductFormComponent) },

            // Stock Routes
            { path: 'stock/pickings', loadComponent: () => import('./features/stock/picking-list/picking-list.component').then(m => m.PickingListComponent) },
            { path: 'stock/pickings/:id', loadComponent: () => import('./features/stock/picking-detail/picking-detail.component').then(m => m.PickingDetailComponent) },

            { path: 'products', redirectTo: 'catalog/products', pathMatch: 'full' },
            { path: 'inventory', loadComponent: () => import('./features/inventory/dashboard/inventory-dashboard.component').then(m => m.InventoryDashboardComponent) },
            { path: 'inventory/bulk/upload', loadComponent: () => import('./features/inventory/bulk-upload/bulk-upload.component').then(m => m.BulkUploadComponent) },
            { path: 'inventory/:id', loadComponent: () => import('./features/inventory/detail/inventory-detail.component').then(m => m.InventoryDetailComponent) },

            // Sales Routes
            { path: 'sales', loadChildren: () => import('./features/sales/sales.routes').then(m => m.salesRoutes) },

            { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
        ]
    },
    { path: '**', redirectTo: '' }
];
