import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToolbarModule } from 'primeng/toolbar';
import { InputTextModule } from 'primeng/inputtext';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { BadgeModule } from 'primeng/badge';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { AppSwitcherComponent } from '../app-switcher/app-switcher.component';

@Component({
  selector: 'ui-topbar',
  standalone: true,
  imports: [
    CommonModule, 
    ToolbarModule, 
    InputTextModule, 
    AvatarModule, 
    ButtonModule, 
    BadgeModule,
    IconFieldModule,
    InputIconModule,
    AppSwitcherComponent
  ],
  templateUrl: './topbar.component.html',
  styleUrls: ['./topbar.component.css']
})
export class TopbarComponent {
  @Input() appName: string = 'Morpheus ERP';
  @Input() userName: string = 'User';
}
