import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MainLayoutComponent, MenuItem } from '@morpheus/ui';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MainLayoutComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'morpheus-admin';

  menuItems: MenuItem[] = [
    { label: 'Dashboard', icon: 'pi pi-chart-bar', routerLink: '/' },
    { label: 'Facilities', icon: 'pi pi-building', routerLink: '/facilities' },
    { label: 'Users', icon: 'pi pi-users', routerLink: '/users' },
    { label: 'Roles', icon: 'pi pi-shield', routerLink: '/roles' },
    { label: 'Settings', icon: 'pi pi-cog', routerLink: '/settings' }
  ];
}
