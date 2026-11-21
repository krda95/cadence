import { effect, inject, untracked } from '@angular/core';

import { AssistantService } from '@core/api/assistant.service';

/**
 * Calls `reload` when the assistant saves data after the calling view was created.
 * The initial load is left to the view's own resources. Call from a constructor
 * or field initializer (injection context).
 */
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
