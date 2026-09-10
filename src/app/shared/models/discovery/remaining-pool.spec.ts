import { MtgCard } from '../card/card';
import { MtgDeck } from '../deck/deck';
import { remainingPoolCards, remainingPoolCounts, remainingPoolSignature } from './remaining-pool';

function card(id: string, colors: string[] = ['W']): MtgCard {
  return {
    id,
    setId: 'set',
    arenaId: 1,
    scryfallId: id,
    name: id,
    localArtUri: '',
    localIllustrationUri: '',
    typeLine: 'Creature',
    colors,
    rarity: 'common',
    manaCost: '{1}',
    oracleText: '',
    keywords: [],
    power: '',
    toughness: ''
  };
}

function deck(status: MtgDeck['status'], cardIds: string[]): MtgDeck {
  return {
    id: 'deck',
    setId: 'set',
    name: 'Deck',
    status,
    themes: [],
    notes: '',
    coverCardId: '',
    cards: new Map(cardIds.map((id) => [id, 1]))
  };
}

describe('remainingPoolCards', () => {
  const catalog = [card('a'), card('b'), card('c', ['U'])];

  it('only final decks drain by default', () => {
    const decks = [deck('concept', ['a']), deck('needs-work', ['b']), deck('final', ['c'])];
    const pool = remainingPoolCards(catalog, decks);
    expect(pool.map((entry) => entry.id).sort()).toEqual(['a', 'b']);
  });

  it('drains needs-work when toggled on', () => {
    const decks = [deck('needs-work', ['b']), deck('final', ['c'])];
    const pool = remainingPoolCards(catalog, decks, { drainNeedsWork: true });
    expect(pool.map((entry) => entry.id)).toEqual(['a']);
  });

  it('scopes by selected colors', () => {
    const catalog = [card('u', ['U']), card('ur', ['U', 'R']), card('r', ['R'])];
    const pool = remainingPoolCards(catalog, [], { colors: ['U'] });
    expect(pool.map((entry) => entry.id).sort()).toEqual(['u', 'ur']);
  });

  it('scopes R+W to mono R/W, RW gold, and colorless — not GW', () => {
    const catalog = [
      card('w', ['W']),
      card('r', ['R']),
      card('rw', ['R', 'W']),
      card('gw', ['G', 'W']),
      card('c', [])
    ];
    const pool = remainingPoolCards(catalog, [], { colors: ['R', 'W'] });
    expect(pool.map((entry) => entry.id).sort()).toEqual(['c', 'r', 'rw', 'w']);
  });

  it('scopes R+W+U to pairwise gold without requiring all three on the card', () => {
    const catalog = [
      card('ur', ['U', 'R']),
      card('rw', ['R', 'W']),
      card('gw', ['G', 'W']),
      card('br', ['B', 'R'])
    ];
    const pool = remainingPoolCards(catalog, [], { colors: ['R', 'W', 'U'] });
    expect(pool.map((entry) => entry.id).sort()).toEqual(['rw', 'ur']);
  });
});

describe('remainingPoolCounts', () => {
  it('reports remaining, total, and scoped counts', () => {
    const catalog = [card('a'), card('b', ['U'])];
    const counts = remainingPoolCounts(catalog, [deck('final', ['a'])], { colors: ['U'] });
    expect(counts.total).toBe(2);
    expect(counts.remaining).toBe(1);
    expect(counts.scoped).toBe(1);
  });
});

describe('remainingPoolSignature', () => {
  it('matches pools with the same card ids regardless of order', () => {
    expect(remainingPoolSignature([card('b'), card('a')])).toBe(
      remainingPoolSignature([card('a'), card('b')])
    );
  });
});
