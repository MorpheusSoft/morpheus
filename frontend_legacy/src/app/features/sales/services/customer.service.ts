import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface Customer {
    id?: number;
    rif: string;
    name: string;
    address?: string;
    shipping_address?: string;
    phone?: string;
    email?: string;
    is_active: boolean;
    created_at?: string;
}

@Injectable({
    providedIn: 'root'
})
export class CustomerService {
    private apiUrl = `${environment.apiUrl}/customers`;

    constructor(private http: HttpClient) { }

    getCustomers(): Observable<Customer[]> {
        return this.http.get<Customer[]>(this.apiUrl);
    }

    getCustomer(id: number): Observable<Customer> {
        return this.http.get<Customer>(`${this.apiUrl}/${id}`);
    }

    createCustomer(customer: Customer): Observable<Customer> {
        return this.http.post<Customer>(this.apiUrl, customer);
    }

    updateCustomer(id: number, customer: Customer): Observable<Customer> {
        return this.http.put<Customer>(`${this.apiUrl}/${id}`, customer);
    }

    deleteCustomer(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/${id}`);
    }
}
