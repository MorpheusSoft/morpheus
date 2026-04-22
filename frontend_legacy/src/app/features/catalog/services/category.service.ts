import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface Category {
  id: number;
  name: string;
  slug: string;
  parent_id?: number;
  is_active: boolean;
  path?: string;
}

export interface CategoryCreate {
  name: string;
  parent_id?: number;
  is_active?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private apiUrl = `${environment.apiUrl}/categories/`;

  constructor(private http: HttpClient) { }

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(this.apiUrl);
  }

  createCategory(category: CategoryCreate): Observable<Category> {
    return this.http.post<Category>(this.apiUrl, category);
  }

  getCategory(id: number): Observable<Category> {
    return this.http.get<Category>(`${environment.apiUrl}/categories/${id}`); // Note: backend might need this endpoint if filters don't suffice
  }

  updateCategory(id: number, category: CategoryCreate): Observable<Category> {
    return this.http.put<Category>(`${environment.apiUrl}/categories/${id}`, category);
  }

  deleteCategory(id: number): Observable<any> {
    return this.http.delete<any>(`${environment.apiUrl}/categories/${id}`);
  }
}
