import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { AssistantService } from '@core/api/assistant.service';
import { effect, inject, untracked } from '@angular/core';
import type { Mock } from 'vitest';

export function reloadOnAssistantUpdate(reload: () => void): void {
  const assistantService = inject(AssistantService);
  let lastSeenVersion = untracked(assistantService.dataVersion);

  effect(() => {
    const version = assistantService.dataVersion();

    if (version === lastSeenVersion) {
      return;
    }

    lastSeenVersion = version;
    untracked(reload);
  });
}

describe('reloadOnAssistantUpdate', () => {
  let service: AssistantService;
  let reload: Mock<() => void>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    service = TestBed.inject(AssistantService);
    reload = vi.fn();
  });

  function createView(): void {
    TestBed.runInInjectionContext(() => reloadOnAssistantUpdate(reload));
    TestBed.tick();
  }

  it('does not reload when the view is created', () => {
    createView();

    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload on creation after an earlier assistant update', () => {
    service.notifyDataChanged(['2026-01-15']);

    createView();

    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once after a later assistant update', () => {
    createView();

    service.notifyDataChanged(['2026-01-15']);
    TestBed.tick();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads at most once for updates published before effects run', () => {
    createView();

    service.notifyDataChanged(['2026-01-14']);
    service.notifyDataChanged(['2026-01-15']);
    TestBed.tick();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when nothing was saved', () => {
    createView();

    service.notifyDataChanged([]);
    TestBed.tick();

    expect(reload).not.toHaveBeenCalled();
  });
});
