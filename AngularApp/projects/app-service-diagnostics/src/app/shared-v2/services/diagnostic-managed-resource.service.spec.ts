import { TestBed } from '@angular/core/testing';

import { DiagnosticManagedResourceService } from './diagnostic-managed-resource.service';

describe('DiagnosticManagedResourceService', () => {
  let service: DiagnosticManagedResourceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DiagnosticManagedResourceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
