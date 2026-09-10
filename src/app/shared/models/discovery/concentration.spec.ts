import { MtgCard } from '../card/card';
import { concentrate } from './concentration';

function card(name: string, oracleText: string, typeLine = 'Instant'): MtgCard {
  return {
    id: name,
    setId: 'set',
    arenaId: 1,
    scryfallId: name,
    name,
    localArtUri: '',
    localIllustrationUri: '',
    typeLine,
    colors: ['U'],
    rarity: 'common',
    manaCost: '{1}',
    oracleText,
    keywords: [],
    power: '',
    toughness: ''
  };
}

describe('concentrate', () => {
  it('ranks repeated oracle phrases in the pool', () => {
    const cards = [
      card('A', 'Draw a card.'),
      card('B', 'Draw two cards.'),
      card('C', 'Draw three cards.'),
      card('D', 'Destroy target creature.')
    ];
    const patterns = concentrate(cards);
    const draw = patterns.find((entry) => entry.phrase.includes('draw') && entry.phrase.includes('card'));
    expect(draw?.cardCount).toBeGreaterThanOrEqual(3);
  });

  it('drops end of turn glue and its fragments from pattern results', () => {
    const cards = [
      card('A', 'Until end of turn, target creature gets +2/+2.'),
      card('B', 'At end of turn, sacrifice this creature.'),
      card('C', 'Creatures you control have haste until end of turn.')
    ];
    const phrases = concentrate(cards).map((entry) => entry.phrase);
    expect(phrases).not.toContain('end of turn');
    expect(phrases).not.toContain('end of');
    expect(phrases).not.toContain('of turn');
  });

  it('drops trigger and condition glue from pattern results', () => {
    const cards = [
      card('A', 'Whenever you draw a card, draw a card.'),
      card('B', 'Whenever you draw a card, draw two cards.'),
      card('C', 'If you do, draw three cards.')
    ];
    const phrases = concentrate(cards).map((entry) => entry.phrase);
    expect(phrases).not.toContain('whenever');
    expect(phrases).not.toContain('whenever you');
    expect(phrases).not.toContain('if you do');
    expect(phrases).not.toContain('if you');
    expect(phrases).not.toContain('you do');
  });

  it('keeps full oracle themes and drops shorter subphrases', () => {
    const cards = [
      card('A', 'The Ring tempts you. Discard a card.'),
      card('B', 'The Ring tempts you. Draw a card.'),
      card('C', 'The Ring tempts you. Target creature gets -2/-2.')
    ];
    const phrases = concentrate(cards).map((entry) => entry.phrase);
    expect(phrases.some((phrase) => phrase.includes('ring') && phrase.includes('tempt'))).toBe(true);
    expect(phrases).not.toContain('the ring');
    expect(phrases).not.toContain('ring tempts');
    expect(phrases).not.toContain('tempts you');
  });

  it('surfaces tribal subtypes and oracle phrases as separate patterns', () => {
    const cards = [
      card('A', 'Draw a card.', 'Creature — Elf'),
      card('B', 'Draw two cards.', 'Creature — Elf'),
      card('C', 'Draw three cards.', 'Creature — Elf'),
      card('D', 'Destroy target creature.', 'Instant')
    ];
    const patterns = concentrate(cards);
    expect(patterns.some((entry) => entry.phrase === 'elf')).toBe(true);
    expect(patterns.some((entry) => entry.phrase.includes('draw') && entry.phrase.includes('card'))).toBe(true);
    expect(patterns.some((entry) => entry.phrase.includes('elf') && entry.phrase.includes('draw'))).toBe(false);
  });

  it('drops themes below the pool significance floor', () => {
    const cards = [
      card('A', 'Destroy target creature.'),
      card('B', 'Destroy target artifact.'),
      ...Array.from({ length: 289 }, (_, index) =>
        card(`Pool ${index}`, 'Draw a card.')
      )
    ];
    const phrases = concentrate(cards).map((entry) => entry.phrase);
    expect(phrases.some((phrase) => phrase.includes('destroy'))).toBe(false);
    expect(phrases.some((phrase) => phrase.includes('draw'))).toBe(true);
  });

  it('ranks a larger bird tribe above wizard when both are significant', () => {
    const filler = Array.from({ length: 70 }, (_, index) =>
      card(`Filler ${index}`, 'Draw a card.', 'Instant')
    );
    const birds = Array.from({ length: 6 }, (_, index) =>
      card(`Bird ${index}`, 'Flying.', 'Creature — Bird')
    );
    const wizards = Array.from({ length: 4 }, (_, index) =>
      card(`Wizard ${index}`, 'Draw a card.', 'Creature — Human Wizard')
    );
    const patterns = concentrate([...birds, ...wizards, ...filler]);
    const bird = patterns.find((entry) => entry.phrase === 'bird');
    const wizard = patterns.find((entry) => entry.phrase === 'wizard');
    expect(bird?.cardCount).toBe(6);
    expect(wizard?.cardCount).toBe(4);
    expect(patterns.indexOf(bird!)).toBeLessThan(patterns.indexOf(wizard!));
  });
});
