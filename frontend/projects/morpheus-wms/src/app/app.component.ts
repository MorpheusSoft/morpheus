import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MainLayoutComponent, MenuItem } from '@morpheus/ui';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MainLayoutComponent],
  template: `
      <ui-main-layout [menuItems]="menuItems">
          <router-outlet></router-outlet>
      </ui-main-layout>
  `,
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'morpheus-wms';

  menuItems: MenuItem[] = [
      { label: 'Catálogo Maestro', icon: 'pi pi-box', routerLink: '/inventory/products' },
      { label: 'Categorías', icon: 'pi pi-tags', routerLink: '/inventory/categories' }
  ];
}
