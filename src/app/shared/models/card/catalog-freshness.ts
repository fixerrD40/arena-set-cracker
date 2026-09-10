import { MtgCard } from './card';

const PRINTED_BODY = /\b(?:Creature|Vehicle)\b/;

export function isPrintedBodyCard(card: MtgCard): boolean {
  return PRINTED_BODY.test(card.typeLine);
}

/**
 * True when this catalog was written before keywords/power/toughness were stored.
 * Creatures and vehicles always have a printed power on Scryfall; empty on every
 * body means the 0001 defaults, not a real set.
 */
export function catalogNeedsRefresh(cards: readonly MtgCard[]): boolean {
  const bodies = cards.filter(isPrintedBodyCard);
  if (bodies.length > 0) {
    return bodies.every((card) => !card.power);
  }
  return cards.length >= 3 && cards.every((card) => (card.keywords?.length ?? 0) === 0);
}
