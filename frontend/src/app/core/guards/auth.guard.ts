import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '@core/services/auth.service';
import { StartupService } from '@core/services/startup.service';
import { defer, finalize, map } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const startupService = inject(StartupService);
  const router = inject(Router);

  return defer(() => {
    startupService.start();

    return authService.initializeSession();
  }).pipe(
    map((isAuthenticated) => {
      if (isAuthenticated) {
        return true;
      }

      return router.createUrlTree(['/login']);
    }),
    finalize(() => startupService.success()),
  );
};

export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.initializeSession().pipe(
    map((isAuthenticated) => {
      if (isAuthenticated) {
        return router.createUrlTree(['/dashboard']);
      }
      return true;
    }),
  );
};
