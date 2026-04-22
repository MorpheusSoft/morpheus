import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppSwitcherComponent } from './app-switcher.component';

describe('AppSwitcherComponent', () => {
  let component: AppSwitcherComponent;
  let fixture: ComponentFixture<AppSwitcherComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppSwitcherComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppSwitcherComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
