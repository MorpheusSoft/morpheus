import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InventoryService, InventorySession, InventorySessionCreate } from '../../../core/services/inventory.service';

@Component({
    selector: 'app-inventory-dashboard',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    template: `
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2>Auditorías de Inventario</h2>
        <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#newSessionModal">
            <i class="bi bi-plus-lg"></i> Nueva Sesión
        </button>
      </div>

      <div class="card">
        <div class="card-body p-0">
          <table class="table table-hover mb-0">
            <thead class="table-light">
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Almacén</th>
                <th>Estado</th>
                <th>Fecha Inicio</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let sess of sessions">
                <td>{{ sess.id }}</td>
                <td>
                    <a [routerLink]="['/inventory', sess.id]" class="text-decoration-none fw-bold">
                        {{ sess.name }}
                    </a>
                </td>
                <td>{{ sess.warehouse_id || 'Todos' }}</td>
                <td>
                    <span class="badge" 
                        [ngClass]="{
                            'text-bg-secondary': sess.state === 'DRAFT',
                            'text-bg-warning': sess.state === 'IN_PROGRESS',
                            'text-bg-success': sess.state === 'DONE',
                            'text-bg-danger': sess.state === 'CANCELLED'
                        }">
                        {{ sess.state }}
                    </span>
                </td>
                <td>{{ sess.date_start | date:'short' }}</td>
                <td>
                    <a [routerLink]="['/inventory', sess.id]" class="btn btn-sm btn-outline-primary">
                        Gestionar
                    </a>
                </td>
              </tr>
              <tr *ngIf="sessions.length === 0">
                <td colspan="6" class="text-center py-3">No hay sesiones activas.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal New Session -->
    <div class="modal fade" id="newSessionModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Nueva Auditoría</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <form (ngSubmit)="createSession()" #sessForm="ngForm">
                <div class="mb-3">
                    <label class="form-label">Nombre de la Sesión</label>
                    <input type="text" class="form-control" [(ngModel)]="newSession.name" name="name" required placeholder="Ej. Auditoría Anual 2026">
                </div>
                <!-- Facility/Warehouse Selectors logic could go here -->
                <div class="alert alert-info small">
                    Por defecto se creará para el almacén principal.
                </div>
                <div class="d-flex justify-content-end">
                    <button type="button" class="btn btn-secondary me-2" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" class="btn btn-primary" [disabled]="!sessForm.form.valid" data-bs-dismiss="modal">Crear</button>
                </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  `
})
export class InventoryDashboardComponent implements OnInit {
    sessions: InventorySession[] = [];

    newSession: InventorySessionCreate = {
        name: '',
        facility_id: 1 // Hardcoded Main Facility for MVP
    };

    constructor(private inventoryService: InventoryService) { }

    ngOnInit(): void {
        this.loadSessions();
    }

    loadSessions() {
        this.inventoryService.getSessions().subscribe({
            next: (data) => this.sessions = data,
            error: (err) => console.error(err)
        });
    }

    createSession() {
        this.inventoryService.createSession(this.newSession).subscribe({
            next: (sess) => {
                this.sessions.push(sess);
                this.newSession.name = '';
            },
            error: (err) => alert("Error: " + err.message)
        });
    }
}
