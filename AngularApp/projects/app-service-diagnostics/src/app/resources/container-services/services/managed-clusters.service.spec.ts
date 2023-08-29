import { TestBed } from '@angular/core/testing';

import { ManagedClustersService } from './managed-clusters.service';

describe('ManagedClustersService', () => {
  let service: ManagedClustersService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ManagedClustersService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
