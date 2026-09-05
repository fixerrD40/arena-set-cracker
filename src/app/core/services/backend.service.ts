import { inject, Injectable, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AppConfigService } from '../config/config.service';
import { UserProfileService } from './user-profile.service';

@Injectable({
  providedIn: 'root',
})
export class BackendService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  // fetch bypasses tokenInterceptor; lazy get avoids UserProfile → DataWire → Outbox → Backend
  private readonly injector = inject(Injector);

  private get baseUrl(): string {
    return this.config.config.baseUrl || 'https://yourdomain.com';
  }

  /** Hydrates browser SQLite from a remote collection snapshot after login. */
  public fetchCollectionFromServer<T>(segment: string, contextId: string | number): Observable<T[]> {
    return this.http.get<T[]>(`${this.baseUrl}/api/${segment}?contextId=${contextId}`);
  }

  /** Streams outbox rows as NDJSON to the bulk-sync endpoint. */
  public streamJsonRecordsToServer(recordObservable$: Observable<any>): Observable<void> {
    return new Observable<void>((subscriber) => {
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        start(controller) {
          recordObservable$.subscribe({
            next: (row) => {
              const jsonLine = JSON.stringify(row) + '\n';
              controller.enqueue(encoder.encode(jsonLine));
            },
            complete: () => controller.close(),
            error: (err) => {
              controller.error(err);
              subscriber.error(err);
            }
          });
        }
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-ndjson'
      };
      const sessionToken = this.injector.get(UserProfileService).getSnapshot()?.sessionToken;
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }

      fetch(`${this.baseUrl}/api/outbox/bulk-sync`, {
        method: 'POST',
        headers,
        body: stream,
        duplex: 'half'
      } as any)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`[BackendService] Bulk outbox ingest failed with status: ${response.status}`);
        }
        subscriber.next();
        subscriber.complete();
      })
      .catch(err => subscriber.error(err));
    });
  }
}
