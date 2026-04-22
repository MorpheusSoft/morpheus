import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormArray, Validators, FormsModule } from '@angular/forms';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DialogModule } from 'primeng/dialog';

import { ProductService } from '@morpheus/core-services';
import { Product, ProductVariant } from '@morpheus/models';

@Component({
  selector: 'app-product-variants',
  standalone: true,
  imports: [
      CommonModule, RouterModule, ReactiveFormsModule, FormsModule,
      TableModule, ButtonModule, InputTextModule, InputNumberModule, DialogModule
  ],
  template: `
    <div class="card p-4">
        <!-- Header -->
        <div class="flex justify-content-between align-items-center mb-4">
            <div>
                <h2 class="mb-1">Manage SKUs: {{ product?.name || 'Loading...' }}</h2>
                <p class="text-500 mt-0">Define the physical variants, attributes, and costs.</p>
            </div>
            <p-button label="Back to Catalog" icon="pi pi-arrow-left" [text]="true" routerLink="/inventory/products"></p-button>
        </div>

        <!-- Global Attributes Editor -->
        <div class="surface-ground p-3 border-round mb-4">
            <div class="flex justify-content-between align-items-center mb-2">
                <h4 class="m-0">Global Attributes (JSONB mapping)</h4>
                <p-button label="Add Attribute Axis" icon="pi pi-plus" [text]="true" (onClick)="addAttributeAxis()"></p-button>
            </div>
            
            <form [formGroup]="attributesForm" class="flex gap-2 flex-wrap">
                <div formArrayName="axes" *ngFor="let axis of attributeAxes.controls; let i=index" class="p-inputgroup w-20rem">
                    <span class="p-inputgroup-addon">
                        <i class="pi pi-tag"></i>
                    </span>
                    <input type="text" pInputText [formControlName]="i" placeholder="e.g. Color, Size, RAM" (change)="onAxisChange()" />
                    <button type="button" pButton icon="pi pi-trash" class="p-button-danger" (click)="removeAttributeAxis(i)"></button>
                </div>
            </form>
            <small class="text-500 block mt-2">These defining axes will become columns in the SKUs table below.</small>
        </div>

        <!-- SKUs Table -->
        <div class="flex justify-content-end mb-2">
             <p-button label="Add SKU" icon="pi pi-plus" severity="success" (onClick)="showAddVariantDialog()"></p-button>
        </div>

        <p-table [value]="variants" dataKey="id" editMode="row" responsiveLayout="scroll" [tableStyle]="{'min-width': '50rem'}">
            <ng-template pTemplate="header">
                <tr>
                    <th style="width:20%">SKU</th>
                    <!-- Dynamic Attribute Columns -->
                    <th *ngFor="let axis of globalAxes">{{ axis }}</th>
                    
                    <th style="width:15%">Standard Cost</th>
                    <th style="width:15%">Sales Price</th>
                    <th style="width:10%">Actions</th>
                </tr>
            </ng-template>
            <ng-template pTemplate="body" let-variant let-editing="editing" let-ri="rowIndex">
                <tr [pEditableRow]="variant">
                    <!-- SKU Field -->
                    <td>
                        <p-cellEditor>
                            <ng-template pTemplate="input">
                                <input pInputText type="text" [(ngModel)]="variant.sku" required class="w-full">
                            </ng-template>
                            <ng-template pTemplate="output">
                                <span class="font-bold">{{variant.sku}}</span>
                            </ng-template>
                        </p-cellEditor>
                    </td>

                    <!-- Dynamic Attribute Data -->
                    <td *ngFor="let axis of globalAxes">
                        <p-cellEditor>
                            <ng-template pTemplate="input">
                                <input pInputText type="text" [(ngModel)]="variant.attributes[axis]" placeholder="Value..." class="w-full">
                            </ng-template>
                            <ng-template pTemplate="output">
                                <span class="p-tag p-tag-info">{{ variant.attributes[axis] || '-' }}</span>
                            </ng-template>
                        </p-cellEditor>
                    </td>

                    <!-- Cost Field -->
                    <td>
                        <p-cellEditor>
                            <ng-template pTemplate="input">
                                <p-inputNumber [(ngModel)]="variant.standard_cost" mode="currency" currency="USD" locale="en-US" class="w-full"></p-inputNumber>
                            </ng-template>
                            <ng-template pTemplate="output">
                                {{variant.standard_cost | currency:'USD'}}
                            </ng-template>
                        </p-cellEditor>
                    </td>

                    <!-- Price Field -->
                    <td>
                        <p-cellEditor>
                            <ng-template pTemplate="input">
                                <p-inputNumber [(ngModel)]="variant.sales_price" mode="currency" currency="USD" locale="en-US" class="w-full"></p-inputNumber>
                            </ng-template>
                            <ng-template pTemplate="output">
                                {{variant.sales_price | currency:'USD'}}
                            </ng-template>
                        </p-cellEditor>
                    </td>

                    <!-- Actions -->
                    <td>
                        <div class="flex align-items-center justify-content-center gap-2">
                            <button *ngIf="!editing" pButton pRipple type="button" pInitEditableRow icon="pi pi-pencil" class="p-button-rounded p-button-text"></button>
                            <button *ngIf="editing" pButton pRipple type="button" pSaveEditableRow icon="pi pi-check" class="p-button-rounded p-button-text p-button-success mr-2" (click)="saveExistingVariant(variant)"></button>
                            <button *ngIf="editing" pButton pRipple type="button" pCancelEditableRow icon="pi pi-times" class="p-button-rounded p-button-text p-button-danger"></button>
                        </div>
                    </td>
                </tr>
            </ng-template>
            <ng-template pTemplate="emptymessage">
                <tr>
                    <td [attr.colspan]="globalAxes.length + 4" class="text-center p-4">No SKUs defined for this product yet.</td>
                </tr>
            </ng-template>
        </p-table>
        
        <!-- Add Variant Dialog (for brand new SKUs) -->
        <p-dialog [(visible)]="displayAddDialog" header="Add New Variant SKU" [modal]="true" [style]="{width: '500px'}">
             <form [formGroup]="newVariantForm" (ngSubmit)="createNewVariant()" class="p-fluid mt-3">
                 <div class="field">
                     <label for="new_sku" class="font-bold">SKU *</label>
                     <input id="new_sku" type="text" pInputText formControlName="sku" />
                 </div>
                 
                 <div class="formgrid grid">
                     <div class="field col-6">
                         <label for="new_cost">Standard Cost</label>
                         <p-inputNumber id="new_cost" formControlName="standard_cost" mode="currency" currency="USD"></p-inputNumber>
                     </div>
                     <div class="field col-6">
                         <label for="new_price">Sales Price</label>
                         <p-inputNumber id="new_price" formControlName="sales_price" mode="currency" currency="USD"></p-inputNumber>
                     </div>
                 </div>
                 
                 <!-- Dynamic fields inside the dialog for the JSONB attributes -->
                 <div formGroupName="attributes" *ngIf="globalAxes.length > 0">
                     <p class="font-bold mt-3 mb-2 border-bottom-1 surface-border pb-1">Variant Attributes</p>
                     <div class="field" *ngFor="let axis of globalAxes">
                         <label [for]="'attr_' + axis">{{ axis }}</label>
                         <input [id]="'attr_' + axis" type="text" pInputText [formControlName]="axis" />
                     </div>
                 </div>
                 
                 <div class="flex justify-content-end gap-2 mt-4">
                     <p-button label="Cancel" severity="secondary" (onClick)="displayAddDialog = false"></p-button>
                     <p-button label="Add Variant" type="submit" [disabled]="newVariantForm.invalid"></p-button>
                 </div>
             </form>
        </p-dialog>
    </div>
  `
})
export class ProductVariantsComponent implements OnInit {
  product: Product | null = null;
  variants: ProductVariant[] = [];
  productId!: number;
  
  // JSONB Mappings
  globalAxes: string[] = []; // e.g. ['Size', 'Color']
  
  displayAddDialog = false;

  private route = inject(ActivatedRoute);
  private productService = inject(ProductService);
  private fb = inject(FormBuilder);

  attributesForm: FormGroup;
  newVariantForm: FormGroup;

  constructor() {
    this.attributesForm = this.fb.group({
      axes: this.fb.array([])
    });
    
    this.newVariantForm = this.fb.group({
       sku: ['', Validators.required],
       standard_cost: [0],
       sales_price: [0],
       attributes: this.fb.group({}) // Dynamically populated
    });
  }

  get attributeAxes() {
    return this.attributesForm.get('axes') as FormArray;
  }

  ngOnInit() {
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.productId = +params['id'];
        this.loadProductAndVariants();
      }
    });
  }

  loadProductAndVariants() {
    this.productService.getProductById(this.productId).subscribe(prod => this.product = prod);
    
    this.productService.getVariantsByProduct(this.productId).subscribe(v => {
      this.variants = v;
      this.extractGlobalAxesFromVariants();
    });
  }

  // --- JSONB LOGIC ---
  
  extractGlobalAxesFromVariants() {
      const axisSet = new Set<string>();
      this.variants.forEach(v => {
          if (!v.attributes) v.attributes = {};
          Object.keys(v.attributes).forEach(k => axisSet.add(k));
      });
      this.globalAxes = Array.from(axisSet);
      
      this.attributeAxes.clear();
      this.globalAxes.forEach(a => this.attributeAxes.push(this.fb.control(a)));
  }

  addAttributeAxis() {
      this.attributeAxes.push(this.fb.control(''));
  }

  removeAttributeAxis(index: number) {
      this.attributeAxes.removeAt(index);
      this.onAxisChange();
  }

  onAxisChange() {
      // Rebuild the global axes list from the form
      this.globalAxes = this.attributeAxes.value.filter((val: string) => val && val.trim() !== '');
  }

  // --- CRUD LOGIC ---

  showAddVariantDialog() {
      // Build dynamic form group for attributes based on current global axes
      const attrGroup = this.fb.group({});
      this.globalAxes.forEach(axis => {
          attrGroup.addControl(axis, this.fb.control(''));
      });
      
      this.newVariantForm.setControl('attributes', attrGroup);
      this.newVariantForm.reset({ standard_cost: 0, sales_price: 0 });
      this.displayAddDialog = true;
  }

  createNewVariant() {
      if(this.newVariantForm.invalid) return;
      
      const formVal = this.newVariantForm.value;
      const newVar = {
          ...formVal,
          product_id: this.productId,
          is_active: true
      };
      
      this.productService.createVariant(newVar).subscribe({
          next: () => {
              this.displayAddDialog = false;
              this.loadProductAndVariants(); // Reload table
          },
          error: (err) => console.error("Could not create variant", err)
      });
  }

  saveExistingVariant(variant: ProductVariant) {
      this.productService.updateVariant(variant.id, variant).subscribe({
          next: () => console.log('Variant Updated Successfully'),
          error: (err) => console.error('Error updating variant', err)
      });
  }
}
