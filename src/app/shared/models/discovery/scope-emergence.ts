import { COLLECTION_RARITIES, CollectionRarity, collectionColors } from '../card/arena-collection.filter';
import { MtgCard } from '../card/card';
import { ConcentratedPattern } from './concentration';
import { themeLanesForCard } from './theme-lanes';
import { cardMatchesOracleTheme } from './theme-match';
import { VocabularyExpansion } from './vocabulary-expansion';

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

/** Highest print rarity among cards that join this phrase on Needs. Common does not stamp. */
export function stampNeedsRarity(
  matches: readonly MtgCard[],
  phrase: string,
  expansion?: VocabularyExpansion | null
): NeedsRarity | null {
  let best: NeedsRarity | null = null;
  let bestRank = 0;
  for (const card of matches) {
    if (!themeLanesForCard(card, phrase, expansion).includes('needs')) {
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
export function emergePatterns(
  patterns: readonly ConcentratedPattern[],
  scoped: readonly MtgCard[],
  rankByLift: boolean,
  expansion?: VocabularyExpansion | null
): EmergentPattern[] {
  if (scoped.length === 0) {
    return [];
  }

  const emerged: EmergentPattern[] = [];
  for (const pattern of patterns) {
    if (pattern.cardCount <= 0 || pattern.poolSize <= 0) {
      continue;
    }
    const matches = scoped.filter((card) => cardMatchesOracleTheme(card, pattern.phrase, expansion));
    if (matches.length === 0) {
      continue;
    }
    const scopedShare = matches.length / scoped.length;
    const setShare = pattern.cardCount / pattern.poolSize;
    emerged.push({
      ...pattern,
      scopedCount: matches.length,
      lift: scopedShare / setShare,
      goldCount: matches.filter(isGoldSignpost).length,
      needsRarity: stampNeedsRarity(matches, pattern.phrase, expansion)
    });
  }

  if (rankByLift) {
    emerged.sort(
      (a, b) => b.lift - a.lift || b.scopedCount - a.scopedCount || a.phrase.localeCompare(b.phrase)
    );
  }

  return emerged;
}
