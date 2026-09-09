import { Injectable, Injector, runInInjectionContext, inject } from '@angular/core';
import { getTableName } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { APP_CONFIG } from '../config/config.model';
import { getDesktopBridge } from '../platform/desktop-bridge';
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
import { syncQueue } from './sqlite.schema';

/**
 * Electron vault: better-sqlite3 in main via IPC. No sql.js in the renderer.
 * Existing mtg_vault.db files from the prior sql.js dump path open as normal SQLite.
 * Row CRUD uses sendSync so VaultStore can stay synchronous.
 */
@Injectable({
  providedIn: 'root'
})
export class ElectronVaultEngine extends VaultEngine {
  private ready = false;

  public override async bootstrap(injector: Injector): Promise<void> {
    if (this.ready) return;

    const runtimeConfig = runInInjectionContext(injector, () => {
      const appConfig = inject(APP_CONFIG);
      return { sqliteDbName: appConfig.sqliteDbName };
    });

    const fileName = runtimeConfig.sqliteDbName.replace(/^file:/, '');
    const desktop = getDesktopBridge();
    if (!desktop?.vaultOpen || !desktop.vaultMigrate) {
      throw new Error('[ElectronVaultEngine] Desktop vault bridge unavailable.');
    }

    try {
      await desktop.vaultOpen(fileName);
      await desktop.vaultMigrate();
      this.ready = true;
      console.log(`[ElectronVaultEngine] better-sqlite3 vault open: [${fileName}].`);
    } catch (rootError) {
      console.error('[ElectronVaultEngine] Critical failure during desktop vault bootstrap:', rootError);
      throw rootError;
    }
  }

  public async insertRows(table: SQLiteTable<any>, rows: Record<string, unknown>[]): Promise<void> {
    if (!rows.length) return;
    // decks.created_at is NOT NULL without a SQL DEFAULT; drizzle $default only runs in-process.
    const statements = rows.map((row) =>
      buildInsertSql(table, this.withInsertDefaults(table, row))
    );
    this.desktop().vaultRunBatchSync(statements);
  }

  public async updateRowById(
    table: SQLiteTable<any>,
    id: string | number,
    row: Record<string, unknown>
  ): Promise<void> {
    const statement = buildUpdateByIdSql(table, id, row);
    this.desktop().vaultRunSync(statement.sql, statement.params);
  }

  public async deleteById(table: SQLiteTable<any>, id: string | number): Promise<void> {
    const statement = buildDeleteByIdSql(table, id);
    this.desktop().vaultRunSync(statement.sql, statement.params);
  }

  public async deleteWhere(
    table: SQLiteTable<any>,
    columnKey: string,
    value: string | number
  ): Promise<void> {
    const statement = buildDeleteWhereSql(table, columnKey, value);
    this.desktop().vaultRunSync(statement.sql, statement.params);
  }

  public async selectById(
    table: SQLiteTable<any>,
    id: string | number
  ): Promise<Record<string, unknown> | null> {
    const statement = buildSelectByIdSql(table, id);
    const raw = this.desktop().vaultGetSync(statement.sql, statement.params);
    return raw ? mapSqlRowToJs(table, raw) : null;
  }

  public async selectAll(
    table: SQLiteTable<any>,
    contextId?: string | number
  ): Promise<Record<string, unknown>[]> {
    const statement = buildSelectAllSql(table, contextId);
    const rows = this.desktop().vaultAllSync(statement.sql, statement.params);
    return rows.map((row) => mapSqlRowToJs(table, row));
  }

  public async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    const rows = this.desktop().vaultAllSync(
      'SELECT * FROM sync_queue ORDER BY id ASC',
      []
    );
    return rows.map((row) => mapSqlRowToJs(syncQueue, row) as unknown as SyncQueueItem);
  }

  public async clearSyncItemsBatch(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    this.desktop().vaultRunSync(
      `DELETE FROM sync_queue WHERE id IN (${placeholders})`,
      ids
    );
  }

  public async enqueueSyncItem(item: OutboxEnvelope): Promise<void> {
    const payloadId = String(item.payload?.id);
    if (!payloadId) {
      console.error('[ElectronVaultEngine] Enqueue aborted: Payload lacks unique ID.');
      return;
    }

    const desktop = this.desktop();
    if (item.action === 'DELETE') {
      desktop.vaultRunSync(
        'DELETE FROM sync_queue WHERE entity_type = ? AND entity_id = ?',
        [item.entityType, payloadId]
      );
    }

    const createdAt = new Date().toISOString();
    const payloadJson = JSON.stringify(item.payload);
    desktop.vaultRunSync(
      `INSERT INTO sync_queue (entity_type, entity_id, action, payload, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(entity_type, entity_id) DO UPDATE SET
         action = excluded.action,
         payload = excluded.payload,
         created_at = excluded.created_at`,
      [item.entityType, payloadId, item.action, payloadJson, createdAt]
    );
  }

  /** better-sqlite3 commits to the file; no blob export. */
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

  private desktop() {
    const bridge = getDesktopBridge();
    if (!bridge?.vaultOpen || !bridge.vaultRunSync) {
      throw new Error('[ElectronVaultEngine] Desktop vault bridge unavailable.');
    }
    return bridge;
  }
}
