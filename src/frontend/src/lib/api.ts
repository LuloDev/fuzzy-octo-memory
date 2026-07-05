// Typed fetchers for the Fastify API.
// Every function returns parsed JSON or throws a structured error so the
// React Query layer can surface a useful message in toasts / error states.

import {
  CreateTickerDto,
  CreateTicker,
  EquityCurveDto,
  MetricsDto,
  PayoffDto,
  PositionDto,
  TickerConfigDto,
  UpdateTickerDto,
  UpdateTicker,
  type Metrics,
  type EquityCurve,
  type Payoff,
  type Position,
  type TickerConfig,
} from './contracts';

// Single machine-readable error envelope per contracts/rest-api.md.
export type ApiError = {
  status: number;
  code: string;
  message: string;
  intentId?: string;
};

class ApiErrorImpl extends Error implements ApiError {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly intentId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json' },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(path, init);
  const text = await res.text();
  if (!res.ok) {
    let parsed: { error?: { code?: string; message?: string; intentId?: string } } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    throw new ApiErrorImpl(
      res.status,
      parsed.error?.code ?? `HTTP_${res.status}`,
      parsed.error?.message ?? (text || res.statusText),
      parsed.error?.intentId,
    );
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

// Plain JSON fetcher (when we don't want / need zod parsing).
const jsonFetch = <T>(path: string, init?: RequestInit): Promise<T> =>
  fetch(path, init).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} on ${path}`);
    return (await r.json()) as T;
  });

// ----- health -----
export const getHealth = () =>
  jsonFetch<{
    status: string;
    uptimeSeconds: number;
    dryRun: boolean;
    lastHeartbeatAt: string | null;
  }>('/api/health');

// ----- tickers -----
export const listTickers = async (): Promise<TickerConfig[]> => {
  const raw = await jsonFetch<{ tickers: unknown[] }>('/api/tickers');
  return raw.tickers.map((t) => TickerConfigDto.parse(t));
};
export const createTicker = async (input: CreateTicker): Promise<TickerConfig> => {
  CreateTickerDto.parse(input);
  return TickerConfigDto.parse(await request('POST', '/api/tickers', input));
};
export const updateTicker = async (id: string, input: UpdateTicker): Promise<TickerConfig> => {
  UpdateTickerDto.parse(input);
  return TickerConfigDto.parse(await request('PATCH', `/api/tickers/${id}`, input));
};

// ----- positions -----
export const listPositions = async (): Promise<Position[]> => {
  const raw = await jsonFetch<{ positions: unknown[] }>('/api/positions');
  return raw.positions.map((p) => PositionDto.parse(p));
};
export const getPayoff = (id: string): Promise<Payoff> =>
  jsonFetch<Payoff>(`/api/positions/${id}/payoff`).then((raw) => PayoffDto.parse(raw));

// ----- metrics & equity -----
export const getMetrics = (): Promise<Metrics> =>
  jsonFetch<unknown>('/api/metrics').then((raw) => MetricsDto.parse(raw));
export const getEquityCurve = (days = 30): Promise<EquityCurve> =>
  jsonFetch<unknown>(`/api/equity-curve?days=${days}`).then((raw) => EquityCurveDto.parse(raw));

// ----- panic -----
export type PanicResult = {
  accepted: boolean;
  positionsClosed: number;
  ordersCanceled: number;
  intentIds: string[];
};
export const triggerPanic = (reason = 'manual') =>
  request<PanicResult>('POST', '/api/panic', { reason });