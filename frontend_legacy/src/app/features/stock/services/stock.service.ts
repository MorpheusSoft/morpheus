import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface StockPickingType {
  id: number;
  name: string;
  code: string;
  sequence_prefix: string;
}

export interface StockPicking {
  id: number;
  name: string;
  picking_type_id: number;
  origin_document?: string;
  status: 'DRAFT' | 'CONFIRMED' | 'DONE' | 'CANCELLED';
  scheduled_date?: string;
  date_done?: string;
  // Relations would be nice but backend might not return nested by default unless requested.
  // For list view we might need type name.
}

export interface StockPickingCreate {
  picking_type_id: number;
  origin_document?: string;
  facility_id?: number;
}

export interface StockMove {
  id: number;
  picking_id: number;
  product_id: number;
  product_name?: string; // Should be enriched or fetched
  location_src_id: number;
  location_dest_id: number;
  quantity_demand: number;
  quantity_done: number;
  state: string;
}

export interface StockMoveCreate {
  picking_id: number;
  product_id: number;
  location_src_id: number;
  location_dest_id: number;
  quantity_demand: number;
}

@Injectable({
  providedIn: 'root'
})
export class StockService {
  private apiUrl = `${environment.apiUrl}`;
  // Endpoints:
  // /picking-types/
  // /pickings/
  // /pickings/{id}/moves
  // /pickings/{id}/validate

  constructor(private http: HttpClient) { }

  getPickingTypes(): Observable<StockPickingType[]> {
    return this.http.get<StockPickingType[]>(`${this.apiUrl}/picking-types/`);
  }

  getPickings(): Observable<StockPicking[]> {
    return this.http.get<StockPicking[]>(`${this.apiUrl}/pickings/`);
  }

  getPicking(id: number): Observable<StockPicking> {
    return this.http.get<StockPicking>(`${this.apiUrl}/pickings/${id}`);
  }

  createPicking(picking: StockPickingCreate): Observable<StockPicking> {
    return this.http.post<StockPicking>(`${this.apiUrl}/pickings/`, picking);
  }

  addMove(pickingId: number, move: StockMoveCreate): Observable<StockMove> {
    return this.http.post<StockMove>(`${this.apiUrl}/pickings/${pickingId}/moves`, move);
  }

  validatePicking(pickingId: number): Observable<StockPicking> {
    return this.http.post<StockPicking>(`${this.apiUrl}/pickings/${pickingId}/validate`, {});
  }
}
