import { CatalogGraphBuilder } from '../graph/catalog-graph';
import {
  COMMUNITY_DECK_FLOOR,
  COMMUNITY_PAIR_TOGETHER_FLOOR,
  SetCommunity
} from '../set-community';

/** Card–card `pair` edges from the set aggregate. No-op when community is thin or absent. */
export function applyWarmPair(
  builder: CatalogGraphBuilder,
  community: SetCommunity | null | undefined
): CatalogGraphBuilder {
  if (!community || community.deckCount < COMMUNITY_DECK_FLOOR) {
    return builder;
  }
  for (const pair of community.pairs) {
    if (pair.together < COMMUNITY_PAIR_TOGETHER_FLOOR) {
      continue;
    }
    builder.addCard(pair.a);
    builder.addCard(pair.b);
    builder.addEdge({
      from: pair.a,
      to: pair.b,
      kind: 'pair',
      together: pair.together,
      lift: pair.lift
    });
    builder.addEdge({
      from: pair.b,
      to: pair.a,
      kind: 'pair',
      together: pair.together,
      lift: pair.lift
    });
  }
  return builder;
}
