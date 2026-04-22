import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API_URL = 'http://localhost:8000/api/v1';

export interface Product {
    id: number;
    name: string;
    sku?: string; // From variant
    product_type: string;
    category_id: number;
    standard_cost?: number;
    is_active: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class ProductService {
    constructor(private http: HttpClient) { }

    getProducts(skip = 0, limit = 100): Observable<Product[]> {
        return this.http.get<Product[]>(`${API_URL}/products/?skip=${skip}&limit=${limit}`);
    }

    createProduct(data: any): Observable<Product> {
        return this.http.post<Product>(`${API_URL}/products/`, data);
    }
}
