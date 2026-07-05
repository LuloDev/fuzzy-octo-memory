<!--
Sync Impact Report
==================
Version change: N/A (initial adoption) → 1.0.0
Modified principles: N/A (initial set)
Added sections: Core Principles (I-VI), Technical Constraints, Risk & Safety Guardrails, Development Workflow, Governance
Removed sections: None
Templates requiring updates:
  ✅ .specify/templates/plan-template.md (Constitution Check now references Risk & Safety Gates)
  ✅ .specify/templates/spec-template.md (User Scenarios must include a kill-switch and panic-flow path)
  ✅ .specify/templates/tasks-template.md (adds Phase for Risk Engine + Order Execution + Tests)
  ⚠ .specify/templates/commands/*.md (no generic agent-specific references to clean up at this time)
Follow-up TODOs:
  - TODO(RATIFICATION_DATE): original adoption date unknown; set to today (2026-07-05).
  - TODO(REAL_ACCOUNT_TOGGLE): Alpaca paper/live toggle decision deferred to environment configuration.
-->

# Options Trading Bot Constitution

A weekly Iron Condor automation system built on TypeScript. This document codifies
the non‑negotiable rules that govern design, implementation and operation of the bot.

## Core Principles

### I. Strict TypeScript & Financial Correctness (NON-NEGOTIABLE)

All source code MUST be written in TypeScript with `"strict": true`. Money math
(credits, debits, PnL, margin, deltas, Greeks) MUST use a dedicated decimal-safe
arithmetic module — never native `number` for monetary values crossing boundaries
(DB, broker, UI). Every monetary field in the database MUST be stored as string
or decimal type and re-parsed through the arithmetic helper on read.

Rationale: silent floating-point drift in option pricing is unacceptable. The
system trades real capital and any rounding error compounds across legs.

### II. Service Isolation & Single Responsibility

The backend MUST be composed of independent, narrowly-scoped services:

- `MonitoringService` — polls market data and position state every 5 minutes.
- `AlpacaService` — sole gateway to the Alpaca Options API (orders, quotes,
  positions, account).
- `RiskEngine` — pure decision logic (take profit, stop loss, untested-side
  roll). MUST NOT call Alpaca directly; emits intents.
- `ExecutionService` — receives intents from RiskEngine and translates them
  into multileg orders via `AlpacaService`.
- `TelegramNotifier` — outbound alert transport only.
- `PersistenceService` — Prisma-backed read/write of configurations, logs and
  positions.

Services MUST communicate via typed DTOs (`src/types/`). No service may import
another service's internal modules. Cross-service state lives in the database or
in a shared, immutable event payload.

Rationale: a bug in risk logic must never be able to silently place an order;
isolation makes unit testing and audit reproducible.

### III. Risk Engine First (NON-NEGOTIABLE)

The `riskEngine.ts` module is the highest-priority artifact in the codebase. It
MUST be implemented and unit-tested before any UI work, before any multileg
order formatting, and before any Telegram notification. The three mandatory
maneuvers — **Take Profit**, **Stop Loss**, and **Untested-Side Roll** — are
declarative, side-effect-free functions of the form:

```
evaluate(position, marketSnapshot, config) -> Intent[]
```

`Intent` is an algebraic type: `CloseAll | RollUntestedSide | Hold | Reject`.
The engine MUST never throw on benign input; invalid states return `Reject`
with a structured reason. Alerts are emitted by the caller after the engine
returns, never from inside the engine.

Rationale: financial rules are the most tested, most-audited and most-reverted
code in the system. They must be deterministic and reproducible.

### IV. Test-First for Money Logic (NON-NEGOTIABLE)

For every function in `RiskEngine`, `AlpacaService` multileg construction and
the decimal arithmetic module, the test MUST be written first, MUST fail, and
THEN the implementation may be added. Coverage thresholds for `src/backend/risk`,
`src/backend/orders` and `src/types/money` MUST remain ≥ 90% line coverage.

Property-based tests are encouraged for: PnL reconciliation across the four
legs, take-profit math at boundary percentages, and break-even recomputation
after a roll.

### V. Persistence & Audit Trail (NON-NEGOTIABLE)

Every state transition on an Iron Condor position — open, take-profit exit,
stop-loss exit, roll, panic-close — MUST be persisted as an immutable
`PositionEvent` row. Every Alpaca order submission MUST record: request
payload, response payload, timestamp, intent id, and triggering market snapshot.
Logs MUST be retained for a minimum of 12 months and be exportable.

UI inputs that mutate ticker configuration (`symbol`, `allocationPercentage`,
`targetDelta`, `widthOfSpread`, `takeProfitPercentage`, `stopLossMultiplier`,
`isEnabled`) MUST be versioned with an `updatedAt` and `updatedBy` field and
the previous value retained as a `TickerConfigRevision`.

Rationale: post-mortem of any trade requires reconstructing the exact state at
the moment of execution. Silent overwrites are forbidden.

### VI. Observability, Panic & Dead-Man's Switch

The system MUST emit a structured log line (`level`, `service`, `intent`,
`ticker`, `positionId`, `pnl`, `timestamp`) for every evaluation and every
order. A heartbeat MUST be emitted to Telegram at least once per market session
day; absence of a heartbeat for more than 30 minutes during market hours MUST
trigger a Telegram alert of category `WARN`.

A `PanicButton` endpoint MUST exist that, when invoked, immediately cancels all
open orders and submits market-close for every open Iron Condor position on
every enabled ticker. The panic path MUST bypass the RiskEngine — it is the
only legitimate bypass.

## Technical Constraints

- **Language**: TypeScript (strict mode) end-to-end, no untyped `.js` files in
  source tree.
- **Backend runtime**: Node.js LTS, Express or Fastify. Process model:
  long-running single process for `MonitoringService` + `RiskEngine` loop;
  HTTP server for UI/REST. Restart policy: managed by `systemd` or
  equivalent process supervisor.
- **Database**: SQLite for single-user deployments, PostgreSQL for
  multi-instance. ORM: **Prisma** exclusively. Schema lives in
  `prisma/schema.prisma`. Migrations are mandatory; ad-hoc DDL is forbidden.
- **Broker integration**: Alpaca Options API v2, multileg via the
  `/v2/orders` endpoint with `order_class=mleg`. Both paper and live endpoints
  are supported via environment configuration (`APACA_BASE_URL`).
- **Frontend**: React or Next.js with Tailwind CSS. Charts: Recharts (preferred)
  or Chart.js. The UI MUST NOT place orders directly — all mutations go through
  the backend REST API, which routes through `ExecutionService`.
- **Folder layout** (enforced by `tsconfig` paths):
  ```
  src/
    backend/
      services/   # monitoring, alpaca, execution, telegram, persistence
      risk/       # riskEngine.ts + maneuver evaluators
      orders/     # multileg builders
      api/        # express/fastify routes
    frontend/
      components/
      pages/
      hooks/
    types/        # shared DTOs, decimal helpers, domain types
    shared/       # constants, env validation
  prisma/
    schema.prisma
    migrations/
  tests/
    unit/
    integration/
    contract/
  ```
- **Notifications**: Telegram Bot HTTP API only (no polling, no third-party
  wrappers). Markdown formatting (`parse_mode=MarkdownV2`) is mandatory.
- **Environment configuration**: validated at boot by a schema-checked
  loader (e.g., `zod`). Missing or malformed env MUST crash the process
  loudly — silent defaults are forbidden for `APCA_API_KEY_ID`,
  `APCA_API_SECRET_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
  `APCA_BASE_URL`, `DATABASE_URL`.

## Risk & Safety Guardrails

These guardrails are absolute. Any PR that weakens them MUST be rejected.

1. **No order without intent trace**. Every order sent to Alpaca MUST carry an
   `intentId` that links to the originating `RiskEngine` evaluation.
2. **No silent retries**. Order submission failures MUST be surfaced to the
   operator via Telegram within 30 seconds. Retries MUST be explicit and
   bounded.
3. **Daily loss circuit breaker**. If realized PnL for the trading day drops
   below a configurable threshold (`dailyLossLimit`, default -3% of allocated
   capital), the system MUST halt new entries until the next session and
   notify via Telegram.
4. **Margin pre-flight**. Before sending any opening order the system MUST
   query buying power and reject if free margin < 1.5× the worst-case loss of
   the proposed combo.
5. **Configuration dry-run mode**. A `DRY_RUN=true` environment flag MUST
   cause the system to evaluate and log all decisions without sending any
   order to Alpaca. This is the default for any non-production deployment.
6. **Multileg atomicity**. The Iron Condor MUST be submitted as a single
   `mleg` order class so that partial fills cannot leave a naked leg.

## Development Workflow

- **Branching**: trunk-based on `main`, short-lived feature branches named
  `###-feature-name` (spec-kit convention). No long-lived branches.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`,
  `docs:`, `chore:`). Each commit MUST be buildable and MUST keep all tests
  green.
- **Code review**: every PR requires at least one reviewer. Changes inside
  `src/backend/risk/**` or `src/backend/orders/**` require two reviewers and
  the Risk-Engine-First reviewer must explicitly approve.
- **Quality gates** (CI must pass before merge):
  1. `tsc --noEmit` clean.
  2. `eslint` clean.
  3. Unit and integration tests green; coverage thresholds met.
  4. `prisma migrate diff` shows no drift from committed migrations.
  5. `DRY_RUN=true` smoke test against Alpaca paper completes a full weekly
     cycle without errors.
- **Testing discipline**: Red → Green → Refactor. No implementation PR may be
  merged without a prior failing test on the same logical change.
- **Specification-first**: every feature MUST have a `spec.md` and `plan.md`
  generated via the spec-kit workflow before code is written. Exceptions
  require an ADR.

## Governance

This constitution supersedes all other engineering practices in the
repository. Where a `plan.md`, `spec.md` or `tasks.md` conflicts with the
constitution, the constitution wins and the artifact MUST be amended.

**Amendment procedure**:
1. Open a PR titled `docs: amend constitution to vX.Y.Z`.
2. PR body MUST include: rationale, version bump type, list of affected
   principles, migration plan for in-flight work.
3. Require two reviewers, one of whom must not have authored the change.
4. Merge to `main` triggers propagation to dependent artifacts (`plan.md`,
   `spec.md`, `tasks.md`).

**Versioning policy** (semantic):
- **MAJOR** — principle removed or redefined in a backward-incompatible way.
- **MINOR** — new principle, new section, materially expanded guidance.
- **PATCH** — typo, wording clarification, no semantic change.

**Compliance review**: every quarter the maintainers MUST run a constitution
audit. Findings are tracked as GitHub issues labelled `constitution-audit`.

**Runtime development guidance**: see `README.md` and any `docs/quickstart.md`
that may exist at the repo root.

**Version**: 1.0.0 | **Ratified**: 2026-07-05 | **Last Amended**: 2026-07-05