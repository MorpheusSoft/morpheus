import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { CustomerService, Customer } from '../../services/customer.service';

@Component({
    selector: 'app-customer-form',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    template: `
    <div class="container-fluid py-4 pb-5">
      <div class="d-flex align-items-center mb-4">
        <button class="btn btn-icon btn-ghost-secondary me-3" routerLink="/sales/customers">
            <i class="bi bi-arrow-left"></i>
        </button>
        <h2 class="fw-bold text-dark mb-0">{{ isEdit ? 'Editar Cliente' : 'Nuevo Cliente' }}</h2>
      </div>

      <div class="row">
        <div class="col-lg-8">
          <div class="card border-0 shadow-sm rounded-3">
            <div class="card-body p-4">
              <form (ngSubmit)="onSubmit()" #custForm="ngForm">
                
                <h5 class="fw-bold mb-4 text-primary"><i class="bi bi-person-badge me-2"></i>Datos Principales</h5>
                
                <div class="row g-4 mb-4">
                  <div class="col-md-4">
                    <label class="form-label fw-semibold small text-uppercase text-secondary">Identificación / RIF *</label>
                    <input type="text" class="form-control" name="rif" [(ngModel)]="customer.rif" required placeholder="Ej. J-12345678-9" [disabled]="isEdit">
                  </div>
                  <div class="col-md-8">
                    <label class="form-label fw-semibold small text-uppercase text-secondary">Razón Social / Nombre *</label>
                    <input type="text" class="form-control" name="name" [(ngModel)]="customer.name" required placeholder="Nombre completo o Empresa">
                  </div>
                </div>

                <hr class="text-light my-4">
                <h5 class="fw-bold mb-4 text-primary"><i class="bi bi-envelope me-2"></i>Contacto y Direcciones</h5>

                <div class="row g-4 mb-4">
                  <div class="col-md-6">
                    <label class="form-label fw-semibold small text-uppercase text-secondary">Teléfono</label>
                    <input type="text" class="form-control" name="phone" [(ngModel)]="customer.phone" placeholder="+58 414 1234567">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label fw-semibold small text-uppercase text-secondary">Email</label>
                    <input type="email" class="form-control" name="email" [(ngModel)]="customer.email" placeholder="correo@ejemplo.com">
                  </div>
                  
                  <div class="col-12">
                    <label class="form-label fw-semibold small text-uppercase text-secondary">Dirección Fiscal / Principal</label>
                    <textarea class="form-control" name="address" [(ngModel)]="customer.address" rows="2" placeholder="Dirección oficial de la empresa"></textarea>
                  </div>

                  <div class="col-12">
                     <label class="form-label fw-semibold small text-uppercase text-secondary">Dirección de Despacho (Opcional)</label>
                    <textarea class="form-control" name="shipping_address" [(ngModel)]="customer.shipping_address" rows="2" placeholder="Lugar donde se entregan los pedidos..."></textarea>
                  </div>
                </div>

                <div class="form-check form-switch fs-5 mt-4">
                    <input class="form-check-input" type="checkbox" id="isActive" [(ngModel)]="customer.is_active" name="is_active">
                    <label class="form-check-label ms-2 align-middle fw-semibold text-dark" for="isActive">Cliente Activo</label>
                </div>

                <div class="d-flex justify-content-end gap-3 mt-5 pt-3 border-top">
                  <button type="button" class="btn btn-outline-secondary px-4" routerLink="/sales/customers">Cancelar</button>
                  <button type="submit" class="btn btn-primary px-5 shadow-sm" [disabled]="!custForm.valid || isSaving">
                      <span *ngIf="isSaving" class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      <i *ngIf="!isSaving" class="bi bi-save me-2"></i>{{ isSaving ? 'Guardando...' : 'Guardar Cliente' }}
                  </button>
                </div>

              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .btn-icon { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; }
    .btn-ghost-secondary { color: #64748b; background: transparent; border: 1px solid #e2e8f0; }
    .btn-ghost-secondary:hover { background: #f1f5f9; color: #334155; }
  `]
})
export class CustomerFormComponent implements OnInit {
    customer: Customer = {
        rif: '',
        name: '',
        is_active: true
    };
    isEdit = false;
    isSaving = false;
    customerId: number | null = null;

    constructor(
        private customerService: CustomerService,
        private router: Router,
        private route: ActivatedRoute
    ) { }

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (id) {
            this.isEdit = true;
            this.customerId = +id;
            this.loadCustomer(this.customerId);
        }
    }

    loadCustomer(id: number): void {
        this.customerService.getCustomer(id).subscribe({
            next: (data) => this.customer = data,
            error: (err) => {
                console.error('Error loading customer', err);
                alert('Error al cargar el cliente');
                this.router.navigate(['/sales/customers']);
            }
        });
    }

    onSubmit(): void {
        if (this.isSaving) return;
        this.isSaving = true;

        const request$ = this.isEdit && this.customerId
            ? this.customerService.updateCustomer(this.customerId, this.customer)
            : this.customerService.createCustomer(this.customer);

        request$.subscribe({
            next: () => {
                this.isSaving = false;
                alert(this.isEdit ? 'Cliente actualizado' : 'Cliente creado exitosamente');
                this.router.navigate(['/sales/customers']);
            },
            error: (err) => {
                this.isSaving = false;
                console.error('Error saving customer', err);
                alert('Error al guardar: ' + (err.error?.detail || err.message));
            }
        });
    }
}
