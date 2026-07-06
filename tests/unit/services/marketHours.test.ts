import { describe, it, expect, vi } from 'vitest';
import { MarketHoursService } from '@/backend/services/marketHoursService';
import type { MarketClock } from '@/types/domain';
import type { Result } from '@/backend/services/alpacaService';

function clock(overrides?: Partial<MarketClock>): MarketClock {
  return {
    isOpen: true,
    timestamp: '2026-07-06T14:30:00Z',
    nextOpen: '2026-07-06T13:30:00Z',
    nextClose: '2026-07-06T20:00:00Z',
    ...overrides,
  };
}

function openResult(c: MarketClock = clock()): Result<MarketClock> {
  return { ok: true, value: c };
}

function failResult(): Result<MarketClock> {
  return { ok: false, error: { kind: 'TRANSPORT', message: 'unreachable' } };
}

describe('MarketHoursService', () => {
  it('returns true when Alpaca clock says open', async () => {
    const alpaca = { getClock: vi.fn().mockResolvedValue(openResult(clock({ isOpen: true }))) };
    const svc = new MarketHoursService(alpaca);
    await expect(svc.isOpen()).resolves.toBe(true);
  });

  it('returns false when Alpaca clock says closed', async () => {
    const alpaca = { getClock: vi.fn().mockResolvedValue(openResult(clock({ isOpen: false }))) };
    const svc = new MarketHoursService(alpaca);
    await expect(svc.isOpen()).resolves.toBe(false);
  });

  it('uses cached value within TTL and does not call Alpaca again', async () => {
    const alpaca = { getClock: vi.fn().mockResolvedValue(openResult(clock({ isOpen: true }))) };
    const svc = new MarketHoursService(alpaca);
    await svc.isOpen();
    await svc.isOpen();
    expect(alpaca.getClock).toHaveBeenCalledTimes(1);
  });

  it('refreshes cache after TTL expires', async () => {
    vi.useFakeTimers();
    const alpaca = { getClock: vi.fn().mockResolvedValue(openResult(clock({ isOpen: true }))) };
    const svc = new MarketHoursService(alpaca);
    await svc.isOpen();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await svc.isOpen();
    expect(alpaca.getClock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('falls back to cached inference when Alpaca fails and cache is stale (was open, still before nextClose)', async () => {
    const alpaca = {
      getClock: vi.fn()
        .mockResolvedValueOnce(openResult(clock({ isOpen: true, nextClose: '2026-07-06T20:00:00Z' })))
        .mockResolvedValueOnce(failResult()),
    };
    const svc = new MarketHoursService(alpaca);
    // First call fills cache
    await svc.isOpen();
    // Second call: Alpaca fails, but cache says was open and now < nextClose
    const result = await svc.isOpen();
    expect(result).toBe(true);
  });

  it('falls back to cached inference when Alpaca fails and cache is stale (was closed, now past nextOpen)', async () => {
    vi.useFakeTimers();
    const pastNextOpen = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    const alpaca = {
      getClock: vi.fn()
        .mockResolvedValueOnce(openResult(clock({
          isOpen: false,
          nextOpen: pastNextOpen.toISOString(),
          nextClose: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })))
        .mockResolvedValueOnce(failResult()),
    };
    const svc = new MarketHoursService(alpaca);
    await svc.isOpen(); // fills cache with isOpen: false
    vi.advanceTimersByTime(5 * 60 * 1000 + 1); // expire cache TTL
    const result = await svc.isOpen(); // Alpaca fails → inference: past nextOpen → open
    expect(result).toBe(true);
    vi.useRealTimers();
  });

  it('falls back to cached inference when Alpaca fails (was closed, not yet nextOpen)', async () => {
    vi.useFakeTimers();
    const futureNextOpen = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
    const alpaca = {
      getClock: vi.fn()
        .mockResolvedValueOnce(openResult(clock({
          isOpen: false,
          nextOpen: futureNextOpen.toISOString(),
          nextClose: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })))
        .mockResolvedValueOnce(failResult()),
    };
    const svc = new MarketHoursService(alpaca);
    await svc.isOpen(); // fills cache with isOpen: false
    vi.advanceTimersByTime(5 * 60 * 1000 + 1); // expire cache TTL
    const result = await svc.isOpen(); // Alpaca fails → inference: future nextOpen → closed
    expect(result).toBe(false);
    vi.useRealTimers();
  });

  it('assumes open (conservative) when no cache and Alpaca fails', async () => {
    const alpaca = { getClock: vi.fn().mockResolvedValue(failResult()) };
    const svc = new MarketHoursService(alpaca);
    const result = await svc.isOpen();
    expect(result).toBe(true);
  });
});
