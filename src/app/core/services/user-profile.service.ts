import { Injectable, inject, Inject } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, tap, catchError } from 'rxjs/operators';
import { systemConfig } from '../sqlite/sqlite.schema';
import { VaultStore } from './vault/vault.store';
import { APP_CONFIG } from '../config/config.model';
import { mapProfileToInsert } from '../../shared/models/user/user.mappers';
import { UserProfile } from '../../shared/models/user/user';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class UserProfileService {
  private readonly vault = inject(VaultStore);
  private readonly authService = inject(AuthService);

  public readonly onboardingTargetRoute: string;

  private readonly configSubject = new BehaviorSubject<UserProfile | null>(null);
  public readonly config$ = this.configSubject.asObservable();

  public readonly displayName$ = this.config$.pipe(map(c => c?.displayName || null));
  public readonly isCloudSynced$ = this.config$.pipe(map(c => !!c?.isCloudSynced));
  public readonly lastSync$ = this.config$.pipe(map(c => c?.lastSyncTimestamp || null));

  public get isCloudSynced(): boolean {
    return this.getSnapshot()?.isCloudSynced || false;
  }

  constructor(@Inject(APP_CONFIG) appConfig: any) {
    this.onboardingTargetRoute = '/welcome';
  }

  public initializeConfig(): Observable<boolean> {
    return this.vault.fetchRecord<any>(systemConfig, 'active_user').pipe(
      map((row) => {
        if (!row || !row.displayName) return null;
        return {
          displayName: row.displayName,
          sessionToken: row.sessionToken,
          isCloudSynced: row.isCloudSynced,
          lastSyncTimestamp: row.lastSyncTimestamp
        } as UserProfile;
      }),
      tap((config) => {
        this.configSubject.next(config);
        const hasActiveSession = !!(config && config.sessionToken);
        this.authService.setAuthenticationState(hasActiveSession);
      }),
      map((config) => !!(config && config.displayName)),
      catchError(() => {
        this.configSubject.next(null);
        this.authService.clearAuthenticationState();
        return of(false);
      })
    );
  }

  /** First-time local profile (desktop onboarding). */
  public establishIdentity(name: string): Observable<void> {
    const domainModel: UserProfile = {
      displayName: name.trim(),
      sessionToken: null,
      isCloudSynced: false,
      lastSyncTimestamp: null
    };

    const dbPayload = mapProfileToInsert(domainModel);

    return this.vault.insert(systemConfig, dbPayload).pipe(
      tap(() => this.configSubject.next(domainModel)),
      map(() => void 0)
    );
  }

  /** Promote local profile after cloud register returns a session token. */
  public linkLocalProfileToCloud(sessionToken: string): Observable<void> {
    const current = this.getSnapshot();
    if (!current) return of(void 0);

    const updatedProfile: UserProfile = {
      ...current,
      sessionToken: sessionToken,
      isCloudSynced: true,
      lastSyncTimestamp: new Date().toISOString()
    };

    const dbPayload = mapProfileToInsert(updatedProfile);

    return this.vault.update(systemConfig, dbPayload).pipe(
      tap(() => this.configSubject.next(updatedProfile)),
      map(() => void 0)
    );
  }

  /** Cold restore from login response (overwrite singleton config row). */
  public restoreCloudIdentity(serverPayload: { token: string; name: string }): Observable<void> {
    const restoredProfileRow = {
      id: 'active_user',
      displayName: serverPayload.name.trim(),
      sessionToken: serverPayload.token,
      isCloudSynced: true,
      lastSyncTimestamp: new Date().toISOString()
    };

    const domainModel: UserProfile = {
      displayName: restoredProfileRow.displayName,
      sessionToken: restoredProfileRow.sessionToken,
      isCloudSynced: true,
      lastSyncTimestamp: restoredProfileRow.lastSyncTimestamp
    };

    // Insert overwrites via fixed primary key 'active_user'
    return this.vault.insert(systemConfig, restoredProfileRow).pipe(
      tap(() => this.configSubject.next(domainModel)),
      map(() => void 0)
    );
  }

  public updateCloudSyncStatus(timestamp: string = new Date().toISOString()): Observable<void> {
    const current = this.getSnapshot();
    if (!current) return of(void 0);

    const updatedProfile: UserProfile = {
      ...current,
      isCloudSynced: true,
      lastSyncTimestamp: timestamp
    };

    const dbPayload = mapProfileToInsert(updatedProfile);

    return this.vault.update(systemConfig, dbPayload).pipe(
      tap(() => this.configSubject.next(updatedProfile)),
      map(() => void 0)
    );
  }

  public getSnapshot(): UserProfile | null {
    return this.configSubject.getValue();
  }

  public clearConfig(): Observable<void> {
    return this.vault.delete(systemConfig, 'active_user').pipe(
      tap(() => this.configSubject.next(null)),
      map(() => void 0),
      catchError(() => {
        this.configSubject.next(null);
        return of(void 0);
      })
    );
  }
}
