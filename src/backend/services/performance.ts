// US9 — System performance statistics. Pure. Computes profit factor, win
// rate, average winner / loser, max consecutive losses, max drawdown and
// expectancy over a window of closed positions. Refuses to compute when
// fewer than 5 closed positions are present (FR-024 — "Insufficient samples").

import { Money } from '@/types/money';
import type { PerformanceAggregateDto, PerformanceWindow } from '@/shared/contracts';

type ClosedPosition = {
  id: string;
  symbol: string;
  closingPnL: string | null;
  closedAt: string | null;
};

const MIN_SAMPLES = 5;

export function computePerformanceAggregate(
  positions: ClosedPosition[],
  window: PerformanceWindow,
): PerformanceAggregateDto {
  const closedCount = positions.length;
  const insufficientSamples = closedCount < MIN_SAMPLES;

  // Sort ascending by closedAt so drawdown and streak walk through time.
  const sorted = [...positions].sort((a, b) => {
    if (!a.closedAt) return -1;
    if (!b.closedAt) return 1;
    return new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime();
  });

  const pnls = sorted
    .map((p) => (p.closingPnL ? Money.from(p.closingPnL) : null))
    .filter((m): m is Money => m !== null);

  let winners: Money[] = [];
  let losers: Money[] = [];
  for (const m of pnls) {
    if (m.isPositive()) winners.push(m);
    else if (m.isNegative()) losers.push(m);
  }

  let profitFactor: string | null = null;
  if (!insufficientSamples && losers.length > 0) {
    const sumWins = sum(winners);
    const sumLosses = sum(losers).abs();
    if (sumLosses.cmp(Money.zero()) > 0) {
      profitFactor = sumWins.div(sumLosses, 4).round(3).toString();
    } else {
      profitFactor = null; // no losers → infinite PF, surface null to avoid display NaN
    }
  }

  const winRate =
    !insufficientSamples && pnls.length > 0
      ? Money.from(winners.length).div(Money.from(pnls.length)).mul(Money.from('100')).round(2).toString()
      : null;

  const averageWinner =
    !insufficientSamples && winners.length > 0 ? sum(winners).div(Money.from(winners.length)).round(2).toString() : null;
  const averageLoser =
    !insufficientSamples && losers.length > 0 ? sum(losers).div(Money.from(losers.length)).round(2).toString() : null;

  // Max consecutive losses: walk through pnls, count losses in a row, track max.
  let maxConsecutiveLosses: number | null = null;
  if (!insufficientSamples) {
    let current = 0;
    let max = 0;
    for (const m of pnls) {
      if (m.isNegative()) {
        current++;
        if (current > max) max = current;
      } else {
        current = 0;
      }
    }
    maxConsecutiveLosses = max;
  }

  // Max drawdown: cumulative equity curve; deepest peak-to-trough.
  let maxDrawdown: string | null = null;
  if (!insufficientSamples) {
    let peak = Money.zero();
    let trough = Money.zero();
    let equity = Money.zero();
    let deepest = Money.zero();
    for (const m of pnls) {
      equity = equity.plus(m);
      if (equity.gt(peak)) {
        peak = equity;
        trough = equity;
      } else if (equity.lt(trough)) {
        trough = equity;
        const dd = peak.minus(trough);
        if (dd.gt(deepest)) deepest = dd;
      }
    }
    maxDrawdown = deepest.isZero() ? null : deepest.round(2).toString();
  }

  // Expectancy = avg(winner × winRate + loser × (1 - winRate)).
  let expectancy: string | null = null;
  if (!insufficientSamples && averageWinner !== null && averageLoser !== null && winRate !== null) {
    const wr = Money.from(winRate).div(Money.from('100'));
    const ev = Money.from(averageWinner).mul(wr).plus(Money.from(averageLoser).mul(Money.from('1').minus(wr)));
    expectancy = ev.round(2).toString();
  }

  return {
    window,
    insufficientSamples,
    closedCount,
    profitFactor,
    winRate,
    averageWinner,
    averageLoser,
    maxConsecutiveLosses,
    maxDrawdown,
    expectancy,
    computedAt: new Date().toISOString(),
  };
}

function sum(ms: Money[]): Money {
  return ms.reduce((acc, m) => acc.plus(m), Money.zero());
}