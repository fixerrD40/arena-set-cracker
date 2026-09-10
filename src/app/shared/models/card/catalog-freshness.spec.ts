import { MtgCard } from './card';
import { catalogNeedsRefresh } from './catalog-freshness';

function card(partial: Partial<MtgCard> & Pick<MtgCard, 'name' | 'typeLine'>): MtgCard {
  return {
    id: partial.id ?? partial.name,
    setId: 'ltr',
    arenaId: 1,
    collectorNumber: '1',
    scryfallId: partial.name,
    localArtUri: '',
    localIllustrationUri: '',
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

describe('catalogNeedsRefresh', () => {
  it('is stale when every creature has empty power', () => {
    expect(
      catalogNeedsRefresh([
        card({ name: 'Bear', typeLine: 'Creature — Bear' }),
        card({ name: 'Bolt', typeLine: 'Instant', power: '' })
      ])
    ).toBe(true);
  });

  it('is fresh when a creature has printed power', () => {
    expect(
      catalogNeedsRefresh([
        card({ name: 'Bear', typeLine: 'Creature — Bear', power: '2', toughness: '2' })
      ])
    ).toBe(false);
  });

  it('treats vehicles as bodies', () => {
    expect(
      catalogNeedsRefresh([card({ name: 'Car', typeLine: 'Artifact — Vehicle' })])
    ).toBe(true);
  });

  it('is fresh when the catalog is empty', () => {
    expect(catalogNeedsRefresh([])).toBe(false);
  });

  it('uses empty keywords when the set has no bodies', () => {
    const instants = [
      card({ name: 'A', typeLine: 'Instant' }),
      card({ name: 'B', typeLine: 'Instant' }),
      card({ name: 'C', typeLine: 'Instant' })
    ];
    expect(catalogNeedsRefresh(instants)).toBe(true);
    expect(
      catalogNeedsRefresh([
        ...instants.slice(0, 2),
        card({ name: 'C', typeLine: 'Instant', keywords: ['Flash'] })
      ])
    ).toBe(false);
  });
});
