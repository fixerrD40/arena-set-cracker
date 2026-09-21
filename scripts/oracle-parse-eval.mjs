#!/usr/bin/env node
/**
 * Ephemeral tagger coverage. Dump stays in /tmp — do not commit.
 * Unexplained clusters pause the loop; do not auto-file them as effect.
 *
 *   node scripts/oracle-parse-eval.mjs          # HOB
 *   ORACLE_EVAL_SET=ltr node scripts/oracle-parse-eval.mjs
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SET = (process.env.ORACLE_EVAL_SET || 'hob').toLowerCase();
const DUMP_DIR = '/tmp/oracle-parse-eval';
const DUMP = `${DUMP_DIR}/${SET}.json`;
const SEARCH = `https://api.scryfall.com/cards/search?q=e%3A${encodeURIComponent(SET)}&unique=cards&order=name`;

async function fetchPages(url) {
  const cards = [];
  let next = url;
  while (next) {
    const response = await fetch(next, {
      headers: { Accept: 'application/json', 'User-Agent': 'arena-set-cracker-oracle-eval' }
    });
    if (!response.ok) {
      throw new Error(`Scryfall ${response.status} ${next}`);
    }
    const body = await response.json();
    cards.push(...body.data);
    next = body.has_more ? body.next_page : null;
    if (next) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 80));
    }
  }
  return cards;
}

const raw = await fetchPages(SEARCH);
await mkdir(DUMP_DIR, { recursive: true });
await writeFile(DUMP, JSON.stringify(raw));
console.log(`dumped ${raw.length} ${SET.toUpperCase()} cards to ${DUMP}`);

const child = spawn(
  resolve(root, 'node_modules/.bin/vitest'),
  ['run', 'src/app/shared/models/discovery/oracle-parse-eval.spec.ts'],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ORACLE_EVAL_DUMP: DUMP, ORACLE_EVAL_SET: SET }
  }
);

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
