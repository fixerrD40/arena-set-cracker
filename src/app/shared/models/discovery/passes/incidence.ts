import { MtgCard } from '../../card/card';
import {
  cardHasDiscoveryKeyword,
  cardHasDiscoveryTypeToken,
  discoveryChannelHaystackTokens,
  discoveryKeywordPhrases,
  discoveryTypeTokens
} from '../discovery-corpus';
import { CatalogGraphBuilder, IncidenceKind } from '../graph/catalog-graph';
import { phraseKey } from '../graph/phrase-key';
import { phrasePatternTokens } from '../oracle-diction';
import { cardMatchesOracleTheme, tokensMatchPattern } from '../theme-match';

export function oracleIncidence(card: MtgCard, phrase: string): IncidenceKind[] {
  const kinds: IncidenceKind[] = [];
  if (cardHasDiscoveryKeyword(card, phrase)) {
    kinds.push('keyword');
  }
  const pattern = phrasePatternTokens(phrase);
  if (pattern.length === 1 && cardHasDiscoveryTypeToken(card, pattern[0])) {
    kinds.push('type');
  }
  if (channelMatches(card, 'trigger', phrase)) {
    kinds.push('trigger');
  }
  if (channelMatches(card, 'condition', phrase)) {
    kinds.push('condition');
  }
  if (kinds.length === 0 && cardMatchesOracleTheme(card, phrase)) {
    kinds.push('effect');
  }
  return kinds;
}

export function applyIncidence(
  builder: CatalogGraphBuilder,
  catalog: readonly MtgCard[],
  extraPhrases: readonly string[] = []
): CatalogGraphBuilder {
  for (const card of catalog) {
    const cardId = String(card.id);
    builder.addCard(cardId);
    for (const token of discoveryTypeTokens(card.typeLine)) {
      builder.addPhrase(token);
      builder.addEdge({ from: cardId, to: token, kind: 'type' });
    }
    for (const keyword of discoveryKeywordPhrases(card)) {
      builder.addPhrase(keyword);
      builder.addEdge({ from: cardId, to: keyword, kind: 'keyword' });
    }
  }

  const phrases = new Set<string>([...builder.phraseKeys, ...extraPhrases.map(phraseKey).filter(Boolean)]);
  for (const phrase of phrases) {
    for (const card of catalog) {
      const cardId = String(card.id);
      for (const kind of oracleIncidence(card, phrase)) {
        builder.addEdge({ from: cardId, to: phrase, kind });
      }
    }
  }

  return builder;
}

function channelMatches(
  card: MtgCard,
  channel: 'trigger' | 'condition' | 'effect',
  phrase: string
): boolean {
  const haystack = discoveryChannelHaystackTokens(card, channel);
  if (haystack.length === 0) {
    return false;
  }
  const pattern = phrasePatternTokens(phrase);
  return pattern.length > 0 && tokensMatchPattern(haystack, pattern);
}
