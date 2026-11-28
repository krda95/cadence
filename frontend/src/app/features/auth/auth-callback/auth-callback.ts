import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideArrowLeft } from '@lucide/angular';
import { defer, finalize } from 'rxjs';

import { AuthService } from '@core/services/auth.service';
import { StartupService } from '@core/services/startup.service';
import { GoogleSignIn } from '../google-sign-in/google-sign-in';

/** Landing page Supabase sends people back to after Google sign-in. */
@Component({
  selector: 'app-auth-callback',
  imports: [RouterLink, LucideArrowLeft, GoogleSignIn],
  templateUrl: './auth-callback.html',
  styleUrl: './auth-callback.scss',
})
export class AuthCallback {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly startupService = inject(StartupService);

  readonly errorMessage = signal<string | null>(null);

  constructor() {
    const params = readCallbackParams();

    // Tokens must not linger in the address bar, history or a copied link.
    window.history.replaceState(window.history.state, '', window.location.pathname);

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (params.has('error') || !accessToken || !refreshToken) {
      this.errorMessage.set(describeOAuthError(params.get('error')));
      return;
    }

    defer(() => {
      this.startupService.start();

      return this.authService.establishSession({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: Number(params.get('expires_in') ?? 0),
        token_type: params.get('token_type') ?? 'bearer',
      });
    })
      .pipe(finalize(() => this.startupService.success()))
      .subscribe({
        next: () => void this.router.navigate(['/dashboard'], { replaceUrl: true }),
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(
            error.status === 0
              ? "Can't reach Cadence. Check your connection and try again."
              : "We couldn't finish signing you in with Google. Please try again.",
          );
        },
      });
  }
}

/** Supabase returns tokens in the fragment, but some errors arrive in the query string. */
function readCallbackParams(): URLSearchParams {
  const params = new URLSearchParams(window.location.search);

  new URLSearchParams(window.location.hash.substring(1)).forEach((value, key) => {
    params.set(key, value);
  });

  return params;
}

function describeOAuthError(code: string | null): string {
  if (code === 'access_denied') {
    return 'Google sign-in was cancelled.';
  }

  return "We couldn't sign you in with Google. Please try again.";
}
