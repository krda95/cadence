import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { AssistantService } from './assistant.service';

describe('AssistantService', () => {
  let service: AssistantService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    service = TestBed.inject(AssistantService);
  });

  it('does not publish an update when nothing was saved', () => {
    service.notifyDataChanged([]);

    expect(service.dataVersion()).toBe(0);
  });

  it('publishes exactly one update per response with saved dates', () => {
    service.notifyDataChanged(['2026-01-14', '2026-01-15']);

    expect(service.dataVersion()).toBe(1);
  });
});
