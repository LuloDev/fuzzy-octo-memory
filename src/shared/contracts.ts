import { z } from 'zod';

// Shared REST contract types. Used by both Fastify route handlers and the
// React client. Drift between Prisma types and these is caught by a CI
// smoke test that parses a Prisma row through zod.

export const TickerConfigDto = z.object({
  id: z.string(),
  symbol: z.string().min(1).max(10),
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
export type TickerConfigDto = z.infer<typeof TickerConfigDto>;

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
export type CreateTickerDto = z.infer<typeof CreateTickerDto>;

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
export type UpdateTickerDto = z.infer<typeof UpdateTickerDto>;

export const PanicDto = z.object({
  reason: z.string().max(200).optional(),
});
export type PanicDto = z.infer<typeof PanicDto>;

export const MetricsDto = z.object({
  realizedPnL: z.string(),
  unrealizedPnL: z.string(),
  projectedMaxProfit: z.string(),
  maxRisk: z.string(),
  marginUsed: z.string(),
  marginFree: z.string(),
  dailyPnL: z.record(z.string(), z.string()),
});
export type MetricsDto = z.infer<typeof MetricsDto>;

export const PayoffPointDto = z.object({
  price: z.string(),
  pnl: z.string(),
});
export const PayoffDto = z.object({
  breakEvenLower: z.string(),
  breakEvenUpper: z.string(),
  maxProfit: z.string(),
  maxLoss: z.string(),
  underlyingPrice: z.string(),
  curve: z.array(PayoffPointDto),
});
export type PayoffDto = z.infer<typeof PayoffDto>;

export const EquityPointDto = z.object({
  date: z.string(),
  equity: z.string(),
  pnl: z.string(),
});
export const EquityCurveDto = z.object({
  series: z.array(EquityPointDto),
});
export type EquityCurveDto = z.infer<typeof EquityCurveDto>;

export const ErrorDto = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    intentId: z.string().optional(),
  }),
});
export type ErrorDto = z.infer<typeof ErrorDto>;

// ============================================================================
// US4 — Audit feed / events endpoint (spec 002-algo-command-center)
// ============================================================================

export const AppStateKey = z.enum([
  'kill_state_new_entries',
  'kill_state_maneuvers',
  'last_broker_call',
  'last_quote_fetch',
  'last_telegram_delivery',
  'alpaca_429_count',
  'performance_aggregate_7d',
  'performance_aggregate_30d',
  'performance_aggregate_90d',
  'performance_aggregate_all',
  'last_hard_panic_at',
]);
export type AppStateKey = z.infer<typeof AppStateKey>;

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

// Discriminated union: a payload > 8KB is replaced with a truncated wrapper.
const JsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValue),
    z.record(z.string(), JsonValue),
  ]),
);
export const TruncatedPayload = z.union([
  JsonValue,
  z.object({
    _truncated: z.literal(true),
    bytes: z.number().int().nonnegative(),
    preview: JsonValue,
  }),
]);
export type TruncatedPayload = z.infer<typeof TruncatedPayload>;

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
  intentPayload: TruncatedPayload.optional(),
  marketSnapshot: TruncatedPayload.optional(),
  requestPayload: TruncatedPayload.optional(),
  responsePayload: TruncatedPayload.optional(),
  realizedPnL: z.string().nullable().optional(),
});
export type AuditEventDto = z.infer<typeof AuditEventDto>;

export const AuditFeedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200),
  cursor: z.string().optional(),
  intentId: z.string().optional(),
  positionId: z.string().optional(),
});
export type AuditFeedQuery = z.infer<typeof AuditFeedQuery>;

export const AuditFeedDto = z.object({
  items: z.array(AuditEventDto),
  nextCursor: z.string().nullable(),
  truncatedCount: z.number().int().nonnegative(),
});
export type AuditFeedDto = z.infer<typeof AuditFeedDto>;

// ============================================================================
// US6 — Graduated kill switches (spec 002-algo-command-center)
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
export type KillStateDto = z.infer<typeof KillStateDto>;

export const KillRequestDto = z.object({
  action: KillAction,
  reason: z.string().min(1).max(200),
});
export type KillRequestDto = z.infer<typeof KillRequestDto>;

export const KillStateResponseDto = z.object({
  newEntries: KillStateDto,
  maneuvers: KillStateDto,
  // Last hard panic, if any, used by the header badge to flip red PANICKED.
  lastHardPanicAt: z.string().nullable(),
});
export type KillStateResponseDto = z.infer<typeof KillStateResponseDto>;

export const Mode = z.enum(['LIVE', 'PAUSED_ENTRIES', 'PAUSED_MANEUVERS', 'PAUSED_ALL', 'PANICKED']);
export type Mode = z.infer<typeof Mode>;

// ============================================================================
// US5 — Automation health snapshot (spec 002-algo-command-center)
// ============================================================================

export const HealthSignal = z.object({
  ts: z.string(),
  status: z.enum(['OK', 'DEGRADED', 'UNREACHABLE']),
  latencyMs: z.number().nullable().optional(),
  retryAfterSeconds: z.number().nullable().optional(),
  ageMs: z.number().nullable().optional(),
});
export type HealthSignal = z.infer<typeof HealthSignal>;

export const HealthSnapshotDto = z.object({
  broker: HealthSignal.nullable(),
  quote: HealthSignal.nullable(),
  telegram: HealthSignal.nullable(),
  recentRateLimitHits: z.number().int().nonnegative(),
});
export type HealthSnapshotDto = z.infer<typeof HealthSnapshotDto>;

// Augments the existing /api/health response with the snapshot.
export const HealthResponseDto = z.object({
  status: z.string(),
  uptimeSeconds: z.number(),
  dryRun: z.boolean(),
  lastHeartbeatAt: z.string().nullable(),
  health: HealthSnapshotDto.nullable(),
});
export type HealthResponseDto = z.infer<typeof HealthResponseDto>;

// ============================================================================
// US1 — Proximity radar (spec 002-algo-command-center)
// ============================================================================

export const ProximityState = z.enum(['SAFE', 'WARNING', 'BREACH']);
export type ProximityState = z.infer<typeof ProximityState>;

export const PositionWithProximityDto = z.object({
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
  currentUnderlyingPrice: z.string().nullable(),
  proximity: z
    .object({
      putSide: ProximityState,
      callSide: ProximityState,
      putDistancePct: z.string(),
      callDistancePct: z.string(),
      putDistanceUsd: z.string(),
      callDistanceUsd: z.string(),
    })
    .nullable(),
});
export type PositionWithProximityDto = z.infer<typeof PositionWithProximityDto>;

export const PositionsListDto = z.object({
  positions: z.array(PositionWithProximityDto),
});
export type PositionsListDto = z.infer<typeof PositionsListDto>;

// ============================================================================
// US7 — Slippage analysis (spec 002-algo-command-center)
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
export type SlippageRowDto = z.infer<typeof SlippageRowDto>;

export const SlippageSummaryDto = z.object({
  medianPerShare: z.string().nullable(),
  p90PerShare: z.string().nullable(),
  medianPerCombo: z.string().nullable(),
  p90PerCombo: z.string().nullable(),
  histogram: z.object({
    under5c: z.number().int().nonnegative(),
    fiveToFifteen: z.number().int().nonnegative(),
    over15c: z.number().int().nonnegative(),
    notFilled: z.number().int().nonnegative(),
  }),
});
export type SlippageSummaryDto = z.infer<typeof SlippageSummaryDto>;

export const SlippageResponseDto = z.object({
  rows: z.array(SlippageRowDto),
  summary: SlippageSummaryDto,
  closedCount: z.number().int().nonnegative(),
});
export type SlippageResponseDto = z.infer<typeof SlippageResponseDto>;

// ============================================================================
// US9 — System performance statistics (spec 002-algo-command-center)
// ============================================================================

export const PerformanceWindow = z.enum(['7d', '30d', '90d', 'all']);
export type PerformanceWindow = z.infer<typeof PerformanceWindow>;

export const PerformanceAggregateDto = z.object({
  window: PerformanceWindow,
  insufficientSamples: z.boolean(),
  closedCount: z.number().int().nonnegative(),
  profitFactor: z.string().nullable(),
  winRate: z.string().nullable(),
  averageWinner: z.string().nullable(),
  averageLoser: z.string().nullable(),
  maxConsecutiveLosses: z.number().int().nullable(),
  maxDrawdown: z.string().nullable(),
  expectancy: z.string().nullable(),
  computedAt: z.string(),
});
export type PerformanceAggregateDto = z.infer<typeof PerformanceAggregateDto>;