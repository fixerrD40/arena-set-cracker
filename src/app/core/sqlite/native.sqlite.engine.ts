import { Injectable, Injector, runInInjectionContext, inject } from '@angular/core';
import { APP_CONFIG } from '../config/config.model';
import { syncQueue } from './sqlite.schema';
import * as MySchema from './sqlite.schema';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/sql-js';
import initSqlJs from 'sql.js';
import { getDesktopBridge } from '../platform/desktop-bridge';
import { OutboxEnvelope, VaultEngine, SyncQueueItem } from '../vault/vault.engine';

@Injectable({
  providedIn: 'root'
})
export class NativeVaultEngine extends VaultEngine {
  public rawSqliteClient?: any;
  public cachedDbInstance?: any;
  public activeFileName?: string;
  private persistChain: Promise<void> = Promise.resolve();

  public override async bootstrap(injector: Injector): Promise<void> {
    if (this.cachedDbInstance) return;

    const runtimeConfig = runInInjectionContext(injector, () => {
      const appConfig = inject(APP_CONFIG);
      return {
        sqliteDbName: appConfig.sqliteDbName,
        baseUrl: appConfig.baseUrl
      };
    });

    this.activeFileName = runtimeConfig.sqliteDbName.replace(/^file:/, '');

    const desktop = getDesktopBridge();
    if (!desktop) {
      throw new Error('[VaultEngine] Desktop bridge unavailable.');
    }

    try {
      const SQL = await initSqlJs({ locateFile: (file: string) => `assets/${file}` });
      const existing = await desktop.sqliteRead(this.activeFileName);

      if (existing) {
        this.rawSqliteClient = new SQL.Database(new Uint8Array(existing));
        this.rawSqliteClient.run('PRAGMA foreign_keys = ON;');
        this.cachedDbInstance = drizzle(this.rawSqliteClient, { schema: MySchema });

        console.log(`[VaultEngine] High-speed Drizzle client loaded via desktop bridge: [${this.activeFileName}].`);
      } else {
        console.log(`[VaultEngine] Database container file missing. Compiling schema layout...`);

        this.rawSqliteClient = new SQL.Database();
        this.rawSqliteClient.run('PRAGMA foreign_keys = ON;');
        this.cachedDbInstance = drizzle(this.rawSqliteClient, { schema: MySchema });

        const ddl = await desktop.drizzleBootstrapSql();
        this.generateDatabaseSchema(this.rawSqliteClient, ddl);
        await this.persistToDisk();
      }
    } catch (rootError) {
      console.error('[VaultEngine] Critical failure during desktop engine initialization pass:', rootError);
      throw rootError;
    }
  }

  public async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    const db = this.cachedDbInstance;
    if (!db) {
      console.warn('[VaultEngine] Sync lookup aborted: Database uninitialized.');
      return [];
    }
    try {
      return db.select().from(syncQueue).orderBy(syncQueue.id).all() as SyncQueueItem[];
    } catch (error) {
      console.error('[VaultEngine] Failed to read pending outbox logs:', error);
      return [];
    }
  }

  public async clearSyncItemsBatch(ids: number[]): Promise<void> {
    const db = this.cachedDbInstance;
    if (!db || ids.length === 0) return;
    try {
      db.delete(syncQueue)
        .where(inArray(syncQueue.id, ids))
        .run();

      this.flush();
    } catch (error) {
      console.error('[VaultEngine] Failed to execute atomic batch purge on disk:', error);
      throw error;
    }
  }

  public async enqueueSyncItem(item: OutboxEnvelope): Promise<void> {
    const db = this.cachedDbInstance;
    if (!db) {
      console.warn('[VaultEngine] SQLite database instance uninitialized.');
      return;
    }

    const payloadId = String(item.payload?.id);
    if (!payloadId) {
      console.error('[VaultEngine] Enqueue aborted: Payload lacks unique ID.');
      return;
    }

    try {
      if (item.action === 'DELETE') {
        db.delete(syncQueue)
          .where(and(eq(syncQueue.entityType, item.entityType), eq(syncQueue.entityId, payloadId)))
          .run();
      }

      db.insert(syncQueue)
        .values({
          entityType: item.entityType,
          entityId: payloadId,
          action: item.action,
          payload: item.payload
        })
        .onConflictDoUpdate({
          target: [syncQueue.entityType, syncQueue.entityId],
          set: {
            action: item.action,
            payload: item.payload,
            createdAt: new Date().toISOString()
          }
        })
        .run();

      this.flush();
    } catch (err) {
      console.error('[VaultEngine] Database upsert failure:', err);
      throw err;
    }
  }

  public flush(): void {
    this.persistChain = this.persistChain.then(
      () => this.persistToDisk(),
      () => this.persistToDisk()
    );
  }

  private async persistToDisk(): Promise<void> {
    const rawDb = this.rawSqliteClient;
    const fileName = this.activeFileName;
    const desktop = getDesktopBridge();
    if (!rawDb || !fileName || !desktop) return;

    try {
      const data = new Uint8Array(rawDb.export());
      await desktop.sqliteWrite(fileName, data);
      console.log(`[VaultEngine] Memory cache state successfully persisted to disk: [${fileName}].`);
    } catch (error) {
      console.error('[VaultEngine] Critical failure writing binary block to disk:', error);
    }
  }

  private generateDatabaseSchema(db: any, ddlStatementsScript: string): void {
    db.run(ddlStatementsScript);
    console.log('[VaultEngine] Database schema successfully initialized via drizzle bootstrap SQL.');
  }
}
