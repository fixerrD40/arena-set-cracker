import { describe, expect, it } from 'vitest';
import { classifyHydrate, EPOCH_ISO } from './sync-timestamp';

describe('classifyHydrate', () => {
  const base = '2026-01-01T00:00:00.000Z';
  const localAhead = '2026-01-02T00:00:00.000Z';
  const cloudAhead = '2026-01-03T00:00:00.000Z';

  it('takes theirs when there is no local row', () => {
    expect(
      classifyHydrate({
        hasLocal: false,
        cloudUpdatedAt: cloudAhead
      })
    ).toBe('take-theirs');
  });

  it('noops when local and cloud tips match', () => {
    expect(
      classifyHydrate({
        hasLocal: true,
        localUpdatedAt: localAhead,
        mergeBaseUpdatedAt: base,
        cloudUpdatedAt: localAhead
      })
    ).toBe('noop');
  });

  it('bootstraps without a base: newer local keeps yours', () => {
    expect(
      classifyHydrate({
        hasLocal: true,
        localUpdatedAt: localAhead,
        cloudUpdatedAt: base
      })
    ).toBe('keep-yours');
  });

  it('bootstraps without a base: newer cloud takes theirs', () => {
    expect(
      classifyHydrate({
        hasLocal: true,
        localUpdatedAt: base,
        cloudUpdatedAt: cloudAhead
      })
    ).toBe('take-theirs');
  });

  it('fast-forwards to theirs when only cloud moved past base', () => {
    expect(
      classifyHydrate({
        hasLocal: true,
        localUpdatedAt: base,
        mergeBaseUpdatedAt: base,
        cloudUpdatedAt: cloudAhead
      })
    ).toBe('take-theirs');
  });

  it('keeps yours when only local moved past base', () => {
    expect(
      classifyHydrate({
        hasLocal: true,
        localUpdatedAt: localAhead,
        mergeBaseUpdatedAt: base,
        cloudUpdatedAt: base
      })
    ).toBe('keep-yours');
  });

  it('conflicts when both moved past base with different tips', () => {
    expect(
      classifyHydrate({
        hasLocal: true,
        localUpdatedAt: localAhead,
        mergeBaseUpdatedAt: base,
        cloudUpdatedAt: cloudAhead
      })
    ).toBe('conflict');
  });

  it('treats blank updatedAt as epoch (loses)', () => {
    expect(
      classifyHydrate({
        hasLocal: true,
        localUpdatedAt: '',
        mergeBaseUpdatedAt: base,
        cloudUpdatedAt: cloudAhead
      })
    ).toBe('take-theirs');
    expect(EPOCH_ISO < base).toBe(true);
  });
});
