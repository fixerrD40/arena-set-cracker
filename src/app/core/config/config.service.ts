import { Injectable } from '@angular/core';
import { AppConfigData } from './config.model';
import { resolveClientPlatform } from '../platform/client-platform';

@Injectable({
  providedIn: 'root'
})
export class AppConfigService {
  private runtimeConfig!: AppConfigData;

  /**
   * Universal fetch operation capturing your asset payload and merging platform metadata.
   */
  public async load(): Promise<AppConfigData> {
    const platform = resolveClientPlatform();
    const isElectron = platform === 'electron';

    try {
      const response = await fetch('assets/config.json');
      const json = await response.json();

      this.runtimeConfig = {
        production: json.production ?? false,
        baseUrl: json.baseUrl ?? '',
        sqliteDbName: json.sqliteDbName ?? 'app_database.sqlite',
        scryfall: json.scryfall ?? this.getScryfallFallback(),
        platform,
        isElectron
      };
    } catch (error) {
      console.error('Critical Error: Failed to load local configuration file async:', error);
      this.runtimeConfig = {
        production: false,
        baseUrl: '',
        sqliteDbName: 'app_database.sqlite',
        scryfall: this.getScryfallFallback(),
        platform,
        isElectron
      };
    }

    return this.runtimeConfig;
  }

  /**
   * Exposes the single immutable configuration context.
   */
  public get config(): AppConfigData {
    if (!this.runtimeConfig) {
      throw new Error('AppConfigService accessed before runtime configurations were established.');
    }
    return this.runtimeConfig;
  }

  private getScryfallFallback() {
    return {
      apiUrl: 'https://scryfall.com',
      rateLimitDelayMs: 100,
      userAgent: 'MTG-Arena-Set-Sharer/1.0'
    };
  }
}
