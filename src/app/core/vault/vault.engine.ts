import { InjectionToken, Injector } from '@angular/core';

export interface OutboxEnvelope {
  entityType: 'set' | 'deck';
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
}

export interface SyncQueueItem {
  id: number;
  entityType: 'set' | 'deck';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
  createdAt: string;
}

/** Platform vault host: bootstrap DB, queue ops, flush. */
export abstract class VaultEngine {
  abstract bootstrap(injector: Injector): Promise<void>;
  abstract getPendingSyncItems(): Promise<SyncQueueItem[]>;
  abstract clearSyncItemsBatch(ids: number[]): Promise<void>;
  /** Upserts an outbox row so later mutations for the same entity squash earlier ones. */
  abstract enqueueSyncItem(envelope: OutboxEnvelope): Promise<void>;
}

export const VAULT_ENGINE_TOKEN = new InjectionToken<VaultEngine>('VAULT_ENGINE_TOKEN');
