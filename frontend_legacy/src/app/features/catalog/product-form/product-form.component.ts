import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { ProductService, ProductCreate, ProductVariantCreate, Product, ProductBarcode, ProductBarcodeCreate, ProductVariant } from '../services/product.service';
import { CategoryService, Category } from '../services/category.service';
import { FileUploadService } from '../services/file-upload.service';
import { CoreService, Currency } from '../../../core/services/core.service';

import { TabsModule } from 'primeng/tabs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputNumberModule } from 'primeng/inputnumber';
import { TableModule } from 'primeng/table';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    RouterModule,
    TabsModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    InputSwitchModule,
    InputNumberModule,
    TableModule
  ],
  template: `
    <div class="product-form-container">
      <!-- Header -->
      <div class="form-header">
        <p-button icon="pi pi-arrow-left" [text]="true" [rounded]="true" severity="secondary" routerLink="/catalog/products" class="back-btn"></p-button>
        <h2 class="form-title">{{ isEdit ? 'Editar Producto' : 'Nuevo Producto' }}</h2>
      </div>

      <form (ngSubmit)="onSubmit()" #prodForm="ngForm" class="form-card">
        
        <p-tabs value="0">
            <p-tablist>
                <p-tab value="0"><i class="pi pi-info-circle tab-icon"></i>Información</p-tab>
                <p-tab value="1"><i class="pi pi-image tab-icon"></i>Multimedia</p-tab>
                <p-tab value="2"><i class="pi pi-dollar tab-icon"></i>Costos y Precios</p-tab>
                <p-tab value="3"><i class="pi pi-barcode tab-icon"></i>Empaques</p-tab>
            </p-tablist>
            
            <p-tabpanels>
                <!-- TAB 1: GENERAL INFO -->
                <p-tabpanel value="0">
                    <div class="grid-form mt-4">
                        <div class="form-group col-span-2">
                            <label for="name" class="form-label">Nombre del Producto *</label>
                            <input pInputText id="name" required [(ngModel)]="product.name" name="name" placeholder="Ej. Camiseta de Algodón Premium" class="form-input" />
                        </div>
                        <div class="form-group">
                            <label for="sku" class="form-label">SKU (Automático)</label>
                            <input pInputText id="sku" [value]="isEdit ? product.sku : '(Autogenerado)'" name="sku" disabled class="form-input form-input-disabled" />
                        </div>

                        <div class="form-group switch-group mt-2">
                            <p-inputSwitch inputId="isActive" [(ngModel)]="product.is_active" name="is_active"></p-inputSwitch>
                            <label class="switch-label" for="isActive">Activo</label>
                        </div>
                        
                        <div class="form-group">
                            <label for="brand" class="form-label">Marca</label>
                            <input pInputText id="brand" [(ngModel)]="product.brand" name="brand" placeholder="Ej. Nike, Samsung" class="form-input" />
                        </div>
                        <div class="form-group">
                            <label for="model" class="form-label">Modelo</label>
                            <input pInputText id="model" [(ngModel)]="product.model" name="model" placeholder="Ej. Air Max, S24" class="form-input" />
                        </div>

                        <div class="form-group col-span-3">
                            <label for="description" class="form-label">Descripción</label>
                            <textarea pTextarea id="description" rows="3" [(ngModel)]="product.description" name="description" placeholder="Detalles técnicos, características..." class="form-input" [autoResize]="true"></textarea>
                        </div>

                        <div class="form-group">
                            <label for="category" class="form-label">Categoría *</label>
                            <p-select 
                                id="category" 
                                [options]="categories" 
                                [(ngModel)]="product.category_id" 
                                name="category_id" 
                                optionLabel="name" 
                                optionValue="id" 
                                placeholder="Seleccionar..." 
                                [required]="true"
                                class="form-select">
                            </p-select>
                        </div>
                        <div class="form-group">
                            <label for="type" class="form-label">Tipo</label>
                            <p-select 
                                id="type" 
                                [options]="productTypes" 
                                [(ngModel)]="product.product_type" 
                                name="product_type" 
                                optionLabel="label" 
                                optionValue="value" 
                                class="form-select">
                            </p-select>
                        </div>
                        <div class="form-group">
                            <label for="uom" class="form-label">Unidad Base (UOM)</label>
                            <p-select 
                                id="uom" 
                                [options]="uoms" 
                                [(ngModel)]="product.uom_base" 
                                name="uom_base" 
                                optionLabel="label" 
                                optionValue="value" 
                                [editable]="true" 
                                class="form-select">
                            </p-select>
                        </div>
                    </div>
                </p-tabpanel>

                <!-- TAB 2: MULTIMEDIA -->
                <p-tabpanel value="1">
                    <div class="multimedia-container mt-4">
                        <div class="image-section mb-5">
                            <div *ngIf="product.image_main; else noImage" class="image-preview">
                                <img [src]="getProductImageUrl(product.image_main)" class="preview-img">
                                <p-button icon="pi pi-times" [rounded]="true" severity="danger" class="remove-img-btn" size="small" (onClick)="product.image_main = ''"></p-button>
                            </div>
                            <ng-template #noImage>
                                <div class="no-image-placeholder">
                                    <div class="placeholder-content">
                                        <i class="pi pi-image placeholder-icon"></i>
                                        <span>Sin Imagen</span>
                                    </div>
                                </div>
                            </ng-template>
                            
                            <label class="p-button p-component p-button-outlined upload-btn">
                                <i class="pi pi-upload mr-2"></i> Subir Imagen Principal
                                <input type="file" hidden (change)="onFileSelected($event, 'image')" accept="image/*">
                            </label>
                        </div>

                        <div class="doc-section pt-4">
                            <label class="section-title"><i class="pi pi-file-pdf doc-icon"></i>Ficha Técnica / Documentación</label>
                            <div class="doc-upload">
                                <input type="file" class="file-input" (change)="onFileSelected($event, 'datasheet')" accept="application/pdf">
                            </div>
                            <div *ngIf="product.datasheet" class="doc-alert">
                                <i class="pi pi-check-circle success-icon"></i>
                                <span class="doc-name">{{ product.datasheet }}</span>
                                <a [href]="getProductImageUrl(product.datasheet)" target="_blank" class="p-button p-button-link p-button-sm">Ver PDF</a>
                                <p-button icon="pi pi-times" [text]="true" rounded="true" severity="secondary" (onClick)="product.datasheet = ''"></p-button>
                            </div>
                        </div>
                    </div>
                </p-tabpanel>

                <!-- TAB 3: COSTS & VARIANTS -->
                <p-tabpanel value="2">
                    <div class="costs-container mt-4">
                        <!-- Config -->
                        <div class="config-bar mb-4">
                            <div class="config-item">
                                <label class="config-label">Moneda del Producto:</label>
                                <p-select 
                                    [options]="currencies" 
                                    [(ngModel)]="product.currency_id" 
                                    name="currency_id" 
                                    optionLabel="name" 
                                    optionValue="id" 
                                    placeholder="Sistema (Default)"
                                    [showClear]="true">
                                    <ng-template pTemplate="selectedItem">
                                        <div class="currency-item" *ngIf="product.currency_id">
                                            <span>{{ getSelectedCurrencyCode() }}</span>
                                        </div>
                                    </ng-template>
                                    <ng-template let-currency pTemplate="item">
                                        <div class="currency-item">
                                            <b>{{ currency.code }}</b> - {{ currency.name }}
                                        </div>
                                    </ng-template>
                                </p-select>
                            </div>
                            <div class="config-item">
                                <label class="switch-label" for="hasVariants">Maneja Variantes</label>
                                <p-inputSwitch inputId="hasVariants" [(ngModel)]="product.has_variants" name="has_variants" [disabled]="isEdit"></p-inputSwitch>
                            </div>
                        </div>

                        <div class="costs-grid">
                            <!-- Base Costs -->
                            <div class="costs-left" *ngIf="!product.has_variants || !isEdit">
                                <div class="section-header mb-3">
                                    <h6 class="section-title m-0">Precios y Costos</h6>
                                    <span *ngIf="product.has_variants" class="badge-default ms-2">Por defecto</span>
                                </div>
                                
                                <div class="form-group mb-3">
                                    <label class="form-label">Precio de Venta</label>
                                    <p-inputNumber [(ngModel)]="product.price" name="price" mode="currency" [currency]="getSelectedCurrencyCode() || 'USD'" locale="en-US" class="form-input" [min]="0" styleClass="w-100"></p-inputNumber>
                                    <small class="form-hint">Precio base al público.</small>
                                </div>

                                <div class="grid-form-2 mb-3">
                                    <div class="form-group">
                                        <label class="form-label">Costo Estándar</label>
                                        <p-inputNumber [(ngModel)]="product.standard_cost" name="standard_cost" mode="currency" [currency]="getSelectedCurrencyCode() || 'USD'" locale="en-US" class="form-input" [min]="0" styleClass="w-100"></p-inputNumber>
                                        <small class="form-hint">Para contabilidad (Fijo).</small>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label">Costo Reposición</label>
                                        <p-inputNumber [(ngModel)]="product.replacement_cost" name="replacement_cost" mode="currency" [currency]="getSelectedCurrencyCode() || 'USD'" locale="en-US" class="form-input" [min]="0" styleClass="w-100"></p-inputNumber>
                                        <small class="form-hint">Costo actual proveedor.</small>
                                    </div>
                                </div>
                            </div>

                            <!-- Read Only / Stats -->
                            <div class="costs-right" *ngIf="!product.has_variants || !isEdit">
                                <div class="section-header mb-3">
                                    <h6 class="section-title m-0">Estadísticas de Costo</h6>
                                </div>
                                <div class="grid-form-2 mb-3">
                                    <div class="form-group">
                                        <label class="form-label text-normal">Último Costo</label>
                                        <input pInputText value="$ 0.00" disabled class="form-input bg-light" />
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label text-normal">Costo Promedio</label>
                                        <input pInputText value="$ 0.00" disabled class="form-input bg-light" />
                                    </div>
                                </div>
                                <div class="info-alert mt-2">
                                    <i class="pi pi-info-circle info-icon"></i>
                                    <small>El costo promedio se ajusta automáticamente con las entradas de almacén.</small>
                                </div>
                            </div>
                        </div>

                        <!-- Variants Management (Only if Enabled & Edit Mode) -->
                        <div *ngIf="product.has_variants && isEdit" class="variants-section mt-4">
                            <div class="section-header mb-3">
                                <h5 class="section-title m-0 lg">Gestión de Variantes</h5>
                            </div>

                            <!-- Add Variant Form (Inline) -->
                            <div class="inline-add-form mb-4">
                                <h6 class="form-subtitle">Nueva Variante</h6>
                                <div class="variants-grid align-end">
                                    <div class="form-group">
                                        <label class="form-label text-normal">SKU (Unico) *</label>
                                        <input pInputText placeholder="Ej: PROD-RED-XL" [(ngModel)]="newVariant.sku" name="v_sku" class="form-input-sm" />
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label text-normal">Barcode</label>
                                        <input pInputText placeholder="EAN / UPC" [(ngModel)]="newVariant.barcode" name="v_barcode" class="form-input-sm" />
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label text-normal">Precio Venta</label>
                                        <p-inputNumber [(ngModel)]="newVariant.sales_price" name="v_price" mode="currency" [currency]="getSelectedCurrencyCode() || 'USD'" locale="en-US" class="form-input-sm" styleClass="w-100"></p-inputNumber>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label text-normal">Costo Est.</label>
                                        <p-inputNumber [(ngModel)]="newVariant.standard_cost" name="v_cost" mode="currency" [currency]="getSelectedCurrencyCode() || 'USD'" locale="en-US" class="form-input-sm" styleClass="w-100"></p-inputNumber>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label text-normal">Costo Repo.</label>
                                        <p-inputNumber [(ngModel)]="newVariant.replacement_cost" name="v_rep_cost" mode="currency" [currency]="getSelectedCurrencyCode() || 'USD'" locale="en-US" class="form-input-sm" styleClass="w-100"></p-inputNumber>
                                    </div>
                                    <div class="form-group btn-col">
                                        <p-button icon="pi pi-plus" severity="contrast" class="w-100" styleClass="w-100" (onClick)="onAddVariant()" [disabled]="!newVariant.sku"></p-button>
                                    </div>
                                </div>
                            </div>

                            <p-table [value]="variants" [tableStyle]="{ 'min-width': '50rem' }" styleClass="p-datatable-sm">
                                <ng-template pTemplate="header">
                                    <tr>
                                        <th>SKU</th>
                                        <th>Barcode</th>
                                        <th>Precio</th>
                                        <th>Costo (Est/Rep)</th>
                                    </tr>
                                </ng-template>
                                <ng-template pTemplate="body" let-v>
                                    <tr>
                                        <td class="fw-bold">{{ v.sku }}</td>
                                        <td>{{ v.barcode || '-' }}</td>
                                        <td>{{ v.sales_price | currency: (getSelectedCurrencyCode() || 'USD') }}</td>
                                        <td>
                                            <span class="text-secondary">{{ v.standard_cost | currency: (getSelectedCurrencyCode() || 'USD') }} / </span>
                                            <span>{{ v.replacement_cost | currency: (getSelectedCurrencyCode() || 'USD') }}</span>
                                        </td>
                                    </tr>
                                </ng-template>
                                <ng-template pTemplate="emptymessage">
                                    <tr>
                                        <td colspan="4" class="empty-state">Las variantes agregadas se listarán aquí.</td>
                                    </tr>
                                </ng-template>
                            </p-table>
                        </div>

                        <div *ngIf="product.has_variants && !isEdit" class="warning-alert mt-4">
                            <i class="pi pi-exclamation-triangle warning-icon"></i>
                            Primero guarda el producto base. Luego podrás agregar las variantes específicas en esta pestaña.
                        </div>
                    </div>
                </p-tabpanel>

                <!-- TAB 4: EMPAQUES / BARCODES -->
                <p-tabpanel value="3">
                    <div *ngIf="!isEdit" class="warning-alert mt-4">
                        <i class="pi pi-info-circle warning-icon"></i> 
                        Debes guardar el producto antes de agregar empaques.
                    </div>

                    <div *ngIf="isEdit" class="mt-4">
                        <!-- Variant Selector -->
                        <div class="variant-selector mb-4" *ngIf="product.has_variants">
                            <label class="selector-label">Variante a gestionar:</label>
                            <p-select 
                                [options]="variants" 
                                [(ngModel)]="selectedVariantId" 
                                (onChange)="loadBarcodes()" 
                                name="selVariant" 
                                optionLabel="sku" 
                                optionValue="id" 
                                placeholder="Seleccionar Variante..."
                                class="selector-dropdown"
                                styleClass="w-20rem">
                            </p-select>
                        </div>

                        <div *ngIf="selectedVariantId">
                            <!-- Add Form -->
                            <div class="inline-add-form mb-4">
                                <h6 class="form-subtitle">Nuevo Empaque / Código</h6>
                                <div class="barcodes-grid align-end">
                                    <div class="form-group">
                                        <label class="form-label text-normal">Código *</label>
                                        <input pInputText placeholder="Código" [(ngModel)]="newBarcode.barcode" name="b_code" class="form-input-sm">
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label text-normal">Tipo</label>
                                        <p-select [options]="barcodeTypes" [(ngModel)]="newBarcode.code_type" name="b_type" optionLabel="label" optionValue="value" class="form-input-sm"></p-select>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label text-normal">Unidad (UOM) *</label>
                                        <input pInputText placeholder="Ej: CAJA" [(ngModel)]="newBarcode.uom" name="b_uom" class="form-input-sm">
                                    </div>
                                    <div class="form-group sm-col">
                                        <label class="form-label text-normal" title="Factor de Conversión. Ej: 24">Factor</label>
                                        <input pInputText type="number" placeholder="Fac" [(ngModel)]="newBarcode.conversion_factor" name="b_factor" class="form-input-sm">
                                    </div>
                                    <div class="form-group sm-col">
                                        <label class="form-label text-normal">Peso(Kg)</label>
                                        <input pInputText type="number" placeholder="Kg" [(ngModel)]="newBarcode.weight" name="b_weight" class="form-input-sm">
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label text-normal">Dims(LxWxH)</label>
                                        <input pInputText placeholder="Dim(LxWxH)" [(ngModel)]="newBarcode.dimensions" name="b_dims" class="form-input-sm">
                                    </div>
                                    <div class="form-group btn-col">
                                        <p-button label="Agregar" icon="pi pi-plus" severity="contrast" class="w-100" styleClass="w-100" (onClick)="onAddBarcode()" [disabled]="!newBarcode.barcode || !newBarcode.uom"></p-button>
                                    </div>
                                </div>
                            </div>

                            <p-table [value]="barcodes" [tableStyle]="{ 'min-width': '50rem' }" styleClass="p-datatable-sm">
                                <ng-template pTemplate="header">
                                    <tr>
                                        <th>Código</th>
                                        <th>Tipo</th>
                                        <th>UOM</th>
                                        <th>Factor</th>
                                        <th>Peso</th>
                                        <th class="text-end">Acciones</th>
                                    </tr>
                                </ng-template>
                                <ng-template pTemplate="body" let-b>
                                    <tr>
                                        <td class="fw-bold">{{ b.barcode }}</td>
                                        <td><span class="badge badge-secondary">{{ b.code_type }}</span></td>
                                        <td>{{ b.uom }}</td>
                                        <td>{{ b.conversion_factor }}</td>
                                        <td>{{ b.weight || '-' }}</td>
                                        <td class="text-end">
                                            <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" (onClick)="onDeleteBarcode(b.id)"></p-button>
                                        </td>
                                    </tr>
                                </ng-template>
                                <ng-template pTemplate="emptymessage">
                                    <tr>
                                        <td colspan="6" class="empty-state text-center py-4">No hay códigos registrados para esta variante.</td>
                                    </tr>
                                </ng-template>
                            </p-table>
                        </div>
                        
                        <div *ngIf="!selectedVariantId && product.has_variants" class="info-alert mt-4">
                            <i class="pi pi-info-circle info-icon"></i> Selecciona una variante arriba para gestionar sus códigos y empaques.
                        </div>
                    </div>
                </p-tabpanel>
            </p-tabpanels>
        </p-tabs>

        <!-- Footer Actions -->
        <div class="form-actions mt-4 pt-3 border-top">
            <p-button label="Cancelar" severity="secondary" [outlined]="true" routerLink="/catalog/products"></p-button>
            <p-button [label]="isSaving ? 'Guardando...' : 'Guardar Producto'" icon="pi pi-save" type="submit" [disabled]="!prodForm.form.valid || isSaving" [loading]="isSaving"></p-button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .product-form-container {
        padding: 2rem;
        max-width: 1200px;
        margin: 0 auto;
    }
    .form-header {
        display: flex;
        align-items: center;
        margin-bottom: 2rem;
    }
    .back-btn {
        margin-right: 1rem;
    }
    .form-title {
        margin: 0;
        font-weight: 700;
        color: var(--p-text-color);
    }
    .form-card {
        background: var(--p-surface-0);
        border-radius: var(--p-border-radius);
        box-shadow: 0 4px 15px rgba(0,0,0,0.05);
        padding: 2rem;
        display: flex;
        flex-direction: column;
    }
    .tab-icon {
        margin-right: 0.5rem;
    }
    
    /* Grid system */
    .grid-form {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1.5rem;
    }
    .grid-form-2 {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1.5rem;
    }
    .col-span-2 {
        grid-column: span 2;
    }
    .col-span-3 {
        grid-column: span 3;
    }
    .variants-grid {
        display: grid;
        grid-template-columns: 2fr 1.5fr 1fr 1fr 1fr auto;
        gap: 1rem;
    }
    .barcodes-grid {
        display: grid;
        grid-template-columns: 2fr 1.5fr 1.5fr 0.5fr 0.5fr 1.5fr auto;
        gap: 1rem;
    }
    .align-end {
        align-items: flex-end;
    }

    /* Form Components */
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .form-label {
        font-weight: 600;
        color: var(--p-text-secondary-color);
        text-transform: uppercase;
        font-size: 0.85rem;
    }
    .form-label.text-normal {
        text-transform: none;
        font-size: 0.875rem;
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
    :host ::ng-deep .p-inputtext-sm {
        width: 100%;
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
    }
    .form-hint {
        color: var(--p-text-secondary-color);
        font-size: 0.75rem;
        margin-top: 0.25rem;
    }
    .switch-group {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 1rem;
    }
    .switch-label {
        font-weight: 700;
        color: var(--p-text-color);
    }
    
    /* Config / Alert block */
    .config-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--p-surface-50);
        padding: 1rem 1.5rem;
        border-radius: var(--p-border-radius);
    }
    .config-item {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    .config-label {
        font-weight: 700;
        color: var(--p-text-secondary-color);
        text-transform: uppercase;
        font-size: 0.85rem;
        margin: 0;
    }
    .currency-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .inline-add-form {
        background: var(--p-surface-50);
        padding: 1.5rem;
        border-radius: var(--p-border-radius);
    }
    .form-subtitle {
        font-weight: 700;
        font-size: 0.85rem;
        text-transform: uppercase;
        color: var(--p-text-secondary-color);
        margin: 0 0 1rem 0;
    }
    
    .costs-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2rem;
    }
    .costs-left {
        border-right: 1px solid var(--p-surface-200);
        padding-right: 2rem;
    }

    /* Alerts */
    .info-alert {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        background: var(--p-surface-100);
        border: 1px solid var(--p-surface-200);
        border-radius: var(--p-border-radius);
        padding: 0.75rem 1rem;
        color: var(--p-text-color);
    }
    .info-icon {
        color: var(--p-primary-color);
    }
    .warning-alert {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        background: #fff8e1;
        border: 1px solid #ffe082;
        border-radius: var(--p-border-radius);
        padding: 1rem 1.5rem;
        color: #f57f17;
    }
    .warning-icon {
        color: #f57f17;
    }

    /* Multimedia */
    .multimedia-container {
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    .image-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
    }
    .image-preview {
        position: relative;
        display: inline-block;
    }
    .preview-img {
        max-height: 250px;
        border-radius: var(--p-border-radius);
        box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        border: 1px solid var(--p-surface-200);
    }
    .remove-img-btn {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
    }
    .no-image-placeholder {
        background: var(--p-surface-100);
        border: 2px dashed var(--p-surface-300);
        border-radius: var(--p-border-radius);
        width: 200px;
        height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--p-text-secondary-color);
    }
    .placeholder-content {
        text-align: center;
    }
    .placeholder-icon {
        font-size: 3rem;
        margin-bottom: 0.5rem;
        display: block;
    }
    .upload-btn {
        cursor: pointer;
    }
    .doc-section {
        width: 100%;
        max-width: 600px;
        border-top: 1px solid var(--p-surface-200);
        padding-top: 2rem;
    }
    .section-title {
        font-weight: 700;
        margin-bottom: 1rem;
        display: block;
    }
    .doc-icon {
        color: #ef4444;
        margin-right: 0.5rem;
    }
    .doc-upload {
        margin-bottom: 1rem;
    }
    .file-input {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid var(--p-surface-300);
        border-radius: var(--p-border-radius);
    }
    .doc-alert {
        display: flex;
        align-items: center;
        background: var(--p-surface-0);
        border: 1px solid var(--p-surface-200);
        border-radius: var(--p-border-radius);
        padding: 0.5rem 1rem;
    }
    .success-icon {
        color: #22c55e;
        margin-right: 0.5rem;
    }
    .doc-name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    
    /* General helpers */
    .fw-bold { font-weight: 700; }
    .text-secondary { color: var(--p-text-secondary-color); }
    .text-end { text-align: right; }
    .text-center { text-align: center; }
    .bg-light { background: var(--p-surface-50); }
    .badge-default {
        background: var(--p-surface-200);
        color: var(--p-text-color);
        padding: 0.25rem 0.5rem;
        border-radius: var(--p-border-radius);
        font-size: 0.75rem;
        font-weight: 600;
    }
    .badge-secondary {
        background: var(--p-surface-500);
        color: white;
        padding: 0.25rem 0.5rem;
        border-radius: var(--p-border-radius);
        font-size: 0.75rem;
        font-weight: 600;
    }
    .empty-state {
        color: var(--p-text-secondary-color);
        font-size: 0.85rem;
        text-transform: uppercase;
        padding: 2rem 0;
    }
    
    .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
        margin-top: 2rem;
        border-top: 1px solid var(--p-surface-200);
        padding-top: 1.5rem;
    }
  `]
})
export class ProductFormComponent implements OnInit {

  product: ProductCreate = {
    name: '',
    has_variants: false,
    is_active: true,
    uom_base: 'PZA',
    product_type: 'STOCKED',
    description: '',
    brand: '',
    model: '',
    image_main: '',
    datasheet: '',
    sku: '',
    price: 0,
    standard_cost: 0,
    replacement_cost: 0,
    currency_id: undefined
  };

  newVariant: ProductVariantCreate = {
    product_id: 0,
    sku: '',
    barcode: '',
    sales_price: 0,
    standard_cost: 0,
    replacement_cost: 0,
    currency_id: undefined // Support currency
  };

  categories: Category[] = [];
  currencies: Currency[] = []; // Load from CoreService

  productTypes = [
    { label: 'Almacenable', value: 'STOCKED' },
    { label: 'Consumible', value: 'CONSUMABLE' },
    { label: 'Servicio', value: 'SERVICE' }
  ];

  uoms = [
    { label: 'Pieza (PZA)', value: 'PZA' },
    { label: 'Kilogramo (KG)', value: 'KG' },
    { label: 'Metro (M)', value: 'M' },
    { label: 'Litro (L)', value: 'L' }
  ];

  barcodeTypes = [
    { label: 'Barras', value: 'BARCODE' },
    { label: 'QR', value: 'QR' },
    { label: 'Interno', value: 'INTERNAL' }
  ];

  // Barcode / Packaging State
  variants: ProductVariant[] = [];
  barcodes: ProductBarcode[] = [];
  selectedVariantId: number | null = null;
  newBarcode: ProductBarcodeCreate = {
    barcode: '',
    code_type: 'BARCODE',
    uom: 'Caja',
    conversion_factor: 1,
    weight: 0,
    dimensions: ''
  };
  isEdit = false;
  isSaving = false;
  createdProductId: number | null = null;
  apiUrl = 'http://localhost:8000';

  constructor(
    private productService: ProductService,
    private categoryService: CategoryService,
    private uploadService: FileUploadService,
    private coreService: CoreService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.categoryService.getCategories().subscribe(cats => this.categories = cats);
    this.coreService.getCurrencies().subscribe(currs => this.currencies = currs);

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit = true;
      this.createdProductId = +id;
      this.loadProduct(this.createdProductId);
    }
  }

  loadProduct(id: number) {
    this.productService.getProduct(id).subscribe({
      next: (prod) => {
        // Map incoming product to form model (ProductCreate)
        this.product = {
          name: prod.name,
          description: prod.description,
          category_id: prod.category_id,
          brand: prod.brand,
          model: prod.model,
          product_type: prod.product_type,
          uom_base: prod.uom_base || 'PZA',
          image_main: prod.image_main,
          datasheet: prod.datasheet,
          has_variants: prod.has_variants,
          is_active: prod.is_active,
          // Helper fields
          sku: '',
          price: 0,
          standard_cost: 0,
          replacement_cost: 0,
          currency_id: undefined
        };

        // If it has variants, load them
        if (prod.variants && prod.variants.length > 0) {
          this.variants = prod.variants;

          // Auto-select first if exists
          if (!this.product.has_variants) {
            // For simple products, map the variant fields back to the main form
            const mainVariant = this.variants[0];
            this.selectedVariantId = mainVariant.id;
            this.product.sku = mainVariant.sku;
            this.product.price = mainVariant.sales_price;
            this.product.standard_cost = mainVariant.standard_cost;
            this.product.replacement_cost = mainVariant.replacement_cost;
            this.product.currency_id = mainVariant.currency_id;

            this.loadBarcodes();
          } else {
            // For variant products, we might just select the first one for the tabs
            this.selectedVariantId = this.variants[0].id;
            this.loadBarcodes();
          }
        }
      },
      error: (err) => {
        console.error("Error loading product", err);
        alert("Error cargando producto: " + err.message);
        this.router.navigate(['/catalog/products']);
      }
    });
  }

  onFileSelected(event: any, type: 'image' | 'datasheet') {
    const file: File = event.target.files[0];
    if (file) {
      this.uploadService.uploadFile(file).subscribe({
        next: (response) => {
          if (type === 'image') this.product.image_main = response.url;
          else this.product.datasheet = response.url;
        },
        error: (err) => alert("Error subiendo archivo: " + err.message)
      });
    }
  }

  getProductImageUrl(url: string | undefined): string {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${this.apiUrl}${url}`;
  }

  onSubmit() {
    if (this.isSaving) return;
    this.isSaving = true;
    console.log("Submitting product:", this.product);

    const request$ = this.isEdit && this.createdProductId
      ? this.productService.updateProduct(this.createdProductId, this.product)
      : this.productService.createProduct(this.product);

    request$.subscribe({
      next: (result) => {
        this.isSaving = false;

        if (!this.isEdit) {
          this.isEdit = true;
          this.createdProductId = result.id;
          alert("Producto creado exitosamente.");
        } else {
          alert("Producto actualizado exitosamente.");
        }

        if (result.variants) {
          this.variants = result.variants;
          // Refresh local variants list
        }

        // Handle post-save logic for simple products
        if (!this.product.has_variants && this.variants.length > 0 && !this.selectedVariantId) {
          this.selectedVariantId = this.variants[0].id;
          this.loadBarcodes();
        }
      },
      error: (err) => {
        this.isSaving = false;
        console.error('Error saving product', err);
        alert("Error al guardar el producto: " + (err.error?.detail || err.message || "Error desconocido"));
      }
    });
  }

  onAddVariant() {
    if (this.createdProductId) {
      this.productService.createVariant(this.createdProductId, this.newVariant).subscribe({
        next: (val) => {
          this.variants.push(val); // Add to local list
          alert("Variante agregada: " + val.sku);
          // Reset form
          this.newVariant.sku = '';
          this.newVariant.barcode = '';
          this.newVariant.sales_price = 0;
          this.newVariant.standard_cost = 0;
          this.newVariant.replacement_cost = 0;
        },
        error: (err) => alert("Error al agregar variante: " + err.message)
      });
    }
  }

  // Barcode / Packaging Methods
  loadBarcodes() {
    if (this.selectedVariantId) {
      this.productService.getBarcodes(this.selectedVariantId).subscribe({
        next: (res) => this.barcodes = res,
        error: (err) => console.error("Error loading barcodes", err)
      });
    } else {
      this.barcodes = [];
    }
  }

  onAddBarcode() {
    if (!this.selectedVariantId) return;
    this.productService.addBarcode(this.selectedVariantId, this.newBarcode).subscribe({
      next: (res) => {
        this.barcodes.push(res);
        this.newBarcode = {
          barcode: '',
          code_type: 'BARCODE',
          uom: 'Caja',
          conversion_factor: 1,
          weight: 0,
          dimensions: ''
        };
      },
      error: (err) => alert("Error agregando código: " + err.message)
    });
  }

  onDeleteBarcode(id: number) {
    if (!confirm("¿Eliminar este código?")) return;
    this.productService.deleteBarcode(id).subscribe({
      next: () => this.barcodes = this.barcodes.filter(b => b.id !== id),
      error: (err) => alert("Error: " + err.message)
    });
  }

  getSelectedCurrencyCode(): string {
    if (!this.product.currency_id) return 'USD'; // Or whatever your system default is
    const currency = this.currencies.find(c => c.id === this.product.currency_id);
    return currency ? currency.code : 'USD';
  }
}
