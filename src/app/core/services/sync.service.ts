import { Injectable, Injector, inject } from '@angular/core';
import { merge, of, fromEvent, EMPTY, Subscription, Observable, defer, from, throwError } from 'rxjs';
import { exhaustMap, catchError, map, switchMap, tap, concatMap, toArray } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { BackendService } from './backend.service';
import { VAULT_ENGINE_TOKEN, OutboxEnvelope } from '../vault/vault.engine';
import { SyncQueueRow, decks, sets } from '../sqlite/sqlite.schema';
import { VaultStore } from './vault/vault.store';

/** Drains sync_queue to the cloud NDJSON bulk-sync endpoint. */
@Injectable({
  providedIn: 'root',
})
export class SyncService {
  private readonly auth = inject(AuthService);
  private readonly vault = inject(VAULT_ENGINE_TOKEN);
  private readonly backend = inject(BackendService);
  private readonly injector = inject(Injector);

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

  /**
   * Queues an offline mutation; upsert/conflict handling lives in the vault engine.
   * Pass drain: false when batching many rows before a single flushNow().
   * Pass softFail: false on logout/login push so a queue write failure aborts.
   */
  public enqueue(item: OutboxEnvelope, options?: { drain?: boolean; softFail?: boolean }): Observable<void> {
    const shouldDrain = options?.drain !== false;
    const softFail = options?.softFail !== false;
    return from(this.vault.enqueueSyncItem(item)).pipe(
      tap(() => {
        if (
          shouldDrain &&
          typeof navigator !== 'undefined' &&
          navigator.onLine &&
          this.auth.isAuthenticated()
        ) {
          this.triggerSync();
        }
      }),
      map(() => void 0),
      catchError((err) => {
        console.error('[SyncService] Failed to register sync item:', err);
        if (softFail) return of(void 0);
        return throwError(() => err);
      })
    );
  }

  public triggerSync(): void {
    if (this.activeSyncSubscription && !this.activeSyncSubscription.closed) {
      console.warn('[SyncService] Sync already in motion. Request skipped.');
      return;
    }
    this.activeSyncSubscription = this.executeBulkSyncPipelineStream({ softFail: true }).subscribe();
  }

  /** Awaitable drain of sync_queue (login push / logout before wipe). Errors propagate. */
  public flushNow(): Observable<void> {
    return this.executeBulkSyncPipelineStream({ softFail: false });
  }

  public executeBulkSyncPipelineStream(options?: { softFail?: boolean }): Observable<void> {
    const softFail = options?.softFail !== false;

    if (!this.auth.isAuthenticated()) {
      return of(void 0);
    }

    return defer(() => {
      return from(this.vault.getPendingSyncItems()).pipe(
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
            switchMap(() => this.ackSyncedBases(rawRecords)),
            switchMap(() => {
              if (targetBatchIds.length === 0) return of(void 0);
              return from(this.vault.clearSyncItemsBatch(targetBatchIds));
            }),
            tap(() => {
              console.log(`[SyncService] Stream pass completed. Purged ${targetBatchIds.length} entries.`);
            }),
            map(() => void 0)
          );
        }),
        catchError((err) => {
          console.error('[SyncService] Background transfer terminated.', err);
          if (err?.message === 'SESSION_EXPIRED') {
            return of(void 0);
          }
          if (softFail) return of(void 0);
          return throwError(() => err);
        })
      );
    });
  }

  /** After HTTP success, advance merge-base from each upsert payload tip (optimistic; no per-row ack). */
  private ackSyncedBases(rawRecords: SyncQueueRow[]): Observable<void> {
    const vaultStore = this.injector.get(VaultStore);
    return from(rawRecords).pipe(
      concatMap((row) => {
        if (row.action === 'DELETE') {
          return of(void 0);
        }
        const payload =
          typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
        const synced = typeof payload?.updatedAt === 'string' ? payload.updatedAt.trim() : '';
        if (!synced) {
          return of(void 0);
        }
        if (row.entityType === 'deck') {
          return vaultStore.markMergeBaseUpdatedAt(decks, row.entityId, synced);
        }
        if (row.entityType === 'set') {
          return vaultStore.markMergeBaseUpdatedAt(sets, row.entityId, synced);
        }
        return of(void 0);
      }),
      toArray(),
      map(() => void 0)
    );
  }
}
