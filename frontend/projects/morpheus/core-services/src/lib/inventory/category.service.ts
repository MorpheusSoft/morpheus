import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_URL } from '../api.config';
import { Category, CategoryCreate } from '@morpheus/models';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private http = inject(HttpClient);
  private apiUrl = `${inject(API_URL)}/categories`;

  getTree(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.apiUrl}/tree`);
  }

  getList(): Observable<Category[]> {
    return this.http.get<Category[]>(this.apiUrl);
  }

  getById(id: number): Observable<Category> {
    return this.http.get<Category>(`${this.apiUrl}/${id}`);
  }

  create(category: CategoryCreate): Observable<Category> {
    return this.http.post<Category>(this.apiUrl, category);
  }

  update(id: number, category: Partial<CategoryCreate>): Observable<Category> {
    return this.http.put<Category>(`${this.apiUrl}/${id}`, category);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
