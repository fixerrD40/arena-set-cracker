import { describe, expect, it } from 'vitest';
import { MtgCard } from '../card/card';
import { isCompanionVocabulary, SetVocabulary } from '../card/set-vocabulary';
import { buildCatalogGraph } from './build-catalog-graph';
import { cardMatchesOracleTheme } from './theme-match';
import { feedersForTheme, pickThemeFeed, pickThemeFeeds } from './insights/neighbors';

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
    colors: ['W'],
    rarity: 'common',
    manaCost: '{W}',
    keywords: [],
    power: '',
    toughness: '',
    ...partial
  };
}

function vocab(partial: Pick<SetVocabulary, 'name' | 'oracleText'> & Partial<SetVocabulary>): SetVocabulary {
  return {
    id: partial.name,
    setId: 'ltr',
    typeLine: '',
    keywords: [],
    ...partial
  };
}

describe('catalog graph harvest', () => {
  const food = vocab({
    name: 'Food',
    typeLine: 'Token Artifact — Food',
    oracleText: 'Food tokens have “{2}, {T}, Sacrifice this artifact: You gain 3 life.”'
  });
  const ring = vocab({
    name: 'The Ring // The Ring Tempts You',
    typeLine: 'Emblem // Card',
    oracleText:
      'As the Ring tempts you, you get an emblem named The Ring if you don’t have one. Then your emblem gains its next ability and you choose a creature you control to become or remain your Ring-bearer.\n\n• The Ring can tempt you even if you don’t control a creature.\n\n• Each player can have only one emblem named The Ring and only one Ring-bearer at a time.'
  });
  const fullRing = vocab({
    name: 'The Ring // The Ring Tempts You',
    typeLine: 'Emblem // Card',
    oracleText:
      'As the Ring tempts you, you get an emblem named The Ring if you don’t have one. Then your emblem gains its next ability and you choose a creature you control to become or remain your Ring-bearer.\n\nYour Ring-bearer is legendary and can’t be blocked by creatures with greater power.\n\nWhenever your Ring-bearer attacks, draw a card, then discard a card.'
  });
  const graph = buildCatalogGraph([], [food, ring]);

  it('does not treat a commander reprint as a vocabulary node', () => {
    const hunter = vocab({
      name: 'Savvy Hunter',
      typeLine: 'Creature — Human Warrior',
      oracleText: 'Whenever this creature attacks or blocks, create a Food token.'
    });
    expect(isCompanionVocabulary(hunter)).toBe(false);
    expect(isCompanionVocabulary(food)).toBe(true);
    expect(isCompanionVocabulary(ring)).toBe(true);
    expect(isCompanionVocabulary(vocab({ name: 'Blank', oracleText: 'Create a Food token.' }))).toBe(
      false
    );
    expect(buildCatalogGraph([], [hunter, food]).phrases.has('savvy hunter')).toBe(false);
  });

  it('keys companion rows by name, not a closed list', () => {
    expect(graph.phrases.has('food')).toBe(true);
    expect(graph.phrases.has('the ring tempts you')).toBe(true);
    expect(graph.phrases.has('the ring')).toBe(true);
  });

  it('matches Food on the printed word, not the helper tap line', () => {
    const cook = card({ name: 'Cook', oracleText: 'Create a Food token.' });
    const baker = card({
      name: 'Baker',
      oracleText: '{2}, {T}, Sacrifice this artifact: You gain 3 life.'
    });
    const flyer = card({ name: 'Bird', oracleText: 'Flying', keywords: ['Flying'] });
    expect(cardMatchesOracleTheme(cook, 'food', graph)).toBe(true);
    expect(cardMatchesOracleTheme(baker, 'food', graph)).toBe(false);
    expect(cardMatchesOracleTheme(flyer, 'food', graph)).toBe(false);
  });

  it('feeds legendary from the Ring helper without counting Gríma as Ring', () => {
    const joined = buildCatalogGraph([], [fullRing]);
    const grima = card({
      name: 'Gríma Wormtongue',
      typeLine: 'Legendary Creature — Human Advisor',
      oracleText:
        'Your opponents can’t gain life.\n\n{T}, Sacrifice another creature: Target player loses 1 life. If the sacrificed creature was legendary, amass Orcs 2.'
    });
    expect(joined.phrases.has('legendary')).toBe(true);
    expect(feedersForTheme(joined, 'legendary')).toEqual(['the ring tempts you']);
    expect(cardMatchesOracleTheme(grima, 'the ring tempts you', joined)).toBe(false);
    expect(cardMatchesOracleTheme(grima, 'legendary')).toBe(true);
  });

  it('names Ring-bearer as a node the Ring feeds, not as Ring itself', () => {
    const bearer = card({
      name: 'Bearer',
      oracleText: 'Target Ring-bearer gets +1/+1.'
    });
    expect(graph.phrases.has('ring-bearer')).toBe(true);
    expect(feedersForTheme(graph, 'ring-bearer')).toEqual(['the ring tempts you']);
    expect(cardMatchesOracleTheme(bearer, 'the ring tempts you', graph)).toBe(false);
    expect(cardMatchesOracleTheme(bearer, 'ring-bearer', graph)).toBe(true);
  });

  it('feeds Army and Orc from Amass reminder without counting an Army as Amass', () => {
    const amasser = card({
      name: 'Muster',
      keywords: ['Amass'],
      oracleText:
        'Amass Orcs 2. (To amass Orcs 2, put two +1/+1 counters on an Army you control. It’s also an Orc. If you don’t control an Army, create a 0/0 black Orc Army creature token first.)'
    });
    const army = card({
      name: 'March',
      typeLine: 'Creature — Orc Army',
      oracleText: 'Other Army creatures you control get +1/+1.'
    });
    const harvested = buildCatalogGraph([amasser], []);
    expect(feedersForTheme(harvested, 'army')).toEqual(['amass']);
    expect(feedersForTheme(harvested, 'orc')).toEqual(['amass']);
    expect(cardMatchesOracleTheme(army, 'amass', harvested)).toBe(false);
    expect(cardMatchesOracleTheme(army, 'army')).toBe(true);
    expect(cardMatchesOracleTheme(amasser, 'amass', harvested)).toBe(true);
  });

  it('offers the Ring feeder when Legendary is attached, ignoring deck cards', () => {
    const joined = buildCatalogGraph([], [fullRing]);
    expect(pickThemeFeed(joined, ['legendary'])).toEqual({
      feeder: 'the ring tempts you',
      feeds: 'legendary'
    });
    expect(pickThemeFeed(joined, ['the ring tempts you', 'legendary'])).toBeNull();
    expect(pickThemeFeed(joined, [])).toBeNull();
  });

  it('does not invert Affinity for Humans into affinity feeds human', () => {
    const riders = card({
      name: 'Riders of the Mark',
      keywords: ['Affinity', 'Haste', 'Trample'],
      oracleText:
        'Affinity for Humans (This spell costs {1} less to cast for each Human you control.)\nHaste\nTrample'
    });
    const harvested = buildCatalogGraph([riders], []);
    expect(feedersForTheme(harvested, 'human')).toEqual([]);
    expect(pickThemeFeed(harvested, ['human'])).toEqual({
      feeder: 'human',
      feeds: 'affinity for humans'
    });
    expect(pickThemeFeed(harvested, ['affinity'])).toBeNull();
  });

  it('offers a feed row for every attached theme', () => {
    const riders = card({
      name: 'Riders of the Mark',
      keywords: ['Affinity'],
      oracleText: 'Affinity for Humans (This spell costs {1} less to cast for each Human you control.)'
    });
    const joined = buildCatalogGraph([riders], [fullRing]);
    expect(pickThemeFeeds(joined, ['human', 'legendary'])).toEqual([
      { feeder: 'human', feeds: 'affinity for humans' },
      { feeder: 'the ring tempts you', feeds: 'legendary' }
    ]);
  });
});
