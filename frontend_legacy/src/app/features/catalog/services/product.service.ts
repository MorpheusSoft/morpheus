import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface Product {
  id: number;
  name: string;
  description?: string;
  category_id?: number;
  brand?: string;
  model?: string;
  product_type: string;
  uom_base?: string;
  image_main?: string;
  datasheet?: string;
  has_variants: boolean;
  is_active: boolean;
  variants?: ProductVariant[];
}

export interface ProductCreate {
  name: string;
  description?: string;
  category_id?: number;
  brand?: string;
  model?: string;
  product_type: string;
  uom_base: string;
  image_main?: string;
  datasheet?: string;
  has_variants?: boolean;
  is_active?: boolean;

  // Helper fields for initial variant
  sku?: string;
  price?: number;
  standard_cost?: number;
  replacement_cost?: number;
  currency_id?: number;
}

export interface ProductVariant {
  id: number;
  product_id: number;
  sku: string;
  barcode?: string;
  sales_price?: number;
  standard_cost?: number;
  replacement_cost?: number;
  part_number?: string;
  image?: string;
  currency_id?: number;
  is_published?: boolean;
  barcodes?: ProductBarcode[];
}

export interface ProductVariantCreate {
  product_id: number;
  sku: string;
  barcode?: string;
  sales_price?: number;
  standard_cost?: number;
  replacement_cost?: number;
  part_number?: string;
  image?: string;
  currency_id?: number;
  is_published?: boolean;
}

export interface ProductBarcode {
  id: number;
  product_variant_id: number;
  barcode: string;
  code_type: string;
  uom: string;
  conversion_factor: number;
  weight?: number;
  dimensions?: string;
}

export interface ProductBarcodeCreate {
  barcode: string;
  code_type: string;
  uom: string;
  conversion_factor: number;
  weight?: number;
  dimensions?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private apiUrl = `${environment.apiUrl}/products/`;

  constructor(private http: HttpClient) { }

  getProducts(): Observable<Product[]> {
    return this.http.get<Product[]>(this.apiUrl);
  }

  getProduct(id: number): Observable<Product> {
    return this.http.get<Product>(`${this.apiUrl}${id}`);
  }

  createProduct(product: ProductCreate): Observable<Product> {
    return this.http.post<Product>(this.apiUrl, product);
  }

  updateProduct(id: number, product: ProductCreate): Observable<Product> {
    return this.http.put<Product>(`${this.apiUrl}${id}`, product);
  }

  deleteProduct(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}${id}`);
  }

  createVariant(productId: number, variant: ProductVariantCreate): Observable<ProductVariant> {
    return this.http.post<ProductVariant>(`${this.apiUrl}${productId}/variants`, variant);
  }

  getBarcodes(variantId: number): Observable<ProductBarcode[]> {
    return this.http.get<ProductBarcode[]>(`${this.apiUrl}variants/${variantId}/barcodes`);
  }

  addBarcode(variantId: number, barcode: ProductBarcodeCreate): Observable<ProductBarcode> {
    return this.http.post<ProductBarcode>(`${this.apiUrl}variants/${variantId}/barcodes`, barcode);
  }

  deleteBarcode(barcodeId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}barcodes/${barcodeId}`);
  }
}
