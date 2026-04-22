import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TopbarComponent } from '../topbar/topbar.component';
import { SidebarComponent, MenuItem } from '../sidebar/sidebar.component';

@Component({
  selector: 'ui-main-layout',
  standalone: true,
  imports: [CommonModule, TopbarComponent, SidebarComponent],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.css']
})
export class MainLayoutComponent {
  @Input() appName: string = 'App';
  @Input() menuItems: MenuItem[] = [];
  
  isSidebarCollapsed = false;

  toggleSidebar() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }
}
