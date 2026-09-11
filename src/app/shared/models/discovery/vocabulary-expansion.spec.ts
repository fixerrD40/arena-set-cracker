import { MtgCard } from '../card/card';
import { SetVocabulary } from '../card/set-vocabulary';
import { cardMatchesOracleTheme } from './theme-match';
import { buildVocabularyExpansion } from './vocabulary-expansion';

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

describe('vocabulary expansion', () => {
  const food = vocab({
    name: 'Food',
    typeLine: 'Token Artifact — Food',
    oracleText: 'Food tokens have “{2}, {T}, Sacrifice this artifact: You gain 3 life.”'
  });
  const ring = vocab({
    name: 'The Ring Tempts You',
    oracleText:
      'As the Ring tempts you, you get an emblem named The Ring if you don’t have one. Then your emblem gains its next ability and you choose a creature you control to become or remain your Ring-bearer.\n\n• The Ring can tempt you even if you don’t control a creature.\n\n• Each player can have only one emblem named The Ring and only one Ring-bearer at a time.'
  });
  const expansion = buildVocabularyExpansion([food, ring]);

  it('keys companion rows by name, not a closed list', () => {
    expect(expansion.has('food')).toBe(true);
    expect(expansion.has('the ring tempts you')).toBe(true);
  });

  it('keeps the helper as the theme and joins its printed ability', () => {
    const baker = card({
      name: 'Baker',
      oracleText: '{2}, {T}, Sacrifice this artifact: You gain 3 life.'
    });
    const flyer = card({ name: 'Bird', oracleText: 'Flying', keywords: ['Flying'] });
    expect(cardMatchesOracleTheme(baker, 'food', expansion)).toBe(true);
    expect(cardMatchesOracleTheme(flyer, 'food', expansion)).toBe(false);
    expect(cardMatchesOracleTheme(baker, 'food')).toBe(false);
  });

  it('joins a legendary condition to the Ring node by adjacency', () => {
    const fullRing = vocab({
      name: 'The Ring Tempts You',
      oracleText:
        'As the Ring tempts you, you get an emblem named The Ring if you don’t have one. Then your emblem gains its next ability and you choose a creature you control to become or remain your Ring-bearer.\n\nYour Ring-bearer is legendary and can’t be blocked by creatures with greater power.\n\nWhenever your Ring-bearer attacks, draw a card, then discard a card.'
    });
    const joined = buildVocabularyExpansion([fullRing]);
    const grima = card({
      name: 'Gríma Wormtongue',
      typeLine: 'Legendary Creature — Human Advisor',
      oracleText:
        'Your opponents can’t gain life.\n\n{T}, Sacrifice another creature: Target player loses 1 life. If the sacrificed creature was legendary, amass Orcs 2.'
    });
    expect(cardMatchesOracleTheme(grima, 'the ring tempts you', joined)).toBe(true);
    expect(cardMatchesOracleTheme(grima, 'the ring tempts you')).toBe(false);
  });

  it('joins Ring-bearer text to the Ring keyword node', () => {
    const bearer = card({
      name: 'Bearer',
      oracleText: 'Target Ring-bearer gets +1/+1.'
    });
    const unrelated = card({ name: 'Soldier', oracleText: 'Create a 1/1 white Soldier creature token.' });
    expect(cardMatchesOracleTheme(bearer, 'the ring tempts you', expansion)).toBe(true);
    expect(cardMatchesOracleTheme(unrelated, 'the ring tempts you', expansion)).toBe(false);
  });

  it('joins Amass reminder text the same way as a helper node', () => {
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
    const flyer = card({ name: 'Bird', oracleText: 'Flying', keywords: ['Flying'] });
    const harvested = buildVocabularyExpansion([], [amasser]);
    expect(cardMatchesOracleTheme(army, 'amass', harvested)).toBe(true);
    expect(cardMatchesOracleTheme(flyer, 'amass', harvested)).toBe(false);
    expect(cardMatchesOracleTheme(army, 'amass')).toBe(false);
  });
});
