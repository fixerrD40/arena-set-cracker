import { formatArenaDeckExport, parseArenaText, parseArenaTextToDeckMap, resolveArenaLinesToCardMap } from './deck.utils';
import { MtgCard } from '../card/card';

describe('Deck Domain Engine (Pure Functional)', () => {
  const exampleRaw = `
Deck
1 Dawn of a New Age (LTR) 5
9 Swamp (LTR) 266
10 Plains (LTR) 263
3 Easterling Vanguard (LTR) 83
3 Soldier of the Grey Host (LTR) 32
1 Minas Tirith (LTR) 256
3 Shadow Summoning (LTR) 226
3 Esquire of the King (LTR) 13
2 Forge Anew (LTR) 17
2 Dúnedain Blade (LTR) 6
2 Haunt of the Dead Marshes (LTR) 90
2 King of the Oathbreakers (LTR) 211
1 Andúril, Flame of the West (LTR) 236
2 Oath of the Grey Host (LTR) 101
3 Dunland Crebain (LTR) 82
2 Gothmog, Morgul Lieutenant (LTR) 87
2 Faramir, Field Commander (LTR) 14
2 Denethor, Ruling Steward (LTR) 198
2 Inherited Envelope (LTR) 242
1 Aragorn and Arwen, Wed (LTR) 287
2 Bitter Downfall (LTR) 77
2 The Black Breath (LTR) 78
`;

  const badRaw = `
Deck
Malformed Line Without Brackets Or Numbers
Another Stray Text Line 1234
`;

  describe('parseArenaText', () => {
    it('tokenizes valid Arena lines including the Deck header skip', () => {
      const lines = parseArenaText(exampleRaw);
      expect(lines.length).toBe(22);
      expect(lines[0].name).toBe('Dawn of a New Age');
      expect(lines[0].set).toBe('LTR');
      expect(lines[0].collectorNumber).toBe(5);
      expect(lines[0].quantity).toBe(1);
    });

    it('returns empty for blank input', () => {
      expect(parseArenaText('').length).toBe(0);
    });

    it('skips malformed lines', () => {
      expect(parseArenaText(badRaw).length).toBe(0);
    });

    it('aggregates via resolve when duplicate lines share a catalog name', () => {
      const duplicateLinesRaw = `
        1 Dawn of a New Age (LTR) 5
        3 Dawn of a New Age (LTR) 5
      `;
      const catalog: MtgCard[] = [
        {
          id: 'scry-dawn',
          setId: 'set-ltr',
          arenaId: 1,
          collectorNumber: '5',
          scryfallId: 'scry-dawn',
          name: 'Dawn of a New Age',
          localArtUri: '',
          localIllustrationUri: '',
          typeLine: 'Enchantment',
          colors: ['W'],
          rarity: 'rare',
          manaCost: '{1}{W}',
          oracleText: '',
        keywords: [],
        power: '',
        toughness: '',
          keywords: [],
          power: '',
          toughness: ''
        }
      ];
      const { cards, unmatched } = resolveArenaLinesToCardMap(
        parseArenaText(duplicateLinesRaw),
        catalog
      );
      expect(unmatched.length).toBe(0);
      expect(cards.get('scry-dawn')).toBe(4);
    });
  });

  describe('resolveArenaLinesToCardMap', () => {
    const catalog: MtgCard[] = [
      {
        id: 'id-swamp',
        setId: 'set-ltr',
        arenaId: 10,
        collectorNumber: '266',
        scryfallId: 'id-swamp',
        name: 'Swamp',
        localArtUri: '',
        localIllustrationUri: '',
        typeLine: 'Basic Land — Swamp',
        colors: [],
        rarity: 'common',
        manaCost: '',
        oracleText: '',
        keywords: [],
        power: '',
        toughness: ''
      },
      {
        id: 'id-dawn',
        setId: 'set-ltr',
        arenaId: 5,
        collectorNumber: '5',
        scryfallId: 'id-dawn',
        name: 'Dawn of a New Age',
        localArtUri: '',
        localIllustrationUri: '',
        typeLine: 'Enchantment',
        colors: ['W'],
        rarity: 'rare',
        manaCost: '{1}{W}',
        oracleText: '',
        keywords: [],
        power: '',
        toughness: ''
      }
    ];

    it('maps matched names to catalog ids and strips outsiders', () => {
      const paste = `
1 Dawn of a New Age (LTR) 5
9 Swamp (LTR) 266
1 Outside Card (XYZ) 99
`;
      const { cards, unmatched } = resolveArenaLinesToCardMap(parseArenaText(paste), catalog);
      expect(cards.size).toBe(2);
      expect(cards.get('id-dawn')).toBe(1);
      expect(cards.get('id-swamp')).toBe(9);
      expect(unmatched.length).toBe(1);
      expect(unmatched[0].name).toBe('Outside Card');
    });
  });

  describe('formatArenaDeckExport', () => {
    const catalog: MtgCard[] = [
      {
        id: 'id-swamp',
        setId: 'set-ltr',
        arenaId: 87581,
        collectorNumber: '266',
        scryfallId: 'id-swamp',
        name: 'Swamp',
        localArtUri: '',
        localIllustrationUri: '',
        typeLine: 'Basic Land — Swamp',
        colors: [],
        rarity: 'common',
        manaCost: '',
        oracleText: '',
        keywords: [],
        power: '',
        toughness: ''
      },
      {
        id: 'id-dawn',
        setId: 'set-ltr',
        arenaId: 84697,
        collectorNumber: '5',
        scryfallId: 'id-dawn',
        name: 'Dawn of a New Age',
        localArtUri: '',
        localIllustrationUri: '',
        typeLine: 'Enchantment',
        colors: ['W'],
        rarity: 'rare',
        manaCost: '{1}{W}',
        oracleText: '',
        keywords: [],
        power: '',
        toughness: ''
      }
    ];

    it('writes Arena paste lines with set collector numbers', () => {
      const result = formatArenaDeckExport(
        [
          { card: catalog[1], quantity: 1 },
          { card: catalog[0], quantity: 9 }
        ],
        'ltr'
      );

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.text).toBe(
        ['Deck', '1 Dawn of a New Age (LTR) 5', '9 Swamp (LTR) 266'].join('\n')
      );
      expect(parseArenaText(result.text).length).toBe(2);
    });

    it('rejects export when collector numbers are missing', () => {
      const broken: MtgCard = { ...catalog[0], collectorNumber: '' };
      const result = formatArenaDeckExport([{ card: broken, quantity: 1 }], 'ltr');
      expect(result.ok).toBe(false);
    });
  });

  describe('parseArenaTextToDeckMap (legacy)', () => {
    it('still keys by collector number for backward compatibility', () => {
      const cardMap = parseArenaTextToDeckMap(exampleRaw);
      expect(cardMap.size).toBe(22);
      expect(cardMap.get('5')).toBe(1);
      expect(cardMap.get('266')).toBe(9);
    });
  });
});
