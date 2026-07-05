import { env } from '@/backend/config/env';
import { logger } from '@/backend/services/structuredLogger';
import type { OptionQuote } from '@/types/domain';

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

function authHeaders(): Record<string, string> {
  return {
    'APCA-API-KEY-ID': env.APCA_API_KEY_ID,
    'APCA-API-SECRET-KEY': env.APCA_API_SECRET_KEY,
    'content-type': 'application/json',
  };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<Result<T>> {
  const url = `${env.APCA_BASE_URL}${path}`;
  const init: RequestInit = { method, headers: authHeaders() };
  if (body !== undefined) init.body = JSON.stringify(body);
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 429) {
        return fail('RATE_LIMITED', `Alpaca rate limit on ${method} ${path}`, { httpStatus: res.status, body: text });
      }
      return fail('NON_2XX', `Alpaca ${method} ${path} → ${res.status}`, { httpStatus: res.status, body: text });
    }
    try {
      return ok(JSON.parse(text) as T);
    } catch {
      return fail('BAD_JSON', `Alpaca returned non-JSON on ${method} ${path}`);
    }
  } catch (err) {
    return fail('TRANSPORT', `Alpaca transport on ${method} ${path}: ${(err as Error).message}`);
  }
}

export type Account = {
  buying_power: string;
  cash: string;
  portfolio_value: string;
  last_equity: string;
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

  /** Quote for a single option contract (used for live mark-to-market). */
  async getOptionQuote(osi: string): Promise<Result<OptionQuote>> {
    const r = await request<{
      quote: { bp: string; ap: string; t: string };
      underlying_price?: string;
      greeks?: { delta?: string };
    }>('GET', `/v2/options/quotes/latest?symbols=${encodeURIComponent(osi)}&feed=indicative`);
    if (!r.ok) return r;
    const q = r.value.quote;
    const out: OptionQuote = {
      symbol: osi,
      side: osi.includes('P') ? 'put' : 'call',
      strike: '0',
      bid: q.bp,
      ask: q.ap,
      quotedAt: q.t,
    };
    if (r.value.greeks?.delta !== undefined) {
      out.delta = r.value.greeks.delta;
    }
    return ok(out);
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
