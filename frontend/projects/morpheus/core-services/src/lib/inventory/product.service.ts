import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { API_URL } from '../api.config';
import { Product, ProductCreate, ProductVariant, ProductVariantCreate } from '@morpheus/models';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private http = inject(HttpClient);
  private apiUrl = `${inject(API_URL)}/products`;
  private variantUrl = `${inject(API_URL)}/products/variants`;

  // --- PRODUCTS ---
  
  getProducts(categoryId?: number, skip = 0, limit = 100): Observable<Product[]> {
    let params = new HttpParams().set('skip', skip).set('limit', limit);
    if (categoryId) {
      params = params.set('category_id', categoryId);
    }
    return this.http.get<Product[]>(this.apiUrl, { params });
  }

  getProductById(id: number): Observable<Product> {
    return this.http.get<Product>(`${this.apiUrl}/${id}`);
  }

  createProduct(product: ProductCreate): Observable<Product> {
    return this.http.post<Product>(this.apiUrl, product);
  }

  updateProduct(id: number, product: Partial<ProductCreate>): Observable<Product> {
    return this.http.put<Product>(`${this.apiUrl}/${id}`, product);
  }

  // --- VARIANTS ---
  
  getVariantsByProduct(productId: number): Observable<ProductVariant[]> {
    return this.http.get<ProductVariant[]>(`${this.apiUrl}/${productId}/variants`);
  }

  createVariant(variant: ProductVariantCreate): Observable<ProductVariant> {
    return this.http.post<ProductVariant>(this.variantUrl, variant);
  }

  updateVariant(id: number, variant: Partial<ProductVariantCreate>): Observable<ProductVariant> {
    return this.http.put<ProductVariant>(`${this.variantUrl}/${id}`, variant);
  }
}
