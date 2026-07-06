// US1 — Proximity radar. Pure function: given the current underlying price
// and the two short strikes, classify the distance to the nearest short
// strike on each side. All math goes through Money (Constitution Principle I)
// so percentage comparisons can't drift with float rounding.

import { Money } from '@/types/money';
import type { ProximityState } from '@/shared/contracts';

export type Proximity = {
  putSide: ProximityState;
  callSide: ProximityState;
  putDistancePct: string;
  callDistancePct: string;
  putDistanceUsd: string;
  callDistanceUsd: string;
};

// Thresholds per spec FR-002.
const WARNING_PCT = Money.from('1.5');

// Returns the percentage distance from the underlying to the short strike,
// signed so that "past the strike" is negative.
function distancePct(underlying: Money, short: Money, side: 'put' | 'call'): { absPct: Money; crossed: boolean } {
  const diff = side === 'put' ? underlying.minus(short) : short.minus(underlying);
  const crossed = diff.cmp(Money.zero()) < 0;
  const absPct = diff.abs().div(short).mul(Money.from('100'));
  return { absPct, crossed };
}

function classify(absPct: Money, crossed: boolean): ProximityState {
  if (crossed) return 'BREACH';
  // 0 < x <= 1.5% — WARNING. 1.5% < x <= 5% — still classified as SAFE.
  if (absPct.cmp(WARNING_PCT) <= 0) return 'WARNING';
  return 'SAFE';
}

export function classifyProximity(
  underlyingPrice: string | Money,
  shortPut: string | Money,
  shortCall: string | Money,
): Proximity | null {
  const u = underlyingPrice instanceof Money ? underlyingPrice : Money.from(underlyingPrice);
  const sp = shortPut instanceof Money ? shortPut : Money.from(shortPut);
  const sc = shortCall instanceof Money ? shortCall : Money.from(shortCall);

  if (u.cmp(Money.zero()) === 0 || sp.cmp(Money.zero()) === 0 || sc.cmp(Money.zero()) === 0) {
    return null;
  }

  const put = distancePct(u, sp, 'put');
  const call = distancePct(u, sc, 'call');

  return {
    putSide: classify(put.absPct, put.crossed),
    callSide: classify(call.absPct, call.crossed),
    putDistancePct: put.absPct.round(2).toString(),
    callDistancePct: call.absPct.round(2).toString(),
    putDistanceUsd: u.minus(sp).round(2).toString(),
    callDistanceUsd: sc.minus(u).round(2).toString(),
  };
}