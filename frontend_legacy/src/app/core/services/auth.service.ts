import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, map } from 'rxjs';
import { Router } from '@angular/router';

import { environment } from '../../../environments/environment';

// const API_URL = 'http://localhost:8000/api/v1';

export interface User {
    id: number;
    email: string;
    facilities?: any[]; // Simplified for now
}

export interface AuthResponse {
    access_token: string;
    token_type: string;
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private tokenKey = 'morpheus_token';
    private currentUserSubject: BehaviorSubject<User | null>;
    public currentUser: Observable<User | null>;

    constructor(private http: HttpClient, private router: Router) {
        this.currentUserSubject = new BehaviorSubject<User | null>(null);
        this.currentUser = this.currentUserSubject.asObservable();
        this.loadUser();
    }

    private loadUser() {
        const token = localStorage.getItem(this.tokenKey);
        if (token) {
            // In a real app, decode token or fetch /me. 
            // For MVP, we presume logged in if token exists. 
            // Ideally we should decode JWT to getting User ID/Email.
            this.currentUserSubject.next({ id: 0, email: 'user@example.com' });
        }
    }

    login(username: string, password: string): Observable<AuthResponse> {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);

        return this.http.post<AuthResponse>(`${environment.apiUrl}/login/access-token`, formData)
            .pipe(map(response => {
                if (response.access_token) {
                    localStorage.setItem(this.tokenKey, response.access_token);
                    this.currentUserSubject.next({ id: 1, email: username }); // Mock user object for now
                }
                return response;
            }));
    }

    logout() {
        localStorage.removeItem(this.tokenKey);
        this.currentUserSubject.next(null);
        this.router.navigate(['/login']);
    }

    getToken(): string | null {
        return localStorage.getItem(this.tokenKey);
    }
}
