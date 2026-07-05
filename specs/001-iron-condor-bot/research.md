# Research: Automated Weekly Iron Condor Trading System

**Feature**: `001-iron-condor-bot`
**Date**: 2026-07-05
**Parent Spec**: `spec.md`

This document records the technical decisions made for the Iron Condor bot.
Most of the high-level technology choices were already specified by the
user's original prompt (TypeScript, Node.js, Express/Fastify, React/Next.js,
Tailwind, Recharts/Chart.js, SQLite/PostgreSQL via Prisma, Alpaca Options
API v2). What follows are the **resolutions** for every place the user's
prompt offered alternatives, plus the additional stack decisions required
to go from spec to implementation.

## 1. HTTP framework: Fastify

**Decision**: Use **Fastify** as the backend HTTP framework.
**Rationale**:
- Native TypeScript types for routes via `fastify-type-provider-zod`.
- Built-in JSON schema validation; pairs with the constitution's "validate
  at trust boundaries" rule.
- Lower overhead than Express, well-suited to a long-running service that
  does both REST and an internal polling loop.
- Schema → serialization contract is enforceable.
**Alternatives considered**:
- *Express*: massive ecosystem but weaker TypeScript story and no native
  schema validation. Rejected for the "validate at trust boundaries" rule.
- *Hono*: ergonomic on edge runtimes, but our target is a long-lived
  Node process, not edge functions.

## 2. UI framework: React + Vite + Tailwind + Recharts

**Decision**: **React 18 + Vite + Tailwind CSS + Recharts**.
**Rationale**:
- The spec calls for a dense financial dashboard with two interactive
  charts. React with Vite gives instant dev feedback without the SSR
  overhead of Next.js.
- Tailwind lets us iterate quickly on the dashboard layout without leaving
  the JSX file.
- Recharts is React-native, has a low learning curve, and supports the two
  required visualizations (payoff curve and equity curve) cleanly.
**Alternatives considered**:
- *Next.js*: overkill for a single-operator dashboard; SSR adds
  complexity without payoff when the data is private and real-time.
- *Chart.js*: requires imperative canvas ref management inside React,
  more friction than Recharts for the same charts.

## 3. Database: SQLite (default) + PostgreSQL (optional)

**Decision**: **SQLite via Prisma for the default single-user deployment.
PostgreSQL supported as a drop-in for multi-instance or higher write
throughput.**
**Rationale**:
- The system runs on a single VPS or on a workstation for a single trader.
  SQLite handles this load trivially and removes an external dependency.
- Prisma's connector abstraction makes SQLite ↔ PostgreSQL a single
  datasource change in `prisma/schema.prisma`.
**Alternatives considered**:
- *PostgreSQL only*: adds operational complexity (db server, backups,
  monitoring) that is unnecessary for v1.

## 4. Broker integration: Alpaca REST + minimal client wrapper

**Decision**: Use the **Alpaca REST API** directly through a thin
internal `AlpacaClient` wrapper. No third-party SDK dependency beyond
the official one if it remains maintained.
**Rationale**:
- Multileg orders use `POST /v2/orders` with `order_class=mleg` and a
  structured `legs` array. Writing this directly is short and gives full
  control over retry, timeout and observability.
- The constitution's "service isolation" rule means we want a single
  chokepoint for every broker call anyway, so a thin wrapper is mandatory.
**Alternatives considered**:
- *`@alpacahq/alpaca-trade-api`*: maintained but covers more than we need
  and version drift can be a hassle for a long-lived trading bot. Direct
  REST is fewer moving parts.

## 5. Money math: `decimal.js`

**Decision**: All monetary values cross a dedicated **`Money`** helper
built on **`decimal.js`** (decimal-safe decimal arithmetic).
**Rationale**:
- Native `number` is double-precision binary floating point; iron condor
  credit calculations across 4 legs can drift pennies — unacceptable per
  Constitution Principle I.
- `decimal.js` is mature, zero-dependency and serializable as strings.

## 6. Scheduling and process model

**Decision**: A single Node.js process hosts:
1. the Fastify HTTP server (REST for the UI), and
2. a long-running `MonitoringLoop` that polls every 5 minutes.

Managed externally by **`systemd`** (preferred on Linux) or `pm2` as a
fallback.
**Rationale**:
- A single process simplifies state: the Prisma client, the in-memory
  position cache and the deadlock detector all live in one address space.
- Splitting into workers adds IPC complexity for no real throughput gain
  at this scale.

## 7. Testing stack: Vitest + supertest + fastify inject

**Decision**:
- **Vitest** for unit and integration tests.
- **supertest** (or `fastify.inject`) for HTTP route tests.
- **Property-based tests** (via `fast-check`) for risk math.
**Rationale**: Vitest is fast, ESM-native, TS-native and Jest-compatible
in API. It is the obvious modern choice for a TS-strict project.

## 8. Environment validation: Zod at boot

**Decision**: A dedicated `env.ts` module parses `process.env` through a
**Zod** schema at boot. Missing or malformed env crashes the process.
**Rationale**: Per Constitution Principle "Technical Constraints", silent
defaults are forbidden for the broker and Telegram credentials.

## 9. Frontend ↔ backend API style

**Decision**: REST + JSON. The UI never places an order directly; every
mutation goes through Fastify, which routes through `ExecutionService`.
**Rationale**: Constitution Principle II forbids the UI from calling
Alpaca; the cleanest enforcement is the network boundary.

## 10. Notification transport: Telegram Bot HTTP API only

**Decision**: Direct calls to `https://api.telegram.org/bot<TOKEN>/sendMessage`
with `parse_mode=MarkdownV2`. No polling, no third-party wrappers.
**Rationale**: The user spec is explicit about this; the constitution
forbids hidden dependencies for money-adjacent infra.

## Open items

None. Every NEEDS CLARIFICATION in the original feature description was
resolved by the user's own specification or by a recorded decision above.
