import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginRequest, LoginResponse, UserProfile } from '@models/loginModel';
import { RegisterRequest, RegisterResponse } from '@models/registerModel';
import { ForgotPasswordRequest, MessageResponse } from '@models/forgotModel';
import { ResetPasswordRequest } from '@models/resetModel';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiAuthUrl = `${environment.apiUrl}/auth`;
  private readonly apiMeUrl = `${environment.apiUrl}/me`;
  private readonly accessTokenKey = 'access_token';
  private readonly refreshTokenKey = 'refresh_token';

  readonly currentUser = signal<UserProfile | null>(null);

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.apiAuthUrl}/login`, credentials)
      .pipe(tap((response) => this.saveSession(response)));
  }

  register(credentials: RegisterRequest): Observable<RegisterResponse> {
    return this.http
      .post<RegisterResponse>(`${this.apiAuthUrl}/register`, credentials)
      .pipe(tap((response) => console.log(response)));
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.accessTokenKey);
  }

  isLoggedIn(): boolean {
    return this.getAccessToken() !== null;
  }

  logout(): void {
    localStorage.removeItem(this.accessTokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    this.currentUser.set(null);
  }

  private saveSession(response: LoginResponse): void {
    localStorage.setItem(this.accessTokenKey, response.access_token);

    localStorage.setItem(this.refreshTokenKey, response.refresh_token);
  }

  getCurrentUser(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.apiMeUrl}`).pipe(
      tap((user) => {
        this.currentUser.set(user);
        this.currentUser()!.profileInitial = user.display_name?.charAt(0).toUpperCase() ?? '?';
      }),
    );
  }

  initializeSession() {
    const token = this.getAccessToken();

    if (!token) {
      return of(false);
    }

    return this.getCurrentUser().pipe(
      map(() => true),
      catchError(() => {
        this.logout();
        return of(false);
      }),
    );
  }

  forgotPassword(request: ForgotPasswordRequest): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${this.apiAuthUrl}/forgot-password`, request);
  }

  resetPassword(request: ResetPasswordRequest): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${this.apiAuthUrl}/reset-password`, request);
  }
}
