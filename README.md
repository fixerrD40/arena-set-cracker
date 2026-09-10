# Arena Set Cracker

Angular frontend for an offline-first **Magic: The Gathering Arena** deck store: install a set, paste Arena exports, and keep decks in local SQLite—**one set in focus** at a time.

Targets: browser (`ng serve`), Electron desktop, and Capacitor mobile.

Agent-oriented project context lives in [`.cursor/rules/`](.cursor/rules/) (always applied in Cursor).

## Prerequisites

- Node.js + npm
- Optional: backend API at `http://localhost:8080` (see `src/assets/config.json`) for login, register, password reset, and cloud sync. Local set install and deck persistence work without it.

## Development server

```bash
npm start
# or: ng serve
```

Open `http://localhost:4200/`.

Local SQLite is bootstrapped in-browser via sql.js + IndexedDB.

## Typical local flow

1. Welcome / create a workspace profile  
2. Library → add a set (Scryfall)  
3. Open the set → **Import / Add Deck** → paste an MTG Arena export for that set  
4. Cards that do not resolve in the focused set are stripped (UI notice); the rest persist across reload  

## Desktop (Electron)

```bash
npm run desktop:run
```

Uses a SQLite file named by `sqliteDbName` in `src/assets/config.json` (default `mtg_vault.db`).

## Build

```bash
npm run build
```

Output: `dist/arena-set-cracker/browser/`

## Database schema (Drizzle)

```bash
npm run db:generate
```

Migrations live in `public/drizzle/`. `db:generate` diffs `sqlite.schema.ts` against the latest journal snapshot; keep that snapshot honest with genesis or the next file will try to rebuild tables the patches already applied.

## Mobile

```bash
npm run mobile:build-android
npm run mobile:build-ios
```

Capacitor `webDir` points at `dist/arena-set-cracker/browser`.

## Layout (short)

| Area | Role |
|------|------|
| `src/app/core/` | Config, SQLite engines, data wire, domain services |
| `src/app/features/` | Routes/UI (library, set, deck, auth) |
| `src/app/shared/` | Models, mappers, Arena utils, shared CSS |
| `public/drizzle/` | SQL migrations |
