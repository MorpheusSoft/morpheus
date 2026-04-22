import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
    selector: 'app-bulk-upload',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="container-fluid py-4 pb-5">
      <div class="d-flex align-items-center mb-4">
        <button class="btn btn-icon btn-ghost-secondary me-3" onclick="history.back()">
            <i class="bi bi-arrow-left"></i>
        </button>
        <div>
           <h2 class="fw-bold text-dark mb-0">Importación Masiva</h2>
           <p class="text-muted mb-0">Carga inventario inicial o actualiza desde Excel/CSV</p>
        </div>
      </div>

      <div class="row">
        <div class="col-lg-8">
            <div class="card border-0 shadow-sm rounded-3 mb-4">
                <div class="card-body p-4 text-center">
                    <h5 class="fw-bold text-dark mb-3">Sube tu archivo CSV</h5>
                    
                    <div class="border border-2 border-dashed rounded-3 p-5 bg-light position-relative"
                         [ngClass]="{'border-primary bg-primary-subtle': isDragging}"
                         (dragover)="onDragOver($event)"
                         (dragleave)="onDragLeave($event)"
                         (drop)="onDrop($event)">
                         
                         <i class="bi bi-cloud-arrow-up fs-1 text-primary mb-3 d-block"></i>
                         
                         <strong class="d-block mb-1 fs-5">Arrastra y suelta aquí</strong>
                         <span class="text-muted small d-block mb-3">o</span>
                         
                         <button class="btn btn-primary px-4 shadow-sm position-relative">
                             <input type="file" class="position-absolute top-0 start-0 w-100 h-100 opacity-0" style="cursor: pointer;" (change)="onFileSelected($event)" accept=".csv">
                             Examinar Equipo
                         </button>
                         
                         <div *ngIf="selectedFile" class="mt-4 p-3 bg-white border rounded d-inline-block text-start" style="min-width: 250px;">
                             <div class="d-flex align-items-center">
                                 <i class="bi bi-filetype-csv fs-4 text-success me-3"></i>
                                 <div class="me-auto">
                                     <strong class="d-block small">{{ selectedFile.name }}</strong>
                                     <span class="text-muted" style="font-size: 0.75rem;">{{ (selectedFile.size / 1024).toFixed(1) }} KB</span>
                                 </div>
                                 <button class="btn btn-sm btn-close ms-3" (click)="selectedFile = null"></button>
                             </div>
                         </div>
                    </div>

                    <div class="text-start mt-4 alert alert-info">
                        <h6 class="fw-bold fs-6"><i class="bi bi-info-circle me-2"></i>Formato requerido:</h6>
                        <ul class="small mb-0">
                            <li>El archivo debe ser en formato <strong>CSV</strong> (separado por comas).</li>
                            <li>La primera fila debe contener los encabezados exactos: <code>sku, name, price, quantity</code></li>
                            <li>Las columnas <code>sku</code> y <code>name</code> son obligatorias.</li>
                        </ul>
                    </div>

                    <div class="mt-4 text-end">
                        <button class="btn btn-success px-5 shadow-sm" [disabled]="!selectedFile || isUploading" (click)="uploadFile()">
                            <span *ngIf="isUploading" class="spinner-border spinner-border-sm me-2"></span>
                            <i *ngIf="!isUploading" class="bi bi-play-fill me-1"></i>
                            {{ isUploading ? 'Procesando...' : 'Iniciar Importación' }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- RESULTADOS -->
            <div class="card border-0 shadow-sm rounded-3 bg-light" *ngIf="uploadResult">
                <div class="card-header bg-white border-bottom-0 pt-4 pb-0">
                    <h5 class="fw-bold text-dark"><i class="bi bi-check-circle text-success me-2"></i>Resultados de Importación</h5>
                </div>
                <div class="card-body">
                    <div class="row g-3 text-center mb-4">
                        <div class="col">
                            <div class="p-3 bg-white border rounded shadow-sm">
                                <h3 class="text-primary mb-0 fw-bold">{{ uploadResult.created }}</h3>
                                <span class="text-muted small text-uppercase fw-semibold">Creados</span>
                            </div>
                        </div>
                        <div class="col">
                            <div class="p-3 bg-white border rounded shadow-sm">
                                <h3 class="text-info mb-0 fw-bold">{{ uploadResult.updated }}</h3>
                                <span class="text-muted small text-uppercase fw-semibold">Activados / Actualizados</span>
                            </div>
                        </div>
                        <div class="col" *ngIf="uploadResult.stock_moves_created !== undefined">
                            <div class="p-3 bg-white border rounded shadow-sm">
                                <h3 class="text-success mb-0 fw-bold">{{ uploadResult.stock_moves_created }}</h3>
                                <span class="text-muted small text-uppercase fw-semibold">Movimientos</span>
                            </div>
                        </div>
                    </div>

                    <div *ngIf="uploadResult.errors?.length > 0" class="alert alert-danger mb-0">
                        <h6 class="fw-bold"><i class="bi bi-exclamation-triangle me-2"></i>Advertencias / Errores:</h6>
                        <ul class="mb-0 small ps-3 text-break">
                            <li *ngFor="let err of uploadResult.errors">{{ err }}</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .border-dashed { border-style: dashed !important; border-color: #cbd5e1 !important; }
    .btn-icon { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; }
    .btn-ghost-secondary { color: #64748b; background: transparent; border: 1px solid #e2e8f0; }
    .btn-ghost-secondary:hover { background: #f1f5f9; color: #334155; }
    .bg-primary-subtle { background-color: #eff6ff !important; border-color: #3b82f6 !important;}
  `]
})
export class BulkUploadComponent {
    isDragging = false;
    selectedFile: File | null = null;
    isUploading = false;
    uploadResult: any = null;

    constructor(private http: HttpClient) { }

    onDragOver(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = true;
    }

    onDragLeave(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = false;
    }

    onDrop(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging = false;

        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.name.endsWith('.csv')) {
                this.selectedFile = file;
                this.uploadResult = null;
            } else {
                alert("Por favor, sube únicamente archivos CSV.");
            }
        }
    }

    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            if (file.name.endsWith('.csv')) {
                this.selectedFile = file;
                this.uploadResult = null;
            } else {
                alert("Por favor, seleccione un archivo CSV.");
            }
        }
    }

    uploadFile() {
        if (!this.selectedFile) return;

        this.isUploading = true;
        this.uploadResult = null;

        const formData = new FormData();
        formData.append('file', this.selectedFile);

        this.http.post(`${environment.apiUrl}/inventory/bulk-upload`, formData).subscribe({
            next: (res) => {
                this.isUploading = false;
                this.uploadResult = res;
                this.selectedFile = null; // Clear visually
            },
            error: (err) => {
                this.isUploading = false;
                alert("Error al procesar el archivo: " + (err.error?.detail || err.message));
            }
        });
    }
}
