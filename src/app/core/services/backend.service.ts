import { inject, Injectable, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { toArray, switchMap, map } from 'rxjs/operators';
import { AppConfigService } from '../config/config.service';
import { UserProfileService } from './user-profile.service';

@Injectable({
  providedIn: 'root',
})
export class BackendService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  // Lazy get: avoid eager UserProfile ↔ Backend cycles; Bearer still required (fetch skips interceptor).
  private readonly injector = inject(Injector);

  private get baseUrl(): string {
    return this.config.config.baseUrl || 'https://yourdomain.com';
  }

  /** Hydrates browser SQLite from a remote collection snapshot after login. */
  public fetchCollectionFromServer<T>(segment: string, contextId: string | number): Observable<T[]> {
    return this.http.get<T[]>(`${this.baseUrl}/api/${segment}?contextId=${contextId}`);
  }

  /**
   * Posts outbox rows as one NDJSON body.
   * Buffered on purpose: Chrome streaming fetch (duplex/half) needs HTTP/2 over TLS,
   * which localhost Spring does not speak — that surfaces as ERR_ALPN_NEGOTIATION_FAILED.
   */
  public streamJsonRecordsToServer(recordObservable$: Observable<any>): Observable<void> {
    return recordObservable$.pipe(
      toArray(),
      switchMap((rows) => {
        const body = rows.length === 0 ? '' : rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
        const headers: Record<string, string> = {
          'Content-Type': 'application/x-ndjson'
        };
        const sessionToken = this.injector.get(UserProfileService).getSnapshot()?.sessionToken;
        if (sessionToken) {
          headers['Authorization'] = `Bearer ${sessionToken}`;
        }

        return new Observable<void>((subscriber) => {
          fetch(`${this.baseUrl}/api/outbox/bulk-sync`, {
            method: 'POST',
            headers,
            body
          })
            .then(async (response) => {
              if (!response.ok) {
                if (sessionToken && response.status === 401) {
                  await new Promise<void>((resolve) => {
                    this.injector.get(UserProfileService).clearExpiredCloudSession().subscribe({
                      next: () => resolve(),
                      error: () => resolve()
                    });
                  });
                  throw new Error('SESSION_EXPIRED');
                }
                throw new Error(
                  `[BackendService] Bulk outbox ingest failed with status: ${response.status}`
                );
              }
              subscriber.next();
              subscriber.complete();
            })
            .catch((err) => subscriber.error(err));
        });
      }),
      map(() => void 0)
    );
  }
}
