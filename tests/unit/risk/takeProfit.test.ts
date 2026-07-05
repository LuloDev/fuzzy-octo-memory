import { describe, it, expect } from 'vitest';
import { evaluateTakeProfit } from '@/backend/risk/maneuvers/takeProfit';
import type { Position, TickerConfig, MarketSnapshot } from '@/types/domain';

function position(over: Partial<Position> = {}): Position {
  return {
    id: 'p1',
    symbol: 'SPY',
    expiration: '2026-07-10T00:00:00.000Z',
    shortPutStrike: '430',
    longPutStrike: '428',
    shortCallStrike: '438',
    longCallStrike: '440',
    contracts: 1,
    entryCredit: '1.00',
    entryTimestamp: '2026-07-01T00:00:00.000Z',
    currentValue: '0.50',
    status: 'OPEN',
    closedAt: null,
    closingPnL: null,
    ...over,
  };
}
function config(over: Partial<TickerConfig> = {}): TickerConfig {
  return {
    id: 'c1',
    symbol: 'SPY',
    enabled: true,
    automaticManeuversEnabled: true,
    allocationPercentage: '30',
    targetDelta: '0.12',
    widthOfSpread: '2.00',
    takeProfitPercentage: '0.50',
    stopLossMultiplier: '3.00',
    dailyLossLimit: '-0.03',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}
function snapshot(over: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    symbol: 'SPY',
    underlyingPrice: '435',
    quotes: [],
    observedAt: '2026-07-02T00:00:00.000Z',
    ...over,
  };
}

describe('evaluateTakeProfit', () => {
  it('emits CloseAll when currentValue == takeProfitPercentage × entryCredit (exact boundary)', () => {
    const p = position({ entryCredit: '1.00', currentValue: '0.50' });
    const c = config({ takeProfitPercentage: '0.50' });
    const out = evaluateTakeProfit(p, snapshot(), c);
    expect(out).toEqual([{ kind: 'CloseAll', positionId: p.id, reason: 'TAKE_PROFIT' }]);
  });

  it('emits CloseAll when currentValue is below the threshold (more profit captured)', () => {
    const out = evaluateTakeProfit(position({ entryCredit: '1.00', currentValue: '0.40' }), snapshot(), config());
    expect(out[0]?.kind).toBe('CloseAll');
  });

  it('emits no intent when above the threshold (no profit yet)', () => {
    const out = evaluateTakeProfit(position({ entryCredit: '1.00', currentValue: '0.80' }), snapshot(), config());
    expect(out).toEqual([]);
  });

  it('respects the per-ticker automaticManeuversEnabled = false by returning []', () => {
    const out = evaluateTakeProfit(
      position({ entryCredit: '1.00', currentValue: '0.40' }),
      snapshot(),
      config({ automaticManeuversEnabled: false }),
    );
    expect(out).toEqual([]);
  });

  it('ignores positions with null currentValue', () => {
    const out = evaluateTakeProfit(position({ currentValue: null }), snapshot(), config());
    expect(out).toEqual([]);
  });

  it('uses decimal math (no float drift) — 0.1 + 0.2 credit case', () => {
    // 0.3 entry, take 50% => close when current <= 0.15
    const out = evaluateTakeProfit(
      position({ entryCredit: '0.30', currentValue: '0.15' }),
      snapshot(),
      config({ takeProfitPercentage: '0.50' }),
    );
    expect(out[0]?.kind).toBe('CloseAll');
  });
});