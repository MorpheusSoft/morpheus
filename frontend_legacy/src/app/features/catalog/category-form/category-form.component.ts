import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { CategoryService, CategoryCreate, Category } from '../services/category.service';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { InputSwitchModule } from 'primeng/inputswitch';

@Component({
  selector: 'app-category-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ButtonModule, InputTextModule, SelectModule, InputSwitchModule],
  template: `
    <div class="category-form-container">
      <div class="form-wrapper">
        
        <!-- Title -->
        <div class="form-header">
          <p-button icon="pi pi-arrow-left" [text]="true" [rounded]="true" severity="secondary" routerLink="/catalog/categories" class="back-btn"></p-button>
          <h2 class="form-title">{{ isEditMode ? 'Editar Categoría' : 'Nueva Categoría' }}</h2>
        </div>

        <!-- Main Card -->
        <div class="form-card">
          <form (ngSubmit)="onSubmit()" #catForm="ngForm">
            
            <!-- Name Field -->
            <div class="form-group">
              <label for="name" class="form-label">Nombre de la Categoría</label>
              <input pInputText id="name" required [(ngModel)]="category.name" name="name" placeholder="Ej. Electrónica, Ropa, Servicios" class="form-input" />
              <small class="form-hint">
                <i class="pi pi-info-circle"></i>
                El <strong>Identificador (Slug)</strong> {{ isEditMode ? 'ya fue generado' : 'se generará automáticamente' }}.
              </small>
            </div>

            <!-- Slug Field (Read Only in Edit) -->
            <div class="form-group" *ngIf="isEditMode">
              <label for="slug" class="form-label">Identificador (URL)</label>
              <input pInputText id="slug" disabled [value]="category.slug" class="form-input form-input-disabled" />
            </div>

            <!-- Parent Category -->
            <div class="form-group">
              <label for="parent" class="form-label">Categoría Padre</label>
              <p-select 
                id="parent" 
                [options]="availableParents" 
                [(ngModel)]="category.parent_id" 
                name="parent_id" 
                optionLabel="name" 
                optionValue="id" 
                placeholder="Ninguna (Raíz)" 
                [showClear]="true" 
                class="form-select">
              </p-select>
              <small class="form-hint">Selecciona una categoría superior si esta es una sub-categoría.</small>
            </div>

            <!-- Active Switch -->
            <div class="form-switch-group">
              <div class="switch-labels">
                  <label class="form-label switch-title" for="isActive">Estado Activo</label>
                  <small class="form-hint">Desactívalo para ocultar esta categoría temporalmente.</small>
              </div>
              <p-inputSwitch inputId="isActive" [(ngModel)]="category.is_active" name="is_active"></p-inputSwitch>
            </div>

            <!-- Actions -->
            <div class="form-actions">
              <p-button label="Cancelar" severity="secondary" [outlined]="true" routerLink="/catalog/categories"></p-button>
              <p-button [label]="isEditMode ? 'Actualizar Categoría' : 'Guardar Categoría'" type="submit" [disabled]="!catForm.form.valid"></p-button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .category-form-container {
      padding: 2rem;
      display: flex;
      justify-content: center;
    }
    .form-wrapper {
      width: 100%;
      max-width: 600px;
    }
    .form-header {
      display: flex;
      align-items: center;
      margin-bottom: 1.5rem;
    }
    .back-btn {
      margin-right: 1rem;
    }
    .form-title {
      font-weight: 700;
      color: var(--p-text-color);
      margin: 0;
    }
    .form-card {
      background: var(--p-surface-0);
      border-radius: var(--p-border-radius);
      box-shadow: 0 4px 15px rgba(0,0,0,0.05);
      padding: 2rem;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
    }
    .form-label {
      font-weight: 600;
      color: var(--p-text-secondary-color);
      text-transform: uppercase;
      font-size: 0.85rem;
    }
    .form-input {
      width: 100%;
    }
    .form-input-disabled {
      background: var(--p-surface-100);
      color: var(--p-text-muted-color);
    }
    :host ::ng-deep .form-select.p-select {
      width: 100%;
    }
    .form-hint {
      color: var(--p-text-secondary-color);
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .form-switch-group {
      background: var(--p-surface-50);
      padding: 1rem;
      border-radius: var(--p-border-radius);
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 2rem;
    }
    .switch-labels {
      display: flex;
      flex-direction: column;
    }
    .switch-title {
      margin-bottom: 0.25rem;
      color: var(--p-text-color);
    }
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--p-surface-200);
    }
  `]
})
export class CategoryFormComponent implements OnInit {
  category: any = {
    name: '',
    is_active: true
  };
  existingCategories: Category[] = [];
  availableParents: Category[] = [];
  isEditMode = false;
  categoryId: number | null = null;

  constructor(
    private categoryService: CategoryService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.categoryService.getCategories().subscribe(cats => {
      this.existingCategories = cats;
      this.updateAvailableParents();
    });

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.isEditMode = true;
      this.categoryId = +idParam;
      this.loadCategory(this.categoryId);
    }
  }

  loadCategory(id: number) {
    this.categoryService.getCategory(id).subscribe({
      next: (cat) => {
        this.category = cat;
        this.updateAvailableParents();
      },
      error: (err) => {
        console.error(err);
        alert("Error cargando categoría");
        this.router.navigate(['/catalog/categories']);
      }
    });
  }

  updateAvailableParents() {
    // Filter out the current category so it can't be its own parent
    if (this.isEditMode && this.categoryId) {
      this.availableParents = this.existingCategories.filter(c => c.id !== this.categoryId);
    } else {
      this.availableParents = [...this.existingCategories];
    }
  }

  onSubmit() {
    if (this.isEditMode && this.categoryId) {
      this.categoryService.updateCategory(this.categoryId, this.category).subscribe({
        next: () => this.router.navigate(['/catalog/categories']),
        error: (err) => alert("Error actualizando: " + (err.error?.detail || err.message))
      });
    } else {
      this.categoryService.createCategory(this.category).subscribe({
        next: () => this.router.navigate(['/catalog/categories']),
        error: (err) => alert("Error creando categoría: " + (err.error?.detail || err.message))
      });
    }
  }
}
