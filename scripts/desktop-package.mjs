#!/usr/bin/env node
/**
 * Release Electron package with cloud baseUrl.
 * Prefers ARENA_BASE_URL; otherwise `terraform output -raw public_url` from ../arena-set-stack.
 * Restores src/assets/config.json afterward so local browser/dev stay on localhost.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const configPath = path.join(root, 'src', 'assets', 'config.json');
const stackDir = path.resolve(root, '..', 'arena-set-stack');

function resolveBaseUrl() {
  const fromEnv = (process.env.ARENA_BASE_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  try {
    const out = execFileSync('terraform', ['output', '-raw', 'public_url'], {
      cwd: stackDir,
      encoding: 'utf8'
    }).trim();
    if (!out) throw new Error('empty public_url');
    return out.replace(/\/$/, '');
  } catch (err) {
    console.error(
      '[desktop-package] Need ARENA_BASE_URL or a successful terraform apply in ../arena-set-stack.\n',
      err.message || err
    );
    process.exit(1);
  }
}

const original = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(original);
const baseUrl = resolveBaseUrl();

config.baseUrl = baseUrl;
config.production = true;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`[desktop-package] Baking baseUrl=${baseUrl}`);

function restore() {
  fs.writeFileSync(configPath, original);
  console.log('[desktop-package] Restored src/assets/config.json');
}

let exitCode = 0;
try {
  const build = spawnSync('npx', ['ng', 'build', '--configuration', 'production'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (build.status !== 0) {
    exitCode = build.status || 1;
  } else {
    const pack = spawnSync('npx', ['electron-builder', ...process.argv.slice(2)], {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
    exitCode = pack.status || 0;
  }
} finally {
  restore();
}

process.exit(exitCode);
