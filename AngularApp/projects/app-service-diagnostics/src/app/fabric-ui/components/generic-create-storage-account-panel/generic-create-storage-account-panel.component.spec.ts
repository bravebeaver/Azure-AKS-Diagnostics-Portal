import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { GenericCreateStorageAccountPanelComponent } from './generic-create-storage-account-panel.component';

describe('GenericCreateStorageAccountPanelComponent', () => {
  let component: GenericCreateStorageAccountPanelComponent;
  let fixture: ComponentFixture<GenericCreateStorageAccountPanelComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ GenericCreateStorageAccountPanelComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(GenericCreateStorageAccountPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
