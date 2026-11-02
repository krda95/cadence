import { HttpInterceptorFn } from '@angular/common/http';
import { isDevMode } from '@angular/core';
import { switchMap, timer } from 'rxjs';

import { environment } from '../../../environments/environment';
import { simulationConfig } from '../../../environments/simulation.config';

let coldStartSimulated = false;

export const coldStartInterceptor: HttpInterceptorFn = (request, next) => {
  const delay = simulationConfig.coldStartDelay;

  if (!isDevMode() || delay <= 0 || coldStartSimulated) {
    return next(request);
  }

  const isStartupRequest =
    request.url === `${environment.apiUrl}/me` ||
    request.url === `${environment.apiUrl}/auth/login` ||
    request.url === `${environment.apiUrl}/auth/refresh`;

  if (!isStartupRequest) {
    return next(request);
  }

  coldStartSimulated = true;

  return timer(delay).pipe(switchMap(() => next(request)));
};
