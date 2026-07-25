import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginRequest, LoginResponse } from '@models/loginModel';
import { RegisterRequest, RegisterResponse } from '@models/registerModel';

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

    register(credentials: RegisterRequest): Observable<RegisterResponse> {
        return this.http
            .post<RegisterResponse>(`${this.apiAuthUrl}/register`, credentials)
            .pipe(
                tap((response) => console.log(response)),
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

    initializeSession() {
        const token = this.getAccessToken();

        if (!token) {
            console.log('no token');
            return of(false);
        }
        
        console.log('yes token');
        return this.getCurrentUser().pipe(
            map(() => true),
            catchError(() => {
                this.logout();
                console.log('logout');
                
                return of(false);
            })
        );
    }
}