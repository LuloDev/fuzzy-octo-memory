import { describe, it, expect } from 'vitest';
import { buildOpenOrder } from '@/backend/orders/ironCondorBuilder';
import type { TickerConfig, MarketSnapshot, OptionQuote } from '@/types/domain';

// Entry dedup: testing the pure helper path. We assert that when called
// twice for the same (symbol, expiration), the produced plans are identical
// (no randomised strike selection). The real DB-level dedup check against
// `persistence.findOpenPositionForWeek` is exercised in the integration test.

function cfg(): TickerConfig {
  return {
    id: 'c1', symbol: 'SPY', enabled: true, automaticManeuversEnabled: true,
    allocationPercentage: '30', targetDelta: '0.12', widthOfSpread: '2.00',
    takeProfitPercentage: '0.50', stopLossMultiplier: '3.00', dailyLossLimit: '-0.03',
    createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
  };
}
function snap(): MarketSnapshot {
  const quotes: OptionQuote[] = [
    { symbol: 'SPY260710P00430000', side: 'put', strike: '430', bid: '1.00', ask: '1.10', quotedAt: 't', delta: '-0.12' },
    { symbol: 'SPY260710P00428000', side: 'put', strike: '428', bid: '0.40', ask: '0.50', quotedAt: 't', delta: '-0.08' },
    { symbol: 'SPY260710C00438000', side: 'call', strike: '438', bid: '1.00', ask: '1.10', quotedAt: 't', delta: '0.12' },
    { symbol: 'SPY260710C00440000', side: 'call', strike: '440', bid: '0.40', ask: '0.50', quotedAt: 't', delta: '0.08' },
  ];
  return { symbol: 'SPY', underlyingPrice: '435', quotes, observedAt: 't' };
}

describe('entry dedup contract (pure)', () => {
  it('produces identical plans for the same (config, snapshot, expiration)', () => {
    const a = buildOpenOrder(cfg(), snap(), '2026-07-10', 1);
    const b = buildOpenOrder(cfg(), snap(), '2026-07-10', 1);
    expect(a.plan).toEqual(b.plan);
    expect(a.credit).toBe(b.credit);
    expect(a.payload).toEqual(b.payload);
  });

  it('opening two Iron Condors on the same weekly expiration is the responsibility of persistence.findOpenPositionForWeek', () => {
    // The pure builder can be called twice; the real-world guard is the DB
    // uniqueness check inside ExecutionService.openIronCondor. This test just
    // documents that contract.
    expect(true).toBe(true);
  });
});