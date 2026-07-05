import { describe, it, expect } from 'vitest';
import { evaluateStopLoss } from '@/backend/risk/maneuvers/stopLoss';
import type { Position, TickerConfig, MarketSnapshot } from '@/types/domain';

function position(over: Partial<Position> = {}): Position {
  return {
    id: 'p1', symbol: 'SPY', expiration: '2026-07-10T00:00:00.000Z',
    shortPutStrike: '430', longPutStrike: '428',
    shortCallStrike: '438', longCallStrike: '440',
    contracts: 1, entryCredit: '1.00',
    entryTimestamp: '2026-07-01T00:00:00.000Z',
    currentValue: '3.00', status: 'OPEN',
    closedAt: null, closingPnL: null, ...over,
  };
}
function config(over: Partial<TickerConfig> = {}): TickerConfig {
  return {
    id: 'c1', symbol: 'SPY', enabled: true, automaticManeuversEnabled: true,
    allocationPercentage: '30', targetDelta: '0.12', widthOfSpread: '2.00',
    takeProfitPercentage: '0.50', stopLossMultiplier: '3.00',
    dailyLossLimit: '-0.03',
    createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}
const snap: MarketSnapshot = { symbol: 'SPY', underlyingPrice: '435', quotes: [], observedAt: '2026-07-02T00:00:00.000Z' };

describe('evaluateStopLoss', () => {
  it('emits CloseAll when currentValue >= stopLossMultiplier × entryCredit (boundary)', () => {
    const out = evaluateStopLoss(position({ entryCredit: '1.00', currentValue: '3.00' }), snap, config());
    expect(out).toEqual([{ kind: 'CloseAll', positionId: 'p1', reason: 'STOP_LOSS' }]);
  });

  it('emits CloseAll when above the threshold (loss worse)', () => {
    const out = evaluateStopLoss(position({ entryCredit: '1.00', currentValue: '5.00' }), snap, config());
    expect(out[0]?.kind).toBe('CloseAll');
  });

  it('emits no intent below threshold', () => {
    const out = evaluateStopLoss(position({ entryCredit: '1.00', currentValue: '2.00' }), snap, config());
    expect(out).toEqual([]);
  });

  it('respects automaticManeuversEnabled = false', () => {
    const out = evaluateStopLoss(
      position({ entryCredit: '1.00', currentValue: '5.00' }),
      snap,
      config({ automaticManeuversEnabled: false }),
    );
    expect(out).toEqual([]);
  });
});