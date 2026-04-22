import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { OrderService, Order } from '../../services/order.service';

@Component({
    selector: 'app-order-detail',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    template: `
    <div class="container-fluid py-4" *ngIf="order">
        <div class="d-flex align-items-center justify-content-between mb-4">
            <div class="d-flex align-items-center">
                <button class="btn btn-icon btn-ghost-secondary me-3" routerLink="/sales/orders">
                    <i class="bi bi-arrow-left"></i>
                </button>
                <div>
                   <h2 class="fw-bold text-dark mb-0">Pedido #{{ order.id }}</h2>
                   <p class="text-muted mb-0">Fecha: {{ order.created_at | date:'medium' }}</p>
                </div>
            </div>
            
            <div>
                <span class="badge fs-5 rounded-pill me-3" 
                      [ngClass]="{
                        'bg-warning text-dark': order.status === 'PENDING',
                        'bg-success': order.status === 'INVOICED',
                        'bg-danger': order.status === 'CANCELLED'
                      }">
                    {{ order.status }}
                </span>
                
                <button *ngIf="order.status === 'PENDING'" class="btn btn-success shadow-sm me-2" (click)="updateStatus('INVOICED')">
                    <i class="bi bi-check-circle me-1"></i> Facturar
                </button>
                <button *ngIf="order.status === 'PENDING'" class="btn btn-outline-danger shadow-sm" (click)="updateStatus('CANCELLED')">
                    <i class="bi bi-x-circle me-1"></i> Cancelar
                </button>
            </div>
        </div>

        <div class="row">
            <div class="col-lg-8">
                <div class="card border-0 shadow-sm rounded-3 mb-4">
                    <div class="card-header bg-white py-3 border-bottom">
                        <h5 class="fw-bold text-dark mb-0">Artículos del Pedido</h5>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th class="ps-4">ID Producto</th>
                                    <th class="text-center">Cant.</th>
                                    <th class="text-end">P. Unitario</th>
                                    <th class="text-end pe-4">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr *ngFor="let item of order.items">
                                    <td class="ps-4">{{ item.product_id }}</td>
                                    <td class="text-center">{{ item.quantity }}</td>
                                    <td class="text-end">{{ item.unit_price | currency }}</td>
                                    <td class="text-end pe-4 fw-semibold">{{ item.subtotal | currency }}</td>
                                </tr>
                                <tr *ngIf="!order.items || order.items.length === 0">
                                    <td colspan="4" class="text-center py-4 text-muted">No hay artículos.</td>
                                </tr>
                            </tbody>
                            <tfoot class="table-light">
                                <tr>
                                    <td colspan="3" class="text-end fw-bold">Total:</td>
                                    <td class="text-end pe-4 fw-bold fs-5 text-primary">{{ order.total_amount | currency }}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
            
            <div class="col-lg-4">
                <div class="card border-0 shadow-sm rounded-3 mb-4">
                    <div class="card-header bg-white py-3 border-bottom">
                        <h5 class="fw-bold text-dark mb-0">Información del Cliente</h5>
                    </div>
                    <div class="card-body">
                        <!-- We only have ID dynamically loaded without expanding the relations, but it's MVP -->
                        <p class="mb-1"><span class="text-muted">ID Cliente:</span> <strong class="ms-2">{{ order.customer_id }}</strong></p>
                    </div>
                </div>
                
                <div class="card border-0 shadow-sm rounded-3">
                    <div class="card-header bg-white py-3 border-bottom">
                        <h5 class="fw-bold text-dark mb-0">Notas Adicionales</h5>
                    </div>
                    <div class="card-body">
                        <p class="mb-0 text-muted">{{ order.notes || 'Sin notas.' }}</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="container-fluid py-5 text-center" *ngIf="!order">
        <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Cargando...</span>
        </div>
    </div>
    `,
    styles: [`
        .btn-icon { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; }
        .btn-ghost-secondary { color: #64748b; background: transparent; border: 1px solid #e2e8f0; }
        .btn-ghost-secondary:hover { background: #f1f5f9; color: #334155; }
    `]
})
export class OrderDetailComponent implements OnInit {
    order: Order | null = null;
    orderId!: number;

    constructor(
        private route: ActivatedRoute,
        private orderService: OrderService,
        private router: Router
    ) { }

    ngOnInit(): void {
        this.route.params.subscribe(params => {
            if (params['id']) {
                this.orderId = +params['id'];
                this.loadOrder();
            }
        });
    }

    loadOrder(): void {
        this.orderService.getOrder(this.orderId).subscribe({
            next: (data) => this.order = data,
            error: (err) => {
                console.error('Error fetching order:', err);
                alert("Error al cargar el pedido.")
                this.router.navigate(['/sales/orders']);
            }
        });
    }

    updateStatus(newStatus: string): void {
        if (!confirm(`¿Está seguro de cambiar el estado a ${newStatus}?`)) return;

        this.orderService.updateOrderStatus(this.orderId, newStatus).subscribe({
            next: (data) => {
                this.order = data;
                alert("Estado actualizado exitosamente.");
            },
            error: (err) => {
                console.error('Error updating status:', err);
                alert("Error al actualizar el estado.");
            }
        });
    }
}
