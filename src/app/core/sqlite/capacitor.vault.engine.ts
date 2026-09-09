import { Injectable, Injector, runInInjectionContext, inject } from '@angular/core';
import { getTableName } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection
} from '@capacitor-community/sqlite';

import { OutboxEnvelope, VaultEngine, SyncQueueItem } from '../vault/vault.engine';
import {
  buildDeleteByIdSql,
  buildDeleteWhereSql,
  buildInsertSql,
  buildSelectAllSql,
  buildSelectByIdSql,
  buildUpdateByIdSql,
  mapSqlRowToJs
} from '../vault/vault-table-sql';
import { APP_CONFIG } from '../config/config.model';
import { syncQueue } from './sqlite.schema';
import {
  applyMigrationMetas,
  baselineLegacyDrizzleMigrations,
  loadMigrationMetasFromFetch,
  sqlHostFromCapacitor
} from './vault-migrations';
import { applyTipClockSchemaPatchAsync } from './schema-patches';

/**
 * Capacitor vault: native SQLite via @capacitor-community/sqlite.
 * Replaces the prior sql.js + Directory.Data blob path (wipe that file if present).
 */
@Injectable({
  providedIn: 'root'
})
export class CapacitorVaultEngine extends VaultEngine {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private db: SQLiteDBConnection | null = null;
  private dbName = 'mtg_vault';

  public override async bootstrap(injector: Injector): Promise<void> {
    if (this.db) return;

    const runtimeConfig = runInInjectionContext(injector, () => {
      const appConfig = inject(APP_CONFIG);
      return { sqliteDbName: appConfig.sqliteDbName };
    });

    this.dbName = runtimeConfig.sqliteDbName
      .replace(/^file:/, '')
      .replace(/\.db$/i, '');

    try {
      console.log('[CapacitorVaultEngine] Opening native SQLite connection...');
      const consistency = await this.sqlite.checkConnectionsConsistency();
      const isConn = (await this.sqlite.isConnection(this.dbName, false)).result;
      if (consistency.result && isConn) {
        this.db = await this.sqlite.retrieveConnection(this.dbName, false);
      } else {
        this.db = await this.sqlite.createConnection(
          this.dbName,
          false,
          'no-encryption',
          1,
          false
        );
      }
      await this.db.open();
      await this.runVaultMigrations();
      console.log(`[CapacitorVaultEngine] Native vault open: [${this.dbName}].`);
    } catch (error) {
      console.error('[CapacitorVaultEngine] Boot breakdown:', error);
      throw error;
    }
  }

  public async insertRows(table: SQLiteTable<any>, rows: Record<string, unknown>[]): Promise<void> {
    if (!rows.length) return;
    const set = rows.map((row) => {
      const statement = buildInsertSql(table, this.withInsertDefaults(table, row));
      return { statement: statement.sql, values: statement.params };
    });
    await this.requireDb().executeSet(set);
  }

  public async updateRowById(
    table: SQLiteTable<any>,
    id: string | number,
    row: Record<string, unknown>
  ): Promise<void> {
    const statement = buildUpdateByIdSql(table, id, row);
    await this.requireDb().run(statement.sql, statement.params);
  }

  public async deleteById(table: SQLiteTable<any>, id: string | number): Promise<void> {
    const statement = buildDeleteByIdSql(table, id);
    await this.requireDb().run(statement.sql, statement.params);
  }

  public async deleteWhere(
    table: SQLiteTable<any>,
    columnKey: string,
    value: string | number
  ): Promise<void> {
    const statement = buildDeleteWhereSql(table, columnKey, value);
    await this.requireDb().run(statement.sql, statement.params);
  }

  public async selectById(
    table: SQLiteTable<any>,
    id: string | number
  ): Promise<Record<string, unknown> | null> {
    const statement = buildSelectByIdSql(table, id);
    const result = await this.requireDb().query(statement.sql, statement.params);
    const raw = this.firstRow(result.values);
    return raw ? mapSqlRowToJs(table, raw) : null;
  }

  public async selectAll(
    table: SQLiteTable<any>,
    contextId?: string | number
  ): Promise<Record<string, unknown>[]> {
    const statement = buildSelectAllSql(table, contextId);
    const result = await this.requireDb().query(statement.sql, statement.params);
    return this.rows(result.values).map((row) => mapSqlRowToJs(table, row));
  }

  public async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    const result = await this.requireDb().query(
      'SELECT * FROM sync_queue ORDER BY id ASC',
      []
    );
    return this.rows(result.values).map(
      (row) => mapSqlRowToJs(syncQueue, row) as unknown as SyncQueueItem
    );
  }

  public async clearSyncItemsBatch(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    await this.requireDb().run(
      `DELETE FROM sync_queue WHERE id IN (${placeholders})`,
      ids
    );
  }

  public async enqueueSyncItem(item: OutboxEnvelope): Promise<void> {
    const payloadId = String(item.payload?.id);
    if (!payloadId) {
      console.error('[CapacitorVaultEngine] Enqueue aborted: Payload lacks unique ID.');
      return;
    }

    const db = this.requireDb();
    if (item.action === 'DELETE') {
      await db.run(
        'DELETE FROM sync_queue WHERE entity_type = ? AND entity_id = ?',
        [item.entityType, payloadId]
      );
    }

    const createdAt = new Date().toISOString();
    const payloadJson = JSON.stringify(item.payload);
    await db.run(
      `INSERT INTO sync_queue (entity_type, entity_id, action, payload, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(entity_type, entity_id) DO UPDATE SET
         action = excluded.action,
         payload = excluded.payload,
         created_at = excluded.created_at`,
      [item.entityType, payloadId, item.action, payloadJson, createdAt]
    );
  }

  /** Native SQLite persists on each write; no blob flush. */
  public flush(): void {}

  private withInsertDefaults(
    table: SQLiteTable<any>,
    row: Record<string, unknown>
  ): Record<string, unknown> {
    if (getTableName(table) === 'decks') {
      const next = { ...row };
      if (next['createdAt'] === undefined) {
        next['createdAt'] = new Date().toISOString();
      }
      if (next['updatedAt'] === undefined) {
        next['updatedAt'] = (next['createdAt'] as string) || new Date().toISOString();
      }
      return next;
    }
    if (getTableName(table) === 'sets' && row['updatedAt'] === undefined) {
      return { ...row, updatedAt: new Date().toISOString() };
    }
    return row;
  }

  private requireDb(): SQLiteDBConnection {
    if (!this.db) {
      throw new Error('[CapacitorVaultEngine] Engine uninitialized.');
    }
    return this.db;
  }

  private async runVaultMigrations(): Promise<void> {
    const db = this.requireDb();
    const host = sqlHostFromCapacitor(db);
    const migrations = await loadMigrationMetasFromFetch();
    await baselineLegacyDrizzleMigrations(host, migrations);
    await applyMigrationMetas(host, migrations);
    await applyTipClockSchemaPatchAsync((sql) => host.exec(sql));
  }

  private rows(values: any[] | undefined): Record<string, unknown>[] {
    if (!values?.length) return [];
    return values.filter((row) => row && typeof row === 'object') as Record<string, unknown>[];
  }

  private firstRow(values: any[] | undefined): Record<string, unknown> | null {
    return this.rows(values)[0] ?? null;
  }
}
