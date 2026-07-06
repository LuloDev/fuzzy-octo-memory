// US5 — Aggregates the three AppState telemetry keys recorded by
// AlpacaService and TelegramNotifier (T012/T013) plus the rolling 429 count.
// Pure: takes raw AppState values as arguments so it can be unit-tested
// without a DB.

import type { HealthSnapshotDto, HealthSignal } from '@/shared/contracts';

type RawSignal = string | null;

const FRESH_BROKER_MS = 5 * 60 * 1000;
const STALE_BROKER_MS = 30 * 60 * 1000;
const FRESH_QUOTE_MS = 10 * 60 * 1000;
const STALE_QUOTE_MS = 60 * 60 * 1000;
const FRESH_TELEGRAM_MS = 60 * 60 * 1000;
const STALE_TELEGRAM_MS = 180 * 60 * 1000;

function parseSignal(raw: RawSignal, freshMs: number, staleMs: number): HealthSignal | null {
  if (!raw) return null;
  let parsed: { ts?: string; status?: string; latencyMs?: number; retryAfterSeconds?: number };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return null;
  }
  if (!parsed.ts) return null;
  const ts = new Date(parsed.ts).getTime();
  if (Number.isNaN(ts)) return null;
  const ageMs = Date.now() - ts;
  // If the underlying call already reported a degraded status, surface it.
  let status: HealthSignal['status'] = (parsed.status as HealthSignal['status']) ?? 'OK';
  if (status === 'OK') {
    if (ageMs > staleMs) status = 'DEGRADED';
  }
  return {
    ts: parsed.ts,
    status,
    ageMs,
    latencyMs: parsed.latencyMs,
    retryAfterSeconds: parsed.retryAfterSeconds,
  };
}

function countRecentHits(raw: RawSignal): number {
  if (!raw) return 0;
  try {
    const arr = JSON.parse(raw) as string[];
    const cutoff = Date.now() - 60 * 60 * 1000;
    return arr.filter((ts) => new Date(ts).getTime() >= cutoff).length;
  } catch {
    return 0;
  }
}

export function buildHealthSnapshot(args: {
  lastBrokerCall: RawSignal;
  lastQuoteFetch: RawSignal;
  lastTelegramDelivery: RawSignal;
  alpaca429Count: RawSignal;
}): HealthSnapshotDto {
  return {
    broker: parseSignal(args.lastBrokerCall, FRESH_BROKER_MS, STALE_BROKER_MS),
    quote: parseSignal(args.lastQuoteFetch, FRESH_QUOTE_MS, STALE_QUOTE_MS),
    telegram: parseSignal(args.lastTelegramDelivery, FRESH_TELEGRAM_MS, STALE_TELEGRAM_MS),
    recentRateLimitHits: countRecentHits(args.alpaca429Count),
  };
}