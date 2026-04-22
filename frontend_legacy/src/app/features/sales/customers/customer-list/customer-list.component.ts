import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CustomerService, Customer } from '../../services/customer.service';

@Component({
    selector: 'app-customer-list',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    template: `
    <div class="container-fluid py-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 class="fw-bold text-dark mb-0">Clientes</h2>
          <p class="text-muted mb-0">Gestión del maestro de clientes</p>
        </div>
        <button class="btn btn-primary shadow-sm" routerLink="new">
          <i class="bi bi-plus-lg me-2"></i>Nuevo Cliente
        </button>
      </div>

      <div class="card border-0 shadow-sm rounded-3">
        <div class="card-body p-0">
          <div class="p-4 border-bottom d-flex gap-3 bg-light rounded-top">
            <div class="input-group" style="max-width: 400px;">
              <span class="input-group-text bg-white border-end-0 text-muted"><i class="bi bi-search"></i></span>
              <input type="text" class="form-control border-start-0 ps-0" placeholder="Buscar por nombre o RIF..." [(ngModel)]="searchTerm" (input)="filterCustomers()">
            </div>
          </div>

          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th class="ps-4 text-uppercase text-secondary small fw-semibold">RIF</th>
                  <th class="text-uppercase text-secondary small fw-semibold">Nombre</th>
                  <th class="text-uppercase text-secondary small fw-semibold">Teléfono</th>
                  <th class="text-uppercase text-secondary small fw-semibold">Estado</th>
                  <th class="text-end pe-4 text-uppercase text-secondary small fw-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let customer of filteredCustomers">
                  <td class="ps-4 fw-medium">{{ customer.rif }}</td>
                  <td>
                    <div class="fw-bold text-dark">{{ customer.name }}</div>
                    <div class="small text-muted">{{ customer.email || 'Sin correo' }}</div>
                  </td>
                  <td>{{ customer.phone || '-' }}</td>
                  <td>
                    <span class="badge" [ngClass]="customer.is_active ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'">
                      {{ customer.is_active ? 'Activo' : 'Inactivo' }}
                    </span>
                  </td>
                  <td class="text-end pe-4">
                    <button class="btn btn-sm btn-icon btn-ghost-secondary me-2" [routerLink]="['edit', customer.id]" title="Editar">
                      <i class="bi bi-pencil"></i>
                    </button>
                  </td>
                </tr>
                <tr *ngIf="filteredCustomers.length === 0">
                  <td colspan="5" class="text-center py-5 text-muted">
                    <i class="bi bi-inbox fs-1 d-block mb-3"></i>
                    No se encontraron clientes
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .btn-icon { width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; }
    .btn-ghost-secondary { color: #64748b; background: transparent; border: 1px solid transparent; }
    .btn-ghost-secondary:hover { background: #f1f5f9; color: #0f172a; }
    .bg-success-subtle { background-color: #d1fae5 !important; }
    .text-success { color: #059669 !important; }
    .bg-danger-subtle { background-color: #fee2e2 !important; }
    .text-danger { color: #dc2626 !important; }
  `]
})
export class CustomerListComponent implements OnInit {
    customers: Customer[] = [];
    filteredCustomers: Customer[] = [];
    searchTerm: string = '';

    constructor(private customerService: CustomerService) { }

    ngOnInit(): void {
        this.loadCustomers();
    }

    loadCustomers(): void {
        this.customerService.getCustomers().subscribe({
            next: (data) => {
                this.customers = data;
                this.filteredCustomers = data;
            },
            error: (err) => console.error('Error fetching customers', err)
        });
    }

    filterCustomers(): void {
        const term = this.searchTerm.toLowerCase();
        this.filteredCustomers = this.customers.filter(c =>
            c.name.toLowerCase().includes(term) ||
            c.rif.toLowerCase().includes(term)
        );
    }
}
