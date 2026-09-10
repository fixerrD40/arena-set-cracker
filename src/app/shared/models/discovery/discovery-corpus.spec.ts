import { subtypesOnTypeLine } from '../card/type-line';
import { discoveryOracleChunks, discoveryTextChunks, discoveryTypeTokens, cardHasDiscoveryTypeToken } from './discovery-corpus';
import { MtgCard } from '../card/card';

function card(typeLine: string, oracleText: string): MtgCard {
  return {
    id: typeLine,
    setId: 'set',
    arenaId: 1,
    scryfallId: typeLine,
    name: typeLine,
    localArtUri: '',
    localIllustrationUri: '',
    typeLine,
    colors: ['G'],
    rarity: 'common',
    manaCost: '{1}',
    oracleText,
    keywords: [],
    power: '',
    toughness: ''
  };
}

describe('discovery-corpus', () => {
  it('extracts subtypes after the em dash', () => {
    expect(subtypesOnTypeLine('Legendary Creature — Elf Druid')).toEqual(['Elf', 'Druid']);
  });

  it('matches subtype tokens the same way concentration counts them', () => {
    const lowercaseBird = card('creature — bird', 'Flying.');
    expect(discoveryTypeTokens(lowercaseBird.typeLine)).toEqual(['bird']);
    expect(cardHasDiscoveryTypeToken(lowercaseBird, 'bird')).toBe(true);
  });

  it('keeps oracle and subtype chunks disjoint', () => {
    const chunks = discoveryTextChunks(card('Creature — Elf', 'Draw a card.'));
    expect(chunks).toHaveLength(2);
    expect(discoveryOracleChunks(card('Creature — Elf', 'Draw a card.'))[0]).toEqual(['draw', '<NUM>', 'card']);
    expect(chunks[1]).toEqual(['elf']);
  });

  it('tokenizes subtype words for tribal matching', () => {
    expect(discoveryTypeTokens('Creature — Elf')).toEqual(['elf']);
  });
});
