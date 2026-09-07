import { inject, Injector } from '@angular/core';
import { AppConfigService } from './config.service';
import { SyncService } from '../services/sync.service';
import { SQLITE_ENGINE_TOKEN } from '../sqlite/sqlite.engine';

/** Loads config, bootstraps the vault engine, then starts the sync listener. */
export function runConfigAndStorageInitialization(): Promise<void> {
  console.log('[ConfigInitializer] Booting...');

  const configService = inject(AppConfigService);
  const injector = inject(Injector);

  return (async () => {
    try {
      const runtimeConfig = await configService.load();
      console.log(`[ConfigInitializer] Settings loaded. Server: ${runtimeConfig.baseUrl}`);

      const sqliteEngine = injector.get(SQLITE_ENGINE_TOKEN);
      console.log(
        runtimeConfig.isElectron
          ? '[ConfigInitializer] Bootstrapping desktop storage...'
          : '[ConfigInitializer] Bootstrapping browser WASM storage...'
      );
      await sqliteEngine.bootstrap(injector);

      const syncService = injector.get(SyncService);
      syncService.initializeEngine();

      console.log('[ConfigInitializer] Startup complete.');
    } catch (error) {
      console.error('[ConfigInitializer] Startup failed:', error);
      throw error;
    }
  })();
}
