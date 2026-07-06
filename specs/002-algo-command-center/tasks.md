# Tasks: Algorithmic Command Center

**Feature**: `002-algo-command-center`
**Branch**: `002-algo-command-center`
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)
**Generated**: 2026-07-05

This task list extends the existing bot (Phase 0/1/2 from `001-iron-condor-bot` is already shipped). Tasks are organized by user story in priority order (P1 → P2 → P3) so each phase is independently shippable and testable.

---

## Phase 1: Setup (project linkage)

These tasks verify the existing infrastructure is reachable from this feature branch. No new projects are created — the feature lives inside the same monorepo as `001-iron-condor-bot`.

- [X] T001 Verify that `specs/001-iron-condor-bot/spec.md` US4 (Dashboard) is implemented and `src/frontend/` builds: `cd src/frontend && npm run build`.
- [X] T002 Verify that the persistence layer exposes `initPersistence()` and `db()` (no other code path allowed to construct PrismaClient): `grep -n 'PrismaClient' src/backend/services/persistenceService.ts`.
- [X] T003 [P] Verify that the existing `/api/health` endpoint returns `dryRun` and `uptimeSeconds` so the new header widget can reuse it: `curl -fsS http://127.0.0.1:3000/api/health | jq`.
- [X] T004 [P] Verify that the existing `/api/audit/export` returns JSONL over `PositionEvent` + `OrderSubmission` (this is what the new `/api/events` will wrap with paging + projection): see `src/backend/api/routes/audit.ts`.
- [X] T005 [P] Verify `src/shared/contracts.ts` already exports `zod` schemas for `TickerConfigDto`, `PositionDto`, `MetricsDto` (we will mirror these on the frontend).

---

## Phase 2: Foundational (blocking prerequisites for every user story)

These tasks add the **shared scaffolding** that every user story depends on: the new AppState keys, the kill-state store, the audit-feed endpoint contract, and the monitoring-loop hook. They are CRITICAL — no user-story phase can begin until Phase 2 is complete.

- [X] T006 [P] Extend `prisma/schema.prisma` with two Prisma indexes for fast chronological queries:
  - `PositionEvent.@@index([createdAt(sort: Desc)])` and `@@index([createdAt(sort: Desc), positionId])`
  - `OrderSubmission.@@index([submittedAt(sort: Desc)])`, `@@index([submittedAt(sort: Desc), positionId])`, `@@index([intentId, submittedAt])`
- [X] T007 [P] Extend `src/shared/contracts.ts` with `AppStateKey` enum and `KillStateDto`, `AuditEventDto`, `HealthSnapshotDto`, `PerformanceAggregateDto`, `SlippageRowDto` zod schemas (read by the new endpoints).
- [X] T008 [P] Extend `src/shared/contracts.ts` with `EventVerb` enum (`MONITORING | ALERT | ACTION | REJECTED | PAUSED | PAUSE_LIFTED | KILL_STATE_CHANGED`) so the audit feed can render colored badges.
- [X] T009 Create `src/backend/services/killStateService.ts` with a singleton getter/setter for two state rows: `AppState(key='kill_state_new_entries'|'kill_state_maneuvers', value=JSON({paused, since, reason, changedBy}))`. Public surface: `getKillState(feature): Promise<KillState>`, `setKillState(feature, action, reason): Promise<KillState>`.
- [X] T010 Add unit tests for `killStateService.ts`: defaults, persistence, race-free transitions. Use `vitest` + an in-memory SQLite via `prisma db push --accept-data-loss`. Place at `tests/unit/services/killStateService.test.ts`.
- [X] T011 Extend `MonitoringService.tick()` (in `src/backend/services/monitoringService.ts`) to read both kill states at the start of every cycle and short-circuit (a) the entry sweep when `new_entries` is paused and (b) the maneuver dispatch loop when `maneuvers` is paused. Each short-circuit MUST record a `PositionEvent(kind=OPEN_REJECTED | KILL_STATE_CHANGED)` so the audit feed and Telegram see it.
- [X] T012 Extend `AlpacaService` (in `src/backend/services/alpacaService.ts`) so every broker call records `{ts, status, latencyMs, retryAfter?}` into `AppState(key='last_broker_call')` and every quote fetch records into `AppState(key='last_quote_fetch')`. No change to polling cadence (NFR-001).
- [X] T013 Extend `TelegramNotifier` (in `src/backend/services/telegramNotifier.ts`) to record every delivery attempt into `AppState(key='last_telegram_delivery')`.
- [X] T014 Add a `cacheControl` Fastify hook (or per-route option) so every non-`/api/kill/*` GET response sets `Cache-Control: public, max-age=10, stale-while-revalidate=10`. `/api/kill/*` MUST set `max-age=0`. See `src/backend/api/server.ts`.
- [X] T015 Wire `initPersistence()` at the very start of `src/backend/app.ts:main()` (before `monitoring.start()`). Already required by the Prisma client init — verify it stays idempotent.
- [X] T016 Update the docker-compose `environment:` block to keep `HOST=0.0.0.0` (so the SPA continues to reach the API from the dashboard at port 3000) — no change, this is a regression guard.

---

## Phase 3: User Story 1 — Risk Radar (P1)

Story goal: render per-position thermometers that classify SAFE / WARNING / BREACH.
Independent test: with one open IC, render at `http://127.0.0.1:3000/positions` and verify the put-side segment goes amber at ≤1.5% distance and red at >100% distance.

- [X] T017 [P] [US1] Add a pure helper `src/backend/services/proximityClassifier.ts` exporting `classifyProximity(underlyingPrice, shortPut, shortCall): { putSide: 'SAFE'|'WARNING'|'BREACH', callSide: ..., putDistancePct, callDistancePct, putDistanceUsd, callDistanceUsd }`. Thresholds: SAFE > 5%, WARNING ≤ 1.5%, BREACH ≤ 0%. MUST use `Money` (decimal.js) for the percentage comparison.
- [X] T018 [P] [US1] Unit tests for `proximityClassifier.ts`: boundary cases (5.00%, 1.50%, 0.00%, negative, NaN guard). Place at `tests/unit/services/proximityClassifier.test.ts`.
- [X] T019 [P] [US1] Extend `GET /api/positions` (in `src/backend/api/routes/positions.ts`) to include `currentUnderlyingPrice` and the four `proximity*` fields from `classifyProximity()` so the dashboard does not need to compute them client-side (Constitution Principle II).
- [X] T020 [US1] Create `src/frontend/src/components/ProximityRadar.tsx` — a per-position row with two horizontal segmented bars (put + call), color-coded, with labels for short strikes, % distance and USD distance. Empty state when no positions.
- [X] T021 [US1] Add `ProximityRadar` to the `PositionsPage` (above the existing `PositionList`) so the dashboard at `/positions` shows the radar first.
- [X] T022 [P] [US1] Add `lib/contracts.ts` (frontend) types: `ProximityState = 'SAFE'|'WARNING'|'BREACH'` and `PositionWithProximityDto` extending `PositionDto` with the four proximity fields. Wire zod parsing in `listPositions()`.
- [X] T023 [US1] Manual validation: seed one open IC, verify `GET /api/positions` returns the proximity fields, then open `http://127.0.0.1:3000/positions` and confirm the thermometer colors map to the underlying price.

---

## Phase 4: User Story 4 — Audit Trail feed (P1)

Story goal: render every `PositionEvent` and `OrderSubmission` in a chronological UI feed with expandable payloads.
Independent test: with 5 events seeded, the feed renders 5 rows; expanding any row shows the JSON payload with truncation flag for blobs >8KB.

- [X] T024 [P] [US4] Create `src/backend/api/routes/auditFeed.ts` exporting `GET /api/events` (zod-validated querystring: `limit` 1..500 default 200, optional `cursor` base64url, optional `intentId`, optional `positionId`). Response: `{ items: AuditEventDto[], nextCursor: string|null, truncatedCount: number }`. Internals: two parallel `findMany` calls (one per table), merge by timestamp DESC, slice to limit, truncate JSON columns > 8 KB to `{_truncated, bytes, preview}`.
- [X] T025 [P] [US4] Helper `src/backend/util/jsonTruncate.ts` exporting `truncateIfLarge<T>(value: T, maxBytes = 8_192): T | {_truncated: true, bytes: number, preview: T}`. Pure, no I/O.
- [X] T026 [P] [US4] Wire the new route in `src/backend/api/server.ts` next to the existing `auditRoutes` (under `prefix: '/api'`).
- [X] T027 [P] [US4] Unit tests for `truncateIfLarge()`: under-limit passthrough, exact-limit passthrough, over-limit returns the wrapper with correct `bytes` count, `_truncated: true`, and a usable `preview`. Place at `tests/unit/util/jsonTruncate.test.ts`.
- [X] T028 [P] [US4] Integration test: seed 3 events + 2 orders, call `/api/events?limit=10`, verify chronological order and the merged shape. Place at `tests/integration/api/auditFeed.test.ts`.
- [X] T029 [US4] Add `EventVerb` color mapping in `lib/contracts.ts` (frontend) and a small helper `verbColor(verb: EventVerb): string`.
- [X] T030 [US4] Create `src/frontend/src/components/AuditFeed.tsx`: reverse-chronological list, each row shows `timestamp UTC`, `verb`, `summary`, `intentId` (with copy-on-hover). On expand: full payload JSON rendered with `JSON.stringify(parsed, null, 2)` and a `[truncated — first 2KB shown]` banner when the row has `_truncated: true`.
- [X] T031 [US4] Add a new page `/audit` rendered by `src/frontend/src/pages/AuditPage.tsx` that mounts `AuditFeed`. Add a nav link in `Header.tsx`.
- [X] T032 [US4] Manual validation: with a freshly seeded event log, open `/audit`, expand a row, copy an `intentId` from a row, paste it into `/api/events?intentId=<id>` and verify only matching rows return.

---

## Phase 5: User Story 6 — Graduated Kill Switches (P1)

Story goal: pause/resume entries and maneuvers independently of the hard panic.
Independent test: click "Pause new entries" → wait 5s → next monitoring cycle records `PositionEvent(kind=OPEN_REJECTED, reason=PAUSED_FOR_NEW_ENTRIES)`; click "Resume entries" → next cycle proceeds normally.

- [X] T033 [P] [US6] Create `src/backend/api/routes/kill.ts` exposing two endpoints:
  - `POST /api/kill/new-entries` body `{action: 'pause'|'resume', reason: string}`
  - `POST /api/kill/maneuvers` body `{action: 'pause'|'resume', reason: string}`
  - Both delegate to `killStateService` and emit a `PositionEvent(kind=KILL_STATE_CHANGED)`.
- [X] T034 [P] [US6] Add `GET /api/kill/state` returning the merged state of both features so the dashboard can render a single badge. Cache-Control MUST be `max-age=0`.
- [X] T035 [US6] Wire `killRoutes` in `src/backend/api/server.ts`.
- [X] T036 [US6] Unit tests for the pause flow: pause sets `paused=true, since=now, reason=...`; resume sets `paused=false, since=now, reason='resumed'`. Place at `tests/unit/api/killRoute.test.ts`.
- [X] T037 [US6] Extend `Header.tsx` (frontend) to fetch `GET /api/kill/state` at 5s cadence (`refetchInterval: 5_000, staleTime: 0`). Render the badge: green `LIVE`, amber `PAUSED:ENTRIES` / `PAUSED:MANEUVERS` / `PAUSED:ALL`, red `PANICKED` (set when `/api/kill/state` reports the hard panic in the last 60s).
- [X] T038 [US6] Create `src/frontend/src/components/KillSwitchPanel.tsx` with two buttons (Pause/Resume for each feature). On click → `POST /api/kill/{feature}` → on success, `queryClient.invalidateQueries({queryKey: ['killState']})` and toast "Pause activated". Place it in the Layout's right rail (or the header dropdown) so it's always visible.
- [X] T039 [US6] Manual validation: click Pause, verify within 5s the header badge changes amber; restart the container (`docker compose restart bot`) and verify the state persists (FR-018).

---

## Phase 6: User Story 2 — Expected-Move overlay (P2)

Story goal: render ±EM reference lines on the payoff chart.
Independent test: with one open position whose underlying's ATM straddle mid is reachable, render the payoff chart and confirm two reference lines at `underlying ± 0.85 × straddleMid`.

- [X] T040 [P] [US2] Create `src/backend/services/expectedMove.ts` exporting `computeExpectedMove(underlyingPrice: Money, atmStraddleMid: Money, factor = 0.85): Money`. Pure, no I/O. The default `factor = 0.85` documents the A3 assumption in the spec.
- [X] T041 [P] [US2] Unit tests: `computeExpectedMove(100, 8.50, 0.85) = 7.225`; degenerate case when `atmStraddleMid === 0` returns `Money.zero()`; negative inputs throw. Place at `tests/unit/services/expectedMove.test.ts`.
- [X] T042 [US2] Extend `GET /api/positions/:id/payoff` (in `src/backend/api/routes/positions.ts`) with an optional `expectedMove: { underlyingPrice, atmStraddleMid, factor, halfMoveUsd, halfMovePct } | null` field. `null` when the underlying option chain returns 404 or `straddleMid === 0`.
- [X] T043 [US2] Extend `PayoffChart.tsx` (frontend) to render two `ReferenceLine`s at `underlyingPrice ± halfMoveUsd` and a footer label "Strikes fuera/dentro del Movimiento Esperado". Empty-state footnote when the field is null.
- [X] T044 [US2] Manual validation: open `/positions`, click a row, confirm the chart shows the two EM lines; with the broker URL set to an unreachable host, confirm the chart renders without lines + the footnote.

---

## Phase 7: User Story 5 — Automation Health widget (P2)

Story goal: surface Alpaca/quote/Telegram freshness and rate-limit headroom.
Independent test: with the broker URL reachable, the widget is green; after one 5xx from Alpaca, the widget flips amber.

- [X] T045 [P] [US5] Create `src/backend/services/healthSnapshot.ts` aggregating the three `AppState` keys (`last_broker_call`, `last_quote_fetch`, `last_telegram_delivery`) plus the rolling-60-min 429 count. Returns `HealthSnapshotDto`. Pure: takes the three values as arguments, returns the snapshot.
- [X] T046 [P] [US5] Extend `GET /api/health` (in `src/backend/api/routes/health.ts`) to include the `HealthSnapshotDto` in the response. Do NOT break the existing fields (`status`, `uptimeSeconds`, `dryRun`).
- [X] T047 [US5] Add a rolling counter in `AlpacaService`: every 429 response increments `AppState(key='alpaca_429_count')` with a TTL window. The simplest implementation is a JSON value like `[{ts: ISO}]`; trim entries older than 60 minutes on every increment.
- [X] T048 [US5] Create `src/frontend/src/components/HealthWidget.tsx` that fetches `GET /api/health` at 15s cadence (`refetchInterval: 15_000`). Render three pills: `BROKER`, `QUOTE`, `TELEGRAM`. Thresholds (per FR-011): broker < 5 min green / < 30 min amber / > 30 min red; quote < 10 min / < 60 min / > 60 min; telegram < 60 min / < 180 min / > 180 min (only during market hours for the latter two).
- [X] T049 [US5] Render the `HealthWidget` in `Header.tsx` (or a thin subheader) so it is always visible.
- [X] T050 [US5] Manual validation: set `APCA_BASE_URL=https://nonexistent.invalid` and `docker compose restart bot`. Within one monitoring cycle the broker pill must flip amber and the runbook link must render.

---

## Phase 8: User Story 7 — Slippage Tracker (P2)

Story goal: show median/p90 slippage and a 3-bucket histogram per symbol.
Independent test: seed 4 closed positions with known `sent`/`filled` pairs, the panel reports the expected median and p90.

- [X] T051 [P] [US7] Create `src/backend/services/slippage.ts` exporting `computeSlippage(position, orderSubmission): SlippageRowDto` (`slippagePerShare`, `slippagePerCombo`, both Money). Pure.
- [X] T052 [P] [US7] Add `GET /api/metrics/slippage?days=30` returning `{ rows: SlippageRowDto[], summary: { medianPerShare, p90PerShare, medianPerCombo, p90PerCombo, histogram: { '<5c': n, '5-15c': n, '>15c': n } }, closedCount: number }`. Excludes DRY_RUN fills (rows where `responsePayload.filled_avg_price === null`).
- [X] T053 [US7] Unit tests for `computeSlippage`: zero slippage, mid-vs-fill discrepancy, missing filled avg returns `null` row. Place at `tests/unit/services/slippage.test.ts`.
- [X] T054 [US7] Create `src/frontend/src/components/SlippagePanel.tsx`: top stats row (median, p90) + 3-bar histogram. Open from a new `/slippage` route or fold into the audit page's sidebar.
- [X] T055 [US7] Manual validation: with seed data, the panel reads exactly the precomputed median/p90 from a fixture.

---

## Phase 9: User Story 9 — System Performance Statistics (P2)

Story goal: show profit factor, win rate, drawdown, expectancy, max consecutive losses over selectable windows.
Independent test: seed 10 closed positions (7W at +$50, 3L at −$80); the panel reports profit factor 1.458, win rate 70%, max consecutive losses 2, max drawdown −$110.

- [X] T056 [P] [US9] Create `src/backend/services/performance.ts` exporting `computePerformanceAggregate(closedPositions: Position[], windowDays: number): PerformanceAggregateDto`. Pure. Refuses to return numerical values for any aggregate requiring ≥ 5 closed positions when fewer are present — instead returns `null` for that field plus a top-level `insufficientSamples: true`.
- [X] T057 [P] [US9] Unit tests with property-based (`fast-check`) and snapshot fixtures covering: pure winners, pure losers, mixed, drawdown scenarios. Place at `tests/unit/services/performance.test.ts`. Coverage threshold ≥ 90% (Constitution Principle IV).
- [X] T058 [US9] Add `GET /api/metrics/performance?window=7d|30d|90d|all` returning the aggregate. Persist the latest value in `AppState(key='performance_aggregate_<window>')` on every call so reads are O(1) and the value survives restarts.
- [X] T059 [US9] Create `src/frontend/src/components/PerformancePanel.tsx`: window selector (7d / 30d / 90d / all-time), 6 metric cards, sparkline of trailing 4 weeks. Shows the "Insufficient samples" message when `insufficientSamples: true`.
- [X] T060 [US9] Manual validation: seed ≥ 5 closed positions; cycle through the four windows and confirm consistent numbers across reloads (cache survival).

---

## Phase 10: User Story 3 — Gamma curve (P3)

Story goal: show a normalized |net Gamma| curve from DTE=7 down to DTE=0 for an open IC.
Independent test: with a 3-DTE open position, render the chart; confirm the curve is monotonically rising (after the τ-cap) and the "hoy" marker sits at DTE=3.

- [X] T061 [P] [US3] Create `src/backend/services/gammaCurve.ts` exporting `gammaExposureCurve(strikes, underlyingPrice, totalDteDays, iv, riskFreeRate = 0.05): { dteDays: number, exposurePct: number }[]`. Pure. Implements `Γ = φ(d₁) / (S·σ·√τ)` with `MIN_TAU = 0.01` to prevent the DTE=0 blow-up (per the A4 assumption). Net Gamma = `-γ(shortPut) - γ(shortCall) + γ(longPut) + γ(longCall)`.
- [X] T062 [P] [US3] Property-based unit tests with `fast-check`: monotonicity for 1 ≤ DTE ≤ 7; sanity check (positive iv, ATM long-put contribution smaller than ATM short-put contribution). Place at `tests/unit/services/gammaCurve.test.ts`.
- [X] T063 [US3] Extend `GET /api/positions/:id` (or create `GET /api/positions/:id/gamma`) to return `{ dteDays: number, exposurePct: number }[]` plus the ATM IV used.
- [X] T064 [US3] Create `src/frontend/src/components/GammaCurve.tsx` (Recharts `LineChart`) rendered alongside `PayoffChart` when an open position is selected.
- [X] T065 [US3] Manual validation: at DTE=3, the curve has 8 points and the "hoy" marker sits at the 4th point from the left.

---

## Phase 11: User Story 8 — Real-vs-Theoretical Theta decay (P3)

Story goal: overlay theoretical flat-underlying decay against observed mid-price at each evaluation.
Independent test: with 4 days of mid-price observations on the same open IC, the chart shows both series and a divergence band when |realized − theoretical| > 10% × credit.

- [X] T066 [P] [US8] Create `src/backend/services/thetaDecay.ts` exporting `theoreticalMidPriceAtDte(strikes, underlyingPrice, currentMid, currentDte, targetDte, iv): Money`. Pure. The decay is computed by re-evaluating Black-Scholes on each leg at the target DTE and summing.
- [X] T067 [P] [US8] Add a `PositionEvent(kind=MID_OBSERVED, payload={ mid, dte })` writer into `MonitoringService.tick()` (already runs per cycle; just adds one row per open position per tick). Indexed in `PositionEvent` via the T006 index on `(createdAt DESC, positionId)`.
- [X] T068 [US8] Add `GET /api/positions/:id/theta` returning `{ observed: [{ ts, mid, dte }], theoretical: [{ dte, mid }], credit, divergencePct }`. `divergencePct` is `abs(realized − theoretical) / credit`.
- [X] T069 [US8] Create `src/frontend/src/components/ThetaDecayChart.tsx` (Recharts) showing observed (dots) vs theoretical (smooth line) and a shaded band when `|divergencePct| > 0.10`. Footnote text from FR-022.
- [X] T070 [US8] Manual validation: with seeded history snapshots, the chart renders both series and the divergence band correctly.

---

## Phase 12: Polish & Cross-Cutting Concerns

- [X] T071 [P] Implement the three-column layout per FR-026: edit `src/frontend/src/components/Layout.tsx` to a `lg:grid-cols-3` grid; left = TickersPage mount, center = DashboardPage, right = AuditFeed + PerformancePanel + HealthWidget. Collapse to single column under 1024 px.
- [X] T072 [P] Update `src/frontend/src/components/Header.tsx` to include the `HealthWidget` and the `KillState` badge from US5/US6. Refetch the kill state at 5s, the health at 15s (different `queryKey`s).
- [X] T073 [P] Update `src/frontend/src/lib/queryClient.ts` defaults: keep `refetchInterval: 30_000` as a fallback but let each `useQuery` override per the cadence in spec FR-011/NFR-001.
- [X] T074 Add a navigation entry in `docs/runbook.md` for "Inspecting an audit trail" linking to `/audit`, the API endpoint, and the rollback procedure (T016 regression guard).
- [X] T075 Update `docs/traceability.md` FR-mapping table with FR-001..FR-026 and their backing task IDs.
- [X] T076 [P] Add a `healthcheck` endpoint test: with `APCA_BASE_URL` unreachable, `GET /api/health` returns 200 with `lastBrokerCall.status = 'DEGRADED'` within one cycle. Place at `tests/integration/api/healthDegraded.test.ts`.
- [X] T077 [P] Integration test: POST `/api/kill/new-entries {action: 'pause'}` then `/api/events?limit=5` MUST contain an event of kind `KILL_STATE_CHANGED` (or `OPEN_REJECTED` on the next tick). Place at `tests/integration/api/killSwitch.test.ts`.
- [X] T078 [P] Integration test: end-to-end dashboard render — mount the `<DashboardPage>` with a fixture of one open position and one kill state, assert the radar colour is correct and the badge text matches. Place at `tests/integration/frontend/dashboard.test.tsx` (uses `vitest` + `@testing-library/react`).
- [X] T079 Run `npx tsc --noEmit && npx eslint . && npx vitest run tests/unit tests/integration` from the repo root. All gates must be green.
- [X] T080 `docker compose up -d --build` and verify `http://127.0.0.1:3000/audit` and `http://127.0.0.1:3000/positions` render the new components; verify `GET /api/events` returns 200.

---

## Dependencies & Execution Order

```
Phase 1 (Setup) ─┐
                 ├──▶ Phase 2 (Foundational) ──┬──▶ Phase 3  [US1 Risk Radar, P1]
                 │                             ├──▶ Phase 4  [US4 Audit Trail, P1]
                 │                             ├──▶ Phase 5  [US6 Kill Switches, P1]
                 │                             ├──▶ Phase 6  [US2 Expected-Move, P2]
                 │                             ├──▶ Phase 7  [US5 Health, P2]
                 │                             ├──▶ Phase 8  [US7 Slippage, P2]
                 │                             ├──▶ Phase 9  [US9 Performance, P2]
                 │                             ├──▶ Phase 10 [US3 Gamma, P3]
                 │                             └──▶ Phase 11 [US8 Theta, P3]
                 └─── prerequisite for ALL user stories ──────▶ Phase 12 (Polish)
```

- **Phase 2 (T006–T016) is the critical path**: every user story depends on `killStateService`, `auditFeed`, `healthSnapshot`, and the AppState-key wiring. Block here.
- **US1 (Phase 3) can begin as soon as T019 lands** (proximity fields on `/api/positions`).
- **US4 (Phase 4) is independent of US1/US6** but shares T026 wire-up.
- **US6 (Phase 5) depends on T009–T013** (killStateService + telemetry taps in AlpacaService/TelegramNotifier).
- **US5 (Phase 7) depends on T012, T013, T046** (telemetry taps + health endpoint extension).
- **Phase 8/9 (Slippage, Performance) can run in parallel with US5/US2** — they read existing data.
- **Phase 10/11 (Gamma, Theta) are P3 and depend on the same Black-Scholes helper family** (T061 and T066 can share a small `src/backend/services/blackScholes.ts`).

## Parallel Execution Examples

- After T011 lands (MonitoringService wired with kill states), **T017, T024, T033, T040, T051, T056, T061, T066** can all run in parallel — they live in different files and have no cross-dependencies.
- After T014 lands (Cache-Control hook), every read-only endpoint's tests can run in parallel.
- Frontend components T020, T030, T037, T048, T054, T059, T064, T069 can be developed in parallel after their backend counterparts land.

## Implementation Strategy (MVP first, incremental)

The MVP for this feature is **Phase 2 + Phase 3 + Phase 4 + Phase 5** (the three P1 stories plus their shared foundation). Shipping this MVP alone yields:

- A risk radar that classifies open positions SAFE/WARNING/BREACH.
- An audit feed rendering the last 200 events with expandable payloads.
- Two graduated kill switches that persist across restarts.

Everything in Phases 6–11 (Expected-Move overlay, Health widget, Slippage, Performance, Gamma, Theta) is additive and can land in any order without breaking the MVP.

## Format Validation

All 80 tasks follow the required checklist format:
- `- [ ]` checkbox prefix
- Sequential `T001` … `T080` IDs
- `[P]` marker only when parallelizable (different files, no incomplete deps)
- `[US1]` … `[US9]` story labels only on user-story phases (3–11); no label on Phases 1/2/12
- Concrete file paths in every description
- Constitution Principle IV coverage: every risk math change (US3 Gamma, US8 Theta, US9 Performance) has explicit `tests/unit/` placement.