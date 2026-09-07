import { inject, Injectable, Inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { APP_CONFIG } from '../config/config.model';

export interface CloudSessionResponse {
  token: string;
  displayName: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly authUrl: string;

  // Starts false; UserProfileService sets true when a SQLite config row with a session loads
  private readonly isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  public readonly isAuthenticated$: Observable<boolean> = this.isAuthenticatedSubject.asObservable();

  constructor(@Inject(APP_CONFIG) appConfig: any) {
    this.authUrl = new URL('/auth', appConfig.baseUrl).toString();
  }

  public isAuthenticated(): boolean {
    return this.isAuthenticatedSubject.getValue();
  }

  public setAuthenticationState(state: boolean): void {
    this.isAuthenticatedSubject.next(state);
  }

  /** Restores an existing cloud session on a fresh device. */
  public login(credentials: { email: string; password: string }): Observable<CloudSessionResponse> {
    return this.http
      .post<CloudSessionResponse>(`${this.authUrl}/login`, credentials)
      .pipe(
        tap(() => this.isAuthenticatedSubject.next(true)),
        catchError(this.handleError)
      );
  }

  /** Links a local offline profile to the cloud via email + password (+ optional display name as username). */
  public claimOfflineAccount(credentials: {
    email: string;
    password: string;
    username?: string;
  }): Observable<CloudSessionResponse> {
    return this.http
      .post<CloudSessionResponse>(`${this.authUrl}/register`, credentials)
      .pipe(
        tap(() => this.isAuthenticatedSubject.next(true)),
        catchError(this.handleError)
      );
  }

  public requestPasswordReset(email: string): Observable<void> {
    return this.http
      .post<void>(`${this.authUrl}/request-reset`, email, {
        headers: { 'Content-Type': 'text/plain' },
      })
      .pipe(catchError(this.handleError));
  }

  public resetPassword(data: { token: string; newPassword: string }): Observable<void> {
    return this.http
      .post<void>(`${this.authUrl}/reset-password`, data)
      .pipe(catchError(this.handleError));
  }

  public clearAuthenticationState(): void {
    this.isAuthenticatedSubject.next(false);
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    console.error('[AuthService API Error]:', error.message || error);
    return throwError(() => new Error(error.error?.message || 'Authentication network request failed.'));
  }
}
