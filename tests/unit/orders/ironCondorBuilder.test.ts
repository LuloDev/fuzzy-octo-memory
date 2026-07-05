import { describe, it, expect } from 'vitest';
import { buildOpenOrder, defaultOsi, planStrikes, computeNetCredit } from '@/backend/orders/ironCondorBuilder';
import type { TickerConfig, MarketSnapshot } from '@/types/domain';

function cfg(over: Partial<TickerConfig> = {}): TickerConfig {
  return {
    id: 'c1', symbol: 'SPY', enabled: true, automaticManeuversEnabled: true,
    allocationPercentage: '30', targetDelta: '0.12', widthOfSpread: '2.00',
    takeProfitPercentage: '0.50', stopLossMultiplier: '3.00', dailyLossLimit: '-0.03',
    createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', ...over,
  };
}
function snap(quotes: MarketSnapshot['quotes']): MarketSnapshot {
  return { symbol: 'SPY', underlyingPrice: '435', quotes, observedAt: '2026-07-02T00:00:00.000Z' };
}

describe('defaultOsi', () => {
  it('formats an OSI option symbol', () => {
    expect(defaultOsi('put', '430', '2026-07-10', 'SPY')).toBe('SPY260710P00430000');
    expect(defaultOsi('call', '438', '2026-07-10', 'SPY')).toBe('SPY260710C00438000');
  });
});

describe('planStrikes', () => {
  it('picks strikes by delta proximity to target', () => {
    const quotes = [
      { symbol: 'SPY260710P00430000', side: 'put' as const, strike: '430', bid: '1.0', ask: '1.1', quotedAt: 't', delta: '-0.12' },
      { symbol: 'SPY260710P00428000', side: 'put' as const, strike: '428', bid: '0.6', ask: '0.7', quotedAt: 't', delta: '-0.08' },
      { symbol: 'SPY260710C00438000', side: 'call' as const, strike: '438', bid: '1.0', ask: '1.1', quotedAt: 't', delta: '0.12' },
      { symbol: 'SPY260710C00440000', side: 'call' as const, strike: '440', bid: '0.6', ask: '0.7', quotedAt: 't', delta: '0.08' },
    ];
    const plan = planStrikes(cfg(), snap(quotes), '2026-07-10', 1);
    expect(plan.shortPut).toBe('430');
    expect(plan.shortCall).toBe('438');
    expect(plan.longPut).toBe('428');
    expect(plan.longCall).toBe('440');
  });

  it('falls back to width-walk when no delta-tagged quotes exist', () => {
    const plan = planStrikes(cfg({ widthOfSpread: '2.00' }), snap([]), '2026-07-10', 1);
    // fallback uses underlying 435 − 2 = 433 short put; 435 + 2 = 437 short call
    expect(plan.shortPut).toBe('433');
    expect(plan.shortCall).toBe('437');
  });
});

describe('computeNetCredit', () => {
  it('sums mid-prices with correct signs (sell short, buy long)', () => {
    const plan = { expiration: '2026-07-10', shortPut: '430', longPut: '428', shortCall: '438', longCall: '440', contracts: 1 };
    const quotes = [
      { symbol: 'SPY260710P00430000', side: 'put' as const, strike: '430', bid: '1.00', ask: '1.20', quotedAt: 't' },
      { symbol: 'SPY260710P00428000', side: 'put' as const, strike: '428', bid: '0.40', ask: '0.60', quotedAt: 't' },
      { symbol: 'SPY260710C00438000', side: 'call' as const, strike: '438', bid: '1.00', ask: '1.20', quotedAt: 't' },
      { symbol: 'SPY260710C00440000', side: 'call' as const, strike: '440', bid: '0.40', ask: '0.60', quotedAt: 't' },
    ];
    // mid: shortPut 1.10 + shortCall 1.10 − longPut 0.50 − longCall 0.50 = 1.20, ×100 = 120
    const credit = computeNetCredit(plan, quotes);
    expect(credit.toString()).toBe('120');
  });
});

describe('buildOpenOrder', () => {
  it('produces a valid mleg payload with order_class=mleg and 4 legs', () => {
    const quotes = [
      { symbol: 'SPY260710P00430000', side: 'put' as const, strike: '430', bid: '1.00', ask: '1.20', quotedAt: 't', delta: '-0.12' },
      { symbol: 'SPY260710P00428000', side: 'put' as const, strike: '428', bid: '0.40', ask: '0.60', quotedAt: 't', delta: '-0.08' },
      { symbol: 'SPY260710C00438000', side: 'call' as const, strike: '438', bid: '1.00', ask: '1.20', quotedAt: 't', delta: '0.12' },
      { symbol: 'SPY260710C00440000', side: 'call' as const, strike: '440', bid: '0.40', ask: '0.60', quotedAt: 't', delta: '0.08' },
    ];
    const out = buildOpenOrder(cfg(), snap(quotes), '2026-07-10', 1);
    expect(out.payload.order_class).toBe('mleg');
    expect(out.payload.legs).toHaveLength(4);
    expect(out.payload.qty).toBe('1');
    expect(out.payload.symbol).toBe('SPY');
    // Every leg has a 16-char OSI symbol: 3-char ticker + 6-char date + P/C + 8-digit strike.
    for (const leg of out.payload.legs) {
      expect(leg.symbol).toMatch(/^SPY260710[PC]\d{8}$/);
    }
    // Limit price is the net credit, computed via Money (string).
    expect(typeof out.payload.limit_price).toBe('string');
  });
});