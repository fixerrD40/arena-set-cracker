import { ApplicationConfig, provideZoneChangeDetection, provideAppInitializer, inject } from '@angular/core';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './routes';
import { runConfigAndStorageInitialization } from './core/config/config.initializer';
import { AppConfigService } from './core/config/config.service';
import { APP_CONFIG } from './core/config/config.model';
import { tokenInterceptor } from './core/interceptors/token-interceptor';

import { VAULT_ENGINE_TOKEN } from './core/vault/vault.engine';
import { ElectronVaultEngine } from './core/sqlite/electron.vault.engine';
import { BrowserVaultEngine } from './core/sqlite/browser.vault.engine';
import { CapacitorVaultEngine } from './core/sqlite/capacitor.vault.engine';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withXhr(), withInterceptors([tokenInterceptor])),
    provideRouter(routes),

    {
      provide: APP_CONFIG,
      useFactory: () => inject(AppConfigService).config
    },

    {
      provide: VAULT_ENGINE_TOKEN,
      useFactory: () => {
        const config = inject(APP_CONFIG);
        switch (config.platform) {
          case 'electron':
            return inject(ElectronVaultEngine);
          case 'capacitor':
            return inject(CapacitorVaultEngine);
          default:
            return inject(BrowserVaultEngine);
        }
      }
    },

    provideAppInitializer(async () => {
      await runConfigAndStorageInitialization();
    })
  ]
};
