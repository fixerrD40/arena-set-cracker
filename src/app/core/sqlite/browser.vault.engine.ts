import { Injectable, Injector, runInInjectionContext, inject } from '@angular/core';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/sql-js';
import initSqlJs from 'sql.js';

import { OutboxEnvelope, VaultEngine, SyncQueueItem } from '../vault/vault.engine';
import * as MySchema from './sqlite.schema';
import { APP_CONFIG } from '../config/config.model';
import {
  sqlJsClearSyncItemsBatch,
  sqlJsDeleteById,
  sqlJsDeleteWhere,
  sqlJsEnqueueSyncItem,
  sqlJsGetPendingSyncItems,
  sqlJsInsertRows,
  sqlJsSelectAll,
  sqlJsSelectById,
  sqlJsUpdateRowById
} from './browser-sqljs-vault-crud';
import {
  baselineLegacyDrizzleMigrations,
  loadMigrationMetasFromFetch,
  migrateDrizzleSqlite
} from './vault-migrations';
import { applyTipClockSchemaPatch } from './schema-patches';

@Injectable({
  providedIn: 'root'
})
export class BrowserVaultEngine extends VaultEngine {
  public rawSqliteClient?: any;
  public cachedDbInstance?: any;
  private activeDbKey?: string;

  public override async bootstrap(injector: Injector): Promise<void> {
    if (this.cachedDbInstance) return;

    const runtimeConfig = runInInjectionContext(injector, () => {
      const appConfig = inject(APP_CONFIG);
      return { sqliteDbName: appConfig.sqliteDbName };
    });

    const dbKey = `arena_cache_${runtimeConfig.sqliteDbName.replace(/^file:/, '')}`;
    this.activeDbKey = dbKey;

    try {
      console.log('[BrowserVaultEngine] Bootstrapping browser WebAssembly SQLite instance...');
      const SQL = await initSqlJs({ locateFile: (file: string) => `assets/${file}` });

      const savedBinary: Uint8Array | null = await new Promise((resolve) => {
        const request = indexedDB.open('ArenaWebCacheDB', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('kv_store');
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('kv_store', 'readonly');
          const getReq = transaction.objectStore('kv_store').get(dbKey);
          getReq.onsuccess = () => resolve(getReq.result || null);
          getReq.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
      });

      if (savedBinary) {
        console.log(`[BrowserVaultEngine] Container cache [${dbKey}] hydrated successfully.`);
        this.rawSqliteClient = new SQL.Database(savedBinary);
      } else {
        console.log('[BrowserVaultEngine] Container cache missing. Initializing schema...');
        this.rawSqliteClient = new SQL.Database();
      }

      this.rawSqliteClient.run('PRAGMA foreign_keys = ON;');
      this.cachedDbInstance = drizzle(this.rawSqliteClient, { schema: MySchema });

      await this.runVaultMigrations();
      if (!savedBinary) {
        await this.commitSnapshotToIndexedDb(dbKey);
      }
      console.log('[BrowserVaultEngine] Browser web storage sandbox successfully active.');
    } catch (error) {
      console.error('[BrowserVaultEngine] Boot breakdown:', error);
      throw error;
    }
  }

  public async insertRows(table: SQLiteTable<any>, rows: Record<string, unknown>[]): Promise<void> {
    sqlJsInsertRows(this.requireDb(), table, rows);
  }

  public async updateRowById(
    table: SQLiteTable<any>,
    id: string | number,
    row: Record<string, unknown>
  ): Promise<void> {
    sqlJsUpdateRowById(this.requireDb(), table, id, row);
  }

  public async deleteById(table: SQLiteTable<any>, id: string | number): Promise<void> {
    sqlJsDeleteById(this.requireDb(), table, id);
  }

  public async deleteWhere(
    table: SQLiteTable<any>,
    columnKey: string,
    value: string | number
  ): Promise<void> {
    sqlJsDeleteWhere(this.requireDb(), table, columnKey, value);
  }

  public async selectById(
    table: SQLiteTable<any>,
    id: string | number
  ): Promise<Record<string, unknown> | null> {
    return sqlJsSelectById(this.requireDb(), table, id);
  }

  public async selectAll(
    table: SQLiteTable<any>,
    contextId?: string | number
  ): Promise<Record<string, unknown>[]> {
    return sqlJsSelectAll(this.requireDb(), table, contextId);
  }

  public async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    if (!this.cachedDbInstance) return [];
    return sqlJsGetPendingSyncItems(this.cachedDbInstance);
  }

  public async clearSyncItemsBatch(ids: number[]): Promise<void> {
    const db = this.cachedDbInstance;
    if (!db || ids.length === 0) return;
    sqlJsClearSyncItemsBatch(db, ids);
    await this.flushToIndexedDb();
  }

  public async enqueueSyncItem(item: OutboxEnvelope): Promise<void> {
    const db = this.cachedDbInstance;
    if (!db) return;
    await sqlJsEnqueueSyncItem(db, item);
    await this.flushToIndexedDb();
  }

  public flush(): void {
    void this.flushToIndexedDb();
  }

  /** Replace in-memory DB + IndexedDB snapshot with an empty schema (no sync enqueue). */
  public async wipeLocalData(): Promise<void> {
    const SQL = await initSqlJs({ locateFile: (file: string) => `assets/${file}` });
    this.rawSqliteClient = new SQL.Database();
    this.rawSqliteClient.run('PRAGMA foreign_keys = ON;');
    this.cachedDbInstance = drizzle(this.rawSqliteClient, { schema: MySchema });
    await this.runVaultMigrations();
    const currentDbKey = this.activeDbKey ?? 'arena_cache_mtg_vault.db';
    await this.commitSnapshotToIndexedDb(currentDbKey);
    console.log('[BrowserVaultEngine] Local vault wiped for browser logout.');
  }

  public async flushToIndexedDb(): Promise<void> {
    const currentDbKey = this.activeDbKey ?? 'arena_cache_mtg_vault.db';
    await this.commitSnapshotToIndexedDb(currentDbKey);
  }

  private requireDb(): any {
    if (!this.cachedDbInstance) {
      throw new Error('[BrowserVaultEngine] Engine uninitialized.');
    }
    return this.cachedDbInstance;
  }

  private async commitSnapshotToIndexedDb(targetDbKey: string): Promise<void> {
    if (!this.rawSqliteClient) return;

    try {
      const binaryData = this.rawSqliteClient.export();

      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('ArenaWebCacheDB', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('kv_store');
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('kv_store', 'readwrite');
          const putReq = transaction.objectStore('kv_store').put(binaryData, targetDbKey);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        };
        request.onerror = () => reject(request.error);
      });

      console.log(`[BrowserVaultEngine] Memory state successfully flushed to storage key: [${targetDbKey}].`);
    } catch (error) {
      console.error('[BrowserVaultEngine] Critical failure synchronizing binary blocks to browser cache:', error);
    }
  }

  private async runVaultMigrations(): Promise<void> {
    const raw = this.rawSqliteClient;
    const drizzleDb = this.cachedDbInstance;
    if (!raw || !drizzleDb) {
      throw new Error('[BrowserVaultEngine] No sql.js database for migrations.');
    }

    const host = {
      exec: (sql: string) => {
        raw.exec(sql);
      },
      query: (sql: string) => {
        const result = raw.exec(sql) as Array<{ columns: string[]; values: unknown[][] }>;
        if (!result?.length) {
          return [];
        }
        const { columns, values } = result[0];
        return values.map((row) =>
          Object.fromEntries(columns.map((col, i) => [col, row[i]]))
        );
      }
    };

    const migrations = await loadMigrationMetasFromFetch();
    await baselineLegacyDrizzleMigrations(host, migrations);
    migrateDrizzleSqlite(drizzleDb, migrations);
    applyTipClockSchemaPatch((sql) => {
      raw.exec(sql);
    });
  }
}
