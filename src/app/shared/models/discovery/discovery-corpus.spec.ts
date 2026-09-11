import { subtypesOnTypeLine } from '../card/type-line';
import {
  cardHasDiscoveryKeyword,
  cardHasDiscoveryTypeToken,
  discoveryOracleChunks,
  discoveryTextChunks,
  discoveryTypeTokens
} from './discovery-corpus';
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

  it('counts legendary on the type line as an Is token', () => {
    expect(discoveryTypeTokens('Legendary Creature — Human Advisor')).toEqual([
      'legendary',
      'human',
      'advisor'
    ]);
    expect(cardHasDiscoveryTypeToken(card('Legendary Creature — Human Advisor', ''), 'legendary')).toBe(
      true
    );
  });

  it('keeps printed keywords as their own chunk', () => {
    const flyer = { ...card('Creature — Bird', 'Flying'), keywords: ['Flying'] };
    const chunks = discoveryTextChunks(flyer);
    expect(chunks[chunks.length - 1]).toEqual(['flying']);
    expect(cardHasDiscoveryKeyword(flyer, 'flying')).toBe(true);
  });

  it('keeps a multi-word keyword as one phrase', () => {
    const ring = { ...card('Legendary Artifact', 'The Ring tempts you.'), keywords: ['The Ring tempts you'] };
    expect(cardHasDiscoveryKeyword(ring, 'the ring tempts you')).toBe(true);
    expect(cardHasDiscoveryKeyword(ring, 'you')).toBe(false);
  });
});
