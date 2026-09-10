import { collectionColors } from '../card/arena-collection.filter';
import { MtgCard } from '../card/card';
import { ConcentratedPattern } from './concentration';
import { cardMatchesOracleTheme } from './theme-match';

const SIGNPOST_RARITIES = new Set(['uncommon', 'rare', 'mythic']);

export interface EmergentPattern extends ConcentratedPattern {
  scopedCount: number;
  lift: number;
  goldCount: number;
}

export function isGoldSignpost(card: MtgCard): boolean {
  return SIGNPOST_RARITIES.has(card.rarity) && collectionColors(card).length >= 2;
}

/** Re-score catalog chips against the color-scoped remaining pool. */
export function emergePatterns(
  patterns: readonly ConcentratedPattern[],
  scoped: readonly MtgCard[],
  rankByLift: boolean
): EmergentPattern[] {
  if (scoped.length === 0) {
    return [];
  }

  const emerged: EmergentPattern[] = [];
  for (const pattern of patterns) {
    if (pattern.cardCount <= 0 || pattern.poolSize <= 0) {
      continue;
    }
    const matches = scoped.filter((card) => cardMatchesOracleTheme(card, pattern.phrase));
    if (matches.length === 0) {
      continue;
    }
    const scopedShare = matches.length / scoped.length;
    const setShare = pattern.cardCount / pattern.poolSize;
    emerged.push({
      ...pattern,
      scopedCount: matches.length,
      lift: scopedShare / setShare,
      goldCount: matches.filter(isGoldSignpost).length
    });
  }

  if (rankByLift) {
    emerged.sort(
      (a, b) => b.lift - a.lift || b.scopedCount - a.scopedCount || a.phrase.localeCompare(b.phrase)
    );
  }

  return emerged;
}
