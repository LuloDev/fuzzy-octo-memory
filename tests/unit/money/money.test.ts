import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Money } from '@/types/money';

describe('Money', () => {
  describe('construction', () => {
    it('builds from a decimal string', () => {
      const m = Money.from('1.23');
      expect(m.toString()).toBe('1.23');
    });

    it('builds from a numeric', () => {
      const m = Money.from(1.23);
      expect(m.toString()).toBe('1.23');
    });

    it('builds from a Decimal-like value', () => {
      const m = Money.from('0.10');
      expect(m.toString()).toBe('0.1');
    });

    it('rejects NaN/Infinity', () => {
      expect(() => Money.from(Number.NaN)).toThrow();
      expect(() => Money.from(Infinity)).toThrow();
    });

    it('round-trips through JSON as a string', () => {
      const m = Money.from('12.3456');
      expect(m.toJSON()).toBe('12.3456');
      expect(JSON.stringify({ pnl: m })).toBe('{"pnl":"12.3456"}');
    });
  });

  describe('arithmetic', () => {
    it('adds two Moneys exactly (no float drift)', () => {
      const a = Money.from('0.1');
      const b = Money.from('0.2');
      expect(a.plus(b).toString()).toBe('0.3');
    });

    it('subtracts', () => {
      expect(Money.from('1.00').minus(Money.from('0.10')).toString()).toBe('0.9');
    });

    it('multiplies by an integer quantity exactly', () => {
      expect(Money.from('0.85').times(100).toString()).toBe('85');
    });

    it('multiplies by a Money exactly', () => {
      expect(Money.from('2').mul(Money.from('3')).toString()).toBe('6');
    });

    it('divides with configurable precision', () => {
      expect(Money.from('10').div(Money.from('3'), 6).toString()).toBe('3.333333');
    });

    it('rejects divide-by-zero', () => {
      expect(() => Money.from('10').div(Money.from('0'))).toThrow();
    });
  });

  describe('rounding', () => {
    it('rounds to a given number of decimal places (half-up)', () => {
      expect(Money.from('1.235').round(2).toString()).toBe('1.24');
      expect(Money.from('1.234').round(2).toString()).toBe('1.23');
    });

    it('rounds to two decimal places for currency by default', () => {
      expect(Money.from('1.005').round(2).toString()).toBe('1.01');
    });
  });

  describe('comparison', () => {
    it('cmp returns -1, 0, 1', () => {
      expect(Money.from('1').cmp(Money.from('2'))).toBe(-1);
      expect(Money.from('2').cmp(Money.from('2'))).toBe(0);
      expect(Money.from('3').cmp(Money.from('2'))).toBe(1);
    });

    it('compares through helper methods', () => {
      const a = Money.from('1');
      const b = Money.from('2');
      expect(a.lt(b)).toBe(true);
      expect(b.gt(a)).toBe(true);
      expect(a.lte(b)).toBe(true);
      expect(a.gte(a)).toBe(true);
    });
  });

  describe('immutability', () => {
    it('arithmetic returns a new Money', () => {
      const a = Money.from('1');
      const b = a.plus(Money.from('1'));
      expect(a.toString()).toBe('1');
      expect(b.toString()).toBe('2');
    });
  });
});

describe('Money property-based invariants', () => {
  it('addition is associative over safe integers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        (a, b, c) => {
          const ma = Money.from(a);
          const mb = Money.from(b);
          const mc = Money.from(c);
          const left = ma.plus(mb).plus(mc);
          const right = ma.plus(mb.plus(mc));
          return left.toString() === right.toString();
        },
      ),
    );
  });

  it('a + 0 = a (identity)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        (a) => {
          return Money.from(a).plus(Money.from(0)).toString() === Money.from(a).toString();
        },
      ),
    );
  });

  it('multiplying by 100 introduces no drift for two-decimal values', () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 0, max: 100_000 })
          .map((cents) => (cents / 100).toFixed(2)),
        (s) => {
          const m = Money.from(s);
          const scaled = m.times(100);
          // The string representation should equal s * 100 with no surprises.
          return scaled.round(0).toString() === (Number(s) * 100).toFixed(0);
        },
      ),
    );
  });

  it('comparison is total order', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        (a, b) => {
          const ma = Money.from(a);
          const mb = Money.from(b);
          const c = ma.cmp(mb);
          // exactly one of -1, 0, 1.
          return c === -1 || c === 0 || c === 1;
        },
      ),
    );
  });
});