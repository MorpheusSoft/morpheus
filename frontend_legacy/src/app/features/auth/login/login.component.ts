import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="container d-flex align-items-center justify-content-center min-vh-100 bg-light">
      <div class="card shadow-sm p-4" style="width: 100%; max-width: 400px;">
        <div class="text-center mb-4">
          <h1 class="h3 mb-3 fw-normal">Iniciar Sesión</h1>
          <p class="text-muted">Inventario Morpheus</p>
        </div>
        
        <form (ngSubmit)="onSubmit()" #loginForm="ngForm">
            <div class="alert alert-danger" *ngIf="errorMessage">
                {{ errorMessage }}
            </div>

          <div class="form-floating mb-3">
            <input type="email" class="form-control" id="floatingInput" placeholder="name@example.com" 
                   [(ngModel)]="email" name="email" required>
            <label for="floatingInput">Correo electrónico</label>
          </div>
          <div class="form-floating mb-3">
            <input type="password" class="form-control" id="floatingPassword" placeholder="Password"
                   [(ngModel)]="password" name="password" required>
            <label for="floatingPassword">Contraseña</label>
          </div>

          <button class="w-100 btn btn-lg btn-primary" type="submit" [disabled]="!loginForm.form.valid || isLoading">
            <span *ngIf="isLoading" class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            {{ isLoading ? 'Entrando...' : 'Ingresar' }}
          </button>
        </form>
      </div>
    </div>
  `
})
export class LoginComponent {
    email = '';
    password = '';
    errorMessage = '';
    isLoading = false;

    constructor(private authService: AuthService, private router: Router) { }

    onSubmit() {
        this.isLoading = true;
        this.errorMessage = '';

        // For MVP testing, ensure backend actually accepts this.
        // My previous curl tests used username/password.
        // The form below sends 'email' as username.
        this.authService.login(this.email, this.password).subscribe({
            next: () => {
                this.isLoading = false;
                this.router.navigate(['/dashboard']);
            },
            error: (err) => {
                this.isLoading = false;
                console.error(err);
                this.errorMessage = 'Credenciales inválidas o error de conexión.';
            }
        });
    }
}
