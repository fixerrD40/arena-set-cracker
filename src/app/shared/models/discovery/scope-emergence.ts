import { COLLECTION_RARITIES, CollectionRarity, collectionColors } from '../card/arena-collection.filter';
import { MtgCard } from '../card/card';
import { ConcentratedPattern } from './concentration';
import { CatalogGraph } from './graph/catalog-graph';
import { cardLocksPhrase } from './theme-lanes';
import { cardMatchesOracleTheme } from './theme-match';

const SIGNPOST_RARITIES = new Set<CollectionRarity>(['uncommon', 'rare', 'mythic']);

export type NeedsRarity = Exclude<CollectionRarity, 'common'>;

export interface EmergentPattern extends ConcentratedPattern {
  scopedCount: number;
  lift: number;
  goldCount: number;
  needsRarity: NeedsRarity | null;
}

const RARITY_RANK: Record<CollectionRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  mythic: 3
};

export function isGoldSignpost(card: MtgCard): boolean {
  return SIGNPOST_RARITIES.has(normalizeRarity(card.rarity)) && collectionColors(card).length >= 2;
}

function isLockMulticolor(
  card: MtgCard,
  phrase: string,
  graph?: CatalogGraph | null
): boolean {
  return cardLocksPhrase(card, phrase, graph) && collectionColors(card).length >= 2;
}

/** Highest print rarity among lock-set cards. Common does not stamp. */
export function stampNeedsRarity(
  matches: readonly MtgCard[],
  phrase: string,
  graph?: CatalogGraph | null
): NeedsRarity | null {
  let best: NeedsRarity | null = null;
  let bestRank = 0;
  for (const card of matches) {
    if (!cardLocksPhrase(card, phrase, graph)) {
      continue;
    }
    const rarity = normalizeRarity(card.rarity);
    if (rarity === 'common') {
      continue;
    }
    const rank = RARITY_RANK[rarity];
    if (rank > bestRank) {
      bestRank = rank;
      best = rarity;
    }
  }
  return best;
}

function normalizeRarity(value: string): CollectionRarity {
  return COLLECTION_RARITIES.includes(value as CollectionRarity)
    ? (value as CollectionRarity)
    : 'common';
}

/** Re-score catalog chips against the color-scoped remaining pool. */
export type PatternRankMode = 'concentration' | 'emergence';

export function emergePatterns(
  patterns: readonly ConcentratedPattern[],
  scoped: readonly MtgCard[],
  inColorScope: boolean,
  graph?: CatalogGraph | null,
  rankMode: PatternRankMode = 'concentration'
): EmergentPattern[] {
  if (scoped.length === 0) {
    return [];
  }

  const emerged: EmergentPattern[] = [];
  for (const pattern of patterns) {
    if (pattern.cardCount <= 0 || pattern.poolSize <= 0) {
      continue;
    }
    const matches = scoped.filter((card) => cardMatchesOracleTheme(card, pattern.phrase, graph));
    if (matches.length === 0) {
      continue;
    }
    const scopedShare = matches.length / scoped.length;
    const setShare = pattern.cardCount / pattern.poolSize;
    emerged.push({
      ...pattern,
      scopedCount: matches.length,
      lift: scopedShare / setShare,
      goldCount: matches.some((card) => isLockMulticolor(card, pattern.phrase, graph)) ? 1 : 0,
      needsRarity: stampNeedsRarity(matches, pattern.phrase, graph)
    });
  }

  if (inColorScope) {
    if (rankMode === 'emergence') {
      emerged.sort(
        (a, b) => b.lift - a.lift || b.scopedCount - a.scopedCount || a.phrase.localeCompare(b.phrase)
      );
    } else {
      emerged.sort(
        (a, b) =>
          b.scopedCount - a.scopedCount ||
          b.goldCount - a.goldCount ||
          b.lift - a.lift ||
          a.phrase.localeCompare(b.phrase)
      );
    }
  }

  return emerged;
}
