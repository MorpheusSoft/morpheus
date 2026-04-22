import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { StockService, StockPicking } from '../services/stock.service';

@Component({
  selector: 'app-picking-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2>Operaciones de Stock</h2>
        <button class="btn btn-primary" routerLink="/stock/pickings/new">
            <i class="bi bi-plus-lg"></i> Nueva Operación
        </button>
      </div>

      <div class="card">
        <div class="card-body p-0">
          <table class="table table-hover mb-0">
            <thead class="table-light">
              <tr>
                <th>Referencia</th>
                <th>Documento Origen</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let pick of pickings">
                <td>
                    <a [routerLink]="['/stock/pickings', pick.id]" class="text-decoration-none fw-bold">
                        {{ pick.name }}
                    </a>
                </td>
                <td>{{ pick.origin_document || '-' }}</td>
                <td>
                    <span class="badge" 
                        [ngClass]="{
                            'text-bg-secondary': pick.status === 'DRAFT',
                            'text-bg-success': pick.status === 'DONE',
                            'text-bg-primary': pick.status === 'CONFIRMED'
                        }">
                        {{ pick.status }}
                    </span>
                </td>
                <td>
                    <a [routerLink]="['/stock/pickings', pick.id]" class="btn btn-sm btn-outline-primary">
                        Ver
                    </a>
                </td>
              </tr>
              <tr *ngIf="pickings.length === 0">
                <td colspan="4" class="text-center py-3">No hay operaciones registradas.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
})
export class PickingListComponent implements OnInit {
  pickings: StockPicking[] = [];

  constructor(private stockService: StockService) { }

  ngOnInit(): void {
    this.stockService.getPickings().subscribe({
      next: (data) => this.pickings = data,
      error: (err) => console.error('Error loading pickings', err)
    });
  }
}
