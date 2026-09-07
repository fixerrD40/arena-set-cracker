import { InjectionToken, Injector } from '@angular/core';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';

export interface OutboxEnvelope {
  entityType: 'set' | 'deck';
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
}

export interface SyncQueueItem {
  id: number;
  entityType: 'set' | 'deck';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
  createdAt: string;
}

/** Platform vault host: bootstrap DB, row CRUD, queue ops, flush. */
export abstract class VaultEngine {
  abstract bootstrap(injector: Injector): Promise<void>;
  abstract flush(): void;

  abstract insertRows(table: SQLiteTable<any>, rows: Record<string, unknown>[]): void;
  abstract updateRowById(
    table: SQLiteTable<any>,
    id: string | number,
    row: Record<string, unknown>
  ): void;
  abstract deleteById(table: SQLiteTable<any>, id: string | number): void;
  abstract deleteWhere(
    table: SQLiteTable<any>,
    columnKey: string,
    value: string | number
  ): void;
  abstract selectById(
    table: SQLiteTable<any>,
    id: string | number
  ): Record<string, unknown> | null;
  abstract selectAll(
    table: SQLiteTable<any>,
    contextId?: string | number
  ): Record<string, unknown>[];

  abstract getPendingSyncItems(): Promise<SyncQueueItem[]>;
  abstract clearSyncItemsBatch(ids: number[]): Promise<void>;
  /** Upserts an outbox row so later mutations for the same entity squash earlier ones. */
  abstract enqueueSyncItem(envelope: OutboxEnvelope): Promise<void>;
}

export const VAULT_ENGINE_TOKEN = new InjectionToken<VaultEngine>('VAULT_ENGINE_TOKEN');
