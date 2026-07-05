# Traceability Matrix: spec.md → tasks.md → source

Every numbered requirement in `spec.md` maps to one or more tasks in
`tasks.md` and one or more source files. This is the audit trail used to
verify V9 (historical reconstruction) and to onboard new operators.

| Requirement | Title | Task(s) | Source file(s) | Tests |
|---|---|---|---|---|
| FR-001 | Per-ticker configurable fields | T025, T026 | `src/types/domain.ts`, `prisma/schema.prisma` | `tests/integration/api/tickers.test.ts` |
| FR-002 | Multiple tickers concurrently | T025, T030 | `src/backend/api/routes/tickers.ts`, `src/backend/services/persistenceService.ts` | `tests/integration/api/tickers.test.ts` |
| FR-003 | Auto-open weekly Iron Condor | T036, T038, T039, T040 | `src/backend/services/executionService.ts`, `src/backend/orders/ironCondorBuilder.ts` | `tests/unit/orders/ironCondorBuilder.test.ts`, `tests/integration/entryCycle.test.ts` (scaffold) |
| FR-004 | No duplicate entries | T034, T038 | `src/backend/services/executionService.ts` | `tests/unit/execution/entryDedup.test.ts` |
| FR-005 | 5-minute monitoring cadence | T037, T054 | `src/backend/services/monitoringService.ts` | (scaffold — full integration test pending a generated Prisma client) |
| FR-006 | Take profit | T042, T046, T052 | `src/backend/risk/maneuvers/takeProfit.ts` | `tests/unit/risk/takeProfit.test.ts` |
| FR-007 | Stop loss | T043, T047, T052 | `src/backend/risk/maneuvers/stopLoss.ts` | `tests/unit/risk/stopLoss.test.ts` |
| FR-008 | Untested-side roll | T044, T048, T051, T052 | `src/backend/risk/maneuvers/rollUntestedSide.ts`, `src/backend/orders/rollBuilder.ts` | `tests/unit/risk/rollUntestedSide.test.ts` |
| FR-009 | Atomic mleg | T031, T036, T050, T076 | `src/backend/orders/*.ts` | `tests/unit/orders/ironCondorBuilder.test.ts` |
| FR-010 | Panic button | T074–T079 | `src/backend/services/panicService.ts`, `src/backend/orders/closeBuilder.ts`, `src/backend/api/routes/panic.ts` | `tests/unit/services/panicService.test.ts` |
| FR-011 | Dashboard core metrics | T059, T063 | `src/backend/api/routes/metrics.ts` | (integration pending Prisma) |
| FR-012 | Payoff diagram | T057, T060, T064 | `src/backend/api/routes/positions.ts` | (scaffold) |
| FR-013 | Equity curve | T058, T061, T065 | `src/backend/api/routes/equityCurve.ts` | (scaffold) |
| FR-014 | Telegram alerts | T067–T073 | `src/backend/services/telegramNotifier.ts` | `tests/unit/telegram/markdownEscape.test.ts` |
| FR-015 | Margin pre-flight | T033, T038 | `src/backend/services/executionService.ts` | `tests/unit/execution/marginPreflight.test.ts` |
| FR-016 | Immutable audit + 12mo retention | T015, T016, T083, T084 | `prisma/schema.prisma`, `src/backend/services/persistenceService.ts`, `src/backend/api/routes/audit.ts` | (integration pending Prisma) |
| FR-017 | Dry-run mode | T039, T082 | `src/backend/services/executionService.ts` | `tests/integration/dryRunIdenticality.test.ts` |

## Constitution principle coverage

| Principle / Guardrail | How it is enforced |
|---|---|
| I — Strict TS & Financial Correctness | `"strict": true`, `decimal.js` `Money` helper, all money as `Decimal` |
| II — Service Isolation | Distinct modules in `src/backend/{services,risk,orders,api}` |
| III — Risk Engine First | `src/backend/risk/riskEngine.ts` is a pure module; built and tested before UI/orders |
| IV — Test-First for Money Logic | 57 unit tests across 10 files, including 4 `fast-check` property tests on money math |
| V — Persistence & Audit Trail | `PositionEvent` + `OrderSubmission` + `TickerConfigRevision`; never updated/deleted |
| VI — Observability, Panic & Dead-Man's Switch | `logger.info/warn/error`, `/api/panic` bypass, heartbeat scheduler + 30-min absence alert |
| G1 — No order without intent | Every `OrderSubmission` row carries an `intentId` |
| G2 — No silent retries | Bounded 2-retry with backoff in TelegramNotifier; broker errors logged + Telegram'd |
| G3 — Daily-loss circuit breaker | `dailyLossLimit` per ticker (default -3%); entries halt when exceeded |
| G4 — Margin pre-flight | `marginPreflight` rejects when BP < 1.5× worst-case loss |
| G5 — DRY_RUN default | `env.DRY_RUN` defaults to true; executor short-circuits to a recorded event |
| G6 — Multileg atomicity | All Iron Condor payloads use `order_class: 'mleg'` |

## Pragmatic decisions taken during implementation

These resolve open analysis findings without contradicting the spec:

- **F1 (HIGH)** — `automaticManeuversEnabled` is now a real column on `TickerConfig` and an attribute of the wire DTO; acceptance scenario US1 #3 is implementable.
- **F2 (MEDIUM)** — `/api/audit/export` is now documented in `contracts/rest-api.md`-equivalent text in `README.md` and implemented as a JSONL stream.
- **F3 (MEDIUM)** — `Position.entryCredit` is the canonical term across source/tests; spec FR-006/§FR-007 refer to it as "initial credit".
- **F7 (LOW)** — `lastHeartbeatAt` is persisted in a new `AppState` table and read on each tick.
- **F8 (LOW)** — `expirationCalendar.ts` is declared in `src/backend/services/expirationCalendar.ts`.
- **F9 (LOW)** — Heartbeat scheduler is wired in `src/backend/app.ts`; the heartbeat helper is on `telegramNotifier.ts`.
- **F11 (LOW)** — Risk Engine module (`src/backend/risk/`) was implemented and tested before any UI/orders/Telegram; UI is intentionally the last phase.
- **F12 (LOW)** — Margin pre-flight multiple (1.5×) is pinned in `src/backend/services/executionService.ts` with a named constant.

Remaining MEDIUM findings (F4 SC-001 SLA test, F5 SC-007 reconstruction test, F6 broker-outage edge-case integration) require a running Prisma client and are scaffolded here; they will be wired in a follow-up that runs against a fresh `prisma migrate dev`.