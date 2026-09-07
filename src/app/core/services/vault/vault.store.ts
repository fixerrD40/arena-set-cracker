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
    try {
      const tableName = getTableName(table);
      const dbPayload = serializePayload(table, domainModel);
      this.vaultEngine.insertRows(table, [dbPayload]);

      return of(void 0).pipe(
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
    } catch (err) {
      return throwError(() => err);
    }
  }

  public insertBulk<TInput = any, TOutput = any>(
    table: SQLiteTable<any>,
    payloads: TInput[]
  ): Observable<TOutput[]> {
    if (!payloads || payloads.length === 0) return of([]);

    try {
      const dbPayloads = serializePayloadsBulk(table, payloads);
      this.vaultEngine.insertRows(table, dbPayloads);

      return of(void 0).pipe(
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
    } catch (err) {
      return throwError(() => err);
    }
  }

  public update<TInput = any, TOutput = any>(
    table: SQLiteTable<any>,
    domainModel: TInput
  ): Observable<TOutput> {
    try {
      const recordId = (domainModel as any)?.id;
      if (!recordId) {
        return throwError(() => new Error('[VaultStore] Update aborted: Missing primary identity column key "id".'));
      }

      const dbPayload = serializePayload(table, domainModel);
      this.vaultEngine.updateRowById(table, recordId, dbPayload);

      return of(void 0).pipe(
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
    } catch (err) {
      return throwError(() => err);
    }
  }

  public delete(
    table: SQLiteTable<any>,
    id: string | number
  ): Observable<void> {
    try {
      this.vaultEngine.deleteById(table, id);

      return of(void 0).pipe(
        concatMap(() => {
          this.flush();
          const tableName = getTableName(table);

          if (tableName === 'decks' || tableName === 'sets') {
            const entityType = tableName === 'decks' ? 'deck' : 'set';
            return this.sync.enqueue({
              entityType,
              action: 'DELETE',
              payload: { id }
            }).pipe(map(() => void 0));
          }
          return of(void 0);
        }),
        catchError((err) => throwError(() => err))
      );
    } catch (err) {
      return throwError(() => err);
    }
  }

  public deleteWhere(
    table: SQLiteTable<any>,
    columnKey: string,
    value: string | number
  ): Observable<void> {
    try {
      this.vaultEngine.deleteWhere(table, columnKey, value);
      this.flush();
      return of(void 0);
    } catch (err) {
      return throwError(() => err);
    }
  }

  public fetchRecord<TOutput = any>(
    table: SQLiteTable<any>,
    id: string | number
  ): Observable<TOutput | null> {
    try {
      const row = this.vaultEngine.selectById(table, id);
      if (!row) {
        return of(null);
      }
      return of(hydrateRow<TOutput>(table, row));
    } catch (err) {
      console.error(`[VaultStore] fetchRecord failure on key ${id}:`, err);
      return throwError(() => err);
    }
  }

  public fetchCollection<TOutput = any>(
    table: SQLiteTable<any>,
    contextId?: string | number
  ): Observable<TOutput[]> {
    try {
      const rows = this.vaultEngine.selectAll(table, contextId);
      return of(rows.map((row) => hydrateRow<TOutput>(table, row)));
    } catch (err) {
      return throwError(() => err);
    }
  }

  public flush(): void {
    this.vaultEngine.flush();
  }
}
