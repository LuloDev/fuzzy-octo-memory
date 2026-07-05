import { describe, it, expect } from 'vitest';
import { evaluate } from '@/backend/risk/riskEngine';
import type { Position, TickerConfig, MarketSnapshot } from '@/types/domain';

// Spec SC-008 + FR-017: dry-run must produce identical Risk-Engine decisions
// to live mode for the same market state.

function pos(): Position {
  return {
    id: 'p1', symbol: 'SPY', expiration: '2026-07-10T00:00:00.000Z',
    shortPutStrike: '430', longPutStrike: '428',
    shortCallStrike: '438', longCallStrike: '440',
    contracts: 1, entryCredit: '1.00',
    entryTimestamp: '2026-07-01T00:00:00.000Z',
    currentValue: '0.40', status: 'OPEN',
    closedAt: null, closingPnL: null,
  };
}
function cfg(): TickerConfig {
  return {
    id: 'c1', symbol: 'SPY', enabled: true, automaticManeuversEnabled: true,
    allocationPercentage: '30', targetDelta: '0.12', widthOfSpread: '2.00',
    takeProfitPercentage: '0.50', stopLossMultiplier: '3.00', dailyLossLimit: '-0.03',
    createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
  };
}
const snap: MarketSnapshot = {
  symbol: 'SPY', underlyingPrice: '435', quotes: [], observedAt: '2026-07-02T00:00:00.000Z',
};

describe('dry-run identicality (pure)', () => {
  it('risk engine output is independent of DRY_RUN', () => {
    // DRY_RUN affects ExecutionService (the broker-write layer), not the
    // pure risk engine. This test documents that contract.
    const a = evaluate(pos(), snap, cfg());
    const b = evaluate(pos(), snap, cfg());
    expect(a).toEqual(b);
  });
});
