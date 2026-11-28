import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { defer, finalize } from 'rxjs';

import { AuthService } from '@core/services/auth.service';
import { StartupService } from '@core/services/startup.service';
import { Button } from '@shared/ui/button/button';

@Component({
  selector: 'app-google-sign-in',
  imports: [Button],
  templateUrl: './google-sign-in.html',
  styleUrl: './google-sign-in.scss',
})
export class GoogleSignIn {
  private readonly authService = inject(AuthService);
  private readonly startupService = inject(StartupService);

  readonly disabled = input(false);
  /** The "or" rule above the button, for pages where it sits under another way to sign in. */
  readonly divider = input(true);

  readonly redirecting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    // Going Back from Google restores this page from the bfcache with the spinner still on.
    const resetOnRestore = (event: PageTransitionEvent) => {
      if (event.persisted) {
        this.redirecting.set(false);
      }
    };

    window.addEventListener('pageshow', resetOnRestore);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('pageshow', resetOnRestore));
  }

  start(): void {
    if (this.redirecting()) {
      return;
    }

    this.redirecting.set(true);
    this.errorMessage.set(null);

    // The redirect goes through the API. Wake it first, so a sleeping server shows the
    // wake-up screen instead of a spinner that hangs without explanation.
    defer(() => {
      this.startupService.start();

      return this.authService.wakeApi();
    })
      .pipe(finalize(() => this.startupService.success()))
      .subscribe({
        next: () => this.authService.startGoogleSignIn(),
        error: (error: HttpErrorResponse) => {
          this.redirecting.set(false);
          this.errorMessage.set(
            error.status === 0
              ? "Can't reach Cadence. Check your connection and try again."
              : 'Something went wrong. Please try again.',
          );
        },
      });
  }
}
