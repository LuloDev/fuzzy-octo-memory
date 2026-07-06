import { describe, expect, it } from 'vitest';
import { Money } from '@/types/money';
import { computeExpectedMove } from '@/backend/services/expectedMove';

describe('computeExpectedMove', () => {
  it('returns factor × straddleMid for non-zero inputs', () => {
    const out = computeExpectedMove(Money.from('500'), Money.from('8.50'));
    expect(out.round(2).toString()).toBe('7.23'); // 0.85 × 8.50 = 7.225 → 7.23
  });

  it('returns Money.zero() when straddle mid is zero', () => {
    expect(computeExpectedMove(Money.from('500'), Money.zero()).isZero()).toBe(true);
  });

  it('throws on negative straddle mid', () => {
    expect(() => computeExpectedMove(Money.from('500'), Money.from('-1'))).toThrow();
  });

  it('throws on negative factor', () => {
    expect(() => computeExpectedMove(Money.from('500'), Money.from('1'), Money.from('-0.1'))).toThrow();
  });

  it('accepts a custom factor', () => {
    expect(computeExpectedMove(Money.from('500'), Money.from('10'), Money.from('1.0')).toString()).toBe('10');
  });
});