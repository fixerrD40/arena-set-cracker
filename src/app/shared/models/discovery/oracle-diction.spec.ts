import { describe, expect, it } from 'vitest';
import {
  isGlueStopPhrase,
  parsePrintedNumber,
  phrasePatternTokens,
  tokenizeNormalizedText,
  tokenizeOracle,
  NUM_TOKEN
} from './oracle-diction';

describe('oracle-diction', () => {
  it('folds numeric words and digits to NUM', () => {
    expect(tokenizeOracle('Draw a card.')).toContain(NUM_TOKEN);
    expect(tokenizeOracle('Draw two cards.')).toContain(NUM_TOKEN);
    expect(tokenizeOracle('Draw 2 cards.')).toContain(NUM_TOKEN);
    expect(parsePrintedNumber('three')).toBe(3);
    expect(parsePrintedNumber('3')).toBe(3);
    expect(parsePrintedNumber('x')).toBeNull();
  });

  it('folds plural tokens to singular when both appear in corpus chunk', () => {
    const tokens = tokenizeOracle('draw a card and two cards');
    expect(tokens.filter((token) => token === 'card').length).toBeGreaterThan(0);
    expect(tokens.includes('cards')).toBe(false);
  });

  it('folds MTG timing glue into single tokens before ngrams', () => {
    const tokens = tokenizeNormalizedText('At the beginning of each turn, draw a card.');
    expect(tokens).toContain('at_the_beginning_of');
    expect(tokens).not.toContain('beginning');
    expect(tokens).not.toContain('of');
  });

  it('treats end of turn as glue, not a theme phrase', () => {
    const tokens = tokenizeNormalizedText('Until end of turn, creatures you control get +1/+1.');
    expect(tokens).toContain('until_end_of_turn');
    expect(isGlueStopPhrase('end of turn')).toBe(true);
    expect(isGlueStopPhrase('end of')).toBe(true);
    expect(isGlueStopPhrase('of turn')).toBe(true);
  });

  it('splits display phrases for theme matching', () => {
    expect(phrasePatternTokens('end_of_turn')).toEqual(['end', 'of', 'turn']);
  });
});
