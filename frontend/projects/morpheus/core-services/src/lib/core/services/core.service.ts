import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Currency {
    id: number;
    code: string;
    name: string;
    symbol: string;
}

@Injectable({
    providedIn: 'root'
})
export class CoreService {
    private apiUrl = `${environment.apiUrl}/core`;

    // MOCK DATA for now, until we implement the backend endpoint for currencies
    private mockCurrencies: Currency[] = [
        { id: 1, code: 'USD', name: 'US Dollar', symbol: '$' },
        { id: 2, code: 'MXN', name: 'Mexican Peso', symbol: '$' },
        { id: 3, code: 'VES', name: 'Bolívar', symbol: 'Bs.' },
        { id: 4, code: 'EUR', name: 'Euro', symbol: '€' }
    ];

    constructor(private http: HttpClient) { }

    getCurrencies(): Observable<Currency[]> {
        // In the future: return this.http.get<Currency[]>(`${this.apiUrl}/currencies`);
        return of(this.mockCurrencies);
    }
}
