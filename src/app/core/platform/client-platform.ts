import { Capacitor } from '@capacitor/core';
import { isElectronRenderer } from './desktop-bridge';

/** Host runtime. Capacitor covers native shells; plain web is browser. */
export type ClientPlatform = 'electron' | 'browser' | 'capacitor';

export function resolveClientPlatform(): ClientPlatform {
  if (isElectronRenderer()) return 'electron';
  if (Capacitor.isNativePlatform()) return 'capacitor';
  return 'browser';
}
