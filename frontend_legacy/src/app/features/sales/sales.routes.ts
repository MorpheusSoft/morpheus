import { Routes } from '@angular/router';
import { CustomerListComponent } from './customers/customer-list/customer-list.component';
import { CustomerFormComponent } from './customers/customer-form/customer-form.component';

export const salesRoutes: Routes = [
    {
        path: '',
        redirectTo: 'customers',
        pathMatch: 'full'
    },
    {
        path: 'customers',
        component: CustomerListComponent
    },
    {
        path: 'customers/new',
        component: CustomerFormComponent
    },
    {
        path: 'customers/edit/:id',
        component: CustomerFormComponent
    },
    {
        path: 'orders',
        loadComponent: () => import('./orders/order-list/order-list.component').then(m => m.OrderListComponent)
    },
    {
        path: 'orders/:id',
        loadComponent: () => import('./orders/order-detail/order-detail.component').then(m => m.OrderDetailComponent)
    }
];
