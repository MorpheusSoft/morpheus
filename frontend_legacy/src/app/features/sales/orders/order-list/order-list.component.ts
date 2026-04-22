import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { OrderService, Order } from '../../services/order.service';

@Component({
    selector: 'app-order-list',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    template: `
    <div class="container-fluid py-4">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <div>
                <h2 class="h3 mb-0 text-gray-800 fw-bold">Gestión de Pedidos</h2>
                <p class="text-muted mb-0">Bandeja de pedidos recibidos</p>
            </div>
        </div>

        <div class="card shadow-sm border-0 rounded-3">
            <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
                <div class="input-group" style="width: 300px;">
                    <span class="input-group-text bg-light border-end-0"><i class="bi bi-search"></i></span>
                    <input type="text" class="form-control border-start-0 bg-light" placeholder="Buscar pedido..." [(ngModel)]="searchTerm" (input)="filterOrders()">
                </div>
                <div>
                     <select class="form-select" [(ngModel)]="statusFilter" (change)="filterOrders()">
                         <option value="">Todos los Estados</option>
                         <option value="PENDING">Pendientes</option>
                         <option value="INVOICED">Facturados</option>
                         <option value="CANCELLED">Cancelados</option>
                     </select>
                </div>
            </div>
            
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th class="ps-4">ID Pedido</th>
                            <th>Cliente (ID)</th>
                            <th>Fecha</th>
                            <th>Total</th>
                            <th>Estado</th>
                            <th class="text-end pe-4">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr *ngFor="let order of filteredOrders">
                            <td class="ps-4 fw-bold">#{{ order.id }}</td>
                            <td>{{ order.customer_id }}</td>
                            <td>{{ order.created_at | date:'short' }}</td>
                            <td class="fw-semibold">{{ order.total_amount | currency }}</td>
                            <td>
                                <span class="badge rounded-pill" 
                                      [ngClass]="{
                                        'bg-warning text-dark': order.status === 'PENDING',
                                        'bg-success': order.status === 'INVOICED',
                                        'bg-danger': order.status === 'CANCELLED'
                                      }">
                                    {{ order.status }}
                                </span>
                            </td>
                            <td class="text-end pe-4">
                                <a [routerLink]="['/sales/orders', order.id]" class="btn btn-sm btn-outline-primary">
                                    <i class="bi bi-eye"></i> Detalle
                                </a>
                            </td>
                        </tr>
                        <tr *ngIf="filteredOrders.length === 0">
                            <td colspan="6" class="text-center py-4 text-muted">
                                No se encontraron pedidos.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `
})
export class OrderListComponent implements OnInit {
    orders: Order[] = [];
    filteredOrders: Order[] = [];
    searchTerm: string = '';
    statusFilter: string = '';

    constructor(private orderService: OrderService) { }

    ngOnInit(): void {
        this.loadOrders();
    }

    loadOrders(): void {
        this.orderService.getOrders().subscribe({
            next: (data) => {
                this.orders = data;
                this.filteredOrders = data;
            },
            error: (err) => console.error('Error fetching orders:', err)
        });
    }

    filterOrders(): void {
        this.filteredOrders = this.orders.filter(order => {
            const matchStatus = this.statusFilter ? order.status === this.statusFilter : true;
            const matchSearch = String(order.id).includes(this.searchTerm) || String(order.customer_id).includes(this.searchTerm);
            return matchStatus && matchSearch;
        });
    }
}
