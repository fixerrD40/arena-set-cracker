import { MtgCard } from '../card/card';
import { ConcentratedPattern } from './concentration';
import { emergePatterns, isGoldSignpost } from './scope-emergence';

function card(partial: Partial<MtgCard> & Pick<MtgCard, 'name'>): MtgCard {
  return {
    id: partial.id ?? partial.name,
    setId: 'ltr',
    arenaId: 1,
    collectorNumber: '1',
    scryfallId: partial.name,
    localArtUri: '',
    localIllustrationUri: '',
    typeLine: 'Creature — Elf',
    colors: ['G'],
    rarity: 'common',
    manaCost: '{G}',
    oracleText: '',
    keywords: [],
    power: '',
    toughness: '',
    ...partial
  };
}

function pattern(phrase: string, cardCount: number, poolSize: number): ConcentratedPattern {
  return { phrase, hitCount: cardCount, cardCount, poolSize };
}

describe('isGoldSignpost', () => {
  it('is a two-color uncommon or rarer', () => {
    expect(
      isGoldSignpost(card({ name: 'Galadriel', colors: ['G', 'U'], rarity: 'rare' }))
    ).toBe(true);
    expect(isGoldSignpost(card({ name: 'Elf', colors: ['G'], rarity: 'rare' }))).toBe(false);
    expect(
      isGoldSignpost(card({ name: 'Gold common', colors: ['G', 'U'], rarity: 'common' }))
    ).toBe(false);
  });
});

describe('emergePatterns', () => {
  const baseline: ConcentratedPattern[] = [
    pattern('human', 47, 200),
    pattern('elf', 22, 200)
  ];

  const scoped: MtgCard[] = [
    card({ name: 'Elf A', typeLine: 'Creature — Elf', colors: ['G'] }),
    card({ name: 'Elf B', typeLine: 'Creature — Elf', colors: ['G'] }),
    card({ name: 'Galadriel', typeLine: 'Creature — Elf', colors: ['G', 'U'], rarity: 'rare' }),
    card({ name: 'Soldier', typeLine: 'Creature — Human Soldier', colors: ['W'] })
  ];

  it('ranks the theme that concentrates in scope first', () => {
    const emerged = emergePatterns(baseline, scoped, true);
    expect(emerged.map((entry) => entry.phrase)).toEqual(['elf', 'human']);
    expect(emerged[0].scopedCount).toBe(3);
    expect(emerged[0].goldCount).toBe(1);
    expect(emerged[0].lift).toBeGreaterThan(emerged[1].lift);
  });

  it('keeps catalog order when not ranking by lift', () => {
    const emerged = emergePatterns(baseline, scoped, false);
    expect(emerged.map((entry) => entry.phrase)).toEqual(['human', 'elf']);
  });

  it('drops a theme with no scoped matches', () => {
    const goblinOnly = scoped.filter((entry) => entry.name === 'Soldier');
    const emerged = emergePatterns([pattern('elf', 22, 200)], goblinOnly, true);
    expect(emerged).toEqual([]);
  });
});
