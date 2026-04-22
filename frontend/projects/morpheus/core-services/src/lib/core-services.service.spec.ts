import { TestBed } from '@angular/core/testing';

import { CoreServicesService } from './core-services.service';

describe('CoreServicesService', () => {
  let service: CoreServicesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CoreServicesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
