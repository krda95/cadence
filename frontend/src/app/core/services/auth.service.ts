import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

@Injectable({ providedIn: 'root'})
export class AuthService {
    private readonly http = inject(HttpClient);
    private readonly apiAuthUrl = `${environment.apiUrl}/auth`;
    private readonly apiMeUrl = `${environment.apiUrl}/me`;
    private readonly accessTokenKey = 'access_token';
    private readonly refreshTokenKey = 'refresh_token';

    login(credentials: LoginRequest): Observable<LoginResponse> {
        return this.http
            .post<LoginResponse>(`${this.apiAuthUrl}/login`, credentials)
            .pipe(
                tap((response) => this.saveSession(response)),
            );
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
    }

    private saveSession(response: LoginResponse): void {
        localStorage.setItem(
            this.accessTokenKey,
            response.access_token,
        );

        localStorage.setItem(
            this.refreshTokenKey,
            response.refresh_token,
        );
    }

    getCurrentUser() {
        return this.http.get(`${this.apiMeUrl}`);
    }
}