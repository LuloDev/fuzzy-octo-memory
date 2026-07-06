// US2 — Expected-Move calculation. Pure. The default factor of 0.85
// documents Assumption A3 in the spec — it's the industry convention for
// translating an ATM straddle price to a one-standard-deviation move.

import { Money } from '@/types/money';

const DEFAULT_FACTOR = '0.85';

export function computeExpectedMove(
  underlyingPrice: Money,
  atmStraddleMid: Money,
  factor: Money | string = DEFAULT_FACTOR,
): Money {
  const f = factor instanceof Money ? factor : Money.from(factor);
  if (atmStraddleMid.isZero()) return Money.zero();
  if (atmStraddleMid.isNegative() || f.isNegative()) {
    throw new Error('expectedMove: inputs must be non-negative');
  }
  // EM ≈ factor × (straddleMid / underlyingPrice) × underlyingPrice
  //       = factor × straddleMid
  // Returned as an *absolute USD distance* from the spot.
  return atmStraddleMid.mul(f);
}