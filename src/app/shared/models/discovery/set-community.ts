export const COMMUNITY_DECK_FLOOR = 3;
export const COMMUNITY_PAIR_TOGETHER_FLOOR = 2;

export interface CopyBuckets {
  '1': number;
  '2': number;
  '3': number;
  '4+': number;
}

export interface CommunityPair {
  a: string;
  b: string;
  support: number;
  confidenceAb: number;
  confidenceBa: number;
  lift: number;
  together: number;
}

export interface SetCommunity {
  setId: string;
  deckCount: number;
  generatedAt: string;
  copies: Record<string, CopyBuckets>;
  pairs: CommunityPair[];
}

export function emptyCommunity(setId: string): SetCommunity {
  return {
    setId,
    deckCount: 0,
    generatedAt: '',
    copies: {},
    pairs: []
  };
}

export function copyBucketCount(buckets: CopyBuckets | undefined, key: keyof CopyBuckets): number {
  return buckets?.[key] ?? 0;
}

/** Copy count with the most decks; ties prefer the lower count. */
export function histogramPeak(buckets: CopyBuckets | undefined): number | null {
  if (!buckets) {
    return null;
  }
  const ranked: Array<{ copies: number; decks: number }> = [
    { copies: 1, decks: buckets['1'] ?? 0 },
    { copies: 2, decks: buckets['2'] ?? 0 },
    { copies: 3, decks: buckets['3'] ?? 0 },
    { copies: 4, decks: buckets['4+'] ?? 0 }
  ];
  let best = ranked[0];
  for (const entry of ranked.slice(1)) {
    if (entry.decks > best.decks || (entry.decks === best.decks && entry.copies < best.copies)) {
      best = entry;
    }
  }
  return best.decks > 0 ? best.copies : null;
}
