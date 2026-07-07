import { env } from '@/backend/config/env';
import { logger } from '@/backend/services/structuredLogger';
import { persistence } from '@/backend/services/persistenceService';
import type { MarketClock, OptionQuote } from '@/types/domain';

// Thin REST wrapper around Alpaca Options v2 API.
// NEVER throws on broker errors — all returns are Result-style.

export type BrokerError = {
  kind: 'TRANSPORT' | 'NON_2XX' | 'BAD_JSON' | 'RATE_LIMITED';
  httpStatus?: number;
  body?: string;
  message: string;
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: BrokerError };

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
function fail(kind: BrokerError['kind'], message: string, extra: Partial<BrokerError> = {}): Result<never> {
  return { ok: false, error: { kind, message, ...extra } };
}

function authHeaders(body?: unknown): Record<string, string> {
  const h: Record<string, string> = {
    'APCA-API-KEY-ID': env.APCA_API_KEY_ID,
    'APCA-API-SECRET-KEY': env.APCA_API_SECRET_KEY,
  };
  if (body !== undefined) {
    h['content-type'] = 'application/json';
  }
  return h;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  baseUrl?: string,
): Promise<Result<T>> {
  const url = `${baseUrl ?? env.APCA_BASE_URL}${path}`;
  const init: RequestInit = { method, headers: authHeaders(body) };
  if (body !== undefined) init.body = JSON.stringify(body);
  const startMs = Date.now();
  let result: Result<T>;
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 429) {
        result = fail('RATE_LIMITED', `Alpaca rate limit on ${method} ${path}`, { httpStatus: res.status, body: text });
      } else {
        // Log the response body for non-2xx so we can diagnose auth/access issues.
        logger.warn('alpaca', `${method} ${path} → ${res.status}`, { body: text.slice(0, 500) });
        result = fail('NON_2XX', `Alpaca ${method} ${path} → ${res.status}`, { httpStatus: res.status, body: text });
      }
    } else {
      try {
        result = ok(JSON.parse(text) as T);
      } catch {
        result = fail('BAD_JSON', `Alpaca returned non-JSON on ${method} ${path}`);
      }
    }
  } catch (err) {
    result = fail('TRANSPORT', `Alpaca transport on ${method} ${path}: ${(err as Error).message}`);
  }

  // FR-010/FR-011/FR-012: surface broker health to the dashboard.
  // Recording is best-effort — never let telemetry failure mask the real error.
  recordHealth(method, path, result, Date.now() - startMs).catch((e: unknown) =>
    logger.error('alpaca', 'telemetry write failed', { error: (e as Error).message }),
  );

  return result;
}

// Map raw call results to the HealthSignal status enum.
type HealthKind = 'broker' | 'quote';
async function recordHealth(method: string, path: string, result: Result<unknown>, latencyMs: number): Promise<void> {
  const isQuote = path.startsWith('/v1beta1/options/quotes') || path.startsWith('/v1beta1/options/snapshots');
  const kind: HealthKind = isQuote ? 'quote' : 'broker';
  const status: 'OK' | 'DEGRADED' | 'UNREACHABLE' = !result.ok
    ? result.error.kind === 'TRANSPORT'
      ? 'UNREACHABLE'
      : 'DEGRADED'
    : 'OK';
  const payload = JSON.stringify({
    ts: new Date().toISOString(),
    status,
    latencyMs,
    retryAfterSeconds: result.ok ? null : null,
    method,
    path,
  });
  const key = kind === 'quote' ? 'last_quote_fetch' : 'last_broker_call';
  await persistence.setAppState(key, payload);
  if (!result.ok && result.error.kind === 'RATE_LIMITED') {
    await increment429();
  }
}

// FR-012: rolling 60-minute window of 429 hits, persisted as a JSON list.
async function increment429(): Promise<void> {
  const raw = await persistence.getAppState('alpaca_429_count');
  const cutoff = Date.now() - 60 * 60 * 1000;
  let arr: string[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as string[];
      arr = parsed.filter((ts) => new Date(ts).getTime() >= cutoff);
    } catch {
      arr = [];
    }
  }
  arr.push(new Date().toISOString());
  await persistence.setAppState('alpaca_429_count', JSON.stringify(arr));
}

export type Account = {
  buying_power: string;
  cash: string;
  portfolio_value: string;
  last_equity: string;
  options_buying_power?: string;
};

export type PositionRow = {
  asset_id: string;
  symbol: string;
  qty: string;
  side: 'long' | 'short';
  avg_entry_price: string;
};

export type AlpacaOrderResponse = {
  id: string;
  client_order_id: string;
  status: string;
  legs?: { id: string; status: string }[];
  // many more fields omitted
};

export class AlpacaService {
  /** Account snapshot — buying power is needed by margin pre-flight. */
  async getAccount(): Promise<Result<Account>> {
    return request<Account>('GET', '/v2/account');
  }

  /** Single position lookup. */
  async getPosition(symbol: string): Promise<Result<PositionRow | null>> {
    const r = await request<PositionRow>('GET', `/v2/positions/${encodeURIComponent(symbol)}`);
    if (!r.ok && r.error.httpStatus === 404) {
      return ok(null);
    }
    return r;
  }

  /** Daily bars for the last N days — used to determine the 2-week price range for chart zoom. */
  async getStockBars(
    symbol: string,
    start: string,
    end: string,
  ): Promise<Result<{ h: number; l: number }[]>> {
    const r = await request<{
      bars: { t: string; o: number; h: number; l: number; c: number; v: number }[];
    }>(
      'GET',
      `/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=1Day&start=${start}&end=${end}&adjustment=raw`,
      undefined,
      env.APCA_DATA_URL,
    );
    if (!r.ok) return r;
    return ok((r.value.bars ?? []).map((b) => ({ h: b.h, l: b.l })));
  }

  /** Latest stock quote (NBBO) from the data API — used for the underlying price. */
  async getStockQuote(symbol: string): Promise<Result<{ bid: string; ask: string }>> {
    const r = await request<{
      symbol: string;
      quote: { bp: number; ap: number; t: string };
    }>('GET', `/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest`, undefined, env.APCA_DATA_URL);
    if (!r.ok) return r;
    return ok({ bid: String(r.value.quote.bp), ask: String(r.value.quote.ap) });
  }

  /** Batch-fetch latest quotes for multiple option OSI symbols at once.
   *  Served from the data API (APCA_DATA_URL). The v1beta1 format uses a
   *  flat structure (no nested `quote` key) and numeric bid/ask values.
   */
  async getOptionQuotesBatch(osis: string[]): Promise<Result<OptionQuote[]>> {
    if (osis.length === 0) return ok([]);
    const csv = osis.map((s) => encodeURIComponent(s)).join(',');
    const url = `/v1beta1/options/quotes/latest?symbols=${csv}`;
    const r = await request<{
      quotes: Record<string, { ap: number; as: number; bp: number; bs: number; t: string }>;
    }>('GET', url, undefined, env.APCA_DATA_URL);
    if (!r.ok) return r;
    const entries = r.value.quotes ?? {};
    const keys = Object.keys(entries);
    logger.debug('alpaca', 'getOptionQuotesBatch response', { requested: osis.length, returned: keys.length, samples: keys.slice(0, 3) });
    const out: OptionQuote[] = [];
    for (const [osi, data] of Object.entries(entries)) {
      const strikeRaw = parseInt(osi.slice(-8), 10);
      const side: 'put' | 'call' = osi[osi.length - 9] === 'C' ? 'call' : 'put';
      const q: OptionQuote = {
        symbol: osi,
        side,
        strike: (strikeRaw / 1000).toFixed(2),
        bid: String(data.bp),
        ask: String(data.ap),
        quotedAt: data.t,
      };
      out.push(q);
    }
    return ok(out);
  }

  /** Quote for a single option contract (used for live mark-to-market).
   *  Served from the data API (APCA_DATA_URL).
   */
  async getOptionQuote(osi: string): Promise<Result<OptionQuote>> {
    const r = await request<{
      quotes: Record<string, { ap: number; as: number; bp: number; bs: number; t: string }>;
    }>('GET', `/v1beta1/options/quotes/latest?symbols=${encodeURIComponent(osi)}&feed=indicative`, undefined, env.APCA_DATA_URL);
    if (!r.ok) return r;
    const entry = r.value.quotes?.[osi];
    if (!entry) {
      return fail('NON_2XX', `No quote for ${osi}`);
    }
    const strikeRaw = parseInt(osi.slice(-8), 10);
    return ok({
      symbol: osi,
      side: osi[osi.length - 9] === 'C' ? 'call' : 'put',
      strike: (strikeRaw / 1000).toFixed(2),
      bid: String(entry.bp),
      ask: String(entry.ap),
      quotedAt: entry.t,
    });
  }

  /** Current market clock — used to determine if the market is open. */
  async getClock(): Promise<Result<MarketClock>> {
    const r = await request<{
      is_open: boolean;
      timestamp: string;
      next_open: string;
      next_close: string;
    }>('GET', '/v2/clock');
    if (!r.ok) return r;
    return ok({
      isOpen: r.value.is_open,
      timestamp: r.value.timestamp,
      nextOpen: r.value.next_open,
      nextClose: r.value.next_close,
    });
  }

  /** Submit a multileg (or any) order; returns the raw response. */
  async submitOrder(payload: Record<string, unknown>): Promise<Result<AlpacaOrderResponse>> {
    logger.info('alpaca', 'submit order', { symbols: payload.symbol, qty: payload.qty });
    return request<AlpacaOrderResponse>('POST', '/v2/orders', payload);
  }

  async cancelOrder(id: string): Promise<Result<void>> {
    return request<void>('DELETE', `/v2/orders/${encodeURIComponent(id)}`);
  }
}

export const alpaca = new AlpacaService();
