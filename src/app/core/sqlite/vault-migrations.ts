/**
 * Vault schema apply: Drizzle’s __drizzle_migrations ledger across hosts.
 * Electron uses the official better-sqlite3 migrator in desktop.js.
 * Browser uses dialect.migrate; Capacitor has no Drizzle session, so apply metas
 * with the same ledger shape (Drizzle contract — not a third-party adapter clone).
 */
import type { MigrationConfig, MigrationMeta } from 'drizzle-orm/migrator';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';

export type { MigrationMeta };

export interface DrizzleJournal {
  entries: Array<{ idx: number; tag: string; when: number; breakpoints?: boolean }>;
}

export interface SqlExecHost {
  exec(sql: string): void | Promise<void>;
  query(
    sql: string
  ):
    | Array<Record<string, unknown> | unknown[]>
    | Promise<Array<Record<string, unknown> | unknown[]>>;
}

function cell(
  row: Record<string, unknown> | unknown[],
  key: string,
  index: number
): unknown {
  if (Array.isArray(row)) {
    return row[index];
  }
  return row[key] ?? row[key.toLowerCase()];
}

async function maybeAwait(result: void | Promise<void>): Promise<void> {
  await result;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Same shape readMigrationFiles builds (hash = sha256 of full .sql file). */
export async function loadMigrationMetasFromFetch(
  basePath = 'drizzle'
): Promise<MigrationMeta[]> {
  const journalResponse = await fetch(`${basePath}/meta/_journal.json`);
  if (!journalResponse.ok) {
    throw new Error('[vault-migrations] drizzle/meta/_journal.json missing.');
  }
  const journal = (await journalResponse.json()) as DrizzleJournal;
  const entries = [...(journal.entries || [])].sort((a, b) => a.idx - b.idx);
  if (entries.length === 0) {
    throw new Error('[vault-migrations] Drizzle journal has no entries.');
  }

  const migrations: MigrationMeta[] = [];
  for (const entry of entries) {
    const response = await fetch(`${basePath}/${entry.tag}.sql`);
    if (!response.ok) {
      throw new Error(`[vault-migrations] Missing migration file: ${entry.tag}.sql`);
    }
    const query = await response.text();
    migrations.push({
      sql: query.split('--> statement-breakpoint'),
      bps: entry.breakpoints ?? true,
      folderMillis: entry.when,
      hash: await sha256Hex(query)
    });
  }
  return migrations;
}

/** community-sqlite connection as SqlExecHost (migrate owns BEGIN/COMMIT). */
export function sqlHostFromCapacitor(db: SQLiteDBConnection): SqlExecHost {
  return {
    exec: async (sql: string) => {
      const trimmed = sql.trim().toUpperCase();
      if (trimmed === 'BEGIN' || trimmed === 'BEGIN TRANSACTION') {
        await db.beginTransaction();
        return;
      }
      if (trimmed === 'COMMIT') {
        await db.commitTransaction();
        return;
      }
      if (trimmed === 'ROLLBACK') {
        await db.rollbackTransaction();
        return;
      }
      await db.execute(sql, false);
    },
    query: async (sql: string) => {
      const result = await db.query(sql);
      const values = result.values;
      if (!values?.length) {
        return [];
      }
      return values.filter((row) => row && typeof row === 'object') as Array<
        Record<string, unknown>
      >;
    }
  };
}

/**
 * Pre-seed __drizzle_migrations for vaults that already have schema from before the ledger.
 * Seeds only 0000 when `sets` exists so CREATE TABLE is not re-run.
 * Dev vaults stuck mid-alter: wipe the local DB and let 0000 recreate.
 */
export async function baselineLegacyDrizzleMigrations(
  host: SqlExecHost,
  migrations: MigrationMeta[]
): Promise<void> {
  await maybeAwait(
    host.exec(`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash text NOT NULL,
        created_at numeric
      )
    `)
  );

  const existing = await host.query(
    `SELECT hash FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1`
  );
  if (existing.length > 0) {
    return;
  }

  const sets = await host.query(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sets'`
  );
  if (sets.length === 0 || migrations.length === 0) {
    return;
  }

  await maybeAwait(
    host.exec(
      `INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('${migrations[0].hash}', ${migrations[0].folderMillis})`
    )
  );
}

/**
 * Apply loaded metas the same way Drizzle’s SQLite migrators do (hash + folderMillis).
 * Used where there is no official driver session (Capacitor).
 */
export async function applyMigrationMetas(
  host: SqlExecHost,
  migrations: MigrationMeta[],
  migrationsTable = '__drizzle_migrations'
): Promise<void> {
  await maybeAwait(
    host.exec(`
      CREATE TABLE IF NOT EXISTS ${migrationsTable} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash text NOT NULL,
        created_at numeric
      )
    `)
  );

  const dbMigrations = await host.query(
    `SELECT id, hash, created_at FROM ${migrationsTable} ORDER BY created_at DESC LIMIT 1`
  );
  const last = dbMigrations[0];
  const lastCreatedAt = last ? Number(cell(last, 'created_at', 2)) : undefined;

  for (const migration of migrations) {
    if (lastCreatedAt !== undefined && !(lastCreatedAt < migration.folderMillis)) {
      continue;
    }
    await maybeAwait(host.exec('BEGIN'));
    try {
      for (const stmt of migration.sql) {
        const trimmed = stmt.trim();
        if (trimmed) {
          await maybeAwait(host.exec(trimmed));
        }
      }
      await maybeAwait(
        host.exec(
          `INSERT INTO ${migrationsTable} (hash, created_at) VALUES ('${migration.hash}', ${migration.folderMillis})`
        )
      );
      await maybeAwait(host.exec('COMMIT'));
    } catch (err) {
      await maybeAwait(host.exec('ROLLBACK'));
      throw err;
    }
  }
}

export type DrizzleMigrateDb = {
  dialect: {
    migrate: (migrations: MigrationMeta[], session: unknown, config?: MigrationConfig) => void;
  };
  session: unknown;
};

/** Browser sql.js: official dialect.migrate. */
export function migrateDrizzleSqlite(
  db: DrizzleMigrateDb,
  migrations: MigrationMeta[],
  config: MigrationConfig = { migrationsFolder: 'drizzle' }
): void {
  db.dialect.migrate(migrations, db.session, config);
}
