import { MtgCard } from '../card/card';
import { compareArenaCollection } from '../card/arena-collection.filter';
import {
  cardHasDiscoveryKeyword,
  cardHasDiscoveryTypeToken,
  discoveryChannelHaystackTokens
} from './discovery-corpus';
import { cardMatchesOracleTheme, tokensMatchPattern } from './theme-match';
import { phrasePatternTokens } from './oracle-diction';
import { VocabularyExpansion, vocabularyPhraseKey } from './vocabulary-expansion';

export type ThemeLane = 'wants' | 'needs' | 'is' | 'says';

export const THEME_LANE_ORDER: readonly ThemeLane[] = ['wants', 'needs', 'is', 'says'];

export const THEME_LANE_LABEL: Record<ThemeLane, string> = {
  wants: 'Wants',
  needs: 'Needs',
  is: 'Is',
  says: 'Says'
};

export interface ThemeLaneColumn<T extends { card: MtgCard } = { card: MtgCard }> {
  lane: ThemeLane;
  label: string;
  cards: T[];
}

export function themeLanesForCard(
  card: MtgCard,
  phrase: string,
  expansion?: VocabularyExpansion | null
): ThemeLane[] {
  const lanes: ThemeLane[] = [];
  if (cardHasDiscoveryKeyword(card, phrase)) {
    lanes.push('says');
  }
  const pattern = phrasePatternTokens(phrase);
  if (pattern.length === 1 && cardHasDiscoveryTypeToken(card, pattern[0])) {
    lanes.push('is');
  }
  if (channelMatches(card, 'trigger', phrase, expansion)) {
    lanes.push('wants');
  }
  if (channelMatches(card, 'condition', phrase, expansion)) {
    lanes.push('needs');
  }
  if (lanes.length === 0 && cardMatchesOracleTheme(card, phrase, expansion)) {
    lanes.push('says');
  }
  return lanes;
}

export function buildThemeLaneColumns<T extends { card: MtgCard }>(
  lines: readonly T[],
  phrase: string,
  expansion?: VocabularyExpansion | null
): ThemeLaneColumn<T>[] {
  const buckets: Record<ThemeLane, T[]> = {
    wants: [],
    needs: [],
    is: [],
    says: []
  };
  const seen: Record<ThemeLane, Set<string>> = {
    wants: new Set(),
    needs: new Set(),
    is: new Set(),
    says: new Set()
  };

  for (const line of lines) {
    if (!cardMatchesOracleTheme(line.card, phrase, expansion)) {
      continue;
    }
    for (const lane of themeLanesForCard(line.card, phrase, expansion)) {
      const id = String(line.card.id);
      if (seen[lane].has(id)) {
        continue;
      }
      seen[lane].add(id);
      buckets[lane].push(line);
    }
  }

  return THEME_LANE_ORDER.filter((lane) => buckets[lane].length > 0).map((lane) => ({
    lane,
    label: THEME_LANE_LABEL[lane],
    cards: buckets[lane].sort((a, b) => compareArenaCollection(a.card, b.card))
  }));
}

function channelMatches(
  card: MtgCard,
  channel: 'trigger' | 'condition',
  phrase: string,
  expansion?: VocabularyExpansion | null
): boolean {
  const haystack = discoveryChannelHaystackTokens(card, channel);
  if (haystack.length === 0) {
    return false;
  }
  const pattern = phrasePatternTokens(phrase);
  if (pattern.length > 0 && tokensMatchPattern(haystack, pattern)) {
    return true;
  }
  if (!expansion) {
    return false;
  }
  const chunks = expansion.get(vocabularyPhraseKey(phrase));
  return !!chunks?.some((chunk) => tokensMatchPattern(haystack, chunk));
}
