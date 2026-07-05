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