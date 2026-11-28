import { Component, DestroyRef, inject, input, signal } from '@angular/core';

import { AuthService } from '@core/services/auth.service';
import { Button } from '@shared/ui/button/button';

@Component({
  selector: 'app-google-sign-in',
  imports: [Button],
  templateUrl: './google-sign-in.html',
  styleUrl: './google-sign-in.scss',
})
export class GoogleSignIn {
  private readonly authService = inject(AuthService);
  readonly disabled = input(false);
  readonly redirecting = signal(false);

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
    this.redirecting.set(true);
    this.authService.startGoogleSignIn();
  }
}
