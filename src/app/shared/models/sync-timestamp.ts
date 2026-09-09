/** ISO clocks for cloud sync. Missing/null updatedAt loses; mergeBaseUpdatedAt is the hydrate merge-base tip. */
export const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

export function nowIso(): string {
  return new Date().toISOString();
}

/** Raw clock for compare; blank/missing → epoch (loses every contest). */
export function entityUpdatedAtOrEpoch(entity: { updatedAt?: string | null }): string {
  const raw = entity.updatedAt?.trim();
  return raw || EPOCH_ISO;
}

export function mergeBaseOrNull(mergeBaseUpdatedAt?: string | null): string | null {
  const raw = mergeBaseUpdatedAt?.trim();
  return raw || null;
}

/**
 * Hydrate decision from merge-base (git-style fast-forward).
 * No base yet → 2-way bootstrap (never conflict until we have a base).
 * Both dirty vs base → conflict (decks: yours/theirs UI).
 */
export type HydrateDecision = 'take-theirs' | 'keep-yours' | 'conflict' | 'noop';

export function classifyHydrate(args: {
  hasLocal: boolean;
  localUpdatedAt?: string | null;
  mergeBaseUpdatedAt?: string | null;
  cloudUpdatedAt?: string | null;
}): HydrateDecision {
  if (!args.hasLocal) {
    return 'take-theirs';
  }

  const local = entityUpdatedAtOrEpoch({ updatedAt: args.localUpdatedAt });
  const cloud = entityUpdatedAtOrEpoch({ updatedAt: args.cloudUpdatedAt });
  if (local === cloud) {
    return 'noop';
  }

  const base = mergeBaseOrNull(args.mergeBaseUpdatedAt);
  if (!base) {
    return local > cloud ? 'keep-yours' : 'take-theirs';
  }

  const localDirty = local > base;
  const cloudDirty = cloud > base;
  if (localDirty && cloudDirty) {
    return 'conflict';
  }
  if (cloudDirty) {
    return 'take-theirs';
  }
  if (localDirty) {
    return 'keep-yours';
  }
  return 'noop';
}
