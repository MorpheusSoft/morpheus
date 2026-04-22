import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { InventoryService, InventorySession, InventoryLine, InventoryLineCreate } from '../../../core/services/inventory.service';
import { ProductService, Product, ProductVariant } from '../../catalog/services/product.service';

@Component({
    selector: 'app-inventory-detail',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    template: `
    <div class="container-fluid" *ngIf="session">
      <!-- Header -->
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
            <h2 class="mb-0">{{ session.name }}</h2>
            <span class="badge" 
                [ngClass]="{
                    'text-bg-secondary': session.state === 'DRAFT',
                    'text-bg-warning': session.state === 'IN_PROGRESS',
                    'text-bg-success': session.state === 'DONE',
                    'text-bg-danger': session.state === 'CANCELLED'
                }">
                {{ session.state }}
            </span>
            <small class="text-muted ms-2">{{ session.date_start | date:'short' }}</small>
        </div>
        <div class="d-flex gap-2">
            <button class="btn btn-secondary" routerLink="/inventory">Volver</button>
            <button class="btn btn-warning" *ngIf="session.state === 'DRAFT'" (click)="startSession()">
                <i class="bi bi-play-fill"></i> Iniciar
            </button>
            <button class="btn btn-success" *ngIf="session.state === 'IN_PROGRESS'" (click)="validateSession()">
                <i class="bi bi-check-lg"></i> Finalizar y Validar
            </button>
        </div>
      </div>

      <!-- Add Count Form (Only IN_PROGRESS) -->
      <div class="card mb-4" *ngIf="session.state === 'IN_PROGRESS'">
         <div class="card-header bg-light">
             <i class="bi bi-qr-code-scan"></i> Agregar Conteo
         </div>
         <div class="card-body">
             <form (ngSubmit)="addCount()" #countForm="ngForm" class="row g-3 align-items-center">
                 <div class="col-md-5">
                   <label class="visually-hidden">Producto</label>
                   <select class="form-select" [(ngModel)]="newCount.product_variant_id" name="prod" required>
                       <option [ngValue]="0" disabled>Seleccionar Producto...</option>
                       <option *ngFor="let p of products" [value]="p.id">{{ p.name }}</option>
                   </select>
                   <div class="form-text">Si tiene variantes, el select debe ser por variante (Pendiente mejorar UX)</div>
                 </div>
                 <div class="col-md-3">
                    <label class="visually-hidden">Cantidad Contada</label>
                    <div class="input-group">
                        <span class="input-group-text">#</span>
                        <input type="number" class="form-control" [(ngModel)]="newCount.counted_qty" name="qty" placeholder="Cant." required>
                    </div>
                 </div>
                 <div class="col-md-2">
                     <button type="submit" class="btn btn-primary w-100" [disabled]="!countForm.form.valid">Agregar</button>
                 </div>
             </form>
         </div>
      </div>

      <!-- Lines List -->
      <div class="card">
        <div class="card-header">Conteo vs. Teórico</div>
        <div class="card-body p-0">
          <table class="table mb-0">
            <thead class="table-light">
              <tr>
                <th>ID</th>
                <th>Producto (Variant ID)</th>
                <th>Locación</th>
                <th>Teórico</th>
                <th>Contado</th>
                <th>Diferencia</th>
              </tr>
            </thead>
            <tbody>
               <tr *ngFor="let line of session.lines">
                   <td>{{ line.id }}</td>
                   <td>{{ line.product_variant_id }}</td> 
                   <td>{{ line.location_id }}</td>
                   <td>{{ line.theoretical_qty }}</td>
                   <td><span class="fw-bold">{{ line.counted_qty }}</span></td>
                   <td>
                       <span [ngClass]="{
                           'text-danger fw-bold': line.difference_qty! < 0,
                           'text-success fw-bold': line.difference_qty! > 0,
                           'text-muted': line.difference_qty === 0
                       }">
                           {{ line.difference_qty! > 0 ? '+' : '' }}{{ line.difference_qty }}
                       </span>
                   </td>
               </tr>
               <tr *ngIf="!session.lines || session.lines.length === 0">
                 <td colspan="6" class="text-center py-3 text-muted">Aún no hay conteos registrados.</td>
               </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `
})
export class InventoryDetailComponent implements OnInit {
    session: InventorySession | null = null;
    products: Product[] = []; // Simplified for now, really should be Variants

    newCount: InventoryLineCreate = {
        product_variant_id: 0,
        location_id: 4, // Hardcoded Default Location (Stock) for MVP
        counted_qty: 0
    };

    constructor(
        private route: ActivatedRoute,
        private inventoryService: InventoryService,
        private productService: ProductService
    ) { }

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (id) {
            this.loadSession(+id);
            this.loadProducts();
        }
    }

    loadSession(id: number) {
        this.inventoryService.getSession(id).subscribe({
            next: (res) => this.session = res,
            error: (err) => console.error(err)
        });
    }

    loadProducts() {
        // In a real app we need a better selector for products/variants
        this.productService.getProducts().subscribe(p => this.products = p);
    }

    startSession() {
        if (this.session) {
            this.inventoryService.startSession(this.session.id).subscribe({
                next: (s) => this.session = s,
                error: (err) => alert("Error: " + err.message)
            });
        }
    }

    addCount() {
        if (this.session) {
            this.inventoryService.addLine(this.session.id, this.newCount).subscribe({
                next: (line) => {
                    // Backend creates/updates line. Ideally we refetch session or push to lines if frontend-state matches backend.
                    // For simplicity, reload session to get theoretical calc updates if any.
                    this.loadSession(this.session!.id);
                    this.newCount.counted_qty = 0; // Reset qty but keep product for rapid entry
                },
                error: (err) => alert("Error agregando conteo: " + err.message)
            });
        }
    }

    validateSession() {
        if (confirm('¿Finalizar inventario y aplicar ajustes de stock?')) {
            this.inventoryService.validateSession(this.session!.id).subscribe({
                next: (s) => {
                    this.session = s;
                    alert("Inventario validado exitosamente.");
                },
                error: (err) => alert("Error al validar: " + err.message)
            });
        }
    }
}
