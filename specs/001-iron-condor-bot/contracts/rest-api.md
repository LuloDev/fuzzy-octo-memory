# REST API Contract: Iron Condor Trading System

**Feature**: `001-iron-condor-bot`
**Base URL**: `http://<host>:<port>/api` (Fastify)
**Format**: JSON; all monetary fields are JSON strings.

The frontend never calls Alpaca. Every mutation flows through these
endpoints, which route through `ExecutionService`. Request/response
shapes are enforced by zod schemas in `src/shared/contracts.ts` and
attached to Fastify via `fastify-type-provider-zod`.

## Conventions

- Money fields (`Decimal`) are transmitted as strings.
- Timestamps are ISO-8601 UTC.
- `intentId` is returned on any endpoint that can produce an order.
- Errors: HTTP 4xx/5xx with `{ "error": { "code": "...", "message": "...", "intentId"?: "..." } }`.

## Endpoints

### `GET /api/health`
Health + heartbeat status.

Response 200:
```json
{ "status": "ok", "uptimeSeconds": 123456, "dryRun": true, "lastHeartbeatAt": "2026-07-05T13:00:00Z" }
```

### `GET /api/tickers`
List all ticker configurations.

Response 200: `{ "tickers": TickerConfigDto[] }`

### `POST /api/tickers`
Create a ticker configuration.

Body:
```json
{ "symbol": "SPY", "enabled": true, "allocationPercentage": "30",
  "targetDelta": "0.12", "widthOfSpread": "2.00",
  "takeProfitPercentage": "0.50", "stopLossMultiplier": "3.00",
  "dailyLossLimit": "-0.03" }
```
Response 201: `TickerConfigDto` (with `id`, `createdAt`, `updatedAt`).

### `PATCH /api/tickers/:id`
Mutate fields. Every call writes a `TickerConfigRevision`.

Body: partial `TickerConfigDto` + optional `reason`.
Response 200: updated `TickerConfigDto`.

### `GET /api/positions`
List positions; `?status=OPEN` to filter live ones.

Response 200: `{ "positions": PositionDto[] }`

### `GET /api/metrics`
Dashboard financial metrics.

Response 200:
```json
{ "realizedPnL": "1234.56", "unrealizedPnL": "-87.20",
  "projectedMaxProfit": "320.00", "maxRisk": "980.00",
  "marginUsed": "4200.00", "marginFree": "15800.00",
  "dailyPnL": { "SPY": "-42.10", "QQQ": "60.00" } }
```

### `GET /api/positions/:id/payoff`
Payoff diagram data for one position.

Response 200:
```json
{ "breakEvenLower": "430.20", "breakEvenUpper": "439.80",
  "maxProfit": "1.80", "maxLoss": "8.20",
  "underlyingPrice": "435.10",
  "curve": [ { "price": "420.00", "pnl": "-820.00" }, ... ] }
```

### `GET /api/equity-curve?days=30`
Equity curve + daily PnL series.

Response 200:
```json
{ "series": [ { "date": "2026-07-01", "equity": "10420.10", "pnl": "120.40" }, ... ] }
```

### `POST /api/panic`
**Panic Button** — bypasses the Risk Engine. Cancels every open order and
market-closes every open Iron Condor on every enabled ticker.

Body: `{ "reason": "manual panic" }`
Response 202:
```json
{ "accepted": true, "intentIds": ["...", "..."],
  "positionsClosed": 3, "ordersCanceled": 1 }
```

## DTOs (excerpt)

```ts
type TickerConfigDto = {
  id: string; symbol: string; enabled: boolean;
  allocationPercentage: string; targetDelta: string;
  widthOfSpread: string; takeProfitPercentage: string;
  stopLossMultiplier: string; dailyLossLimit: string;
  createdAt: string; updatedAt: string;
};

type PositionDto = {
  id: string; symbol: string; expiration: string;
  shortPutStrike: string; longPutStrike: string;
  shortCallStrike: string; longCallStrike: string;
  contracts: number; entryCredit: string;
  currentValue: string | null; status: PositionStatus;
  closedAt: string | null; closingPnL: string | null;
};
```

Full zod definitions live in `src/shared/contracts.ts` and are the
authoritative contract for both Fastify route handlers and the React
client.