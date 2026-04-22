import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

// PrimeNG core modules for the form
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
import { TextareaModule } from 'primeng/textarea';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { TabsModule } from 'primeng/tabs';
import { FluidModule } from 'primeng/fluid';
import { FileUploadModule } from 'primeng/fileupload';
import { TableModule } from 'primeng/table';

import { HttpClient } from '@angular/common/http';
import { ProductService, CategoryService, API_URL } from '@morpheus/core-services';
import { Category } from '@morpheus/models';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterModule,
    InputTextModule, ButtonModule, DropdownModule, 
    TextareaModule, CheckboxModule, InputNumberModule,
    TabsModule, FluidModule, FileUploadModule, TableModule
  ],
  template: `
    <div class="card">
        <div class="flex flex-column md:flex-row md:align-items-center justify-content-between mb-4 gap-3">
            <div>
                <h2 class="m-0 font-semibold text-2xl text-900">{{ isEditMode ? 'Editar Producto' : 'Crear Nuevo Producto' }}</h2>
                <p class="text-500 mt-2 mb-0">Completa la información detallada del producto en el catálogo maestro.</p>
            </div>
            <p-button label="Volver al Catálogo" icon="pi pi-arrow-left" severity="secondary" [outlined]="true" routerLink="/inventory/products"></p-button>
        </div>

        <form [formGroup]="productForm" (ngSubmit)="onSubmit()">
            <p-tabs value="0">
                <p-tablist>
                    <p-tab value="0"><i class="pi pi-info-circle mr-2"></i>General</p-tab>
                    <p-tab value="1"><i class="pi pi-box mr-2"></i>Empaques</p-tab>
                    <p-tab value="2"><i class="pi pi-dollar mr-2"></i>Costos y Precios</p-tab>
                    <p-tab value="3"><i class="pi pi-barcode mr-2"></i>Códigos y Ficha</p-tab>
                </p-tablist>

                <p-tabpanels>
                    <!-- TAB 1: General -->
                    <p-tabpanel value="0">
                        <p-fluid>
                            <div class="grid formgrid pt-2">
                                <div class="col-12 mb-3">
                                    <h3 class="text-xl font-medium text-900 border-b border-surface pb-2 m-0">Detalles Básicos</h3>
                                </div>
                                
                                <div class="field col-12 md:col-6 mb-4">
                                    <label for="name" class="block font-medium mb-2 text-700">Nombre del Producto *</label>
                                    <input id="name" type="text" pInputText formControlName="name" placeholder="Ej. Zapatos Nike Air Max" />
                                </div>

                                <div class="field col-12 md:col-6 mb-4">
                                    <label for="category" class="block font-medium mb-2 text-700">Categoría *</label>
                                    <p-dropdown id="category" [options]="categories" formControlName="category_id" optionLabel="name" optionValue="id" placeholder="Selecciona una Categoría"></p-dropdown>
                                </div>

                                <div class="field col-12 md:col-4 mb-4">
                                    <label for="brand" class="block font-medium mb-2 text-700">Marca</label>
                                    <input id="brand" type="text" pInputText formControlName="brand" placeholder="Ej. Nike" />
                                </div>

                                <div class="field col-12 md:col-3 mb-4">
                                    <label for="currency_id" class="block font-medium mb-2 text-700">Moneda Referencial *</label>
                                    <p-dropdown id="currency_id" [options]="currencies" formControlName="currency_id" optionLabel="label" optionValue="value" placeholder="Moneda"></p-dropdown>
                                </div>

                                <div class="field col-12 md:col-3 flex align-items-end mb-4">
                                    <div class="flex align-items-center gap-2 p-2 surface-50 border-round w-full">
                                        <p-checkbox formControlName="is_liquor" [binary]="true" inputId="is_liquor"></p-checkbox>
                                        <label for="is_liquor" class="font-bold text-primary cursor-pointer m-0 mt-1">¿Es Licor?</label>
                                    </div>
                                </div>

                                <div class="field col-12 md:col-3 mb-4">
                                    <label for="shrinkage" class="block font-medium mb-2 text-700">% Merma Esperada</label>
                                    <p-inputNumber id="shrinkage" formControlName="shrinkage_percent" suffix=" %"></p-inputNumber>
                                </div>

                                <div class="field col-12 mt-2 mb-4">
                                    <label for="description" class="block font-medium mb-2 text-700">Descripción Detallada</label>
                                    <textarea id="description" pInputTextarea formControlName="description" rows="3"></textarea>
                                </div>
                            </div>
                        </p-fluid>
                    </p-tabpanel>

                    <!-- TAB 2: Empaques Logísticos -->
                    <p-tabpanel value="1">
                        <p-fluid>
                            <div class="grid formgrid pt-2">
                                <div class="col-12 mb-3 flex justify-content-between align-items-center border-b border-surface pb-2">
                                    <h3 class="text-xl font-medium text-900 m-0">Matriz de Presentaciones (Empaques)</h3>
                                    <p-button icon="pi pi-plus" label="Añadir Empaque" size="small" [outlined]="true" (onClick)="addPackaging()"></p-button>
                                </div>

                                <div class="field col-12 md:col-6 mb-4">
                                    <label for="uom_base" class="block font-medium mb-2 text-700">Unidad de Medida Base (UoM Central)</label>
                                    <p-dropdown id="uom_base" [options]="uomOptions" formControlName="uom_base"></p-dropdown>
                                </div>

                                <div class="col-12 mb-4">
                                    <p-table [value]="packagings.controls" responsiveLayout="scroll">
                                        <ng-template pTemplate="header">
                                            <tr>
                                                <th>Nombre Empaque (Ej. Caja x12)</th>
                                                <th>Cantidad por Empaque</th>
                                                <th>Peso (KG)</th>
                                                <th>Volumen (M3)</th>
                                                <th>Acciones</th>
                                            </tr>
                                        </ng-template>
                                        <ng-template pTemplate="body" let-pack let-i="rowIndex">
                                            <tr [formGroup]="$any(pack)">
                                                <td><input pInputText formControlName="name" placeholder="Ej. Bulto 24" class="w-full"/></td>
                                                <td><p-inputNumber formControlName="qty_per_unit" [minFractionDigits]="2"></p-inputNumber></td>
                                                <td><p-inputNumber formControlName="weight_kg" [minFractionDigits]="2"></p-inputNumber></td>
                                                <td><p-inputNumber formControlName="volume_m3" [minFractionDigits]="4"></p-inputNumber></td>
                                                <td><p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="removePackaging(i)"></p-button></td>
                                            </tr>
                                        </ng-template>
                                    </p-table>
                                </div>
                            </div>
                        </p-fluid>
                    </p-tabpanel>

                    <!-- TAB 3: Precios Inteligentes -->
                    <p-tabpanel value="2">
                        <p-fluid>
                            <div class="grid formgrid pt-2">
                                <div class="col-12 mb-3 mt-2 flex justify-content-between align-items-center border-b border-surface pb-2">
                                    <h3 class="text-xl font-medium text-900 m-0"><i class="pi pi-database mr-2 text-primary"></i> Estructura de Costos Históricos</h3>
                                    <p-button icon="pi pi-sync" label="Refrescar Promedios" size="small" [outlined]="true" [text]="true"></p-button>
                                </div>

                                <div class="field col-12 md:col-3 mb-4">
                                    <label class="block font-medium mb-2 text-500">Costo Promedio Kardex</label>
                                    <p-inputNumber formControlName="average_cost" mode="currency" currency="USD" locale="en-US" class="p-inputtext-sm opacity-70"></p-inputNumber>
                                </div>
                                <div class="field col-12 md:col-3 mb-4">
                                    <label class="block font-medium mb-2 text-500">Último Costo Recibido</label>
                                    <p-inputNumber formControlName="last_cost" mode="currency" currency="USD" locale="en-US" class="p-inputtext-sm opacity-70"></p-inputNumber>
                                </div>
                                <div class="field col-12 md:col-3 mb-4">
                                    <label class="block font-medium mb-2 text-700">Costo Reposición</label>
                                    <p-inputNumber formControlName="replacement_cost" mode="currency" currency="USD" locale="en-US"></p-inputNumber>
                                </div>
                                <div class="field col-12 md:col-3 mb-4">
                                    <label class="block font-medium mb-2 text-900 font-bold">Costo Estándar (Base Pivote) *</label>
                                    <p-inputNumber formControlName="standard_cost" mode="currency" currency="USD" locale="en-US" [styleClass]="'border-primary'"></p-inputNumber>
                                </div>

                                <div class="col-12 mb-3 mt-4 flex justify-content-between align-items-center border-b border-surface pb-2">
                                    <h3 class="text-xl font-medium text-900 m-0"><i class="pi pi-calculator mr-2 text-primary"></i> Precios y Rentabilidad Pública</h3>
                                    <span class="text-sm px-2 py-1 bg-primary-100 text-primary-700 border-round">Método: {{ utility_calc_method === 'MARKUP' ? 'Porcentaje Simple (Mark-up)' : 'Margen sobre Ventas' }}</span>
                                </div>

                                <div class="field col-12 md:col-3 mb-4">
                                    <label class="block font-medium mb-2 text-700">% Utilidad Objetivo</label>
                                    <p-inputNumber formControlName="target_utility_pct" suffix=" %" [minFractionDigits]="2"></p-inputNumber>
                                </div>

                                <div class="field col-12 md:col-3 mb-4">
                                    <label class="block font-medium mb-2 text-700">Precio Venta Base (Sin IVA)</label>
                                    <p-inputNumber formControlName="price" mode="currency" currency="USD" locale="en-US"></p-inputNumber>
                                </div>
                                
                                <div class="field col-12 md:col-3 mb-4">
                                    <label class="block font-medium mb-2 text-700">Impuesto (IVA) *</label>
                                    <p-dropdown [options]="tributes" formControlName="tax_id" optionLabel="name" optionValue="id" placeholder="Selecciona Impuesto"></p-dropdown>
                                    <small class="block mt-1 text-500 flex align-items-center gap-1"><i class="pi pi-shield"></i> Requerido fiscalmente</small>
                                </div>

                                <div class="field col-12 md:col-3 mb-4">
                                    <label class="block font-medium mb-2 text-900 font-bold">Precio Final (Con IVA)</label>
                                    <input 
                                        type="text"
                                        pInputText 
                                        [value]="getPriceWithTax() | currency:'USD'" 
                                        readonly 
                                        class="bg-primary-50 text-primary-700 font-bold outline-none w-full" 
                                    />
                                </div>

                                <div class="col-12 mb-4">
                                    <div class="p-3 border-round border-1" [ngClass]="getRealUtility() >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'">
                                        <div class="flex flex-column sm:flex-row align-items-center justify-content-between">
                                            <span class="text-700">
                                                <i class="pi pi-info-circle mr-2"></i><strong>Utilidad Real Efectiva:</strong> Calculada cruzando Costo Pivote vs Mermas ({{ productForm.get('shrinkage_percent')?.value || 0 }}%).
                                            </span>
                                            <span class="font-bold text-xl mt-2 sm:mt-0" [ngClass]="getRealUtility() >= 0 ? 'text-green-600' : 'text-red-600'">
                                                {{ getRealUtility() | number:'1.2-2' }} %
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div class="field col-12 flex align-items-end mb-4">
                                    <div class="flex align-items-center gap-2 p-3 surface-50 border-round w-full">
                                        <p-checkbox formControlName="has_variants" [binary]="true" inputId="has_variants"></p-checkbox>
                                        <label for="has_variants" class="font-bold text-primary cursor-pointer m-0 mt-1">¿Maneja Variantes (Tallas)?</label>
                                    </div>
                                </div>

                                <div class="col-12 mt-4 mb-3 flex justify-content-between align-items-center border-b border-surface pb-2">
                                    <h3 class="text-xl font-medium text-900 m-0">Lista de Precios por Tienda</h3>
                                    <p-button icon="pi pi-plus" label="Añadir Precio Global" size="small" [outlined]="true" (onClick)="addFacilityPrice()"></p-button>
                                </div>

                                <div class="col-12 mb-4">
                                    <p-table [value]="facilityPrices.controls" responsiveLayout="scroll">
                                        <ng-template pTemplate="header">
                                            <tr>
                                                <th>Sucursal / Facility</th>
                                                <th>% Utilidad Obj.</th>
                                                <th>% Utilidad Real (Merma)</th>
                                                <th>Precio Sug. (Sin IVA)</th>
                                                <th>Precio Venta (Con IVA)</th>
                                                <th>Acciones</th>
                                            </tr>
                                        </ng-template>
                                        <ng-template pTemplate="body" let-fprice let-i="rowIndex">
                                            <tr [formGroup]="$any(fprice)">
                                                <td><p-dropdown [options]="facilities" formControlName="facility_id" optionLabel="label" optionValue="value" appendTo="body" class="w-full"></p-dropdown></td>
                                                <td><p-inputNumber formControlName="target_utility_pct" suffix=" %" [minFractionDigits]="2"></p-inputNumber></td>
                                                <td><strong [class.text-red-500]="getFacilityRealUtility(i) < 0" [class.text-green-600]="getFacilityRealUtility(i) >= 0">{{ getFacilityRealUtility(i) | number:'1.2-2' }}%</strong></td>
                                                <td><p-inputNumber formControlName="sales_price" mode="currency" currency="USD"></p-inputNumber></td>
                                                <td class="font-bold text-primary">{{ getFacilityPriceWithTax(i) | currency:'USD' }}</td>
                                                <td><p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="removeFacilityPrice(i)"></p-button></td>
                                            </tr>
                                        </ng-template>
                                    </p-table>
                                </div>
                            </div>
                        </p-fluid>
                    </p-tabpanel>

                    <!-- TAB 4: Códigos y Fichas -->
                    <p-tabpanel value="3">
                        <p-fluid>
                            <div class="grid formgrid pt-2">
                                <div class="col-12 mb-3 flex justify-content-between align-items-center border-b border-surface pb-2">
                                    <h3 class="text-xl font-medium text-900 m-0">Códigos de Barras</h3>
                                    <p-button icon="pi pi-plus" label="Añadir Código" size="small" [outlined]="true" (onClick)="addBarcode()"></p-button>
                                </div>

                                <div class="col-12 mb-4">
                                    <p-table [value]="barcodes.controls" styleClass="p-datatable-sm">
                                        <ng-template pTemplate="header">
                                            <tr>
                                                <th>Tipo</th>
                                                <th>Código</th>
                                                <th>UoM Ref</th>
                                                <th>Acciones</th>
                                            </tr>
                                        </ng-template>
                                        <ng-template pTemplate="body" let-bc let-i="rowIndex">
                                            <tr [formGroup]="$any(bc)">
                                                <td><p-dropdown [options]="barcodeTypes" formControlName="code_type" appendTo="body"></p-dropdown></td>
                                                <td><input pInputText formControlName="barcode" /></td>
                                                <td><p-dropdown [options]="uomOptions" formControlName="uom" appendTo="body"></p-dropdown></td>
                                                <td><p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="removeBarcode(i)"></p-button></td>
                                            </tr>
                                        </ng-template>
                                    </p-table>
                                </div>
                                
                                <div class="col-12 md:col-6 mb-4 mt-3">
                                    <label class="block font-medium mb-2 text-700">Ficha Técnica (URL o PDF)</label>
                                    <input pInputText formControlName="datasheet" placeholder="https://" class="w-full"/>
                                </div>
                            </div>
                        </p-fluid>
                    </p-tabpanel>
                </p-tabpanels>
            </p-tabs>

            <!-- Actions Footer -->
            <div class="flex justify-content-end gap-3 mt-6 pt-4 border-t border-surface-200">
                <p-button label="Cancelar" severity="secondary" [outlined]="true" icon="pi pi-times" routerLink="/inventory/products"></p-button>
                <p-button label="Guardar Producto Completo" type="submit" [disabled]="productForm.invalid" icon="pi pi-save"></p-button>
            </div>
        </form>
    </div>
  `
})
export class ProductFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private productService = inject(ProductService);
  private categoryService = inject(CategoryService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private apiUrl = inject(API_URL);

  isEditMode = false;
  categories: Category[] = [];
  tributes: any[] = [];
  
  // Conf del sistema dual de utilidades
  utility_calc_method = 'MARKUP';
  
  currencies = [
      { label: 'USD - Dólares', value: 1 },
      { label: 'BS. - Bolívares', value: 2 }
  ];

  facilities = [
      { label: 'CEDI Central', value: 1 },
      { label: 'Tienda Norte', value: 2 },
      { label: 'Tienda Sur', value: 3 }
  ];

  uomOptions = [
    { label: 'Piezas (PZA)', value: 'PZA' },
    { label: 'Kilos (KG)', value: 'KG' },
    { label: 'Litros (LT)', value: 'LT' }
  ];

  barcodeTypes = [
    { label: 'EAN-13', value: 'EAN13' },
    { label: 'UPC', value: 'UPC' },
    { label: 'CODE128', value: 'CODE128' }
  ];

  productForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    category_id: [null, Validators.required],
    brand: [''],
    currency_id: [1, Validators.required],
    is_liquor: [false],
    shrinkage_percent: [0],
    description: [''],
    uom_base: ['PZA'],
    tax_id: [null, Validators.required],
    has_variants: [false],
    
    // Ejes Matemáticos
    average_cost: [{value: 0, disabled: true}],
    last_cost: [{value: 0, disabled: true}],
    replacement_cost: [0],
    standard_cost: [0],
    target_utility_pct: [30],
    price: [0],

    packagings: this.fb.array([]),
    facility_prices: this.fb.array([]),
    barcodes: this.fb.array([]),
    datasheet: ['']
  });

  get packagings() { return this.productForm.get('packagings') as FormArray; }
  get facilityPrices() { return this.productForm.get('facility_prices') as FormArray; }
  get barcodes() { return this.productForm.get('barcodes') as FormArray; }

  addPackaging() {
    this.packagings.push(this.fb.group({
      name: ['', Validators.required],
      qty_per_unit: [1, Validators.required],
      weight_kg: [0],
      volume_m3: [0]
    }));
  }

  removePackaging(index: number) { this.packagings.removeAt(index); }

  addFacilityPrice() {
    const parentPrice = this.productForm.get('price')?.value || 0;
    const parentUtility = this.productForm.get('target_utility_pct')?.value || 0;
    
    const group = this.fb.group({
      facility_id: [null, Validators.required],
      target_utility_pct: [parentUtility],
      sales_price: [parentPrice]
    });
    
    group.get('target_utility_pct')?.valueChanges.subscribe(val => {
        const cost = this.productForm.get('standard_cost')?.value || 0;
        const shrink = this.productForm.get('shrinkage_percent')?.value || 0;
        const newPrice = this.calculatePriceForward(cost, val || 0, shrink);
        group.patchValue({ sales_price: newPrice }, { emitEvent: false });
    });

    group.get('sales_price')?.valueChanges.subscribe(val => {
        const cost = this.productForm.get('standard_cost')?.value || 0;
        const shrink = this.productForm.get('shrinkage_percent')?.value || 0;
        const newUtil = this.calculateUtilityBackward(cost, val || 0, shrink);
        group.patchValue({ target_utility_pct: newUtil }, { emitEvent: false });
    });

    this.facilityPrices.push(group);
  }

  removeFacilityPrice(index: number) { this.facilityPrices.removeAt(index); }

  addBarcode() {
    this.barcodes.push(this.fb.group({
      code_type: ['EAN13'],
      barcode: ['', Validators.required],
      uom: ['PZA']
    }));
  }

  removeBarcode(index: number) { this.barcodes.removeAt(index); }

  ngOnInit() {
    this.loadCategories();
    this.loadTributes();
    this.loadFacilities();
    
    this.route.params.subscribe(params => {
      if (params['id'] && params['id'] !== 'new') {
        this.isEditMode = true;
        this.loadProduct(params['id']);
      }
    });

    // Suscripciones Core Reactivas Bidireccionales
    this.productForm.get('target_utility_pct')?.valueChanges.subscribe(val => {
        const cost = this.productForm.get('standard_cost')?.value || 0;
        const shrink = this.productForm.get('shrinkage_percent')?.value || 0;
        const newPrice = this.calculatePriceForward(cost, val || 0, shrink);
        this.productForm.patchValue({ price: newPrice }, { emitEvent: false });
    });

    this.productForm.get('price')?.valueChanges.subscribe(val => {
        const cost = this.productForm.get('standard_cost')?.value || 0;
        const shrink = this.productForm.get('shrinkage_percent')?.value || 0;
        const newUtil = this.calculateUtilityBackward(cost, val || 0, shrink);
        this.productForm.patchValue({ target_utility_pct: newUtil }, { emitEvent: false });
    });

    this.productForm.get('standard_cost')?.valueChanges.subscribe(cost => {
        const util = this.productForm.get('target_utility_pct')?.value || 0;
        const shrink = this.productForm.get('shrinkage_percent')?.value || 0;
        const newPrice = this.calculatePriceForward(cost || 0, util, shrink);
        this.productForm.patchValue({ price: newPrice }, { emitEvent: false });
    });
  }

  loadProduct(id: number) {
      this.productService.getProductById(id).subscribe({
          next: (product) => {
              this.productForm.patchValue({
                  name: product.name,
                  category_id: product.category_id,
                  brand: product.brand,
                  description: product.description,
                  uom_base: product.uom_base,
                  tax_id: product.tax_id || 3,
                  has_variants: product.has_variants,
                  datasheet: product.datasheet
              });
              
              const isLiquor = (product as any).is_liquor;
              if (isLiquor !== undefined) {
                  this.productForm.patchValue({ is_liquor: isLiquor });
              }
              const currencyId = (product as any).currency_id;
              if (currencyId !== undefined) {
                  this.productForm.patchValue({ currency_id: currencyId });
              }

              if (product.variants && product.variants.length > 0) {
                  const firstVariant = product.variants[0];
                  this.productForm.patchValue({
                      standard_cost: firstVariant.standard_cost,
                      replacement_cost: firstVariant.replacement_cost,
                      average_cost: firstVariant.average_cost,
                      last_cost: firstVariant.last_cost,
                      price: firstVariant.sales_price
                  });
                  
                  // Load saved Facility Prices
                  if (firstVariant.facility_prices && firstVariant.facility_prices.length > 0) {
                      this.facilityPrices.clear();
                      firstVariant.facility_prices.forEach((fp: any) => {
                          const group = this.fb.group({
                              facility_id: [fp.facility_id, Validators.required],
                              target_utility_pct: [fp.target_utility_pct !== null ? fp.target_utility_pct : 0],
                              sales_price: [fp.sales_price, Validators.required],
                              price_with_tax: [{value: 0, disabled: true}]
                          });
                          
                          group.get('target_utility_pct')?.valueChanges.subscribe(val => {
                              const cost = this.productForm.get('standard_cost')?.value || 0;
                              const shrink = this.productForm.get('shrinkage_percent')?.value || 0;
                              const newPrice = this.calculatePriceForward(cost, val || 0, shrink);
                              group.patchValue({ sales_price: newPrice }, { emitEvent: false });
                          });

                          group.get('sales_price')?.valueChanges.subscribe(val => {
                              const cost = this.productForm.get('standard_cost')?.value || 0;
                              const shrink = this.productForm.get('shrinkage_percent')?.value || 0;
                              const newUtil = this.calculateUtilityBackward(cost, val || 0, shrink);
                              group.patchValue({ target_utility_pct: newUtil }, { emitEvent: false });
                          });
                          
                          this.facilityPrices.push(group);
                      });
                  }
              }
              
              // Load saved Packagings
              if (product.packagings && product.packagings.length > 0) {
                  this.packagings.clear();
                  product.packagings.forEach((pack: any) => {
                      this.packagings.push(this.fb.group({
                          name: [pack.name, Validators.required],
                          qty_per_unit: [pack.qty_per_unit, Validators.required],
                          weight_kg: [pack.weight_kg],
                          volume_m3: [pack.volume_m3]
                      }));
                  });
              }
          },
          error: (err) => console.error("Error loading product", err)
      });
  }

  // ============== MATEMATICAS ===============

  calculatePriceForward(cost: number, utilityPct: number, shrinkagePct: number): number {
      const u = utilityPct / 100;
      const s = shrinkagePct / 100;
      if (this.utility_calc_method === 'MARKUP') {
          const protectedCost = s < 1 ? cost / (1 - s) : cost;
          return protectedCost * (1 + u);
      } else {
          const factor = 1 - (u + s);
          return factor > 0 ? cost / factor : 0;
      }
  }

  calculateUtilityBackward(cost: number, price: number, shrinkagePct: number): number {
      if (price <= 0) return 0;
      const s = shrinkagePct / 100;
      if (this.utility_calc_method === 'MARKUP') {
          const protectedCost = s < 1 ? cost / (1 - s) : cost;
          if (protectedCost <= 0) return 0;
          return ((price / protectedCost) - 1) * 100;
      } else {
          return (1 - (cost / price)) * 100 - (s * 100);
      }
  }

  getRealUtility(): number {
      const form = this.productForm;
      return this.calculateUtilityBackward(
          form.get('standard_cost')?.value || 0,
          form.get('price')?.value || 0,
          form.get('shrinkage_percent')?.value || 0
      );
  }

  getFacilityRealUtility(index: number): number {
      const form = this.facilityPrices.at(index);
      return this.calculateUtilityBackward(
          this.productForm.get('standard_cost')?.value || 0,
          form.get('sales_price')?.value || 0,
          this.productForm.get('shrinkage_percent')?.value || 0
      );
  }

  getFacilityPriceWithTax(index: number): number {
      const form = this.facilityPrices.at(index);
      const basePrice = form.get('sales_price')?.value || 0;
      const taxId = this.productForm.get('tax_id')?.value;
      if (!taxId || !this.tributes.length) return basePrice;
      
      const taxRule = this.tributes.find(t => t.id === taxId);
      if (!taxRule) return basePrice;
      return basePrice * (1 + (Number(taxRule.rate) / 100));
  }

  // ==========================================

  loadTributes() {
      this.http.get<any[]>(`${this.apiUrl}/tributes`).subscribe(data => {
          this.tributes = data;
          if (!this.isEditMode && data.length > 0) {
              const defaultTax = data.find(t => t.rate == 16.00) || data[0];
              this.productForm.patchValue({ tax_id: defaultTax.id });
          }
      });
  }

  loadFacilities() {
      this.http.get<any[]>(`${this.apiUrl}/facilities`).subscribe({
          next: data => {
              this.facilities = data.map(f => ({ label: f.name, value: f.id }));
          },
          error: err => console.error("Error loading facilities", err)
      });
  }

  loadCategories() {
    this.categoryService.getList().subscribe(data => this.categories = data);
  }

  getPriceWithTax(): number {
      const basePrice = this.productForm.get('price')?.value || 0;
      const taxId = this.productForm.get('tax_id')?.value;
      if (!taxId || this.tributes.length === 0) return basePrice;
      
      const taxRule = this.tributes.find(t => t.id === taxId);
      if (!taxRule) return basePrice;
      
      const rate = Number(taxRule.rate) / 100;
      return basePrice * (1 + rate);
  }

  onSubmit() {
    if (this.productForm.invalid) {
        this.productForm.markAllAsTouched();
        alert("Faltan campos obligatorios. Revisa las pestañas en rojo.");
        return;
    }
    
    // Armamos el payload descartando variables de sólo lectura que causan 422
    const formVals = this.productForm.getRawValue();
    const formData = { ...formVals };
    delete formData.average_cost;
    delete formData.last_cost;
    // Si no maneja variantes limpiamos el checkbox
    formData.has_variants = formData.has_variants === true;
    
    if (this.isEditMode) {
      const id = this.route.snapshot.params['id'];
      this.productService.updateProduct(id, formData).subscribe({
        next: (res) => this.router.navigate(['/inventory/products']),
        error: (err) => {
            console.error(err);
            alert("El Servidor rechazó el guardado:\n" + JSON.stringify(err.error?.detail || err.message, null, 2));
        }
      });
    } else {
      this.productService.createProduct(formData).subscribe({
        next: (res) => this.router.navigate(['/inventory/products']),
        error: (err) => {
            console.error(err);
            alert("Error al Crear:\n" + JSON.stringify(err.error?.detail || err.message, null, 2));
        }
      });
    }
  }
}
