# Data Model: Iron Condor Trading System

**Feature**: `001-iron-condor-bot`
**Companion to**: `plan.md`, `spec.md`

This document defines the persisted entities for the Iron Condor bot and
maps them to the Prisma schema. Monetary fields use `Decimal` (Prisma's
arbitrary-precision decimal type) and are read/written exclusively through
the `Money` helper that wraps `decimal.js`. No entity uses native
`Float` for money.

## Conventions

- **`id`** — UUIDv7 across the board for time-ordered, URL-safe ids.
- **`createdAt` / `updatedAt`** — UTC timestamps; never mutated except
  by Prisma `@updatedAt`.
- **Money** — `Decimal` columns; serialized as strings over the wire.
- **Audit immutability** — `PositionEvent` and `OrderSubmission` rows
  are write-once. There is no update or delete on these tables; any
  "amendment" is a new row referencing the original.

## Entities

### `TickerConfig`

The trader's per-underlying configuration.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `symbol` | String, unique | e.g. `SPY`, `QQQ`. |
| `enabled` | Boolean | Master switch for entries on this symbol. |
| `allocationPercentage` | Decimal(5,2) | % of account capital assigned. 0–100. |
| `targetDelta` | Decimal(4,2) | e.g. `0.10`, `0.15`. Range 0.05–0.50. |
| `widthOfSpread` | Decimal(6,2) | USD. e.g. `2.00`, `5.00`. |
| `takeProfitPercentage` | Decimal(4,2) | % of credit, e.g. `0.50`. Range 0.10–0.95. |
| `stopLossMultiplier` | Decimal(4,2) | e.g. `3.00`. Range ≥ 1.5. |
| `dailyLossLimit` | Decimal(5,2) | % of allocation, e.g. `-0.03`. |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | `@updatedAt`. |

Relations: `revisions: TickerConfigRevision[]`.

### `TickerConfigRevision`

Append-only snapshot of any previous `TickerConfig` value whenever the
config is mutated.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `tickerConfigId` | FK → TickerConfig | |
| `previousValue` | Json | Full previous record. |
| `newValue` | Json | Full new record. |
| `updatedAt` | DateTime | When the change happened. |
| `reason` | String? | Optional human note from the UI. |

### `Position`

A live (or recently closed) Iron Condor for one weekly cycle.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `symbol` | String | Underlying. |
| `expiration` | Date | Friday of the trading week (UTC). |
| `shortPutStrike` | Decimal(8,2) | |
| `longPutStrike` | Decimal(8,2) | `= shortPutStrike - widthOfSpread`. |
| `shortCallStrike` | Decimal(8,2) | |
| `longCallStrike` | Decimal(8,2) | `= shortCallStrike + widthOfSpread`. |
| `contracts` | Int | Equal across all four legs. |
| `entryCredit` | Decimal(8,4) | Net credit received at open, signed per contract. |
| `entryTimestamp` | DateTime | When the opening mleg filled. |
| `currentValue` | Decimal(10,4)? | Last marked-to-market value. Null until first poll. |
| `status` | Enum | `OPEN`, `TAKE_PROFIT`, `STOP_LOSS`, `ROLLED`, `PANIC_CLOSED`. |
| `closedAt` | DateTime? | |
| `closingPnL` | Decimal(10,4)? | Realized PnL on close. |

Indexes:
- `(symbol, expiration)` for entry-duplicate prevention.
- `(status, symbol)` for monitoring queries.

### `PositionEvent`

Immutable record of every state transition on a `Position`.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `positionId` | FK → Position | |
| `kind` | Enum | `OPENED`, `TAKE_PROFIT_TRIGGERED`, `STOP_LOSS_TRIGGERED`, `UNTESTED_ROLL`, `ROLL_EXECUTED`, `PANIC_CLOSED`, `HEARTBEAT`. |
| `marketSnapshot` | Json | Underlying price, IV, option quotes at the moment of decision. |
| `realizedPnL` | Decimal(10,4)? | Populated on close events. |
| `intentPayload` | Json? | The `Intent` produced by the Risk Engine for this event. |
| `createdAt` | DateTime | Decision timestamp. |

### `OrderSubmission`

Immutable record of every order sent to Alpaca.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `positionEventId` | FK → PositionEvent | The event that produced the order. |
| `intentId` | UUID | Identifies the originating `Intent`. |
| `alpacaOrderId` | String? | Filled in once the broker acknowledges. |
| `requestPayload` | Json | Full body sent to `/v2/orders`. |
| `responsePayload` | Json? | Full response from Alpaca. |
| `status` | Enum | `PENDING`, `ACCEPTED`, `FILLED`, `PARTIALLY_FILLED`, `CANCELED`, `REJECTED`. |
| `submittedAt` | DateTime | When we POSTed. |
| `acknowledgedAt` | DateTime? | When Alpaca acknowledged. |
| `filledAt` | DateTime? | |

### `TickerDailyPnL`

A daily PnL aggregate used by the equity curve.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `symbol` | String | |
| `date` | Date | Trading day (UTC). |
| `realizedPnL` | Decimal(12,4) | Sum of `Position.closingPnL` closed on this day. |
| `unrealizedPnL` | Decimal(12,4) | Mark-to-market at session close. |

Indexes: `(symbol, date)` unique.

## State transitions

```
Position.status:
   (none) ─entry fill─▶ OPEN ─take-profit─▶ TAKE_PROFIT ─close fill─▶ (terminal)
                            ├─stop-loss────▶ STOP_LOSS  ─close fill─▶ (terminal)
                            ├─roll────────▶ ROLLED     ─close + open▶ OPEN (new position)
                            └─panic────────▶ PANIC_CLOSED            ▶ (terminal)
```

`ROLLED` happens only if the original close fills successfully and the
replacement open fills; otherwise the position remains in its previous
status and a new event captures the failure.

## Validation rules (zod mirrors of these entities)

A zod schema in `src/shared/contracts.ts` mirrors each entity and is the
single source of truth for REST request/response validation. The Prisma
client is generated from `prisma/schema.prisma`; drift between Prisma
types and the zod schemas is caught by a CI smoke test that instantiates
a Prisma row and parses it through zod.

## Retention

- `Position`, `PositionEvent`, `OrderSubmission`, `TickerDailyPnL`:
  retained a minimum of **12 months** per Constitution Principle V.
- `TickerConfig`, `TickerConfigRevision`: retained while the system
  exists; revisions never deleted (only appended).
