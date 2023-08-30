import { TestBed } from '@angular/core/testing';

import { AdminManagedClustersService } from './admin-managed-clusters.service';

describe('AdminManagedClustersService', () => {
  let service: AdminManagedClustersService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AdminManagedClustersService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
