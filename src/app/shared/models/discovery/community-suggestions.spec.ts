import { describe, expect, it } from 'vitest';
import { MtgCard } from '../card/card';
import { MtgDeck } from '../deck/deck';
import { joinCommunitySuggestions } from './community-suggestions';
import { buildCatalogGraph } from './build-catalog-graph';
import { SetCommunity } from './set-community';

function card(partial: Partial<MtgCard> & Pick<MtgCard, 'id' | 'name' | 'typeLine'>): MtgCard {
  return {
    setId: 'ltr',
    arenaId: 1,
    collectorNumber: '1',
    scryfallId: partial.id,
    localArtUri: '',
    localIllustrationUri: '',
    colors: ['W'],
    rarity: 'common',
    manaCost: '{W}',
    oracleText: '',
    keywords: [],
    power: '',
    toughness: '',
    ...partial
  };
}

function deck(cards: Record<string, number>): MtgDeck {
  return {
    id: 'd1',
    setId: 'ltr',
    name: 'List',
    status: 'concept',
    themes: [],
    notes: '',
    coverCardId: '',
    cards: new Map(Object.entries(cards))
  };
}

function community(partial: Partial<SetCommunity>): SetCommunity {
  return {
    setId: 'ltr',
    deckCount: 3,
    generatedAt: '',
    copies: {},
    pairs: [],
    ...partial
  };
}

describe('joinCommunitySuggestions', () => {
  const soldier = card({ id: 's', name: 'Soldier', typeLine: 'Creature — Human Soldier', colors: ['W'] });
  const rider = card({ id: 'r', name: 'Rider', typeLine: 'Creature — Human Knight', colors: ['W'] });
  const plains = card({
    id: 'p',
    name: 'Plains',
    typeLine: 'Basic Land — Plains',
    colors: [],
    manaCost: ''
  });
  const mountain = card({
    id: 'm',
    name: 'Mountain',
    typeLine: 'Basic Land — Mountain',
    colors: [],
    manaCost: ''
  });
  const catalog = [soldier, rider, plains, mountain];

  function join(
    doc: SetCommunity,
    list: ReturnType<typeof deck>,
    remaining: MtgCard[]
  ) {
    return joinCommunitySuggestions(doc, list, catalog, remaining, buildCatalogGraph(catalog, [], doc));
  }

  it('keeps pairing and reduce empty below the deck floor', () => {
    const suggestions = join(
      community({
        deckCount: 2,
        pairs: [{ a: 's', b: 'r', support: 1, confidenceAb: 1, confidenceBa: 1, lift: 2, together: 2 }],
        copies: { s: { '1': 0, '2': 0, '3': 0, '4+': 2 } }
      }),
      deck({ s: 4 }),
      [rider]
    );
    expect(suggestions.suggestCard).toBeNull();
    expect(suggestions.suggestReduce).toBeNull();
  });

  it('suggests a remaining card that pairs with the list', () => {
    const suggestions = join(
      community({
        pairs: [{ a: 'r', b: 's', support: 0.6, confidenceAb: 1, confidenceBa: 0.6, lift: 1.5, together: 2 }]
      }),
      deck({ s: 2 }),
      [rider]
    );
    expect(suggestions.suggestCard?.card.id).toBe('r');
    expect(suggestions.suggestCard?.puller.id).toBe('s');
    expect(suggestions.suggestCard?.together).toBe(2);
  });

  it('drops a pair that only appears once', () => {
    const suggestions = join(
      community({
        pairs: [{ a: 'r', b: 's', support: 0.3, confidenceAb: 1, confidenceBa: 0.3, lift: 9, together: 1 }]
      }),
      deck({ s: 2 }),
      [rider]
    );
    expect(suggestions.suggestCard).toBeNull();
  });

  it('suggests reduce when copies sit above the peak', () => {
    const suggestions = join(
      community({
        copies: { s: { '1': 3, '2': 0, '3': 0, '4+': 0 } }
      }),
      deck({ s: 4 }),
      []
    );
    expect(suggestions.suggestReduce?.card.id).toBe('s');
    expect(suggestions.suggestReduce?.peak).toBe(1);
    expect(suggestions.suggestReduce?.copies).toBe(4);
  });

  it('ignores basics in pairing and reduce', () => {
    const suggestions = join(
      community({
        pairs: [{ a: 'p', b: 's', support: 1, confidenceAb: 1, confidenceBa: 1, lift: 3, together: 3 }],
        copies: { p: { '1': 0, '2': 0, '3': 0, '4+': 3 } }
      }),
      deck({ s: 1, p: 8 }),
      [plains]
    );
    expect(suggestions.suggestCard).toBeNull();
    expect(suggestions.suggestReduce).toBeNull();
  });

  it('reports missing land pips', () => {
    const suggestions = join(community({ deckCount: 0 }), deck({ s: 2, m: 4 }), []);
    expect(suggestions.colorFix).toEqual({ kind: 'need-fixing', color: 'W' });
  });

  it('reports a land color with no spells', () => {
    const suggestions = join(
      community({ deckCount: 0 }),
      deck({ s: 2, p: 4, m: 2 }),
      []
    );
    expect(suggestions.colorFix).toEqual({ kind: 'cut-color', color: 'R' });
  });
});
