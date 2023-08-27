import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AksPeriscopeComponent } from './aks-periscope.component';

describe('AksPeriscopeComponent', () => {
  let component: AksPeriscopeComponent;
  let fixture: ComponentFixture<AksPeriscopeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ AksPeriscopeComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AksPeriscopeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
