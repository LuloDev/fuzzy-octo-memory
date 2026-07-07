# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
specs/001-iron-condor-bot/plan.md
<!-- SPECKIT END -->

> Spec-by-spec overlay: see `specs/001-iron-condor-bot/plan.md` for the
> full technical context, architecture decisions and Constitution gates
> that drove v1, and `specs/002-algo-command-center/plan.md` for the
> kill-switch / dashboard extensions. The runtime rules below apply to
> both specs.

## What this codebase does

A single-operator automated weekly **Iron Condor** bot against the
Alpaca Options API (Fastify backend, React dashboard, Telegram
alerts). Every 5 minutes the monitoring loop opens one condor per
enabled ticker for the current week's expiration, then evaluates open
positions against the **Risk Engine** for take-profit / stop-loss /
untested-side roll. One hard panic bypass closes everything and
cancels all orders, ignoring the Risk Engine.

## Commands

```sh
# Backend (this is the one Claude Code runs)
npm install
cp .env.example .env                       # fill in Alpaca + Telegram
npx prisma migrate dev --name init        # or: npx prisma db push --accept-data-loss --skip-generate

npm run typecheck                         # tsc --noEmit (strict)
npm run lint                              # eslint . --ext .ts,.tsx
npm run test                              # vitest run (globals on, no imports)
npm run test -- tests/unit/risk/takeProfit.test.ts    # single file
npm run test:coverage                     # enforces ≥90% for risk/, orders/, types/money.ts
npm run start:backend                     # tsx src/backend/app.ts
npm run dev:backend                       # tsx watch … (hot reload)

# Database
npm run prisma:migrate                    # prisma migrate dev

# Frontend (separate package.json under src/frontend/)
cd src/frontend && npm install && npm run build

# Docker
docker compose up --build                 # image: options-trading-bot:local, exposes :3000
```

`scripts/fetch-prisma-engines.sh` is NixOS-only — Prisma's CDN doesn't
ship a `linux-nixos` engine, so this pulls the debian-openssl variant
plus nix-ld wrappers into `~/.cache/prisma-engines/5.22.0`. On other
systems Prisma downloads engines automatically. The vitest setup file
`tests/setup/nixos-prisma.ts` picks the cache up when present.

## Architecture (one paragraph)

`src/backend/app.ts` is the composition root: it awaits
`initPersistence()` (lazy PrismaClient — see below), then builds the
Fastify server via `buildServer()` in `src/backend/api/server.ts`,
listens on `env.HOST`/`env.PORT`, and starts `MonitoringService` plus
a heartbeat `setInterval`. Every `MONITOR_INTERVAL_MS` (default 5 min)
the loop runs three phases — **entry sweep** (open one condor per
enabled ticker that doesn't already have one for the week's
expiration) → **risk sweep** (call `evaluate(position, snapshot, config)`
in `src/backend/risk/riskEngine.ts` and forward `Intent[]` to
`ExecutionService`) → **heartbeat**. Two **graduated kill switches**
live in `killStateService` and are persisted as `AppState` rows so they
survive restarts: pausing `newEntries` short-circuits phase 1, pausing
`maneuvers` skips phase 2 dispatch but still logs the would-be intents.

The **Risk Engine** is a pure function: `evaluate(position, snapshot, config) → Intent[]`.
It composes three maneuvers from `src/backend/risk/maneuvers/`
(`takeProfit`, `stopLoss`, `rollUntestedSide`) with strict priority:
TP beats SL; SL suppresses the roll; the roll only fires when neither
close has fired. Never throws on benign input — invalid states return
a `Reject` intent with a structured `reason`. Constitution Principle
III marks this module as the highest-priority artifact; read
`specs/001-iron-condor-bot/plan.md` §"Project Structure" before
touching it.

`ExecutionService.openIronCondor()` is the only path that talks to
Alpaca (via `alpacaService`, which is the sole gateway and returns
`Result<T>` — never throws). It does the **margin pre-flight**
(guardrail #4: free buying power < 1.5× worst-case loss rejects the
open), then either writes through `alpaca.submitOrder` or short-
circuits when `DRY_RUN=true`. CloseAll intents become a single mleg
close via `closeBuilder.ts`; Roll intents become a close-leg plus an
open-leg submitted sequentially (close failure aborts the whole roll to
avoid leaving one side naked). Every order is recorded in
`OrderSubmission` with its `intentId` (guardrail #1: no order without
an intent trace).

## Non-negotiable invariants

These come from `.specify/memory/constitution.md`. Violating any of
them is a hard bug, not a style preference:

1. **Money math uses the `Money` class** (`src/types/money.ts`,
   `decimal.js`). Never native `number` for anything that crosses the
   DB / broker / API / UI boundary. Prisma stores monetary columns as
   `Decimal`; the persistence layer stringifies on read.
2. **Risk Engine is pure.** No I/O, no logger, no Telegram. It returns
   `Intent[]`. The caller emits alerts.
3. **Every order carries an `intentId`** traceable to an `Intent`
   emitted by the engine — except the panic path, which is the only
   legitimate bypass (FR-018).
4. **`DRY_RUN=true` is the default** in `.env.example`. Any non-prod
   run evaluates + logs but sends zero broker traffic.
5. **Multileg atomicity**: Iron Condor opens MUST be one
   `order_class=mleg` submission (builder: `src/backend/orders/ironCondorBuilder.ts`).
6. **No silent retries**. Broker failures surface to Telegram within 30s
   (`alertWindowSeconds` in plan). Failures are recorded as
   `OrderSubmission` with `status: REJECTED`, not swallowed.
7. **Daily-loss circuit breaker (guardrail #3)**: the plan specifies
   halting new entries when realized daily loss crosses
   `dailyLossLimit` (`-0.03` default) with a Telegram alert. The value
   is wired through `env.DAILY_LOSS_LIMIT` and `TickerConfig.dailyLossLimit`
   but the live enforcement hook is a known incomplete piece of v1 —
   verify it exists before assuming entries are gated.
8. **TickerConfig mutations are append-only** — every PATCH writes a
   `TickerConfigRevision` row containing both the previous and new JSON
   snapshot. There is no `update()` exposed for the audit tables
   (`PositionEvent`, `OrderSubmission`) from the persistence service.

## Project quirks worth knowing

- **Path alias `@/*`** resolves to `src/*` (both `tsconfig.json` and
  `vitest.config.ts`). Use `@/backend/...` and `@/types/...`; never
  relative imports across `src/backend` module boundaries.
- **Prisma client is lazy**. `src/backend/services/persistenceService.ts`
  loads `@prisma/client` via a top-level awaited dynamic `import()`
  inside `initPersistence()` so pure-function unit tests (e.g.
  `worstCaseLoss`, `marginPreflight`) don't need the generated client.
  `app.ts` guarantees `await initPersistence()` before any DB call.
  ESLint has `no-require-imports: off` to support the deliberate
  `require()` workaround for the same reason — keep it that way.
- **`tsconfig.json`** enables `strict`, `noUncheckedIndexedAccess`,
  **`exactOptionalPropertyTypes`** (optional props must be written
  `prop?: T | undefined` in patches — see `TickerConfigPatch` in
  `src/types/domain.ts`), `noImplicitOverride`,
  `noFallthroughCasesInSwitch`.
- **Frontend is a separate package** under `src/frontend/` with its own
  `package.json`. Vite builds to `src/frontend/dist/`; Fastify in
  `server.ts` only serves the SPA if that directory exists. The React
  app **never imports** anything from `src/backend/` — it talks to
  Fastify over REST. Endpoints are in `specs/001-iron-condor-bot/contracts/rest-api.md`.
- **Kill switches are persisted, not in-memory**: `AppState` keys
  `kill_state_newEntries` and `kill_state_maneuvers`. `killStateService`
  caches with a 1s TTL — pause latency is bounded by monitoring
  interval. The `/api/kill/*` responses set `cache-control: no-store`
  while other `/api/*` GETs cache for 10s.
- **No pre-commit hooks / lint-staged**. CI builds the Docker image
  via `.github/workflows/` and pushes to `ghcr.io/<repo>` on
  push to main/master; tags `edge`, branch, `pr-*`, semver, SHA.
- **Docker** is multi-stage on `node:22-bookworm-slim` (sidesteps the
  NixOS Prisma 404), runs as non-root `uid 1001`, uses `tini` as PID
  1 so `SIGTERM` reaches `monitoring.stop()` + `app.close()`, and runs
  `prisma db push --accept-data-loss --skip-generate` on every start
  (swap to `migrate deploy` once migrations are checked in). The
  container listens on `0.0.0.0:3000` regardless of `.env`'s `HOST`,
  because `docker-compose.yml` overrides it. Healthcheck hits
  `/api/health` every 30s with a 20s start period.

## Testing patterns

- Vitest with `globals: true` — no `import { describe, it, expect }`.
- Each test file defines its own factory helpers (`position()`,
  `config()`, `snapshot()`); no shared fixtures across files.
- Tiered directories: `tests/unit/` (per module), `tests/integration/`,
  `tests/contract/` (Alpaca fixture replay).
- Coverage gate (enforced by `vitest.config.ts`): ≥90% lines,
  statements and functions (≥80% branches) for
  `src/backend/risk/**/*.ts`, `src/backend/orders/**/*.ts`, and
  `src/types/money.ts`. Use `npm run test:coverage` before opening a PR
  that touches any of those paths.
- Tests should hit the in-process Prisma test DB
  (`tests/helpers/inMemoryDb.ts`). `DATABASE_URL` for tests comes from
  `.env.test`; `resetEnvForTests()` from `@/backend/config/env` must
  be called between test runs when env changes.
- `fast-check` is available for property-based tests on PnL/TP math —
  use it instead of hand-rolled enumerations.

## Speckit workflow

The repository is driven by the **Speckit** templates under
`.specify/`. Each spec lives in `specs/NNN-slug/` with `spec.md`,
`plan.md`, `tasks.md`, `checklists/`, `contracts/`. Skills are exposed
in `.claude/skills/speckit-*/` — invoke them by name when the user
asks for a new spec (`/speckit-specify`), a plan (`/speckit-plan`),
task breakdown (`/speckit-tasks`), or analysis (`/speckit-analyze`).
Spec 001 (`001-iron-condor-bot`) is the v1 automation; spec 002
(`002-algo-command-center`) layers the operator dashboard and the two
graduated kill switches on top.

## Validation scenarios

`specs/001-iron-condor-bot/quickstart.md` defines end-to-end scenarios
**V1–V10** against an Alpaca paper account. Run them in order before
going live. Each scenario exercises a specific Risk Engine maneuver
through the API, an audit export, or a deliberate `DRY_RUN=false`
invocation against the paper account.
