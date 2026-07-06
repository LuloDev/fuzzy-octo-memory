// US7 — Slippage computation. Pure. Derives (sent - filled) per share and
// per combo from a closed Position + its OrderSubmission. Money-only math.

import { Money } from '@/types/money';
import type { SlippageRowDto } from '@/shared/contracts';

export type SlippageInputs = {
  positionId: string;
  symbol: string;
  contracts: number;
  sentLimitPrice: string | null;
  filledAvgPrice: string | null;
};

export function computeSlippage(args: SlippageInputs): SlippageRowDto {
  const sent = args.sentLimitPrice ? Money.from(args.sentLimitPrice) : null;
  const filled = args.filledAvgPrice ? Money.from(args.filledAvgPrice) : null;

  // The "fair" mid is what we sent as the limit; if we didn't get filled,
  // slippage is undefined and the row is excluded from percentiles (FR-019).
  if (sent === null || filled === null) {
    return {
      positionId: args.positionId,
      symbol: args.symbol,
      sentLimitPrice: args.sentLimitPrice ?? '0',
      filledAvgPrice: args.filledAvgPrice,
      contracts: args.contracts,
      slippagePerShare: null,
      slippagePerCombo: null,
    };
  }

  // Slippage per share = sent - filled (positive = we paid more than mid).
  const perShare = sent.minus(filled);
  // Per combo (one IC = 4 legs, but slippage is measured on the credit
  // difference): perShare × contracts × 100.
  const perCombo = perShare.times(args.contracts).times(100);

  return {
    positionId: args.positionId,
    symbol: args.symbol,
    sentLimitPrice: args.sentLimitPrice ?? '0',
    filledAvgPrice: args.filledAvgPrice,
    contracts: args.contracts,
    slippagePerShare: perShare.round(4).toString(),
    slippagePerCombo: perCombo.round(2).toString(),
  };
}

export type SlippageAggregate = {
  rows: SlippageRowDto[];
  medianPerShare: Money | null;
  p90PerShare: Money | null;
  medianPerCombo: Money | null;
  p90PerCombo: Money | null;
  histogram: { under5c: number; fiveToFifteen: number; over15c: number; notFilled: number };
};

const FIVE_CENTS = Money.from('0.05');
const FIFTEEN_CENTS = Money.from('0.15');

function percentile(sorted: Money[], p: number): Money | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1)));
  return sorted[idx] ?? null;
}

export function aggregateSlippage(rows: SlippageRowDto[]): SlippageAggregate {
  const filled = rows.filter((r) => r.slippagePerShare !== null);
  const perShare = filled
    .map((r) => Money.from(r.slippagePerShare as string))
    .sort((a, b) => a.cmp(b));

  const perCombo = filled
    .map((r) => Money.from(r.slippagePerCombo as string))
    .sort((a, b) => a.cmp(b));

  const histogram = { under5c: 0, fiveToFifteen: 0, over15c: 0, notFilled: 0 };
  for (const r of rows) {
    if (r.slippagePerShare === null) {
      histogram.notFilled++;
      continue;
    }
    const s = Money.from(r.slippagePerShare);
    const abs = s.abs();
    if (abs.cmp(FIFTEEN_CENTS) > 0) histogram.over15c++;
    else if (abs.cmp(FIVE_CENTS) > 0) histogram.fiveToFifteen++;
    else histogram.under5c++;
  }

  return {
    rows,
    medianPerShare: percentile(perShare, 50),
    p90PerShare: percentile(perShare, 90),
    medianPerCombo: percentile(perCombo, 50),
    p90PerCombo: percentile(perCombo, 90),
    histogram,
  };
}