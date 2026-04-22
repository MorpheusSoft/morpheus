import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { StockService, StockPicking, StockMove, StockMoveCreate } from '../services/stock.service';
import { ProductService, Product, ProductVariant } from '../../catalog/services/product.service';

@Component({
  selector: 'app-picking-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="container-fluid" *ngIf="picking">
      <!-- Header -->
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
            <h2 class="mb-0">{{ picking.name }}</h2>
            <span class="badge" 
                [ngClass]="{
                    'text-bg-secondary': picking.status === 'DRAFT',
                    'text-bg-success': picking.status === 'DONE',
                    'text-bg-primary': picking.status === 'CONFIRMED'
                }">
                {{ picking.status }}
            </span>
            <small class="text-muted ms-2" *ngIf="picking.origin_document">Source: {{ picking.origin_document }}</small>
        </div>
        <div class="d-flex gap-2">
            <button class="btn btn-secondary" routerLink="/stock/pickings">Volver</button>
            <button class="btn btn-success" *ngIf="picking.status === 'DRAFT'" (click)="validatePicking()">
                <i class="bi bi-check-lg"></i> Validar
            </button>
        </div>
      </div>

      <!-- Moves List -->
      <div class="card mb-3">
        <div class="card-header">Movimientos</div>
        <div class="card-body p-0">
          <table class="table mb-0">
            <thead>
              <tr>
                <th>Producto</th>
                <th>De</th>
                <th>Para</th>
                <th>Demanda</th>
                <th>Hecho</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <!-- Actually we need to fetch moves separate or picking includes them? 
                   Backend getPicking returns it? Let's assume we need to fetch or it's included.
                   Backend currently DOES NOT include moves in getPicking detail endpoint by default unless eager loaded.
                   Wait, my backend getPicking filtered only by ID. It doesn't join moves.
                   I probably need to update Backend or make a separate call.
                   Let's check if I can assume empty for MVP or update backend.
                   Actually, looking at backend model, relationship is lazy.
                   I will update backend to eager load OR add endpoint /pickings/id/moves.
                   For now, let's assume I'll fix backend to return moves.
               -->
               <!-- Temp placeholder -->
               <tr *ngIf="!moves || moves.length === 0">
                 <td colspan="6" class="text-center">No hay movimientos.</td>
               </tr>
               <tr *ngFor="let move of moves">
                   <td>{{ move.product_id }}</td> <!-- ID for now -->
                   <td>{{ move.location_src_id }}</td>
                   <td>{{ move.location_dest_id }}</td>
                   <td>{{ move.quantity_demand }}</td>
                   <td>{{ move.quantity_done }}</td>
                   <td>{{ move.state }}</td>
               </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Add Move Form (Only DRAFT) -->
      <div class="card" *ngIf="picking.status === 'DRAFT'">
         <div class="card-header">Agregar Movimiento</div>
         <div class="card-body">
             <form (ngSubmit)="addMove()" #moveForm="ngForm" class="row g-3">
                 <div class="col-md-4">
                     <label class="form-label">Producto</label>
                     <select class="form-select" [(ngModel)]="newMove.product_id" name="product_id" required>
                         <option *ngFor="let p of products" [value]="p.id">{{ p.name }}</option>
                     </select>
                 </div>
                 <div class="col-md-2">
                     <label class="form-label">Cantidad</label>
                     <input type="number" class="form-control" [(ngModel)]="newMove.quantity_demand" name="qty" required>
                 </div>
                 <!-- Src/Dest should probably be pre-filled based on Picking Type logic BUT for MVP manual select is ok or hardcode -->
                 <div class="col-md-3">
                     <label class="form-label">Origen (ID)</label>
                     <input type="number" class="form-control" [(ngModel)]="newMove.location_src_id" name="src" required> 
                 </div>
                 <div class="col-md-3">
                     <label class="form-label">Destino (ID)</label>
                     <input type="number" class="form-control" [(ngModel)]="newMove.location_dest_id" name="dest" required>
                 </div>
                 <div class="col-12 text-end">
                     <button type="submit" class="btn btn-primary" [disabled]="!moveForm.form.valid">Agregar</button>
                 </div>
             </form>
         </div>
      </div>

    </div>
  `
})
export class PickingDetailComponent implements OnInit {
  picking: StockPicking | null = null;
  moves: StockMove[] = []; // We need to fetch these
  products: Product[] = [];

  newMove: StockMoveCreate = {
    picking_id: 0,
    product_id: 0,
    quantity_demand: 1,
    location_src_id: 0,
    location_dest_id: 0
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private stockService: StockService,
    private productService: ProductService
  ) { }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const pickingId = +id;
      this.loadPicking(pickingId);
      this.loadProducts();
    }
  }

  loadPicking(id: number) {
    this.stockService.getPicking(id).subscribe({
      next: (p) => {
        this.picking = p;
        this.newMove.picking_id = p.id;
        // TODO: Fetch moves. Currently backend might not return them.
        // I should update backend to return moves or add a getMoves endpoint.
        // For now assuming we cant see them until I fix backend.
      },
      error: (e) => console.error(e)
    });
  }

  loadProducts() {
    this.productService.getProducts().subscribe(p => this.products = p);
  }

  addMove() {
    this.stockService.addMove(this.picking!.id, this.newMove).subscribe({
      next: (m) => {
        alert("Movimiento agregado");
        this.moves.push(m);
      },
      error: (err) => alert("Error: " + err.message)
    });
  }

  validatePicking() {
    if (confirm('¿Seguro de validar esta operación?')) {
      this.stockService.validatePicking(this.picking!.id).subscribe({
        next: (p) => {
          this.picking = p;
          alert("Operación Validada");
        },
        error: (err) => alert("Error al validar: " + err.message)
      });
    }
  }
}
