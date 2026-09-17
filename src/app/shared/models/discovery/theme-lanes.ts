import { MtgCard } from '../card/card';
import { compareArenaCollection } from '../card/arena-collection.filter';
import { CatalogGraph, IncidenceKind } from './graph/catalog-graph';
import { phraseKey } from './graph/phrase-key';
import { oracleIncidence } from './passes/incidence';

export type ThemeLane = 'wants' | 'needs' | 'is' | 'says';

export const THEME_LANE_ORDER: readonly ThemeLane[] = ['wants', 'needs', 'is', 'says'];

export const THEME_LANE_LABEL: Record<ThemeLane, string> = {
  wants: 'Wants',
  needs: 'Needs',
  is: 'Is',
  says: 'Says'
};

const LANE_FOR_KIND: Record<IncidenceKind, ThemeLane> = {
  trigger: 'wants',
  condition: 'needs',
  type: 'is',
  keyword: 'says',
  effect: 'says'
};

export interface ThemeLaneColumn<T extends { card: MtgCard } = { card: MtgCard }> {
  lane: ThemeLane;
  label: string;
  cards: T[];
}

export function incidenceKindsForCard(
  card: MtgCard,
  phrase: string,
  graph?: CatalogGraph | null
): IncidenceKind[] {
  const key = phraseKey(phrase);
  const fromGraph = graph?.incidenceKinds(String(card.id), key) ?? [];
  if (fromGraph.length > 0) {
    return fromGraph;
  }
  return oracleIncidence(card, phrase);
}

export function themeLanesForCard(
  card: MtgCard,
  phrase: string,
  graph?: CatalogGraph | null
): ThemeLane[] {
  const lanes: ThemeLane[] = [];
  for (const kind of incidenceKindsForCard(card, phrase, graph)) {
    const lane = LANE_FOR_KIND[kind];
    if (!lanes.includes(lane)) {
      lanes.push(lane);
    }
  }
  return lanes;
}

export function cardLocksPhrase(
  card: MtgCard,
  phrase: string,
  graph?: CatalogGraph | null
): boolean {
  return incidenceKindsForCard(card, phrase, graph).some(
    (kind) => kind === 'trigger' || kind === 'condition' || kind === 'effect'
  );
}

export function buildThemeLaneColumns<T extends { card: MtgCard }>(
  lines: readonly T[],
  phrase: string,
  graph?: CatalogGraph | null
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
    if (incidenceKindsForCard(line.card, phrase, graph).length === 0) {
      continue;
    }
    for (const lane of themeLanesForCard(line.card, phrase, graph)) {
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
