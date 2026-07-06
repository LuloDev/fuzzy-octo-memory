import { describe, expect, it } from 'vitest';
import { computeSlippage, aggregateSlippage } from '@/backend/services/slippage';

describe('computeSlippage', () => {
  it('returns null rows when filled price is missing', () => {
    const r = computeSlippage({ positionId: 'p1', symbol: 'SPY', contracts: 1, sentLimitPrice: '1.20', filledAvgPrice: null });
    expect(r.slippagePerShare).toBeNull();
    expect(r.slippagePerCombo).toBeNull();
  });

  it('returns null rows when sent price is missing', () => {
    const r = computeSlippage({ positionId: 'p1', symbol: 'SPY', contracts: 1, sentLimitPrice: null, filledAvgPrice: '1.20' });
    expect(r.slippagePerShare).toBeNull();
  });

  it('computes positive slippage when fill is worse than the sent mid', () => {
    const r = computeSlippage({ positionId: 'p1', symbol: 'SPY', contracts: 2, sentLimitPrice: '1.20', filledAvgPrice: '1.30' });
    expect(r.slippagePerShare).toBe('-0.1'); // we paid more (credit smaller)
    expect(r.slippagePerCombo).toBe('-20'); // 0.10 × 2 × 100
  });

  it('computes zero slippage when sent == filled', () => {
    const r = computeSlippage({ positionId: 'p1', symbol: 'SPY', contracts: 1, sentLimitPrice: '1.20', filledAvgPrice: '1.20' });
    expect(r.slippagePerShare).toBe('0');
  });
});

describe('aggregateSlippage', () => {
  it('percentiles are null with no filled rows', () => {
    const a = aggregateSlippage([
      computeSlippage({ positionId: 'p', symbol: 'SPY', contracts: 1, sentLimitPrice: '1', filledAvgPrice: null }),
    ]);
    expect(a.medianPerShare).toBeNull();
    expect(a.histogram.notFilled).toBe(1);
  });

  it('buckets correctly', () => {
    const rows = [
      computeSlippage({ positionId: 'a', symbol: 'SPY', contracts: 1, sentLimitPrice: '1', filledAvgPrice: '0.99' }), // 0.01 → under5c
      computeSlippage({ positionId: 'b', symbol: 'SPY', contracts: 1, sentLimitPrice: '1', filledAvgPrice: '0.90' }), // 0.10 → 5-15c
      computeSlippage({ positionId: 'c', symbol: 'SPY', contracts: 1, sentLimitPrice: '1', filledAvgPrice: '0.80' }), // 0.20 → >15c
    ];
    const a = aggregateSlippage(rows);
    expect(a.histogram.under5c).toBe(1);
    expect(a.histogram.fiveToFifteen).toBe(1);
    expect(a.histogram.over15c).toBe(1);
  });
});