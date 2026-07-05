# Alpaca Orders Contract: Multileg Iron Condor

**Feature**: `001-iron-condor-bot`
**Companion to**: `plan.md`, `data-model.md`

This contract documents the exact shape of the Alpaca Options API v2
orders used by `ExecutionService` / `alpacaService.ts`. Every order sent
MUST be recorded as an `OrderSubmission` row carrying the `intentId` of
the originating Risk Engine `Intent`.

## Endpoint

`POST {APCA_BASE_URL}/v2/orders` with `APCA-API-KEY-ID` and
`APCA-API-SECRET-KEY` headers.

## Opening Iron Condor (single atomic `mleg`)

Four legs, single order class `mleg`, day or gtc time-in-force, limit
priced at the net credit. The net credit is the sum of the four legs'
prices with the correct sign (sells positive, buys negative); the
`limit_price` is that net credit per contract.

```json
{
  "symbol": "SPY",
  "qty": "1",
  "side": "buy",
  "type": "limit",
  "time_in_force": "day",
  "order_class": "mleg",
  "limit_price": "0.85",
  "legs": [
    { "symbol": "SPY250711P00430000", "side": "buy",  "ratio_qty": "1", "position_intent": "sell_to_open" ? },
    { "symbol": "SPY250711P00428000", "side": "sell", "ratio_qty": "1" },
    { "symbol": "SPY250711C00438000", "side": "sell", "ratio_qty": "1" },
    { "symbol": "SPY250711C00440000", "side": "buy",  "ratio_qty": "1" }
  ]
}
```

Notes:
- Option symbols follow the OSI convention:
  `SPY 250711 P 00430000` → `SPY250711P00430000`.
- `side` on the parent and on each leg follow Alpaca's mleg rules; the
  builder normalizes so the four legs' directions produce the net credit.
- `limit_price` MUST be computed via the `Money` helper (decimal-safe)
  from the four leg quotes; never from a `number` sum.

## Closing the full Iron Condor (take-profit / stop-loss / panic)

Same `mleg` order class, reversing each leg's `position_intent`:

```json
{
  "symbol": "SPY",
  "qty": "1",
  "side": "sell",
  "type": "limit",
  "time_in_force": "day",
  "order_class": "mleg",
  "limit_price": "0.20",
  "legs": [
    { "symbol": "SPY250711P00428000", "side": "buy",  "ratio_qty": "1" },
    { "symbol": "SPY250711P00430000", "side": "sell", "ratio_qty": "1" },
    { "symbol": "SPY250711C00438000", "side": "buy",  "ratio_qty": "1" },
    { "symbol": "SPY250711C00440000", "side": "sell", "ratio_qty": "1" }
  ]
}
```

For **panic** close the `type` is `market` (no `limit_price`) and the
leg sides are reversed the same way, to guarantee execution.

## Untested-side roll (two coordinated orders)

A roll is **two separate `mleg` orders**: (1) close the untested spread
for a gain, (2) open a new spread on the threatened side at the configured
delta. They are NOT a single order, because the new strikes must be
recomputed from live quotes between the two legs.

1. **Close the untested call spread** (symmetric to the close above,
   two legs only):
   ```json
   { "order_class": "mleg", "legs": [
       { "symbol": "<short call>", "side": "buy",  "ratio_qty": "1" },
       { "symbol": "<long call>",  "side": "sell", "ratio_qty": "1" } ] }
   ```
2. **Open the new spread on the threatened (put) side**, two legs only,
   with strikes recomputed to the configured `targetDelta`:
   ```json
   { "order_class": "mleg", "legs": [
       { "symbol": "<new long put>",  "side": "buy",  "ratio_qty": "1" },
       { "symbol": "<new short put>", "side": "sell", "ratio_qty": "1" } ] }
   ```

The roll builder MUST verify the close filled before submitting the open;
on partial/no fill it escalates via Telegram and leaves the position
untouched (per spec edge case).

## Margin pre-flight

Before submitting any opening order, `ExecutionService` queries
`GET /v2/account` for `buying_power` and rejects the order if
`freeBP < 1.5 × (widthOfSpread × contracts × 100 − entryCredit × contracts × 100)`.
The rejection is recorded as a `PositionEvent` of kind
`OPENED`-rejected and surfaced to Telegram within 30s (guardrail #2, #4).

## Response handling

- 200 with `status: "accepted"` → record `OrderSubmission.status = ACCEPTED`,
  store `alpacaOrderId`.
- 4xx → `REJECTED`, surface to Telegram, no automatic retry (guardrail #2).
- 5xx / timeout → bounded explicit retry (max 2) with backoff, then
  `REJECTED` + Telegram.

Every response (success or failure) is persisted verbatim in
`OrderSubmission.responsePayload`.