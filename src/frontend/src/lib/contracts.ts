// Mirror of src/shared/contracts.ts zod schemas — duplicated here (instead
// of importing from the backend) so the SPA typechecks without a path
// alias into a different package.json. Keep in sync with backend.
//
// All money fields are decimals as strings — see src/types/money.ts.
import { z } from 'zod';

export const TickerConfigDto = z.object({
  id: z.string(),
  symbol: z.string(),
  enabled: z.boolean(),
  automaticManeuversEnabled: z.boolean(),
  allocationPercentage: z.string(),
  targetDelta: z.string(),
  widthOfSpread: z.string(),
  takeProfitPercentage: z.string(),
  stopLossMultiplier: z.string(),
  dailyLossLimit: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateTickerDto = z.object({
  symbol: z.string().min(1).max(10),
  enabled: z.boolean().default(true),
  automaticManeuversEnabled: z.boolean().default(true),
  allocationPercentage: z.string(),
  targetDelta: z.string(),
  widthOfSpread: z.string(),
  takeProfitPercentage: z.string(),
  stopLossMultiplier: z.string(),
  dailyLossLimit: z.string().default('-0.03'),
});

export const UpdateTickerDto = z.object({
  enabled: z.boolean().optional(),
  automaticManeuversEnabled: z.boolean().optional(),
  allocationPercentage: z.string().optional(),
  targetDelta: z.string().optional(),
  widthOfSpread: z.string().optional(),
  takeProfitPercentage: z.string().optional(),
  stopLossMultiplier: z.string().optional(),
  dailyLossLimit: z.string().optional(),
  reason: z.string().max(200).optional(),
});

export const MetricsDto = z.object({
  realizedPnL: z.string(),
  unrealizedPnL: z.string(),
  projectedMaxProfit: z.string(),
  maxRisk: z.string(),
  marginUsed: z.string(),
  marginFree: z.string(),
  dailyPnL: z.record(z.string(), z.string()),
});

export const PositionDto = z.object({
  id: z.string(),
  symbol: z.string(),
  expiration: z.string(),
  shortPutStrike: z.string(),
  longPutStrike: z.string(),
  shortCallStrike: z.string(),
  longCallStrike: z.string(),
  contracts: z.number(),
  entryCredit: z.string(),
  entryTimestamp: z.string(),
  currentValue: z.string().nullable(),
  status: z.string(),
  closedAt: z.string().nullable(),
  closingPnL: z.string().nullable(),
});

export const PayoffPointDto = z.object({ price: z.string(), pnl: z.string() });
export const PayoffDto = z.object({
  breakEvenLower: z.string(),
  breakEvenUpper: z.string(),
  maxProfit: z.string(),
  maxLoss: z.string(),
  underlyingPrice: z.string(),
  curve: z.array(PayoffPointDto),
});

export const EquityPointDto = z.object({ date: z.string(), equity: z.string(), pnl: z.string() });
export const EquityCurveDto = z.object({ series: z.array(EquityPointDto) });

export type TickerConfig = z.infer<typeof TickerConfigDto>;
export type CreateTicker = z.infer<typeof CreateTickerDto>;
export type UpdateTicker = z.infer<typeof UpdateTickerDto>;
export type Metrics = z.infer<typeof MetricsDto>;
export type Position = z.infer<typeof PositionDto>;
export type Payoff = z.infer<typeof PayoffDto>;
export type EquityCurve = z.infer<typeof EquityCurveDto>;

// Format a money string for display, falling back gracefully for nulls.
export function fmtMoney(value: string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return '—';
  return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
}
export function signClass(value: string | null | undefined, neutral = false): string {
  if (neutral) return 'text-slate-100';
  if (value === null || value === undefined) return 'text-slate-500';
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n === 0) return 'text-slate-100';
  return n > 0 ? 'text-profit' : 'text-loss';
}