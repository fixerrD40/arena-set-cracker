import { InjectionToken } from '@angular/core';
import { ClientPlatform } from '../platform/client-platform';

export interface ScryfallConfigData {
  apiUrl: string;
  rateLimitDelayMs: number;
  userAgent: string;
}

export interface AppConfigData {
  production: boolean;
  baseUrl: string;       // Cloud backend for outbox sync
  sqliteDbName: string;  // Local desktop DB filename
  scryfall: ScryfallConfigData;
  platform: ClientPlatform;
  /** Convenience for existing electron vs shared-web wiring. */
  isElectron: boolean;
}

export const APP_CONFIG = new InjectionToken<AppConfigData>('APP_CONFIG');
