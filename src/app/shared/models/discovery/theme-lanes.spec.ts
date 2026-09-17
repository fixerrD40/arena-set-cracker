import { describe, expect, it } from 'vitest';
import { MtgCard } from '../card/card';
import { buildThemeLaneColumns, themeLanesForCard } from './theme-lanes';
import { buildCatalogGraph } from './build-catalog-graph';

function card(partial: Partial<MtgCard> & Pick<MtgCard, 'name' | 'oracleText'>): MtgCard {
  return {
    id: partial.name,
    setId: 'ltr',
    arenaId: 1,
    collectorNumber: '1',
    scryfallId: partial.name,
    localArtUri: '',
    localIllustrationUri: '',
    typeLine: 'Creature',
    colors: ['B'],
    rarity: 'common',
    manaCost: '{B}',
    keywords: [],
    power: '',
    toughness: '',
    ...partial
  };
}

describe('theme lanes', () => {
  const ring = {
    id: 'ring',
    setId: 'ltr',
    name: 'The Ring Tempts You',
    typeLine: 'Card',
    keywords: [],
    oracleText: 'Your Ring-bearer is legendary and can’t be blocked by creatures with greater power.'
  };
  const graph = buildCatalogGraph([], [ring]);

  it('puts a keyword member in Says and a legendary gate in Needs', () => {
    const nazgul = card({
      name: 'Nazgûl',
      oracleText: 'The Ring tempts you.',
      keywords: ['The Ring tempts you']
    });
    const grima = card({
      name: 'Gríma Wormtongue',
      oracleText:
        '{T}, Sacrifice another creature: Target player loses 1 life. If the sacrificed creature was legendary, amass Orcs 2.'
    });
    expect(themeLanesForCard(nazgul, 'the ring tempts you', graph)).toEqual(['says']);
    expect(themeLanesForCard(grima, 'the ring tempts you', graph)).toEqual([]);
    expect(themeLanesForCard(grima, 'legendary')).toEqual(['needs']);
  });

  it('puts a type-line legend in Is and a legendary condition in Needs', () => {
    const eowyn = card({
      name: 'Éowyn, Fearless Knight',
      typeLine: 'Legendary Creature — Human Knight',
      colors: ['W'],
      oracleText: 'Haste'
    });
    const grima = card({
      name: 'Gríma Wormtongue',
      typeLine: 'Legendary Creature — Human Advisor',
      rarity: 'uncommon',
      oracleText:
        '{T}, Sacrifice another creature: Target player loses 1 life. If the sacrificed creature was legendary, amass Orcs 2.'
    });
    expect(themeLanesForCard(eowyn, 'legendary')).toEqual(['is']);
    expect(themeLanesForCard(grima, 'legendary')).toEqual(['is', 'needs']);
  });

  it('omits empty lanes', () => {
    const elf = card({
      name: 'Elf',
      typeLine: 'Creature — Elf',
      oracleText: 'Draw a card.'
    });
    const columns = buildThemeLaneColumns([{ card: elf }], 'elf');
    expect(columns.map((column) => column.lane)).toEqual(['is']);
  });
});
