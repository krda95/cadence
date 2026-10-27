import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import {
  catchError,
  finalize,
  map,
  Observable,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginRequest, LoginResponse, UserProfile } from '@models/loginModel';
import { RegisterRequest, RegisterResponse } from '@models/registerModel';
import { ForgotPasswordRequest, MessageResponse } from '@models/forgotModel';
import { ResetPasswordRequest } from '@models/resetModel';
import { AssistantHistoryService } from '@features/assistant/services/assistant-history.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly assistantHistory = inject(AssistantHistoryService);
  private readonly apiAuthUrl = `${environment.apiUrl}/auth`;
  private readonly apiMeUrl = `${environment.apiUrl}/me`;
  private readonly accessTokenKey = 'access_token';
  private readonly refreshTokenKey = 'refresh_token';

  private refreshRequest$: Observable<LoginResponse> | null = null;

  readonly currentUser = signal<UserProfile | null>(null);

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiAuthUrl}/login`, credentials).pipe(
      tap((response) => this.saveSession(response)),
      switchMap((response) =>
        this.getCurrentUser().pipe(
          map(() => response),
          catchError((error) => {
            this.logout();
            return throwError(() => error);
          }),
        ),
      ),
    );
  }

  register(credentials: RegisterRequest): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.apiAuthUrl}/register`, credentials);
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.accessTokenKey);
  }

  refreshSession(): Observable<LoginResponse> {
    if (this.refreshRequest$) {
      return this.refreshRequest$;
    }

    const refreshToken = localStorage.getItem(this.refreshTokenKey);

    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }

    this.refreshRequest$ = this.http
      .post<LoginResponse>(`${this.apiAuthUrl}/refresh`, {
        refresh_token: refreshToken,
      })
      .pipe(
        tap((response) => this.saveSession(response)),
        finalize(() => {
          this.refreshRequest$ = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.refreshRequest$;
  }

  isLoggedIn(): boolean {
    return this.getAccessToken() !== null;
  }

  logout(): void {
    localStorage.removeItem(this.accessTokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    this.assistantHistory.clearHistory();
    this.currentUser.set(null);
  }

  private saveSession(response: LoginResponse): void {
    localStorage.setItem(this.accessTokenKey, response.access_token);

    localStorage.setItem(this.refreshTokenKey, response.refresh_token);
  }

  getCurrentUser(): Observable<UserProfile> {
    return this.http.get<UserProfile>(this.apiMeUrl).pipe(
      tap((user) => {
        this.currentUser.set({
          ...user,
          profileInitial: user.display_name?.charAt(0).toUpperCase() ?? '?',
        });
      }),
    );
  }

  initializeSession(): Observable<boolean> {
    if (this.currentUser()) {
      return of(true);
    }

    if (!this.getAccessToken() && !localStorage.getItem(this.refreshTokenKey)) {
      return of(false);
    }

    const loadProfile = () =>
      this.getCurrentUser().pipe(
        map(() => true),
        catchError(() => of(false)),
      );

    if (!this.getAccessToken()) {
      return this.refreshSession().pipe(
        switchMap(loadProfile),
        catchError(() => of(false)),
      );
    }

    return loadProfile();
  }

  forgotPassword(request: ForgotPasswordRequest): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${this.apiAuthUrl}/forgot-password`, request);
  }

  resetPassword(request: ResetPasswordRequest): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${this.apiAuthUrl}/reset-password`, request);
  }
}
