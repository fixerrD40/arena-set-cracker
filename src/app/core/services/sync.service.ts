import { Injectable, inject } from '@angular/core';
import { merge, of, fromEvent, EMPTY, Subscription, Observable, defer, from } from 'rxjs';
import { exhaustMap, catchError, map, switchMap, tap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { BackendService } from './backend.service';
import { SQLITE_ENGINE_TOKEN, OutboxEnvelope } from '../sqlite/sqlite.engine';
import { SyncQueueRow } from '../sqlite/sqlite.schema';

/** Drains sync_queue to the cloud NDJSON bulk-sync endpoint. */
@Injectable({
  providedIn: 'root',
})
export class SyncService {
  private readonly auth = inject(AuthService);
  private readonly sqlite = inject(SQLITE_ENGINE_TOKEN);
  private readonly backend = inject(BackendService);

  private activeSyncSubscription?: Subscription;
  private engineInitialized = false;

  public initializeEngine(): void {
    if (this.engineInitialized) return;
    this.engineInitialized = true;

    merge(of(null), fromEvent(window, 'online')).pipe(
      exhaustMap(() => {
        if (!this.auth.isAuthenticated()) return EMPTY;
        console.log('[SyncService] Network online. Commencing background sync...');
        return this.executeBulkSyncPipelineStream();
      }),
      catchError((err) => {
        console.error('[SyncService] Critical sync failure:', err);
        return EMPTY;
      })
    ).subscribe();
  }

  /** Queues an offline mutation; upsert/conflict handling lives in the vault engine. */
  public enqueue(item: OutboxEnvelope): Observable<void> {
    return from(this.sqlite.enqueueSyncItem(item)).pipe(
      tap(() => {
        if (typeof navigator !== 'undefined' && navigator.onLine && this.auth.isAuthenticated()) {
          this.triggerSync();
        }
      }),
      map(() => void 0),
      catchError((err) => {
        console.error('[SyncService] Failed to register sync item:', err);
        return of(void 0);
      })
    );
  }

  public triggerSync(): void {
    if (this.activeSyncSubscription && !this.activeSyncSubscription.closed) {
      console.warn('[SyncService] Sync already in motion. Request skipped.');
      return;
    }
    this.activeSyncSubscription = this.executeBulkSyncPipelineStream().subscribe();
  }

  public executeBulkSyncPipelineStream(): Observable<void> {
    if (!this.auth.isAuthenticated()) {
      return of(void 0);
    }

    return defer(() => {
      return from(this.sqlite.getPendingSyncItems()).pipe(
        switchMap((rawRecords: SyncQueueRow[]) => {
          if (rawRecords.length === 0) {
            console.log('[SyncService] Local queue empty. Fully synced.');
            return of(void 0);
          }

          const targetBatchIds = rawRecords.map(r => r.id);

          const outboxDataStream$: Observable<SyncQueueRow> = from(rawRecords).pipe(
            map((queueItem: SyncQueueRow) => {
              const resolvedPayload = typeof queueItem.payload === 'string'
                ? JSON.parse(queueItem.payload)
                : queueItem.payload;

              return {
                ...queueItem,
                payload: resolvedPayload
              };
            })
          );

          console.log(`[SyncService] Piping ${targetBatchIds.length} operations down the NDJSON channel...`);

          return this.backend.streamJsonRecordsToServer(outboxDataStream$).pipe(
            switchMap(() => {
              if (targetBatchIds.length === 0) return of(void 0);
              return from(this.sqlite.clearSyncItemsBatch(targetBatchIds));
            }),
            tap(() => {
              console.log(`[SyncService] Stream pass completed. Purged ${targetBatchIds.length} entries.`);
            }),
            map(() => void 0)
          );
        }),
        catchError((err) => {
          console.error('[SyncService] Background transfer terminated.', err);
          return of(void 0);
        })
      );
    });
  }
}
