import { TestBed } from '@angular/core/testing';

import { ManagedClustersCategoryService } from './managed-clusters-category-service.service';

describe('ManagedClustersCategoryService', () => {
  let service: ManagedClustersCategoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ManagedClustersCategoryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
