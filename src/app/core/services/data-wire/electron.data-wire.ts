import { inject, Injectable } from '@angular/core';
import { Observable, of, throwError, from } from 'rxjs';
import { concatMap, catchError, map, toArray } from 'rxjs/operators';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { eq, getTableName, getTableColumns } from 'drizzle-orm';
import { DataWire } from './data-wire.contract';
import { SQLITE_ENGINE_TOKEN } from '../../sqlite/sqlite.engine';
import { OutboxService } from '../outbox.service';
import {
  serializePayload,
  serializePayloadsBulk,
  hydrateRow
} from '../../sqlite/sqlite.registry';
import { toOutboxPayload } from './outbox.payload';

@Injectable({
  providedIn: 'root'
})
export class ElectronDataWire implements DataWire<SQLiteTable<any>> {
  private readonly sqliteEngine = inject(SQLITE_ENGINE_TOKEN);
  private readonly outbox = inject(OutboxService);

  public insert<TInput = any, TOutput = any>(
    table: SQLiteTable<any>,
    domainModel: TInput
  ): Observable<TOutput> {
    const db = (this.sqliteEngine as any).cachedDbInstance;
    if (!db) return throwError(() => new Error('[ElectronDataWire] Engine uninitialized.'));

    try {
      const dbPayload = serializePayload(table, domainModel);

      db.insert(table).values(dbPayload).run();

      return of(void 0).pipe(
        concatMap(() => {
          this.flush();
          const tableNameStr = getTableName(table);

          if (tableNameStr === 'decks' || tableNameStr === 'sets') {
            const entityType = tableNameStr === 'decks' ? 'deck' : 'set';
            return this.outbox.enqueue({
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
    const db = (this.sqliteEngine as any).cachedDbInstance;
    if (!db) return throwError(() => new Error('[ElectronDataWire] Engine not bootstrapped.'));
    if (!payloads || payloads.length === 0) return of([]);

    try {
      const dbPayloads = serializePayloadsBulk(table, payloads);

      db.insert(table).values(dbPayloads).run();

      return of(void 0).pipe(
        concatMap(() => {
          this.flush();
          const tableNameStr = getTableName(table);

          if (tableNameStr === 'decks' || tableNameStr === 'sets') {
            const entityType = tableNameStr === 'decks' ? 'deck' : 'set';

            return from(payloads).pipe(
              concatMap(domainItem => this.outbox.enqueue({
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

  /** Updates by primary key, flushes to disk, and enqueues outbox UPDATE for decks/sets. */
  public update<TInput = any, TOutput = any>(
    table: SQLiteTable<any>,
    domainModel: TInput
  ): Observable<TOutput> {
    const db = (this.sqliteEngine as any).cachedDbInstance;
    if (!db) return throwError(() => new Error('[ElectronDataWire] Engine uninitialized.'));

    try {
      const idColumn = (table as any).id;
      const recordId = (domainModel as any)?.id;

      if (!idColumn || !recordId) {
        return throwError(() => new Error('[ElectronDataWire] Update aborted: Missing unique primary key identifier "id".'));
      }

      const dbPayload = serializePayload(table, domainModel);

      db.update(table)
        .set(dbPayload)
        .where(eq(idColumn, recordId))
        .run();

      return of(void 0).pipe(
        concatMap(() => {
          this.flush();
          const tableNameStr = getTableName(table);

          if (tableNameStr === 'decks' || tableNameStr === 'sets') {
            const entityType = tableNameStr === 'decks' ? 'deck' : 'set';
            return this.outbox.enqueue({
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
    const db = (this.sqliteEngine as any).cachedDbInstance;
    if (!db) return throwError(() => new Error('[ElectronDataWire] Engine not bootstrapped.'));

    try {
      const idColumn = (table as any).id;
      if (!idColumn) {
        return throwError(() => new Error('[ElectronDataWire] Target table lacks an "id" tracking token.'));
      }

      db.delete(table).where(eq(idColumn, id)).run();

      return of(void 0).pipe(
        concatMap(() => {
          this.flush();
          const tableName = getTableName(table);

          if (tableName === 'decks' || tableName === 'sets') {
            const entityType = tableName === 'decks' ? 'deck' : 'set';
            return this.outbox.enqueue({
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
    const db = (this.sqliteEngine as any).cachedDbInstance;
    if (!db) return throwError(() => new Error('[ElectronDataWire] Engine not bootstrapped.'));

    try {
      const columns = getTableColumns(table);
      const column = columns[columnKey];
      if (!column) {
        return throwError(() => new Error(`[ElectronDataWire] Column "${columnKey}" not found on table.`));
      }

      db.delete(table).where(eq(column, value)).run();
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
    const db = (this.sqliteEngine as any).cachedDbInstance;
    if (!db) return throwError(() => new Error('[ElectronDataWire] Engine uninitialized.'));

    try {
      const idColumn = (table as any).id;
      if (!idColumn) {
        return throwError(() => new Error('[ElectronDataWire] Target table lacks an "id" tracking token.'));
      }

      const untypedRows = db
        .select()
        .from(table)
        .where(eq(idColumn, id))
        .limit(1)
        .all() as Record<string, any>[];

      if (untypedRows.length === 0) {
        return of(null);
      }

      const hydratedResult = hydrateRow<TOutput>(table, untypedRows[0]);
      return of(hydratedResult);
    } catch (err) {
      console.error(`[ElectronDataWire] fetchRecord failure on key ${id}:`, err);
      return throwError(() => err);
    }
  }

  public fetchCollection<TOutput = any>(
    table: SQLiteTable<any>,
    contextId?: string | number
  ): Observable<TOutput[]> {
    const db = (this.sqliteEngine as any).cachedDbInstance;
    if (!db) return throwError(() => new Error('[DataWire] Engine uninitialized.'));

    try {
      const columns = getTableColumns(table);
      const setIdColumn = columns['setId'] || columns['set_id'];

      let queryBuilder = db.select().from(table);
      if (contextId !== undefined && contextId !== 'all' && setIdColumn) {
        queryBuilder = queryBuilder.where(eq(setIdColumn, String(contextId))) as any;
      }

      const untypedRows = queryBuilder.all() as Record<string, any>[];

      const result = untypedRows.map((row) => hydrateRow<TOutput>(table, row));

      return of(result);
    } catch (err) {
      return throwError(() => err);
    }
  }

  public flush(): void {
    if (typeof (this.sqliteEngine as any).flush === 'function') {
      (this.sqliteEngine as any).flush();
    }
  }
}
