import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { getTableColumns, getTableName } from 'drizzle-orm';

/** Columns stored as JSON text in SQLite (drizzle `mode: 'json'`). */
const JSON_SQL_COLUMNS = new Set(['colors', 'themes', 'payload', 'theirs_payload']);

export function tableSqlName(table: SQLiteTable<any>): string {
  return getTableName(table);
}

export function columnSqlName(table: SQLiteTable<any>, jsKey: string): string | null {
  const col = getTableColumns(table)[jsKey];
  return col ? col.name : null;
}

/** Map a drizzle insert object (JS keys) to SQL column names + bind values. */
export function rowToSqlParts(
  table: SQLiteTable<any>,
  row: Record<string, unknown>
): { columns: string[]; placeholders: string[]; values: unknown[] } {
  const cols = getTableColumns(table);
  const columns: string[] = [];
  const placeholders: string[] = [];
  const values: unknown[] = [];

  for (const [jsKey, value] of Object.entries(row)) {
    if (value === undefined) continue;
    const col = cols[jsKey];
    if (!col) continue;
    columns.push(col.name);
    placeholders.push('?');
    values.push(encodeCell(col.name, value));
  }

  return { columns, placeholders, values };
}

export function buildInsertSql(table: SQLiteTable<any>, row: Record<string, unknown>): { sql: string; params: unknown[] } {
  const { columns, placeholders, values } = rowToSqlParts(table, row);
  const sql = `INSERT INTO ${tableSqlName(table)} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  return { sql, params: values };
}

export function buildUpdateByIdSql(
  table: SQLiteTable<any>,
  id: string | number,
  row: Record<string, unknown>
): { sql: string; params: unknown[] } {
  const { columns, values } = rowToSqlParts(table, row);
  const sets = columns.map((c) => `${c} = ?`).join(', ');
  const idCol = columnSqlName(table, 'id');
  if (!idCol) {
    throw new Error(`[vault-sql] Table ${tableSqlName(table)} has no id column.`);
  }
  return {
    sql: `UPDATE ${tableSqlName(table)} SET ${sets} WHERE ${idCol} = ?`,
    params: [...values, id]
  };
}

export function buildDeleteByIdSql(table: SQLiteTable<any>, id: string | number): { sql: string; params: unknown[] } {
  const idCol = columnSqlName(table, 'id');
  if (!idCol) {
    throw new Error(`[vault-sql] Table ${tableSqlName(table)} has no id column.`);
  }
  return {
    sql: `DELETE FROM ${tableSqlName(table)} WHERE ${idCol} = ?`,
    params: [id]
  };
}

export function buildDeleteWhereSql(
  table: SQLiteTable<any>,
  columnKey: string,
  value: string | number
): { sql: string; params: unknown[] } {
  const sqlCol = columnSqlName(table, columnKey);
  if (!sqlCol) {
    throw new Error(`[vault-sql] Column "${columnKey}" not found on ${tableSqlName(table)}.`);
  }
  return {
    sql: `DELETE FROM ${tableSqlName(table)} WHERE ${sqlCol} = ?`,
    params: [value]
  };
}

export function buildSelectByIdSql(table: SQLiteTable<any>, id: string | number): { sql: string; params: unknown[] } {
  const idCol = columnSqlName(table, 'id');
  if (!idCol) {
    throw new Error(`[vault-sql] Table ${tableSqlName(table)} has no id column.`);
  }
  return {
    sql: `SELECT * FROM ${tableSqlName(table)} WHERE ${idCol} = ? LIMIT 1`,
    params: [id]
  };
}

export function buildSelectAllSql(
  table: SQLiteTable<any>,
  contextId?: string | number
): { sql: string; params: unknown[] } {
  const setIdCol =
    columnSqlName(table, 'setId') ?? columnSqlName(table, 'set_id');
  if (contextId !== undefined && contextId !== 'all' && setIdCol) {
    return {
      sql: `SELECT * FROM ${tableSqlName(table)} WHERE ${setIdCol} = ?`,
      params: [String(contextId)]
    };
  }
  return { sql: `SELECT * FROM ${tableSqlName(table)}`, params: [] };
}

/** Convert a better-sqlite3 / raw row (SQL names) into drizzle-shaped keys + parsed JSON. */
export function mapSqlRowToJs(table: SQLiteTable<any>, raw: Record<string, unknown>): Record<string, unknown> {
  const cols = getTableColumns(table);
  const out: Record<string, unknown> = {};
  for (const [jsKey, col] of Object.entries(cols)) {
    const sqlName = (col as { name: string }).name;
    let value = raw[sqlName];
    if (value === undefined && raw[jsKey] !== undefined) {
      value = raw[jsKey];
    }
    out[jsKey] = decodeCell(sqlName, value);
  }
  return out;
}

function encodeCell(sqlName: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (JSON_SQL_COLUMNS.has(sqlName) && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

function decodeCell(sqlName: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (JSON_SQL_COLUMNS.has(sqlName) && typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}
