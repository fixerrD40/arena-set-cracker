import { flattenOracleText, markStructuralElements, parseOracleText } from './oracle-parser';

describe('oracle-parser', () => {
  it('marks trigger and condition prefixes without keeping them in flattened subjects', () => {
    const text = 'Whenever you draw a card, draw a card.';
    const marks = markStructuralElements(text);
    expect(marks.some((mark) => mark.type === 'trigger' && mark.prefix === 'whenever')).toBe(true);

    const flat = flattenOracleText(text);
    expect(flat.triggers).toEqual(['you draw a card']);
    expect(flat.triggers.some((entry) => /whenever/i.test(entry))).toBe(false);
  });

  it('extracts condition subjects and leaf effects separately', () => {
    const text = 'If you control a Wizard, draw two cards.';
    const flat = flattenOracleText(text);
    expect(flat.conditions).toEqual(['you control a Wizard']);
    expect(flat.effects.some((entry) => entry.includes('draw two cards'))).toBe(true);
  });

  it('leaves reflexive clause prefixes out of ngram fields', () => {
    const text = 'Whenever a creature dies, you may draw a card. When you do, create a Treasure token.';
    const flat = flattenOracleText(text);
    expect(flat.triggers.some((entry) => entry.includes('you do'))).toBe(false);
    expect(flat.effects.some((entry) => entry.includes('create a Treasure token'))).toBe(true);
  });

  it('keeps a condition nested inside an activated ability', () => {
    const flat = flattenOracleText(
      '{T}, Sacrifice another creature: Target player loses 1 life. If the sacrificed creature was legendary, amass Orcs 2.'
    );
    expect(flat.conditions).toEqual(['the sacrificed creature was legendary']);
    expect(flat.effects.some((entry) => /amass orcs 2/i.test(entry))).toBe(true);
  });

  it('parses activated ability effect text after the colon', () => {
    const text = '{T}: Draw a card.';
    const parsed = parseOracleText(text);
    const flat = flattenOracleText(text);
    expect(parsed.length).toBeGreaterThan(0);
    expect(flat.effects.some((entry) => entry.toLowerCase().includes('draw a card'))).toBe(true);
  });
});
