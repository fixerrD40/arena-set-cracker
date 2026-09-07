import { Injectable, Injector, runInInjectionContext, inject } from '@angular/core';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/sql-js';
import initSqlJs from 'sql.js';
import { Directory, Filesystem } from '@capacitor/filesystem';

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
} from './sqljs-vault-crud';

@Injectable({
  providedIn: 'root'
})
export class CapacitorVaultEngine extends VaultEngine {
  public rawSqliteClient?: any;
  public cachedDbInstance?: any;
  public activeFileName?: string;
  private persistChain: Promise<void> = Promise.resolve();

  public override async bootstrap(injector: Injector): Promise<void> {
    if (this.cachedDbInstance) return;

    const runtimeConfig = runInInjectionContext(injector, () => {
      const appConfig = inject(APP_CONFIG);
      return { sqliteDbName: appConfig.sqliteDbName };
    });

    this.activeFileName = runtimeConfig.sqliteDbName.replace(/^file:/, '');

    try {
      console.log('[CapacitorVaultEngine] Bootstrapping sql.js vault on Directory.Data...');
      const SQL = await initSqlJs({ locateFile: (file: string) => `assets/${file}` });
      const existing = await this.readVaultBinary(this.activeFileName);

      if (existing) {
        this.rawSqliteClient = new SQL.Database(existing);
        this.rawSqliteClient.run('PRAGMA foreign_keys = ON;');
        this.cachedDbInstance = drizzle(this.rawSqliteClient, { schema: MySchema });
        console.log(`[CapacitorVaultEngine] Loaded vault file: [${this.activeFileName}].`);
      } else {
        console.log('[CapacitorVaultEngine] Vault file missing. Initializing schema...');
        this.rawSqliteClient = new SQL.Database();
        this.rawSqliteClient.run('PRAGMA foreign_keys = ON;');
        this.cachedDbInstance = drizzle(this.rawSqliteClient, { schema: MySchema });
        await this.generateDatabaseSchema(this.rawSqliteClient);
        await this.persistToDisk();
      }
    } catch (error) {
      console.error('[CapacitorVaultEngine] Boot breakdown:', error);
      throw error;
    }
  }

  public insertRows(table: SQLiteTable<any>, rows: Record<string, unknown>[]): void {
    sqlJsInsertRows(this.requireDb(), table, rows);
  }

  public updateRowById(
    table: SQLiteTable<any>,
    id: string | number,
    row: Record<string, unknown>
  ): void {
    sqlJsUpdateRowById(this.requireDb(), table, id, row);
  }

  public deleteById(table: SQLiteTable<any>, id: string | number): void {
    sqlJsDeleteById(this.requireDb(), table, id);
  }

  public deleteWhere(table: SQLiteTable<any>, columnKey: string, value: string | number): void {
    sqlJsDeleteWhere(this.requireDb(), table, columnKey, value);
  }

  public selectById(table: SQLiteTable<any>, id: string | number): Record<string, unknown> | null {
    return sqlJsSelectById(this.requireDb(), table, id);
  }

  public selectAll(table: SQLiteTable<any>, contextId?: string | number): Record<string, unknown>[] {
    return sqlJsSelectAll(this.requireDb(), table, contextId);
  }

  public async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    if (!this.cachedDbInstance) return [];
    try {
      return sqlJsGetPendingSyncItems(this.cachedDbInstance);
    } catch (error) {
      console.error('[CapacitorVaultEngine] Failed to read pending outbox logs:', error);
      return [];
    }
  }

  public async clearSyncItemsBatch(ids: number[]): Promise<void> {
    const db = this.cachedDbInstance;
    if (!db || ids.length === 0) return;
    try {
      sqlJsClearSyncItemsBatch(db, ids);
      this.flush();
    } catch (error) {
      console.error('[CapacitorVaultEngine] Failed to purge sync batch:', error);
      throw error;
    }
  }

  public async enqueueSyncItem(item: OutboxEnvelope): Promise<void> {
    const db = this.cachedDbInstance;
    if (!db) return;
    try {
      await sqlJsEnqueueSyncItem(db, item);
      this.flush();
    } catch (err) {
      console.error('[CapacitorVaultEngine] Enqueue failure:', err);
      throw err;
    }
  }

  public flush(): void {
    this.persistChain = this.persistChain.then(
      () => this.persistToDisk(),
      () => this.persistToDisk()
    );
  }

  private requireDb(): any {
    if (!this.cachedDbInstance) {
      throw new Error('[CapacitorVaultEngine] Engine uninitialized.');
    }
    return this.cachedDbInstance;
  }

  private async persistToDisk(): Promise<void> {
    const rawDb = this.rawSqliteClient;
    const fileName = this.activeFileName;
    if (!rawDb || !fileName) return;

    try {
      const data = new Uint8Array(rawDb.export());
      await Filesystem.writeFile({
        path: fileName,
        data: this.uint8ToBase64(data),
        directory: Directory.Data,
        recursive: true
      });
      console.log(`[CapacitorVaultEngine] Persisted vault to Directory.Data: [${fileName}].`);
    } catch (error) {
      console.error('[CapacitorVaultEngine] Failed writing vault file:', error);
    }
  }

  private async readVaultBinary(fileName: string): Promise<Uint8Array | null> {
    try {
      const result = await Filesystem.readFile({
        path: fileName,
        directory: Directory.Data
      });
      const data = result.data;
      if (typeof data === 'string') {
        return this.base64ToUint8(data);
      }
      if (data instanceof Blob) {
        const buffer = await data.arrayBuffer();
        return new Uint8Array(buffer);
      }
      return null;
    } catch {
      return null;
    }
  }

  private async generateDatabaseSchema(db: any): Promise<void> {
    const journalResponse = await fetch('drizzle/meta/_journal.json');
    if (!journalResponse.ok) {
      throw new Error('Drizzle journal missing from app assets.');
    }

    const journal = await journalResponse.json();
    const tag = journal?.entries?.[0]?.tag;
    if (!tag) {
      throw new Error('Drizzle journal has no initial migration tag.');
    }

    const response = await fetch(`drizzle/${tag}.sql`);
    if (!response.ok) {
      throw new Error(`Schema migration file missing: drizzle/${tag}.sql`);
    }

    const ddlStatementsScript = await response.text();
    const cleaned = ddlStatementsScript.replace(/-->\s*statement-breakpoint/g, '');
    db.run(cleaned);
    console.log(`[CapacitorVaultEngine] Schema initialized via: [${tag}.sql].`);
  }

  private uint8ToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  private base64ToUint8(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
