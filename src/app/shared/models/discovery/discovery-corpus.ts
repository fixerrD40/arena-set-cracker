import { MtgCard } from '../card/card';
import { subtypesOnTypeLine } from '../card/type-line';
import { foldPlurals, tokenizeNormalizedText } from './oracle-diction';
import { flattenOracleText } from './oracle-parser';

export function discoveryTypeTokens(typeLine: string): string[] {
  const subtypeText = subtypesOnTypeLine(typeLine).join(' ');
  if (!subtypeText.trim()) {
    return [];
  }
  return foldPlurals(tokenizeNormalizedText(subtypeText));
}

/** Parsed oracle only — trigger subjects, condition subjects, leaf effects. */
export function discoveryOracleChunksFromText(
  oracleText: string,
  keywords: readonly string[] = []
): string[][] {
  const { triggers, conditions, effects } = flattenOracleText(oracleText, keywords);
  const chunks: string[][] = [];

  for (const rawText of [...triggers, ...conditions, ...effects]) {
    const normalized = foldPlurals(tokenizeNormalizedText(rawText));
    if (normalized.length > 0) {
      chunks.push(normalized);
    }
  }

  return chunks;
}

export function discoveryOracleChunks(card: MtgCard): string[][] {
  return discoveryOracleChunksFromText(card.oracleText ?? '');
}

/** Trigger and condition subjects only — theme-filter synergy order. */
export function discoveryClauseHaystackTokens(card: MtgCard): string[] {
  return [
    ...discoveryChannelHaystackTokens(card, 'trigger'),
    ...discoveryChannelHaystackTokens(card, 'condition')
  ];
}

export function discoveryChannelHaystackTokens(
  card: MtgCard,
  channel: 'trigger' | 'condition'
): string[] {
  const flat = flattenOracleText(card.oracleText ?? '');
  const raw = channel === 'trigger' ? flat.triggers : flat.conditions;
  const tokens: string[] = [];
  for (const text of raw) {
    tokens.push(...foldPlurals(tokenizeNormalizedText(text)));
  }
  return tokens;
}

/** Subtype tokens as their own chunk — disjoint from oracle ngrams. */
export function discoveryTypeChunk(card: MtgCard): string[] {
  return discoveryTypeTokens(card.typeLine);
}

/** One phrase per printed keyword — `The Ring tempts you` stays one chip. */
export function discoveryKeywordPhrases(card: MtgCard): string[] {
  return (card.keywords ?? [])
    .map((keyword) => foldPlurals(tokenizeNormalizedText(keyword)).join(' '))
    .filter((phrase) => phrase.length > 0);
}

export function cardHasDiscoveryKeyword(card: MtgCard, phrase: string): boolean {
  return discoveryKeywordPhrases(card).includes(phrase.toLowerCase());
}

/** Separate oracle and type chunks; never prefix types onto oracle text. */
export function discoveryTextChunks(card: MtgCard): string[][] {
  const chunks = discoveryOracleChunks(card);
  const typeChunk = discoveryTypeChunk(card);
  if (typeChunk.length > 0) {
    chunks.push(typeChunk);
  }
  for (const phrase of discoveryKeywordPhrases(card)) {
    chunks.push(phrase.split(' '));
  }
  return chunks;
}

/** Oracle tokens for multi-word pattern matching. */
export function patternHaystackTokens(card: MtgCard): string[] {
  return discoveryOracleChunks(card).flat();
}

export function cardHasDiscoveryTypeToken(card: MtgCard, token: string): boolean {
  const needle = token.toLowerCase();
  return discoveryTypeTokens(card.typeLine).includes(needle);
}
