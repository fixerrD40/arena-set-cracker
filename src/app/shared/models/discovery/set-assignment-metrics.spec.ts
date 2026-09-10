import { MtgCard } from '../card/card';
import { MtgDeck } from '../deck/deck';
import { computeSetAssignmentMetrics } from './set-assignment-metrics';

function card(id: string, rarity: string): MtgCard {
  return {
    id,
    setId: 'set',
    arenaId: 1,
    scryfallId: id,
    name: id,
    localArtUri: '',
    localIllustrationUri: '',
    typeLine: 'Creature',
    colors: ['G'],
    rarity,
    manaCost: '{1}',
    oracleText: '',
    keywords: [],
    power: '',
    toughness: ''
  };
}

function deck(id: string, cards: Record<string, number>): MtgDeck {
  return {
    id,
    setId: 'set',
    name: id,
    status: 'concept',
    themes: [],
    notes: '',
    coverCardId: null,
    cards: new Map(Object.entries(cards).map(([cardId, qty]) => [cardId, qty]))
  };
}

describe('computeSetAssignmentMetrics', () => {
  const catalog = [card('a', 'common'), card('b', 'rare'), card('c', 'mythic')];

  it('reports unique card usage and set-wide rarity utilization', () => {
    const metrics = computeSetAssignmentMetrics(catalog, [
      deck('main', { a: 4, b: 2 }),
      deck('side', { c: 1 })
    ]);

    expect(metrics.uniqueCardsUsed).toBe(3);
    expect(metrics.totalCatalog).toBe(3);
    expect(metrics.uniqueCardsUsedPct).toBe(100);
    expect(metrics.totalCopiesAssigned).toBe(7);
    expect(metrics.copiesByRarity).toEqual({ common: 4, uncommon: 0, rare: 2, mythic: 1 });
    expect(metrics.uniqueByRarity).toEqual({ common: 1, uncommon: 0, rare: 1, mythic: 1 });
  });
});
