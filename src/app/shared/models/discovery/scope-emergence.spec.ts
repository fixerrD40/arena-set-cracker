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

  it('stamps the theme with the highest Needs print rarity', () => {
    const wb = [
      card({
        name: 'Éowyn, Fearless Knight',
        typeLine: 'Legendary Creature — Human Knight',
        colors: ['W'],
        rarity: 'rare',
        oracleText: 'Haste'
      }),
      card({
        name: 'Westfold Rider',
        typeLine: 'Creature — Human Knight',
        colors: ['W'],
        oracleText: 'Haste'
      }),
      card({
        name: 'Gríma Wormtongue',
        typeLine: 'Legendary Creature — Human Advisor',
        colors: ['B'],
        rarity: 'uncommon',
        oracleText:
          '{T}, Sacrifice another creature: Target player loses 1 life. If the sacrificed creature was legendary, amass Orcs 2.'
      })
    ];
    const emerged = emergePatterns([pattern('legendary', 12, 200)], wb, true);
    expect(emerged[0].needsRarity).toBe('uncommon');
    expect(emerged[0].goldCount).toBe(0);
    expect(emerged[0].scopedCount).toBe(2);
  });

  it('does not let an Is-only gold card stamp Needs', () => {
    const emerged = emergePatterns(
      [pattern('legendary', 8, 200)],
      [
        card({
          name: 'Aragorn, the Uniter',
          typeLine: 'Legendary Creature — Human Noble',
          colors: ['W', 'U', 'R', 'G'],
          rarity: 'mythic',
          oracleText: 'Vigilance'
        })
      ],
      true
    );
    expect(emerged[0].needsRarity).toBeNull();
    expect(emerged[0].goldCount).toBe(1);
  });

  it('takes the rarer Needs card when two gates share a theme', () => {
    const gate =
      '{T}, Sacrifice another creature: Target player loses 1 life. If the sacrificed creature was legendary, amass Orcs 2.';
    const emerged = emergePatterns(
      [pattern('legendary', 6, 200)],
      [
        card({
          name: 'Common gate',
          typeLine: 'Creature',
          colors: ['B'],
          oracleText: gate
        }),
        card({
          name: 'Rare gate',
          typeLine: 'Creature',
          colors: ['B'],
          rarity: 'rare',
          oracleText: gate
        })
      ],
      true
    );
    expect(emerged[0].needsRarity).toBe('rare');
  });
});
