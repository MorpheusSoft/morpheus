import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { OverlayPanelModule } from 'primeng/overlaypanel';

interface AppItem {
  name: string;
  icon: string;
  url: string;
  color: string;
}

@Component({
  selector: 'ui-app-switcher',
  standalone: true,
  imports: [CommonModule, ButtonModule, OverlayPanelModule],
  templateUrl: './app-switcher.component.html',
  styleUrls: ['./app-switcher.component.css']
})
export class AppSwitcherComponent {
  apps: AppItem[] = [
    { name: 'Inventory WMS', icon: 'pi pi-box', url: 'http://wms.morpheus.local', color: '#3B82F6' },
    { name: 'Purchasing', icon: 'pi pi-shopping-cart', url: 'http://pur.morpheus.local', color: '#10B981' },
    { name: 'Sales POS', icon: 'pi pi-tags', url: 'http://sales.morpheus.local', color: '#F59E0B' },
    { name: 'Core Admin', icon: 'pi pi-cog', url: 'http://admin.morpheus.local', color: '#8B5CF6' }
  ];

  navigateTo(appUrl: string, event: Event) {
    event.preventDefault();
    // In a real scenario, this coordinates with SSO and redirects.
    window.location.href = appUrl;
  }
}
