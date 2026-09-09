import { inject, Injector } from '@angular/core';
import { AppConfigService } from './config.service';
import { SyncService } from '../services/sync.service';
import { DeckConflictService } from '../services/deck-conflict.service';
import { VAULT_ENGINE_TOKEN } from '../vault/vault.engine';

/** Loads config, bootstraps the vault engine, then starts the sync listener. */
export function runConfigAndStorageInitialization(): Promise<void> {
  console.log('[ConfigInitializer] Booting...');

  const configService = inject(AppConfigService);
  const injector = inject(Injector);

  return (async () => {
    try {
      const runtimeConfig = await configService.load();
      console.log(`[ConfigInitializer] Settings loaded. Server: ${runtimeConfig.baseUrl}`);

      const vaultEngine = injector.get(VAULT_ENGINE_TOKEN);
      console.log(`[ConfigInitializer] Bootstrapping vault (${runtimeConfig.platform})...`);
      await vaultEngine.bootstrap(injector);

      const syncService = injector.get(SyncService);
      syncService.initializeEngine();
      injector.get(DeckConflictService).refresh().subscribe();

      console.log('[ConfigInitializer] Startup complete.');
    } catch (error) {
      console.error('[ConfigInitializer] Startup failed:', error);
      throw error;
    }
  })();
}
