import { MtgCard } from '../card/card';
import { SetVocabulary } from '../card/set-vocabulary';
import { CatalogGraph, CatalogGraphBuilder, emptyCatalogGraph } from './graph/catalog-graph';
import { applyHarvest } from './passes/harvest';
import { applyIncidence } from './passes/incidence';
import { applyWarmPair } from './passes/warm-pair';
import { SetCommunity } from './set-community';

export function buildCatalogGraph(
  catalog: readonly MtgCard[],
  vocabulary: readonly SetVocabulary[] = [],
  community: SetCommunity | null = null,
  extraPhrases: readonly string[] = []
): CatalogGraph {
  if (catalog.length === 0 && vocabulary.length === 0) {
    return emptyCatalogGraph();
  }
  const builder = new CatalogGraphBuilder();
  for (const card of catalog) {
    builder.addCard(String(card.id));
  }
  applyHarvest(builder, vocabulary, catalog);
  applyIncidence(builder, catalog, extraPhrases);
  applyWarmPair(builder, community);
  return builder.build();
}

export function vocabularySignature(entries: readonly SetVocabulary[]): string {
  return entries.map((entry) => `${entry.id}\0${entry.oracleText}`).join('\n');
}
