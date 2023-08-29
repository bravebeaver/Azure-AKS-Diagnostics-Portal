import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InClusterDiagnosticToolsComponent } from './in-cluster-diagnostic-tools.component';

describe('ManagedClustersInClusterDiagnosticToolsComponent', () => {
  let component: InClusterDiagnosticToolsComponent;
  let fixture: ComponentFixture<InClusterDiagnosticToolsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ InClusterDiagnosticToolsComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(InClusterDiagnosticToolsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
