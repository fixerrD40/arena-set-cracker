import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { and, eq, getTableColumns, inArray } from 'drizzle-orm';
import { OutboxEnvelope, SyncQueueItem } from '../vault/vault.engine';
import { syncQueue } from './sqlite.schema';

/** Drizzle/sql.js implementations shared by browser + Capacitor engines. */
export function sqlJsInsertRows(db: any, table: SQLiteTable<any>, rows: Record<string, unknown>[]): void {
  if (!rows.length) return;
  db.insert(table).values(rows).run();
}

export function sqlJsUpdateRowById(
  db: any,
  table: SQLiteTable<any>,
  id: string | number,
  row: Record<string, unknown>
): void {
  const idColumn = (table as any).id;
  if (!idColumn) {
    throw new Error('[VaultEngine] Update aborted: table has no id column.');
  }
  db.update(table).set(row).where(eq(idColumn, id)).run();
}

export function sqlJsDeleteById(db: any, table: SQLiteTable<any>, id: string | number): void {
  const idColumn = (table as any).id;
  if (!idColumn) {
    throw new Error('[VaultEngine] Table lacks an id column.');
  }
  db.delete(table).where(eq(idColumn, id)).run();
}

export function sqlJsDeleteWhere(
  db: any,
  table: SQLiteTable<any>,
  columnKey: string,
  value: string | number
): void {
  const columns = getTableColumns(table);
  const column = columns[columnKey];
  if (!column) {
    throw new Error(`[VaultEngine] Column "${columnKey}" not found on table.`);
  }
  db.delete(table).where(eq(column, value)).run();
}

export function sqlJsSelectById(
  db: any,
  table: SQLiteTable<any>,
  id: string | number
): Record<string, unknown> | null {
  const idColumn = (table as any).id;
  if (!idColumn) {
    throw new Error('[VaultEngine] Table lacks an id column.');
  }
  const rows = db.select().from(table).where(eq(idColumn, id)).limit(1).all() as Record<string, unknown>[];
  return rows[0] ?? null;
}

export function sqlJsSelectAll(
  db: any,
  table: SQLiteTable<any>,
  contextId?: string | number
): Record<string, unknown>[] {
  const columns = getTableColumns(table);
  const setIdColumn = columns['setId'] || columns['set_id'];

  let queryBuilder = db.select().from(table);
  if (contextId !== undefined && contextId !== 'all' && setIdColumn) {
    queryBuilder = queryBuilder.where(eq(setIdColumn, String(contextId))) as any;
  }
  return queryBuilder.all() as Record<string, unknown>[];
}

export function sqlJsGetPendingSyncItems(db: any): SyncQueueItem[] {
  return db.select().from(syncQueue).orderBy(syncQueue.id).all() as SyncQueueItem[];
}

export function sqlJsClearSyncItemsBatch(db: any, ids: number[]): void {
  if (ids.length === 0) return;
  db.delete(syncQueue).where(inArray(syncQueue.id, ids)).run();
}

export async function sqlJsEnqueueSyncItem(db: any, item: OutboxEnvelope): Promise<void> {
  const payloadId = String(item.payload?.id);
  if (!payloadId) {
    console.error('[VaultEngine] Enqueue aborted: Payload lacks unique ID.');
    return;
  }

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
}
