/**
 * Idempotent ALTERs for vaults that were baselined on 0000 before tip clocks
 * lived in genesis. SQLite has no IF NOT EXISTS for columns; ignore duplicates.
 */
export const TIP_CLOCK_SCHEMA_PATCH_STATEMENTS = [
  `ALTER TABLE sets ADD COLUMN updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
  `ALTER TABLE sets ADD COLUMN merge_base_updated_at text`,
  `ALTER TABLE decks ADD COLUMN updated_at text`,
  `ALTER TABLE decks ADD COLUMN merge_base_updated_at text`,
  `UPDATE sets SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = ''`,
  `UPDATE decks SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = ''`,
  `CREATE TABLE IF NOT EXISTS sync_conflicts (
    id text PRIMARY KEY NOT NULL,
    theirs_payload text NOT NULL,
    theirs_updated_at text,
    created_at text NOT NULL
  )`
] as const;

function isIgnorableSchemaPatchError(message: string): boolean {
  return /duplicate column/i.test(message);
}

export function applyTipClockSchemaPatch(exec: (sql: string) => void): void {
  for (const sql of TIP_CLOCK_SCHEMA_PATCH_STATEMENTS) {
    try {
      exec(sql);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!isIgnorableSchemaPatchError(message)) {
        throw err;
      }
    }
  }
}

export async function applyTipClockSchemaPatchAsync(
  exec: (sql: string) => void | Promise<void>
): Promise<void> {
  for (const sql of TIP_CLOCK_SCHEMA_PATCH_STATEMENTS) {
    try {
      await exec(sql);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!isIgnorableSchemaPatchError(message)) {
        throw err;
      }
    }
  }
}
