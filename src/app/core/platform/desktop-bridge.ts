export interface VaultSqlStatement {
  sql: string;
  params: unknown[];
}

export interface DesktopBridge {
  readonly isElectron: true;
  /** @deprecated Prefer vault* APIs; kept for art tooling only if needed. */
  sqliteRead(fileName: string): Promise<Uint8Array | null>;
  sqliteWrite(fileName: string, data: Uint8Array): Promise<void>;
  artExists(relativePath: string): Promise<boolean>;
  artDownload(url: string, destinationPath: string): Promise<void>;
  artRemoveDir(relativePath: string): Promise<void>;
  drizzleBootstrapSql(): Promise<string>;

  vaultOpen(fileName: string): Promise<{ isNew: boolean }>;
  vaultExecSync(sql: string): void;
  vaultRunSync(sql: string, params: unknown[]): void;
  vaultRunBatchSync(statements: VaultSqlStatement[]): void;
  vaultAllSync(sql: string, params: unknown[]): Record<string, unknown>[];
  vaultGetSync(sql: string, params: unknown[]): Record<string, unknown> | null;
}

export function getDesktopBridge(): DesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.desktop;
}

export function isElectronRenderer(): boolean {
  return getDesktopBridge()?.isElectron === true;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}
