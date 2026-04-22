import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface OrderItem {
    id: number;
    order_id: number;
    product_id: number;
    quantity: number;
    unit_price: number;
    subtotal: number;
}

export interface Order {
    id?: number;
    customer_id: number;
    status: string;
    total_amount: number;
    notes?: string;
    created_at?: string;
    items?: OrderItem[];
}

@Injectable({
    providedIn: 'root'
})
export class OrderService {
    private apiUrl = `${environment.apiUrl}/orders`;

    constructor(private http: HttpClient) { }

    getOrders(): Observable<Order[]> {
        return this.http.get<Order[]>(this.apiUrl);
    }

    getOrder(id: number): Observable<Order> {
        return this.http.get<Order>(`${this.apiUrl}/${id}`);
    }

    updateOrderStatus(id: number, status: string, notes?: string): Observable<Order> {
        return this.http.put<Order>(`${this.apiUrl}/${id}/status`, { status, notes });
    }
}
