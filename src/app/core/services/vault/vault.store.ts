import { inject, Injectable } from '@angular/core';
import { Observable, of, throwError, from } from 'rxjs';
import { concatMap, catchError, map, toArray } from 'rxjs/operators';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { getTableName } from 'drizzle-orm';
import { VAULT_ENGINE_TOKEN } from '../../vault/vault.engine';
import { SyncService } from '../sync.service';
import {
  serializePayload,
  serializePayloadsBulk,
  hydrateRow
} from '../../sqlite/sqlite.registry';
import { toOutboxPayload } from './outbox.payload';
import { nowIso } from '../../../shared/models/sync-timestamp';

/** Local vault CRUD; enqueues syncable sets/decks for SyncService. */
@Injectable({
  providedIn: 'root'
})
export class VaultStore {
  private readonly vaultEngine = inject(VAULT_ENGINE_TOKEN);
  private readonly sync = inject(SyncService);

  public insert<TInput = any, TOutput = any>(
    table: SQLiteTable<any>,
    domainModel: TInput
  ): Observable<TOutput> {
    const tableName = getTableName(table);
    const dbPayload = serializePayload(table, domainModel);

    return from(this.vaultEngine.insertRows(table, [dbPayload])).pipe(
      concatMap(() => {
        this.flush();
        if (tableName === 'decks' || tableName === 'sets') {
          const entityType = tableName === 'decks' ? 'deck' : 'set';
          return this.sync.enqueue({
            entityType,
            action: 'CREATE',
            payload: toOutboxPayload(entityType, domainModel)
          }).pipe(map(() => domainModel as unknown as TOutput));
        }
        return of(domainModel as unknown as TOutput);
      }),
      catchError((err) => throwError(() => err))
    );
  }

  public insertBulk<TInput = any, TOutput = any>(
    table: SQLiteTable<any>,
    payloads: TInput[]
  ): Observable<TOutput[]> {
    if (!payloads || payloads.length === 0) return of([]);

    const dbPayloads = serializePayloadsBulk(table, payloads);

    return from(this.vaultEngine.insertRows(table, dbPayloads)).pipe(
      concatMap(() => {
        this.flush();
        const tableNameStr = getTableName(table);

        if (tableNameStr === 'decks' || tableNameStr === 'sets') {
          const entityType = tableNameStr === 'decks' ? 'deck' : 'set';
          return from(payloads).pipe(
            concatMap(domainItem => this.sync.enqueue({
              entityType,
              action: 'CREATE',
              payload: toOutboxPayload(entityType, domainItem)
            })),
            toArray(),
            map(() => payloads as unknown as TOutput[])
          );
        }
        return of(payloads as unknown as TOutput[]);
      }),
      catchError((err) => throwError(() => err))
    );
  }

  public update<TInput = any, TOutput = any>(
    table: SQLiteTable<any>,
    domainModel: TInput
  ): Observable<TOutput> {
    const recordId = (domainModel as any)?.id;
    if (!recordId) {
      return throwError(() => new Error('[VaultStore] Update aborted: Missing primary identity column key "id".'));
    }

    const dbPayload = serializePayload(table, domainModel);

    return from(this.vaultEngine.updateRowById(table, recordId, dbPayload)).pipe(
      concatMap(() => {
        this.flush();
        const tableNameStr = getTableName(table);

        if (tableNameStr === 'decks' || tableNameStr === 'sets') {
          const entityType = tableNameStr === 'decks' ? 'deck' : 'set';
          return this.sync.enqueue({
            entityType,
            action: 'UPDATE',
            payload: toOutboxPayload(entityType, domainModel)
          }).pipe(map(() => domainModel as unknown as TOutput));
        }
        return of(domainModel as unknown as TOutput);
      }),
      catchError((err) => throwError(() => err))
    );
  }

  public delete(
    table: SQLiteTable<any>,
    id: string | number
  ): Observable<void> {
    return from(this.vaultEngine.deleteById(table, id)).pipe(
      concatMap(() => {
        this.flush();
        const tableName = getTableName(table);

        if (tableName === 'decks' || tableName === 'sets') {
          const entityType = tableName === 'decks' ? 'deck' : 'set';
          return this.sync.enqueue({
            entityType,
            action: 'DELETE',
            payload: { id, updatedAt: nowIso() }
          }).pipe(map(() => void 0));
        }
        return of(void 0);
      }),
      catchError((err) => throwError(() => err))
    );
  }

  public deleteWhere(
    table: SQLiteTable<any>,
    columnKey: string,
    value: string | number
  ): Observable<void> {
    return from(this.vaultEngine.deleteWhere(table, columnKey, value)).pipe(
      concatMap(() => {
        this.flush();
        return of(void 0);
      }),
      catchError((err) => throwError(() => err))
    );
  }

  public fetchRecord<TOutput = any>(
    table: SQLiteTable<any>,
    id: string | number
  ): Observable<TOutput | null> {
    return from(this.vaultEngine.selectById(table, id)).pipe(
      map((row) => (row ? hydrateRow<TOutput>(table, row) : null)),
      catchError((err) => {
        console.error(`[VaultStore] fetchRecord failure on key ${id}:`, err);
        return throwError(() => err);
      })
    );
  }

  public fetchCollection<TOutput = any>(
    table: SQLiteTable<any>,
    contextId?: string | number
  ): Observable<TOutput[]> {
    return from(this.vaultEngine.selectAll(table, contextId)).pipe(
      map((rows) => rows.map((row) => hydrateRow<TOutput>(table, row))),
      catchError((err) => throwError(() => err))
    );
  }

  /**
   * Persist without outbox enqueue (hydrate / conflict apply / sync-base stamp).
   */
  public writeLocal<TInput = any, TOutput = any>(
    table: SQLiteTable<any>,
    domainModel: TInput,
    mode: 'insert' | 'update'
  ): Observable<TOutput> {
    const recordId = (domainModel as { id?: string })?.id;
    if (!recordId && mode === 'update') {
      return throwError(() => new Error('[VaultStore] writeLocal update needs id.'));
    }

    const dbPayload = serializePayload(table, domainModel);
    const write$ =
      mode === 'insert'
        ? from(this.vaultEngine.insertRows(table, [dbPayload]))
        : from(this.vaultEngine.updateRowById(table, recordId!, dbPayload));

    return write$.pipe(
      concatMap(() => {
        this.flush();
        return of(domainModel as unknown as TOutput);
      }),
      catchError((err) => throwError(() => err))
    );
  }

  /** Stamp merge-base tip after a successful bulk-sync row (no outbox). */
  public markMergeBaseUpdatedAt(
    table: SQLiteTable<any>,
    id: string,
    mergeBaseUpdatedAt: string
  ): Observable<void> {
    return this.fetchRecord<Record<string, unknown>>(table, id).pipe(
      concatMap((existing) => {
        if (!existing) {
          return of(void 0);
        }
        return this.writeLocal(table, { ...existing, mergeBaseUpdatedAt }, 'update').pipe(
          map(() => void 0)
        );
      })
    );
  }

  public flush(): void {
    void this.vaultEngine.flush();
  }
}
