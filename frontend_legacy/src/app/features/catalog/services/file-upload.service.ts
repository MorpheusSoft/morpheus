import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class FileUploadService {
    private apiUrl = `${environment.apiUrl}/utils/upload/`;

    constructor(private http: HttpClient) { }

    uploadFile(file: File): Observable<{ url: string, filename: string }> {
        const formData = new FormData();
        formData.append('file', file);
        return this.http.post<{ url: string, filename: string }>(this.apiUrl, formData);
    }
}
