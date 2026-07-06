import { describe, expect, it } from 'vitest';
import { computePerformanceAggregate } from '@/backend/services/performance';

// Hand-constructed scenarios per the spec acceptance criterion for US9.

function position(id: string, pnl: string, closedAt = '2026-07-01T00:00:00Z'): {
  id: string; symbol: string; closingPnL: string; closedAt: string;
} {
  return { id, symbol: 'SPY', closingPnL: pnl, closedAt };
}

describe('computePerformanceAggregate', () => {
  it('marks insufficientSamples when fewer than 5 positions', () => {
    const agg = computePerformanceAggregate([position('a', '50'), position('b', '-50')], '30d');
    expect(agg.insufficientSamples).toBe(true);
    expect(agg.profitFactor).toBeNull();
    expect(agg.winRate).toBeNull();
  });

  it('computes profit factor = 7*50 / 3*80 = 1.458... (spec acceptance)', () => {
    const positions = [
      ...Array.from({ length: 7 }, (_, i) => position(`w${i}`, '50', `2026-06-${(i + 1).toString().padStart(2, '0')}T00:00:00Z`)),
      ...Array.from({ length: 3 }, (_, i) => position(`l${i}`, '-80', `2026-07-${(i + 1).toString().padStart(2, '0')}T00:00:00Z`)),
    ];
    const agg = computePerformanceAggregate(positions, 'all');
    expect(agg.insufficientSamples).toBe(false);
    expect(parseFloat(agg.profitFactor ?? '0')).toBeCloseTo(1.458, 2);
    expect(agg.winRate).toBe('70');
    expect(agg.maxConsecutiveLosses).toBe(3);
  });

  it('reports null maxDrawdown when no losing day exists', () => {
    const positions = Array.from({ length: 6 }, (_, i) => position(`w${i}`, '10', `2026-06-${(i + 1).toString().padStart(2, '0')}T00:00:00Z`));
    const agg = computePerformanceAggregate(positions, 'all');
    expect(agg.maxDrawdown).toBeNull();
  });

  it('handles pure losers without crashing', () => {
    const positions = Array.from({ length: 6 }, (_, i) => position(`l${i}`, '-100', `2026-06-${(i + 1).toString().padStart(2, '0')}T00:00:00Z`));
    const agg = computePerformanceAggregate(positions, 'all');
    expect(agg.winRate).toBe('0');
    expect(agg.maxConsecutiveLosses).toBe(6);
  });
});