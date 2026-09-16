import { MtgCard } from '../card/card';
import { cardMatchesOracleTheme, cardMatchesTheme, cardsMatchingTheme, minSignificantThemeCards } from './theme-match';

function card(oracleText: string, extra = ''): MtgCard {
  return {
    id: '1',
    setId: 'set',
    arenaId: 1,
    scryfallId: '1',
    name: 'Card',
    localArtUri: '',
    localIllustrationUri: '',
    typeLine: 'Instant',
    colors: ['U'],
    rarity: 'common',
    manaCost: '{1}',
    oracleText: extra ? `${oracleText} ${extra}` : oracleText,
    keywords: [],
    power: '',
    toughness: ''
  };
}

describe('cardMatchesTheme', () => {
  it('matches folded draw phrases across number and plural variants', () => {
    const theme = 'draw <NUM> card';
    expect(cardMatchesTheme(card('Draw a card.'), theme)).toBe(true);
    expect(cardMatchesTheme(card('Draw two cards.'), theme)).toBe(true);
    expect(cardMatchesTheme(card('Destroy target creature.'), theme)).toBe(false);
  });

  it('matches wildcard slots from generalized patterns', () => {
    expect(cardMatchesTheme(card('Deal 3 damage to any target.'), 'deal * damage')).toBe(true);
    expect(cardMatchesTheme(card('Deal 3 damage to any target.'), 'deal <NUM> life')).toBe(false);
  });

  it('filters cards in a pool by theme phrase', () => {
    const pool = [
      card('Draw a card.'),
      card('Draw two cards.'),
      card('Destroy target creature.')
    ];
    const matches = cardsMatchingTheme(pool, 'draw <NUM> card');
    expect(matches).toHaveLength(2);
  });

  it('matches oracle-only themes without card-name noise', () => {
    const ring = {
      ...card('The Ring tempts you.'),
      name: 'The One Ring',
      oracleText: 'The Ring tempts you. Discard a card.'
    };
    expect(cardMatchesOracleTheme(ring, 'the ring tempts you')).toBe(true);
    expect(cardMatchesTheme(ring, 'the one ring')).toBe(true);
    expect(cardMatchesOracleTheme(ring, 'the one ring')).toBe(false);
  });

  it('matches printed keywords as chips', () => {
    const flyer = { ...card(''), keywords: ['Flying'] };
    expect(cardMatchesOracleTheme(flyer, 'flying')).toBe(true);
    expect(cardMatchesOracleTheme(card(''), 'flying')).toBe(false);
  });

  it('matches tribal subtype tokens from the type line', () => {
    const elf = {
      ...card('Draw a card.'),
      typeLine: 'Creature — Elf'
    };
    expect(cardMatchesOracleTheme(elf, 'elf')).toBe(true);
    expect(cardMatchesOracleTheme(elf, 'draw <NUM> card')).toBe(true);
  });
});

describe('minSignificantThemeCards', () => {
  it('requires at least three cards in small pools', () => {
    expect(minSignificantThemeCards(20)).toBe(3);
  });

  it('scales with pool size for large sets', () => {
    expect(minSignificantThemeCards(291)).toBe(6);
  });
});
