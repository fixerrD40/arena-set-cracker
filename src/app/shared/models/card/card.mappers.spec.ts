import { ScryfallCard } from '../../../core/services/api/scryfall/models/card.scryfall';
import { mapScryfallToCard } from './card.mappers';

describe('mapScryfallToCard', () => {
  it('copies oracle_text from a single-faced card', () => {
    const apiCard = new ScryfallCard({
      id: 'scry-dawn',
      name: 'Dawn of a New Age',
      oracle_text: 'Scry 1. You gain 1 life.'
    });

    expect(mapScryfallToCard(apiCard, 'set-ltr').oracleText).toBe(
      'Scry 1. You gain 1 life.'
    );
  });

  it('joins face oracle_text when the card has no top-level oracle_text', () => {
    const apiCard = new ScryfallCard({
      id: 'scry-mdfc',
      name: 'Front // Back',
      card_faces: [
        { name: 'Front', oracle_text: 'Draw a card.' },
        { name: 'Back', oracle_text: 'Create a token.' }
      ]
    });

    expect(mapScryfallToCard(apiCard, 'set-ltr').oracleText).toBe(
      'Draw a card.\nCreate a token.'
    );
  });

  it('stores framed art and illustration crop URIs independently', () => {
    const apiCard = new ScryfallCard({
      id: 'scry-dawn',
      name: 'Dawn of a New Age'
    });

    const mapped = mapScryfallToCard(
      apiCard,
      'set-ltr',
      'cached_art/ltr/1.png',
      'cached_art/ltr/1-art.jpg'
    );

    expect(mapped.localArtUri).toBe('cached_art/ltr/1.png');
    expect(mapped.localIllustrationUri).toBe('cached_art/ltr/1-art.jpg');
  });

  it('defaults both art URIs to empty when install has no files yet', () => {
    const apiCard = new ScryfallCard({
      id: 'scry-dawn',
      name: 'Dawn of a New Age'
    });

    const mapped = mapScryfallToCard(apiCard, 'set-ltr');

    expect(mapped.localArtUri).toBe('');
    expect(mapped.localIllustrationUri).toBe('');
  });

  it('copies keywords and printed power/toughness', () => {
    const apiCard = new ScryfallCard({
      id: 'scry-bear',
      name: 'Grizzly Bears',
      keywords: ['Trample'],
      power: '2',
      toughness: '2'
    });

    const mapped = mapScryfallToCard(apiCard, 'set-ltr');
    expect(mapped.keywords).toEqual(['Trample']);
    expect(mapped.power).toBe('2');
    expect(mapped.toughness).toBe('2');
  });

  it('reads power and toughness from the front face when the card has none', () => {
    const apiCard = new ScryfallCard({
      id: 'scry-mdfc',
      name: 'Front // Back',
      card_faces: [{ name: 'Front', power: '3', toughness: '2' }]
    });

    const mapped = mapScryfallToCard(apiCard, 'set-ltr');
    expect(mapped.power).toBe('3');
    expect(mapped.toughness).toBe('2');
  });

  it('uses empty oracle text when Scryfall omitted it', () => {
    const apiCard = new ScryfallCard({
      id: 'scry-land',
      name: 'Swamp'
    });

    expect(mapScryfallToCard(apiCard, 'set-ltr').oracleText).toBe('');
  });
});
