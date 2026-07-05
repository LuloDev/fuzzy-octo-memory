import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Money } from '@/types/money';

// Real invariants the dashboard / payoff endpoint rely on.
// All generators produce finite, two-decimal strings (no NaN/Infinity).

const finiteMoney = fc
  .integer({ min: 1, max: 9999 })
  .map((cents) => (cents / 100).toFixed(2));

function maxProfitByCredit(credit: string, contracts: number): Money {
  return Money.from(credit).times(contracts * 100);
}

function maxLossPerCombo(width: string, credit: string): Money {
  // Per-share loss when price crashes below longPut: width − credit (positive when credit < width).
  return Money.from(width).minus(Money.from(credit));
}

describe('PnL reconciliation property', () => {
  it('max profit = credit × contracts × 100 is positive when credit > 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        finiteMoney,
        (contracts, credit) => {
          const mp = maxProfitByCredit(credit, contracts);
          return mp.isPositive();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('max loss per combo = width − credit is positive when width > credit', () => {
    fc.assert(
      fc.property(finiteMoney, finiteMoney, (width, credit) => {
        fc.pre(parseFloat(width) > parseFloat(credit)); // ensure width > credit
        const loss = maxLossPerCombo(width, credit);
        return loss.isPositive();
      }),
      { numRuns: 100 },
    );
  });

  it('decimal sum of credits across N contracts equals credit × N × 100 (no drift)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        finiteMoney,
        (contracts, credit) => {
          let summed = Money.zero();
          for (let i = 0; i < contracts; i++) summed = summed.plus(Money.from(credit));
          const scaled = summed.times(100);
          const direct = Money.from(credit).times(contracts * 100);
          return scaled.round(2).toString() === direct.round(2).toString();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('0.1 + 0.2 + 0.3 = 0.6 exactly (regression)', () => {
    const a = Money.from('0.1').plus(Money.from('0.2')).plus(Money.from('0.3'));
    expect(a.toString()).toBe('0.6');
  });
});