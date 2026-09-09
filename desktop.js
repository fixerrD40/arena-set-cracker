const { app, BrowserWindow, session, protocol, net, ipcMain } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const Database = require('better-sqlite3');

// Main process. Angular is a guest page; this file is the host.
//
// 1. Origin — register `app` as a real scheme (like https), then load
//    app://localhost/index.html. That is why Scryfall sees a non-null Origin
//    and why <img src="/cached_art/..."> is same-origin instead of file://.
// 2. Files — protocol.handle is the "server" for that origin: dist/ is the app,
//    cached_art/ is the catalog. Chromium asks us for each URL; we return a file.
// 3. Disk — vault (better-sqlite3) and art writes stay here. preload.js is a
//    narrow doorbell (IPC). Path checks exist because the renderer is untrusted
//    once Node is gone.
//
// registerSchemesAsPrivileged must run before app ready.

/** @type {import('better-sqlite3').Database | null} */
let vaultDb = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

const DIST_ROOT = path.join(__dirname, 'dist', 'arena-set-cracker', 'browser');
const APP_ORIGIN = 'app://localhost';

function packagedBaseUrl() {
  try {
    const raw = fs.readFileSync(path.join(DIST_ROOT, 'assets', 'config.json'), 'utf8');
    const base = JSON.parse(raw).baseUrl || '';
    return String(base).replace(/\/$/, '');
  } catch {
    return 'http://localhost:8080';
  }
}

// 'unsafe-inline' styles: Angular/Material. wasm-unsafe-eval: concentration worker / leftover sql.js assets.
// connect/img include packaged baseUrl so release builds can reach the stack EIP (plus localhost for dev).
function appCsp() {
  const api = packagedBaseUrl();
  const connect = ["'self'", 'https://api.scryfall.com', 'http://localhost:8080'];
  const img = ["'self'", 'https://svgs.scryfall.io', 'https://cards.scryfall.io'];
  if (api && !connect.includes(api)) {
    connect.push(api);
    img.push(api);
  }
  return [
    "default-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src ${img.join(' ')}`,
    `connect-src ${connect.join(' ')}`,
    "worker-src 'self' blob:",
    "base-uri 'self'",
    "form-action 'none'"
  ].join('; ');
}

function requireVaultDb() {
  if (!vaultDb) {
    throw new Error('[desktop] Vault database is not open.');
  }
  return vaultDb;
}

function syncReturn(event, fn) {
  try {
    event.returnValue = { ok: true, value: fn() };
  } catch (err) {
    event.returnValue = {
      ok: false,
      error: err && err.message ? String(err.message) : String(err)
    };
  }
}

async function fetchLocalFile(filePath, { html } = {}) {
  const response = await net.fetch(pathToFileURL(filePath).href);
  if (!html) {
    return response;
  }
  let page = await response.text();
  page = page.replace('<base href="./">', '<base href="/">');
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Content-Security-Policy', appCsp());
  return new Response(page, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function resolveUnder(root, relativePosix) {
  const cleaned = String(relativePosix || '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/');
  if (!cleaned || cleaned.includes('..')) {
    return null;
  }
  const abs = path.normalize(path.join(root, ...cleaned.split('/')));
  const fromRoot = path.relative(root, abs);
  if (!fromRoot || fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) {
    return null;
  }
  return abs;
}

function assertSqliteFileName(fileName) {
  if (typeof fileName !== 'string' || !fileName || /[\\/]/.test(fileName) || fileName.includes('..')) {
    throw new Error('[desktop] Invalid sqlite file name.');
  }
  return path.join(process.cwd(), fileName);
}

function assertCachedArtPath(relativePath) {
  const posix = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!posix.startsWith('cached_art/')) {
    throw new Error('[desktop] Path is outside cached_art.');
  }
  const abs = resolveUnder(process.cwd(), posix);
  if (!abs) {
    throw new Error('[desktop] Invalid art path.');
  }
  return abs;
}

function resolveDrizzleFolder() {
  const dirs = [
    path.join(process.cwd(), 'public', 'drizzle'),
    path.join(DIST_ROOT, 'drizzle')
  ];
  for (const dir of dirs) {
    if (fs.existsSync(path.join(dir, 'meta', '_journal.json'))) {
      return dir;
    }
  }
  throw new Error('[desktop] Missing drizzle migrations folder.');
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function readJournalEntries(folder) {
  const journal = JSON.parse(fs.readFileSync(path.join(folder, 'meta', '_journal.json'), 'utf8'));
  return [...(journal.entries || [])].sort((a, b) => a.idx - b.idx);
}

function migrationMetaForEntry(folder, entry) {
  const query = fs.readFileSync(path.join(folder, `${entry.tag}.sql`), 'utf8');
  return {
    hash: sha256Hex(query),
    folderMillis: entry.when
  };
}

/** Seed __drizzle_migrations for vaults created before the ledger existed. */
function baselineLegacyDrizzleMigrations(folder) {
  const db = requireVaultDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    )
  `);
  const last = db.prepare(
    'SELECT hash FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1'
  ).get();
  if (last) {
    return;
  }
  const sets = db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sets'`
  ).get();
  if (!sets) {
    return;
  }
  const entries = readJournalEntries(folder);
  if (!entries.length) {
    return;
  }
  const first = migrationMetaForEntry(folder, entries[0]);
  db.prepare(
    'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)'
  ).run(first.hash, first.folderMillis);
}

/** Keep in sync with src/app/core/sqlite/schema-patches.ts */
const TIP_CLOCK_SCHEMA_PATCH_STATEMENTS = [
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
];

function applyTipClockSchemaPatch() {
  const db = requireVaultDb();
  for (const sql of TIP_CLOCK_SCHEMA_PATCH_STATEMENTS) {
    try {
      db.exec(sql);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/duplicate column/i.test(message)) {
        throw err;
      }
    }
  }
}

function migrateVaultWithDrizzle() {
  const folder = resolveDrizzleFolder();
  baselineLegacyDrizzleMigrations(folder);
  const { drizzle } = require('drizzle-orm/better-sqlite3');
  const { migrate } = require('drizzle-orm/better-sqlite3/migrator');
  migrate(drizzle(requireVaultDb()), { migrationsFolder: folder });
  applyTipClockSchemaPatch();
}

function registerIpc() {
  ipcMain.handle('desktop:sqliteRead', (_event, fileName) => {
    const abs = assertSqliteFileName(fileName);
    if (!fs.existsSync(abs)) {
      return null;
    }
    return fs.readFileSync(abs);
  });

  ipcMain.handle('desktop:sqliteWrite', (_event, fileName, data) => {
    const abs = assertSqliteFileName(fileName);
    fs.writeFileSync(abs, Buffer.from(data));
  });

  ipcMain.handle('desktop:artExists', (_event, relativePath) => {
    const abs = assertCachedArtPath(relativePath);
    return fs.existsSync(abs);
  });

  ipcMain.handle('desktop:artDownload', async (_event, url, destinationPath) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('[desktop] Invalid download URL.');
    }
    const abs = assertCachedArtPath(destinationPath);
    const response = await net.fetch(url);
    if (!response.ok) {
      throw new Error(`CDN network link HTTP asset error: ${response.statusText}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, bytes);
  });

  ipcMain.handle('desktop:artRemoveDir', (_event, relativePath) => {
    const abs = assertCachedArtPath(relativePath);
    if (fs.existsSync(abs)) {
      fs.rmSync(abs, { recursive: true, force: true });
    }
  });

  ipcMain.handle('desktop:vaultMigrate', () => {
    migrateVaultWithDrizzle();
    return null;
  });

  ipcMain.handle('desktop:vaultOpen', (_event, fileName) => {
    const abs = assertSqliteFileName(fileName);
    const isNew = !fs.existsSync(abs);
    if (vaultDb) {
      try {
        vaultDb.close();
      } catch {
        /* ignore */
      }
      vaultDb = null;
    }
    vaultDb = new Database(abs);
    vaultDb.pragma('foreign_keys = ON');
    return { isNew };
  });

  ipcMain.on('desktop:vaultExecSync', (event, sql) => {
    syncReturn(event, () => {
      requireVaultDb().exec(String(sql || ''));
      return null;
    });
  });

  ipcMain.on('desktop:vaultRunSync', (event, sql, params) => {
    syncReturn(event, () => {
      const db = requireVaultDb();
      const binds = Array.isArray(params) ? params : [];
      db.prepare(String(sql || '')).run(...binds);
      return null;
    });
  });

  ipcMain.on('desktop:vaultRunBatchSync', (event, statements) => {
    syncReturn(event, () => {
      const db = requireVaultDb();
      const list = Array.isArray(statements) ? statements : [];
      const runBatch = db.transaction((batch) => {
        for (const item of batch) {
          const binds = Array.isArray(item?.params) ? item.params : [];
          db.prepare(String(item?.sql || '')).run(...binds);
        }
      });
      runBatch(list);
      return null;
    });
  });

  ipcMain.on('desktop:vaultAllSync', (event, sql, params) => {
    syncReturn(event, () => {
      const db = requireVaultDb();
      const binds = Array.isArray(params) ? params : [];
      return db.prepare(String(sql || '')).all(...binds);
    });
  });

  ipcMain.on('desktop:vaultGetSync', (event, sql, params) => {
    syncReturn(event, () => {
      const db = requireVaultDb();
      const binds = Array.isArray(params) ? params : [];
      return db.prepare(String(sql || '')).get(...binds) ?? null;
    });
  });
}

async function handleAppRequest(request) {
  const url = new URL(request.url);
  if (url.host !== 'localhost') {
    return new Response('bad host', { status: 400 });
  }

  let pathname = decodeURIComponent(url.pathname || '/');
  if (pathname === '/') {
    pathname = '/index.html';
  }

  if (pathname.startsWith('/cached_art/')) {
    let filePath;
    try {
      filePath = assertCachedArtPath(pathname);
    } catch {
      return new Response('forbidden', { status: 403 });
    }
    if (!fs.existsSync(filePath)) {
      return new Response('not found', { status: 404 });
    }
    return fetchLocalFile(filePath);
  }

  const distFile = resolveUnder(DIST_ROOT, pathname);
  if (distFile && fs.existsSync(distFile)) {
    return fetchLocalFile(distFile, { html: path.extname(distFile) === '.html' });
  }

  const ext = path.extname(pathname);
  if (ext && ext !== '.html') {
    return new Response('not found', { status: 404 });
  }

  return fetchLocalFile(path.join(DIST_ROOT, 'index.html'), { html: true });
}

function createWindow() {
  // Keep Chromium's Electron token in the UA; append a Scryfall-identifiable suffix.
  const scryfallTag = 'MtgVaultApp/1.0.0 (stafford.hank@gmail.com)';
  const sessionUA = session.defaultSession.getUserAgent();
  if (!sessionUA.includes('MtgVaultApp')) {
    session.defaultSession.setUserAgent(`${sessionUA} ${scryfallTag}`);
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (!app.isPackaged) {
    win.webContents.openDevTools();
  }
  win.loadURL(`${APP_ORIGIN}/index.html`);
}

app.whenReady().then(() => {
  registerIpc();
  protocol.handle('app', handleAppRequest);
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
