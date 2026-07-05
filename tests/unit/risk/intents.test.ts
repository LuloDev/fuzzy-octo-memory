import { describe, it, expect } from 'vitest';
import type { Intent } from '@/types/domain';

// Discriminated-union exhaustiveness test: every Intent kind must be handled by
// a switch that returns a valid outcome. This guards against silent omissions.
function classify(intent: Intent): 'hold' | 'act' | 'reject' {
  switch (intent.kind) {
    case 'Hold':
      return 'hold';
    case 'CloseAll':
    case 'RollUntestedSide':
    case 'Open':
      return 'act';
    case 'Reject':
      return 'reject';
    default: {
      const _exhaustive: never = intent;
      throw new Error(`unhandled intent: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

describe('Intent discriminated union', () => {
  it('Hold is non-actionable', () => {
    expect(classify({ kind: 'Hold' })).toBe('hold');
  });

  it('CloseAll is actionable', () => {
    expect(classify({ kind: 'CloseAll', positionId: 'p', reason: 'TAKE_PROFIT' })).toBe('act');
  });

  it('RollUntestedSide is actionable', () => {
    expect(
      classify({
        kind: 'RollUntestedSide',
        positionId: 'p',
        threatenedSide: 'put',
        newShortStrike: '420',
        newLongStrike: '418',
      }),
    ).toBe('act');
  });

  it('Open is actionable', () => {
    expect(classify({ kind: 'Open', configId: 'c', expiration: '2026-07-10' })).toBe('act');
  });

  it('Reject is non-actionable but carries reason', () => {
    expect(classify({ kind: 'Reject', reason: 'MARGIN_INSUFFICIENT' })).toBe('reject');
  });
});