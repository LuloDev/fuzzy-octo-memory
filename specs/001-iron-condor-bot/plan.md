# Implementation Plan: Automated Weekly Iron Condor Trading System

**Branch**: `001-iron-condor-bot` | **Date**: 2026-07-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-iron-condor-bot/spec.md`

## Summary

The feature builds a modular TypeScript application that runs a weekly Iron
Condor strategy automatically on multiple tickers through the Alpaca Options
API. The backend is a single long-running Node.js/Fastify process hosting a
5-minute monitoring loop, a declarative **Risk Engine** (the highest-priority
artifact), an execution service that translates risk intents into atomic
multileg orders, a Prisma-backed persistence layer with an immutable audit
trail, and a Telegram notifier. The frontend is a React + Vite + Tailwind +
Recharts dashboard that visualizes PnL, margin, a live payoff diagram and an
equity curve, and exposes a panic button that bypasses the risk engine to
flatten the book. Full decisions and rationale live in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x with `"strict": true`; Node.js LTS
(≥ 22); ESM modules.

**Primary Dependencies**:
- Backend: `fastify`, `@fastify/cors`, `fastify-type-provider-zod`, `zod`,
  `decimal.js` (money math), `@prisma/client`, `prisma` (CLI/migrations).
- Broker: Alpaca REST via a thin internal `AlpacaClient` (direct `fetch` to
  `/v2/orders` with `order_class=mleg`).
- Notifications: Telegram Bot HTTP API via direct `fetch` (no SDK).
- Scheduling: a single in-process `MonitoringLoop` (5-minute cadence);
  `systemd`/`pm2` as external supervisor.
- Frontend: `react@18`, `vite`, `tailwindcss`, `recharts`, `zod` (shared
  contract types), `@tanstack/react-query` for server state.

**Storage**: SQLite via Prisma by default (single-user deployment);
PostgreSQL supported as a datasource swap for multi-instance. Schema in
`prisma/schema.prisma`; migrations are mandatory.

**Testing**: Vitest (unit + integration), `fastify.inject`/supertest for
HTTP routes, `fast-check` for property-based risk math. Coverage
threshold ≥ 90% line for `src/backend/risk`, `src/backend/orders` and
`src/types/money`.

**Target Platform**: Linux server (single VPS or workstation) running
Node.js LTS, supervised by systemd. Browser dashboard for the operator.

**Project Type**: web-service (long-running backend process + REST +
background polling loop) plus a React frontend dashboard.

**Performance Goals**:
- Monitoring cycle completes in < 2s per ticker under normal market load.
- Dashboard initial load < 1.5s; live updates refresh within one
  monitoring cycle (≤ 5 min).
- Order submission end-to-end < 5s from intent to broker acknowledgement.

**Constraints**:
- No order may be sent without an `intentId` traceable to a Risk Engine
  evaluation (Constitution guardrail #1).
- No silent retries on broker failures; failures surface to Telegram
  within 30s (guardrail #2).
- Daily-loss circuit breaker halts new entries at the configured
  `dailyLossLimit` (guardrail #3).
- Margin pre-flight: reject openings when free buying power < 1.5× the
  worst-case loss of the combo (guardrail #4).
- `DRY_RUN=true` is the default for non-production; evaluates and logs
  all decisions, sends zero orders (guardrail #5).
- Multileg atomicity: Iron Condors MUST be single `mleg` orders
  (guardrail #6).
- Money math MUST use a decimal-safe `Money` helper, never native
  `number` across boundaries (Principle I).

**Scale/Scope**: Single operator, up to ~10 concurrent tickers, up to ~10
open Iron Condors at a time. v1 is single-user; multi-user auth/RBAC is
explicitly out of scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution version: `1.0.0` (see `.specify/memory/constitution.md`).

| # | Principle / Guardrail | Status | Evidence in this plan |
|---|----------------------|--------|----------------------|
| I | Strict TypeScript & Financial Correctness | ✅ PASS | `"strict": true`, `decimal.js` `Money` helper, monetary fields as Prisma `Decimal`/string. |
| II | Service Isolation & Single Responsibility | ✅ PASS | Distinct services (Monitoring, Alpaca, Risk, Execution, Telegram, Persistence); Risk Engine emits `Intent[]`, never calls Alpaca. UI mutation must go through Fastify → ExecutionService. |
| III | Risk Engine First | ✅ PASS | `riskEngine.ts` is declared highest-priority artifact; pure `evaluate(...) → Intent[]`; implemented & unit-tested before UI/orders/Telegram. |
| IV | Test-First for Money Logic | ✅ PASS | Red-Green-Refactor for Risk/Orders/Money; ≥90% coverage; `fast-check` property tests for PnL/TP math. |
| V | Persistence & Audit Trail | ✅ PASS | `PositionEvent` immutable rows; `OrderSubmission` records request/response/intentId/snapshot; `TickerConfigRevision` versions config mutations; 12-month retention. |
| VI | Observability, Panic & Dead-Man's Switch | ✅ PASS | Structured logs per evaluation/order; daily Telegram heartbeat; 30-min absence → `WARN`; `PanicButton` bypasses Risk Engine (only legitimate bypass). |
| G1 | No order without intent trace | ✅ PASS | Every `OrderSubmission` carries `intentId` from the originating `Intent`. |
| G2 | No silent retries | ✅ PASS | Bounded explicit retries; failures → Telegram ≤ 30s. |
| G3 | Daily-loss circuit breaker | ✅ PASS | `dailyLossLimit` default -3% of allocated capital; halts new entries, alerts. |
| G4 | Margin pre-flight | ✅ PASS | Reject openings when free BP < 1.5× worst-case loss. |
| G5 | DRY_RUN default for non-prod | ✅ PASS | `DRY_RUN=true` evaluates + logs, zero orders. |
| G6 | Multileg atomicity | ✅ PASS | Single `order_class=mleg` submissions. |

**Gate verdict**: ✅ All gates pass; no violations to justify. No entries
in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-iron-condor-bot/
├── spec.md              # Feature specification (/speckit-specify)
├── plan.md              # This file (/speckit-plan)
├── research.md          # Phase 0 output (/speckit-plan)
├── data-model.md        # Phase 1 output (/speckit-plan)
├── quickstart.md        # Phase 1 output (/speckit-plan)
├── contracts/           # Phase 1 output (/speckit-plan)
│   ├── rest-api.md
│   └── alpaca-orders.md
└── tasks.md             # Phase 2 output (/speckit-tasks - NOT created here)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma
└── migrations/

src/
├── backend/
│   ├── services/
│   │   ├── monitoringService.ts   # 5-min loop, polls market + positions
│   │   ├── alpacaService.ts       # sole gateway to Alpaca REST
│   │   ├── executionService.ts    # Intent -> multileg order via AlpacaService
│   │   ├── telegramNotifier.ts    # outbound alerts, MarkdownV2
│   │   └── persistenceService.ts  # Prisma read/write, audit trail
│   ├── risk/
│   │   ├── riskEngine.ts          # evaluate(position, snapshot, config) -> Intent[]
│   │   ├── maneuvers/
│   │   │   ├── takeProfit.ts
│   │   │   ├── stopLoss.ts
│   │   │   └── rollUntestedSide.ts
│   │   └── intents.ts             # Intent algebraic type definitions
│   ├── orders/
│   │   ├── ironCondorBuilder.ts   # build opening mleg order
│   │   ├── closeBuilder.ts        # build closing mleg order
│   │   └── rollBuilder.ts         # build roll leg-pair orders
│   ├── api/
│   │   ├── server.ts              # Fastify bootstrap
│   │   ├── routes/
│   │   │   ├── tickers.ts
│   │   │   ├── positions.ts
│   │   │   ├── metrics.ts
│   │   │   └── panic.ts           # PanicButton (bypasses Risk Engine)
│   │   └── schemas/               # zod request/response schemas
│   ├── config/
│   │   ├── env.ts                 # zod-validated env at boot
│   │   └── constants.ts
│   └── app.ts                     # wiring: server + monitoring loop + heartbeat
├── frontend/
│   ├── components/
│   │   ├── TickerControlPanel.tsx
│   │   ├── PanicButton.tsx
│   │   ├── MetricsPanel.tsx
│   │   ├── PayoffDiagram.tsx
│   │   └── EquityCurve.tsx
│   ├── pages/
│   │   └── Dashboard.tsx
│   ├── hooks/
│   │   ├── useTickers.ts
│   │   ├── usePositions.ts
│   │   └── useMetrics.ts
│   ├── services/
│   │   └── apiClient.ts           # fetch wrapper to Fastify
│   └── main.tsx
├── types/
│   ├── money.ts                   # Money helper on decimal.js
│   ├── domain.ts                  # TickerConfig, Position, Intent, etc.
│   ├── market.ts                  # OptionQuote, Greeks, UnderlyingSnapshot
│   └── events.ts                  # PositionEvent, OrderSubmission, AuditRow
└── shared/
    ├── envSchema.ts               # zod schema shared with backend config
    └── contracts.ts               # shared REST contract types

tests/
├── unit/
│   ├── risk/
│   ├── orders/
│   └── money/
├── integration/
│   ├── monitoringLoop.test.ts
│   ├── executionService.test.ts
│   └── apiRoutes.test.ts
└── contract/
    └── alpacaOrders.test.ts       # shape of mleg payloads vs recorded fixtures
```

**Structure Decision**: A single-repo web-application layout matching
Constitution "Technical Constraints": `src/backend/{services,risk,orders,api,config}`,
`src/frontend/{components,pages,hooks,services}`, a shared `src/types/`
and `src/shared/`, `prisma/` for schema + migrations, and a `tests/`
tree mirroring the backend with `unit/`, `integration/` and `contract/`
subtrees. The risk engine lives in `src/backend/risk/` (highest priority,
per Principle III); order building lives in `src/backend/orders/` and is
consumed only by `executionService.ts`. The frontend never imports
`src/backend`; it talks to Fastify over REST.