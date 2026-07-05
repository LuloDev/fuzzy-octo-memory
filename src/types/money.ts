import { Decimal } from 'decimal.js';

// Constitution Principle I: money math MUST use a decimal-safe helper,
// never native `number`, across any boundary (DB, broker, UI).
// This immutable Money wraps decimal.js and serializes as a string.

// Configure decimal.js for predictable, exact arithmetic.
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

/**
 * Immutable, decimal-safe monetary value.
 * Always constructed from a string, number, Decimal, or another Money.
 * Serialized over the wire as a JSON string (never a float).
 */
export class Money {
  private readonly value: Decimal;

  private constructor(d: Decimal) {
    this.value = d;
  }

  static from(input: string | number | Decimal | Money): Money {
    if (input instanceof Money) return new Money(input.value);
    if (input instanceof Decimal) return new Money(input);
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) {
        throw new Error(`Money.from: non-finite value ${input}`);
      }
      return new Money(new Decimal(input));
    }
    // string
    if (!/^-?\d*\.?\d+$/.test(input)) {
      throw new Error(`Money.from: invalid money string "${input}"`);
    }
    return new Money(new Decimal(input));
  }

  static zero(): Money {
    return Money.from('0');
  }

  plus(other: Money): Money {
    return new Money(this.value.plus(other.value));
  }

  minus(other: Money): Money {
    return new Money(this.value.minus(other.value));
  }

  // multiply by a scalar (e.g. contracts × price).
  times(n: number): Money {
    return new Money(this.value.times(n));
  }

  // multiply by another Money.
  mul(other: Money): Money {
    return new Money(this.value.times(other.value));
  }

  div(other: Money, dp = 8): Money {
    if (other.value.isZero()) {
      throw new Error('Money.div: divide by zero');
    }
    return new Money(this.value.div(other.value).toDecimalPlaces(dp));
  }

  round(dp = 2): Money {
    return new Money(this.value.toDecimalPlaces(dp, Decimal.ROUND_HALF_UP));
  }

  abs(): Money {
    return new Money(this.value.abs());
  }

  negate(): Money {
    return new Money(this.value.negated());
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.isPositive();
  }

  isNegative(): boolean {
    return this.value.isNegative();
  }

  cmp(other: Money): -1 | 0 | 1 {
    const c = this.value.comparedTo(other.value);
    if (c === null) throw new Error('Money.cmp: incomparable');
    return c as -1 | 0 | 1;
  }

  lt(other: Money): boolean {
    return this.cmp(other) < 0;
  }

  lte(other: Money): boolean {
    return this.cmp(other) <= 0;
  }

  gt(other: Money): boolean {
    return this.cmp(other) > 0;
  }

  gte(other: Money): boolean {
    return this.cmp(other) >= 0;
  }

  equals(other: Money): boolean {
    return this.value.equals(other.value);
  }

  toNumber(): number {
    return this.value.toNumber();
  }

  toString(): string {
    return this.value.toString();
  }

  toJSON(): string {
    return this.value.toString();
  }
}