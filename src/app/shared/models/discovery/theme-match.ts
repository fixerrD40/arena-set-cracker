import { MtgCard } from '../card/card';
import {
  cardHasDiscoveryKeyword,
  cardHasDiscoveryTypeToken,
  discoveryClauseHaystackTokens,
  patternHaystackTokens
} from './discovery-corpus';
import { compareArenaCollection } from '../card/arena-collection.filter';
import { NUM_TOKEN, phrasePatternTokens, tokenizeOracle } from './oracle-diction';
import { VocabularyExpansion, vocabularyPhraseKey } from './vocabulary-expansion';

/** Minimum share of the scoped pool a theme must cover to surface in discovery. */
export const MIN_THEME_POOL_FRACTION = 0.02;

export function minSignificantThemeCards(poolSize: number): number {
  if (poolSize <= 0) {
    return 1;
  }
  return Math.max(3, Math.ceil(poolSize * MIN_THEME_POOL_FRACTION));
}

export function isSignificantThemeMatch(cardCount: number, poolSize: number): boolean {
  return cardCount >= minSignificantThemeCards(poolSize);
}

/** Deck library / attached themes: name, full type line, raw oracle. */
export function discoveryHaystackTokens(card: MtgCard): string[] {
  return tokenizeOracle(`${card.name} ${card.typeLine} ${card.oracleText}`);
}

function patternMatchHaystack(card: MtgCard): string[] {
  return patternHaystackTokens(card);
}

function tokenMatchesPattern(token: string, pattern: string): boolean {
  if (pattern === NUM_TOKEN) {
    return token === NUM_TOKEN || /^\d+$/.test(token);
  }
  if (pattern === '*') {
    return true;
  }
  return token === pattern;
}

export function tokensMatchPattern(haystack: readonly string[], pattern: readonly string[]): boolean {
  if (pattern.length === 0) {
    return true;
  }
  if (haystack.length < pattern.length) {
    return false;
  }

  for (let start = 0; start <= haystack.length - pattern.length; start++) {
    let matched = true;
    for (let i = 0; i < pattern.length; i++) {
      if (!tokenMatchesPattern(haystack[start + i], pattern[i])) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return true;
    }
  }
  return false;
}

export function cardMatchesTheme(
  card: MtgCard,
  phrase: string,
  expansion?: VocabularyExpansion | null
): boolean {
  const pattern = phrasePatternTokens(phrase);
  if (pattern.length === 0) {
    return true;
  }
  const haystack = discoveryHaystackTokens(card);
  return (
    tokensMatchPattern(haystack, pattern) || cardMatchesVocabularyBridge(haystack, phrase, expansion)
  );
}

/** Parsed oracle plus card subtypes — concentration and set-board preview. */
export function cardMatchesOracleTheme(
  card: MtgCard,
  phrase: string,
  expansion?: VocabularyExpansion | null
): boolean {
  const pattern = phrasePatternTokens(phrase);
  if (pattern.length === 0) {
    return true;
  }
  if (cardHasDiscoveryKeyword(card, phrase)) {
    return true;
  }
  if (pattern.length === 1 && cardHasDiscoveryTypeToken(card, pattern[0])) {
    return true;
  }
  const haystack = patternMatchHaystack(card);
  return (
    tokensMatchPattern(haystack, pattern) || cardMatchesVocabularyBridge(haystack, phrase, expansion)
  );
}

export function cardsMatchingTheme(
  cards: readonly MtgCard[],
  phrase: string,
  expansion?: VocabularyExpansion | null
): MtgCard[] {
  const trimmed = phrase.trim();
  if (!trimmed) {
    return [];
  }
  return cards.filter((card) => cardMatchesTheme(card, trimmed, expansion));
}

export function cardsMatchingOracleTheme(
  cards: readonly MtgCard[],
  phrase: string,
  expansion?: VocabularyExpansion | null
): MtgCard[] {
  const trimmed = phrase.trim();
  if (!trimmed) {
    return [];
  }
  return cards.filter((card) => cardMatchesOracleTheme(card, trimmed, expansion));
}

/** Trigger or condition subject shares the theme — not a leaf effect or keyword alone. */
export function cardThemeClauseCoupled(
  card: MtgCard,
  phrase: string,
  expansion?: VocabularyExpansion | null
): boolean {
  const haystack = discoveryClauseHaystackTokens(card);
  if (haystack.length === 0) {
    return false;
  }
  const pattern = phrasePatternTokens(phrase);
  return (
    (pattern.length > 0 && tokensMatchPattern(haystack, pattern)) ||
    cardMatchesVocabularyBridge(haystack, phrase, expansion)
  );
}

/** Clause-coupled cards first; collection order inside each group. */
export function compareThemeFilter(
  a: MtgCard,
  b: MtgCard,
  phrase: string,
  expansion?: VocabularyExpansion | null
): number {
  const coupled =
    Number(cardThemeClauseCoupled(b, phrase, expansion)) -
    Number(cardThemeClauseCoupled(a, phrase, expansion));
  if (coupled !== 0) {
    return coupled;
  }
  return compareArenaCollection(a, b);
}

function cardMatchesVocabularyBridge(
  haystack: readonly string[],
  phrase: string,
  expansion?: VocabularyExpansion | null
): boolean {
  if (!expansion) {
    return false;
  }
  const chunks = expansion.get(vocabularyPhraseKey(phrase));
  if (!chunks) {
    return false;
  }
  return chunks.some((chunk) => tokensMatchPattern(haystack, chunk));
}
