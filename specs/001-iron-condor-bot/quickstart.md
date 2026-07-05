# Quickstart: Iron Condor Bot Validation Guide

**Feature**: `001-iron-condor-bot`
**Date**: 2026-07-05

This document describes the **runnable end-to-end validation scenarios**
that prove the system works after implementation. It does **not** include
implementation details (those live in `tasks.md` and the source tree);
it points at contracts (`contracts/rest-api.md`, `contracts/alpaca-orders.md`,
`data-model.md`) and `plan.md` for any specific reference.

## Prerequisites

1. Node.js LTS (≥ 22) installed.
2. A free Alpaca paper-trading account with API keys.
3. A Telegram bot token and chat id for a private channel.
4. SQLite (default) available locally.
5. The repository cloned and the backend deps installed.

## Environment

The backend validates the following environment at boot via a zod schema
(`src/backend/config/env.ts`); missing values crash the process loudly
(per Constitution "Technical Constraints").

```
APCA_API_KEY_ID=...
APCA_API_SECRET_KEY=...
APCA_BASE_URL=https://paper-api.alpaca.markets   # paper by default
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
DATABASE_URL=file:./prisma/dev.db                 # SQLite default
DRY_RUN=true                                     # required for the quickstart
MONITOR_INTERVAL_MS=300000                        # 5 min default
DAILY_LOSS_LIMIT=-0.03
PANIC_REQUIRES_CONFIRMATION=false                # quickstart allows one-click panic
```

## Setup

```
# from repo root
npm install
npx prisma migrate dev --name init
npm run build
npm run start:backend &
npm run start:frontend &
```

The frontend default dev port is `5173` (Vite); the backend defaults to
`http://127.0.0.1:3000`. The frontend reads `VITE_API_BASE` from
`src/frontend/.env.local`.

## Validation scenarios

Each scenario corresponds to a row in the success criteria
(`spec.md` § Success Criteria). Run them in order. `DRY_RUN=true` keeps
the bot from sending real orders; scenarios that exercise the broker
switches `DRY_RUN=false` explicitly.

### V1 — Configure SPY and verify persistence (covers SC-001, FR-001, FR-002)

1. Open the dashboard.
2. Click *Add Ticker* → `SPY`, defaults → *Save*.
3. Refresh the page. SPY is listed as enabled.
4. Edit `targetDelta` to `0.12` and `takeProfitPercentage` to `0.50` → *Save*.
5. Stop and restart the backend. Re-open the dashboard. Values persist.
6. Pass criterion: the configuration matches the edit exactly.

### V2 — Dry-run weekly entry (covers SC-002, FR-003, FR-004)

1. With `DRY_RUN=true` and SPY enabled, set the next entry window to fire
   within a few minutes (override `MONITOR_INTERVAL_MS=10000` for the
   test).
2. Wait one cycle.
3. Inspect `PositionEvent` rows in the DB: there should be exactly one
   `OPENED` row for SPY for the current weekly expiration.
4. Pass criterion: a single `OPENED` event with a non-empty `intentPayload`
   and **no** matching `OrderSubmission` rows (dry-run ⇒ no broker
   traffic).

### V3 — Take-profit maneuver (covers SC-003, FR-006, FR-016)

1. Set `DRY_RUN=false` against Alpaca paper.
2. Open one SPY Iron Condor via a manual entry.
3. In the test fixture, inject a snapshot where the combo's current
   value equals `takeProfitPercentage × entryCredit`.
4. Run one monitoring cycle.
5. Pass criterion: a `TAKE_PROFIT_TRIGGERED` event is recorded, a
   closing `OrderSubmission` is recorded against the Alpaca paper
   endpoint, and a Telegram message arrives within 30s.

### V4 — Stop-loss maneuver (covers SC-003, FR-007)

1. Same setup as V3.
2. Inject a snapshot where the combo's current value equals
   `stopLossMultiplier × entryCredit`.
3. Pass criterion: a `STOP_LOSS_TRIGGERED` event is recorded, a closing
   `OrderSubmission` is recorded, Telegram alert within 30s.

### V5 — Untested-side roll (covers SC-003, FR-008, FR-009)

1. With an open SPY Iron Condor.
2. Inject a snapshot where the underlying is within 1% of the short put
   strike while the call side is still well outside.
3. Pass criterion: an `UNTESTED_ROLL` event and a follow-up
   `ROLL_EXECUTED` event are recorded; two coordinated `OrderSubmission`
   rows exist (close untested call spread, open new put spread at the
   configured delta).

### V6 — Panic flatten (covers SC-004, FR-010)

1. With two open Iron Condors and at least one pending order.
2. POST `/api/panic` with `{ "reason": "validation" }`.
3. Pass criterion: within one minute every position has `status = PANIC_CLOSED`
   and a corresponding `PositionEvent` and `OrderSubmission` row; the
   pending order is canceled; Telegram receives the panic-close summary.

### V7 — Telegram event coverage (covers SC-005, FR-014)

Trigger each event type in turn (V2–V6 plus a forced broker error).
Pass criterion: every event has a corresponding Telegram message within
30s, and the daily heartbeat arrives within the configured cadence.

### V8 — Dashboard reconciliation (covers SC-006, FR-011, FR-012, FR-013)

1. After running V3–V5, load the dashboard.
2. The four numbers (`realizedPnL`, `unrealizedPnL`, `projectedMaxProfit`,
   `maxRisk`) MUST reconcile with the sum of `PositionEvent.realizedPnL`
   plus `Position.currentValue − Position.entryCredit` to the cent.
3. The payoff diagram MUST show the two break-evens, a profit/loss
   shading and the current underlying price as a movable marker.
4. The equity curve MUST match the `TickerDailyPnL` series.

### V9 — Audit reconstruction (covers SC-007, FR-016)

Pick any historical `Position` row from the database. From the
`PositionEvent` rows for that position plus the `OrderSubmission` rows,
reconstruct in a text editor: the four strikes, the contracts, the
entry credit, the exit reason and the realized PnL. Pass criterion:
the reconstructed record matches the `Position` row exactly.

### V10 — Dry-run identicality (covers SC-008, FR-017)

1. With the same market snapshot, run one monitoring cycle under
   `DRY_RUN=true` and again under `DRY_RUN=false` (paper account).
2. Pass criterion: the recorded `Intent[]` produced by `riskEngine.ts`
   is identical for both runs; under `DRY_RUN=true` no `OrderSubmission`
   rows are created.

## What this guide does **not** cover

- Implementation steps, file paths or code snippets — see `tasks.md` and
  the source tree.
- CI configuration — see the constitution `Development Workflow` section.
- Production hardening (TLS, auth, scaling) — explicitly out of scope
  for v1 per `spec.md` § Assumptions.

## When this guide passes

The feature is ready for `/speckit-tasks` (which produces `tasks.md`)
and then `/speckit-implement`.