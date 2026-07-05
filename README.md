# Iron Condor Trading Bot

Automated weekly Iron Condor trading bot that runs against the Alpaca
Options API. Single operator, multi-ticker (SPY, QQQ, …) per-weekly
strategy with automated take-profit, stop-loss and untested-side roll
maneuvers, a Fastify + React dashboard, and Telegram alerts.

## What it does

- Manages a list of underlying symbols (TickerConfig rows).
- On every enabled ticker, opens **one weekly Iron Condor** per week (7-DTE, atomic `mleg` order).
- Monitors every open position every 5 minutes and applies:
  - **Take-profit** when the captured credit reaches `takeProfitPercentage`.
  - **Stop-loss** when the cost-to-close exceeds `stopLossMultiplier × credit`.
  - **Untested-side roll** when the underlying comes within 1% of a short strike while the opposite side is still profitable.
- Sends a Telegram alert for every critical event, plus a periodic heartbeat.
- Exposes a single-button **panic flatten** that bypasses the risk engine to cancel all orders and market-close all positions.

## Stack

- TypeScript 5.x strict (ESM)
- Node.js ≥ 22
- Fastify 5 + zod + fastify-type-provider-zod
- Prisma 5 (SQLite by default, PostgreSQL supported as a datasource swap)
- decimal.js for money math (Constitution Principle I)
- Vitest + fast-check
- React 18 + Vite + Tailwind + Recharts (in `src/frontend/`; stubbed in v1 — server-side features complete and self-contained)

## Setup

```sh
npm install
cp .env.example .env
# fill in Alpaca + Telegram credentials
npx prisma migrate dev --name init
npm run typecheck
npm run test
npm run start:backend
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness + heartbeat status |
| GET | `/api/tickers` | List ticker configurations |
| POST | `/api/tickers` | Create a ticker configuration |
| PATCH | `/api/tickers/:id` | Update a ticker (writes a `TickerConfigRevision`) |
| GET | `/api/positions` | List positions (open by default) |
| GET | `/api/positions/:id/payoff` | Payoff diagram data for one position |
| GET | `/api/metrics` | Realized / unrealized PnL, projected max profit, max risk, margin |
| GET | `/api/equity-curve?days=N` | Daily PnL series |
| POST | `/api/panic` | Cancel all orders + market-close all positions |
| GET | `/api/audit/export?from=…&to=…` | JSONL audit trail for any historical range |

## Validation scenarios

`specs/001-iron-condor-bot/quickstart.md` defines V1–V10 — end-to-end
scenarios against an Alpaca paper account. Run them in order before going
live.

## License

MIT (placeholder; replace before any public release).