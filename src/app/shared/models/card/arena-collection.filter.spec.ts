import { MtgCard } from './card';
import {
  ArenaCollectionFilter,
  cardMatchesArenaCollectionFilter,
  collectionColorGroup,
  compareArenaCollection,
  compareArenaDeckList,
  emptyArenaCollectionFilter,
  matchesCollectionText,
  matchesColorScope
} from './arena-collection.filter';

function card(partial: Partial<MtgCard> & Pick<MtgCard, 'name' | 'colors' | 'typeLine'>): MtgCard {
  return {
    id: partial.id ?? partial.name,
    setId: 'set-ltr',
    arenaId: 0,
    scryfallId: partial.name,
    localArtUri: '',
    localIllustrationUri: '',
    rarity: 'common',
    manaCost: '',
    oracleText: '',
    keywords: [],
    power: '',
    toughness: '',
    ...partial}
  };
}

function filter(partial: Partial<ArenaCollectionFilter> = {}): ArenaCollectionFilter {
  return { ...emptyArenaCollectionFilter(), ...partial };
}

const monoWhite = card({
  name: 'Swords to Plowshares',
  colors: ['W'],
  typeLine: 'Instant',
  manaCost: '{W}'
});
const monoRed = card({ name: 'Orcish Bowmasters', colors: ['R'], typeLine: 'Creature — Orc Archer' });
const monoBlue = card({ name: 'Consider', colors: ['U'], typeLine: 'Instant' });
const izzet = card({ name: 'Izzet Charm', colors: ['U', 'R'], typeLine: 'Instant' });
const jeskai = card({ name: 'Jeskai Charm', colors: ['U', 'R', 'W'], typeLine: 'Instant' });
const swamp = card({ name: 'Swamp', colors: [], typeLine: 'Basic Land — Swamp' });
const plains = card({ name: 'Plains', colors: [], typeLine: 'Basic Land — Plains' });
const wastes = card({ name: 'Wastes', colors: [], typeLine: 'Basic Land' });
const solRing = card({ name: 'Sol Ring', colors: [], typeLine: 'Artifact' });
const breedingPool = card({
  name: 'Breeding Pool',
  colors: [],
  typeLine: 'Land — Forest Island'
});
const castleArdenvale = card({
  name: 'Castle Ardenvale',
  colors: [],
  typeLine: 'Land',
  oracleText: '{T}: Add {W}. {4}{W}, {T}: Create a 1/1 white Human creature token.'
});
const ringGoesSouth = card({
  name: 'The Ring Goes South',
  colors: ['G'],
  typeLine: 'Enchantment',
  oracleText: 'The Ring tempts you.'
});

describe('cardMatchesArenaCollectionFilter', () => {
  it('shows the set pool except basics when no chips or text are set', () => {
    const none = filter();
    expect(cardMatchesArenaCollectionFilter(monoRed, none)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(izzet, none)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(breedingPool, none)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(swamp, none)).toBe(false);
    expect(cardMatchesArenaCollectionFilter(plains, none)).toBe(false);
  });

  it('shows basics only when the land chip is on', () => {
    const land = filter({ land: true });
    expect(cardMatchesArenaCollectionFilter(swamp, land)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(plains, land)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(wastes, land)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(swamp, filter({ text: 'swamp' }))).toBe(false);
  });

  it('treats a single color chip as “has this color”, including gold', () => {
    const red = filter({ colors: ['R'] });
    expect(cardMatchesArenaCollectionFilter(monoRed, red)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(izzet, red)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(monoBlue, red)).toBe(false);
    expect(cardMatchesArenaCollectionFilter(solRing, red)).toBe(false);
  });

  it('ORs two color chips when multicolor is off', () => {
    const ur = filter({ colors: ['U', 'R'] });
    expect(cardMatchesArenaCollectionFilter(monoRed, ur)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(monoBlue, ur)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(izzet, ur)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(solRing, ur)).toBe(false);
  });

  it('with only multicolor, keeps cards that have two or more colors', () => {
    const multi = filter({ multicolor: true });
    expect(cardMatchesArenaCollectionFilter(izzet, multi)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(jeskai, multi)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(breedingPool, multi)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(monoRed, multi)).toBe(false);
    expect(cardMatchesArenaCollectionFilter(solRing, multi)).toBe(false);
  });

  it('with multicolor and red, keeps gold cards that include red', () => {
    const multiRed = filter({ colors: ['R'], multicolor: true });
    expect(cardMatchesArenaCollectionFilter(izzet, multiRed)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(jeskai, multiRed)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(monoRed, multiRed)).toBe(false);
    expect(cardMatchesArenaCollectionFilter(card({
      name: 'Simic Charm',
      colors: ['G', 'U'],
      typeLine: 'Instant'
    }), multiRed)).toBe(false);
  });

  it('with multicolor and two colors, requires all selected colors', () => {
    const multiUr = filter({ colors: ['U', 'R'], multicolor: true });
    expect(cardMatchesArenaCollectionFilter(izzet, multiUr)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(jeskai, multiUr)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(monoRed, multiUr)).toBe(false);
    expect(cardMatchesArenaCollectionFilter(card({
      name: 'Boros Charm',
      colors: ['R', 'W'],
      typeLine: 'Instant'
    }), multiUr)).toBe(false);
  });

  it('returns nothing when colorless and multicolor are both on', () => {
    const both = filter({ colorless: true, multicolor: true });
    expect(cardMatchesArenaCollectionFilter(solRing, both)).toBe(false);
    expect(cardMatchesArenaCollectionFilter(izzet, both)).toBe(false);
    expect(cardMatchesArenaCollectionFilter(swamp, both)).toBe(false);
  });

  it('colorless keeps cards with no colors, not colored basics', () => {
    const colorless = filter({ colorless: true });
    expect(cardMatchesArenaCollectionFilter(solRing, colorless)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(monoRed, colorless)).toBe(false);
    expect(cardMatchesArenaCollectionFilter(swamp, colorless)).toBe(false);
    expect(cardMatchesArenaCollectionFilter(wastes, colorless)).toBe(false);
    expect(cardMatchesArenaCollectionFilter(wastes, filter({ colorless: true, land: true }))).toBe(true);
    expect(cardMatchesArenaCollectionFilter(swamp, filter({ colorless: true, land: true }))).toBe(false);
  });

  it('land restricts to type-line Land and infers land color from types or oracle', () => {
    const land = filter({ land: true });
    expect(cardMatchesArenaCollectionFilter(swamp, land)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(breedingPool, land)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(castleArdenvale, land)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(monoRed, land)).toBe(false);

    const whiteLand = filter({ land: true, colors: ['W'] });
    expect(cardMatchesArenaCollectionFilter(plains, whiteLand)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(castleArdenvale, whiteLand)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(swamp, whiteLand)).toBe(false);

    expect(cardMatchesArenaCollectionFilter(castleArdenvale, filter({ colors: ['W'] }))).toBe(true);
  });

  it('land plus multicolor keeps gold lands', () => {
    const landMulti = filter({ land: true, multicolor: true });
    expect(cardMatchesArenaCollectionFilter(breedingPool, landMulti)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(swamp, landMulti)).toBe(false);
    expect(cardMatchesArenaCollectionFilter(izzet, landMulti)).toBe(false);
  });

  it('restricts to selected rarities when any are on', () => {
    const rares = filter({ rarities: ['rare', 'mythic'] });
    expect(cardMatchesArenaCollectionFilter(card({
      name: 'Anduril',
      colors: ['W'],
      typeLine: 'Artifact',
      rarity: 'rare'
    }), rares)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(monoRed, rares)).toBe(false);
  });

  it('restricts to selected CMC buckets when any are on', () => {
    const cheap = filter({ cmcBuckets: ['1-'] });
    expect(cardMatchesArenaCollectionFilter(monoWhite, cheap)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(card({
      name: 'Wrath',
      colors: ['W'],
      typeLine: 'Sorcery',
      manaCost: '{2}{W}{W}'
    }), cheap)).toBe(false);
  });

  it('ANDs an applied theme without using the search box', () => {
    const themed = filter({ theme: 'tempts' });
    expect(cardMatchesArenaCollectionFilter(ringGoesSouth, themed)).toBe(true);
    expect(cardMatchesArenaCollectionFilter(monoRed, themed)).toBe(false);
    expect(themed.text).toBe('');
  });
});

describe('compareArenaCollection', () => {
  it('orders WUBRG, then gold, then colorless; lands last within a color; then CMC then name', () => {
    const whiteTwo = card({
      name: 'Seal of Cleansing',
      colors: ['W'],
      typeLine: 'Enchantment',
      manaCost: '{1}{W}'
    });
    const whiteLand = card({
      name: 'Idyllic Grange',
      colors: [],
      typeLine: 'Land — Plains',
      oracleText: '{T}: Add {W}.'
    });
    const names = [
      solRing,
      izzet,
      ringGoesSouth,
      swamp,
      monoRed,
      whiteLand,
      monoBlue,
      whiteTwo,
      monoWhite
    ]
      .sort(compareArenaCollection)
      .map((entry) => entry.name);

    expect(names).toEqual([
      'Swords to Plowshares',
      'Seal of Cleansing',
      'Idyllic Grange',
      'Consider',
      'Swamp',
      'Orcish Bowmasters',
      'The Ring Goes South',
      'Izzet Charm',
      'Sol Ring'
    ]);
  });

  it('puts a swamp after black spells once included', () => {
    const darkRitual = card({
      name: 'Dark Ritual',
      colors: ['B'],
      typeLine: 'Instant',
      manaCost: '{B}'
    });
    expect(collectionColorGroup(swamp)).toBe('B');
    expect(compareArenaCollection(darkRitual, swamp)).toBeLessThan(0);
    expect(compareArenaCollection(monoWhite, swamp)).toBeLessThan(0);
  });
});

describe('compareArenaDeckList', () => {
  it('orders by CMC then name, with every land after every spell', () => {
    const cheapBlue = card({ name: 'Consider', colors: ['U'], typeLine: 'Instant', manaCost: '{U}' });
    const dearWhite = card({
      name: 'Wrath',
      colors: ['W'],
      typeLine: 'Sorcery',
      manaCost: '{2}{W}{W}'
    });
    const names = [dearWhite, swamp, cheapBlue, plains]
      .sort(compareArenaDeckList)
      .map((entry) => entry.name);
    expect(names).toEqual(['Consider', 'Wrath', 'Plains', 'Swamp']);
  });
});

describe('matchesColorScope', () => {
  it('always includes colorless cards when colors are selected', () => {
    expect(matchesColorScope(solRing, ['R', 'W'])).toBe(true);
    expect(matchesColorScope(wastes, ['U'])).toBe(true);
  });

  it('includes mono cards whose color is in the selected set', () => {
    expect(matchesColorScope(monoRed, ['R', 'W'])).toBe(true);
    expect(matchesColorScope(monoWhite, ['R', 'W'])).toBe(true);
    expect(matchesColorScope(monoBlue, ['R', 'W'])).toBe(false);
  });

  it('with one chip selected, includes any gold that shares that color', () => {
    expect(matchesColorScope(monoBlue, ['U'])).toBe(true);
    expect(matchesColorScope(izzet, ['U'])).toBe(true);
    expect(matchesColorScope(jeskai, ['U'])).toBe(true);
    expect(matchesColorScope(monoRed, ['U'])).toBe(false);
  });

  it('with two or more chips, gold must stay within the selected set', () => {
    const boros = card({ name: 'Boros Charm', colors: ['R', 'W'], typeLine: 'Instant' });
    const gruul = card({ name: 'Selesnya Charm', colors: ['G', 'W'], typeLine: 'Instant' });
    expect(matchesColorScope(boros, ['R', 'W'])).toBe(true);
    expect(matchesColorScope(gruul, ['R', 'W'])).toBe(false);
    expect(matchesColorScope(izzet, ['R', 'W'])).toBe(false);
    expect(matchesColorScope(izzet, ['R', 'W', 'U'])).toBe(true);
  });

  it('does not require gold to use every selected color', () => {
    expect(matchesColorScope(izzet, ['R', 'W', 'U'])).toBe(true);
    expect(matchesColorScope(jeskai, ['R', 'W', 'U'])).toBe(true);
  });

  it('includes every in-set colored card when all five are selected', () => {
    const all = ['W', 'U', 'B', 'R', 'G'] as const;
    expect(matchesColorScope(monoRed, all)).toBe(true);
    expect(matchesColorScope(izzet, all)).toBe(true);
    expect(matchesColorScope(jeskai, all)).toBe(true);
  });
});

describe('matchesCollectionText', () => {
  it('ANDs space-separated terms across name, type, and oracle', () => {
    expect(matchesCollectionText(ringGoesSouth, 'the ring goes south')).toBe(true);
    expect(matchesCollectionText(ringGoesSouth, 'tempts')).toBe(true);
    expect(matchesCollectionText(ringGoesSouth, 'enchantment ring')).toBe(true);
    expect(matchesCollectionText(ringGoesSouth, 'bowmasters')).toBe(false);
  });
});
