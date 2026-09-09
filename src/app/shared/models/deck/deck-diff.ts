import { cloneDeck, MtgDeck } from './deck';

/**
 * Shared middle: for each card both sides run, the overlapping qty (min).
 * Exact matches land fully here; mismatches leave the excess as a side residual.
 */
export function agreedCardMap(
  yours: Map<string, number>,
  theirs: Map<string, number>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, yq] of yours.entries()) {
    if (yq <= 0) continue;
    const tq = theirs.get(id) || 0;
    const overlap = Math.min(yq, tq);
    if (overlap > 0) {
      out.set(id, overlap);
    }
  }
  return out;
}

/**
 * Side pane residuals: cards that disagreed between `side` and `peer`,
 * showing how many copies of `side` are not yet in `result`.
 */
export function residualSideCardMap(
  side: Map<string, number>,
  peer: Map<string, number>,
  result: Map<string, number>
): Map<string, number> {
  const out = new Map<string, number>();
  const ids = new Set<string>([...side.keys(), ...peer.keys()]);
  for (const id of ids) {
    const s = side.get(id) || 0;
    const p = peer.get(id) || 0;
    if (s === p) {
      continue;
    }
    const rem = s - (result.get(id) || 0);
    if (rem > 0) {
      out.set(id, rem);
    }
  }
  return out;
}

export function deckFromCards(base: MtgDeck, cards: Map<string, number>): MtgDeck {
  return cloneDeck({ ...base, cards: new Map(cards) });
}

/** Initial result: agreed card qtys + yours metadata (status/notes/cover/themes/…). */
export function initialMergeResult(yours: MtgDeck, theirs: MtgDeck): MtgDeck {
  return deckFromCards(yours, agreedCardMap(yours.cards, theirs.cards));
}

export function seedResultFrom(source: MtgDeck): MtgDeck {
  return cloneDeck(source);
}
