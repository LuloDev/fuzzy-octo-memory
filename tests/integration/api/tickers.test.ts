import { describe, it, expect } from 'vitest';
import { UpdateTickerDto, CreateTickerDto } from '@/shared/contracts';

// Integration-style zod validation tests for the ticker routes. These
// exercise the wire schemas without booting Fastify.

describe('Ticker config zod schemas', () => {
  it('CreateTickerDto accepts a valid payload', () => {
    const r = CreateTickerDto.safeParse({
      symbol: 'SPY',
      enabled: true,
      automaticManeuversEnabled: true,
      allocationPercentage: '30',
      targetDelta: '0.12',
      widthOfSpread: '2.00',
      takeProfitPercentage: '0.50',
      stopLossMultiplier: '3.00',
      dailyLossLimit: '-0.03',
    });
    expect(r.success).toBe(true);
  });

  it('CreateTickerDto rejects an empty symbol', () => {
    const r = CreateTickerDto.safeParse({
      symbol: '',
      enabled: true,
      allocationPercentage: '30',
      targetDelta: '0.12',
      widthOfSpread: '2.00',
      takeProfitPercentage: '0.50',
      stopLossMultiplier: '3.00',
    });
    expect(r.success).toBe(false);
  });

  it('UpdateTickerDto accepts a partial', () => {
    const r = UpdateTickerDto.safeParse({ enabled: false, reason: 'paused' });
    expect(r.success).toBe(true);
  });

  it('UpdateTickerDto rejects an oversized reason', () => {
    const r = UpdateTickerDto.safeParse({ reason: 'a'.repeat(300) });
    expect(r.success).toBe(false);
  });
});
