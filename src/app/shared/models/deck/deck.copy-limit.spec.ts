import { MtgCard } from '../card/card';
import { DEFAULT_DECK_COPY_LIMIT, deckCopyLimit, showsInfinityCopyMark } from './deck.copy-limit';

function card(partial: Partial<MtgCard> & Pick<MtgCard, 'name' | 'typeLine'>): MtgCard {
  return {
    id: partial.id ?? partial.name,
    setId: 'set-ltr',
    arenaId: 0,
    scryfallId: partial.name,
    localArtUri: '',
    localIllustrationUri: '',
    rarity: 'common',
    manaCost: '',
    colors: [],
    oracleText: '',
    keywords: [],
    power: '',
    toughness: '',
    ...partial}
  };
}

describe('deckCopyLimit', () => {
  it('caps ordinary cards at four', () => {
    const bolt = card({
      name: 'Cast into the Fire',
      typeLine: 'Instant',
      colors: ['R'],
      oracleText: 'Destroy target artifact. …'
    });
    expect(deckCopyLimit(bolt)).toBe(DEFAULT_DECK_COPY_LIMIT);
    expect(showsInfinityCopyMark(bolt)).toBe(false);
  });

  it('does not cap basic lands', () => {
    const swamp = card({ name: 'Swamp', typeLine: 'Basic Land — Swamp' });
    expect(deckCopyLimit(swamp)).toBe(Number.POSITIVE_INFINITY);
    expect(showsInfinityCopyMark(swamp)).toBe(true);
  });

  it('reads a numeric override from oracle text', () => {
    const nazgul = card({
      name: 'Nazgûl',
      typeLine: 'Creature — Wraith Knight',
      colors: ['B'],
      oracleText:
        'Deathtouch\nWhen Nazgûl enters the battlefield, the Ring tempts you.\nA deck can have up to nine cards named Nazgûl.'
    });
    expect(deckCopyLimit(nazgul)).toBe(9);
    expect(showsInfinityCopyMark(nazgul)).toBe(true);
  });

  it('treats “any number” as uncapped', () => {
    const rats = card({
      name: 'Relentless Rats',
      typeLine: 'Creature — Rat',
      colors: ['B'],
      oracleText: 'A deck can have any number of cards named Relentless Rats.'
    });
    expect(deckCopyLimit(rats)).toBe(Number.POSITIVE_INFINITY);
    expect(showsInfinityCopyMark(rats)).toBe(true);
  });
});
