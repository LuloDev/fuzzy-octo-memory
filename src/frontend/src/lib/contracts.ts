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
  priceLow2W: z.string().nullable(),
  priceHigh2W: z.string().nullable(),
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

// ============================================================================
// US1 — Proximity radar (spec 002-algo-command-center)
// ============================================================================
export const ProximityState = z.enum(['SAFE', 'WARNING', 'BREACH']);
export type ProximityState = z.infer<typeof ProximityState>;
export const ProximityDto = z.object({
  putSide: ProximityState,
  callSide: ProximityState,
  putDistancePct: z.string(),
  callDistancePct: z.string(),
  putDistanceUsd: z.string(),
  callDistanceUsd: z.string(),
});
export type Proximity = z.infer<typeof ProximityDto>;
export const PositionWithProximityDto = PositionDto.extend({
  currentUnderlyingPrice: z.string().nullable(),
  proximity: ProximityDto.nullable(),
});
export type PositionWithProximity = z.infer<typeof PositionWithProximityDto>;

// ============================================================================
// US4 — Audit feed
// ============================================================================
export const EventVerb = z.enum([
  'MONITORING',
  'ALERT',
  'ACTION',
  'REJECTED',
  'PAUSED',
  'PAUSE_LIFTED',
  'KILL_STATE_CHANGED',
  'OPENED',
  'TAKE_PROFIT_TRIGGERED',
  'STOP_LOSS_TRIGGERED',
  'ROLLED',
  'PANIC_CLOSED',
  'HEARTBEAT',
  'MID_OBSERVED',
]);
export type EventVerb = z.infer<typeof EventVerb>;
const JsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValue), z.record(z.string(), JsonValue)]),
);
export const AuditEventDto = z.object({
  id: z.string(),
  source: z.enum(['position_event', 'order_submission']),
  positionId: z.string(),
  intentId: z.string().nullable().optional(),
  kind: z.string(),
  verb: EventVerb,
  summary: z.string(),
  ticker: z.string().nullable().optional(),
  ts: z.string(),
  alpacaOrderId: z.string().nullable().optional(),
  intentPayload: JsonValue.optional(),
  marketSnapshot: JsonValue.optional(),
  requestPayload: JsonValue.optional(),
  responsePayload: JsonValue.optional(),
  realizedPnL: z.string().nullable().optional(),
});
export type AuditEvent = z.infer<typeof AuditEventDto>;
export const AuditFeedDto = z.object({
  items: z.array(AuditEventDto),
  nextCursor: z.string().nullable(),
  truncatedCount: z.number(),
});
export type AuditFeed = z.infer<typeof AuditFeedDto>;

export function verbColor(verb: EventVerb): string {
  switch (verb) {
    case 'ACTION':
      return 'bg-blue-500/20 text-blue-300';
    case 'ALERT':
      return 'bg-amber-500/20 text-amber-300';
    case 'REJECTED':
      return 'bg-red-500/20 text-red-300';
    case 'PAUSED':
    case 'PAUSE_LIFTED':
    case 'KILL_STATE_CHANGED':
      return 'bg-orange-500/20 text-orange-300';
    case 'HEARTBEAT':
    case 'MONITORING':
    case 'MID_OBSERVED':
      return 'bg-slate-500/20 text-slate-300';
    default:
      return 'bg-slate-500/20 text-slate-300';
  }
}

// ============================================================================
// US6 — Kill switches
// ============================================================================
export const KillFeature = z.enum(['new-entries', 'maneuvers']);
export type KillFeature = z.infer<typeof KillFeature>;
export const KillAction = z.enum(['pause', 'resume']);
export type KillAction = z.infer<typeof KillAction>;
export const KillStateDto = z.object({
  feature: KillFeature,
  paused: z.boolean(),
  since: z.string().nullable(),
  reason: z.string().nullable(),
  changedBy: z.enum(['operator', 'system']),
});
export const KillStateResponseDto = z.object({
  newEntries: KillStateDto,
  maneuvers: KillStateDto,
  lastHardPanicAt: z.string().nullable(),
});
export type KillStateResponse = z.infer<typeof KillStateResponseDto>;
export const Mode = z.enum(['LIVE', 'PAUSED_ENTRIES', 'PAUSED_MANEUVERS', 'PAUSED_ALL', 'PANICKED']);
export type Mode = z.infer<typeof Mode>;

export function modeFromKillState(s: KillStateResponse, nowMs: number): Mode {
  if (s.lastHardPanicAt && nowMs - new Date(s.lastHardPanicAt).getTime() < 60_000) return 'PANICKED';
  const e = s.newEntries.paused;
  const m = s.maneuvers.paused;
  if (e && m) return 'PAUSED_ALL';
  if (e) return 'PAUSED_ENTRIES';
  if (m) return 'PAUSED_MANEUVERS';
  return 'LIVE';
}

// ============================================================================
// US5 — Health snapshot
// ============================================================================
export const HealthSignal = z.object({
  ts: z.string(),
  status: z.enum(['OK', 'DEGRADED', 'UNREACHABLE']),
  ageMs: z.number().nullable().optional(),
  latencyMs: z.number().nullable().optional(),
  retryAfterSeconds: z.number().nullable().optional(),
});
export type HealthSignal = z.infer<typeof HealthSignal>;
export const HealthSnapshotDto = z.object({
  broker: HealthSignal.nullable(),
  quote: HealthSignal.nullable(),
  telegram: HealthSignal.nullable(),
  recentRateLimitHits: z.number(),
});
export const HealthResponseDto = z.object({
  status: z.string(),
  uptimeSeconds: z.number(),
  dryRun: z.boolean(),
  lastHeartbeatAt: z.string().nullable(),
  health: HealthSnapshotDto.nullable(),
});
export type HealthResponse = z.infer<typeof HealthResponseDto>;
export type HealthSnapshot = z.infer<typeof HealthSnapshotDto>;

// ============================================================================
// US7 — Slippage
// ============================================================================
export const SlippageRowDto = z.object({
  positionId: z.string(),
  symbol: z.string(),
  sentLimitPrice: z.string(),
  filledAvgPrice: z.string().nullable(),
  contracts: z.number(),
  slippagePerShare: z.string().nullable(),
  slippagePerCombo: z.string().nullable(),
});
export const SlippageResponseDto = z.object({
  rows: z.array(SlippageRowDto),
  summary: z.object({
    medianPerShare: z.string().nullable(),
    p90PerShare: z.string().nullable(),
    medianPerCombo: z.string().nullable(),
    p90PerCombo: z.string().nullable(),
    histogram: z.object({
      under5c: z.number(),
      fiveToFifteen: z.number(),
      over15c: z.number(),
      notFilled: z.number(),
    }),
  }),
  closedCount: z.number(),
});
export type SlippageResponse = z.infer<typeof SlippageResponseDto>;

// ============================================================================
// US9 — Performance
// ============================================================================
export const PerformanceAggregateDto = z.object({
  window: z.enum(['7d', '30d', '90d', 'all']),
  insufficientSamples: z.boolean(),
  closedCount: z.number(),
  profitFactor: z.string().nullable(),
  winRate: z.string().nullable(),
  averageWinner: z.string().nullable(),
  averageLoser: z.string().nullable(),
  maxConsecutiveLosses: z.number().nullable(),
  maxDrawdown: z.string().nullable(),
  expectancy: z.string().nullable(),
  computedAt: z.string(),
});
export const PerformanceWindow = z.enum(['7d', '30d', '90d', 'all']);
export type PerformanceWindow = z.infer<typeof PerformanceWindow>;
export type PerformanceAggregate = z.infer<typeof PerformanceAggregateDto>;

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