import { describe, expect, it } from 'vitest';
import { MtgDeck } from './deck';
import {
  agreedCardMap,
  residualSideCardMap,
  initialMergeResult
} from './deck-diff';

function deck(partial: Partial<MtgDeck> & Pick<MtgDeck, 'id' | 'name'>): MtgDeck {
  return {
    id: partial.id,
    setId: partial.setId ?? 'set-1',
    name: partial.name,
    status: partial.status ?? 'concept',
    themes: partial.themes ?? [],
    notes: partial.notes ?? '',
    coverCardId: partial.coverCardId ?? '',
    cards: partial.cards ?? new Map(),
    updatedAt: partial.updatedAt,
    mergeBaseUpdatedAt: partial.mergeBaseUpdatedAt
  };
}

describe('agreedCardMap / residualSideCardMap', () => {
  it('puts overlapping qty in agreed and excess on the heavier side', () => {
    const yours = new Map([
      ['shared', 4],
      ['yoursOnly', 2],
      ['mismatch', 4]
    ]);
    const theirs = new Map([
      ['shared', 4],
      ['theirsOnly', 1],
      ['mismatch', 2]
    ]);

    expect([...agreedCardMap(yours, theirs).entries()].sort()).toEqual([
      ['mismatch', 2],
      ['shared', 4]
    ]);

    const result = new Map(agreedCardMap(yours, theirs));
    expect([...residualSideCardMap(yours, theirs, result).entries()].sort()).toEqual([
      ['mismatch', 2],
      ['yoursOnly', 2]
    ]);
    expect([...residualSideCardMap(theirs, yours, result).entries()].sort()).toEqual([
      ['theirsOnly', 1]
    ]);
  });

  it('theirs x1 / yours x3 → result x1, yours residual x2', () => {
    const yours = new Map([['a', 3]]);
    const theirs = new Map([['a', 1]]);
    const result = agreedCardMap(yours, theirs);
    expect([...result.entries()]).toEqual([['a', 1]]);
    expect(residualSideCardMap(yours, theirs, result).get('a')).toBe(2);
    expect(residualSideCardMap(theirs, yours, result).get('a')).toBeUndefined();
  });

  it('shrinks residuals as result absorbs copies', () => {
    const yours = new Map([['a', 3]]);
    const theirs = new Map([['a', 1]]);
    const result = new Map([['a', 2]]);
    expect(residualSideCardMap(yours, theirs, result).get('a')).toBe(1);
    expect(residualSideCardMap(theirs, yours, result).get('a')).toBeUndefined();
  });
});

describe('initialMergeResult', () => {
  it('starts middle with agreed cards and yours metadata', () => {
    const yours = deck({
      id: 'd1',
      name: 'Yours Name',
      cards: new Map([
        ['shared', 4],
        ['y', 1]
      ])
    });
    const theirs = deck({
      id: 'd1',
      name: 'Theirs Name',
      cards: new Map([
        ['shared', 4],
        ['t', 1]
      ])
    });
    const result = initialMergeResult(yours, theirs);
    expect(result.name).toBe('Yours Name');
    expect([...result.cards.entries()]).toEqual([['shared', 4]]);
  });
});
