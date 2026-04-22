import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface InventorySession {
    id: number;
    name: string;
    facility_id?: number;
    warehouse_id?: number;
    state: 'DRAFT' | 'IN_PROGRESS' | 'CONFIRMING' | 'DONE' | 'CANCELLED';
    date_start: string;
    date_end?: string;
    lines?: InventoryLine[];
}

export interface InventorySessionCreate {
    name: string;
    warehouse_id?: number;
    facility_id?: number;
}

export interface InventoryLine {
    id: number;
    product_variant_id: number;
    location_id: number;
    counted_qty: number;
    theoretical_qty?: number;
    difference_qty?: number;
    notes?: string;
}

export interface InventoryLineCreate {
    product_variant_id: number;
    location_id: number;
    counted_qty: number;
    notes?: string;
}

@Injectable({
    providedIn: 'root'
})
export class InventoryService {
    private apiUrl = `${environment.apiUrl}/inventory`;

    constructor(private http: HttpClient) { }

    getSessions(): Observable<InventorySession[]> {
        return this.http.get<InventorySession[]>(`${this.apiUrl}/sessions/`);
    }

    getSession(id: number): Observable<InventorySession> {
        return this.http.get<InventorySession>(`${this.apiUrl}/sessions/${id}`);
    }

    createSession(data: InventorySessionCreate): Observable<InventorySession> {
        return this.http.post<InventorySession>(`${this.apiUrl}/sessions/`, data);
    }

    startSession(id: number): Observable<InventorySession> {
        return this.http.post<InventorySession>(`${this.apiUrl}/sessions/${id}/start`, {});
    }

    addLine(sessionId: number, data: InventoryLineCreate): Observable<InventoryLine> {
        return this.http.post<InventoryLine>(`${this.apiUrl}/sessions/${sessionId}/lines`, data);
    }

    validateSession(sessionId: number): Observable<InventorySession> {
        return this.http.post<InventorySession>(`${this.apiUrl}/sessions/${sessionId}/validate`, {});
    }
}
