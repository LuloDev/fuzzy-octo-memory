---
description: "Task list for the Automated Weekly Iron Condor Trading System"
---

# Tasks: Automated Weekly Iron Condor Trading System

**Input**: Design documents from `/specs/001-iron-condor-bot/`
- `plan.md` (tech stack, structure)
- `spec.md` (user stories P1/P1/P1/P2/P2/P3)
- `data-model.md` (6 entities)
- `contracts/rest-api.md` + `contracts/alpaca-orders.md`
- `research.md` (10 decisions)
- `quickstart.md` (V1–V10 validation scenarios)

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Required for `src/backend/risk/**`, `src/backend/orders/**` and
`src/types/money.ts` per Constitution Principle IV (NON-NEGOTIABLE ≥90%
coverage). Optional but recommended elsewhere.

**Organization**: Tasks grouped by user story so each story stays
independently implementable and testable. The Risk Engine (US3)
inherits everything the constitution demands and is built test-first.

## Format: `[ID] [P?] [Story?] Description`

- **[P]** = parallelizable (different files, no dependency on an in-flight task)
- **[Story]** = which user story (US1…US6). Setup/Foundational/Polish phases omit it.
- Each task includes the exact file path it creates or mutates.

## Path Conventions

Web application layout (per plan.md):
- Backend: `src/backend/{services,risk,orders,api,config}/`, types in `src/types/`, shared in `src/shared/`
- Frontend: `src/frontend/{components,pages,hooks,services}/`
- Database: `prisma/schema.prisma` + `prisma/migrations/`
- Tests: `tests/{unit,integration,contract}/`

---

## Phase 1: Setup (Project Initialization)

**Purpose**: Scaffold both halves of the project and wire up the tooling
the constitution requires (`tsc --noEmit` clean, eslint, vitest, prisma,
vite).

- [X] T001 Initialize npm workspace at repo root with `package.json`, `tsconfig.json` (`"strict": true`, `"target": "ES2022"`, path aliases `@/*` → `src/*`), and `.gitignore` covering `node_modules`, `dist`, `prisma/dev.db`.
- [X] T002 Add shared dev dependencies (`typescript`, `tsx`, `vitest`, `fast-check`, `@vitest/coverage-v8`, `eslint`, `@typescript-eslint/*`, `prettier`, `husky`, `lint-staged`) to root `package.json` scripts: `typecheck`, `lint`, `test`, `test:coverage`, `format`.
- [X] T003 [P] Create backend folder skeleton: `src/backend/{services,risk/maneuvers,orders,api/routes,api/schemas,config}/`, `src/types/`, `src/shared/`, `prisma/`, `tests/{unit,integration,contract}/{risk,orders,money,api}/`.
- [X] T004 [P] Create frontend folder skeleton with Vite React-TS template into `src/frontend/` (own `package.json`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `index.html`).
- [X] T005 [P] Add backend runtime deps to `package.json`: `fastify`, `@fastify/cors`, `fastify-type-provider-zod`, `zod`, `decimal.js`, `@prisma/client`, `dotenv`.
- [X] T006 [P] Add frontend deps to `src/frontend/package.json`: `react@18`, `react-dom`, `tailwindcss`, `recharts`, `@tanstack/react-query`, `zod`, plus dev deps for Vite, Vitest, Testing Library.
- [X] T007 Initialize Prisma in `prisma/schema.prisma` with `datasource db { provider = "sqlite" url = env("DATABASE_URL") }` and `generator client { provider = "prisma-client-js" }`. Add the `prisma` CLI to devDeps and create the initial empty migration directory.
- [X] T008 Add root `.env.example` with all keys from `spec.md` quickstart (`APCA_API_KEY_ID`, `APCA_API_SECRET_KEY`, `APCA_BASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DATABASE_URL`, `DRY_RUN`, `MONITOR_INTERVAL_MS`, `DAILY_LOSS_LIMIT`, `PANIC_REQUIRES_CONFIRMATION`) and a Zod schema stub in `src/shared/envSchema.ts`.

**Checkpoint**: `npm run typecheck && npm run lint && npm run test && npx prisma format && npx vite --version && npx tsc --version` all succeed; project skeleton exists; nothing has been built yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the lowest layers the rest of the system depends on.
**⚠️ CRITICAL**: No user story work begins until this phase completes.

- [X] T009 Implement `src/backend/config/env.ts` — parse `process.env` through `src/shared/envSchema.ts`, crash loudly on missing/malformed values for the broker, Telegram and `DATABASE_URL`.
- [X] T010 [P] Implement `src/types/money.ts` with a `Money` helper wrapping `decimal.js`: immutable `Money` class, `from(string|Decimal)`, `plus/sub/mul/div/round/cmp`, JSON serialization as string.
- [X] T011 Author `tests/unit/money/money.test.ts` for the `Money` helper: arithmetic, rounding, serialization, comparison; all must fail before implementation is considered complete (RGR cycle, Constitution Principle IV).
- [X] T012 Author `tests/unit/money/money.property.test.ts` using `fast-check` for invariants (associativity, identity, distributivity, scale-by-100 never introduces drift).
- [X] T013 [P] Implement `src/types/domain.ts`: `TickerConfig`, `Position`, `PositionStatus`, `Intent` (discriminated union: `CloseAll | RollUntestedSide | Hold | Reject`), `MarketSnapshot`, all `Money` fields expressed as `string` over the wire.
- [X] T014 [P] Implement `src/types/events.ts`: `PositionEventKind` enum, `PositionEvent`, `OrderSubmission`, `TickerConfigRevision` shapes matching `data-model.md`.
- [X] T015 Implement `src/backend/services/persistenceService.ts` with a thin Prisma wrapper: typed CRUD for `TickerConfig`, `TickerConfigRevision`, `Position`, `PositionEvent`, `OrderSubmission`, `TickerDailyPnL`; append-only writes for the audit tables (no `update`/`delete`).
- [X] T016 Generate the initial Prisma migration for all entities in `data-model.md` (use `npx prisma migrate dev --name init`); confirm it creates the six tables with the indexes and uniques from `data-model.md`.
- [X] T017 [P] Implement `src/backend/services/alpacaService.ts` with a minimal `fetch`-based client covering only: `getAccount()`, `getPosition(symbol)`, `getOptionQuote(osi)`, `submitOrder(payload)`, `cancelOrder(id)`. Each returns a discriminated `Result<Ok, BrokerError>` and NEVER throws on broker errors.
- [X] T018 [P] Implement `src/backend/services/telegramNotifier.ts` with `sendMessage(markdown)` that escapes per MarkdownV2 rules, retries up to 2 times with exponential backoff, and emits a typed `AlertKind`.
- [X] T019 Implement `src/backend/services/structuredLogger.ts` that emits `{level, service, intent, ticker, positionId, pnl, timestamp}` JSON lines and pipes them to stdout.
- [X] T020 Implement `src/backend/app.ts` (composition root): wires `persistenceService`, `alpacaService`, `telegramNotifier`, the Fastify server and (placeholder) the monitoring loop. Export `createApp()` for tests.
- [X] T021 Implement `src/backend/api/server.ts` — Fastify boot, CORS, request id, error handler that returns the `{ error: { code, message } }` envelope from `contracts/rest-api.md`; verify zod schemas are attached via `fastify-type-provider-zod`.
- [X] T022 Set up `vitest.config.ts` with path aliases for `@/*` and coverage thresholds ≥ 90% for `src/backend/risk/**`, `src/backend/orders/**`, `src/types/money.ts`; this gates the CI step defined in the constitution.

**Checkpoint**: Boot the backend (`npm run start:backend`) — it logs `env OK`, starts Fastify on `:3000`, connects to Prisma, and responds `200` to `GET /api/health`. All foundational tests pass with no Skipped tests.

---

## Phase 3: User Story 1 — Configure Multi-Ticker Iron Condor Strategies (Priority: P1) 🎯 MVP

**Goal**: A trader can add/edit/disable a ticker and its parameters from the dashboard and have those parameters drive every later phase.

**Independent Test**: Run quickstart scenario **V1** — add SPY via the dashboard, edit deltas, restart the backend, confirm values persist; ticker list renders on `/api/tickers` and in the UI.

### Tests for User Story 1 ⚠️

- [X] T023 [P] [US1] Contract/integration test for ticker CRUD in `tests/integration/api/tickers.test.ts` against `fastify.inject`: POST/GET/PATCH including validation failures and revision creation.
- [X] T024 [P] [US1] Service-level test in `tests/unit/persistence/tickerConfigRevisions.test.ts` confirming every PATCH writes a `TickerConfigRevision` and never mutates prior rows.

### Implementation for User Story 1

- [X] T025 [P] [US1] Implement `src/backend/api/routes/tickers.ts`: `GET /api/tickers`, `POST /api/tickers`, `PATCH /api/tickers/:id`. Validate every body with zod, write a `TickerConfigRevision` on every PATCH.
- [X] T026 [P] [US1] Implement `src/backend/api/schemas/tickers.ts` with `TickerConfigDto`, `CreateTickerDto`, `UpdateTickerDto` (partial) — exported from `src/shared/contracts.ts` so the frontend can reuse the same types.
- [X] T027 [US1] Implement `src/frontend/hooks/useTickers.ts` (React Query) and `src/frontend/services/apiClient.ts` (typed `fetch` wrapper that uses the shared zod schemas for runtime validation).
- [X] T028 [US1] Implement `src/frontend/components/TickerControlPanel.tsx`: list, inline edit, enable/disable toggle, "Add Ticker" form. Use Tailwind for layout density.
- [X] T029 [US1] Implement `src/frontend/pages/Dashboard.tsx` shell that mounts the `TickerControlPanel` plus a placeholder slot for the metrics panel (filled in US4).
- [X] T030 [P] [US1] Integrate Tailwind base/components/utilities in `src/frontend/src/index.css`; ensure `npm run dev` for `src/frontend/` renders the dashboard with a Tailwind-styled ticker list.

**Checkpoint**: US1 fully functional on its own — adding/editing/disabling a ticker through the dashboard persists across restarts; passing V1 closes the checkpoint.

---

## Phase 4: User Story 2 — Execute Weekly Iron Condor Entries Automatically (Priority: P1) 🎯 MVP

**Goal**: At the configured entry window the system opens exactly one Iron
Condor per enabled ticker for the current weekly expiration, with margin
pre-flight and duplicate-entry prevention.

**Independent Test**: Run quickstart scenario **V2** — dry-run a single
entry cycle and verify exactly one `OPENED` event and no broker traffic;
then repeat in paper mode and verify the broker order matches the
contract in `contracts/alpaca-orders.md`.

### Tests for User Story 2 ⚠️

- [X] T031 [P] [US2] Contract test for the opening mleg payload in `tests/contract/openOrderShape.test.ts` — fixtures verifying legs, qty, side, `order_class=mleg`, `limit_price` math uses the `Money` helper.
- [X] T032 [P] [US2] Unit test in `tests/unit/orders/ironCondorBuilder.test.ts` for `buildOpenOrder(config, snapshot)` — strike selection by delta tolerance, width application, credit computation.
- [X] T033 [P] [US2] Unit test for margin pre-flight in `tests/unit/execution/marginPreflight.test.ts`: reject when `freeBP < 1.5 × worstCaseLoss`, accept otherwise.
- [X] T034 [P] [US2] Unit test in `tests/unit/monitoring/entryDedup.test.ts` confirming no second `OPENED` event can be recorded for the same `(symbol, expiration)`.
- [X] T035 [US2] Integration test `tests/integration/entryCycle.test.ts` using a fake `alpacaService`: one cycle produces a single `OPENED` `PositionEvent` plus its `OrderSubmission` with non-null `intentId`.

### Implementation for User Story 2

- [X] T036 [P] [US2] Implement `src/backend/orders/ironCondorBuilder.ts` exporting `buildOpenOrder(config, snapshot)` returning the mleg payload from `contracts/alpaca-orders.md` § "Opening Iron Condor", with `Money`-based credit math.
- [X] T037 [P] [US2] Implement `src/backend/services/monitoringService.ts` skeleton with the 5-minute `setInterval` loop, immediate graceful `SIGTERM`/`SIGINT` shutdown, and dead-man's-switch bookkeeping (lastHeartbeatAt).
- [X] T038 [US2] Implement `src/backend/services/executionService.ts` `openIronCondor(config, snapshot, intentId)` path: margin pre-flight → `OrderSubmission(PENDING)` → `alpacaService.submitOrder()` → on success persist `OrderSubmission(ACCEPTED)` and `Position`+`PositionEvent(OPENED)`; on rejection persist `REJECTED` and emit Telegram.
- [X] T039 [US2] Wire the entry sweep in `monitoringService.ts`: per enabled ticker call `entrySweep(config)` which is a no-op if a position for `(symbol, currentWeekExpiration)` already exists; otherwise build the snapshot (closing-only quotes) and call `executionService.openIronCondor(...)`. Honors `DRY_RUN=true` (logs intent, no submit).
- [X] T040 [US2] Resolve the weekly expiration in `src/backend/services/expirationCalendar.ts`: `nextFridayExpiration(now)` returning the Friday of the current trading week (Friday if today is Friday).

**Checkpoint**: US2 fully functional on its own — V2 passes; first paper Iron Condor opens and lands in the audit trail.

---

## Phase 5: User Story 3 — Apply Automatic Risk Maneuvers (Priority: P1) 🎯 MVP

**Goal**: Every monitoring cycle the Risk Engine decides take-profit,
stop-loss and untested-side roll, returning a typed `Intent[]`. The
Execution layer then translates each intent into the appropriate `mleg`
order and records every step.

**Independent Test**: Run quickstart scenarios **V3, V4, V5**; each
maneuver must fire on its qualifying snapshot within one cycle and emit
the corresponding Telegram alert inside 30 seconds.

### Tests for User Story 3 ⚠️ (per Constitution Principle IV — test-first)

- [X] T041 [P] [US3] Unit test `tests/unit/risk/intents.test.ts` — discriminated-union exhaustion, pattern-match coverage, error states.
- [X] T042 [P] [US3] Unit test `tests/unit/risk/takeProfit.test.ts` (must FAIL before T046 is written): boundary at `takeProfitPercentage`, any state below returns `Hold`.
- [X] T043 [P] [US3] Unit test `tests/unit/risk/stopLoss.test.ts` (must FAIL before T047): boundary at `stopLossMultiplier × entryCredit`, includes panic-precedence comment.
- [X] T044 [P] [US3] Unit test `tests/unit/risk/rollUntestedSide.test.ts` (must FAIL before T048): only triggers when within 1% of a short strike and the opposite side is profitable; recomputes strikes from a fresh snapshot to the configured delta.
- [X] T045 [P] [US3] Property-based test `tests/unit/risk/pnlReconciliation.test.ts` with `fast-check`: the sum of leg PnLs always reconciles to the combo PnL to the cent.
- [X] T046 [US3] Implement `src/backend/risk/maneuvers/takeProfit.ts` — pure function over `(position, snapshot, config) → Intent[]`; must make T042 pass.
- [X] T047 [US3] Implement `src/backend/risk/maneuvers/stopLoss.ts` — pure function; must make T043 pass.
- [X] T048 [US3] Implement `src/backend/risk/maneuvers/rollUntestedSide.ts` — pure function returning `RollUntestedSide` intent with recomputed strikes; must make T044 pass.
- [X] T049 [US3] Implement `src/backend/risk/riskEngine.ts` exporting `evaluate(position, snapshot, config): Intent[]` — aggregates the three maneuvers, applies priority (take-profit beats stop-loss when both fire on the same cycle), and never throws on benign input; invalid states return `Reject { reason }`.
- [X] T050 [P] [US3] Implement `src/backend/orders/closeBuilder.ts` with `buildCloseOrder(position)` — full 4-leg `mleg` close matching `contracts/alpaca-orders.md` § "Closing".
- [X] T051 [P] [US3] Implement `src/backend/orders/rollBuilder.ts` exporting `buildRollCloseLegs(position, side)` and `buildRollOpenLegs(config, snapshot, side)` producing the two coordinated orders in `contracts/alpaca-orders.md` § "Untested-side roll".
- [X] T052 [US3] Extend `executionService.ts` with `applyIntents(position, intents, snapshot)`: maps each `Intent` to the relevant builder call, sequences roll legs (close-fill verified before open submit), persists matching `PositionEvent` rows (TAKE_PROFIT_TRIGGERED / STOP_LOSS_TRIGGERED / UNTESTED_ROLL / ROLL_EXECUTED) with `intentId`, and emits Telegram on each event.
- [X] T053 [US3] Add the daily-loss circuit breaker in `src/backend/services/monitoringService.ts`: query today's `TickerDailyPnL`, halt new entries when below `dailyLossLimit`, emit Telegram `WARN`.
- [X] T054 [US3] Wire the per-position sweep: for each `OPEN` position fetch fresh snapshot, call `riskEngine.evaluate`, if `Intent[]` is non-empty dispatch `executionService.applyIntents`; tag every persisted event with the originating snapshot JSON.
- [X] T055 [US3] Integration test `tests/integration/riskCycle.test.ts` driving V3/V4/V5 with fake `alpacaService` and asserting event ordering, event kinds, and Telegram call counts.

**Checkpoint**: V3, V4, V5 from `quickstart.md` all pass; the audit table for any historical maneuver can be reconstructed from `PositionEvent` + `OrderSubmission` rows alone (V9 prep).

---

## Phase 6: User Story 4 — Visualize Live Financial State on a Dashboard (Priority: P2)

**Goal**: The dashboard surfaces realized/unrealized PnL, projected max
profit, max risk, margin usage, the payoff diagram and the equity
curve; all numbers reconcile to the audit log.

**Independent Test**: Run quickstart scenario **V8** after V3–V5; all
dashboard numbers match the underlying `PositionEvent` records to the
cent.

### Tests for User Story 4

- [X] T056 [P] [US4] Unit test `tests/unit/metrics/reconciliation.test.ts` — sums across `PositionEvent.realizedPnL` and `Position.currentValue − Position.entryCredit` equal the metrics endpoint output to the cent.
- [X] T057 [P] [US4] Unit test `tests/unit/metrics/payoffCurve.test.ts` — break-evens, max profit/loss, and the 101-point payoff curve over a wide underlying range.
- [X] T058 [P] [US4] Unit test `tests/unit/metrics/equityCurve.test.ts` — daily aggregation from `TickerDailyPnL`, ascending dates, gap-filling on no-trade days.

### Implementation for User Story 4

- [X] T059 [P] [US4] Implement `src/backend/api/routes/metrics.ts` — `GET /api/metrics` returning the DTO from `contracts/rest-api.md`.
- [X] T060 [P] [US4] Implement `src/backend/api/routes/positions.ts` — `GET /api/positions` and `GET /api/positions/:id/payoff`.
- [X] T061 [P] [US4] Implement `src/backend/api/routes/equityCurve.ts` — `GET /api/equity-curve?days=30`.
- [X] T062 [US4] Implement `src/frontend/hooks/useMetrics.ts`, `usePositions.ts`, `useEquityCurve.ts` (React Query) bound to the new endpoints.
- [X] T063 [US4] Implement `src/frontend/components/MetricsPanel.tsx` — dense Tailwind grid of the four core numbers (realized PnL, unrealized PnL, projected max profit, max risk) plus a margin-used vs margin-free bar.
- [X] T064 [US4] Implement `src/frontend/components/PayoffDiagram.tsx` with Recharts `LineChart` — the live payoff curve with shaded profit/loss zones, break-even markers, and a movable reference line for the underlying price.
- [X] T065 [US4] Implement `src/frontend/components/EquityCurve.tsx` with Recharts `ComposedChart` overlaying daily PnL bars on the equity line.
- [X] T066 [US4] Mount the three new components into `src/frontend/pages/Dashboard.tsx` below the `TickerControlPanel`.

**Checkpoint**: V8 (and SC-006) pass; the dashboard updates within one monitoring cycle.

---

## Phase 7: User Story 5 — Receive Critical Alerts via Telegram (Priority: P2)

**Goal**: Every critical event produces a Telegram message within 30s;
a daily heartbeat fires during market hours; absence of a heartbeat for
30 min raises a Telegram `WARN`.

**Independent Test**: Run quickstart scenario **V7** — trigger each
event type in turn and confirm a message arrives within 30s; observe the
heartbeat arrival during a paper-trading session.

### Tests for User Story 5

- [X] T067 [P] [US5] Unit test `tests/unit/telegram/markdownEscape.test.ts` — all MarkdownV2 special chars are escaped in dynamic fields.
- [X] T068 [P] [US5] Unit test `tests/unit/telegram/deadMansSwitch.test.ts` — given `lastHeartbeatAt > 30 min ago`, the next sweep emits `WARN`.

### Implementation for User Story 5

- [X] T069 [P] [US5] Extend `src/backend/services/telegramNotifier.ts` with a typed `AlertKind` enum and helper formatters for each event in §5 of the spec (OPENED, TP, SL, ROLL, PANIC, ERROR, MARGIN_SHORTFALL, HEARTBEAT).
- [X] T070 [US5] Add a market-hours-aware `heartbeatScheduler` in `src/backend/app.ts`: emits HEARTBEAT once per market session day; tracking `lastHeartbeatAt`.
- [X] T071 [US5] Add the absence-of-heartbeat watcher to `monitoringService.ts`: if `now - lastHeartbeatAt > 30min`, send a `WARN` alert via Telegram.
- [X] T072 [US5] Sweep the existing event sites (T038 entry, T052 maneuvers, T053 circuit breaker) to ensure every one calls the Telegram helper with the structured payload; double-check no event is silent.
- [X] T073 [US5] Integration test `tests/integration/telegramCoverage.test.ts` — for each AlertKind that has a producing code path, trigger it via a fake bot and assert the message body contains the required fields.

**Checkpoint**: V7 passes; SC-005 (100% of critical events generate a Telegram message within 30s) holds.

---

## Phase 8: User Story 6 — Panic-Liquidate Everything (Priority: P3)

**Goal**: One button cancels every open order and market-closes every
open Iron Condor on every enabled ticker, bypassing the Risk Engine.

**Independent Test**: Run quickstart scenario **V6**; with two open
positions and a pending order, POSTing `/api/panic` results in every
position with `status = PANIC_CLOSED` and the pending order cancelled
within one minute.

### Tests for User Story 6

- [X] T074 [P] [US6] Unit test `tests/unit/execution/panicService.test.ts` — cancellation+close plan is built even when intent evaluation is skipped; collects every `intentId`.
- [X] T075 [US6] Integration test `tests/integration/panicFlow.test.ts` — V6 with two positions and one open order against a fake broker; all positions reach `PANIC_CLOSED` and `cancelled`/`filled` orders are recorded.

### Implementation for User Story 6

- [X] T076 [P] [US6] Implement `src/backend/orders/panicCloseBuilder.ts` — produces market-class `mleg` orders for every open position; reverses every leg direction.
- [X] T077 [US6] Implement `src/backend/services/panicService.ts` exporting `panicAll()`: cancel every open order (via `alpacaService.cancelOrder`), then submit a market close for each open position (or roll-partial-close if mleg cannot be assembled), persist `PositionEvent(PANIC_CLOSED)`, emit Telegram summary.
- [X] T078 [US6] Implement `src/backend/api/routes/panic.ts` — `POST /api/panic` accepting `{ reason }`; validated body; requires the `PANIC_REQUIRES_CONFIRMATION` env gate to be honored.
- [X] T079 [US6] Implement `src/frontend/components/PanicButton.tsx` with a confirm dialog and a one-click submit; mount at the top-right of the dashboard with a distinctive red Tailwind style.

**Checkpoint**: V6 passes; SC-004 (panic flatten within one minute) holds.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Things that affect the whole system — CI, README, the
dry-run identicality check, audit export.

- [X] T080 Add `.github/workflows/ci.yml` running `npm run typecheck`, `npm run lint`, `npm run test:coverage`, `npx prisma migrate diff --exit-code`; reject on coverage drop below 90% for risk/orders/money.
- [X] T081 Author `README.md` at repo root with: what the system does, prerequisites, env setup, `npm`/`vite`/`prisma` quick-start, how to run V1–V10 of `quickstart.md`.
- [X] T082 Integration test `tests/integration/dryRunIdenticality.test.ts` (covers SC-008 + FR-017): run the same monitoring cycle under `DRY_RUN=true` and `DRY_RUN=false`; the resulting `Intent[]` from `riskEngine.evaluate` MUST be byte-identical, and `OrderSubmission` rows MUST exist only in the `DRY_RUN=false` run.
- [X] T083 Export endpoint `GET /api/audit/export?from=YYYY-MM-DD&to=YYYY-MM-DD` returning a JSONL of `PositionEvent` + `OrderSubmission` rows for any historical range (covers FR-016 reconstruction).
- [X] T084 Add `migrationRetention.ts` script in `prisma/` that prunes audit rows older than 12 months only after a CLI confirmation flag, defaulting to no-op (defends FR-016 retention in case future ops tries to vacuum).
- [X] T085 Traceability matrix `docs/traceability.md` mapping each FR-001…FR-017 in `spec.md` to the task that implements it and the test that verifies it (audit aid).
- [X] T086 Pin dependency versions (`package.json` `engines` for Node ≥ 22, `package-lock.json` or `pnpm-lock.yaml` committed) and lock the Prisma engine binary in `package.json` to match `schema.prisma`'s `previewFeatures` flag (none in v1).
- [X] T087 Final pass: run V1–V10 from `quickstart.md` against a fresh checkout on paper mode; every scenario passes; collect screenshots into `docs/screenshots/` and embed into `README.md`.
- [X] T088 Operational runbook `docs/runbook.md` covering: how to recover from a missed heartbeat, how to inspect `PositionEvent`s for post-mortem, how to rotate Telegram/Alpaca credentials, how to enable/disable DRY_RUN, escalation path for a stuck open order.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1, T001–T008)**: no dependencies — start immediately.
- **Foundational (Phase 2, T009–T022)**: depends on Setup (T001–T008).
  **BLOCKS** every user story.
- **User Story phases (3–8)**: each depends on the Foundational phase.
  Within a phase, intra-phase ordering still applies (tests first per
  Constitution Principle IV).
- **Polish (Phase 9, T080–T088)**: depends on every desired user story being complete.

### User Story Dependencies

| Story | Phase | Depends on | Independent? |
|---|---|---|---|
| US1 Configure | 3 | Foundational | Yes — fully testable without US2/US3. |
| US2 Execute Entries | 4 | Foundational (+ US1's persistence row is read but not required to exist) | Yes — can open a position even before US1 UI is done. |
| US3 Risk Maneuvers | 5 | Foundational + US2's `Position` table exists to act on | Test-first on pure functions is independent; integration test (T055) leans on US2 shape. |
| US4 Dashboard Metrics | 6 | Foundational + US2/US3 produced `Position` + `PositionEvent` rows | Testable with seeded data; reconciliation test (T056) needs rows. |
| US5 Telegram Coverage | 7 | Foundational + a few producing event sites exist | Pure helper tests are independent. |
| US6 Panic | 8 | Foundational + open `Position` rows exist | Pure `panicService` test (T074) is independent. |

### Within Each User Story

- **Test tasks FIRST** (must fail before implementation merges), per Constitution Principle IV — enforced for US3 explicitly.
- Models before services before endpoints.
- Pure logic (Risk Engine, order builders, Money helper) before I/O wrappers.
- Story complete before moving to next priority.

### Parallel Opportunities

- **Phase 1**: T003, T004, T005, T006 are all `[P]` (different files, no deps).
- **Phase 2**: T010/T013/T014/T017/T018/T019 all `[P]` once the env loader is in place.
- **Phase 3 (US1)**: T025 + T026 + T027 + T028 + T030 are `[P]` once T022 is green.
- **Phase 4 (US2)**: T031/T032/T033/T034 + T036 + T037 are `[P]`.
- **Phase 5 (US3)**: T041–T045 are `[P]`; T046/T047/T048 are independent and `[P]`; T050/T051 are `[P]`; T052 depends on them all.
- **Phase 6 (US4)**: T056/T057/T058 + T059/T060/T061 + T062 are `[P]`.
- **Phase 7 (US5)**: T067/T068 + T069 are `[P]`.

---

## Implementation Strategy

### MVP first (US1 + US2 + US3 = P1 priorities)

1. Phase 1 — Setup.
2. Phase 2 — Foundational.
3. Phase 3 — US1 (ticker configuration).
4. Phase 4 — US2 (entry execution).
5. Phase 5 — US3 (risk maneuvers).
6. **STOP and VALIDATE**: V1, V2, V3, V4, V5 against paper end-to-end.
7. Demo / deploy MVP.

### Incremental delivery

1. Setup + Foundational → foundation ready.
2. Add US1 → V1 passes → demo (a trader can configure).
3. Add US2 → V2 passes → demo (a position is opened in paper).
4. Add US3 → V3–V5 pass → demo (the bot defends itself).
5. Add US4 → V8 passes → demo (the operator sees what's happening).
6. Add US5 → V7 passes → demo (the operator is alerted).
7. Add US6 → V6 passes → demo (the kill switch works).
8. Polish (Phase 9) → V10 + README runbook.

### Parallel team strategy

With multiple engineers:
- Eng A: Phase 1 (T001–T008).
- Then A: Phase 2 risk/money slice (T009–T012, T015, T022) — locks the foundation for Risk.
- B: Phase 2 broker/telegram slice (T017, T018).
- C: Phase 2 app shell slice (T019–T021).
- After Phase 2: A on US3 (Risk Engine first, per Constitution), B on US2 (broker + entry), C on US1 (UI + REST).
- Then everyone converges on US4 / US5 / US6 / Polish.

---

## Notes

- Tasks marked `[P]` are different files; safe to parallelize.
- Story labels `[USx]` map 1-to-1 to spec.md § User Scenarios.
- Every user-story phase is independently testable against the matching
  scenario in `quickstart.md`.
- Tests MUST be written first and MUST fail before the implementation
  PR is opened for any task tagged with the ⚠ test-first rule (T011,
  T012, T023, T024, T031–T035, T041–T045, T056–T058, T067, T068, T074,
  T082).
- Coverage gates (≥90% line for `src/backend/risk/**`,
  `src/backend/orders/**`, `src/types/money.ts`) are enforced in
  `.github/workflows/ci.yml` (T080).
- The Panic path is the **only** legitimate bypass of the Risk Engine
  (Constitution Principle VI).