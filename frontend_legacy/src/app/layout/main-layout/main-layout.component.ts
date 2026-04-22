import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AvatarModule } from 'primeng/avatar';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, AvatarModule, MenuModule],
  template: `
    <div class="layout-wrapper">
      <!-- Sidebar -->
      <aside class="layout-sidebar" [class.sidebar-hidden]="sidebarHidden">
        <div class="sidebar-header">
          <div class="logo">
             <i class="pi pi-th-large"></i>
          </div>
          <span class="app-name">Morpheus</span>
        </div>
        
        <div class="sidebar-menu">
          <a routerLink="/dashboard" routerLinkActive="active" class="menu-item mt-2">
            <i class="pi pi-home"></i> <span>Dashboard</span>
          </a>
          
          <div class="menu-section">Catálogos</div>
          <a routerLink="/catalog/categories" routerLinkActive="active" class="menu-item">
            <i class="pi pi-tags"></i> <span>Categorías</span>
          </a>
          <a routerLink="/catalog/products" routerLinkActive="active" class="menu-item">
            <i class="pi pi-box"></i> <span>Productos</span>
          </a>
          <a routerLink="/locations" routerLinkActive="active" class="menu-item">
            <i class="pi pi-map-marker"></i> <span>Ubicaciones</span>
          </a>

          <div class="menu-section">Operaciones</div>
          <a routerLink="/stock/pickings" routerLinkActive="active" class="menu-item">
            <i class="pi pi-arrow-right-arrow-left"></i> <span>Movimientos</span>
          </a>
          <a routerLink="/inventory" routerLinkActive="active" class="menu-item">
            <i class="pi pi-check-square"></i> <span>Auditorías</span>
          </a>

          <div class="menu-section">Reportes</div>
          <a routerLink="/reports/stock" routerLinkActive="active" class="menu-item">
            <i class="pi pi-chart-bar"></i> <span>Niveles de Stock</span>
          </a>
        </div>
      </aside>

      <!-- Main Content -->
      <div class="layout-main-container">
        <header class="layout-topbar">
          <div class="topbar-left">
              <button class="menu-button" (click)="toggleSidebar()">
                <i class="pi pi-bars"></i>
              </button>
              <h2 class="page-title">Gestión de Inventario</h2>
          </div>
          <div class="topbar-right">
              <span class="user-name">Admin</span>
              <p-avatar icon="pi pi-user" shape="circle" class="user-avatar" (click)="menu.toggle($event)"></p-avatar>
              <p-menu #menu [model]="userMenuItems" [popup]="true"></p-menu>
          </div>
        </header>
        
        <main class="layout-content">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styles: [`
    .layout-wrapper {
      display: flex;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
      background-color: var(--p-content-background);
    }

    .layout-sidebar {
      width: 280px;
      background-color: #0f172a; /* Slate 900 */
      color: white;
      display: flex;
      flex-direction: column;
      transition: all 0.2s ease-in-out;
      box-shadow: 2px 0 8px rgba(0,0,0,0.1);
      z-index: 10;
    }

    .layout-sidebar.sidebar-hidden {
      margin-left: -280px;
    }

    .sidebar-header {
      height: 70px;
      min-height: 70px;
      display: flex;
      align-items: center;
      padding: 0 1.5rem;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .sidebar-header .logo {
      width: 36px;
      height: 36px;
      background-color: var(--p-primary-color);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 12px;
    }

    .sidebar-header .logo i {
      color: var(--p-primary-contrast-color, #fff);
      font-size: 1.2rem;
    }

    .sidebar-header .app-name {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.5px;
    }

    .sidebar-menu {
      flex: 1;
      padding: 1.5rem 1rem;
      overflow-y: auto;
    }

    .menu-section {
      font-size: 0.75rem;
      text-transform: uppercase;
      font-weight: 700;
      color: rgba(255,255,255,0.4);
      margin: 1.5rem 0 0.5rem 1rem;
      letter-spacing: 1px;
    }

    .menu-item {
      display: flex;
      align-items: center;
      padding: 0.75rem 1rem;
      color: rgba(255,255,255,0.7);
      text-decoration: none;
      font-weight: 500;
      border-radius: 8px;
      margin-bottom: 0.25rem;
      transition: all 0.2s;
    }

    .menu-item i {
      margin-right: 12px;
      font-size: 1.2rem;
    }

    .menu-item:hover {
      background-color: rgba(255,255,255,0.05);
      color: #fff;
    }

    .menu-item.active {
      background-color: var(--p-primary-color);
      color: var(--p-primary-contrast-color, #fff);
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }

    .layout-main-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background-color: var(--p-surface-50, #f8fafc);
    }

    .layout-topbar {
      height: 70px;
      min-height: 70px;
      background-color: var(--p-surface-0, #fff);
      border-bottom: 1px solid var(--p-content-border-color, #e2e8f0);
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 2rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.02);
      z-index: 5;
    }

    .topbar-left {
      display: flex;
      align-items: center;
    }

    .menu-button {
      background: transparent;
      border: none;
      color: var(--p-text-color, #475569);
      font-size: 1.25rem;
      cursor: pointer;
      margin-right: 1.5rem;
      padding: 0.5rem;
      border-radius: 50%;
      height: 40px;
      width: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s;
    }

    .menu-button:hover {
      background-color: var(--p-content-hover-background, #f1f5f9);
    }

    .page-title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--p-text-color, #1e293b);
    }

    .topbar-right {
      display: flex;
      align-items: center;
    }

    .user-name {
      margin-right: 12px;
      font-weight: 500;
      color: var(--p-text-color, #475569);
    }

    .user-avatar {
      cursor: pointer;
      transition: transform 0.2s;
    }
    .user-avatar:hover {
      transform: scale(1.05);
    }

    .layout-content {
      flex: 1;
      padding: 2rem;
      overflow-y: auto;
    }
  `]
})
export class MainLayoutComponent implements OnInit {
  sidebarHidden = false;
  userMenuItems: MenuItem[] | undefined;

  constructor(private authService: AuthService) { }

  ngOnInit() {
    this.userMenuItems = [
      {
        label: 'Perfil',
        icon: 'pi pi-user',
        command: () => {
          // Handle profile
        }
      },
      {
        separator: true
      },
      {
        label: 'Cerrar Sesión',
        icon: 'pi pi-sign-out',
        command: () => this.logout()
      }
    ];
  }

  toggleSidebar() {
    this.sidebarHidden = !this.sidebarHidden;
  }

  logout() {
    this.authService.logout();
  }
}

